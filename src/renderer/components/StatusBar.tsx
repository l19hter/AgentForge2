import { ps, metrics, fonts } from '../theme'
import { Icon, StatusDot } from '../icons'

interface StatusBarProps {
  state: string
  project: string
  model: string
  messageCount: number
  spent: number
  budget: number
  economyMode: boolean
  workspace: string
}

/** Длинный путь → «C:\Users\…\AgentForge-Workspace»: начало и конец важнее середины. */
function shortenPath(p: string, max: number): string {
  if (p.length <= max) return p
  const sep = p.includes('\\') ? '\\' : '/'
  const parts = p.split(sep)
  if (parts.length < 3) return `…${p.slice(-(max - 1))}`

  const head = parts[0] + sep
  let tail = parts[parts.length - 1]
  for (let i = parts.length - 2; i > 0; i--) {
    const next = parts[i] + sep + tail
    if (head.length + 1 + next.length > max) break
    tail = next
  }
  return `${head}…${sep}${tail}`
}

function Cell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div
      title={title}
      style={{
        padding: '0 10px',
        borderRight: `1px solid ${ps.borderDark}`,
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        height: '100%',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  )
}

/** Нижняя строка состояния — как масштаб и размер документа в Photoshop. */
export default function StatusBar({
  state,
  project,
  model,
  messageCount,
  spent,
  budget,
  economyMode,
  workspace,
}: StatusBarProps) {
  const over = spent >= budget
  const ratio = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0

  return (
    <div
      style={{
        height: metrics.statusBarH,
        flexShrink: 0,
        background: ps.panelHeader,
        borderTop: `1px solid ${ps.borderDark}`,
        display: 'flex',
        alignItems: 'stretch',
        fontSize: '11px',
        color: ps.textDim,
        fontFamily: fonts.ui,
        userSelect: 'none',
      }}
    >
      <Cell>
        <StatusDot color={economyMode ? ps.warn : ps.ok} />
        {state}
      </Cell>
      <Cell title="Активный проект">
        <Icon name="shapes" size={11} />
        {project}
      </Cell>
      <Cell title="Модель активного агента">{model || '—'}</Cell>
      <Cell title="Сообщений во всех диалогах">{messageCount} сообщ.</Cell>

      <Cell title="Израсходовано из дневного лимита">
        <span style={{ color: over ? ps.err : ps.textDim }}>
          ${spent.toFixed(4)} / ${budget.toFixed(2)}
        </span>
        <span
          style={{
            width: '54px',
            height: '5px',
            background: ps.sunken,
            border: `1px solid ${ps.borderDark}`,
            display: 'inline-block',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${ratio}%`,
              height: '100%',
              background: over ? ps.err : ps.accent,
            }}
          />
        </span>
      </Cell>

      <div style={{ flex: 1 }} />
      <div
        title={`Папка проекта: ${workspace}`}
        style={{
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          color: ps.textFaint,
          whiteSpace: 'nowrap',
          maxWidth: '420px',
          overflow: 'hidden',
        }}
      >
        {/* Обрезаем середину пути вручную: direction:rtl умеет переставлять
            куски пути местами, и «C:\» уезжает в конец строки. */}
        {shortenPath(workspace, 52)}
      </div>
    </div>
  )
}
