import { ps, metrics } from '../theme'
import { Icon, type IconName } from '../icons'

export interface RailItem<T extends string> {
  id: T
  icon: IconName
  title: string
  /** Подсказка в правом нижнем углу кнопки, как «горячая клавиша» в Photoshop. */
  badge?: string
}

interface ToolRailProps<T extends string> {
  items: RailItem<T>[]
  active: T
  onSelect: (id: T) => void
  side: 'left' | 'right'
  /** Дополнительные кнопки внизу рейки. */
  footer?: React.ReactNode
}

/**
 * Вертикальная рейка иконок — панель инструментов слева и свёрнутый док
 * панелей справа. Активный инструмент подсвечивается более светлым фоном
 * и синей полосой у внешнего края.
 */
export default function ToolRail<T extends string>({
  items,
  active,
  onSelect,
  side,
  footer,
}: ToolRailProps<T>) {
  return (
    <div
      style={{
        width: metrics.railW,
        flexShrink: 0,
        background: ps.rail,
        [side === 'left' ? 'borderRight' : 'borderLeft']: `1px solid ${ps.borderDark}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '4px',
        gap: '1px',
      }}
    >
      {items.map((item) => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            title={item.badge ? `${item.title} (${item.badge})` : item.title}
            style={{
              position: 'relative',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '2px',
              background: isActive ? ps.active : 'transparent',
              color: isActive ? ps.textStrong : ps.textDim,
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseOver={(e) => {
              if (!isActive) e.currentTarget.style.background = ps.hover
            }}
            onMouseOut={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent'
            }}
          >
            <Icon name={item.icon} size={16} />
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  [side === 'left' ? 'left' : 'right']: 0,
                  top: '4px',
                  bottom: '4px',
                  width: '2px',
                  background: ps.accent,
                }}
              />
            )}
          </button>
        )
      })}
      <div style={{ flex: 1 }} />
      {footer}
    </div>
  )
}
