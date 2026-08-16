/**
 * Короткий сигнал по завершении ответа агента — через Web Audio API, без
 * звуковых файлов и сети. AudioContext создаётся один раз и переиспользуется.
 */

let ctx: AudioContext | null = null

export function playChime(): void {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.12)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.24)
  } catch {
    // Аудио недоступно (ОС заблокировала автозапуск и т. п.) — не критично.
  }
}
