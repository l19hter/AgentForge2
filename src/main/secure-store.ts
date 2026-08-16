import { safeStorage } from 'electron'
import { loadJson, saveJson } from './persistence'

/**
 * Хранение API-ключей между запусками.
 *
 * Если ОС предоставляет шифрование (на Windows это DPAPI, привязанный к
 * учётной записи пользователя) — ключи шифруются. Если нет, они НЕ сохраняются
 * на диск вообще: лучше попросить ввести ключ заново, чем положить его
 * в открытом виде в JSON.
 */

const KEYS_FILE = 'api-keys.json'

interface StoredKeys {
  encrypted: boolean
  claude: string
  kimi: string
}

const EMPTY: StoredKeys = { encrypted: false, claude: '', kimi: '' }

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function saveKeys(claude: string, kimi: string): void {
  if (!isEncryptionAvailable()) return
  const enc = (v: string) => (v ? safeStorage.encryptString(v).toString('base64') : '')
  saveJson(KEYS_FILE, { encrypted: true, claude: enc(claude), kimi: enc(kimi) } satisfies StoredKeys)
}

export function loadKeys(): { claude: string; kimi: string } {
  const stored = loadJson<StoredKeys>(KEYS_FILE, EMPTY)
  if (!stored.encrypted || !isEncryptionAvailable()) return { claude: '', kimi: '' }
  const dec = (v: string) => {
    try {
      return v ? safeStorage.decryptString(Buffer.from(v, 'base64')) : ''
    } catch {
      return ''
    }
  }
  return { claude: dec(stored.claude), kimi: dec(stored.kimi) }
}

export function clearKeys(): void {
  saveJson(KEYS_FILE, EMPTY)
}
