import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import {
  streamChat,
  getDailyUsage,
  getDailyBudget,
  type ChatMessage as ApiMessage,
} from './api-client'
import { appendMessage, type ChatMessage as StoredMessage } from './chat-store'
import { getActiveProjectId, getProjectDir } from './projects'
import { buildProjectContext, listProjectFiles } from './code-context'
import { runChecks, type CheckReport } from './command-runner'
import { writeProjectFile } from './file-ops'
import { parseFileBlocks } from '../shared/code-blocks'
import { addTask, updateSubtask, type TaskTree } from './decomposition'
import { loadJson, saveJson } from './persistence'
import { ensureRepo, snapshot } from './git-snapshot'

/**
 * Конвейер: одна задача на входе — готовый проверенный проект на выходе.
 *
 * Admin разбивает задачу на подзадачи, пользователь утверждает план (это
 * единственная остановка), дальше воркеры пишут код, он сохраняется в файлы
 * проекта, Тестер прогоняет реальную сборку, и при провале ошибки возвращаются
 * воркеру на исправление.
 *
 * Живёт в main-процессе намеренно: renderer перерисовывается, переключает
 * проекты и панели — конвейер не должен от этого умирать.
 */

export type PipelineStatus =
  | 'idle'
  | 'planning'
  | 'awaiting_plan'
  | 'working'
  | 'verifying'
  | 'fixing'
  | 'done'
  /** Код написан, но проверить его было нечем — это не успех и не провал. */
  | 'unverified'
  | 'failed'
  | 'stopped'
  /** Прогон оборвался вместе с приложением — восстановлению не подлежит. */
  | 'interrupted'

export type Assignee = 'frontend' | 'backend'

export interface PipelineSubtask {
  id: string
  title: string
  description: string
  assignee: Assignee
  status: 'pending' | 'in_progress' | 'done' | 'failed'
  /** Файлы, записанные при выполнении этой подзадачи. */
  files: string[]
}

export interface LogEntry {
  at: number
  kind: 'info' | 'ok' | 'err'
  agent?: string
  text: string
}

export interface PipelineRun {
  id: string
  projectId: string
  goal: string
  status: PipelineStatus
  stack: string
  subtasks: PipelineSubtask[]
  log: LogEntry[]
  /** Итог последнего прогона проверок — то, на основании чего выносится вердикт. */
  checks: { ran: boolean; passed: boolean; summary: string } | null
  /** Замечания Тестера: critical блокирует приёмку наравне с падением сборки. */
  review: { critical: string[]; text: string } | null
  fixAttempts: number
  taskId: string | null
  startedAt: number
  finishedAt: number | null
}

const MAX_FIX_ATTEMPTS = 3
const MAX_SUBTASKS = 12
/** Журнал пишется на диск целиком — без потолка файл рос бы бесконечно. */
const MAX_LOG_ENTRIES = 500

const RUNS_FILE = 'pipeline.json'

/** Статусы, при которых конвейер реально что-то делает прямо сейчас. */
const BUSY: PipelineStatus[] = ['planning', 'working', 'verifying', 'fixing']
const FINAL: PipelineStatus[] = ['done', 'unverified', 'failed', 'stopped', 'interrupted']

/** projectId -> последний прогон этого проекта. */
type RunsFile = Record<string, PipelineRun>

let store: RunsFile | null = null
let run: PipelineRun | null = null
let getWindow: () => BrowserWindow | null = () => null
let abort: AbortController | null = null
let stopRequested = false

/**
 * Поднимает прогоны с диска. Прогон, застигнутый закрытием приложения посреди
 * работы, помечается прерванным: показывать «выполняется» для того, что уже
 * никто не выполняет, — прямая ложь пользователю.
 *
 * Исключение — `awaiting_plan`: план уже оплачен и лежит целиком, гейт можно
 * пройти и после перезапуска, поэтому такой прогон восстанавливается живым.
 */
