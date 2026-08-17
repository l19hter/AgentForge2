// Собирает assets/icon.ico и assets/icon.png из assets/icon.svg.
//
// Растеризатор здесь тот же Chromium, который уже лежит в Electron: SVG
// открывается в скрытом окне и снимается capturePage. Отдельных зависимостей
// (sharp, ImageMagick, svg2png) для этого не нужно.
//
// Запуск: npx electron scripts/make-icon.js
const { app, BrowserWindow, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const SVG = path.join(ROOT, 'assets', 'icon.svg')
const OUT_ICO = path.join(ROOT, 'assets', 'icon.ico')
const OUT_PNG = path.join(ROOT, 'assets', 'icon.png')

/** Размеры внутри .ico: 16 — панель задач, 256 — крупные плитки проводника. */
const SIZES = [16, 24, 32, 48, 64, 128, 256]

// Скрытое окно закрывается в конце — без этого Electron вышел бы раньше времени.
app.on('window-all-closed', () => {})

/**
 * Склеивает .ico из готовых PNG.
 *
 * Начиная с Vista формат разрешает класть внутрь PNG как есть, поэтому
 * кодировать BMP с маской прозрачности не нужно: заголовок, оглавление и блобы.
 */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // зарезервировано
  header.writeUInt16LE(1, 2) // тип: 1 — иконка
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length

  images.forEach((img, i) => {
    const at = i * 16
    // 256 записывается нулём: в поле один байт.
    directory.writeUInt8(img.size >= 256 ? 0 : img.size, at)
    directory.writeUInt8(img.size >= 256 ? 0 : img.size, at + 1)
    directory.writeUInt8(0, at + 2) // палитра не используется
    directory.writeUInt8(0, at + 3)
    directory.writeUInt16LE(1, at + 4) // плоскостей
    directory.writeUInt16LE(32, at + 6) // бит на пиксель
    directory.writeUInt32LE(img.data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += img.data.length
  })

  return Buffer.concat([header, directory, ...images.map((i) => i.data)])
}

app.whenReady().then(async () => {
  if (!fs.existsSync(SVG)) {
    console.error('Не найден', SVG)
    return app.exit(1)
  }

  const svg = fs.readFileSync(SVG, 'utf-8')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;width:512px;height:512px;overflow:hidden}
    svg{display:block;width:512px;height:512px}
  </style></head><body>${svg}</body></html>`

  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false, sandbox: true },
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // Шрифт монограммы должен успеть примениться до снимка.
  await new Promise((r) => setTimeout(r, 700))

  const shot = await win.capturePage()
  if (shot.isEmpty()) {
    console.error('Снимок пустой — окно не отрисовалось')
    win.destroy()
    return app.exit(1)
  }

  fs.writeFileSync(OUT_PNG, shot.resize({ width: 512, height: 512, quality: 'best' }).toPNG())

  const images = SIZES.map((size) => ({
    size,
    data: shot.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }))
  fs.writeFileSync(OUT_ICO, buildIco(images))

  console.log('PNG:', OUT_PNG, fs.statSync(OUT_PNG).size, 'Б')
  console.log('ICO:', OUT_ICO, fs.statSync(OUT_ICO).size, 'Б')
  console.log('Размеры в ICO:', SIZES.join(', '))

  win.destroy()
  app.exit(0)
})
