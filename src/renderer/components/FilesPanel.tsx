import { useState, useEffect, useCallback, useRef } from 'react'
import type { FileEntry } from '../types'
import { ps, fonts, input, textarea, button, buttonPrimary, notice, well } from '../theme'
import { Icon, type IconName } from '../icons'

interface SearchResult {
  file: string
  line: number
  text: string
}

type Tab = 'files' | 'read' | 'write' | 'search'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'files', label: 'Файлы', icon: 'folder' },
  { id: 'read', label: 'Чтение', icon: 'doc' },
  { id: 'write', label: 'Запись', icon: 'pencil' },
  { id: 'search', label: 'Поиск', icon: 'search' },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/** Панель файлов активного проекта: обзор, добавление, чтение, запись, поиск. */
export default function FilesPanel({
  projectName,
  /** Меняется, когда файлы проекта записал кто-то мимо этой панели — конвейер. */
  externalWrites = 0,
}: {
  projectName: string
  externalWrites?: number
}) {
  const [tab, setTab] = useState<Tab>('files')
  const [dir, setDir] = useState('.')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)

  const [filePath, setFilePath] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [writeContent, setWriteContent] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const notify = (kind: 'ok' | 'err', text: string) => {
    setMessage({ kind, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const reload = useCallback(async (target?: string) => {
    const res = await window.electronAPI.filesList(target ?? '.')
    setEntries(res.entries)
    setDir(res.dir)
    if (res.error) notify('err', res.error)
  }, [])

  // Смена проекта — начинаем с его корня.
  useEffect(() => {
    void reload('.')
    setFilePath('')
    setFileContent('')
    setResults([])
  }, [projectName, reload])

  // Конвейер пишет файлы из main-процесса, панель об этом не знает и показывала
  // бы пустую папку до ручного обновления. Текущую папку и открытый файл не
  // трогаем — перечитываем только список.
  const dirRef = useRef(dir)
  dirRef.current = dir
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    void reload(dirRef.current)
  }, [externalWrites, reload])

  const openEntry = async (entry: FileEntry) => {
    if (entry.isDir) return reload(entry.path)
    const res = await window.electronAPI.mcpReadFile(entry.path)
    if (!res) return notify('err', 'Не текстовый файл, слишком большой или недоступен')
    setFilePath(entry.path)
    setFileContent(res.content)
    setTab('read')
  }

  const goUp = () => {
    const parts = dir.split('/').filter((p) => p && p !== '.')
    parts.pop()
    void reload(parts.length ? parts.join('/') : '.')
  }

  const handleResult = (res: { ok: boolean; message?: string; count?: number }) => {
    if (res.ok) notify('ok', res.message ?? (res.count ? `Добавлено файлов: ${res.count}` : 'Готово'))
    else if (res.message !== 'Отменено') notify('err', res.message ?? 'Не получилось')
    void reload(dir)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    // Electron 32+ убрал File.path — абсолютный путь достаём через webUtils.
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => {
        try {
          return window.electronAPI.pathForFile(f)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
    if (!paths.length) return notify('err', 'Не удалось определить путь перетащенных файлов')
    handleResult(await window.electronAPI.filesAddPaths(dir, paths))
  }

  const crumbs = dir === '.' ? [] : dir.split('/')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${ps.borderDark}`, flexShrink: 0 }}>
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.label}
              style={{
                flex: 1,
                height: '22px',
                border: 'none',
                borderBottom: `2px solid ${active ? ps.accent : 'transparent'}`,
                background: active ? ps.panel : ps.tabInactive,
                color: active ? ps.textStrong : ps.textDim,
                fontSize: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: 0,
              }}
            >
              <Icon name={t.icon} size={12} />
              {t.label}
            </button>
          )
        })}
      </div>

      {message && (
        <div style={{ margin: '6px 8px 0' }}>
          <div style={notice(message.kind)}>{message.text}</div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {tab === 'files' && (
          <>
            {/* Хлебные крошки */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                color: ps.textDim,
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={goUp}
                disabled={dir === '.'}
                style={{
                  ...button,
                  width: '20px',
                  height: '18px',
                  padding: 0,
                  opacity: dir === '.' ? 0.4 : 1,
                }}
                title="На уровень выше"
              >
                <Icon name="chevronLeft" size={11} />
              </button>
              <span
                onClick={() => void reload('.')}
                style={{ cursor: 'pointer', color: ps.info }}
                title="Корень проекта"
              >
                {projectName}
              </span>
              {crumbs.map((c, i) => (
                <span key={i}>
                  <span style={{ color: ps.textDisabled }}> / </span>
                  <span
                    onClick={() => void reload(crumbs.slice(0, i + 1).join('/'))}
                    style={{ cursor: 'pointer', color: i === crumbs.length - 1 ? ps.text : ps.info }}
                  >
                    {c}
                  </span>
                </span>
              ))}
            </div>

            {/* Панель действий */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={async () => handleResult(await window.electronAPI.filesAdd(dir))}
                style={{ ...buttonPrimary, flex: 1 }}
                title="Скопировать файлы с диска в эту папку проекта"
              >
                <Icon name="plus" size={12} />
                Добавить
              </button>
              <button
                onClick={() => setShowNewFolder((v) => !v)}
                style={{ ...button, width: '24px', padding: 0 }}
                title="Новая папка"
              >
                <Icon name="folder" size={12} />
              </button>
              <button
                onClick={() => void reload(dir)}
                style={{ ...button, width: '24px', padding: 0 }}
                title="Обновить"
              >
                <Icon name="refresh" size={12} />
              </button>
              <button
                onClick={() => void window.electronAPI.filesReveal(dir)}
                style={{ ...button, width: '24px', padding: 0 }}
                title="Открыть в проводнике"
              >
                <Icon name="external" size={12} />
              </button>
            </div>

            {showNewFolder && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key !== 'Enter' || !newFolder.trim()) return
                    handleResult(await window.electronAPI.filesMkdir(dir, newFolder.trim()))
                    setNewFolder('')
                    setShowNewFolder(false)
                  }}
                  placeholder="Имя папки"
                  autoFocus
                  style={{ ...input, flex: 1 }}
                />
                <button
                  onClick={async () => {
                    if (!newFolder.trim()) return
                    handleResult(await window.electronAPI.filesMkdir(dir, newFolder.trim()))
                    setNewFolder('')
                    setShowNewFolder(false)
                  }}
                  style={{ ...button, width: '24px', padding: 0 }}
                >
                  <Icon name="check" size={12} />
                </button>
              </div>
            )}

            {/* Список с приёмом перетаскивания */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => void onDrop(e)}
              style={{
                ...well,
                flex: 1,
                overflowY: 'auto',
                border: `1px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? ps.accent : ps.borderDark}`,
                background: dragOver ? '#26313d' : '#2b2b2b',
              }}
            >
              {entries.length === 0 && (
                <div
                  style={{
                    padding: '22px 12px',
                    textAlign: 'center',
                    color: ps.textFaint,
                    fontSize: '11px',
                    lineHeight: 1.6,
                  }}
                >
                  Папка пуста.
                  <br />
                  Перетащите сюда файлы или нажмите «Добавить».
                </div>
              )}

              {entries.map((entry) => (
                <div
                  key={entry.path}
                  onDoubleClick={() => void openEntry(entry)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 7px',
                    fontSize: '11px',
                    color: entry.isDir ? ps.info : ps.text,
                    borderBottom: `1px solid ${ps.border}`,
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Icon name={entry.isDir ? 'folder' : 'doc'} size={12} />

                  {renaming === entry.path ? (
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Escape') setRenaming(null)
                        if (e.key !== 'Enter' || !renameDraft.trim()) return
                        handleResult(
                          await window.electronAPI.filesRename(entry.path, renameDraft.trim())
                        )
                        setRenaming(null)
                      }}
                      autoFocus
                      style={{ ...input, flex: 1, height: '18px' }}
                    />
                  ) : (
                    <>
                      <span
                        onClick={() => void openEntry(entry)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: entry.isDir ? fonts.ui : fonts.mono,
                        }}
                        title={entry.path}
                      >
                        {entry.name}
                      </span>
                      {!entry.isDir && (
                        <span style={{ fontSize: '9px', color: ps.textDisabled, flexShrink: 0 }}>
                          {formatSize(entry.size)}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenaming(entry.path)
                          setRenameDraft(entry.name)
                        }}
                        title="Переименовать"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: ps.textFaint,
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          flexShrink: 0,
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.color = ps.text)}
                        onMouseOut={(e) => (e.currentTarget.style.color = ps.textFaint)}
                      >
                        <Icon name="pencil" size={11} />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          handleResult(await window.electronAPI.filesRemove(entry.path))
                        }}
                        title="Удалить"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: ps.textFaint,
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          flexShrink: 0,
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.color = ps.err)}
                        onMouseOut={(e) => (e.currentTarget.style.color = ps.textFaint)}
                      >
                        <Icon name="trash" size={11} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'read' && (
          <>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !filePath.trim()) return
                  const res = await window.electronAPI.mcpReadFile(filePath.trim())
                  if (res) setFileContent(res.content)
                  else notify('err', 'Файл не найден или не текстовый')
                }}
                placeholder="frontend/src/App.tsx"
                style={{ ...input, flex: 1, fontFamily: fonts.mono }}
              />
              <button
                onClick={async () => {
                  if (!filePath.trim()) return
                  const res = await window.electronAPI.mcpReadFile(filePath.trim())
                  if (res) setFileContent(res.content)
                  else notify('err', 'Файл не найден или не текстовый')
                }}
                style={button}
              >
                Открыть
              </button>
            </div>
            <textarea value={fileContent} readOnly style={{ ...textarea, flex: 1 }} />
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => {
                  setWriteContent(fileContent)
                  setTab('write')
                }}
                disabled={!fileContent}
                style={fileContent ? { ...button, flex: 1 } : { ...button, flex: 1, opacity: 0.5 }}
              >
                <Icon name="pencil" size={12} />
                Править
              </button>
              <button
                onClick={() => void window.electronAPI.copyText(fileContent)}
                disabled={!fileContent}
                style={fileContent ? button : { ...button, opacity: 0.5 }}
                title="Скопировать содержимое"
              >
                <Icon name="doc" size={12} />
              </button>
            </div>
          </>
        )}

        {tab === 'write' && (
          <>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="frontend/src/NewFile.tsx"
              style={{ ...input, fontFamily: fonts.mono }}
            />
            <textarea
              value={writeContent}
              onChange={(e) => setWriteContent(e.target.value)}
              placeholder="Содержимое файла"
              style={{ ...textarea, flex: 1 }}
            />
            <button
              onClick={async () => {
                if (!filePath.trim()) return notify('err', 'Укажите путь')
                const ok = await window.electronAPI.mcpWriteFile(filePath.trim(), writeContent)
                notify(ok ? 'ok' : 'err', ok ? 'Файл записан' : 'Путь вне папки проекта')
                if (ok) void reload(dir)
              }}
              style={buttonPrimary}
            >
              <Icon name="save" size={12} />
              Записать
            </button>
          </>
        )}

        {tab === 'search' && (
          <>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !query.trim()) return
                  const res = await window.electronAPI.mcpSearchCode(query.trim(), '.')
                  setResults(res)
                  if (!res.length) notify('ok', 'Совпадений нет')
                }}
                placeholder="Что искать в проекте"
                style={{ ...input, flex: 1 }}
              />
              <button
                onClick={async () => {
                  if (!query.trim()) return
                  const res = await window.electronAPI.mcpSearchCode(query.trim(), '.')
                  setResults(res)
                  if (!res.length) notify('ok', 'Совпадений нет')
                }}
                style={button}
              >
                Найти
              </button>
            </div>
            <div style={{ ...well, flex: 1, overflowY: 'auto' }}>
              {results.map((r, i) => (
                <div
                  key={`${r.file}:${r.line}:${i}`}
                  onClick={async () => {
                    const res = await window.electronAPI.mcpReadFile(r.file)
                    if (res) {
                      setFilePath(r.file)
                      setFileContent(res.content)
                      setTab('read')
                    }
                  }}
                  style={{
                    padding: '5px 7px',
                    borderBottom: `1px solid ${ps.border}`,
                    cursor: 'pointer',
                    fontSize: '10px',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = ps.hover)}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ color: ps.info, fontFamily: fonts.mono }}>
                    {r.file}:{r.line}
                  </div>
                  <div
                    style={{
                      color: ps.textDim,
                      fontFamily: fonts.mono,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.text}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          padding: '5px 8px',
          borderTop: `1px solid ${ps.border}`,
          color: ps.textDisabled,
          fontSize: '10px',
          flexShrink: 0,
        }}
      >
        Все операции — внутри папки проекта «{projectName}».
      </div>
    </div>
  )
}