function loadRuns(): RunsFile {
  if (store) return store
  store = loadJson<RunsFile>(RUNS_FILE, {})

  let resumable: PipelineRun | null = null
  let dirty = false
  for (const r of Object.values(store)) {
    // Файл могли обрезать на записи при выключении питания или поправить
    // руками: пустой массив здесь дешевле, чем падение окна на старте.
    if (!Array.isArray(r.log)) r.log = []
    if (!Array.isArray(r.subtasks)) r.subtasks = []
    if (BUSY.includes(r.status)) {
      r.status = 'interrupted'
      r.finishedAt = r.finishedAt ?? Date.now()
      r.log.push({ at: Date.now(), kind: 'err', text: 'Прогон прерван закрытием приложения' })
      dirty = true
      continue
    }
    if (r.status === 'awaiting_plan') {
      if (!resumable || r.startedAt > resumable.startedAt) resumable = r
    }
  }
  if (dirty) saveJson(RUNS_FILE, store)
  // Только один прогон может ждать утверждения: гейт — модальное окно.
  if (resumable) run = resumable
  return store
}

/** Прогон нужного проекта (по умолчанию — активного). */
export function getRun(projectId?: string): PipelineRun | null {
  return loadRuns()[projectId ?? getActiveProjectId()] ?? null
}

function persist(): void {
  if (!run) return
  const runs = loadRuns()
  runs[run.projectId] = run
  saveJson(RUNS_FILE, runs)
}

function emit(): void {
  persist()
  // Окно могло закрыться посреди работы конвейера — конвейер живёт в main и
  // это переживает, но отправка в уничтоженный webContents бросает исключение.
  const win = getWindow()
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  // Пользователь мог уйти в другой проект: показываем прогон того проекта,
  // который открыт, а не тот, что работает.
  win.webContents.send('pipeline:update', getRun())
}

function log(kind: LogEntry['kind'], text: string, agent?: string): void {
  if (!run) return
  run.log.push({ at: Date.now(), kind, text, agent })
  if (run.log.length > MAX_LOG_ENTRIES) run.log = run.log.slice(-MAX_LOG_ENTRIES)
  emit()
}

function setStatus(status: PipelineStatus): void {
  if (!run) return
  run.status = status
  if (FINAL.includes(status)) run.finishedAt = Date.now()
  emit()
}

// ---------------------------------------------------------------------------
// Вызов агента
// ---------------------------------------------------------------------------

interface AgentReply {
  text: string
  error?: string
}

/**
 * Один запрос к агенту с записью в его чат — чтобы всё, что сделал конвейер,
 * было видно в интерфейсе обычными диалогами, а не только в журнале.
 */
async function callAgent(
  agentId: string,
  userText: string,
  extraSystem?: string,
  /** false — ответ не пишется в чат: у плана это сырой JSON, вместо него кладём читаемую версию. */
  recordReply = true
): Promise<AgentReply> {
  const projectId = run?.projectId
  const stamp = Date.now()

  appendMessage(
    agentId,
    { id: `p-u-${stamp}`, sender: 'user', text: userText, timestamp: stamp } as StoredMessage,
    projectId
  )

  const messages: ApiMessage[] = [{ role: 'user', content: userText }]
  abort = new AbortController()

  let out = ''
  let error: string | undefined
  let model: string | undefined
  let provider: 'claude' | 'kimi' | undefined

  for await (const chunk of streamChat(agentId, messages, false, abort.signal, extraSystem)) {
    if (chunk.type === 'chunk') out += chunk.text
    else if (chunk.type === 'error') error = chunk.message
    else {
      model = chunk.model
      provider = chunk.provider
    }
  }
  abort = null

  const text = out.trim()
  if (text && recordReply) {
    appendMessage(
      agentId,
      {
        id: `p-a-${Date.now()}`,
        sender: 'agent',
        text,
        timestamp: Date.now(),
        model,
        provider,
      } as StoredMessage,
      projectId
    )
  }
  return { text, error }
}

/** Останавливает конвейер, если деньги кончились: автономный цикл иначе выжжет бюджет. */
function budgetExhausted(): boolean {
  return getDailyUsage() >= getDailyBudget()
}

// ---------------------------------------------------------------------------
// План от Admin
// ---------------------------------------------------------------------------

const PLAN_INSTRUCTION = `## Формат этого ответа

Сейчас ты работаешь в автоматическом конвейере. Ответь ТОЛЬКО JSON-объектом,
без пояснений до и после, без markdown-ограды, строго такой структуры:

{
  "stack": "краткое описание выбранного стека",
  "subtasks": [
    { "title": "короткое название", "description": "что именно сделать, какие файлы создать", "assignee": "frontend" }
  ]
}

Правила:
- assignee только "frontend" (UI, React, клиент) или "backend" (API, БД, инфраструктура);
- подзадачи идут в порядке выполнения: то, от чего зависят другие, — раньше;
- не более ${MAX_SUBTASKS} подзадач, каждая — законченный кусок работы;
- в description укажи конкретные пути файлов, которые надо создать или изменить;
- не пиши код — только план.`

