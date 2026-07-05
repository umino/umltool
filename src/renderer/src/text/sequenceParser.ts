import type { FragmentOperator, MessageKind } from '../editor/constants'

export interface ParsedMessage {
  from: string
  to: string
  kind: MessageKind
  label: string
}

export interface ParsedSeparator {
  guard: string
  /** この区切り以降のオペランドが始まるメッセージ index */
  beforeIndex: number
}

export interface ParsedFragment {
  operator: FragmentOperator
  guard: string
  /** 含まれる最初のメッセージ index */
  start: number
  /** 含まれる最後のメッセージ index（両端含む） */
  end: number
  separators: ParsedSeparator[]
  /** ネスト深さ（0 が最外） */
  depth: number
}

export interface ParsedSequence {
  participants: string[]
  messages: ParsedMessage[]
  fragments: ParsedFragment[]
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
// 複合フラグメント（キーワードは矢印より優先して解釈する）
const FRAGMENT_OPEN_RE = /^(alt|opt|loop|break|par|seq|strict|critical)\b\s*(.*)$/i
const ELSE_RE = /^else\b\s*(.*)$/i
const END_RE = /^end\s*$/i
/** else で区切れる演算子 */
const DIVIDABLE = new Set<string>(['alt', 'par'])

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
 *   alt 条件 / opt / loop / break / par / seq / strict / critical … end
 *   else 条件 （alt / par 内の区切り）
 *   コメント: 行頭 ' # //
 */
export function parseSequence(text: string): ParsedSequence {
  const participants: string[] = []
  const seen = new Set<string>()
  const messages: ParsedMessage[] = []
  const fragments: ParsedFragment[] = []

  interface Frame {
    operator: FragmentOperator
    guard: string
    start: number
    separators: ParsedSeparator[]
    depth: number
    lineNo: number
  }
  const stack: Frame[] = []

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

    if (END_RE.test(line)) {
      const frame = stack.pop()
      if (!frame) throw new ParseError('対応するフラグメントのない end です', lineNo)
      if (messages.length === frame.start) {
        throw new ParseError(`${frame.operator} フラグメント内にメッセージがありません`, lineNo)
      }
      const lastSep = frame.separators[frame.separators.length - 1]
      if (lastSep && lastSep.beforeIndex === messages.length) {
        throw new ParseError('else の後にメッセージがありません', lineNo)
      }
      fragments.push({
        operator: frame.operator,
        guard: frame.guard,
        start: frame.start,
        end: messages.length - 1,
        separators: frame.separators,
        depth: frame.depth
      })
      return
    }

    const em = ELSE_RE.exec(line)
    if (em) {
      const frame = stack[stack.length - 1]
      if (!frame) throw new ParseError('対応するフラグメントのない else です', lineNo)
      if (!DIVIDABLE.has(frame.operator)) {
        throw new ParseError('else は alt / par フラグメント内でのみ使えます', lineNo)
      }
      const prevStart =
        frame.separators[frame.separators.length - 1]?.beforeIndex ?? frame.start
      if (prevStart === messages.length) {
        throw new ParseError('else の前にメッセージがありません', lineNo)
      }
      frame.separators.push({ guard: em[1].trim(), beforeIndex: messages.length })
      return
    }

    const fm = FRAGMENT_OPEN_RE.exec(line)
    if (fm) {
      stack.push({
        operator: fm[1].toLowerCase() as FragmentOperator,
        guard: fm[2].trim(),
        start: messages.length,
        separators: [],
        depth: stack.length,
        lineNo
      })
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

  if (stack.length > 0) {
    const frame = stack[stack.length - 1]
    throw new ParseError(
      `${frame.operator} フラグメントが end で閉じられていません`,
      frame.lineNo
    )
  }

  return { participants, messages, fragments }
}
