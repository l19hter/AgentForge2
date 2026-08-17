import * as fs from 'fs'
import * as path from 'path'
import { getProjectDir } from './projects'
import { isSpreadsheet, readSpreadsheetAsText } from './spreadsheet'

/**
 * Сбор контекста проекта для промпта воркера.
 *
 * Без этого агент не видит, что уже написано, и может только сочинять файлы
 * с нуля — дорабатывать существующий код физически нечем. Здесь собирается
 * дерево файлов плюс содержимое тех из них, которые вероятнее всего нужны
 * для текущей подзадачи, в пределах жёсткого бюджета символов: контекст
 * моделей ограничен, а Kimi 32K — самый дешёвый и самый узкий из доступных.
 */

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'release',
  '.next',
  '__pycache__',
  'venv',
  '.venv',
  'coverage',
  '.turbo',
])

/** Файлы, которые не несут смысла для агента, но занимают весь бюджет. */
const SKIP_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  '.ds_store',
])

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php', '.cs',
  '.json', '.yml', '.yaml', '.toml', '.ini', '.env',
  '.html', '.css', '.scss', '.sass', '.less',
  '.md', '.txt', '.sql', '.sh', '.bat', '.ps1',
  '.vue', '.svelte', '.prisma', '.graphql',
  // Таблицы читаются превью через spreadsheet.ts: в папке проекта они почти
  // всегда исходные данные заказчика, а не мусор.
  '.xlsx', '.xlsm', '.csv',
])

/** Манифесты идут в контекст всегда: из них видно стек, скрипты и зависимости. */
const MANIFESTS = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'docker-compose.yml',
  'Dockerfile',
]

/** Потолок на один файл: гигантский автогенерённый модуль вытеснит всё остальное. */
const MAX_FILE_CHARS = 24_000
const DEFAULT_BUDGET = 48_000
const MAX_TREE_ENTRIES = 300

export interface ProjectFile {
  /** Путь от корня проекта, разделитель — «/». */
  path: string
  size: number
}

function isTextFile(name: string): boolean {
  return TEXT_EXT.has(path.extname(name).toLowerCase())
}

/** Обход дерева проекта вширь с ограничением глубины и пропуском служебных папок. */
export function listProjectFiles(projectId?: string, maxDepth = 8): ProjectFile[] {
  const root = getProjectDir(projectId)
  const out: ProjectFile[] = []

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || out.length >= MAX_TREE_ENTRIES * 3) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        walk(path.join(dir, e.name), depth + 1)
        continue
      }
      if (SKIP_FILES.has(e.name.toLowerCase())) continue
      const abs = path.join(dir, e.name)
      try {
        const st = fs.statSync(abs)
        out.push({ path: path.relative(root, abs).split(path.sep).join('/'), size: st.size })
      } catch {
        /* файл исчез между readdir и stat */
      }
    }
  }

  walk(root, 0)
  out.sort((a, b) => a.path.localeCompare(b.path))
  return out
}

export type DeliveryKind =
  /** Обычный текстовый файл. */
  | 'text'
  /** Двоичный формат, который удалось превратить в текст (таблица Excel). */
  | 'converted'
  /** Прочесть нечем — в контекст уходит honest-описание вместо содержимого. */
  | 'binary'

export interface FileForContext {
  kind: DeliveryKind
  text: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/**
 * Готовит содержимое файла для промпта.
 *
 * Двоичный файл раньше просто исчезал: агент просил у пользователя смету в
 * .xlsx, конвейер отвечал «досылаю» и не досылал ничего, а агент писал парсер
 * по догадке. Теперь таблицы читаются, а всё остальное честно описывается —
 * пусть агент знает, что файл есть, но его содержимое ему не показали.
 */
export function readFileForContext(relPath: string, projectId?: string): FileForContext | null {
  const abs = path.join(getProjectDir(projectId), relPath)

  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return null
  }

  if (isSpreadsheet(relPath)) {
    try {
      const preview = readSpreadsheetAsText(fs.readFileSync(abs))
      if (preview) {
        return {
          kind: 'converted',
          text:
            preview.length > MAX_FILE_CHARS
              ? preview.slice(0, MAX_FILE_CHARS) + '\n… (превью обрезано)'
              : preview,
        }
      }
    } catch {
      /* не разобралось — уйдёт как двоичный */
    }
  }