interface RawPlan {
  stack?: unknown
  subtasks?: unknown
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return body.slice(start, end + 1)
}

function parsePlan(text: string): { stack: string; subtasks: PipelineSubtask[] } | null {
  const json = extractJson(text)
  if (!json) return null

  let raw: RawPlan
  try {
    raw = JSON.parse(json) as RawPlan
  } catch {
    return null
  }
  if (!Array.isArray(raw.subtasks) || raw.subtasks.length === 0) return null

  const subtasks: PipelineSubtask[] = []
  for (const item of raw.subtasks.slice(0, MAX_SUBTASKS)) {
    const s = item as Record<string, unknown>
    const title = typeof s.title === 'string' ? s.title.trim() : ''
    if (!title) continue
    const assignee: Assignee = s.assignee === 'frontend' ? 'frontend' : 'backend'
    subtasks.push({
      id: `st-${subtasks.length + 1}-${Date.now()}`,
      title,
      description: typeof s.description === 'string' ? s.description.trim() : '',
      assignee,
      status: 'pending',
      files: [],
    })
  }
  if (subtasks.length === 0) return null

  return {
    stack: typeof raw.stack === 'string' ? raw.stack.trim() : '',
    subtasks,
  }
}

const AGENT_NAME: Record<Assignee, string> = { frontend: 'Worker1', backend: 'Worker2' }

/** Сырой JSON плана в чате нечитаем — показываем разметкой, её чат уже умеет. */
function renderPlan(stack: string, subtasks: PipelineSubtask[]): string {
  const lines = ['## План работ', '']
  if (stack) lines.push(`**Стек:** ${stack}`, '')
  subtasks.forEach((s, i) => {
    lines.push(`${i + 1}. **${s.title}** — ${AGENT_NAME[s.assignee]}`)
    if (s.description) lines.push(`   ${s.description}`)
  })
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Этапы
// ---------------------------------------------------------------------------

async function doPlanning(goal: string): Promise<boolean> {
  setStatus('planning')
  log('info', 'Admin составляет план работ', 'admin')

  const context = buildProjectContext({
    keywords: goal.split(/\s+/),
    projectId: run?.projectId,
  })
  const extra = context ? `${context}\n\n${PLAN_INSTRUCTION}` : PLAN_INSTRUCTION

  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callAgent('admin', goal, extra, false)
    if (reply.error) {
      log('err', `Ошибка запроса к Admin: ${reply.error}`, 'admin')
      return false
    }
    const plan = parsePlan(reply.text)
    if (plan && run) {
      run.stack = plan.stack
      run.subtasks = plan.subtasks
      appendMessage(
        'admin',
        {
          id: `p-plan-${Date.now()}`,
          sender: 'agent',
          text: renderPlan(plan.stack, plan.subtasks),
          timestamp: Date.now(),
        } as StoredMessage,
        run.projectId
      )
      log('ok', `План готов: ${plan.subtasks.length} подзадач`, 'admin')
      return true
    }
    log(
      'err',
      attempt === 1
        ? 'Admin вернул не JSON — повторяю запрос'
        : 'Admin повторно вернул не JSON, план не построен',
      'admin'
    )
  }
  return false
}

const WORKER_FORMAT = `## Формат этого ответа

Ты работаешь в автоматическом конвейере: всё, что ты пришлёшь в блоке кода с
указанием пути, будет СРАЗУ записано в файл проекта. Поэтому:
- присылай ПОЛНОЕ содержимое каждого файла, а не фрагмент и не диff;
- каждый файл — отдельный блок с путём от корня проекта:
  \`\`\`ts path=src/server/index.ts
  ...полное содержимое...
  \`\`\`
- никаких пояснений вне блоков кода;
- если файл уже существует в контексте выше — присылай его новую версию целиком;
- трогай только файлы своей подзадачи: чужие файлы из контекста не переписывай,
  даже если тебе кажется, что их стоит улучшить;
- если для работы не хватает файла, которого нет в контексте, — не выдумывай его
  содержимое: назови нужные файлы ОДНОЙ строкой и не присылай код вообще, их
  дошлют и запрос повторят.`

/** Сколько файлов дошлём воркеру по запросу: больше — и запрос выест весь бюджет. */
const MAX_REQUESTED_FILES = 6

