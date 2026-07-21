import { FRAGMENT, LIFELINE, MESSAGE, NOTE, TEXT, type FragmentOperator } from '../editor/constants'
import type { ParsedSequence } from './sequenceParser'

export interface LifelineLayout {
  /** 参照 id（buildSequence が name→Node の対応に使う） */
  id: string
  /** 描画する表示名 */
  label: string
  centerX: number
  top: number
  height: number
}

export interface MessageLayout {
  index: number
  y: number
}

export interface ActivationLayout {
  participantId: string
  centerX: number
  y: number
  height: number
}

export interface DividerLayout {
  y: number
  guard: string
}

export interface FragmentLayout {
  operator: FragmentOperator
  guard: string
  x: number
  y: number
  width: number
  height: number
  dividers: DividerLayout[]
}

export interface NoteLayout {
  kind: 'text' | 'note'
  /** テキストの付属先ライフライン。ノート（over）では基準にした先頭の参加者 */
  participantId: string
  x: number
  y: number
  width: number
  text: string
}

export interface SequenceLayout {
  lifelines: LifelineLayout[]
  messages: MessageLayout[]
  fragments: FragmentLayout[]
  activations: ActivationLayout[]
  notes: NoteLayout[]
}

/** フラグメントの枠・区切りが入る位置に挿入する余白 */
const FRAG_GAP = { open: 30, separator: 22, close: 26 } as const

/** ライフライン中心から注釈までの横方向の間隔 */
const NOTE_GAP_X = 30
/** 注釈が占める高さの見積り（実際の高さは描画時に本文へ合わせて詰め直される） */
const NOTE_LINE_HEIGHT = 20
const NOTE_PAD_Y = 16
/** 注釈の下に空ける余白 */
const NOTE_GAP_BOTTOM = 14

/** 本文の行数からおおよその高さを見積もる（レイアウトは DOM 非依存にしたいため） */
function estimateNoteHeight(text: string): number {
  const lines = text === '' ? 1 : text.split('\n').length
  return Math.max(TEXT.minHeight, lines * NOTE_LINE_HEIGHT + NOTE_PAD_Y)
}

/**
 * 解析結果から各ライフライン・メッセージ・フラグメントの座標を自動計算する。
 * participant は等間隔の x、メッセージは上から順に一定ステップの y に配置し、
 * フラグメントの枠・区切り線の分だけ余白を追加する。
 */
