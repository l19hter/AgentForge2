import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getProjectDir } from './projects'
import { exportProject, type ExportResult } from './export'

export interface DeployConfig {
  platform: 'railway' | 'vercel' | 'docker'
  frontendDir: string
  backendDir: string
}

export interface DeployResult {
  success: boolean
  files: string[]
  message: string
}

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

function frontendDockerfile(): string {
  return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`
}

/** Dockerfile фронтенда ссылается на этот файл — без него docker build падает. */
function nginxConf(): string {
  return `server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # SPA: любой неизвестный путь отдаём в index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://backend:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
`
}

function backendDockerfile(port: number): string {
  return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE ${port}
CMD ["npm", "start"]
`
}

function dockerCompose(): string {
  return `services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://\${POSTGRES_USER:-app}:\${POSTGRES_PASSWORD:-change-me}@db:5432/\${POSTGRES_DB:-app}
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
      POSTGRES_DB: \${POSTGRES_DB:-app}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  pgdata:
`
}

function railwayConfig(): string {
  return `{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
`
}

function vercelConfig(): string {
  return `{
  "version": 2,
  "builds": [
    { "src": "package.json", "use": "@vercel/static-build", "config": { "distDir": "dist" } }
  ],
  "routes": [{ "src": "/(.*)", "dest": "/index.html" }]
}
`
}

function githubWorkflow(): string {
  return `name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install & Build
        run: cd frontend && npm ci && npm run build
      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: \${{ secrets.RAILWAY_TOKEN }}
        run: |
          npm install -g @railway/cli
          railway up
`
}

function deployReadme(platform: string): string {
  return `# Deploy — ${platform.toUpperCase()}

## Docker
\`\`\`bash
cd deploy
docker compose up --build
\`\`\`
Фронтенд: http://localhost:3000 · Бэкенд: http://localhost:3001

Перед запуском задайте POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
(в .env рядом с docker-compose.yml) — дефолтный пароль только для локальной разработки.

## Railway
1. \`npm i -g @railway/cli\`
2. \`railway login\`
3. \`railway up\`

## Vercel
1. \`npm i -g vercel\`
2. \`vercel --prod\`
`
}

export async function prepareDeploy(config: DeployConfig): Promise<DeployResult> {
  const root = getProjectDir()
  const deployDir = path.join(root, 'deploy')
  const files: string[] = []

  try {
    if (config.platform === 'docker' || config.platform === 'railway') {
      write(path.join(deployDir, 'frontend', 'Dockerfile'), frontendDockerfile())
      write(path.join(deployDir, 'frontend', 'nginx.conf'), nginxConf())
      write(path.join(deployDir, 'backend', 'Dockerfile'), backendDockerfile(3001))
      write(path.join(deployDir, 'docker-compose.yml'), dockerCompose())
      files.push(
        'deploy/frontend/Dockerfile',
        'deploy/frontend/nginx.conf',
        'deploy/backend/Dockerfile',
        'deploy/docker-compose.yml'
      )
    }

    if (config.platform === 'railway') {
      write(path.join(deployDir, 'railway.json'), railwayConfig())
      // mkdir делается внутри write() — раньше здесь падало с ENOENT.
      write(path.join(root, '.github', 'workflows', 'deploy.yml'), githubWorkflow())
      files.push('deploy/railway.json', '.github/workflows/deploy.yml')
    }

    if (config.platform === 'vercel') {
      write(path.join(deployDir, 'vercel.json'), vercelConfig())
      files.push('deploy/vercel.json')
    }

    write(path.join(deployDir, 'DEPLOY.md'), deployReadme(config.platform))
    files.push('deploy/DEPLOY.md')

    return { success: true, files, message: `Создано файлов: ${files.length}` }
  } catch (error) {
    return { success: false, files: [], message: (error as Error).message }
  }
}

/**
 * Кнопка «Экспорт в ZIP» в панели деплоя.
 *
 * Отдельной сборки архива здесь больше нет: она разъезжалась с экспортом из
 * меню и складывала пустой архив для проектов, сделанных конвейером. Конфиги
 * деплоя лежат в той же папке проекта и попадают в общий архив сами.
 */
export async function buildAndExport(win: BrowserWindow | null): Promise<ExportResult> {
  return exportProject(win)
}

export function registerDeployIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('deploy:prepare', (_e: IpcMainInvokeEvent, cfg: DeployConfig) =>
    prepareDeploy(cfg)
  )
  ipcMain.handle('deploy:export', () => buildAndExport(getWindow()))
}
