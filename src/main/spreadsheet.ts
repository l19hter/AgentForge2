import * as zlib from 'zlib'

/**
 * Чтение таблиц Excel в текст — чтобы воркер видел структуру файла заказчика.
 *
 * Зачем свой разбор вместо библиотеки: живой прогон показал, что заказы с
 * биржи приходят вместе с .xlsx (сметы, сводники, прайсы), воркер честно
 * просит такой файл, а сборщик контекста умеет только текст и молча его
 * отбрасывает. Воркер пишет парсер вслепую по догадке — и не читает файл, ради
 * которого всё затевалось.
 *
 * Нужен не идеальный разбор, а точный ПРЕВЬЮ: шапка, порядок колонок,
 * несколько строк данных. Этого хватает, чтобы написать настоящий парсер, и
 * этого мало, чтобы тащить в приложение стороннюю зависимость: xlsx — это zip
 * с XML, а распаковка есть во встроенном zlib.
 */

/** Больше в контекст всё равно не влезет, а структура видна с первых строк. */
const MAX_ROWS = 40
const MAX_COLS = 30
const MAX_CELL_CHARS = 40

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  localHeaderOffset: number
}

/**
 * Разбор оглавления zip.
 *
 * Идём от конца файла: там лежит запись End of Central Directory, а в ней —
 * смещение каталога. Так надёжнее, чем сканировать локальные заголовки:
 * у потоково записанных архивов размеры в них бывают нулевыми.
 */
function readZipEntries(buf: Buffer): ZipEntry[] {
  const EOCD = 0x06054b50
  let eocd = -1
  // Комментарий архива не длиннее 65535 байт — дальше искать бессмысленно.
  const from = Math.max(0, buf.length - 66_000)
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd === -1) return []

  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []

  for (let i = 0; i < count && offset + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break
    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const localHeaderOffset = buf.readUInt32LE(offset + 42)
    const name = buf.toString('utf-8', offset + 46, offset + 46 + nameLen)
    entries.push({ name, method, compressedSize, localHeaderOffset })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** Распаковка одной записи. Длины имени и «лишнего поля» берём из локального заголовка. */
function readEntry(buf: Buffer, entry: ZipEntry): string | null {
  const at = entry.localHeaderOffset
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== 0x04034b50) return null
  const nameLen = buf.readUInt16LE(at + 26)
  const extraLen = buf.readUInt16LE(at + 28)
  const start = at + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + entry.compressedSize)

  try {
    if (entry.method === 0) return data.toString('utf-8')
    if (entry.method === 8) return zlib.inflateRawSync(data).toString('utf-8')
  } catch {
    /* повреждённая запись — ведём себя так, будто её нет */
  }
  return null
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

/** Таблица общих строк: текст ячейки хранится отдельно, в ячейке лежит номер. */
function readSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const out: string[] = []
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    // Внутри <si> может быть несколько <t> — текст с разным оформлением.
    const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1])
    out.push(unescapeXml(parts.join('')))
  }
  return out
}

/**
 * Какие стили означают дату.
 *
 * В файле дата — это число, и отличить её от количества можно только по
 * формату отображения. Встроенные форматы дат имеют известные номера,
 * пользовательские опознаём по буквам д/м/г в маске.
 */
function readDateStyles(xml: string | null): Set<number> {
  const dateStyles = new Set<number>()
  if (!xml) return dateStyles

  const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57])
  const customDate = new Set<number>()
  for (const m of xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = unescapeXml(m[2])
    // Убираем текст в кавычках, иначе слово «май» в подписи сойдёт за формат.
    const bare = code.replace(/"[^"]*"/g, '')
    if (/[yгdдmм]/i.test(bare)) customDate.add(Number(m[1]))
  }

  const cellXfs = xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? ''
  const xfs = [...cellXfs.matchAll(/<xf\b[^>]*>/g)]
  xfs.forEach((xf, index) => {
    const id = Number(xf[0].match(/numFmtId="(\d+)"/)?.[1] ?? '0')
    if (BUILTIN_DATE.has(id) || customDate.has(id)) dateStyles.add(index)
  })
  return dateStyles
}

/** Дата в Excel — дни от 30.12.1899. */
function serialToDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(serial)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

/** Номер колонки из адреса: A→0, B→1, AA→26. */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function clampCell(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_CELL_CHARS ? `${flat.slice(0, MAX_CELL_CHARS)}…` : flat
}

interface SheetRow {
  /** Номер строки, как его видит пользователь в Excel. */
  number: number
  cells: string[]
}

/**
 * Пустые ячейки часто записаны самозакрывающимся тегом (`<c r="A3" s="5"/>`),
 * и жадность здесь дорого стоит: выражение вида `[\s\S]*?(?:\/>|<\/row>)`
 * обрывает строку на первой такой ячейке и теряет все данные после неё.
 * Поэтому самозакрывающийся вариант проверяется первым, отдельной ветвью.
 */
