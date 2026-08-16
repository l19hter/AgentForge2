import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { getWorkspaceDir, resolveInWorkspace } from './paths'
import { loadJson, saveJson } from './persistence'
import { DEFAULT_PROMPTS, LEGACY_PROMPT_HASHES, PROMPTS_VERSION } from './default-prompts'

export interface AgentFile {
  name: string
  /** Путь ОТНОСИТЕЛЬНО рабочей папки — наружу абсолютные пути не отдаём. */
  path: string
  content: string
  isNew?: boolean
}

const AGENTS_DIR = path.join('.claude', 'agents')
const RULES_DIR = path.join('.claude', 'rules')
const VERSION_FILE = 'prompts-version.json'

/** Отпечаток текста промпта. Перевод строки нормализуем: Блокнот любит CRLF. */
function fingerprint(text: string): string {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 16)
}

export interface PromptMigration {
  updated: string[]
  /** Файлы, которые пользователь правил сам: их не трогаем ни при каких версиях. */
  kept: string[]
}

/**
 * Подтягивает промпты до текущей версии набора.
 *
 * Посев не перезаписывает существующие файлы, поэтому после обновления
 * приложения у пользователя оставались бы промпты от старой версии — а
 * конвейер рассчитывает на новые формулировки (формат ответа, запрос
 * недостающего файла, вес метки [CRITICAL]).
 *
 * Обновляем только те файлы, чей текст дословно совпадает с каким-нибудь
 * из ранее отгруженных: значит, их не правили. Всё остальное — работа
 * пользователя, и потерять её из-за обновления нельзя.
 */
export function migratePrompts(): PromptMigration {
  const root = getWorkspaceDir()
  const result: PromptMigration = { updated: [], kept: [] }

  const stored = loadJson<{ version?: number }>(VERSION_FILE, {})
  if ((stored.version ?? 0) >= PROMPTS_VERSION) return result

  for (const [relPath, content] of Object.entries(DEFAULT_PROMPTS)) {
    const full = path.join(root, relPath)
    if (!fs.existsSync(full)) continue

    let existing: string
    try {
      existing = fs.readFileSync(full, 'utf-8')
    } catch {
      continue
    }

    const current = fingerprint(existing)
    if (current === fingerprint(content)) continue
    if (!(LEGACY_PROMPT_HASHES[relPath] ?? []).includes(current)) {
      result.kept.push(relPath)
      continue
    }
    try {
      fs.writeFileSync(full, content, 'utf-8')
      result.updated.push(relPath)
    } catch {
      /* файл занят или только для чтения — останемся на старой версии */
    }
  }

  saveJson(VERSION_FILE, { version: PROMPTS_VERSION })
  return result
}

/** Создаёт .claude/ и записывает промпты по умолчанию, если их ещё нет. */
export function seedWorkspace(): PromptMigration {
  const root = getWorkspaceDir()
  for (const dir of [AGENTS_DIR, RULES_DIR]) {
    const full = path.join(root, dir)
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true })
  }
  for (const [relPath, content] of Object.entries(DEFAULT_PROMPTS)) {
    const full = path.join(root, relPath)
    if (!fs.existsSync(full)) {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content, 'utf-8')
    }
  }
  return migratePrompts()
}

function listMarkdown(relDir: string, namePrefix = ''): AgentFile[] {
  const root = getWorkspaceDir()
  const dir = path.join(root, relDir)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const rel = path.join(relDir, f)
      return {
        name: namePrefix + f,
        path: rel.split(path.sep).join('/'),
        content: fs.readFileSync(path.join(root, rel), 'utf-8'),
      }
    })
}

export function listAgentFiles(): AgentFile[] {
  seedWorkspace()
  try {
    return [...listMarkdown(AGENTS_DIR), ...listMarkdown(RULES_DIR, 'rules/')].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  } catch {
    return []
  }
}

export function readFile(relPath: string): string {
  const full = resolveInWorkspace(relPath)
  if (!full) return ''
  try {
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf-8')
  } catch {
    /* нет доступа / это папка */
  }
  return ''
}

export function writeFile(relPath: string, content: string): boolean {
  const full = resolveInWorkspace(relPath)
  if (!full) return false
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
  return true
}

export function createAgentFile(filename: string): AgentFile | null {
  const safe = path.basename(filename).replace(/[^\w.\-]/g, '_')
  const name = safe.endsWith('.md') ? safe : `${safe}.md`
  const rel = `${AGENTS_DIR.split(path.sep).join('/')}/${name}`
  const full = resolveInWorkspace(rel)
  if (!full) return null

  const defaultContent = `# ${name.replace('.md', '')}\n\n## Роль\n\n## Обязанности\n\n## Правила\n`
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, defaultContent, 'utf-8')
  return { name, path: rel, content: defaultContent, isNew: true }
}

export function deleteAgentFile(relPath: string): boolean {
  const full = resolveInWorkspace(relPath)
  if (!full) return false
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full)
      return true
    }
  } catch {
    /* файл занят другим процессом */
  }
  return false
}
