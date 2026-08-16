import type { Agent, ModelInfo, UsageInfo } from '../types'
import { providerForModel, agentIcon } from '../types'
import { ps, metrics, fonts, select, button, buttonDisabled } from '../theme'
import { Icon, IconFilled, StatusDot } from '../icons'

interface OptionsBarProps {
  agent: Agent | undefined
  models: ModelInfo[]
  hasKey: boolean
  isStreaming: boolean
  usage: UsageInfo
  onModelChange: (model: string) => void
  onStop: () => void
}

/**
 * Панель параметров под строкой меню — в Photoshop она показывает настройки
 * выбранного инструмента. Здесь: активный агент, его модель, провайдер
 * и кнопка прерывания генерации.
 */
export default function OptionsBar({
  agent,
  models,
  hasKey,
  isStreaming,
  usage,
  onModelChange,
  onStop,
}: OptionsBarProps) {
  const provider = agent ? providerForModel(agent.model) : 'kimi'

  // Модель агента может отсутствовать в списке провайдера (сменили ключ,
  // модель убрали из доступа) — показываем её отдельным пунктом, чтобы
  // select не «перескочил» молча на чужое значение.
  const options = models.some((m) => m.id === agent?.model)
    ? models
    : agent
      ? [{ id: agent.model, label: `${agent.model} (нет в списке)`, provider, live: false }, ...models]
      : models

  return (
    <div
      style={{
        height: metrics.optionsBarH,
        flexShrink: 0,
        background: ps.panelHeader,
        borderBottom: `1px solid ${ps.borderDark}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 8px',
        fontFamily: fonts.ui,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingRight: '8px',
          borderRight: `1px solid ${ps.borderDark}`,
          height: '100%',
        }}
      >
        <span style={{ color: ps.textStrong }}>
          <Icon name={agent ? agentIcon(agent.icon) : 'move'} size={16} />
        </span>
        <span style={{ fontSize: '11px', color: ps.textStrong, minWidth: '52px' }}>
          {agent?.name ?? '—'}
        </span>
        <span style={{ fontSize: '11px', color: ps.textFaint }}>{agent?.role ?? ''}</span>
      </div>

      <span style={{ fontSize: '11px', color: ps.textDim }}>Модель:</span>
      <select
        value={agent?.model ?? ''}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={!agent || usage.economyMode}
        style={{
          ...select,
          width: '210px',
          opacity: usage.economyMode ? 0.55 : 1,
          cursor: usage.economyMode ? 'default' : 'pointer',
        }}
        title={usage.economyMode ? 'Выбор заблокирован: включён эконом-режим' : undefined}
      >
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
        title={hasKey ? 'Ключ провайдера задан' : 'Для этой модели не задан ключ'}
      >
        <StatusDot color={hasKey ? ps.ok : ps.err} />
        <span style={{ fontSize: '11px', color: ps.textDim }}>
          {provider === 'claude' ? 'Anthropic' : 'Moonshot'}
        </span>
      </div>

      {usage.economyMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: ps.warn,
            fontSize: '11px',
          }}
          title="Бюджет исчерпан — запросы идут на самую дешёвую модель"
        >
          <Icon name="alert" size={13} />
          Эконом-режим
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={onStop}
        disabled={!isStreaming}
        style={isStreaming ? { ...button, color: ps.err } : buttonDisabled}
        title="Прервать генерацию"
      >
        <IconFilled name="stop" size={11} />
        Стоп
      </button>
    </div>
  )
}
