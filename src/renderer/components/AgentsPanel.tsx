import type { Agent, ChatSummary, KeyStatus } from '../types'
import { providerForModel, agentIcon } from '../types'
import { ps } from '../theme'
import { Icon, StatusDot } from '../icons'

interface AgentsPanelProps {
  agents: Agent[]
  activeId: string
  keyStatus: KeyStatus
  /** Сколько сообщений в диалоге с каждым агентом внутри текущего проекта. */
  summary: ChatSummary[]
  onSelect: (id: string) => void
}

/**
 * Список агентов как панель слоёв: строка на агента, выделение — синей
 * заливкой, справа индикатор готовности провайдера.
 */
export default function AgentsPanel({
  agents,
  activeId,
  keyStatus,
  summary,
  onSelect,
}: AgentsPanelProps) {
  const counts = new Map(summary.map((s) => [s.agentId, s.count]))

  return (
    <div style={{ padding: '2px 0' }}>
      {agents.map((agent) => {
        const isActive = agent.id === activeId
        const provider = providerForModel(agent.model)
        const hasKey = provider === 'claude' ? keyStatus.claude : keyStatus.kimi
        return (
          <div
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 8px',
              cursor: 'pointer',
              background: isActive ? ps.accent : 'transparent',
              color: isActive ? '#fff' : ps.text,
              borderBottom: `1px solid ${ps.border}`,
            }}
            onMouseOver={(e) => {
              if (!isActive) e.currentTarget.style.background = ps.hover
            }}
            onMouseOut={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent'
            }}
          >
            <Icon name={agentIcon(agent.icon)} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', lineHeight: '14px' }}>{agent.name}</div>
              <div
                style={{
                  fontSize: '10px',
                  lineHeight: '13px',
                  color: isActive ? 'rgba(255,255,255,0.75)' : ps.textFaint,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {agent.role}
              </div>
            </div>
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}
            >
              <StatusDot color={hasKey ? ps.ok : ps.err} />
              <span
                style={{
                  fontSize: '9px',
                  color: isActive ? 'rgba(255,255,255,0.7)' : ps.textFaint,
                }}
                title={agent.model}
              >
                {provider === 'claude' ? 'ANT' : 'MS'}
              </span>
            </div>
            {(counts.get(agent.id) ?? 0) > 0 && (
              <span
                style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  borderRadius: '7px',
                  background: isActive ? 'rgba(255,255,255,0.18)' : ps.sunken,
                  color: isActive ? '#fff' : ps.textFaint,
                  flexShrink: 0,
                }}
                title="Сообщений в этом диалоге"
              >
                {counts.get(agent.id)}
              </span>
            )}
          </div>
        )
      })}

      <div style={{ padding: '10px 8px', color: ps.textFaint, fontSize: '10px', lineHeight: 1.6 }}>
        У каждого агента свой диалог внутри проекта. Промпты редактируются в панели
        «Промпты агентов», модель — в строке параметров сверху.
      </div>
    </div>
  )
}
