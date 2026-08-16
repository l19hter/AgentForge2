import * as fs from 'fs'
import * as path from 'path'
import { getDataDir } from './paths'

export function saveJson(filename: string, data: unknown): void {
  fs.writeFileSync(path.join(getDataDir(), filename), JSON.stringify(data, null, 2), 'utf-8')
}

export function loadJson<T>(filename: string, defaultValue: T): T {
  const filePath = path.join(getDataDir(), filename)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
    }
  } catch {
    /* битый JSON — откатываемся к значению по умолчанию */
  }
  return defaultValue
}
