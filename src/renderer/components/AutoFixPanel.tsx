import { useState, useEffect, useCallback } from 'react'
import type { Subtask } from '../types'
import { ps, textarea, button, buttonPrimary, notice } from '../theme'
import { Icon } from '../icons'

interface PendingFix {
  taskId: string
  subtask: Subtask
}

export default function AutoFixPanel() {
  const [fixes, setFixes] = useState<PendingFix[]>([])
  const [selected, setSelected] = useState<PendingFix | null>(null)
  const [fixedCode, setFixedCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const loadFixes = useCallback(async () => {
    const res = await window.electronAPI.getPendingFixes()
    setFixes(res)
    setSelected((cur) => (cur && res.some((f) => f.subtask.id === cur.subtask.id) ? cur : null))
  }, [])

  useEffect(() => {
    void loadFixes()
    const t = setInterval(() => void loadFixes(), 10000)
    return () => clearInterval(t)
  }, [loadFixes])

  const resolve = async () => {
    if (!selected) return
    await window.electronAPI.resolveFix(selected.taskId, selected.subtask.id, fixedCode)
    setMessage('Фикс применён')
    setSelected(null)
    setFixedCode('')
    await loadFixes()
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <div style={{ padding: '2px 0' }}>
      {message && (
        <div style={{ margin: '6px 8px' }}>
          <div style={notice('ok')}>{message}</div>
        </div>
      )}

      {fixes.length === 0 && (
        <div style={{ padding: '18px 12px', textAlign: 'center', color: ps.textFaint }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
            <Icon name="bandage" size={30} strokeWidth={0.9} />
          </div>
          <div style={{ fontSize: '11px' }}>Ожидающих фиксов нет</div>
          <div style={{ fontSize: '10px', color: ps.textDisabled, marginTop: '6px', lineHeight: 1.6 }}>
            Фикс создаётся на вкладке «Задачи» — кнопкой с пластырем у подзадачи.
          </div>
        </div>
      )}

      {fixes.map((f) => {
        const isSel = selected?.subtask.id === f.subtask.id
        return (
          <div
            key={f.subtask.id}
            onClick={() => {
              setSelected(f)
              setFixedCode(f.subtask.originalCode || '')
            }}
            style={{
              padding: '7px 8px',
              cursor: 'pointer',
              borderBottom: `1px solid ${ps.border}`,
              borderLeft: `2px solid ${isSel ? ps.accent : ps.warn}`,
              background: isSel ? ps.hover : 'transparent',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: ps.textStrong,
              }}
            >
              <span style={{ color: ps.warn, display: 'flex' }}>
                <Icon name="alert" size={12} />
              </span>
              <span
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {f.subtask.title}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: ps.textFaint, marginTop: '3px', lineHeight: 1.5 }}>
              {f.subtask.errorDescription}
            </div>
            <div style={{ fontSize: '10px', color: ps.textDisabled, marginTop: '2px' }}>
              Исполнитель: {f.subtask.assignee}
            </div>
          </div>
        )
      })}

      {selected && (
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: ps.textDim }}>Исправленный код</span>
          <textarea
            value={fixedCode}
            onChange={(e) => setFixedCode(e.target.value)}
            style={{ ...textarea, height: '170px' }}
          />
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => void resolve()} style={{ ...buttonPrimary, flex: 1 }}>
              <Icon name="check" size={12} />
              Применить фикс
            </button>
            <button onClick={() => setSelected(null)} style={button}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
