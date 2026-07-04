import { LIFELINE, MESSAGE } from '../editor/constants'
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

export interface SequenceLayout {
  lifelines: LifelineLayout[]
  messages: MessageLayout[]
}

/**
 * 解析結果から各ライフライン・メッセージの座標を自動計算する。
 * participant は等間隔の x、メッセージは上から順に一定ステップの y に配置。
 */
export function layoutSequence(parsed: ParsedSequence): SequenceLayout {
  const bottomPadding = MESSAGE.stepY + 24
  const contentBottom = MESSAGE.startY + parsed.messages.length * MESSAGE.stepY + bottomPadding
  const height = Math.max(LIFELINE.defaultHeight, contentBottom)

  const lifelines: LifelineLayout[] = parsed.participants.map((name, i) => ({
    name,
    centerX: LIFELINE.firstCenterX + i * LIFELINE.gapX,
    top: LIFELINE.top,
    height
  }))

  const messages: MessageLayout[] = parsed.messages.map((_m, i) => ({
    index: i,
    y: MESSAGE.startY + i * MESSAGE.stepY
  }))

  return { lifelines, messages }
}
