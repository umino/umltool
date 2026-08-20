import { describe, it, expect } from 'vitest'
import {
  DECISION_OUT_SIDES,
  MERGE_IN_SIDES,
  assignBranchSides,
  droppedSide,
  flowTargetSide,
  nearestSide,
  type Box,
  type BranchEnd
} from '../src/renderer/src/editor/branchPorts'

const center = { x: 100, y: 100 }

/** 割り当てられた辺を id 順の配列にする */
function sidesOf(ends: BranchEnd[], allowed = DECISION_OUT_SIDES): string[] {
  const map = assignBranchSides(center, ends, allowed)
  return ends.map((e) => map.get(e.id) as string)
}

describe('assignBranchSides', () => {
  it('枝が無ければ何も割り当てない', () => {
    expect(assignBranchSides(center, [], DECISION_OUT_SIDES).size).toBe(0)
  })

  it('分岐の 2 枝は下と右に分かれる（真下と右下の場合）', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: 100, y: 300 }, // 真下
      { id: 'b', x: 300, y: 160 } // 右斜め下
    ]
    expect(sidesOf(ends)).toEqual(['bottom', 'right'])
  })

  it('左右に分かれる枝はそれぞれ左と右になる', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: -200, y: 120 },
      { id: 'b', x: 400, y: 120 }
    ]
    expect(sidesOf(ends)).toEqual(['left', 'right'])
  })

  it('3 枝は下・右・左に重ならず割り当てられる', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: 100, y: 300 },
      { id: 'b', x: 400, y: 110 },
      { id: 'c', x: -200, y: 110 }
    ]
    const sides = sidesOf(ends)
    expect(new Set(sides).size).toBe(3)
    expect(new Set(sides)).toEqual(new Set(['bottom', 'right', 'left']))
  })

  it('同じ方向に 2 枝あっても辺は重複しない', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: 100, y: 300 },
      { id: 'b', x: 100, y: 400 }
    ]
    const sides = sidesOf(ends)
    expect(new Set(sides).size).toBe(2)
    expect(sides).toContain('bottom')
  })

  it('4 枝以上は辺が足りないので重複を許す', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: 100, y: 300 },
      { id: 'b', x: 400, y: 110 },
      { id: 'c', x: -200, y: 110 },
      { id: 'd', x: 100, y: 500 }
    ]
    const map = assignBranchSides(center, ends, DECISION_OUT_SIDES)
    expect(map.size).toBe(4)
    // 溢れた 1 本は最も素直な辺（真下なので bottom）へ重なる
    expect(map.get('d')).toBe('bottom')
  })

  it('合流は上・右・左から入る（下は使わない）', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: 100, y: -100 },
      { id: 'b', x: 400, y: 90 },
      { id: 'c', x: 100, y: 400 } // 下から来ても bottom は候補外
    ]
    const sides = sidesOf(ends, MERGE_IN_SIDES)
    expect(sides).not.toContain('bottom')
    expect(new Set(sides).size).toBe(3)
  })

  it('同じ入力なら常に同じ割り当てになる（決定的）', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: 100, y: 300 },
      { id: 'b', x: 100, y: 300 }
    ]
    const first = assignBranchSides(center, ends, DECISION_OUT_SIDES)
    const second = assignBranchSides(center, ends, DECISION_OUT_SIDES)
    expect([...first.entries()]).toEqual([...second.entries()])
  })

  it('中心と同じ位置の枝でも辺は割り当てられる', () => {
    const ends: BranchEnd[] = [{ id: 'a', x: center.x, y: center.y }]
    expect(assignBranchSides(center, ends, DECISION_OUT_SIDES).get('a')).toBeDefined()
  })
})

