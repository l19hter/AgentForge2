import { useState } from 'react'
import type { ExportResult } from '../types'
import { ps, fonts, input, button, buttonPrimary, notice, well } from '../theme'
import { GroupLabel, Row } from './PanelChrome'
import { Icon, type IconName } from '../icons'

type Platform = 'railway' | 'vercel' | 'docker'

const PLATFORMS: { id: Platform; label: string; icon: IconName }[] = [
  { id: 'docker', label: 'Docker', icon: 'server' },
  { id: 'railway', label: 'Railway', icon: 'deploy' },
  { id: 'vercel', label: 'Vercel', icon: 'external' },
]

export default function DeployPanel() {
  const [platform, setPlatform] = useState<Platform>('docker')
  const [frontendDir, setFrontendDir] = useState('frontend')
  const [backendDir, setBackendDir] = useState('backend')
  const [result, setResult] = useState<{ success: boolean; files: string[]; message: string } | null>(
    null
  )
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div>
      <GroupLabel>Платформа</GroupLabel>
      <div style={{ display: 'flex', gap: '4px', padding: '0 8px' }}>
        {PLATFORMS.map((p) => {
          const active = platform === p.id
          return (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              style={{
                flex: 1,
                height: '46px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                border: `1px solid ${active ? ps.accent : ps.borderLight}`,
                borderRadius: '2px',
                background: active ? ps.accentDim : '#454545',
                color: active ? '#fff' : ps.textDim,
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              <Icon name={p.icon} size={16} />
              {p.label}
            </button>
          )
        })}
      </div>

      <GroupLabel>Директории</GroupLabel>
      <Row label="Frontend">
        <input
          value={frontendDir}
          onChange={(e) => setFrontendDir(e.target.value)}
          style={{ ...input, fontFamily: fonts.mono }}
        />
      </Row>
      <Row label="Backend">
        <input
          value={backendDir}
          onChange={(e) => setBackendDir(e.target.value)}
          style={{ ...input, fontFamily: fonts.mono }}
        />
      </Row>

      <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button
          onClick={async () => {
            setBusy(true)
            setResult(null)
            try {
              setResult(
                await window.electronAPI.deployPrepare({ platform, frontendDir, backendDir })
              )
            } finally {
              setBusy(false)
            }
          }}
          disabled={busy}
          style={busy ? { ...buttonPrimary, opacity: 0.6, cursor: 'wait' } : buttonPrimary}
        >
          <Icon name="deploy" size={12} />
          {busy ? 'Подготовка…' : 'Подготовить конфиги'}
        </button>

        <button
          onClick={async () => {
            setBusy(true)
            try {
              const res = await window.electronAPI.deployExport()
              setExported(res.status === 'cancelled' ? null : res)
            } finally {
              setBusy(false)
            }
          }}
          disabled={busy}
          style={button}
        >
          <Icon name="save" size={12} />
          Экспорт в ZIP
        </button>
      </div>

      {result && (
        <div style={{ padding: '0 8px 8px' }}>
          <div style={notice(result.success ? 'ok' : 'err')}>
            {result.message}
            {result.files.length > 0 && (
              <div style={{ ...well, marginTop: '6px', padding: '5px 6px' }}>
                {result.files.map((f) => (
                  <div
                    key={f}
                    style={{ fontFamily: fonts.mono, fontSize: '10px', color: ps.textDim }}
                  >
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {exported && (
        <div style={{ padding: '0 8px 8px' }}>
          <div style={notice(exported.status === 'ok' ? 'ok' : 'err')}>
            {exported.status === 'ok'
              ? `Сохранено: ${exported.path} (файлов: ${exported.count ?? 0})`
              : exported.message || 'Не удалось собрать архив'}
            {exported.status === 'ok' && exported.message && (
              <div style={{ marginTop: '4px', color: ps.textDim }}>{exported.message}</div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '0 8px 10px' }}>
        <button
          onClick={() => void window.electronAPI.revealWorkspace('deploy')}
          style={{ ...button, background: 'transparent', borderColor: 'transparent', padding: 0 }}
        >
          <Icon name="external" size={12} />
          Открыть папку deploy
        </button>
      </div>

      <div style={{ padding: '0 8px 10px', color: ps.textDisabled, fontSize: '10px', lineHeight: 1.6 }}>
        Пароль базы в docker-compose.yml задаётся переменными окружения
        POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB. Значения по умолчанию годятся
        только для локального запуска.
      </div>
    </div>
  )
}
