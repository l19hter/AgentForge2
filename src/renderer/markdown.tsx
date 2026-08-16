import { useState, type ReactNode } from 'react'
import { ps, fonts } from './theme'
import { Icon } from './icons'
import { FENCE_OPEN } from '../shared/code-blocks'

/**
 * Разметка Markdown в ответах агентов.
 *
 * Собственный рендерер, а не готовая библиотека, по двум причинам: результат
 * собирается в React-элементы (никакого dangerouslySetInnerHTML, а значит и
 * XSS из ответа модели), и поддерживается ровно то подмножество, которое
 * реально присылают агенты.
 *
 * Поддерживается: ```блоки кода``` с подписью языка и копированием,
 * `код в строке`, **жирный**, *курсив*, ***жирный курсив***, ~~зачёркнутый~~,
 * заголовки, списки (в том числе нумерованные и вложенные), цитаты,
 * горизонтальные линии, таблицы, ссылки.
 */

// ---------------------------------------------------------------------------
// Строчная разметка
// ---------------------------------------------------------------------------

const INLINE_SOURCE = [
  '`([^`\\n]+)`', // 1: код
  '\\*\\*\\*([^*]+?)\\*\\*\\*', // 2: жирный курсив
  '\\*\\*([^*]+?)\\*\\*', // 3: жирный
  '__([^_]+?)__', // 4: жирный
  '~~([^~]+?)~~', // 5: зачёркнутый
  '\\*([^*\\n]+?)\\*', // 6: курсив
  '\\[([^\\]]*)\\]\\(([^)\\s]+)\\)', // 7,8: ссылка
].join('|')

