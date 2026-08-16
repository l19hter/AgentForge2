import { useState, useEffect, useRef } from 'react'
import { ps, metrics, fonts, dragRegion, noDragRegion } from '../theme'
import { Icon } from '../icons'

export interface MenuItem {
  /** Разделитель рисуется, если label не задан. */
  label?: string
  shortcut?: string
  disabled?: boolean
  checked?: boolean
  onSelect?: () => void
  submenu?: MenuItem[]
}

export interface MenuDef {
  label: string
  items: MenuItem[]
}

interface TitleBarProps {
  menus: MenuDef[]
  /** Подпись по центру — обычно название активного проекта. */
  title?: string
}

/** Кнопки управления окном рисуем сами: системной рамки нет. */
function WindowButton({
  kind,
  onClick,
  title,
}: {
  kind: 'min' | 'max' | 'restore' | 'close'
  onClick: () => void
  title: string
}) {
  const [hover, setHover] = useState(false)
  const glyph = {
    min: <path d="M1 5.5h9" />,
    max: <rect x="1.4" y="1.4" width="8.2" height="8.2" />,
    restore: (
      <>
        <rect x="1.4" y="3.4" width="6.2" height="6.2" />
        <path d="M3.6 3.4V1.4h6.2v6.2H7.8" />
      </>
    ),
    close: <path d="M1.4 1.4l8.2 8.2M9.6 1.4l-8.2 8.2" />,
  }[kind]

  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...noDragRegion,
        width: '44px',
        height: metrics.titleBarH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        background: hover ? (kind === 'close' ? '#c42b1c' : ps.hover) : 'transparent',
        color: hover && kind === 'close' ? '#fff' : ps.text,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1">
        {glyph}
      </svg>
    </button>
  )
}

/**
 * Единственная полоса сверху окна: значок, меню, название проекта и кнопки
 * управления окном. Системный заголовок Windows отключён (frame: false),
 * поэтому перетаскивание задаётся областями drag / no-drag.
 */
export default function TitleBar({ menus, title }: TitleBarProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const [maximized, setMaximized] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.electronAPI.windowIsMaximized().then(setMaximized)
    return window.electronAPI.onMaximizeChange(setMaximized)
  }, [])

  useEffect(() => {
    if (openIndex === null) return
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenIndex(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenIndex(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openIndex])

  const close = () => {
    setOpenIndex(null)
    setOpenSub(null)
  }

  const renderItems = (items: MenuItem[], depth = 0) => (
    <div
      style={{
        ...noDragRegion,
        position: 'absolute',
        top: depth === 0 ? '100%' : 0,
        left: depth === 0 ? 0 : '100%',
        minWidth: '215px',
        background: ps.menuPopup,
        border: `1px solid ${ps.borderDark}`,
        boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
        padding: '3px 0',
        zIndex: 500,
      }}
    >
      {items.map((item, i) =>
        !item.label ? (
          <div
            key={`sep-${i}`}
            style={{ height: '1px', background: ps.borderLight, margin: '3px 8px', opacity: 0.5 }}
          />
        ) : (
          <div
            key={item.label}
            onMouseEnter={() => setOpenSub(item.submenu ? i : null)}
            onClick={() => {
              if (item.disabled || item.submenu) return
              item.onSelect?.()
              close()
            }}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '22px',
              padding: '0 10px 0 22px',
              fontSize: '11px',
              color: item.disabled ? ps.textDisabled : ps.text,
              cursor: item.disabled ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
            onMouseOver={(e) => {
              if (!item.disabled) e.currentTarget.style.background = ps.accent
            }}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {item.checked && (
              <span style={{ position: 'absolute', left: '6px', top: '4px' }}>
                <Icon name="check" size={12} />
              </span>
            )}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: ps.textFaint, fontSize: '10px' }}>{item.shortcut}</span>
            )}
            {item.submenu && <Icon name="chevronRight" size={11} />}
            {item.submenu && openSub === i && renderItems(item.submenu, depth + 1)}
          </div>
        )
      )}
    </div>
  )

  return (
    <div
      ref={barRef}
      style={{
        ...dragRegion,
        height: metrics.titleBarH,
        background: ps.menuBar,
        borderBottom: `1px solid ${ps.borderDark}`,
        display: 'flex',
        alignItems: 'stretch',
        flexShrink: 0,
        fontFamily: fonts.ui,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px 0 10px',
          color: ps.accentHover,
        }}
      >
        <Icon name="shapes" size={15} />
      </div>

      {menus.map((menu, i) => (
        <div
          key={menu.label}
          onClick={() => setOpenIndex(openIndex === i ? null : i)}
          onMouseEnter={() => openIndex !== null && setOpenIndex(i)}
          style={{
            ...noDragRegion,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            padding: '0 9px',
            fontSize: '11px',
            color: ps.text,
            cursor: 'default',
            background: openIndex === i ? ps.accent : 'transparent',
          }}
        >
          {menu.label}
          {openIndex === i && renderItems(menu.items)}
        </div>
      ))}

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          color: ps.textFaint,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          padding: '0 12px',
        }}
      >
        {title ? `${title} — AgentForge Studio` : 'AgentForge Studio'}
      </div>

      <WindowButton
        kind="min"
        title="Свернуть"
        onClick={() => void window.electronAPI.windowMinimize()}
      />
      <WindowButton
        kind={maximized ? 'restore' : 'max'}
        title={maximized ? 'Восстановить' : 'Развернуть'}
        onClick={() => void window.electronAPI.windowToggleMaximize().then(setMaximized)}
      />
      <WindowButton
        kind="close"
        title="Закрыть"
        onClick={() => void window.electronAPI.windowClose()}
      />
    </div>
  )
}
