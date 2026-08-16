import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getProjectDir } from './projects'

export type TemplateType = 'fastapi-react' | 'nodejs-react' | 'telegram-mini-app'

export interface TemplateInfo {
  id: TemplateType
  name: string
  description: string
  icon: string
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'fastapi-react', name: 'FastAPI + React', description: 'Python backend + React', icon: 'server' },
  { id: 'nodejs-react', name: 'Node.js + React', description: 'Express backend + React', icon: 'layout' },
  {
    id: 'telegram-mini-app',
    name: 'Telegram Mini App',
    description: 'TMA + React + Node.js',
    icon: 'send',
  },
]

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

// ---------------------------------------------------------------------------
// Общий каркас фронтенда
//
// В исходной версии шаблона index.html ссылался на /src/main.tsx, но сам
// main.tsx не создавался — сгенерированный проект не запускался. Здесь каркас
// создаётся целиком.
// ---------------------------------------------------------------------------

interface FrontendOptions {
  name: string
  title: string
  headExtra?: string
  appTsx: string
}

function scaffoldFrontend(root: string, o: FrontendOptions): void {
  const fe = path.join(root, 'frontend')

  write(path.join(fe, 'src', 'App.tsx'), o.appTsx)

  write(
    path.join(fe, 'src', 'main.tsx'),
    `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`
  )

  write(
    path.join(fe, 'src', 'index.css'),
    `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
.app { text-align: center; padding: 40px; }
.app h1 { margin-bottom: 12px; }
`
  )

  write(
    path.join(fe, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${o.headExtra ? `    ${o.headExtra}\n` : ''}    <title>${o.title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  )

  write(
    path.join(fe, 'package.json'),
    `${JSON.stringify(
      {
        name: o.name,
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: {
          '@types/react': '^18.3.12',
          '@types/react-dom': '^18.3.1',
          '@vitejs/plugin-react': '^4.3.4',
          typescript: '^5.7.2',
          vite: '^6.0.3',
        },
      },
      null,
      2
    )}\n`
  )

  write(
    path.join(fe, 'vite.config.ts'),
    `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()] })
`
  )

  write(
    path.join(fe, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['src'],
      },
      null,
      2
    )}\n`
  )

  write(
    path.join(fe, 'README.md'),
    `# Frontend

\`\`\`bash
npm install
npm run dev
\`\`\`
Откроется на http://localhost:5173
`
  )
}

// ---------------------------------------------------------------------------
// Шаблоны
// ---------------------------------------------------------------------------

function createFastAPIReact(root: string): void {
  const be = path.join(root, 'backend')

  write(
    path.join(be, 'app', 'main.py'),
    `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AgentForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Hello from FastAPI"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
`
  )
  write(path.join(be, 'app', '__init__.py'), '')
  write(
    path.join(be, 'requirements.txt'),
    `fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
`
  )
  write(
    path.join(be, 'README.md'),
    `# FastAPI Backend

\`\`\`bash
python -m venv .venv
.venv\\Scripts\\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
\`\`\`
`
  )

  scaffoldFrontend(root, {
    name: 'frontend',
    title: 'FastAPI + React',
    appTsx: `import { useState, useEffect } from 'react'

export default function App() {
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    fetch('http://localhost:8000/')
      .then((r) => r.json())
      .then((d) => setMessage(d.message))
      .catch(() => setMessage('Не удалось подключиться к бэкенду'))
  }, [])

  return (
    <div className="app">
      <h1>FastAPI + React</h1>
      <p>Backend says: <strong>{message}</strong></p>
    </div>
  )
}
`,
  })
}

