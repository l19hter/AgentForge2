import * as fs from 'fs'
import * as path from 'path'
import { ipcMain, IpcMainInvokeEvent, dialog, shell, BrowserWindow } from 'electron'
import { getProjectDir, resolveInProject } from './projects'

/**
 * Файловые операции внутри папки активного проекта: добавление файлов
 * с диска, создание папок, переименование, удаление.
 *
 * Любой путь, пришедший из renderer'а, проходит через resolveInProject —
 * выйти за пределы проекта нельзя даже намеренно.
 */

export interface FileEntry {
  name: string
  /** Путь относительно корня проекта, разделитель — «/». */
  path: string
  isDir: boolean
  size: number
  modified: number
}

export interface OpResult {
  ok: boolean
  message?: string
  /** Сколько файлов реально добавлено — для операции добавления. */
  count?: number
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'release', '.next', '__pycache__'])
/** Ограничение на добавляемый файл — 64 МБ. */
const MAX_ADD_BYTES = 64 * 1024 * 1024

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

export function listDir(relDir = '.'): { entries: FileEntry[]; dir: string; error?: string } {
  const full = resolveInProject(relDir)
  if (!full) return { entries: [], dir: '.', error: 'Путь вне проекта' }
  const normalized = toPosix(path.relative(getProjectDir(), full)) || '.'

  try {
    if (!fs.existsSync(full)) return { entries: [], dir: normalized }
    const entries = fs
      .readdirSync(full, { withFileTypes: true })
      .filter((e) => !SKIP.has(e.name))
      .map((e) => {
        const abs = path.join(full, e.name)
        let size = 0
        let modified = 0
        try {
          const st = fs.statSync(abs)
          size = st.size
          modified = st.mtimeMs
        } catch {
          /* элемент исчез между readdir и stat */
        }
        return {
          name: e.name,
          path: toPosix(path.relative(getProjectDir(), abs)),
          isDir: e.isDirectory(),
          size,
          modified,
        }
      })
    // Папки сверху, дальше по алфавиту — как в проводнике.
    entries.sort((a, b) =>
      a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, 'ru')
    )
    return { entries, dir: normalized }
  } catch (e) {
    return { entries: [], dir: normalized, error: (e as Error).message }
  }
}

/** Не перезаписываем существующее: file.txt -> file (2).txt */
function freeName(dir: string, name: string): string {
  if (!fs.existsSync(path.join(dir, name))) return name
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!fs.existsSync(path.join(dir, candidate))) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

function copyInto(targetAbs: string, sources: string[]): OpResult {
  let count = 0
  const problems: string[] = []

  for (const src of sources) {
    try {
      const st = fs.statSync(src)
      if (st.isDirectory()) {
        const name = freeName(targetAbs, path.basename(src))
        fs.cpSync(src, path.join(targetAbs, name), { recursive: true })
        count++
        continue
      }
      if (st.size > MAX_ADD_BYTES) {
        problems.push(`${path.basename(src)}: больше 64 МБ`)
        continue
      }
      const name = freeName(targetAbs, path.basename(src))
      fs.copyFileSync(src, path.join(targetAbs, name))
      count++
    } catch (e) {
      problems.push(`${path.basename(src)}: ${(e as Error).message}`)
    }
  }

  if (count === 0 && problems.length) return { ok: false, message: problems.join('; '), count: 0 }
  return {
    ok: true,
    count,
    message: problems.length ? `Добавлено ${count}, пропущено: ${problems.join('; ')}` : undefined,
  }
}

