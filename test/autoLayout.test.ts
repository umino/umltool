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

  it('activate で対象ライフラインの中心に活性化バーを配置する', () => {
    const layout = layoutSequence(
      parseSequence(`A -> B : req
activate B
B --> A : res
deactivate B`)
    )
    expect(layout.activations).toHaveLength(1)
    const a = layout.activations[0]
    expect(a.participantId).toBe('B')
    // B は 2 番目のライフライン
    expect(a.centerX).toBe(LIFELINE.firstCenterX + LIFELINE.gapX)
    expect(a.height).toBeGreaterThan(0)
  })
})

describe('note のレイアウト', () => {
  it('left は対象ライフラインの左、right は右に置かれる', () => {
    const l = layoutSequence(
      parseSequence(`A -> B : x
note left of A : 左
note right of A : 右`)
    )
    const a = l.lifelines.find((x) => x.id === 'A')!
    const left = l.notes[0]
    const right = l.notes[1]
    expect(left.x + left.width).toBeLessThan(a.centerX)
    expect(right.x).toBeGreaterThan(a.centerX)
  })

  it('over は対象ライフラインの中心にまたがる', () => {
    const l = layoutSequence(
      parseSequence(`A -> B : x
note over A, B : 覆う`)
    )
    const a = l.lifelines.find((x) => x.id === 'A')!
    const b = l.lifelines.find((x) => x.id === 'B')!
    const note = l.notes[0]
    expect(note.x).toBeLessThan(a.centerX)
    expect(note.x + note.width).toBeGreaterThan(b.centerX)
  })

  it('note の分だけ後続メッセージが下にずれる', () => {
    const without = layoutSequence(parseSequence('A -> B : 1\nA -> B : 2'))
    const withNote = layoutSequence(
      parseSequence(`A -> B : 1
note right of B : メモ
A -> B : 2`)
    )
    expect(withNote.messages[0].y).toBe(without.messages[0].y)
    expect(withNote.messages[1].y).toBeGreaterThan(without.messages[1].y)
  })

  it('本文が長いほど大きく間隔が空く', () => {
    const short = layoutSequence(
      parseSequence('A -> B : 1\nnote right of B : 1行\nA -> B : 2')
    )
    const long = layoutSequence(
      parseSequence(`A -> B : 1
note right of B
1
2
3
4
end note
A -> B : 2`)
    )
    expect(long.messages[1].y).toBeGreaterThan(short.messages[1].y)
  })

  it('同じ位置に複数の note があっても重ならない', () => {
    const l = layoutSequence(
      parseSequence(`A -> B : x
note right of B : 1
note right of B : 2`)
    )
    expect(l.notes[1].y).toBeGreaterThan(l.notes[0].y)
  })

  it('ライフラインは note を含む高さまで伸びる', () => {
    const l = layoutSequence(
      parseSequence(`A -> B : x
note right of B : メモ`)
    )
    const note = l.notes[0]
    const a = l.lifelines[0]
    expect(a.top + a.height).toBeGreaterThan(note.y)
  })
})