describe('flowTargetSide', () => {
  const box = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, width: w, height: h })

  it('送信元が完全に上にあれば上辺中央', () => {
    expect(flowTargetSide(box(0, 0), box(0, 100))).toBe('top')
  })

  it('接している（下端＝上端）だけでも上とみなす', () => {
    expect(flowTargetSide(box(0, 0, 100, 40), box(0, 40))).toBe('top')
  })

  it('横並びで縦に重なるなら既定に任せる', () => {
    expect(flowTargetSide(box(0, 0), box(200, 10))).toBeNull()
  })

  it('送信元が下にあるなら既定に任せる', () => {
    expect(flowTargetSide(box(0, 200), box(0, 0))).toBeNull()
  })

  it('少しでも縦に重なっていれば既定に任せる', () => {
    expect(flowTargetSide(box(0, 0, 100, 40), box(0, 39))).toBeNull()
  })

  it('横方向にずれていても、上にあれば上辺中央', () => {
    expect(flowTargetSide(box(0, 0), box(400, 300))).toBe('top')
  })
})

describe('nearestSide', () => {
  // 分岐ノードくらいの大きさ（中心 100,100）
  const box: Box = { x: 50, y: 70, width: 100, height: 60 }

  it('右寄りに落とせば右', () => {
    expect(nearestSide(box, { x: 148, y: 100 })).toBe('right')
  })

  it('左寄りに落とせば左', () => {
    expect(nearestSide(box, { x: 52, y: 100 })).toBe('left')
  })

  it('下寄りに落とせば下', () => {
    expect(nearestSide(box, { x: 100, y: 128 })).toBe('bottom')
  })

  it('上寄りに落とせば上', () => {
    expect(nearestSide(box, { x: 100, y: 72 })).toBe('top')
  })

  it('縦横比で正規化するので、平たいノードでも上下を狙える', () => {
    // 40x30 の合流ノード。中心から右へ 15px・下へ 14px は、比では下の方が大きい
    const merge: Box = { x: 0, y: 0, width: 40, height: 30 }
    expect(nearestSide(merge, { x: 35, y: 29 })).toBe('bottom')
    expect(nearestSide(merge, { x: 39, y: 20 })).toBe('right')
  })

  it('外側に落としてもその方向の辺になる', () => {
    expect(nearestSide(box, { x: 300, y: 105 })).toBe('right')
    expect(nearestSide(box, { x: 100, y: -200 })).toBe('top')
  })
})

describe('assignBranchSides（手動の辺を塞ぐ）', () => {
  it('手動の枝が使っている辺は自動割り当てで避ける', () => {
    // 真下の枝は本来 bottom だが、bottom が手動で塞がっていれば別の辺へ逃げる
    const ends: BranchEnd[] = [{ id: 'a', x: 100, y: 300 }]
    expect(assignBranchSides(center, ends, DECISION_OUT_SIDES, ['bottom']).get('a')).not.toBe(
      'bottom'
    )
  })

  it('塞がっていなければ従来どおり', () => {
    const ends: BranchEnd[] = [{ id: 'a', x: 100, y: 300 }]
    expect(assignBranchSides(center, ends, DECISION_OUT_SIDES, []).get('a')).toBe('bottom')
  })

  it('空きが尽きたら手動の辺へ重ねる（3 本以上のときは従来どおり被る）', () => {
    const ends: BranchEnd[] = [
      { id: 'a', x: 100, y: 300 },
      { id: 'b', x: 300, y: 100 },
      { id: 'c', x: -100, y: 100 }
    ]
    const map = assignBranchSides(center, ends, MERGE_IN_SIDES, ['top', 'right', 'left'])
    expect(map.size).toBe(3)
  })
})

describe('droppedSide', () => {
  const box: Box = { x: 50, y: 70, width: 100, height: 60 }

  it('外側寄りに落とせばその辺', () => {
    expect(droppedSide(box, { x: 148, y: 100 })).toBe('right')
    expect(droppedSide(box, { x: 100, y: 128 })).toBe('bottom')
  })

  it('中央付近は辺を狙っていないとみなして null', () => {
    expect(droppedSide(box, { x: 100, y: 100 })).toBeNull()
    expect(droppedSide(box, { x: 110, y: 105 })).toBeNull()
  })

  it('しきい値を下げれば中央寄りでも辺を返す', () => {
    expect(droppedSide(box, { x: 110, y: 100 }, 0.1)).toBe('right')
  })
})