/** Добавление через системный диалог выбора файлов. */
export async function addFilesViaDialog(
  win: BrowserWindow | null,
  relDir: string
): Promise<OpResult> {
  const target = resolveInProject(relDir || '.')
  if (!target) return { ok: false, message: 'Путь вне проекта' }

  const opts = {
    title: 'Добавить файлы в проект',
    properties: ['openFile' as const, 'multiSelections' as const],
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return { ok: false, message: 'Отменено', count: 0 }

  fs.mkdirSync(target, { recursive: true })
  return copyInto(target, res.filePaths)
}

/** Добавление перетаскиванием: пути приходят из webUtils.getPathForFile. */
export function addPaths(relDir: string, sources: string[]): OpResult {
  const target = resolveInProject(relDir || '.')
  if (!target) return { ok: false, message: 'Путь вне проекта' }
  if (!sources.length) return { ok: false, message: 'Нечего добавлять', count: 0 }
  fs.mkdirSync(target, { recursive: true })
  return copyInto(target, sources)
}

export function makeDir(relDir: string, name: string): OpResult {
  const safe = path.basename(name).replace(/[<>:"/\\|?*]/g, '_').trim()
  if (!safe) return { ok: false, message: 'Некорректное имя' }
  const parent = resolveInProject(relDir || '.')
  if (!parent) return { ok: false, message: 'Путь вне проекта' }

  const target = path.join(parent, safe)
  if (fs.existsSync(target)) return { ok: false, message: 'Папка уже существует' }
  try {
    fs.mkdirSync(target, { recursive: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export function remove(relPath: string): OpResult {
  const full = resolveInProject(relPath)
  // Корень проекта удалять нельзя — сравниваем нормализованные пути.
  if (!full || path.resolve(full) === path.resolve(getProjectDir())) {
    return { ok: false, message: 'Этот путь удалить нельзя' }
  }
  try {
    fs.rmSync(full, { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export function rename(relPath: string, newName: string): OpResult {
  const full = resolveInProject(relPath)
  if (!full) return { ok: false, message: 'Путь вне проекта' }
  const safe = path.basename(newName).replace(/[<>:"/\\|?*]/g, '_').trim()
  if (!safe) return { ok: false, message: 'Некорректное имя' }

  const target = path.join(path.dirname(full), safe)
  if (fs.existsSync(target)) return { ok: false, message: 'Такое имя уже занято' }
  try {
    fs.renameSync(full, target)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

/** Запись содержимого по пути внутри проекта — создаёт недостающие папки, перезаписывает существующее. */
export function writeProjectFile(relPath: string, content: string, projectId?: string): OpResult {
  const full = resolveInProject(relPath, projectId)
  if (!full) return { ok: false, message: 'Путь вне проекта' }
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export function revealInExplorer(relPath?: string): void {
  const full = relPath ? resolveInProject(relPath) : getProjectDir()
  if (!full) return
  // Для файла — показать его в папке, для папки — открыть её саму.
  try {
    if (fs.existsSync(full) && fs.statSync(full).isFile()) shell.showItemInFolder(full)
    else void shell.openPath(full)
  } catch {
    void shell.openPath(getProjectDir())
  }
}

export function registerFileOpsIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('files:list', (_e: IpcMainInvokeEvent, dir?: string) => listDir(dir))
  ipcMain.handle('files:add', (_e: IpcMainInvokeEvent, dir: string) =>
    addFilesViaDialog(getWindow(), dir)
  )
  ipcMain.handle('files:addPaths', (_e: IpcMainInvokeEvent, dir: string, paths: string[]) =>
    addPaths(dir, paths)
  )
  ipcMain.handle('files:mkdir', (_e: IpcMainInvokeEvent, dir: string, name: string) =>
    makeDir(dir, name)
  )
  ipcMain.handle('files:remove', (_e: IpcMainInvokeEvent, p: string) => remove(p))
  ipcMain.handle('files:rename', (_e: IpcMainInvokeEvent, p: string, name: string) =>
    rename(p, name)
  )
  ipcMain.handle('files:reveal', (_e: IpcMainInvokeEvent, p?: string) => revealInExplorer(p))
  ipcMain.handle('files:writeAt', (_e: IpcMainInvokeEvent, p: string, content: string) =>
    writeProjectFile(p, content)
  )
}
