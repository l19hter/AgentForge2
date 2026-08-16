import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { loadJson, saveJson } from './persistence'
import { getActiveProjectId } from './projects'

export interface Subtask {
  id: string
  title: string
  description: string
  assignee: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'needs_fix'
  parentId?: string
  autoFix?: boolean
  originalCode?: string
  errorDescription?: string
}

export interface TaskTree {
  id: string
  title: string
  description: string
  subtasks: Subtask[]
  createdAt: string
  autoFixEnabled: boolean
}

const DECOMP_FILE = 'decomposition.json'

/** projectId -> задачи этого проекта. */
type DecompFile = Record<string, TaskTree[]>

let cache: DecompFile | null = null

function store(): DecompFile {
  if (!cache) {
    const raw = loadJson<DecompFile | TaskTree[]>(DECOMP_FILE, {})
    // Файл из версии без проектов был плоским массивом — переносим его
    // в активный проект, чтобы задачи не пропали после обновления.
    cache = Array.isArray(raw) ? (raw.length ? { [getActiveProjectId()]: raw } : {}) : raw
  }
  return cache
}

function all(): TaskTree[] {
  const s = store()
  const pid = getActiveProjectId()
  if (!s[pid]) s[pid] = []
  return s[pid]
}

function persist(): void {
  store()
  saveJson(DECOMP_FILE, cache)
}

export function getTasks(): TaskTree[] {
  return [...all()]
}

export function addTask(task: TaskTree): void {
  // Нормализуем: поле обязательное в типе, но из renderer'а могло не прийти.
  all().push({ ...task, subtasks: task.subtasks ?? [], autoFixEnabled: task.autoFixEnabled ?? false })
  persist()
}

export function updateTask(taskId: string, updates: Partial<TaskTree>): void {
  const list = all()
  const idx = list.findIndex((t) => t.id === taskId)
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates }
    persist()
  }
}

export function updateSubtask(
  taskId: string,
  subtaskId: string,
  updates: Partial<Subtask>
): void {
  const task = all().find((t) => t.id === taskId)
  const st = task?.subtasks.find((s) => s.id === subtaskId)
  if (st) {
    Object.assign(st, updates)
    persist()
  }
}

export function addSubtask(taskId: string, subtask: Subtask): boolean {
  const task = all().find((t) => t.id === taskId)
  if (!task) return false
  task.subtasks.push(subtask)
  persist()
  return true
}

export function deleteTask(taskId: string): void {
  store()[getActiveProjectId()] = all().filter((t) => t.id !== taskId)
  persist()
}

/** Возвращает null, если родительская задача не найдена (вместо throw через IPC). */
export function createAutoFixTask(
  parentTaskId: string,
  errorDescription: string,
  originalCode: string,
  assignee: string
): Subtask | null {
  const task = all().find((t) => t.id === parentTaskId)
  if (!task) return null

  const fixSubtask: Subtask = {
    id: `fix-${Date.now()}`,
    title: `Исправить: ${errorDescription.slice(0, 50)}`,
    description: `Автоматическое исправление после аудита:\n${errorDescription}`,
    assignee,
    status: 'needs_fix',
    parentId: parentTaskId,
    autoFix: true,
    originalCode,
    errorDescription,
  }

  task.subtasks.push(fixSubtask)
  persist()
  return fixSubtask
}

export function getPendingFixes(): { taskId: string; subtask: Subtask }[] {
  const result: { taskId: string; subtask: Subtask }[] = []
  for (const task of all()) {
    for (const st of task.subtasks) {
      if (st.status === 'needs_fix' && st.autoFix) result.push({ taskId: task.id, subtask: st })
    }
  }
  return result
}

export function resolveFix(taskId: string, subtaskId: string, fixedCode: string): void {
  const st = all()
    .find((t) => t.id === taskId)
    ?.subtasks.find((s) => s.id === subtaskId)
  if (st) {
    st.status = 'done'
    st.originalCode = fixedCode
    persist()
  }
}

export function registerDecompositionIPC(): void {
  ipcMain.handle('decomp:getTasks', () => getTasks())
  ipcMain.handle('decomp:add', (_e: IpcMainInvokeEvent, task: TaskTree) => addTask(task))
  ipcMain.handle('decomp:update', (_e: IpcMainInvokeEvent, id: string, u: Partial<TaskTree>) =>
    updateTask(id, u)
  )
  ipcMain.handle(
    'decomp:updateSubtask',
    (_e: IpcMainInvokeEvent, taskId: string, subtaskId: string, u: Partial<Subtask>) =>
      updateSubtask(taskId, subtaskId, u)
  )
  ipcMain.handle('decomp:addSubtask', (_e: IpcMainInvokeEvent, taskId: string, st: Subtask) =>
    addSubtask(taskId, st)
  )
  ipcMain.handle('decomp:delete', (_e: IpcMainInvokeEvent, id: string) => deleteTask(id))
  ipcMain.handle(
    'decomp:createAutoFix',
    (_e: IpcMainInvokeEvent, parentId: string, err: string, code: string, assignee: string) =>
      createAutoFixTask(parentId, err, code, assignee)
  )
  ipcMain.handle('decomp:getPendingFixes', () => getPendingFixes())
  ipcMain.handle(
    'decomp:resolveFix',
    (_e: IpcMainInvokeEvent, taskId: string, subtaskId: string, code: string) =>
      resolveFix(taskId, subtaskId, code)
  )
}