/**
 * Позиция первого упоминания файла в тексте — или -1.
 *
 * Простой indexOf здесь врёт: имя `c.md` находится внутри `spec.md`, а
 * `index.js` — внутри `index.jsx`. Поэтому совпадение засчитывается только на
 * границе имени: слева не должно быть куска другого имени, справа —
 * продолжения. Разделитель пути слева допустим, иначе `./src/app.ts` перестал
 * бы находиться по `src/app.ts`.
 */
function indexOfMention(hayLower: string, needleLower: string): number {
  for (let from = 0; ; ) {
    const at = hayLower.indexOf(needleLower, from)
    if (at === -1) return -1
    const before = at === 0 ? '' : hayLower[at - 1]
    const after = hayLower[at + needleLower.length] ?? ''
    if (!/[a-z0-9_-]/.test(before) && !/[a-z0-9_]/.test(after)) return at
    from = at + 1
  }
}

/**
 * Ищет в ответе без кода имена реальных файлов проекта.
 *
 * Воркер по инструкции просит недостающий файл одной строкой. Опознаём такой
 * ответ не по формулировке (она произвольная), а по совпадению с деревом
 * проекта — так же надёжно и не зависит от языка ответа.
 */
function extractRequestedFiles(text: string, known: string[]): string[] {
  const lower = text.toLowerCase()
  const hits: string[] = []

  const baseCount = new Map<string, number>()
  for (const f of known) {
    const base = f.slice(f.lastIndexOf('/') + 1).toLowerCase()
    baseCount.set(base, (baseCount.get(base) ?? 0) + 1)
  }

  for (const f of known) {
    if (hits.length >= MAX_REQUESTED_FILES) break
    if (indexOfMention(lower, f.toLowerCase()) !== -1) {
      hits.push(f)
      continue
    }
    // Часто называют только имя файла. Принимаем, если оно однозначное:
    // при двух Index.tsx в разных папках непонятно, какой именно просят.
    const base = f.slice(f.lastIndexOf('/') + 1).toLowerCase()
    if (base.length >= 5 && baseCount.get(base) === 1 && indexOfMention(lower, base) !== -1) hits.push(f)
  }
  return hits
}

async function doSubtask(sub: PipelineSubtask): Promise<boolean> {
  if (!run) return false
  sub.status = 'in_progress'
  if (run.taskId) updateSubtask(run.taskId, sub.id, { status: 'in_progress' })
  log('info', `${sub.title}`, sub.assignee)
  emit()

  const done = run.subtasks
    .filter((s) => s.status === 'done')
    .map((s) => `- ${s.title} (файлы: ${s.files.join(', ') || 'нет'})`)
    .join('\n')

  const keywords = `${sub.title} ${sub.description}`.split(/\s+/)
  const context = buildProjectContext({ keywords, projectId: run.projectId })

  const extra = [context, WORKER_FORMAT].filter(Boolean).join('\n\n')
  const task = [
    `# Общая цель проекта`,
    run.goal,
    run.stack ? `\nСтек: ${run.stack}` : '',
    done ? `\n# Уже сделано\n${done}` : '',
    `\n# Твоя подзадача`,
    sub.title,
    sub.description,
  ]
    .filter(Boolean)
    .join('\n')

  let reply = await callAgent(sub.assignee, task, extra)
  if (reply.error) {
    sub.status = 'failed'
    log('err', `Ошибка: ${reply.error}`, sub.assignee)
    return false
  }

  let blocks = parseFileBlocks(reply.text)

  // Ответ без кода — ещё не провал: воркеру могло не хватить файла. Один раунд
  // уточнения дешевле, чем потерянная подзадача и ручная доделка за конвейером.
  if (blocks.length === 0) {
    const known = listProjectFiles(run.projectId).map((f) => f.path)
    const requested = extractRequestedFiles(reply.text, known)
    if (requested.length === 0) {
      sub.status = 'failed'
      log('err', 'Агент не прислал ни одного файла с указанием пути', sub.assignee)
      return false
    }

    log('info', `Просит файлы: ${requested.join(', ')} — досылаю`, sub.assignee)
    const extra2 = [
      buildProjectContext({ keywords, projectId: run.projectId, include: requested }),
      WORKER_FORMAT,
    ]
      .filter(Boolean)
      .join('\n\n')
    reply = await callAgent(
      sub.assignee,
      `${task}\n\n# Запрошенные файлы досланы\n${requested.join(', ')} — они целиком в контексте выше. Присылай код.`,
      extra2
    )
    if (reply.error) {
      sub.status = 'failed'
      log('err', `Ошибка: ${reply.error}`, sub.assignee)
      return false
    }
    blocks = parseFileBlocks(reply.text)
    if (blocks.length === 0) {
      sub.status = 'failed'
      log('err', 'Файлы досланы, но кода так и нет', sub.assignee)
      return false
    }
  }

  for (const b of blocks) {
    // Живой прогон показал: воркер охотно правит чужие файлы. Запретить нельзя —
    // иногда это законно, но в журнале это должно быть видно.
    const owner = run.subtasks.find((s) => s !== sub && s.files.includes(b.path))
    if (owner) log('info', `${b.path} переписан поверх «${owner.title}»`, sub.assignee)

    const res = writeProjectFile(b.path, b.code, run.projectId)
    if (res.ok) {
      if (!sub.files.includes(b.path)) sub.files.push(b.path)
      log('ok', `Записан ${b.path}`, sub.assignee)
    } else {
      log('err', `Не записан ${b.path}: ${res.message ?? 'ошибка'}`, sub.assignee)
    }
  }

  sub.status = sub.files.length > 0 ? 'done' : 'failed'
  if (run.taskId) {
    updateSubtask(run.taskId, sub.id, { status: sub.status === 'done' ? 'done' : 'blocked' })
  }
  emit()
  return sub.status === 'done'
}

