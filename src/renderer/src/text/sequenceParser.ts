import type { MessageKind } from '../editor/constants'

export interface ParsedMessage {
  from: string
  to: string
  kind: MessageKind
  label: string
}

export interface ParsedSequence {
  participants: string[]
  messages: ParsedMessage[]
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number
  ) {
    super(`行 ${line}: ${message}`)
    this.name = 'ParseError'
  }
}

// 長い矢印から先にマッチさせる
const ARROW_RE = /^(.+?)\s*(-->>|-->|->>|->)\s*([^:]+?)\s*(?::\s*(.*))?$/
const PARTICIPANT_RE = /^(?:participant|actor)\s+(.+?)\s*$/i
const COMMENT_RE = /^\s*(?:'|#|\/\/)/

function arrowToKind(arrow: string, selfTarget: boolean): MessageKind {
  if (selfTarget) return 'self'
  switch (arrow) {
    case '->':
      return 'sync'
    case '->>':
      return 'async'
    case '-->':
    case '-->>':
      return 'return'
    default:
      return 'sync'
  }
}

function stripQuotes(name: string): string {
  const t = name.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1)
  return t
}

/**
 * PlantUML サブセットのシーケンステキストを解析する。
 *
 * 対応構文:
 *   participant 名前 / actor 名前
 *   A -> B : ラベル   （同期）
 *   A ->> B : ラベル  （非同期）
 *   A --> B : ラベル  （戻り/破線）
 *   コメント: 行頭 ' # //
 */
export function parseSequence(text: string): ParsedSequence {
  const participants: string[] = []
  const seen = new Set<string>()
  const messages: ParsedMessage[] = []

  const ensure = (name: string): void => {
    if (!seen.has(name)) {
      seen.add(name)
      participants.push(name)
    }
  }

  const lines = text.split(/\r?\n/)
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1
    const line = raw.trim()
    if (line === '' || COMMENT_RE.test(raw)) return
    if (/^title\b/i.test(line) || /^@startuml|^@enduml/i.test(line)) return

    const pm = PARTICIPANT_RE.exec(line)
    if (pm) {
      ensure(stripQuotes(pm[1]))
      return
    }

    const am = ARROW_RE.exec(line)
    if (am) {
      const from = stripQuotes(am[1])
      const to = stripQuotes(am[3])
      const label = (am[4] ?? '').trim()
      if (from === '' || to === '') {
        throw new ParseError('送信元または送信先が空です', lineNo)
      }
      ensure(from)
      ensure(to)
      messages.push({ from, to, kind: arrowToKind(am[2], from === to), label })
      return
    }

    throw new ParseError(`解釈できない行です: "${line}"`, lineNo)
  })

  return { participants, messages }
}