  try {
    const raw = fs.readFileSync(abs, 'utf-8')
    // Бинарник, случайно попавший по расширению: NUL-байт — надёжный признак.
    if (!raw.includes('\0')) {
      return {
        kind: 'text',
        text:
          raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) + '\n… (файл обрезан)' : raw,
      }
    }
  } catch {
    return null
  }

  return {
    kind: 'binary',
    text:
      `Двоичный файл, ${formatBytes(stat.size)}. Прочитать его содержимое нечем, ` +
      'поэтому оно не показано. Не выдумывай структуру этого файла: если она нужна для ' +
      'работы, попроси прислать выгрузку в текстовом виде (CSV) или напиши разбор так, ' +
      'чтобы он сам определял формат и внятно сообщал об ошибке.',
  }
}

function readCapped(relPath: string, projectId?: string): string | null {
  const file = readFileForContext(relPath, projectId)
  return file ? file.text : null
}

/**
 * Порядок включения файлов: сначала манифесты (стек и скрипты сборки),
 * затем совпавшие с ключевыми словами задачи, затем всё остальное —
 * от корня вглубь, потому что верхнеуровневые модули обычно важнее.
 */
function rankFiles(files: ProjectFile[], keywords: string[], forced: Set<string>): ProjectFile[] {
  const norm = keywords.map((k) => k.toLowerCase()).filter((k) => k.length >= 3)

  const score = (f: ProjectFile): number => {
    // Файл, который агент попросил явно, идёт первым: без него он второй раз
    // ответит тем же запросом вместо кода.
    if (forced.has(f.path)) return -1
    const base = path.basename(f.path)
    if (MANIFESTS.includes(base)) return 0
    if (norm.some((k) => f.path.toLowerCase().includes(k))) return 1
    return 2
  }

  return [...files]
    // Запрошенный агентом файл проходит фильтр расширений всегда: именно на
    // этом отсеве и терялись таблицы, которые он просил.
    .filter((f) => isTextFile(f.path) || forced.has(f.path))
    .sort((a, b) => {
      const d = score(a) - score(b)
      if (d !== 0) return d
      const depth = a.path.split('/').length - b.path.split('/').length
      return depth !== 0 ? depth : a.path.localeCompare(b.path)
    })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export interface ContextOptions {
  /** Слова из формулировки подзадачи — файлы с совпадением в пути идут раньше. */
  keywords?: string[]
  /** Потолок символов на содержимое файлов. */
  budget?: number
  /** Проект, чей код собираем. По умолчанию активный; конвейер передаёт свой. */
  projectId?: string
  /** Файлы, запрошенные агентом: идут первыми и включаются даже сверх бюджета. */
  include?: string[]
}

/**
 * Готовый блок для системного промпта: дерево проекта и содержимое файлов.
 * Пустая строка, если проект пуст — тогда воркер пишет с нуля, и блок только
 * зря занимал бы контекст.
 */
export function buildProjectContext(opts: ContextOptions = {}): string {
  const budget = opts.budget ?? DEFAULT_BUDGET
  const files = listProjectFiles(opts.projectId)
  if (files.length === 0) return ''
  const forced = new Set(opts.include ?? [])

  const parts: string[] = ['## Текущее состояние проекта', '', '### Файлы']

  for (const f of files.slice(0, MAX_TREE_ENTRIES)) {
    parts.push(`- ${f.path} (${formatSize(f.size)})`)
  }
  if (files.length > MAX_TREE_ENTRIES) {
    parts.push(`- … ещё ${files.length - MAX_TREE_ENTRIES} файлов`)
  }

  const ranked = rankFiles(files, opts.keywords ?? [], forced)
  const included: string[] = []
  let used = 0

  for (const f of ranked) {
    const must = forced.has(f.path)
    if (used >= budget && !must) break
    const content = readCapped(f.path, opts.projectId)
    if (content === null) continue
    if (used + content.length > budget && !must) continue
    const lang = path.extname(f.path).slice(1)
    included.push(`\n#### ${f.path}\n\`\`\`${lang}\n${content}\n\`\`\``)
    used += content.length
  }

  if (included.length > 0) {
    parts.push('', '### Содержимое файлов', ...included)
    const omitted = ranked.length - included.length
    if (omitted > 0) {
      parts.push(
        '',
        `_Ещё ${omitted} файлов не показаны целиком из-за ограничения контекста. ` +
          'Если для работы нужен конкретный файл из списка выше — скажи об этом одной строкой, без блока кода._'
      )
    }
  }

  return parts.join('\n')
}