const TESTER_FORMAT = `## Формат этого ответа

Ты работаешь в автоматическом конвейере. Сборка и тесты уже прогнаны, их вывод
приведён выше — он и есть объективный результат. От тебя нужен короткий отчёт
по качеству и безопасности кода, не более 15 строк, каждая строка начинается
с метки [CRITICAL], [WARNING] или [OK]. Код не присылай.

Метка [CRITICAL] запускает автоматическую переделку кода воркером, поэтому
ставь её только там, где проект не выполняет заявленную задачу, теряет данные
или содержит настоящую уязвимость. Стиль, форматирование, отсутствие тестов и
пожелания на будущее — это [WARNING].
Если критических дефектов нет, ни одной строки с [CRITICAL] быть не должно.`

/** Результат приёмки: объективные проверки плюс ревью Тестера. */
interface Verdict {
  report: CheckReport
  /** Строки отчёта с меткой [CRITICAL] — блокируют приёмку. */
  critical: string[]
}

/**
 * Вытаскивает критические замечания из отчёта.
 *
 * Строку-легенду («отчёт в формате [CRITICAL] / [WARNING] / [OK]») модель
 * повторяет охотно — считать её замечанием нельзя, поэтому строки со всеми
 * тремя метками сразу отбрасываем, как и метку без текста после неё.
 */
function extractCritical(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^[-*>\s]+/, '')
    if (!/\[\s*critical\s*\]/i.test(line)) continue
    if (/\[\s*warning\s*\]/i.test(line) && /\[\s*ok\s*\]/i.test(line)) continue
    const body = line.replace(/\*\*/g, '').replace(/\[\s*critical\s*\]/i, '').trim()
    if (body.length < 8) continue
    out.push(line.slice(0, 300))
  }
  return out
}

async function doVerify(): Promise<Verdict> {
  setStatus('verifying')
  log('info', 'Прогон сборки и тестов', 'tester')

  const report = await runChecks(run ? getProjectDir(run.projectId) : undefined)
  if (!run) return { report, critical: [] }

  run.checks = { ran: report.ran, passed: report.passed, summary: report.summary }
  log(
    report.ran ? (report.passed ? 'ok' : 'err') : 'info',
    report.ran
      ? report.passed
        ? 'Проверки пройдены'
        : 'Проверки провалены'
      : 'Автоматических проверок нет — вердикт только по ревью',
    'tester'
  )

  const context = buildProjectContext({ budget: 30_000, projectId: run.projectId })
  const extra = [context, TESTER_FORMAT].filter(Boolean).join('\n\n')
  const reply = await callAgent(
    'tester',
    `# Цель проекта\n${run.goal}\n\n# Результат автоматических проверок\n${report.summary}`,
    extra
  )
  if (reply.error) {
    log('err', `Ошибка запроса к Tester: ${reply.error}`, 'tester')
    run.review = null
    emit()
    return { report, critical: [] }
  }

  const critical = extractCritical(reply.text)
  run.review = { critical, text: reply.text }
  if (critical.length > 0) {
    log('err', `Тестер нашёл критическое: ${critical.length} шт.`, 'tester')
    for (const c of critical) log('err', c, 'tester')
  } else if (reply.text) {
    log('ok', 'Ревью без критических замечаний', 'tester')
  }

  emit()
  return { report, critical }
}

