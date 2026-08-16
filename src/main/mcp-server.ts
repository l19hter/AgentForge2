import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getProjectDir, resolveInProject } from './projects'

export interface MCPFile {
  path: string
  content: string
  language: string
}

/** Файлы больше этого размера не читаем и не сканируем. */
const MAX_FILE_BYTES = 512 * 1024
const MAX_SEARCH_RESULTS = 100
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'release', '.next', 'venv'])

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sql': 'sql',
  '.sh': 'bash',
  '.dockerfile': 'dockerfile',
}

function detectLanguage(filePath: string): string {
  return LANGUAGE_BY_EXT[path.extname(filePath).toLowerCase()] || 'text'
}

/** Грубая, но дешёвая проверка на бинарник: NUL-байт в первых килобайтах. */
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 4096)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

export async function mcpReadFile(filePath: string): Promise<MCPFile | null> {
  const full = resolveInProject(filePath)
  if (!full) return null
  try {
    const stat = fs.statSync(full)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
    const buf = fs.readFileSync(full)
    if (looksBinary(buf)) return null
    return { path: filePath, content: buf.toString('utf-8'), language: detectLanguage(filePath) }
  } catch {
    return null
  }
}

export async function mcpWriteFile(filePath: string, content: string): Promise<boolean> {
  const full = resolveInProject(filePath)
  if (!full) return false
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

export async function mcpListFiles(dirPath = '.'): Promise<string[]> {
  const full = resolveInProject(dirPath)
  if (!full) return []
  try {
    if (!fs.existsSync(full)) return []
    return fs
      .readdirSync(full, { withFileTypes: true })
      .filter((e) => !SKIP_DIRS.has(e.name))
      .map((e) => {
        const rel = path.posix.join(dirPath.split(path.sep).join('/'), e.name)
        return e.isDirectory() ? `${rel}/` : rel
      })
      .sort()
  } catch {
    return []
  }
}

export async function mcpSearchCode(
  query: string,
  dirPath = '.'
): Promise<{ file: string; line: number; text: string }[]> {
  const root = getProjectDir()
  const start = resolveInProject(dirPath)
  if (!start || !query.trim()) return []

  const needle = query.toLowerCase()
  const results: { file: string; line: number; text: string }[] = []

  const walk = (dir: string): void => {
    if (results.length >= MAX_SEARCH_RESULTS) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= MAX_SEARCH_RESULTS) return
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue

      try {
        if (fs.statSync(full).size > MAX_FILE_BYTES) continue
        const buf = fs.readFileSync(full)
        if (looksBinary(buf)) continue

        const rel = path.relative(root, full).split(path.sep).join('/')
        buf
          .toString('utf-8')
          .split('\n')
          .forEach((line, idx) => {
            if (results.length >= MAX_SEARCH_RESULTS) return
            if (line.toLowerCase().includes(needle)) {
              results.push({ file: rel, line: idx + 1, text: line.trim().slice(0, 160) })
            }
          })
      } catch {
        /* файл исчез или недоступен — просто пропускаем */
      }
    }
  }

  walk(start)
  return results
}

export function registerMCPIPC(): void {
  ipcMain.handle('mcp:readFile', (_e: IpcMainInvokeEvent, p: string) => mcpReadFile(p))
  ipcMain.handle('mcp:writeFile', (_e: IpcMainInvokeEvent, p: string, c: string) =>
    mcpWriteFile(p, c)
  )
  ipcMain.handle('mcp:listFiles', (_e: IpcMainInvokeEvent, p?: string) => mcpListFiles(p))
  ipcMain.handle('mcp:searchCode', (_e: IpcMainInvokeEvent, q: string, p?: string) =>
    mcpSearchCode(q, p)
  )
}
