import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getProjectDir } from './projects'

/**
 * Снимки папки проекта в git после каждого шага конвейера.
 *
 * Воркер присылает файл целиком, и запись перезаписывает предыдущую версию без
 * следа. Живой прогон показал, чем это кончается: подзадача «тесты» переписала
 * файл, созданный подзадачей «реализация», и вернуться было некуда. Коммит
 * после каждого шага даёт и откат, и диффы — обычными средствами git, без
 * собственного хранилища версий внутри приложения.
 *
 * Если git не установлен, конвейер работает как раньше: снимки — страховка,
 * а не условие работы.
 */

const TIMEOUT = 30_000

/** Сборка и зависимости в снимках не нужны: npm install создаёт десятки тысяч файлов. */
const GITIGNORE = `node_modules/
dist/
build/
release/
.next/
coverage/
__pycache__/
*.pyc
venv/
.venv/
.env
.DS_Store
`

interface GitResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * Запуск git без shell.
 *
 * shell: true здесь недопустим: сообщение коммита содержит пробелы и кавычки,
 * и оболочка разберёт его на части. git — обычный exe, ему оболочка не нужна
 * (в отличие от npm.cmd в command-runner.ts).
 */
function git(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const proc = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })
    }

    const timer = setTimeout(() => {
      proc.kill()
      finish(null)
    }, TIMEOUT)

    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', (e) => {
      stderr += e.message
      finish(null)
    })
    proc.on('close', (code) => finish(code))
  })
}

let available: boolean | null = null

/** Есть ли git в системе. Спрашиваем один раз за запуск приложения. */
export async function isGitAvailable(): Promise<boolean> {
  if (available !== null) return available
  const res = await git(['--version'], process.cwd())
  available = res.code === 0
  return available
}

/** Только для тестов: сбросить кэш проверки наличия git. */
export function resetGitCache(): void {
  available = null
}

export interface SnapshotResult {
  ok: boolean
  /** Короткий хэш коммита, если он состоялся. */
  commit?: string
  /** Изменений не было — это не ошибка. */
  empty?: boolean
  /** Репозиторий создан этим вызовом. */
  created?: boolean
  message?: string
}

async function hasIdentity(dir: string): Promise<boolean> {
  const email = await git(['config', 'user.email'], dir)
  const name = await git(['config', 'user.name'], dir)
  return email.code === 0 && email.stdout !== '' && name.code === 0 && name.stdout !== ''
}

/**
 * Готовит репозиторий в папке проекта.
 *
 * Чужой репозиторий не трогаем в смысле настроек — просто пользуемся им.
 * Свой заводим с локальной подписью: на машине без глобального user.email
 * коммит иначе не создаётся вовсе.
 */
export async function ensureRepo(projectId?: string): Promise<SnapshotResult> {
  if (!(await isGitAvailable())) return { ok: false, message: 'git не найден' }
  const dir = getProjectDir(projectId)

  if (fs.existsSync(path.join(dir, '.git'))) return { ok: true, created: false }

  const init = await git(['init'], dir)
  if (init.code !== 0) return { ok: false, message: init.stderr || 'git init не выполнился' }

  if (!(await hasIdentity(dir))) {
    await git(['config', 'user.email', 'pipeline@agentforge.local'], dir)
    await git(['config', 'user.name', 'AgentForge Pipeline'], dir)
  }

  const ignore = path.join(dir, '.gitignore')
  if (!fs.existsSync(ignore)) {
    try {
      fs.writeFileSync(ignore, GITIGNORE, 'utf-8')
    } catch {
      /* без .gitignore снимки просто будут толще */
    }
  }

  return { ok: true, created: true }
}

/**
 * Коммитит текущее состояние папки проекта.
 *
 * Пустой коммит не создаём: шаг, ничего не изменивший, не должен оставлять
 * след в истории — иначе по ней невозможно понять, где что появилось.
 */
export async function snapshot(message: string, projectId?: string): Promise<SnapshotResult> {
  if (!(await isGitAvailable())) return { ok: false, message: 'git не найден' }
  const dir = getProjectDir(projectId)
  if (!fs.existsSync(path.join(dir, '.git'))) return { ok: false, message: 'нет репозитория' }

  const added = await git(['add', '-A'], dir)
  if (added.code !== 0) return { ok: false, message: added.stderr || 'git add не выполнился' }

  // --porcelain не переводится на язык системы, в отличие от текста коммита.
  const status = await git(['status', '--porcelain'], dir)
  if (status.code === 0 && status.stdout === '') return { ok: true, empty: true }

  const done = await git(['commit', '-m', message], dir)
  if (done.code !== 0) return { ok: false, message: done.stderr || done.stdout || 'коммит не создан' }

  const head = await git(['rev-parse', '--short', 'HEAD'], dir)
  return { ok: true, commit: head.code === 0 ? head.stdout : undefined }
}