/** Работа принимается, только когда прошли и объективные проверки, и ревью. */
function needsFix(v: Verdict): boolean {
  return (v.report.ran && !v.report.passed) || v.critical.length > 0
}

/** Исполнители, которые действительно что-то записали, — только им есть что чинить. */
function activeAssignees(): Assignee[] {
  if (!run) return []
  const out: Assignee[] = []
  for (const s of run.subtasks) {
    if (s.files.length > 0 && !out.includes(s.assignee)) out.push(s.assignee)
  }
  return out
}

/**
 * Кого просить чинить.
 *
 * Первый упомянутый в тексте ошибки файл — почти всегда виновник: трасса
 * начинается с места падения. Поэтому ищем не «любое совпадение», а самое
 * раннее по позиции в тексте. Если ни один файл проекта не назван, а работали
 * оба воркера, спрашиваем Admin — он видел план и знает, где чей слой.
 */
async function pickFixer(errorText: string): Promise<Assignee> {
  if (!run) return 'backend'
  const lower = errorText.toLowerCase()

  let bestAt = Infinity
  let best: Assignee | null = null
  for (const s of run.subtasks) {
    for (const f of s.files) {
      const at = indexOfMention(lower, f.toLowerCase())
      // Более поздняя подзадача, переписавшая файл, отвечает за него — поэтому
      // при равной позиции побеждает она (проход идёт по порядку плана).
      if (at !== -1 && at <= bestAt) {
        bestAt = at
        best = s.assignee
      }
    }
  }
  if (best) return best

  const active = activeAssignees()
  if (active.length === 1) return active[0]
  if (active.length === 0) return run.subtasks[0]?.assignee ?? 'backend'

  const asked = await askAdminWhoFixes(errorText)
  if (asked) {
    log('info', `Admin назначил исполнителем ${AGENT_NAME[asked]}`, 'admin')
    return asked
  }
  return run.subtasks[0]?.assignee ?? 'backend'
}

/** Арбитраж Admin: один вопрос дешевле, чем правка чужого слоя не тем воркером. */
async function askAdminWhoFixes(errorText: string): Promise<Assignee | null> {
  if (!run) return null
  const byAssignee = (a: Assignee): string => {
    const files = run!.subtasks.filter((s) => s.assignee === a).flatMap((s) => s.files)
    return files.length ? files.join(', ') : 'нет файлов'
  }

  const reply = await callAgent(
    'admin',
    [
      '# Кому чинить?',
      `Worker1 (frontend) писал: ${byAssignee('frontend')}`,
      `Worker2 (backend) писал: ${byAssignee('backend')}`,
      '',
      '# Что сломалось',
      '```',
      errorText.slice(0, 4000),
      '```',
      '',
      'Ответь ОДНИМ словом — frontend или backend. Без пояснений.',
    ].join('\n')
  )
  if (reply.error) return null

  const t = reply.text.toLowerCase()
  const f = t.indexOf('frontend')
  const b = t.indexOf('backend')
  if (f === -1 && b === -1) return null
  if (f === -1) return 'backend'
  if (b === -1) return 'frontend'
  return f < b ? 'frontend' : 'backend'
}

