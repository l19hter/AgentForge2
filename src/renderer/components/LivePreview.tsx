import { useState, useEffect, useRef } from 'react'
import { ps, fonts, input, button, buttonPrimary, notice, well } from '../theme'
import { Icon, IconFilled } from '../icons'

export default function LivePreview() {
  const [url, setUrl] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Конвейер кладёт проект в корень папки, а не в frontend/ — это раскладка
  // из старых шаблонов. Поле остаётся редактируемым для таких проектов.
  const [projectPath, setProjectPath] = useState('.')
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const check = async () => {
      const res = await window.electronAPI.previewGetUrl()
      setUrl(res.url)
      setIsRunning(Boolean(res.url))
      if (showLogs) setLogs((await window.electronAPI.previewGetLogs()).logs)
    }
    void check()
    const t = setInterval(() => void check(), 4000)
    return () => clearInterval(t)
  }, [showLogs])

  const start = async () => {
    setError(null)
    setStarting(true)
    try {
      const res = await window.electronAPI.previewStart(projectPath)
      if (res.success && res.url) {
        setUrl(res.url)
        setIsRunning(true)
      } else {
        setError(res.error || 'Не удалось запустить dev-сервер')
        setLogs((await window.electronAPI.previewGetLogs()).logs)
        setShowLogs(true)
      }
    } finally {
      setStarting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: '4px', padding: '8px' }}>
        <input
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="папка с package.json — «.» это корень проекта"
          disabled={isRunning}
          style={{ ...input, flex: 1, fontFamily: fonts.mono, opacity: isRunning ? 0.55 : 1 }}
        />
        {!isRunning ? (
          <button
            onClick={() => void start()}
            disabled={starting}
            style={starting ? { ...button, opacity: 0.6, cursor: 'wait' } : buttonPrimary}
          >
            <Icon name="play" size={11} />
            {starting ? 'Запуск…' : 'Старт'}
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                if (iframeRef.current && url) iframeRef.current.src = `${url}?t=${Date.now()}`
              }}
              style={{ ...button, width: '24px', padding: 0 }}
              title="Перезагрузить"
            >
              <Icon name="refresh" size={12} />
            </button>
            <button
              onClick={async () => {
                await window.electronAPI.previewStop()
                setUrl(null)
                setIsRunning(false)
              }}
              style={{ ...button, color: ps.err }}
            >
              <IconFilled name="stop" size={10} />
              Стоп
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{ margin: '0 8px 8px' }}>
          <div style={notice('err')}>{error}</div>
        </div>
      )}

      {isRunning && url ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 8px 6px',
              fontSize: '10px',
            }}
          >
            <span style={{ color: ps.ok, display: 'flex' }}>
              <Icon name="link" size={12} />
            </span>
            <span style={{ color: ps.textDim, flex: 1, fontFamily: fonts.mono }}>{url}</span>
            <button
              onClick={() => setShowLogs((v) => !v)}
              style={{
                border: 'none',
                background: 'transparent',
                color: ps.textFaint,
                fontSize: '10px',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showLogs ? 'скрыть лог' : 'лог'}
            </button>
          </div>
          <iframe
            ref={iframeRef}
            src={url}
            title="Live Preview"
            style={{
              flex: 1,
              margin: '0 8px',
              border: `1px solid ${ps.borderDark}`,
              background: '#fff',
              minHeight: '220px',
            }}
          />
        </>
      ) : (
        !error && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              color: ps.textFaint,
              padding: '0 16px',
              textAlign: 'center',
            }}
          >
            <Icon name="eye" size={32} strokeWidth={0.9} />
            <div style={{ fontSize: '11px', lineHeight: 1.6 }}>
              Запускает <span style={{ color: ps.textDim }}>npm run dev</span> в указанной папке
              и показывает результат здесь
            </div>
          </div>
        )
      )}

      {showLogs && (
        <pre
          style={{
            ...well,
            margin: '8px',
            maxHeight: '150px',
            overflow: 'auto',
            padding: '6px 8px',
            fontSize: '10px',
            fontFamily: fonts.mono,
            color: ps.textDim,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
          }}
        >
          {logs.length ? logs.join('\n') : 'Лог пуст'}
        </pre>
      )}
    </div>
  )
}