function createNodeJSReact(root: string): void {
  const be = path.join(root, 'backend')

  write(
    path.join(be, 'src', 'server.ts'),
    `import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from Node.js + Express' })
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`))
`
  )
  write(
    path.join(be, 'package.json'),
    `${JSON.stringify(
      {
        name: 'backend',
        version: '1.0.0',
        scripts: { dev: 'tsx watch src/server.ts', build: 'tsc', start: 'node dist/server.js' },
        dependencies: { express: '^4.21.2', cors: '^2.8.5' },
        devDependencies: {
          '@types/express': '^5.0.0',
          '@types/cors': '^2.8.17',
          '@types/node': '^22.10.0',
          tsx: '^4.19.2',
          typescript: '^5.7.2',
        },
      },
      null,
      2
    )}\n`
  )
  write(
    path.join(be, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'CommonJS',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ['src'],
      },
      null,
      2
    )}\n`
  )
  write(
    path.join(be, 'README.md'),
    `# Node.js Backend

\`\`\`bash
npm install
npm run dev
\`\`\`
Слушает http://localhost:3001
`
  )

  scaffoldFrontend(root, {
    name: 'frontend',
    title: 'Node.js + React',
    appTsx: `import { useState, useEffect } from 'react'

export default function App() {
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    fetch('http://localhost:3001/')
      .then((r) => r.json())
      .then((d) => setMessage(d.message))
      .catch(() => setMessage('Не удалось подключиться к бэкенду'))
  }, [])

  return (
    <div className="app">
      <h1>Node.js + React</h1>
      <p>Backend says: <strong>{message}</strong></p>
    </div>
  )
}
`,
  })
}

function createTelegramMiniApp(root: string): void {
  const be = path.join(root, 'backend')

  write(
    path.join(be, 'src', 'bot.ts'),
    `import { Bot, webhookCallback } from 'grammy'
import express from 'express'

const bot = new Bot(process.env.BOT_TOKEN || '')
const app = express()

bot.command('start', (ctx) =>
  ctx.reply('Welcome to Mini App!', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Open App', web_app: { url: process.env.WEBAPP_URL || '' } }]],
    },
  })
)

app.use(express.json())
app.use('/webhook', webhookCallback(bot, 'express'))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(\`Bot server on port \${PORT}\`))
`
  )
  write(
    path.join(be, 'package.json'),
    `${JSON.stringify(
      {
        name: 'tma-backend',
        version: '1.0.0',
        scripts: { dev: 'tsx watch src/bot.ts', build: 'tsc', start: 'node dist/bot.js' },
        dependencies: { express: '^4.21.2', grammy: '^1.32.0' },
        devDependencies: {
          '@types/express': '^5.0.0',
          '@types/node': '^22.10.0',
          tsx: '^4.19.2',
          typescript: '^5.7.2',
        },
      },
      null,
      2
    )}\n`
  )
  write(
    path.join(be, '.env.example'),
    `BOT_TOKEN=токен_от_BotFather
WEBAPP_URL=https://ваш-домен/
`
  )
  write(
    path.join(be, 'README.md'),
    `# Telegram Mini App — backend

1. Скопируйте \`.env.example\` в \`.env\` и заполните BOT_TOKEN / WEBAPP_URL.
2. \`npm install && npm run dev\`
`
  )

  scaffoldFrontend(root, {
    name: 'tma-frontend',
    title: 'Telegram Mini App',
    headExtra: '<script src="https://telegram.org/js/telegram-web-app.js"></script>',
    appTsx: `import { useEffect, useState } from 'react'

interface TelegramUser {
  first_name?: string
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: { ready: () => void; expand: () => void; initDataUnsafe?: { user?: TelegramUser } }
    }
  }
}

export default function App() {
  const [user, setUser] = useState<TelegramUser | null>(null)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      setUser(tg.initDataUnsafe?.user ?? null)
    }
  }, [])

  return (
    <div className="app">
      <h1>Telegram Mini App</h1>
      {user ? <p>Привет, {user.first_name}!</p> : <p>Открой это внутри Telegram</p>}
    </div>
  )
}
`,
  })
}

export function createTemplate(type: TemplateType): { success: boolean; path: string } {
  const root = getProjectDir()
  if (type === 'fastapi-react') createFastAPIReact(root)
  else if (type === 'nodejs-react') createNodeJSReact(root)
  else if (type === 'telegram-mini-app') createTelegramMiniApp(root)
  else return { success: false, path: root }
  return { success: true, path: root }
}

export function registerTemplateIPC(): void {
  ipcMain.handle('template:list', () => TEMPLATES)
  ipcMain.handle('template:create', (_e: IpcMainInvokeEvent, type: TemplateType) =>
    createTemplate(type)
  )
}