async function doFix(v: Verdict): Promise<boolean> {
  if (!run) return false
  setStatus('fixing')
  run.fixAttempts++

  const buildBroken = v.report.ran && !v.report.passed
  // Сборка объективнее ревью, поэтому исполнителя выбираем по ней, когда она
  // упала; критические замечания идут в задание вместе с ней в любом случае.
  const blame = buildBroken ? v.report.summary : v.critical.join('\n')
  const assignee = await pickFixer(blame)
  log('info', `Исправление, попытка ${run.fixAttempts} из ${MAX_FIX_ATTEMPTS}`, assignee)

  const context = buildProjectContext({
    keywords: blame.split(/\s+/).slice(0, 40),
    projectId: run.projectId,
  })
  const extra = [context, WORKER_FORMAT].filter(Boolean).join('\n\n')

  const task: string[] = []
  if (buildBroken) {
    task.push(
      '# Сборка проекта падает',
      'Ниже дословный вывод команд. Исправь причину и пришли изменённые файлы целиком.',
      '',
      '```',
      v.report.summary,
      '```'
    )
  }
  if (v.critical.length > 0) {
    task.push(
      buildBroken ? '\n# Кроме того, Тестер нашёл критические дефекты' : '# Тестер нашёл критические дефекты',
      'Исправь каждый и пришли изменённые файлы целиком.',
      '',
      ...v.critical.map((c) => `- ${c}`)
    )
  }

  const reply = await callAgent(assignee, task.join('\n'), extra)
  if (reply.error) {
    log('err', `Ошибка: ${reply.error}`, assignee)
    return false
  }

  const blocks = parseFileBlocks(reply.text)
  if (blocks.length === 0) {
    log('err', 'Агент не прислал исправленных файлов', assignee)
    return false
  }
  for (const b of blocks) {
    const res = writeProjectFile(b.path, b.code, run.projectId)
    log(
      res.ok ? 'ok' : 'err',
      res.ok ? `Обновлён ${b.path}` : `Не записан ${b.path}: ${res.message ?? 'ошибка'}`,
      assignee
    )
  }
  return true
}

// ---------------------------------------------------------------------------
// Управление
// ---------------------------------------------------------------------------

function shouldStop(): boolean {
  if (stopRequested) {
    log('info', 'Остановлено пользователем')
    setStatus('stopped')
    return true
  }
  if (budgetExhausted()) {
    log('err', 'Достигнут дневной лимит расходов — конвейер остановлен')
    setStatus('failed')
    return true
  }
  return false
}

export function startPipeline(goal: string): PipelineRun | null {
  const text = goal.trim()
  if (!text) return null
  // Один конвейер за раз: проверки и запись файлов идут в папке своего проекта,
  // но npm-процессы и бюджет — общие, параллелить их нечем.
  if (run && BUSY.includes(run.status)) return run

  stopRequested = false
  run = {
    id: `run-${Date.now()}`,
    projectId: getActiveProjectId(),
    goal: text,
    status: 'planning',
    stack: '',
    subtasks: [],
    log: [],
    checks: null,
    review: null,
    fixAttempts: 0,
    taskId: null,
    startedAt: Date.now(),
    finishedAt: null,
  }
  emit()

  void (async () => {
    const ok = await doPlanning(text)
    if (!run) return
    if (stopRequested) return setStatus('stopped')
    if (!ok) return setStatus('failed')
    // Единственная остановка конвейера: план дешевле поправить здесь,
    // чем разбирать десяток файлов, написанных не по тому плану.
    setStatus('awaiting_plan')
  })().catch((e: unknown) => fatal(e))

  return run
}

/** Утверждение плана пользователем — возможно с правками из интерфейса. */
export function approvePlan(edited?: PipelineSubtask[]): void {
  // Берём прогон открытого проекта, а не последний запущенный: план мог
  // пережить перезапуск приложения, и тогда переменной в памяти уже нет.
  const target = getRun()
  if (!target || target.status !== 'awaiting_plan') return
  if (run && run !== target && BUSY.includes(run.status)) return

  stopRequested = false
  run = target
  if (edited && edited.length > 0) run.subtasks = edited

  // План уходит в обычное дерево задач — панель «Задачи» показывает тот же прогресс.
  const task: TaskTree = {
    id: `task-${run.id}`,
    title: run.goal.slice(0, 80),
    description: run.stack ? `Стек: ${run.stack}` : '',
    subtasks: run.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      assignee: s.assignee === 'frontend' ? 'Worker1' : 'Worker2',
      status: 'pending' as const,
    })),
    createdAt: new Date().toISOString(),
    autoFixEnabled: true,
  }
  addTask(task)
  run.taskId = task.id

  void runRemainder().catch((e: unknown) => fatal(e))
}

/** Неожиданное исключение внутри конвейера: без этого оно стало бы «тихим» зависанием. */
function fatal(e: unknown): void {
  if (!run) return
  log('err', `Сбой конвейера: ${e instanceof Error ? e.message : String(e)}`)
  setStatus('failed')
}

/**
 * Снимок состояния проекта после шага.
 *
 * Молча пропускаем, если git не установлен: снимки — страховка на случай, когда
 * воркер испортит уже написанный файл, а не условие работы конвейера.
 */
