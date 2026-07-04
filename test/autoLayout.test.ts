import { describe, it, expect } from 'vitest'
import { layoutSequence } from '../src/renderer/src/text/autoLayout'
import { parseSequence } from '../src/renderer/src/text/sequenceParser'
import { LIFELINE, MESSAGE } from '../src/renderer/src/editor/constants'

describe('layoutSequence', () => {
  it('participant を等間隔 x に並べる', () => {
    const layout = layoutSequence(parseSequence('A -> B : x\nB -> C : y'))
    const xs = layout.lifelines.map((l) => l.centerX)
    expect(xs).toEqual([
      LIFELINE.firstCenterX,
      LIFELINE.firstCenterX + LIFELINE.gapX,
      LIFELINE.firstCenterX + 2 * LIFELINE.gapX
    ])
  })

  it('メッセージを一定ステップの y に積む', () => {
    const layout = layoutSequence(parseSequence('A -> B : 1\nA -> B : 2\nA -> B : 3'))
    expect(layout.messages.map((m) => m.y)).toEqual([
      MESSAGE.startY,
      MESSAGE.startY + MESSAGE.stepY,
      MESSAGE.startY + 2 * MESSAGE.stepY
    ])
  })

  it('全ライフラインは同じ高さ（最小既定以上）', () => {
    const layout = layoutSequence(parseSequence('A -> B : 1'))
    expect(layout.lifelines.every((l) => l.height >= LIFELINE.defaultHeight)).toBe(true)
  })

  it('メッセージが多いと高さが伸びる', () => {
    const many = Array.from({ length: 30 }, (_, i) => `A -> B : m${i}`).join('\n')
    const layout = layoutSequence(parseSequence(many))
    expect(layout.lifelines[0].height).toBeGreaterThan(LIFELINE.defaultHeight)
  })
})
