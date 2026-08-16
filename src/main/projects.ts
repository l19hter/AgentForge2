import * as fs from 'fs'
import * as path from 'path'
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { getWorkspaceDir } from './paths'
import { loadJson, saveJson } from './persistence'

/**
 * Проект — единица работы приложения: своя папка на диске, свои задачи,
 * своя память и отдельный чат с каждым агентом.
 *
 * В main-процессе всегда есть ровно один активный проект. Благодаря этому
 * панелям (файлы, превью, деплой, экспорт) не нужно передавать projectId —
 * они спрашивают getProjectDir() и работают внутри текущего проекта.
 */

export interface Project {
  id: string
  name: string
  /** Имя папки внутри <workspace>/projects. */
  slug: string
  createdAt: string
  /** Цвет корешка вкладки. */
  color: string
}

interface ProjectsFile {
  projects: Project[]
  activeId: string | null
}

const PROJECTS_FILE = 'projects.json'
const PROJECTS_SUBDIR = 'projects'

const COLORS = ['#1473e6', '#3ba55d', '#d99a2b', '#a56ad6', '#d64545', '#3aa8a8', '#c9702e']

let state: ProjectsFile | null = null

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/**
 * Имя папки проекта — только латиница, цифры и дефис.
 *
 * Папка становится рабочей директорией для `npm run dev` и контекстом сборки
 * Docker; кириллица и пробелы там регулярно ломают сторонние инструменты,
 * поэтому название транслитерируется, а показывается пользователю всё равно
 * исходное поле name.
 */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return base || 'project'
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name)
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

function load(): ProjectsFile {
  if (state) return state
  state = loadJson<ProjectsFile>(PROJECTS_FILE, { projects: [], activeId: null })

  // Первый запуск (или обновление со старой версии без проектов): нужен
  // хотя бы один проект, иначе интерфейсу не на что опереться.
  if (state.projects.length === 0) {
    const first: Project = {
      id: `p-${Date.now()}`,
      name: 'Мой проект',
      slug: 'moy-proekt',
      createdAt: new Date().toISOString(),
      color: COLORS[0],
    }
    state = { projects: [first], activeId: first.id }
    saveJson(PROJECTS_FILE, state)
  }

  if (!state.activeId || !state.projects.some((p) => p.id === state!.activeId)) {
    state.activeId = state.projects[0].id
  }
  return state
}

function persist(): void {
  saveJson(PROJECTS_FILE, load())
}

export function getProjectsRoot(): string {
  const dir = path.join(getWorkspaceDir(), PROJECTS_SUBDIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function listProjects(): Project[] {
  return [...load().projects]
}

export function getActiveProjectId(): string {
  return load().activeId as string
}

export function getActiveProject(): Project {
  const s = load()
  return s.projects.find((p) => p.id === s.activeId) ?? s.projects[0]
}

/** Абсолютный путь к папке проекта. Папка создаётся, если её нет. */
export function getProjectDir(projectId?: string): string {
  const s = load()
  const project = projectId ? s.projects.find((p) => p.id === projectId) : getActiveProject()
  const dir = path.join(getProjectsRoot(), (project ?? s.projects[0]).slug)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Разрешает путь относительно папки проекта и не выпускает за её пределы.
 * Возвращает null при попытке выйти наружу (`..`, абсолютный путь).
 *
 * projectId нужен конвейеру: он работает в main-процессе и переживает
 * переключение проектов в интерфейсе, поэтому пишет строго в папку своего
 * прогона, а не в ту, которую пользователь открыл прямо сейчас.
 */
export function resolveInProject(relPath: string, projectId?: string): string | null {
  const root = getProjectDir(projectId)
  const full = path.resolve(root, relPath)
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}

/** Путь внутри проекта → путь для показа в интерфейсе (посикс, без корня). */
export function toProjectRelative(fullPath: string): string {
  return path.relative(getProjectDir(), fullPath).split(path.sep).join('/')
}

export function setActiveProject(id: string): Project | null {
  const s = load()
  if (!s.projects.some((p) => p.id === id)) return null
  s.activeId = id
  persist()
  return getActiveProject()
}

export function createProject(name: string): Project {
  const s = load()
  const trimmed = name.trim() || 'Новый проект'
  const project: Project = {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    slug: uniqueSlug(trimmed, new Set(s.projects.map((p) => p.slug))),
    createdAt: new Date().toISOString(),
    color: COLORS[s.projects.length % COLORS.length],
  }
  s.projects.push(project)
  s.activeId = project.id
  persist()
  // Папка создаётся сразу: пользователь ожидает увидеть её в проводнике,
  // даже если внутри проекта ещё ничего не делали.
  getProjectDir(project.id)
  return project
}

/**
 * Переименование проекта.
 *
 * Папку переименовываем только если она пуста: в непустой могут лежать
 * node_modules, запущенный dev-сервер или открытый в редакторе файл —
 * тихо двигать такое нельзя. Тогда имя и папка расходятся, и фактический
 * путь всегда виден в строке состояния и подсказке вкладки.
 */
export function renameProject(id: string, name: string): Project | null {
  const s = load()
  const project = s.projects.find((p) => p.id === id)
  if (!project) return null

  const trimmed = name.trim()
  if (!trimmed || trimmed === project.name) return project
  project.name = trimmed

  const oldDir = path.join(getProjectsRoot(), project.slug)
  let isEmpty = false
  try {
    isEmpty = !fs.existsSync(oldDir) || fs.readdirSync(oldDir).length === 0
  } catch {
    isEmpty = false
  }

  if (isEmpty) {
    const taken = new Set(s.projects.filter((p) => p.id !== id).map((p) => p.slug))
    const newSlug = uniqueSlug(trimmed, taken)
    if (newSlug !== project.slug) {
      try {
        if (fs.existsSync(oldDir)) fs.rmSync(oldDir, { recursive: true, force: true })
        fs.mkdirSync(path.join(getProjectsRoot(), newSlug), { recursive: true })
        project.slug = newSlug
      } catch {
        /* не вышло — остаёмся на старой папке, имя проекта всё равно сменилось */
      }
    }
  }

  persist()
  return project
}

/**
 * Удаляет проект из списка. Папка на диске остаётся — данные пользователя
 * приложение не стирает, только перестаёт их показывать.
 */
export function deleteProject(id: string): { ok: boolean; reason?: string } {
  const s = load()
  if (s.projects.length <= 1) return { ok: false, reason: 'Нельзя удалить единственный проект' }
  const idx = s.projects.findIndex((p) => p.id === id)
  if (idx === -1) return { ok: false, reason: 'Проект не найден' }

  s.projects.splice(idx, 1)
  if (s.activeId === id) s.activeId = s.projects[Math.max(0, idx - 1)].id
  persist()
  return { ok: true }
}

export function registerProjectsIPC(): void {
  ipcMain.handle('projects:list', () => ({
    projects: listProjects(),
    activeId: getActiveProjectId(),
  }))
  ipcMain.handle('projects:setActive', (_e: IpcMainInvokeEvent, id: string) => setActiveProject(id))
  ipcMain.handle('projects:create', (_e: IpcMainInvokeEvent, name: string) => createProject(name))
  ipcMain.handle('projects:rename', (_e: IpcMainInvokeEvent, id: string, name: string) =>
    renameProject(id, name)
  )
  ipcMain.handle('projects:delete', (_e: IpcMainInvokeEvent, id: string) => deleteProject(id))
  ipcMain.handle('projects:dir', () => ({
    dir: getProjectDir(),
    project: getActiveProject(),
  }))
}
