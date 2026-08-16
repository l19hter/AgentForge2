import { useState, useEffect, useCallback } from 'react'
import { ps, fonts, button, well } from '../theme'
import { GroupLabel } from './PanelChrome'
import { Icon } from '../icons'

interface AgentUsage {
  agentId: string
  agentName: string
  inputTokens: number
  outputTokens: number
  cost: number
  messageCount: number
}

interface SessionUsage {
  sessionStart: string
  agents: Record<string, AgentUsage>
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  totalMessages: number
}

const num = (n: number) => n.toLocaleString('ru-RU')

export default function TokenTrackerPanel() {
  const [session, setSession] = useState<SessionUsage | null>(null)

  const load = useCallback(async () => setSession(await window.electronAPI.getSessionUsage()), [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [load])

  if (!session) {
    return <div style={{ padding: '18px', textAlign: 'center', color: ps.textFaint }}>Загрузка…</div>
  }

  const agents = Object.values(session.agents)
  const stat = (label: string, value: string) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: '12px', color: ps.textStrong, fontFamily: fonts.mono }}>{value}</div>
      <div style={{ fontSize: '9px', color: ps.textFaint, marginTop: '2px' }}>{label}</div>
    </div>
  )

  return (
    <div>
      <GroupLabel>Итого за сессию</GroupLabel>
      <div style={{ padding: '0 8px' }}>
        <div style={{ ...well, padding: '10px' }}>
          <div
            style={{
              fontSize: '20px',
              color: ps.accentHover,
              fontFamily: fonts.mono,
              textAlign: 'center',
            }}
          >
            ${session.totalCost.toFixed(4)}
          </div>
          <div style={{ display: 'flex', marginTop: '10px' }}>
            {stat('вход', num(session.totalInputTokens))}
            {stat('выход', num(session.totalOutputTokens))}
            {stat('запросов', num(session.totalMessages))}
          </div>
        </div>
      </div>

      <GroupLabel>По агентам</GroupLabel>
      {agents.length === 0 && (
        <div style={{ padding: '10px 8px', color: ps.textFaint, fontSize: '11px' }}>
          Запросов ещё не было
        </div>
      )}
      {agents.map((a) => (
        <div
          key={a.agentId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 8px',
            borderBottom: `1px solid ${ps.border}`,
            fontSize: '11px',
          }}
        >
          <span style={{ flex: 1, color: ps.text }}>{a.agentName}</span>
          <span style={{ color: ps.textFaint, fontSize: '10px', fontFamily: fonts.mono }}>
            {num(a.inputTokens)} / {num(a.outputTokens)}
          </span>
          <span style={{ color: ps.textStrong, fontFamily: fonts.mono, width: '58px', textAlign: 'right' }}>
            ${a.cost.toFixed(4)}
          </span>
        </div>
      ))}

      <div style={{ padding: '10px 8px', display: 'flex', gap: '6px' }}>
        <button
          onClick={async () => {
            await window.electronAPI.resetSessionUsage()
            await load()
          }}
          style={button}
        >
          <Icon name="refresh" size={12} />
          Обнулить счётчик
        </button>
      </div>

      <div style={{ padding: '0 8px 10px', color: ps.textDisabled, fontSize: '10px', lineHeight: 1.6 }}>
        Цены заданы в src/main/api-client.ts (таблица PRICING, доллары за миллион токенов).
        Для моделей вне таблицы берётся средняя цена провайдера.
      </div>
    </div>
  )
}