async function takeSnapshot(message: string): Promise<void> {
  if (!run) return
  const res = await snapshot(message, run.projectId)
  if (res.ok && res.commit) log('ok', `Снимок ${res.commit}: ${message}`)
  else if (!res.ok && res.message !== 'git не найден' && res.message !== 'нет репозитория') {
    log('info', `Снимок не сделан: ${res.message ?? 'причина неизвестна'}`)
  }
}

async function runRemainder(): Promise<void> {
  if (!run) return
  setStatus('working')

  const repo = await ensureRepo(run.projectId)
  if (repo.ok && repo.created) {
    log('info', 'Папка проекта под git: после каждого шага делается снимок')
    await takeSnapshot('chore: состояние до запуска конвейера')
  } else if (!repo.ok) {
    log('info', `Снимки истории недоступны: ${repo.message ?? 'git не найден'}`)
  }

  for (const sub of run.subtasks) {
    if (shouldStop()) return
    if (sub.status === 'done') continue
    const ok = await doSubtask(sub)
    if (ok) await takeSnapshot(`feat: ${sub.title}`)
  }

  if (shouldStop()) return

  let verdict = await doVerify()
  while (needsFix(verdict) && run && run.fixAttempts < MAX_FIX_ATTEMPTS) {
    if (shouldStop()) return
    const fixed = await doFix(verdict)
    if (fixed) await takeSnapshot(`fix: правка ${run?.fixAttempts ?? 0}`)
    if (!fixed) break
    if (shouldStop()) return
    verdict = await doVerify()
  }

  if (!run) return
  const anyWork = run.subtasks.some((s) => s.status === 'done')
  if (!anyWork) {
    log('err', 'Ни одна подзадача не выполнена')
    return setStatus('failed')
  }
  // Установка зависимостей и сборка создают файлы, которых не было на момент
  // последнего снимка (package-lock.json и подобные). Без этого проект уезжает
  // к пользователю с незакоммиченными изменениями прямо из коробки.
  await takeSnapshot('chore: состояние после проверок')
  if (verdict.report.ran && !verdict.report.passed) {
    log('err', 'Сборка так и не проходит — нужна ручная правка')
    return setStatus('failed')
  }
  if (verdict.critical.length > 0) {
    log('err', 'Тестер настаивает на критических замечаниях — нужна ручная правка')
    return setStatus('failed')
  }
  // Проверять было нечем: ни package.json, ни requirements.txt. Код написан,
  // но никто его не запускал — выдавать это за успех нельзя.
  if (!verdict.report.ran) {
    log('err', 'Код написан, но проверить его нечем: в проекте нет ни сборки, ни тестов')
    return setStatus('unverified')
  }
  log('ok', 'Готово')
  setStatus('done')
}

/**
 * Выход из приложения: обрываем запрос к провайдеру и на этом всё.
 *
 * Состояние на диске намеренно не трогаем: прогон, ждущий утверждения плана,
 * должен пережить перезапуск, а незавершённый пометится прерванным при
 * следующем старте — там для этого есть вся картина.
 */
export function shutdownPipeline(): void {
  stopRequested = true
  abort?.abort()
}

/** Остановка по кнопке пользователя — в отличие от выхода, закрывает и гейт. */
export function stopPipeline(): void {
  shutdownPipeline()

  // На гейте цикл не крутится, флаг заметить некому — закрываем прогон сами,
  // иначе окно плана нечем отменить и оно возвращается после перезапуска.
  const target = getRun()
  if (target && target.status === 'awaiting_plan') {
    run = target
    log('info', 'План отклонён')
    setStatus('stopped')
  }
}

export function registerPipelineIPC(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
  // Разбор прерванных прогонов делаем на старте, а не при первом обращении
  // из интерфейса: иначе «выполняется» успеет мелькнуть в панели.
  loadRuns()
  // Возвращаем прогон открытого проекта, а не тот, что вернул startPipeline:
  // при отказе (занят другой проект) интерфейс не должен показывать чужую работу.
  ipcMain.handle('pipeline:start', (_e: IpcMainInvokeEvent, goal: string) => {
    startPipeline(goal)
    return getRun()
  })
  ipcMain.handle('pipeline:get', () => getRun())
  ipcMain.handle('pipeline:approve', (_e: IpcMainInvokeEvent, edited?: PipelineSubtask[]) =>
    approvePlan(edited)
  )
  ipcMain.handle('pipeline:stop', () => stopPipeline())
}
