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

  it('フラグメントは含まれるメッセージ帯を囲み、区切りはオペランドの間に入る', () => {
    const layout = layoutSequence(
      parseSequence(`A -> B : 前
alt 成功
  A -> B : 1
else 失敗
  A -> B : 2
end
A -> B : 後`)
    )
    expect(layout.fragments).toHaveLength(1)
    const f = layout.fragments[0]
    const [before, m1, m2, after] = layout.messages.map((m) => m.y)
    // 枠が中のメッセージだけを囲む
    expect(f.y).toBeGreaterThan(before)
    expect(f.y).toBeLessThan(m1)
    expect(f.y + f.height).toBeGreaterThan(m2)
    expect(f.y + f.height).toBeLessThan(after)
    // 区切り線は 2 つのオペランドの間
    expect(f.dividers).toHaveLength(1)
    expect(f.dividers[0].y).toBeGreaterThan(m1)
    expect(f.dividers[0].y).toBeLessThan(m2)
    expect(f.dividers[0].guard).toBe('失敗')
    // A・B のライフラインを横に覆う
    const [ax, bx] = layout.lifelines.map((l) => l.centerX)
    expect(f.x).toBeLessThan(ax)
    expect(f.x + f.width).toBeGreaterThan(bx)
  })

  it('ネストした内側フラグメントは外側の枠に収まる', () => {
    const layout = layoutSequence(
      parseSequence(`alt 外
A -> B : 1
opt 内
A -> B : 2
end
end`)
    )
    const outer = layout.fragments.find((f) => f.operator === 'alt')!
    const inner = layout.fragments.find((f) => f.operator === 'opt')!
    expect(inner.x).toBeGreaterThan(outer.x)
    expect(inner.y).toBeGreaterThan(outer.y)
    expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width)
    expect(inner.y + inner.height).toBeLessThan(outer.y + outer.height)
  })

  it('フラグメントの分だけ後続メッセージの y に余白が入る', () => {
    const plain = layoutSequence(parseSequence('A -> B : 1\nA -> B : 2'))
    const withFrag = layoutSequence(parseSequence('A -> B : 1\nopt x\nA -> B : 2\nend'))
    expect(withFrag.messages[1].y).toBeGreaterThan(plain.messages[1].y)
  })
})
