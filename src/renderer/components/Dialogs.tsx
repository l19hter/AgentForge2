import { useState, useEffect, type ReactNode } from 'react'
import type { ChatSearchHit, KeyStatus, Project } from '../types'
import { ps, fonts, input, textarea, button, buttonPrimary, well } from '../theme'
import { Icon, StatusDot } from '../icons'

/** Модальное окно в духе диалогов Photoshop: заголовок, тело, кнопки справа снизу. */
export function Modal({
  title,
  onClose,
  width = 520,
  children,
}: {
  title: string
  onClose: () => void
  width?: number
  children: ReactNode
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 400,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: '92vw',
          maxHeight: '82vh',
          background: ps.panel,
          border: `1px solid ${ps.borderLight}`,
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: fonts.ui,
        }}
      >
        <div
          style={{
            height: '26px',
            flexShrink: 0,
            background: ps.panelHeader,
            borderBottom: `1px solid ${ps.borderDark}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 4px 0 10px',
          }}
        >
          <span style={{ flex: 1, fontSize: '11px', color: ps.textStrong }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              width: '20px',
              height: '20px',
              border: 'none',
              background: 'transparent',
              color: ps.textDim,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = ps.err)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
        <div style={{ padding: '12px', overflowY: 'auto', minHeight: 0 }}>{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        style={{ fontSize: '11px', color: ps.textDim, display: 'block', marginBottom: '4px' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

export function NewTaskForm({
  projectName,
  onSubmit,
  onCancel,
}: {
  projectName: string
  onSubmit: (title: string, desc: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '10px', color: ps.textFaint }}>Проект: {projectName}</div>
      <Field label="Название">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && onSubmit(title.trim(), desc.trim())}
          style={input}
        />
      </Field>
      <Field label="Описание">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          style={{ ...textarea, fontFamily: fonts.ui }}
        />
      </Field>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
        <button onClick={onCancel} style={button}>
          Отмена
        </button>
        <button
          onClick={() => title.trim() && onSubmit(title.trim(), desc.trim())}
          style={buttonPrimary}
        >
          Создать
        </button>
      </div>
    </div>
  )
}

export function NewProjectForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Field label="Название проекта">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSubmit(name.trim())}
          placeholder="Интернет-магазин"
          style={input}
        />
      </Field>
      <div style={{ fontSize: '10px', color: ps.textFaint, lineHeight: 1.6 }}>
        Для проекта будет создана отдельная папка внутри рабочей директории.
        У него будут собственные задачи, память и отдельный диалог с каждым агентом.
      </div>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={button}>
          Отмена
        </button>
        <button onClick={() => name.trim() && onSubmit(name.trim())} style={buttonPrimary}>
          Создать проект
        </button>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  text,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  text: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '10px' }}>
        <span style={{ color: danger ? ps.warn : ps.info, marginTop: '1px' }}>
          <Icon name="alert" size={20} strokeWidth={1} />
        </span>
        <div style={{ fontSize: '11px', lineHeight: 1.65, color: ps.text }}>{text}</div>
      </div>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={button}>
          Отмена
        </button>
        <button
          onClick={onConfirm}
          style={danger ? { ...buttonPrimary, background: ps.err, borderColor: ps.err } : buttonPrimary}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

/** Поиск по всем диалогам всех проектов. */
export function HistoryBrowser({
  agentNames,
  onOpen,
}: {
  agentNames: Record<string, string>
  onOpen: (projectId: string, agentId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ChatSearchHit[]>([])
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      setSearched(false)
      return
    }
    // Небольшая задержка, чтобы не искать на каждый символ.
    const t = setTimeout(async () => {
      setHits(await window.electronAPI.searchChats(query.trim()))
      setSearched(true)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '5px', top: '3px', color: ps.textFaint }}>
          <Icon name="search" size={14} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по сообщениям во всех проектах"
          autoFocus
          style={{ ...input, paddingLeft: '24px' }}
        />
      </div>

      <div style={{ ...well, maxHeight: '440px', overflowY: 'auto' }}>
        {!query.trim() && (
          <div style={{ padding: '20px', textAlign: 'center', color: ps.textFaint }}>
            Введите запрос — поиск идёт по переписке всех проектов
          </div>
        )}
        {searched && hits.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: ps.textFaint }}>
            Ничего не найдено
          </div>
        )}
        {hits.map((hit) => (
          <div
            key={`${hit.projectId}-${hit.messageId}`}
            onClick={() => onOpen(hit.projectId, hit.agentId)}
            style={{
              padding: '6px 8px',
              borderBottom: `1px solid ${ps.border}`,
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '10px' }}>
              <span style={{ color: ps.accentHover }}>{hit.projectName}</span>
              <span style={{ color: ps.textDisabled }}>·</span>
              <span style={{ color: ps.textDim }}>{agentNames[hit.agentId] ?? hit.agentId}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: ps.textFaint }}>
                {new Date(hit.timestamp).toLocaleString('ru-RU')}
              </span>
            </div>
            <div
              style={{
                color: ps.text,
                fontSize: '11px',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {hit.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AboutBox({
  workspace,
  projectDir,
  projects,
  keyStatus,
  modelCount,
  liveModels,
}: {
  workspace: string
  projectDir: string
  projects: Project[]
  keyStatus: KeyStatus
  modelCount: number
  liveModels: boolean
}) {
  const line = (label: string, value: ReactNode) => (
    <div style={{ display: 'flex', gap: '10px', padding: '3px 0' }}>
      <span style={{ color: ps.textDim, width: '134px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: ps.text, wordBreak: 'break-all', flex: 1 }}>{value}</span>
    </div>
  )

  return (
    <div style={{ fontSize: '11px' }}>
      <div style={{ fontSize: '15px', color: ps.textStrong, marginBottom: '2px' }}>
        AgentForge Studio
      </div>
      <div style={{ color: ps.textFaint, marginBottom: '12px' }}>
        Версия 1.2 · Electron + React + TypeScript
      </div>

      {line('Провайдеры', 'Anthropic (Claude) · Moonshot (Kimi)')}
      {line(
        'Ключ Anthropic',
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <StatusDot color={keyStatus.claude ? ps.ok : ps.textFaint} />
          {keyStatus.claude ? 'задан' : 'не задан'}
        </span>
      )}
      {line(
        'Ключ Moonshot',
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <StatusDot color={keyStatus.kimi ? ps.ok : ps.textFaint} />
          {keyStatus.kimi ? 'задан' : 'не задан'}
        </span>
      )}
      {line('Хранение ключей', keyStatus.persistent ? 'шифрование ОС' : 'только в памяти')}
      {line(
        'Моделей доступно',
        `${modelCount} ${liveModels ? '(из API провайдеров)' : '(встроенный список)'}`
      )}
      {line('Проектов', projects.length)}
      {line('Папка проекта', projectDir)}
      {line('Рабочая папка', workspace)}
    </div>
  )
}
