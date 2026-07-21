import type { FragmentOperator, MessageKind } from '../editor/constants'

export interface ParsedMessage {
  /** 送信元の参加者 id。gate が 'in' のときは空（図の外） */
  from: string
  /** 送信先の参加者 id。gate が 'out' のときは空（図の外） */
  to: string
  kind: MessageKind
  label: string
  /**
   * 図の外を端点にするゲート。PlantUML の `[-> A`（外から）が 'in'、
   * `A ->]`（外へ）が 'out'。通常のメッセージは null。
   */
  gate: 'in' | 'out' | null
}

export interface ParsedParticipant {
  /** 参照に使う識別子（エイリアス、または宣言名） */
  id: string
  /** 描画に使う表示名 */
  label: string
}

export interface ParsedActivation {
  /** 対象参加者の id */
  participant: string
  /** バー上端の基準メッセージ index */
  startIndex: number
  /** バー下端の基準メッセージ index */
  endIndex: number
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

/** 注釈の置き方。left/right はライフラインの脇、over はライフラインに被せる */
export type NotePlacement = 'left' | 'right' | 'over'

export interface ParsedNote {
  /**
   * 図形の種類。left of / right of はライフラインに付属する「テキスト」、
   * over は自由配置の「ノート」（付箋）になる。
   */
  kind: 'text' | 'note'
  placement: NotePlacement
  /** 対象の参加者 id。over は複数指定できる */
  participants: string[]
  text: string
  /** 直前のメッセージ index。先頭より前なら -1 */
  afterIndex: number
}

export interface ParsedSequence {
  participants: ParsedParticipant[]
  messages: ParsedMessage[]
  fragments: ParsedFragment[]
  activations: ParsedActivation[]
  notes: ParsedNote[]
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
// participant 名 / participant "表示名" as エイリアス
const PARTICIPANT_RE = /^(?:participant|actor)\s+(.+?)(?:\s+as\s+(.+?))?\s*$/i
const COMMENT_RE = /^\s*(?:'|#|\/\/)/
// 複合フラグメント（キーワードは矢印より優先して解釈する）
const FRAGMENT_OPEN_RE = /^(alt|opt|loop|break|par|seq|strict|critical)\b\s*(.*)$/i
const ELSE_RE = /^else\b\s*(.*)$/i
const END_RE = /^end\s*$/i
const ACTIVATE_RE = /^activate\s+(.+?)\s*$/i
const DEACTIVATE_RE = /^deactivate\s+(.+?)\s*$/i
const AUTOACTIVATE_RE = /^autoactivate\s+(on|off)\s*$/i
// note left of A : 本文 / note over A, B : 本文（: 以降を省くと end note までの複数行）
const NOTE_RE = /^note\s+(left|right)\s+of\s+([^:]+?)\s*(?::\s*(.*))?$/i
const NOTE_OVER_RE = /^note\s+over\s+([^:]+?)\s*(?::\s*(.*))?$/i
const END_NOTE_RE = /^end\s*note\s*$/i
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
 *   participant "表示名" as エイリアス （以降はエイリアスで参照）
 *   A -> B : ラベル   （同期）
 *   A ->> B : ラベル  （非同期）
 *   A --> B : ラベル  （戻り/破線）
 *   [-> A : ラベル    （図の外から A へ）
 *   A ->] : ラベル    （A から図の外へ）
 *   activate 参加者 / deactivate 参加者 （活性化バー。deactivate 省略時は末尾で自動終了）
 *   autoactivate on / off （以降のメッセージでバーを自動開閉。呼び出しで開き、戻りで閉じる）
 *   alt 条件 / opt / loop / break / par / seq / strict / critical … end
 *   else 条件 （alt / par 内の区切り）
 *   note left of A : 本文 / note right of A : 本文 （ライフライン付属の「テキスト」）
 *   note over A : 本文 / note over A, B : 本文 （自由配置の「ノート」）
 *   本文を省くと end note までを複数行の本文として読む
 *   コメント: 行頭 ' # //
 */
export function parseSequence(text: string): ParsedSequence {
  const participants: ParsedParticipant[] = []
  const partById = new Map<string, ParsedParticipant>()
  const messages: ParsedMessage[] = []
  const fragments: ParsedFragment[] = []
  const activations: ParsedActivation[] = []
  const notes: ParsedNote[] = []

  interface Frame {
    operator: FragmentOperator
    guard: string
    start: number
    separators: ParsedSeparator[]
    depth: number
    lineNo: number
  }
  const stack: Frame[] = []
  const activateStack: { participant: string; startIndex: number }[] = []
  // autoactivate 用は明示 activate と別のスタックにして、混在しても互いに壊さない
  const autoStack: { participant: string; startIndex: number }[] = []
  let autoactivate = false

  // id で参加者を確保する。label 未指定は暗黙宣言（表示名＝id）。
  // 暗黙宣言済みの参加者に後から表示名が与えられたら上書きする。
  const ensure = (id: string, label?: string): void => {
    const existing = partById.get(id)
    if (!existing) {
      const p = { id, label: label ?? id }
      partById.set(id, p)
      participants.push(p)
    } else if (label !== undefined && existing.label === existing.id && label !== id) {
      existing.label = label
    }
  }

  /** end note まで本文を集める複数行ノート。null なら通常行 */
  let openNote: { note: ParsedNote; lines: string[]; lineNo: number } | null = null

  const addNote = (
    kind: ParsedNote['kind'],
    placement: NotePlacement,
    targets: string[],
    body: string | undefined,
    lineNo: number
  ): void => {
    if (targets.length === 0) throw new ParseError('note の対象が空です', lineNo)
    for (const t of targets) ensure(t)
    const note: ParsedNote = {
      kind,
      placement,
      participants: targets,
      text: (body ?? '').trim(),
      afterIndex: messages.length - 1
    }
    // 本文が同じ行に無ければ end note までの複数行として読む
    if (body === undefined) openNote = { note, lines: [], lineNo }
    else notes.push(note)
  }

  /**
   * autoactivate が有効なときの活性化バーの開閉。
   * 呼び出し（実線）は宛先のバーを開き、戻り（破線）は送信側のバーを閉じる。
   */
  const applyAutoActivate = (): void => {
    if (!autoactivate) return
    const index = messages.length - 1
    const msg = messages[index]
    if (msg.kind === 'return') {
      const owner = msg.from
      if (owner === '') return
      let k = autoStack.length - 1
      while (k >= 0 && autoStack[k].participant !== owner) k--
      if (k < 0) return // 開いていないものは黙って無視する（PlantUML も許容）
      const act = autoStack.splice(k, 1)[0]
      activations.push({ participant: owner, startIndex: act.startIndex, endIndex: index })
      return
    }
    if (msg.to !== '') autoStack.push({ participant: msg.to, startIndex: index })
  }

  const lines = text.split(/\r?\n/)
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1
    const line = raw.trim()

    // 複数行ノートの内側は本文としてそのまま積む（コメント判定もしない）
    if (openNote !== null) {
      if (END_NOTE_RE.test(line)) {
        const open: { note: ParsedNote; lines: string[] } = openNote
        open.note.text = open.lines.join('\n').trim()
        notes.push(open.note)
        openNote = null
        return
      }
      openNote.lines.push(line)
      return
    }

    if (line === '' || COMMENT_RE.test(raw)) return
    if (/^title\b/i.test(line) || /^@startuml|^@enduml/i.test(line)) return

    const nm = NOTE_RE.exec(line)
    if (nm) {
      addNote('text', nm[1].toLowerCase() as 'left' | 'right', [stripQuotes(nm[2])], nm[3], lineNo)
      return
    }

    const nom = NOTE_OVER_RE.exec(line)
    if (nom) {
      const targets = nom[1]
        .split(',')
        .map((t) => stripQuotes(t))
        .filter((t) => t !== '')
      addNote('note', 'over', targets, nom[2], lineNo)
      return
    }

    const pm = PARTICIPANT_RE.exec(line)
    if (pm) {
      const display = stripQuotes(pm[1])
      if (pm[2]) ensure(stripQuotes(pm[2]), display)
      else ensure(display)
      return
    }

    const aam = AUTOACTIVATE_RE.exec(line)
    if (aam) {
      autoactivate = aam[1].toLowerCase() === 'on'
      return
    }

    const acm = ACTIVATE_RE.exec(line)
    if (acm) {
      const id = stripQuotes(acm[1])
      ensure(id)
      activateStack.push({ participant: id, startIndex: messages.length > 0 ? messages.length - 1 : 0 })
      return
    }

    const dcm = DEACTIVATE_RE.exec(line)
    if (dcm) {
      const id = stripQuotes(dcm[1])
      let k = activateStack.length - 1
      while (k >= 0 && activateStack[k].participant !== id) k--
      if (k < 0) throw new ParseError(`対応する activate のない deactivate です: ${id}`, lineNo)
      const act = activateStack.splice(k, 1)[0]
      activations.push({
        participant: id,
        startIndex: act.startIndex,
        endIndex: messages.length > 0 ? messages.length - 1 : 0
      })
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
      // [ / ] は参加者ではなく「図の外」を表す
      const fromOutside = from === '['
      const toOutside = to === ']'
      if (fromOutside && toOutside) {
        throw new ParseError('両端を図の外にはできません', lineNo)
      }
      if (fromOutside || toOutside) {
        const inside = fromOutside ? to : from
        if (inside === '[' || inside === ']') {
          throw new ParseError(`ゲートの相手が参加者ではありません: ${inside}`, lineNo)
        }
        ensure(inside)
        messages.push({
          from: fromOutside ? '' : inside,
          to: toOutside ? '' : inside,
          kind: arrowToKind(am[2], false),
          label,
          gate: fromOutside ? 'in' : 'out'
        })
        applyAutoActivate()
        return
      }
      ensure(from)
      ensure(to)
      messages.push({ from, to, kind: arrowToKind(am[2], from === to), label, gate: null })
      applyAutoActivate()
      return
    }

    throw new ParseError(`解釈できない行です: "${line}"`, lineNo)
  })

  if (openNote !== null) {
    const open: { lineNo: number } = openNote
    throw new ParseError('note が end note で閉じられていません', open.lineNo)
  }

  if (stack.length > 0) {
    const frame = stack[stack.length - 1]
    throw new ParseError(
      `${frame.operator} フラグメントが end で閉じられていません`,
      frame.lineNo
    )
  }

  // 閉じられなかったバー（明示 activate / autoactivate とも）は末尾で自動終了する
  for (const act of [...activateStack, ...autoStack]) {
    activations.push({
      participant: act.participant,
      startIndex: act.startIndex,
      endIndex: messages.length > 0 ? messages.length - 1 : 0
    })
  }

  return { participants, messages, fragments, activations, notes }
}
