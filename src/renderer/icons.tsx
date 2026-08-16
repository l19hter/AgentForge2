import type { CSSProperties } from 'react'

/**
 * Штриховые иконки 16x16, нарисованные под панель инструментов Photoshop:
 * один вес линии, скруглённые концы, без заливки, цвет наследуется от текста.
 *
 * Названия инструментов приблизительные — иконка передаёт смысл действия,
 * а не копирует конкретный инструмент Adobe.
 */

export type IconName =
  // Инструменты (левая рейка)
  | 'move'
  | 'tree'
  | 'shapes'
  | 'bandage'
  // Панели (правая рейка)
  | 'folder'
  | 'chart'
  | 'plug'
  | 'eye'
  | 'chip'
  | 'deploy'
  | 'sliders'
  // Агенты
  | 'target'
  | 'layout'
  | 'server'
  | 'bug'
  // Действия
  | 'send'
  | 'stop'
  | 'play'
  | 'refresh'
  | 'save'
  | 'search'
  | 'plus'
  | 'close'
  | 'check'
  | 'trash'
  | 'pencil'
  | 'doc'
  | 'external'
  | 'terminal'
  | 'chevronDown'
  | 'chevronUp'
  | 'chevronRight'
  | 'chevronLeft'
  | 'menu'
  | 'alert'
  | 'info'
  | 'key'
  | 'link'