function InlineCode({ children }: { children: string }) {
  return (
    <code
      style={{
        fontFamily: fonts.mono,
        fontSize: '11px',
        background: '#252525',
        border: `1px solid ${ps.border}`,
        borderRadius: '2px',
        padding: '0 4px',
        color: '#d7a9a9',
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </code>
  )
}

/**
 * Разбирает строку в React-узлы. Вложенность обрабатывается рекурсией.
 *
 * Регулярное выражение создаётся на каждый вызов намеренно: у общего объекта
 * с флагом `g` есть изменяемое поле lastIndex, и вложенный вызов сбивал бы
 * позицию внешнего цикла — разбор зацикливался и подвешивал весь интерфейс.
 */
export function inline(text: string, keyPrefix = 'i'): ReactNode[] {
  const re = new RegExp(INLINE_SOURCE, 'g')
  const out: ReactNode[] = []
  let last = 0
  let n = 0

  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyPrefix}-${n++}`

    if (m[1] !== undefined) {
      out.push(<InlineCode key={key}>{m[1]}</InlineCode>)
    } else if (m[2] !== undefined) {
      out.push(
        <strong key={key} style={{ fontStyle: 'italic', color: ps.textStrong }}>
          {inline(m[2], key)}
        </strong>
      )
    } else if (m[3] !== undefined || m[4] !== undefined) {
      out.push(
        <strong key={key} style={{ color: ps.textStrong, fontWeight: 600 }}>
          {inline((m[3] ?? m[4]) as string, key)}
        </strong>
      )
    } else if (m[5] !== undefined) {
      out.push(
        <span key={key} style={{ textDecoration: 'line-through', color: ps.textDim }}>
          {inline(m[5], key)}
        </span>
      )
    } else if (m[6] !== undefined) {
      out.push(
        <em key={key} style={{ fontStyle: 'italic' }}>
          {inline(m[6], key)}
        </em>
      )
    } else if (m[7] !== undefined) {
      const href = m[8] as string
      out.push(
        <a
          key={key}
          href={href}
          onClick={(e) => {
            e.preventDefault()
            // Ссылки открываются в системном браузере: окно приложения
            // не должно уходить на внешний сайт.
            if (/^https?:\/\//.test(href)) window.open(href, '_blank')
          }}
          style={{ color: ps.info, textDecoration: 'underline', cursor: 'pointer' }}
          title={href}
        >
          {m[7] || href}
        </a>
      )
    }
    last = m.index + m[0].length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

// ---------------------------------------------------------------------------
// Блок кода
// ---------------------------------------------------------------------------

export function CodeBlock({ code, lang, path }: { code: string; lang?: string; path?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await window.electronAPI.copyText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div style={{ margin: '8px 0', border: `1px solid ${ps.borderDark}`, borderRadius: '2px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          height: '20px',
          padding: '0 4px 0 8px',
          background: ps.panelHeader,
          borderBottom: `1px solid ${ps.borderDark}`,
        }}
      >
        {path ? (
          <>
            <Icon name="doc" size={11} color={ps.textDim} />
            <span style={{ fontSize: '10px', color: ps.textStrong, fontFamily: fonts.mono }}>
              {path}
            </span>
          </>
        ) : null}
        <span style={{ flex: 1, fontSize: '10px', color: ps.textFaint, fontFamily: fonts.mono }}>
          {lang || (path ? '' : 'текст')}
        </span>
        {path && (
          <button
            onClick={() => void window.electronAPI.filesReveal(path)}
            title="Открыть расположение файла"
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '16px',
              padding: '0 5px',
              border: 'none',
              borderRadius: '2px',
              background: 'transparent',
              color: ps.textDim,
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="external" size={11} />
          </button>
        )}
        <button
          onClick={() => void copy()}
          title="Скопировать код"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            height: '16px',
            padding: '0 5px',
            border: 'none',
            borderRadius: '2px',
            background: 'transparent',
            color: copied ? ps.ok : ps.textDim,
            fontSize: '10px',
            cursor: 'pointer',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Icon name={copied ? 'check' : 'doc'} size={11} />
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '8px 10px',
          background: '#191919',
          overflowX: 'auto',
          fontFamily: fonts.mono,
          fontSize: '11.5px',
          lineHeight: 1.55,
          color: '#c5d4c5',
          userSelect: 'text',
        }}
      >
        {code}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Блочная разметка
// ---------------------------------------------------------------------------

const HEADING_SIZES = ['15px', '14px', '13px', '12.5px', '12px', '12px']

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isTableDivider(line: string): boolean {
  return /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line)
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  const push = (node: ReactNode) => blocks.push(<div key={`b-${key++}`}>{node}</div>)

  while (i < lines.length) {
    const line = lines[i]

    // Блок кода
    const fence = line.match(FENCE_OPEN)
    if (fence) {
      const lang = fence[1]
      const filePath = fence[2]
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) body.push(lines[i++])
      i++ // закрывающая ограда
      push(<CodeBlock code={body.join('\n')} lang={lang} path={filePath} />)
      continue
    }

    // Пустая строка
    if (!line.trim()) {
      i++
      continue
    }

    // Горизонтальная линия
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      push(<div style={{ height: '1px', background: ps.borderLight, margin: '10px 0' }} />)
      i++
      continue
    }

    // Заголовок
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      push(
        <div
          style={{
            fontSize: HEADING_SIZES[level - 1],
            fontWeight: 600,
            color: ps.textStrong,
            margin: level <= 2 ? '12px 0 5px' : '9px 0 4px',
            borderBottom: level === 1 ? `1px solid ${ps.border}` : undefined,
            paddingBottom: level === 1 ? '3px' : undefined,
          }}
        >
          {inline(heading[2], `h${key}`)}
        </div>
      )
      i++
      continue
    }

    // Таблица
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]))

      push(
        <div style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '11.5px', minWidth: '100%' }}>
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    style={{
                      textAlign: 'left',
                      padding: '4px 8px',
                      background: ps.panelHeader,
                      border: `1px solid ${ps.borderDark}`,
                      color: ps.textStrong,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inline(h, `th${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '4px 8px',
                        border: `1px solid ${ps.border}`,
                        verticalAlign: 'top',
                      }}
                    >
                      {inline(r[ci] ?? '', `td${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Цитата
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      push(
        <div
          style={{
            borderLeft: `2px solid ${ps.borderLight}`,
            padding: '2px 0 2px 10px',
            margin: '6px 0',
            color: ps.textDim,
          }}
        >
          {inline(body.join('\n'), `q${key}`)}
        </div>
      )
      continue
    }

    // Список
    const bullet = /^(\s*)([-*+])\s+(.*)$/
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = !bullet.test(line) && numbered.test(line)
      const items: { indent: number; text: string; marker: string }[] = []

      while (i < lines.length) {
        const m = lines[i].match(bullet) ?? lines[i].match(numbered)
        if (!m) {
          // Перенос длинного пункта на следующую строку — приклеиваем к нему.
          if (items.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1].text += `\n${lines[i].trim()}`
            i++
            continue
          }
          break
        }
        items.push({
          indent: Math.floor(m[1].length / 2),
          text: m[3],
          marker: /^\d/.test(m[2]) ? `${m[2]}.` : '•',
        })
        i++
      }

      push(
        <div style={{ margin: '5px 0' }}>
          {items.map((it, ii) => (
            <div
              key={ii}
              style={{
                display: 'flex',
                gap: '7px',
                padding: '1px 0',
                paddingLeft: `${it.indent * 16}px`,
              }}
            >
              <span
                style={{
                  color: ps.textFaint,
                  flexShrink: 0,
                  minWidth: ordered ? '16px' : '8px',
                  textAlign: 'right',
                }}
              >
                {it.marker}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{inline(it.text, `li${ii}`)}</span>
            </div>
          ))}
        </div>
      )
      continue
    }

    // Абзац: собираем до пустой строки или начала другого блока
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s{0,3}#{1,6}\s/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i++])
    }
    // Защита от зацикливания, если ни одна ветка строку не забрала.
    if (para.length === 0) {
      para.push(lines[i++])
    }
    push(
      <div style={{ margin: '4px 0', lineHeight: 1.62, whiteSpace: 'pre-wrap' }}>
        {inline(para.join('\n'), `p${key}`)}
      </div>
    )
  }

  return <>{blocks}</>
}
