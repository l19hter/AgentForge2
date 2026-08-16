import { useState, useRef, useEffect } from 'react'
import type { Project } from '../types'
import { ps, metrics, fonts } from '../theme'
import { Icon } from '../icons'

interface ProjectTabsProps {
  projects: Project[]
  activeId: string
  /** Сколько сообщений во всех чатах проекта — маленький счётчик на вкладке. */
  counts: Record<string, number>
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onClose: (id: string) => void
}

/**
 * Полоса вкладок проектов — как вкладки документов в Photoshop и как карточки
 * проектов в CRM: каждый проект отделён визуально, переключение мгновенное.
 *
 * Вкладка = проект = папка на диске = свой набор чатов и задач.
 * Двойной щелчок по названию переименовывает проект.
 */
export default function ProjectTabs({
  projects,
  activeId,
  counts,
  onSelect,
  onCreate,
  onRename,
  onClose,
}: ProjectTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.select()
  }, [editingId])

  const commit = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim())
    setEditingId(null)
  }

  return (
    <div
      style={{
        height: metrics.projectTabsH,
        flexShrink: 0,
        background: ps.tabInactive,
        borderBottom: `1px solid ${ps.borderDark}`,
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        overflowY: 'hidden',
        fontFamily: fonts.ui,
        userSelect: 'none',
      }}
    >
      {projects.map((project) => {
        const isActive = project.id === activeId
        const count = counts[project.id] ?? 0
        return (
          <div
            key={project.id}
            onClick={() => !editingId && onSelect(project.id)}
            onDoubleClick={() => {
              setEditingId(project.id)
              setDraft(project.name)
            }}
            title={`${project.name}\nПапка: ${project.slug}\nДвойной щелчок — переименовать`}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '0 8px 0 10px',
              minWidth: '132px',
              maxWidth: '230px',
              borderRight: `1px solid ${ps.borderDark}`,
              background: isActive ? ps.panel : 'transparent',
              color: isActive ? ps.textStrong : ps.textDim,
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseOver={(e) => {
              if (!isActive) e.currentTarget.style.background = '#333'
            }}
            onMouseOut={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent'
            }}
          >
            {/* Цветной корешок — как метка проекта в CRM */}
            <span
              style={{
                width: '3px',
                height: '13px',
                borderRadius: '1px',
                background: project.color,
                flexShrink: 0,
                opacity: isActive ? 1 : 0.55,
              }}
            />

            {editingId === project.id ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: '18px',
                  border: `1px solid ${ps.accent}`,
                  borderRadius: '2px',
                  background: ps.sunken,
                  color: ps.textStrong,
                  fontSize: '11px',
                  fontFamily: fonts.ui,
                  padding: '0 4px',
                }}
              />
            ) : (
              <>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '11px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.name}
                </span>
                {count > 0 && (
                  <span
                    style={{
                      fontSize: '9px',
                      color: isActive ? ps.textFaint : ps.textDisabled,
                      background: ps.sunken,
                      borderRadius: '7px',
                      padding: '1px 5px',
                      flexShrink: 0,
                    }}
                    title={`Сообщений в проекте: ${count}`}
                  >
                    {count}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(project.id)
                  }}
                  title="Убрать проект из списка (папка останется на диске)"
                  style={{
                    width: '15px',
                    height: '15px',
                    border: 'none',
                    borderRadius: '2px',
                    background: 'transparent',
                    color: ps.textFaint,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = ps.err
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = ps.textFaint
                  }}
                >
                  <Icon name="close" size={9} />
                </button>
              </>
            )}

            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: '2px',
                  background: project.color,
                }}
              />
            )}
          </div>
        )
      })}

      <button
        onClick={onCreate}
        title="Новый проект"
        style={{
          width: '30px',
          border: 'none',
          borderRight: `1px solid ${ps.borderDark}`,
          background: 'transparent',
          color: ps.textDim,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Icon name="plus" size={13} />
      </button>

      <div style={{ flex: 1 }} />
    </div>
  )
}
