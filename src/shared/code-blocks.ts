/**
 * Разбор блоков кода из ответа модели. Общий модуль: renderer показывает эти
 * блоки в чате, main-процесс по ним же записывает файлы на диск, и расхождение
 * между двумя реализациями означало бы, что показано одно, а сохранено другое.
 */

export interface CodeBlock {
  lang?: string
  /** Путь от корня проекта из метки ```lang path=… — есть не у всех блоков. */
  path?: string
  code: string
}

export const FENCE_OPEN = /^\s*```+\s*(\S+)?(?:\s+path=(\S+))?\s*$/

export function parseCodeBlocks(text: string): CodeBlock[] {
  const lines = text.split('\n')
  const blocks: CodeBlock[] = []
  let i = 0
  while (i < lines.length) {
    const open = lines[i].match(FENCE_OPEN)
    if (open) {
      const [, lang, filePath] = open
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) body.push(lines[i++])
      i++
      blocks.push({ lang, path: filePath, code: body.join('\n') })
      continue
    }
    i++
  }
  return blocks
}

/** Только те блоки, которые агент пометил путём, — их и нужно записывать в проект. */
export function parseFileBlocks(text: string): (CodeBlock & { path: string })[] {
  return parseCodeBlocks(text).filter((b): b is CodeBlock & { path: string } => Boolean(b.path))
}
