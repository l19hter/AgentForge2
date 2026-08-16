import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { loadJson, saveJson } from './persistence'
import { getActiveProjectId, listProjects } from './projects'

/**
 * Переписка хранится по паре «проект + агент»: у каждого агента в каждом
 * проекте свой независимый диалог. Это же хранилище обслуживает окно истории —
 * отдельного журнала сессий больше нет, чтобы одни и те же сообщения не
 * лежали в двух местах и не расходились.
 */

export interface ChatMessage {
  id: string
  sender: 'user' | 'agent'
  text: string
  timestamp: number
  provider?: 'claude' | 'kimi'
  model?: string
}

/** projectId -> agentId -> сообщения */
type ChatsFile = Record<string, Record<string, ChatMessage[]>>

export interface ChatSummary {
  agentId: string
  count: number
  lastAt: number | null
}

export interface ChatSearchHit {
  projectId: string
  projectName: string
  agentId: string
  messageId: string
  text: string
  timestamp: number
}

const CHATS_FILE = 'chats.json'
/** Ограничение на диалог: дальше обрезаем начало, иначе файл растёт без предела. */
const MAX_MESSAGES_PER_CHAT = 1000

/** Формат журнала сессий из версии до появления проектов. */
interface LegacySession {
  agentId: string
  messages: { role: 'user' | 'agent'; text: string; timestamp: number }[]
}

/**
 * Переносит переписку из старого sessions.json в чаты первого проекта.
 *
 * До версии 1.2 история лежала списком сессий без привязки к проекту. Без
 * переноса она просто перестала бы отображаться, хотя файл на диске остался.
 * Сам sessions.json не удаляем — пусть останется как резервная копия.
 */
function importLegacySessions(): ChatsFile {
  const sessions = loadJson<LegacySession[]>('sessions.json', [])
  if (!Array.isArray(sessions) || sessions.length === 0) return {}

  const byAgent: Record<string, ChatMessage[]> = {}
  const seen = new Set<string>()

  for (const session of sessions) {
    if (!session?.agentId || !Array.isArray(session.messages)) continue
    for (const m of session.messages) {
      // Старый код мог сохранять один диалог несколько раз — дедуплицируем.
      const key = `${session.agentId}|${m.timestamp}|${m.text}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!byAgent[session.agentId]) byAgent[session.agentId] = []
      byAgent[session.agentId].push({
        id: `legacy-${session.agentId}-${m.timestamp}-${byAgent[session.agentId].length}`,
        sender: m.role,
        text: m.text,
        timestamp: m.timestamp,
      })
    }
  }

  for (const list of Object.values(byAgent)) list.sort((a, b) => a.timestamp - b.timestamp)
  if (Object.keys(byAgent).length === 0) return {}

  const migrated: ChatsFile = { [getActiveProjectId()]: byAgent }
  saveJson(CHATS_FILE, migrated)
  return migrated
}

let cache: ChatsFile | null = null

function all(): ChatsFile {
  if (!cache) {
    const stored = loadJson<ChatsFile | null>(CHATS_FILE, null)
    cache = stored ?? importLegacySessions()
  }
  return cache
}

function persist(): void {
  saveJson(CHATS_FILE, all())
}

export function getChat(agentId: string, projectId?: string): ChatMessage[] {
  const pid = projectId ?? getActiveProjectId()
  return all()[pid]?.[agentId] ?? []
}

export function getProjectChats(projectId?: string): Record<string, ChatMessage[]> {
  const pid = projectId ?? getActiveProjectId()
  return all()[pid] ?? {}
}

export function appendMessage(agentId: string, message: ChatMessage, projectId?: string): void {
  const pid = projectId ?? getActiveProjectId()
  const chats = all()
  if (!chats[pid]) chats[pid] = {}
  if (!chats[pid][agentId]) chats[pid][agentId] = []

  const list = chats[pid][agentId]
  list.push(message)
  if (list.length > MAX_MESSAGES_PER_CHAT) {
    chats[pid][agentId] = list.slice(-MAX_MESSAGES_PER_CHAT)
  }
  persist()
}

export function clearChat(agentId: string, projectId?: string): void {
  const pid = projectId ?? getActiveProjectId()
  const chats = all()
  if (chats[pid]) delete chats[pid][agentId]
  persist()
}

/**
 * Полная замена диалога — используется при редактировании сообщения,
 * повторной генерации ответа и удалении отдельного сообщения: renderer
 * сам решает, что должно остаться, и присылает готовый список целиком.
 */
export function setChat(agentId: string, messages: ChatMessage[], projectId?: string): void {
  const pid = projectId ?? getActiveProjectId()
  const chats = all()
  if (!chats[pid]) chats[pid] = {}
  chats[pid][agentId] = messages.slice(-MAX_MESSAGES_PER_CHAT)
  persist()
}

/** Сводка по проекту: сколько сообщений у каждого агента и когда последнее. */
export function getChatSummary(projectId?: string): ChatSummary[] {
  const chats = getProjectChats(projectId)
  return Object.entries(chats).map(([agentId, msgs]) => ({
    agentId,
    count: msgs.length,
    lastAt: msgs.length ? msgs[msgs.length - 1].timestamp : null,
  }))
}

/** Сколько всего сообщений в каждом проекте — для счётчиков на вкладках. */
export function getAllCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [projectId, byAgent] of Object.entries(all())) {
    out[projectId] = Object.values(byAgent).reduce((sum, msgs) => sum + msgs.length, 0)
  }
  return out
}

export function searchChats(query: string): ChatSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const names = new Map(listProjects().map((p) => [p.id, p.name]))
  const hits: ChatSearchHit[] = []

  for (const [projectId, byAgent] of Object.entries(all())) {
    for (const [agentId, msgs] of Object.entries(byAgent)) {
      for (const m of msgs) {
        if (!m.text.toLowerCase().includes(q)) continue
        hits.push({
          projectId,
          projectName: names.get(projectId) ?? 'Удалённый проект',
          agentId,
          messageId: m.id,
          text: m.text.slice(0, 200),
          timestamp: m.timestamp,
        })
        if (hits.length >= 200) return hits
      }
    }
  }
  return hits.sort((a, b) => b.timestamp - a.timestamp)
}

export function registerChatIPC(): void {
  ipcMain.handle('chat:get', (_e: IpcMainInvokeEvent, agentId: string) => getChat(agentId))
  ipcMain.handle('chat:getProject', () => getProjectChats())
  ipcMain.handle('chat:append', (_e: IpcMainInvokeEvent, agentId: string, m: ChatMessage) =>
    appendMessage(agentId, m)
  )
  ipcMain.handle('chat:clear', (_e: IpcMainInvokeEvent, agentId: string) => clearChat(agentId))
  ipcMain.handle('chat:set', (_e: IpcMainInvokeEvent, agentId: string, msgs: ChatMessage[]) =>
    setChat(agentId, msgs)
  )
  ipcMain.handle('chat:summary', () => getChatSummary())
  ipcMain.handle('chat:counts', () => getAllCounts())
  ipcMain.handle('chat:search', (_e: IpcMainInvokeEvent, q: string) => searchChats(q))
}
