import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import archiver from 'archiver'
import { getActiveProject, getProjectDir } from './projects'

/**
 * Архив проекта — то, что уходит заказчику.
 *
 * Раньше архивировались только папки frontend/backend/deploy: так выглядела
 * раскладка до появления конвейера. Конвейер кладёт файлы туда, куда решил
 * Admin, — обычно в корень проекта (src/, public/, package.json), и такой
 * проект попадал в архив пустым. Поэтому берём папку проекта целиком.
 */

export interface ExportResult {
  status: 'ok' | 'cancelled' | 'empty' | 'error'
  path?: string
  /** Сколько файлов попало в архив. */
  count?: number
  message?: string
}

/** Не отдаём заказчику то, что он восстановит одной командой. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'release',
  '.next',
  'coverage',
  '__pycache__',
  'venv',
  '.venv',
  '.turbo',
])

/**
 * Файлы с секретами. Пример конфигурации отдаём, сам конфиг — нет: в нём
 * оказываются реальные ключи, а архив уходит постороннему человеку.
 */
function isSecretFile(name: string): boolean {
  const lower = name.toLowerCase()
  if (!lower.startsWith('.env')) return false
  return !lower.includes('example') && !lower.includes('sample') && !lower.includes('template')
}

interface Entry {
  abs: string
  /** Путь внутри архива, разделитель — «/». */
  rel: string
}

export interface ExportPlan {
  entries: Entry[]
  /** Пропущенные файлы с секретами — о них надо сказать вслух. */
  secrets: string[]
}

export function planExport(root: string): ExportPlan {
  const entries: Entry[] = []
  const secrets: string[] = []

  const walk = (dir: string, prefix: string): void => {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name
      if (item.isDirectory()) {
        if (SKIP_DIRS.has(item.name)) continue
        walk(path.join(dir, item.name), rel)
        continue
      }
      if (isSecretFile(item.name)) {
        secrets.push(rel)
        continue
      }
      entries.push({ abs: path.join(dir, item.name), rel })
    }
  }

  walk(root, '')
  return { entries, secrets }
}

/** Сборка архива без диалога — точка, за которую можно взяться из теста. */
export async function archiveProject(targetPath: string, projectId?: string): Promise<ExportResult> {
  const root = getProjectDir(projectId)
  const plan = planExport(root)
  if (plan.entries.length === 0) {
    return { status: 'empty', message: 'В папке проекта нет файлов для архива' }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(targetPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)
      archive.pipe(output)

      for (const e of plan.entries) archive.file(e.abs, { name: e.rel })
      void archive.finalize()
    })
  } catch (error) {
    return { status: 'error', message: (error as Error).message }
  }

  return {
    status: 'ok',
    path: targetPath,
    count: plan.entries.length,
    message: plan.secrets.length
      ? `Не включены файлы с секретами: ${plan.secrets.join(', ')}`
      : undefined,
  }
}

export async function exportProject(win: BrowserWindow | null): Promise<ExportResult> {
  const root = getProjectDir()
  const plan = planExport(root)
  // Проверяем до диалога: спрашивать имя файла, чтобы потом сообщить «пусто», —
  // напрасная работа пользователя.
  if (plan.entries.length === 0) {
    return {
      status: 'empty',
      message: 'В папке проекта нет файлов. Запустите конвейер или добавьте файлы вручную.',
    }
  }

  const opts = {
    title: 'Экспорт проекта',
    defaultPath: `${getActiveProject().slug}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  }
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, opts)
    : await dialog.showSaveDialog(opts)

  if (canceled || !filePath) return { status: 'cancelled' }
  return archiveProject(filePath)
}

export function registerExportIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('project:export', () => exportProject(getWindow()))
}
