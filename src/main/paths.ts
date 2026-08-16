import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

/**
 * Единая точка правды про то, где живут данные приложения.
 *
 * Важно: `process.resourcesPath` определён в Electron ВСЕГДА (и в dev, и в prod),
 * поэтому использовать его как «корень проекта» нельзя — в собранном приложении
 * это папка внутри Program Files, куда запись требует прав администратора.
 *
 * DATA_DIR      — служебные JSON-файлы (usage, сессии, задачи, память проекта)
 * WORKSPACE_DIR — рабочая папка пользователя: сюда пишутся .claude/, frontend/,
 *                 backend/, deploy/. Её можно поменять в настройках.
 */

const SETTINGS_FILE = 'settings.json'

interface Settings {
  workspaceDir?: string
}

let cachedWorkspace: string | null = null

export function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'agentforge-data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readSettings(): Settings {
  try {
    const p = path.join(getDataDir(), SETTINGS_FILE)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')) as Settings
  } catch {
    /* повреждённый файл настроек — просто берём дефолты */
  }
  return {}
}

function writeSettings(s: Settings): void {
  fs.writeFileSync(path.join(getDataDir(), SETTINGS_FILE), JSON.stringify(s, null, 2), 'utf-8')
}

export function getDefaultWorkspaceDir(): string {
  return path.join(app.getPath('documents'), 'AgentForge-Workspace')
}

export function getWorkspaceDir(): string {
  if (cachedWorkspace) return cachedWorkspace
  const dir = readSettings().workspaceDir || getDefaultWorkspaceDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  cachedWorkspace = dir
  return dir
}

export function setWorkspaceDir(dir: string): void {
  const resolved = path.resolve(dir)
  if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true })
  const s = readSettings()
  s.workspaceDir = resolved
  writeSettings(s)
  cachedWorkspace = resolved
}

/**
 * Разрешает пользовательский путь ОТНОСИТЕЛЬНО рабочей папки и проверяет,
 * что результат не вышел за её пределы. Возвращает null при попытке выхода.
 *
 * Это защита от `../../../Windows/System32` в путях, которые приходят из
 * renderer'а (а значит — потенциально из ответа модели).
 */
export function resolveInWorkspace(userPath: string): string | null {
  const root = getWorkspaceDir()
  const full = path.resolve(root, userPath)
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}
