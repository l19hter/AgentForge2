import type { ReactNode } from 'react'
import { ps, metrics, fonts } from '../theme'
import { Icon, type IconName } from '../icons'

interface PanelChromeProps {
  title: string
  icon?: IconName
  /** Кнопки в правой части шапки — обновить, добавить и т. п. */
  actions?: { icon: IconName; title: string; onClick: () => void; disabled?: boolean }[]
  children: ReactNode
}

/**
 * Рамка панели в стиле Photoshop: узкая шапка с названием, тонкая рамка,
 * прокручиваемое тело. Название набрано капителью — так же, как заголовки
 * панелей «СЛОИ» / «КАНАЛЫ».
 */
export default function PanelChrome({ title, icon, actions, children }: PanelChromeProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: ps.panel,
        fontFamily: fonts.ui,
      }}
    >
      <div
        style={{
          height: metrics.panelHeaderH,
          flexShrink: 0,
          background: ps.panelHeader,
          borderBottom: `1px solid ${ps.borderDark}`,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 4px 0 8px',
          userSelect: 'none',
        }}
      >
        {icon && (
          <span style={{ color: ps.textDim }}>
            <Icon name={icon} size={13} />
          </span>
        )}
        <span
          style={{
            fontSize: '10px',
            letterSpacing: '0.7px',
            textTransform: 'uppercase',
            color: ps.text,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {actions?.map((a) => (
          <button
            key={a.title}
            onClick={a.onClick}
            title={a.title}
            disabled={a.disabled}
            style={{
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '2px',
              background: 'transparent',
              color: a.disabled ? ps.textDisabled : ps.textDim,
              cursor: a.disabled ? 'default' : 'pointer',
              padding: 0,
            }}
            onMouseOver={(e) => {
              if (!a.disabled) e.currentTarget.style.background = ps.hover
            }}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name={a.icon} size={13} />
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</div>
    </div>
  )
}

/** Заголовок группы внутри панели — как «Заливка» / «Непрозрачность». */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: '10px',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        color: ps.textFaint,
        padding: '10px 8px 4px',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  )
}

/** Строка «подпись — значение» с выравниванием по правому краю. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '3px 8px',
        minHeight: '24px',
      }}
    >
      <span style={{ fontSize: '11px', color: ps.textDim, width: '78px', flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '4px', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}
