import type { CSSProperties } from 'react'

/**
 * Палитра и примитивы в духе тёмной темы Adobe Photoshop.
 *
 * Принципы, которым следует весь интерфейс:
 *  - плотная сетка: базовый кегль 11px, высота строки 18-22px;
 *  - разделители в один пиксель, без скруглений у панелей;
 *  - цвет несёт смысл только в акценте и статусах, всё остальное — серое;
 *  - никаких эмодзи, только штриховые иконки (см. icons.tsx).
 */

export const ps = {
  // Поверхности
  appBg: '#1e1e1e', // фон вокруг «холста»
  canvas: '#1e1e1e', // сам холст (чат)
  panel: '#323232', // тело панелей
  panelHeader: '#383838', // шапки панелей и вкладки
  tabInactive: '#2b2b2b',
  rail: '#2d2d2d', // вертикальные рейки инструментов
  menuBar: '#323232',
  menuPopup: '#3c3c3c',
  hover: '#4a4a4a',
  active: '#4f4f4f',
  sunken: '#1b1b1b', // поля ввода

  // Границы
  borderDark: '#161616',
  border: '#252525',
  borderLight: '#4a4a4a',
  borderInput: '#5c5c5c',

  // Текст
  text: '#c8c8c8',
  textStrong: '#e8e8e8',
  textDim: '#8f8f8f',
  textFaint: '#6b6b6b',
  textDisabled: '#565656',

  // Акцент (синий Adobe)
  accent: '#1473e6',
  accentHover: '#2680eb',
  accentDim: '#1b4f8f',

  // Статусы
  ok: '#3ba55d',
  warn: '#d99a2b',
  err: '#d64545',
  info: '#5a9fd4',
} as const

export const metrics = {
  titleBarH: 30,
  projectTabsH: 26,
  optionsBarH: 34,
  statusBarH: 22,
  railW: 34,
  panelHeaderH: 24,
  tabH: 24,
  leftPanelW: 252,
  rightPanelW: 306,
} as const

/**
 * Перетаскивание окна: рамка своя, поэтому область захвата назначаем сами.
 * WebkitAppRegion нет в типах CSSProperties — отсюда приведение.
 */
export const dragRegion = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
export const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

export const fonts = {
  ui: "'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "'Cascadia Mono', Consolas, 'Courier New', monospace",
} as const

// --- Примитивы ---------------------------------------------------------------

export const label: CSSProperties = {
  fontSize: '11px',
  color: ps.textDim,
  userSelect: 'none',
}

export const fieldLabel: CSSProperties = {
  fontSize: '11px',
  color: ps.textDim,
  marginBottom: '4px',
  display: 'block',
}

export const input: CSSProperties = {
  width: '100%',
  height: '22px',
  padding: '0 6px',
  border: `1px solid ${ps.borderInput}`,
  borderRadius: '2px',
  background: ps.sunken,
  color: ps.textStrong,
  fontSize: '11px',
  fontFamily: fonts.ui,
}

export const select: CSSProperties = {
  ...input,
  padding: '0 4px',
  cursor: 'pointer',
}

export const textarea: CSSProperties = {
  width: '100%',
  padding: '5px 6px',
  border: `1px solid ${ps.borderInput}`,
  borderRadius: '2px',
  background: ps.sunken,
  color: ps.text,
  fontSize: '11px',
  fontFamily: fonts.mono,
  lineHeight: 1.5,
  resize: 'vertical',
}

/** Кнопка Photoshop: слегка выпуклая, прямоугольная, с тонкой рамкой. */
export const button: CSSProperties = {
  height: '22px',
  padding: '0 10px',
  border: `1px solid ${ps.borderLight}`,
  borderRadius: '2px',
  background: '#454545',
  color: ps.text,
  fontSize: '11px',
  fontFamily: fonts.ui,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
}

export const buttonPrimary: CSSProperties = {
  ...button,
  background: ps.accent,
  borderColor: ps.accent,
  color: '#fff',
}

export const buttonGhost: CSSProperties = {
  ...button,
  background: 'transparent',
  borderColor: 'transparent',
  color: ps.textDim,
}

export const buttonDisabled: CSSProperties = {
  ...button,
  background: '#3a3a3a',
  borderColor: '#3f3f3f',
  color: ps.textDisabled,
  cursor: 'default',
}

/** Утопленная область — списки, дерево слоёв, лог. */
export const well: CSSProperties = {
  background: '#2b2b2b',
  border: `1px solid ${ps.borderDark}`,
  borderRadius: '2px',
}

export const divider: CSSProperties = {
  height: '1px',
  background: ps.borderDark,
  margin: '8px 0',
}

export function statusColor(kind: 'ok' | 'err' | 'warn' | 'info'): string {
  return { ok: ps.ok, err: ps.err, warn: ps.warn, info: ps.info }[kind]
}

export function notice(kind: 'ok' | 'err' | 'warn' | 'info'): CSSProperties {
  const c = statusColor(kind)
  return {
    fontSize: '11px',
    padding: '5px 7px',
    borderRadius: '2px',
    background: '#2b2b2b',
    borderLeft: `2px solid ${c}`,
    color: kind === 'ok' ? ps.text : c,
    wordBreak: 'break-word',
    lineHeight: 1.45,
  }
}
