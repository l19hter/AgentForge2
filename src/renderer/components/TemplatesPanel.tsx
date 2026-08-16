import type { TemplateInfo } from '../types'
import { templateIcon } from '../types'
import { ps } from '../theme'
import { Icon } from '../icons'

interface TemplatesPanelProps {
  templates: TemplateInfo[]
  onCreate: (id: string) => void
}

export default function TemplatesPanel({ templates, onCreate }: TemplatesPanelProps) {
  return (
    <div style={{ padding: '2px 0' }}>
      {templates.map((t) => (
        <div
          key={t.id}
          onClick={() => onCreate(t.id)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '9px',
            padding: '8px',
            cursor: 'pointer',
            borderBottom: `1px solid ${ps.border}`,
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ color: ps.textDim, marginTop: '1px' }}>
            <Icon name={templateIcon(t.id)} size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: ps.textStrong }}>{t.name}</div>
            <div style={{ fontSize: '10px', color: ps.textFaint, marginTop: '1px' }}>
              {t.description}
            </div>
          </div>
        </div>
      ))}

      <div style={{ padding: '10px 8px', color: ps.textFaint, fontSize: '10px', lineHeight: 1.6 }}>
        Шаблон создаёт папки frontend/ и backend/ в рабочей папке. После создания
        выполните в них <span style={{ color: ps.textDim }}>npm install</span> — приложение чужие
        зависимости не ставит.
      </div>
    </div>
  )
}
