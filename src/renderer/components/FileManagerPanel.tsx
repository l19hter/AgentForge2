import { useState, useEffect, useCallback } from 'react'
import { ps, input, textarea, button, buttonPrimary, notice } from '../theme'
import { GroupLabel } from './PanelChrome'
import { Icon } from '../icons'

interface AgentFile {
  name: string
  path: string
  content: string
}

export default function FileManagerPanel() {
  const [files, setFiles] = useState<AgentFile[]>([])
  const [selected, setSelected] = useState<AgentFile | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    const list = await window.electronAPI.listFiles()
    setFiles(list)
    setSelected((cur) => (cur ? (list.find((f) => f.path === cur.path) ?? null) : null))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = (f: AgentFile) => {
    setSelected(f)
    setContent(f.content)
    setDirty(false)
  }

  const save = async () => {
    if (!selected) return
    const ok = await window.electronAPI.writeFile(selected.path, content)
    setMessage({
      kind: ok ? 'ok' : 'err',
      text: ok ? 'Сохранено — промпт агента обновлён' : 'Не удалось сохранить',
    })
    setDirty(false)
    await load()
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {message && (
        <div style={{ margin: '6px 8px 0' }}>
          <div style={notice(message.kind)}>{message.text}</div>
        </div>
      )}

      <GroupLabel>Файлы .claude</GroupLabel>
      <div style={{ flexShrink: 0, maxHeight: '160px', overflowY: 'auto' }}>
        {files.map((f) => {
          const isSel = selected?.path === f.path
          return (
            <div
              key={f.path}
              onClick={() => open(f)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '11px',
                background: isSel ? ps.accent : 'transparent',
                color: isSel ? '#fff' : ps.text,
              }}
              onMouseOver={(e) => {
                if (!isSel) e.currentTarget.style.background = ps.hover
              }}
              onMouseOut={(e) => {
                if (!isSel) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Icon name="doc" size={13} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
            </div>
          )
        })}
        {files.length === 0 && (
          <div style={{ padding: '10px 8px', color: ps.textFaint, fontSize: '11px' }}>
            Файлов нет
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', padding: '6px 8px' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || !newName.trim()) return
            const created = await window.electronAPI.createFile(newName.trim())
            setNewName('')
            await load()
            if (created) open(created)
          }}
          placeholder="новый-агент.md"
          style={{ ...input, flex: 1 }}
        />
        <button
          onClick={async () => {
            if (!newName.trim()) return
            const created = await window.electronAPI.createFile(newName.trim())
            setNewName('')
            await load()
            if (created) open(created)
          }}
          style={{ ...button, width: '24px', padding: 0 }}
          title="Создать файл"
        >
          <Icon name="plus" size={12} />
        </button>
      </div>

      {selected && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            padding: '0 8px 8px',
            borderTop: `1px solid ${ps.border}`,
            paddingTop: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ flex: 1, fontSize: '10px', color: ps.textDim }}>
              {selected.name}
              {dirty && <span style={{ color: ps.warn }}> · не сохранено</span>}
            </span>
            <button
              onClick={async () => {
                await window.electronAPI.deleteFile(selected.path)
                setSelected(null)
                setContent('')
                await load()
              }}
              title="Удалить файл"
              style={{
                border: 'none',
                background: 'transparent',
                color: ps.textFaint,
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = ps.err)}
              onMouseOut={(e) => (e.currentTarget.style.color = ps.textFaint)}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setDirty(true)
            }}
            style={{ ...textarea, flex: 1, minHeight: '180px' }}
          />
          <button onClick={() => void save()} style={buttonPrimary}>
            <Icon name="save" size={12} />
            Сохранить
          </button>
        </div>
      )}
    </div>
  )
}
