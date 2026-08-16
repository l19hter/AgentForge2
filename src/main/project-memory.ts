import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { loadJson, saveJson } from './persistence'
import { getActiveProject, getActiveProjectId } from './projects'

export interface ProjectContext {
  projectId: string
  name: string
  stack: string[]
  patterns: string[]
  endpoints: { method: string; path: string; description: string }[]
  components: string[]
  envVars: string[]
  notes: string
  lastUpdated: string
}

const MEMORY_FILE = 'project-memory.json'

/** projectId -> память этого проекта. */
type MemoryFile = Record<string, ProjectContext>

function emptyMemory(): ProjectContext {
  const project = getActiveProject()
  return {
    projectId: project.id,
    // Название по умолчанию берём из проекта: чаще всего оно и нужно.
    name: project.name,
    stack: [],
    patterns: [],
    endpoints: [],
    components: [],
    envVars: [],
    notes: '',
    lastUpdated: new Date().toISOString(),
  }
}

let store: MemoryFile | null = null

function all(): MemoryFile {
  if (!store) {
    const raw = loadJson<MemoryFile | Partial<ProjectContext>>(MEMORY_FILE, {})
    // Формат до появления проектов — один объект памяти. Узнаём его по полю
    // name и переносим в активный проект.
    const legacy = raw && typeof raw === 'object' && typeof (raw as ProjectContext).name === 'string'
    if (legacy) {
      const old = raw as Partial<ProjectContext>
      const base = emptyMemory()
      // «Untitled Project» — заглушка старой версии. Подставляем имя проекта,
      // иначе она попадёт в системный промпт как название проекта.
      const name = !old.name || old.name === 'Untitled Project' ? base.name : old.name
      store = { [getActiveProjectId()]: { ...base, ...old, name, projectId: base.projectId } }
    } else {
      store = raw as MemoryFile
    }
  }
  return store
}

function mem(): ProjectContext {
  const s = all()
  const pid = getActiveProjectId()
  if (!s[pid]) s[pid] = emptyMemory()
  return s[pid]
}

function persist(): void {
  const m = mem()
  m.lastUpdated = new Date().toISOString()
  saveJson(MEMORY_FILE, all())
}

export function getProjectMemory(): ProjectContext {
  return { ...mem() }
}

export function updateProjectMemory(updates: Partial<ProjectContext>): void {
  all()[getActiveProjectId()] = { ...mem(), ...updates }
  persist()
}

export function addEndpoint(method: string, path: string, description: string): void {
  const m = mem()
  if (!m.endpoints.some((e) => e.path === path && e.method === method)) {
    m.endpoints.push({ method, path, description })
    persist()
  }
}

export function addComponent(name: string): void {
  const m = mem()
  if (!m.components.includes(name)) {
    m.components.push(name)
    persist()
  }
}

export function addStack(tech: string): void {
  const m = mem()
  if (!m.stack.includes(tech)) {
    m.stack.push(tech)
    persist()
  }
}

export function addPattern(pattern: string): void {
  const m = mem()
  if (!m.patterns.includes(pattern)) {
    m.patterns.push(pattern)
    persist()
  }
}

export function addEnvVar(name: string): void {
  const m = mem()
  if (!m.envVars.includes(name)) {
    m.envVars.push(name)
    persist()
  }
}

export function resetProjectMemory(): void {
  all()[getActiveProjectId()] = emptyMemory()
  saveJson(MEMORY_FILE, all())
}

/** Подмешивает контекст проекта в системный промпт агента. */
export function getSystemPromptWithMemory(basePrompt: string): string {
  const ctx = getProjectMemory()
  // Одно лишь название проекта содержательным контекстом не считается:
  // оно подставляется автоматически при создании проекта.
  const isEmpty =
    !ctx.stack.length &&
    !ctx.components.length &&
    !ctx.endpoints.length &&
    !ctx.patterns.length &&
    !ctx.envVars.length &&
    !ctx.notes.trim()

  // Пустая память — не засоряем промпт блоком из сплошных «не определено».
  if (isEmpty) return basePrompt

  return `${basePrompt}

## Project Memory (контекст текущего проекта)
- Название: ${ctx.name}
- Стек: ${ctx.stack.join(', ') || 'не определён'}
- Паттерны: ${ctx.patterns.join(', ') || 'не определены'}
- Компоненты: ${ctx.components.join(', ') || 'не созданы'}
- Endpoint'ы: ${ctx.endpoints.map((e) => `${e.method} ${e.path}`).join(', ') || 'не созданы'}
- Env-переменные: ${ctx.envVars.join(', ') || 'не определены'}
- Заметки: ${ctx.notes || 'нет'}

При добавлении нового кода учитывай существующую архитектуру. Не создавай
конфликтующие endpoint'ы и компоненты.`
}

export function registerMemoryIPC(): void {
  ipcMain.handle('memory:get', () => getProjectMemory())
  ipcMain.handle('memory:update', (_e: IpcMainInvokeEvent, u: Partial<ProjectContext>) =>
    updateProjectMemory(u)
  )
  ipcMain.handle('memory:addEndpoint', (_e: IpcMainInvokeEvent, m: string, p: string, d: string) =>
    addEndpoint(m, p, d)
  )
  ipcMain.handle('memory:addComponent', (_e: IpcMainInvokeEvent, n: string) => addComponent(n))
  ipcMain.handle('memory:addStack', (_e: IpcMainInvokeEvent, t: string) => addStack(t))
  ipcMain.handle('memory:addPattern', (_e: IpcMainInvokeEvent, p: string) => addPattern(p))
  ipcMain.handle('memory:addEnvVar', (_e: IpcMainInvokeEvent, n: string) => addEnvVar(n))
  ipcMain.handle('memory:reset', () => resetProjectMemory())
}