const P: Record<IconName, JSX.Element> = {
  // --- Инструменты ---
  move: (
    <>
      <path d="M8 1.8v12.4M1.8 8h12.4" />
      <path d="M8 1.8 6 3.9M8 1.8 10 3.9M8 14.2l-2-2.1M8 14.2l2-2.1" />
      <path d="M1.8 8 3.9 6M1.8 8 3.9 10M14.2 8l-2.1-2M14.2 8l-2.1 2" />
    </>
  ),
  tree: (
    <>
      <rect x="1.8" y="2" width="4.4" height="3.2" rx="0.5" />
      <rect x="9.8" y="6.4" width="4.4" height="3.2" rx="0.5" />
      <rect x="9.8" y="11" width="4.4" height="3.2" rx="0.5" />
      <path d="M4 5.2v7.4h5.8M4 8h5.8" />
    </>
  ),
  shapes: (
    <>
      <rect x="1.8" y="1.8" width="6.6" height="6.6" rx="0.5" />
      <circle cx="10.2" cy="10.2" r="3.9" />
    </>
  ),
  bandage: (
    <>
      <rect x="1.4" y="5.9" width="13.2" height="4.2" rx="2.1" transform="rotate(-45 8 8)" />
      <rect x="5.9" y="5.9" width="4.2" height="4.2" transform="rotate(-45 8 8)" />
    </>
  ),

  // --- Панели ---
  folder: <path d="M1.8 12.8v-9h4.1l1.5 2h6.8v7z" />,
  chart: (
    <>
      <path d="M1.8 14.2h12.4" />
      <path d="M3.6 14.2V9.4M6.9 14.2V5.6M10.2 14.2V7.9M13.5 14.2V2.6" />
    </>
  ),
  plug: (
    <>
      <path d="M6 1.9v3.2M10 1.9v3.2" />
      <path d="M4.4 5.1h7.2v3.1a3.6 3.6 0 0 1-7.2 0z" />
      <path d="M8 11.8v2.4" />
    </>
  ),
  eye: (
    <>
      <path d="M1.4 8s2.5-4.4 6.6-4.4S14.6 8 14.6 8s-2.5 4.4-6.6 4.4S1.4 8 1.4 8z" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  chip: (
    <>
      <rect x="4.4" y="4.4" width="7.2" height="7.2" rx="0.5" />
      <path d="M6.6 4.4V2.2M9.4 4.4V2.2M6.6 13.8v-2.2M9.4 13.8v-2.2" />
      <path d="M4.4 6.6H2.2M4.4 9.4H2.2M13.8 6.6h-2.2M13.8 9.4h-2.2" />
    </>
  ),
  deploy: (
    <>
      <path d="M8 10.6V2.2M8 2.2 4.8 5.4M8 2.2l3.2 3.2" />
      <path d="M2.2 10.4v3.4h11.6v-3.4" />
    </>
  ),
  sliders: (
    <>
      <path d="M1.8 4.6h12.4M1.8 11.4h12.4" />
      <circle cx="5.6" cy="4.6" r="1.8" />
      <circle cx="10.4" cy="11.4" r="1.8" />
    </>
  ),

  // --- Агенты ---
  target: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <circle cx="8" cy="8" r="1.7" />
      <path d="M8 0.9v2.2M8 12.9v2.2M0.9 8h2.2M12.9 8h2.2" />
    </>
  ),
  layout: (
    <>
      <rect x="1.6" y="2.4" width="12.8" height="11.2" rx="1" />
      <path d="M1.6 6.2h12.8M5.9 6.2v7.4" />
    </>
  ),
  server: (
    <>
      <ellipse cx="8" cy="3.9" rx="5.4" ry="2.1" />
      <path d="M2.6 3.9v8.2c0 1.16 2.42 2.1 5.4 2.1s5.4-.94 5.4-2.1V3.9" />
      <path d="M2.6 8c0 1.16 2.42 2.1 5.4 2.1s5.4-.94 5.4-2.1" />
    </>
  ),
  bug: (
    <>
      <path d="M5.6 5.4a2.4 2.4 0 0 1 4.8 0" />
      <rect x="4.6" y="5.4" width="6.8" height="7.4" rx="3.4" />
      <path d="M4.6 7.6H1.9M4.6 10.6H1.9M11.4 7.6h2.7M11.4 10.6h2.7M6.1 3.6 5 2.4M9.9 3.6 11 2.4" />
    </>
  ),

  // --- Действия ---
  send: <path d="M2.2 8h10.6M9.2 4.4 12.8 8l-3.6 3.6" />,
  stop: <rect x="4.4" y="4.4" width="7.2" height="7.2" rx="0.5" />,
  play: <path d="M5.2 3.4 12.6 8l-7.4 4.6z" />,
  refresh: (
    <>
      <path d="M13.6 8a5.6 5.6 0 1 1-1.64-3.96" />
      <path d="M13.6 2.2v3.4h-3.4" />
    </>
  ),
  save: (
    <>
      <path d="M2.4 2.4h8.6l2.6 2.6v8.6H2.4z" />
      <path d="M5.2 2.4v4.2h5.6V2.4M5.2 13.6V9.4h5.6v4.2" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.4 10.4 14 14" />
    </>
  ),
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  close: <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />,
  check: <path d="M3 8.4 6.4 11.8 13 4.6" />,
  trash: (
    <>
      <path d="M2.6 4.4h10.8M6 4.4V2.6h4v1.8" />
      <path d="M4.2 4.4 4.9 13.6h6.2l.7-9.2" />
    </>
  ),
  pencil: <path d="M10.9 2.3 13.7 5.1 5.4 13.4H2.6v-2.8z" />,
  doc: (
    <>
      <path d="M3.8 1.6h5.4l3 3v9.8H3.8z" />
      <path d="M9.2 1.6v3h3" />
    </>
  ),
  external: (
    <>
      <path d="M9.2 2.6h4.2v4.2M13.4 2.6 7.6 8.4" />
      <path d="M12 9.4v4H2.8V4.2h4" />
    </>
  ),
  terminal: <path d="M3 4.2 6.2 8 3 11.8M8.4 12h4.6" />,
  chevronDown: <path d="M4.2 6.2 8 10l3.8-3.8" />,
  chevronUp: <path d="M4.2 9.8 8 6l3.8 3.8" />,
  chevronRight: <path d="M6.2 4.2 10 8l-3.8 3.8" />,
  chevronLeft: <path d="M9.8 4.2 6 8l3.8 3.8" />,
  menu: <path d="M3 5h10M3 8h10M3 11h10" />,
  alert: (
    <>
      <path d="M8 2.2 14.8 13.8H1.2z" />
      <path d="M8 6.6v3.4M8 11.9v.7" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.1" />
      <path d="M8 7.4v4M8 4.7v.8" />
    </>
  ),
  key: (
    <>
      <circle cx="5.2" cy="5.2" r="3.2" />
      <path d="M7.5 7.5 13.6 13.6M11.4 11.4l-1.6 1.6M13 13l-1.4 1.4" />
    </>
  ),
  link: (
    <>
      <path d="M6.6 9.4a2.8 2.8 0 0 0 4 0l2.2-2.2a2.83 2.83 0 0 0-4-4L7.6 4.4" />
      <path d="M9.4 6.6a2.8 2.8 0 0 0-4 0L3.2 8.8a2.83 2.83 0 0 0 4 4l1.2-1.2" />
    </>
  ),
}

interface IconProps {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
  style?: CSSProperties
  title?: string
}

export function Icon({ name, size = 16, color, strokeWidth = 1.2, style, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {P[name]}
    </svg>
  )
}

/** Сплошная иконка — для «стоп» и маркеров статуса. */
export function IconFilled({ name, size = 16, color, style }: Omit<IconProps, 'strokeWidth'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color ?? 'currentColor'}
      stroke="none"
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden
      focusable="false"
    >
      {P[name]}
    </svg>
  )
}

/** Точка состояния — вместо цветных кружков-эмодзи. */
export function StatusDot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}
