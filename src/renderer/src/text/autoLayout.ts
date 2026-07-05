import { FRAGMENT, LIFELINE, MESSAGE, type FragmentOperator } from '../editor/constants'
import type { ParsedSequence } from './sequenceParser'

export interface LifelineLayout {
  name: string
  centerX: number
  top: number
  height: number
}

export interface MessageLayout {
  index: number
  y: number
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

export interface SequenceLayout {
  lifelines: LifelineLayout[]
  messages: MessageLayout[]
  fragments: FragmentLayout[]
}

/** フラグメントの枠・区切りが入る位置に挿入する余白 */
const FRAG_GAP = { open: 30, separator: 22, close: 26 } as const

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
  parsed.participants.forEach((name, i) => {
    centerXOf.set(name, LIFELINE.firstCenterX + i * LIFELINE.gapX)
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

  const bottomPadding = MESSAGE.stepY + 24
  let contentBottom: number = MESSAGE.startY
  if (n > 0) contentBottom = bottomOf(n - 1)
  for (const r of rects) contentBottom = Math.max(contentBottom, r.bottom)
  const height = Math.max(LIFELINE.defaultHeight, contentBottom + bottomPadding - LIFELINE.top)

  const lifelines: LifelineLayout[] = parsed.participants.map((name, i) => ({
    name,
    centerX: LIFELINE.firstCenterX + i * LIFELINE.gapX,
    top: LIFELINE.top,
    height
  }))

  const messages: MessageLayout[] = parsed.messages.map((_m, i) => ({
    index: i,
    y: ys[i]
  }))

  return { lifelines, messages, fragments }
}