const ROW_RE = /<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g
const CELL_RE = /<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g

function readSheet(xml: string, shared: string[], dateStyles: Set<number>): SheetRow[] {
  const rows: SheetRow[] = []
  let fallbackNumber = 0

  for (const rowXml of xml.match(ROW_RE) ?? []) {
    fallbackNumber++
    const number = Number(rowXml.match(/<row\b[^>]*\br="(\d+)"/)?.[1] ?? fallbackNumber)
    fallbackNumber = number

    const cells: string[] = []
    for (const cellMatch of rowXml.match(CELL_RE) ?? []) {
      const open = cellMatch.match(/^<c\b[^>]*>/)?.[0] ?? cellMatch
      const attrs = open.slice(2, open.length - (open.endsWith('/>') ? 2 : 1))
      const body = cellMatch.endsWith('/>')
        ? ''
        : cellMatch.slice(open.length, cellMatch.length - '</c>'.length)
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1] ?? ''
      const type = attrs.match(/t="([^"]+)"/)?.[1] ?? 'n'
      const style = Number(attrs.match(/s="(\d+)"/)?.[1] ?? '-1')

      let value = ''
      if (type === 'inlineStr') {
        const parts = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1])
        value = unescapeXml(parts.join(''))
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        if (raw !== undefined) {
          if (type === 's') value = shared[Number(raw)] ?? ''
          else if (type === 'b') value = raw === '1' ? 'ИСТИНА' : 'ЛОЖЬ'
          else if (dateStyles.has(style) && raw !== '' && !Number.isNaN(Number(raw))) {
            value = serialToDate(Number(raw))
          } else value = unescapeXml(raw)
        }
      }

      const index = ref ? columnIndex(ref) : cells.length
      while (cells.length < index) cells.push('')
      cells[index] = clampCell(value)
    }
    rows.push({ number, cells })
  }
  return rows
}

/**
 * Превью книги Excel в виде текста. null — файл не читается как xlsx.
 */
export function readSpreadsheetAsText(buf: Buffer): string | null {
  const entries = readZipEntries(buf)
  if (entries.length === 0) return null

  const byName = new Map(entries.map((e) => [e.name, e]))
  const sheetNames = entries
    .map((e) => e.name)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()
  if (sheetNames.length === 0) return null

  const shared = readSharedStrings(
    byName.has('xl/sharedStrings.xml') ? readEntry(buf, byName.get('xl/sharedStrings.xml')!) : null
  )
  const dateStyles = readDateStyles(
    byName.has('xl/styles.xml') ? readEntry(buf, byName.get('xl/styles.xml')!) : null
  )

  // Подписи листов лежат в книге, порядок совпадает с порядком sheetN.xml.
  const workbookXml = byName.has('xl/workbook.xml')
    ? readEntry(buf, byName.get('xl/workbook.xml')!)
    : null
  const titles = [...(workbookXml ?? '').matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) =>
    unescapeXml(m[1])
  )

  const out: string[] = []
  // Больше одного листа в контекст не тащим: структура видна по первому.
  sheetNames.slice(0, 2).forEach((sheetFile, i) => {
    const xml = readEntry(buf, byName.get(sheetFile)!)
    if (!xml) return
    const rows = readSheet(xml, shared, dateStyles)
    // Считаем только непустые: в сводниках между блоками заказов бывают
    // строки-разделители, и по ним нельзя судить об объёме данных.
    const filled = rows.filter((r) => r.cells.some((c) => c !== ''))
    const shown = filled.slice(0, MAX_ROWS)
    const title = titles[i] ?? `Лист ${i + 1}`
    const lastRow = rows.length ? rows[rows.length - 1].number : 0

    out.push(`### Лист «${title}» — строк с данными ${filled.length}, последняя строка ${lastRow}`)
    out.push('Номер слева — номер строки в самом файле.')
    for (const row of shown) {
      out.push(`${String(row.number).padStart(3)} | ${row.cells.slice(0, MAX_COLS).join(' | ')}`)
    }
    if (filled.length > MAX_ROWS) {
      out.push(`… ещё ${filled.length - MAX_ROWS} непустых строк не показаны`)
    }
    if (rows.some((r) => r.cells.length > MAX_COLS)) {
      out.push(`… показаны первые ${MAX_COLS} колонок`)
    }
    out.push('')
  })

  if (out.length === 0) return null
  return [
    'Таблица прочитана автоматически. Показаны первые строки, чтобы была видна',
    'структура: шапка, порядок колонок, вид данных. Форматирование и формулы опущены.',
    '',
    ...out,
  ].join('\n')
}

const SPREADSHEET_EXT = new Set(['.xlsx', '.xlsm', '.xltx'])

export function isSpreadsheet(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  return dot !== -1 && SPREADSHEET_EXT.has(fileName.slice(dot).toLowerCase())
}
