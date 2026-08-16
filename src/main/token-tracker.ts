import { loadJson, saveJson } from './persistence'

export interface AgentUsage {
  agentId: string
  agentName: string
  inputTokens: number
  outputTokens: number
  cost: number
  messageCount: number
}

export interface SessionUsage {
  sessionStart: string
  agents: Record<string, AgentUsage>
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  totalMessages: number
}

const USAGE_FILE = 'token-usage.json'

function emptyUsage(): SessionUsage {
  return {
    sessionStart: new Date().toISOString(),
    agents: {},
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    totalMessages: 0,
  }
}

let sessionUsage: SessionUsage | null = null

// Ленивая инициализация: getDataDir() дёргает app.getPath(), поэтому не делаем
// этого на этапе импорта модуля.
function usage(): SessionUsage {
  if (!sessionUsage) {
    const saved = loadJson<SessionUsage | null>(USAGE_FILE, null)
    sessionUsage = saved ? { ...emptyUsage(), ...saved } : emptyUsage()
  }
  return sessionUsage
}

export function recordUsage(
  agentId: string,
  agentName: string,
  inputTokens: number,
  outputTokens: number,
  cost: number
): void {
  const u = usage()
  if (!u.agents[agentId]) {
    u.agents[agentId] = {
      agentId,
      agentName,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      messageCount: 0,
    }
  }

  const agent = u.agents[agentId]
  agent.inputTokens += inputTokens
  agent.outputTokens += outputTokens
  agent.cost += cost
  agent.messageCount += 1
  agent.agentName = agentName

  u.totalInputTokens += inputTokens
  u.totalOutputTokens += outputTokens
  u.totalCost += cost
  u.totalMessages += 1

  saveJson(USAGE_FILE, u)
}

export function getSessionUsage(): SessionUsage {
  return { ...usage() }
}

export function getAgentUsage(agentId: string): AgentUsage | null {
  const a = usage().agents[agentId]
  return a ? { ...a } : null
}

export function resetSession(): void {
  sessionUsage = emptyUsage()
  saveJson(USAGE_FILE, sessionUsage)
}
