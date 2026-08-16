import { useState, useEffect, useCallback } from 'react'
import type { ProjectContext } from '../types'
import { ps, fonts, input, select, textarea, button, buttonPrimary, well } from '../theme'
import { GroupLabel, Row } from './PanelChrome'
import { Icon } from '../icons'

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span style={{ fontSize: '10px', color: ps.textDisabled }}>пусто</span>
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
      {items.map((s) => (
        <span
          key={s}
          style={{
            padding: '1px 6px',
            border: `1px solid ${ps.borderLight}`,
            borderRadius: '2px',
            background: '#3d3d3d',
            color: ps.text,
            fontSize: '10px',
          }}
        >
          {s}
        </span>
      ))}
    </div>
  )
}

export default function ProjectMemoryPanel() {
  const [memory, setMemory] = useState<ProjectContext | null>(null)
  const [name, setName] = useState('')
  const [newStack, setNewStack] = useState('')
  const [newComponent, setNewComponent] = useState('')
  const [endpoint, setEndpoint] = useState({ method: 'GET', path: '' })
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    const m = await window.electronAPI.getProjectMemory()
    setMemory(m)
    setName(m.name)
    setNotes(m.notes)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!memory) {
    return <div style={{ padding: '18px', textAlign: 'center', color: ps.textFaint }}>Загрузка…</div>
  }

  const addBtn = (onClick: () => void) => (
    <button onClick={onClick} style={{ ...button, width: '24px', padding: 0 }} title="Добавить">
      <Icon name="plus" size={12} />
    </button>
  )

  return (
    <div>
      <GroupLabel>Проект</GroupLabel>
      <Row label="Название">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            await window.electronAPI.updateProjectMemory({ name: name.trim() || 'Untitled Project' })
            await load()
          }}
          style={input}
        />
      </Row>

      <GroupLabel>Стек</GroupLabel>
      <div style={{ padding: '0 8px 4px' }}>
        <Chips items={memory.stack} />
      </div>
      <Row label="Добавить">
        <input
          value={newStack}
          onChange={(e) => setNewStack(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || !newStack.trim()) return
            await window.electronAPI.addStack(newStack.trim())
            setNewStack('')
            await load()
          }}
          placeholder="React, FastAPI…"
          style={input}
        />
        {addBtn(async () => {
          if (!newStack.trim()) return
          await window.electronAPI.addStack(newStack.trim())
          setNewStack('')
          await load()
        })}
      </Row>

      <GroupLabel>Компоненты</GroupLabel>
      <div style={{ padding: '0 8px 4px' }}>
        <Chips items={memory.components} />
      </div>
      <Row label="Добавить">
        <input
          value={newComponent}
          onChange={(e) => setNewComponent(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || !newComponent.trim()) return
            await window.electronAPI.addComponent(newComponent.trim())
            setNewComponent('')
            await load()
          }}
          placeholder="Header, LoginForm…"
          style={input}
        />
        {addBtn(async () => {
          if (!newComponent.trim()) return
          await window.electronAPI.addComponent(newComponent.trim())
          setNewComponent('')
          await load()
        })}
      </Row>

      <GroupLabel>Endpoint&apos;ы</GroupLabel>
      <div style={{ padding: '0 8px 4px' }}>
        {memory.endpoints.length === 0 ? (
          <span style={{ fontSize: '10px', color: ps.textDisabled }}>пусто</span>
        ) : (
          <div style={{ ...well, padding: '4px 6px' }}>
            {memory.endpoints.map((e, i) => (
              <div
                key={`${e.method}-${e.path}-${i}`}
                style={{ fontSize: '10px', fontFamily: fonts.mono, color: ps.textDim }}
              >
                <span style={{ color: ps.info }}>{e.method}</span> {e.path}
              </div>
            ))}
          </div>
        )}
      </div>
      <Row label="Добавить">
        <select
          value={endpoint.method}
          onChange={(e) => setEndpoint({ ...endpoint, method: e.target.value })}
          style={{ ...select, width: '68px', flex: '0 0 auto' }}
        >
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>DELETE</option>
          <option>PATCH</option>
        </select>
        <input
          value={endpoint.path}
          onChange={(e) => setEndpoint({ ...endpoint, path: e.target.value })}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || !endpoint.path.trim()) return
            await window.electronAPI.addEndpoint(endpoint.method, endpoint.path.trim(), '')
            setEndpoint({ method: 'GET', path: '' })
            await load()
          }}
          placeholder="/api/…"
          style={{ ...input, fontFamily: fonts.mono }}
        />
        {addBtn(async () => {
          if (!endpoint.path.trim()) return
          await window.electronAPI.addEndpoint(endpoint.method, endpoint.path.trim(), '')
          setEndpoint({ method: 'GET', path: '' })
          await load()
        })}
      </Row>

      <GroupLabel>Заметки</GroupLabel>
      <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Договорённости, ограничения, TODO…"
          style={{ ...textarea, height: '80px', fontFamily: fonts.ui }}
        />
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={async () => {
              await window.electronAPI.updateProjectMemory({ notes })
              await load()
            }}
            style={{ ...buttonPrimary, flex: 1 }}
          >
            <Icon name="save" size={12} />
            Сохранить
          </button>
          <button
            onClick={async () => {
              await window.electronAPI.resetProjectMemory()
              await load()
            }}
            style={{ ...button, color: ps.err }}
            title="Очистить память проекта"
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      <div style={{ padding: '0 8px 10px', color: ps.textDisabled, fontSize: '10px', lineHeight: 1.6 }}>
        Этот контекст автоматически подмешивается в системный промпт каждого агента.
        Пустая память ничего не добавляет.
      </div>
    </div>
  )
}