export function layoutSequence(parsed: ParsedSequence): SequenceLayout {
  const n = parsed.messages.length

  // メッセージ行間の追加余白（フラグメントの開始/区切り/終了が入る位置）
  const extraBefore = new Array<number>(n + 1).fill(0)
  for (const f of parsed.fragments) {
    extraBefore[f.start] += FRAG_GAP.open
    for (const s of f.separators) extraBefore[s.beforeIndex] += FRAG_GAP.separator
    extraBefore[f.end + 1] += FRAG_GAP.close
  }
  // 注釈は直前のメッセージの下に置くので、次のメッセージまでの間隔を広げて場所を作る
  const noteHeights = parsed.notes.map((note) => estimateNoteHeight(note.text))
  parsed.notes.forEach((note, i) => {
    const before = note.afterIndex + 1
    if (before <= n) extraBefore[before] += noteHeights[i] + NOTE_GAP_BOTTOM
  })

  const ys: number[] = []
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += extraBefore[i]
    ys.push(MESSAGE.startY + i * MESSAGE.stepY + acc)
  }

  // メッセージの下端（自己メッセージはループの分だけ下に伸びる）
  const bottomOf = (i: number): number =>
    ys[i] + (parsed.messages[i].kind === 'self' ? MESSAGE.selfHeight : 0)

  const centerXOf = new Map<string, number>()
  parsed.participants.forEach((p, i) => {
    centerXOf.set(p.id, LIFELINE.firstCenterX + i * LIFELINE.gapX)
  })

  // フラグメントの枠: 含まれるメッセージが通るライフラインの範囲 + 余白
  const rects = parsed.fragments.map((f) => {
    let minX = Infinity
    let maxX = -Infinity
    let maxBottom = -Infinity
    for (let i = f.start; i <= f.end; i++) {
      const msg = parsed.messages[i]
      for (const name of [msg.from, msg.to]) {
        const cx = centerXOf.get(name) ?? LIFELINE.firstCenterX
        minX = Math.min(minX, cx)
        maxX = Math.max(maxX, cx)
      }
      if (msg.kind === 'self' || msg.from === msg.to) {
        const cx = centerXOf.get(msg.from) ?? LIFELINE.firstCenterX
        maxX = Math.max(maxX, cx + MESSAGE.selfWidth + 16)
      }
      maxBottom = Math.max(maxBottom, bottomOf(i))
    }
    return {
      left: minX - FRAGMENT.padSide,
      right: maxX + FRAGMENT.padSide,
      top: ys[f.start] - FRAGMENT.padTop,
      bottom: maxBottom + FRAGMENT.padBottom
    }
  })

  // ネストしたフラグメントが外側の枠からはみ出さないように広げる
  const byDepthDesc = parsed.fragments
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.depth - a.f.depth)
  for (const { f, i } of byDepthDesc) {
    parsed.fragments.forEach((g, j) => {
      if (g === f || g.depth >= f.depth) return
      if (g.start > f.start || g.end < f.end) return
      const inner = rects[i]
      const outer = rects[j]
      outer.left = Math.min(outer.left, inner.left - 12)
      outer.right = Math.max(outer.right, inner.right + 12)
      outer.top = Math.min(outer.top, inner.top - 24)
      outer.bottom = Math.max(outer.bottom, inner.bottom + 14)
    })
  }

  const fragments: FragmentLayout[] = parsed.fragments.map((f, i) => ({
    operator: f.operator,
    guard: f.guard,
    x: rects[i].left,
    y: rects[i].top,
    width: rects[i].right - rects[i].left,
    height: rects[i].bottom - rects[i].top,
    dividers: f.separators.map((s) => ({
      y: (bottomOf(s.beforeIndex - 1) + ys[s.beforeIndex]) / 2,
      guard: s.guard
    }))
  }))

  // 活性化バー: 対象ライフラインの中心線上、startIndex〜endIndex のメッセージを覆う
  const activations: ActivationLayout[] = parsed.activations
    .filter((a) => n > 0 && a.startIndex < n && a.endIndex < n && a.endIndex >= a.startIndex)
    .map((a) => {
      const top = ys[a.startIndex] - 4
      const bottom = bottomOf(a.endIndex) + 8
      return {
        participantId: a.participant,
        centerX: centerXOf.get(a.participant) ?? LIFELINE.firstCenterX,
        y: top,
        height: Math.max(24, bottom - top)
      }
    })

  // 注釈: 直前のメッセージの下端から始める。同じ位置に複数あれば下へ積む
  const noteBottomAt = new Map<number, number>()
  const notes: NoteLayout[] = parsed.notes.map((note, i) => {
    const anchorBottom =
      note.afterIndex >= 0 && note.afterIndex < n
        ? bottomOf(note.afterIndex) + MESSAGE.stepY / 3
        : MESSAGE.startY - MESSAGE.stepY / 2
    const y = Math.max(anchorBottom, noteBottomAt.get(note.afterIndex) ?? -Infinity)
    noteBottomAt.set(note.afterIndex, y + noteHeights[i] + NOTE_GAP_BOTTOM)

    const centers = note.participants.map(
      (id) => centerXOf.get(id) ?? LIFELINE.firstCenterX
    )
    const first = centers[0]
    if (note.placement === 'over') {
      // 複数参加者にまたがる場合は全員を覆う幅にする
      const left = Math.min(...centers)
      const right = Math.max(...centers)
      const width = Math.max(NOTE.defaultWidth, right - left + NOTE.defaultWidth / 2)
      return {
        kind: note.kind,
        participantId: note.participants[0],
        x: (left + right) / 2 - width / 2,
        y,
        width,
        text: note.text
      }
    }
    const width = TEXT.defaultWidth
    const x =
      note.placement === 'left'
        ? first - LIFELINE.width / 2 - NOTE_GAP_X - width
        : first + LIFELINE.width / 2 + NOTE_GAP_X
    return { kind: note.kind, participantId: note.participants[0], x, y, width, text: note.text }
  })

  const bottomPadding = MESSAGE.stepY + 24
  let contentBottom: number = MESSAGE.startY
  if (n > 0) contentBottom = bottomOf(n - 1)
  for (const r of rects) contentBottom = Math.max(contentBottom, r.bottom)
  for (const a of activations) contentBottom = Math.max(contentBottom, a.y + a.height)
  notes.forEach((note, i) => {
    contentBottom = Math.max(contentBottom, note.y + noteHeights[i])
  })
  const height = Math.max(LIFELINE.defaultHeight, contentBottom + bottomPadding - LIFELINE.top)

  const lifelines: LifelineLayout[] = parsed.participants.map((p, i) => ({
    id: p.id,
    label: p.label,
    centerX: LIFELINE.firstCenterX + i * LIFELINE.gapX,
    top: LIFELINE.top,
    height
  }))

  const messages: MessageLayout[] = parsed.messages.map((_m, i) => ({
    index: i,
    y: ys[i]
  }))

  return { lifelines, messages, fragments, activations, notes }
}
