import { describe, it, expect } from 'vitest'
import {
  alignedPosition,
  centerSnapOffset,
  directionDelta,
  isBeyond,
  unionBox,
  type Box
} from '../src/renderer/src/editor/arrange'

const box = (x: number, y: number, width = 100, height = 40): Box => ({ x, y, width, height })

describe('unionBox', () => {
  it('すべてを含む矩形を返す', () => {
    expect(unionBox([box(10, 10), box(60, 100, 40, 20)])).toEqual({
      x: 10,
      y: 10,
      width: 100,
      height: 110
    })
  })

  it('空なら null', () => {
    expect(unionBox([])).toBeNull()
  })
})

describe('isBeyond', () => {
  const base = box(100, 100, 100, 40) // 100..200 × 100..140

  it('下端より下から始まるものだけが「下」', () => {
    expect(isBeyond(base, box(0, 140), 'down')).toBe(true)
    expect(isBeyond(base, box(0, 500), 'down')).toBe(true)
    expect(isBeyond(base, box(0, 139), 'down')).toBe(false)
  })

  it('縦に重なっているものは押し下げの対象にしない', () => {
    // 基準の途中から始まるノード。下げると重なり方が壊れるので含めない
    expect(isBeyond(base, box(300, 120), 'down')).toBe(false)
  })

  it('上・左・右も同じ考え方', () => {
    expect(isBeyond(base, box(0, 40), 'up')).toBe(true)
    expect(isBeyond(base, box(0, 61), 'up')).toBe(false)
    expect(isBeyond(base, box(200, 0), 'right')).toBe(true)
    expect(isBeyond(base, box(199, 0), 'right')).toBe(false)
    expect(isBeyond(base, box(0, 0), 'left')).toBe(true)
    expect(isBeyond(base, box(1, 0), 'left')).toBe(false)
  })

  it('横位置は問わない（下にあれば離れていても掴む）', () => {
    expect(isBeyond(base, box(-900, 300), 'down')).toBe(true)
  })
})

describe('directionDelta', () => {
  it('向きと歩幅から移動量を作る', () => {
    expect(directionDelta('down', 8)).toEqual({ dx: 0, dy: 8 })
    expect(directionDelta('up', 8)).toEqual({ dx: 0, dy: -8 })
    expect(directionDelta('left', 40)).toEqual({ dx: -40, dy: 0 })
    expect(directionDelta('right', 40)).toEqual({ dx: 40, dy: 0 })
  })
})

describe('alignedPosition', () => {
  const target = box(0, 0, 200, 200)

  it('左右は幅の違いを吸収して揃える', () => {
    expect(alignedPosition(box(37, 50, 100, 40), target, 'left').x).toBe(0)
    expect(alignedPosition(box(37, 50, 100, 40), target, 'centerX').x).toBe(50)
    expect(alignedPosition(box(37, 50, 100, 40), target, 'right').x).toBe(100)
  })

  it('揃えない軸は動かさない', () => {
    expect(alignedPosition(box(37, 50, 100, 40), target, 'centerX').y).toBe(50)
    expect(alignedPosition(box(37, 50, 100, 40), target, 'centerY').x).toBe(37)
  })

  it('上下も同じ', () => {
    expect(alignedPosition(box(0, 33, 100, 40), target, 'top').y).toBe(0)
    expect(alignedPosition(box(0, 33, 100, 40), target, 'centerY').y).toBe(80)
    expect(alignedPosition(box(0, 33, 100, 40), target, 'bottom').y).toBe(160)
  })

  it('中央揃えは幅の違うノードでも中心が一致する', () => {
    const wide = box(0, 0, 160, 40)
    const narrow = box(20, 100, 60, 40)
    const a = alignedPosition(wide, target, 'centerX')
    const b = alignedPosition(narrow, target, 'centerX')
    expect(a.x + wide.width / 2).toBe(b.x + narrow.width / 2)
  })
})

describe('centerSnapOffset', () => {
  const moved = box(100, 100, 100, 40) // 中心 (150, 120)

  it('わずかなずれは揃える', () => {
    // 相手の中心 x は 153 → 3px 右へ寄せる
    expect(centerSnapOffset(moved, [box(103, 300, 100, 40)], 8).dx).toBe(3)
  })

  it('大きなずれは意図した配置とみなして触らない', () => {
    expect(centerSnapOffset(moved, [box(140, 300, 100, 40)], 8)).toEqual({ dx: 0, dy: 0 })
  })

  it('ちょうど許容値の外は動かさない', () => {
    expect(centerSnapOffset(moved, [box(109, 300)], 8).dx).toBe(0)
    expect(centerSnapOffset(moved, [box(108, 300)], 8).dx).toBe(8)
  })

  it('既に揃っていれば 0', () => {
    expect(centerSnapOffset(moved, [box(100, 300)], 8)).toEqual({ dx: 0, dy: 0 })
  })

  it('複数の相手がいれば近い方に合わせる', () => {
    expect(centerSnapOffset(moved, [box(105, 300), box(102, 400)], 8).dx).toBe(2)
  })

  it('縦横は別々に判断する（上に繋がる相手と左に繋がる相手）', () => {
    const above = box(104, 20, 100, 40) // dx = 4
    const left = box(-200, 96, 100, 40) // dy = -4
    expect(centerSnapOffset(moved, [above, left], 8)).toEqual({ dx: 4, dy: -4 })
  })

  it('相手がいなければ 0', () => {
    expect(centerSnapOffset(moved, [], 8)).toEqual({ dx: 0, dy: 0 })
  })
})
