import { useState } from 'react'
import type { Agent, Subtask, TaskTree } from '../types'
import { ps, input, select, button } from '../theme'
import { Icon, StatusDot } from '../icons'

interface TasksPanelProps {
  tasks: TaskTree[]
  agents: Agent[]
  onCreateTask: () => void
  onReload: () => Promise<void>
}

const STATUS_COLOR: Record<Subtask['status'], string> = {
  done: ps.ok,
  in_progress: ps.warn,
  needs_fix: ps.err,
  blocked: '#8a63d2',
  pending: ps.textFaint,
}

const STATUS_LABEL: Record<Subtask['status'], string> = {
  done: 'готово',
  in_progress: 'в работе',
  needs_fix: 'нужен фикс',
  blocked: 'заблокировано',
  pending: 'ожидает',
}

const NEXT_STATUS: Record<Subtask['status'], Subtask['status']> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
  needs_fix: 'in_progress',
  blocked: 'pending',
}

export default function TasksPanel({ tasks, agents, onCreateTask, onReload }: TasksPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [assignee, setAssignee] = useState(agents[0]?.name ?? 'Worker1')

  const addSubtask = async (taskId: string) => {
    if (!subtaskTitle.trim()) return
    await window.electronAPI.addSubtask(taskId, {
      id: `st-${Date.now()}`,
      title: subtaskTitle.trim(),
      description: '',
      assignee,
      status: 'pending',
      parentId: taskId,
    })
    setSubtaskTitle('')
    await onReload()
  }

  if (tasks.length === 0) {
    return (
      <div style={{ padding: '18px 12px', textAlign: 'center', color: ps.textFaint }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          <Icon name="tree" size={30} strokeWidth={0.9} />
        </div>
        <div style={{ fontSize: '11px', marginBottom: '10px' }}>Задач нет</div>
        <button onClick={onCreateTask} style={button}>
          <Icon name="plus" size={12} />
          Создать задачу
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '2px 0' }}>
      {tasks.map((task) => {
        const isOpen = expanded === task.id
        const done = task.subtasks.filter((s) => s.status === 'done').length
        return (
          <div key={task.id} style={{ borderBottom: `1px solid ${ps.border}` }}>
            <div
              onClick={() => setExpanded(isOpen ? null : task.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 8px',
                cursor: 'pointer',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: ps.textFaint }}>
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: '11px',
                  color: ps.textStrong,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {task.title}
              </span>
              {task.subtasks.length > 0 && (
                <span style={{ fontSize: '10px', color: ps.textFaint }}>
                  {done}/{task.subtasks.length}
                </span>
              )}
            </div>

            {task.subtasks.map((st) => (
              <div
                key={st.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px 3px 24px',
                  fontSize: '11px',
                  color: ps.textDim,
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  onClick={async () => {
                    await window.electronAPI.updateSubtask(task.id, st.id, {
                      status: NEXT_STATUS[st.status],
                    })
                    await onReload()
                  }}
                  title={`${STATUS_LABEL[st.status]} — щёлкните, чтобы сменить`}
                  style={{ cursor: 'pointer', display: 'flex' }}
                >
                  <StatusDot color={STATUS_COLOR[st.status]} size={7} />
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: st.status === 'done' ? 'line-through' : 'none',
                    opacity: st.status === 'done' ? 0.6 : 1,
                  }}
                  title={`${st.title} · ${st.assignee}`}
                >
                  {st.title}
                </span>
                {!st.autoFix && (
                  <button
                    onClick={async () => {
                      await window.electronAPI.createAutoFix(
                        task.id,
                        `Нужна доработка: ${st.title}`,
                        st.originalCode ?? '',
                        st.assignee
                      )
                      await onReload()
                    }}
                    title="Отправить в Auto-Fix"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: ps.textFaint,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = ps.warn)}
                    onMouseOut={(e) => (e.currentTarget.style.color = ps.textFaint)}
                  >
                    <Icon name="bandage" size={12} />
                  </button>
                )}
              </div>
            ))}

            {isOpen && (
              <div
                style={{
                  padding: '6px 8px 8px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                }}
              >
                {task.description && (
                  <div style={{ fontSize: '10px', color: ps.textFaint, lineHeight: 1.5 }}>
                    {task.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void addSubtask(task.id)}
                    placeholder="Новая подзадача"
                    style={{ ...input, flex: 1 }}
                  />
                  <button
                    onClick={() => void addSubtask(task.id)}
                    style={{ ...button, width: '24px', padding: 0 }}
                    title="Добавить"
                  >
                    <Icon name="plus" size={12} />
                  </button>
                </div>
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  style={select}
                  title="Исполнитель новой подзадачи"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name} — {a.role}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    await window.electronAPI.deleteTask(task.id)
                    await onReload()
                  }}
                  style={{
                    ...button,
                    color: ps.err,
                    alignSelf: 'flex-start',
                    background: 'transparent',
                    borderColor: 'transparent',
                    padding: '0 2px',
                  }}
                >
                  <Icon name="trash" size={12} />
                  Удалить задачу
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
