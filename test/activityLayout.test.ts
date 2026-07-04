import { describe, it, expect } from 'vitest'
import { ACTIVITY } from '../src/renderer/src/editor/constants'
import { parseActivity } from '../src/renderer/src/text/activityParser'
import { layoutActivity } from '../src/renderer/src/text/activityLayout'

describe('activity layout', () => {
  it('ノードを上から一定ステップの y に積む', () => {
    const layout = layoutActivity(parseActivity('start\n:a;\n:b;\nstop'))
    const ys = layout.nodes.map((n) => n.centerY)
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBe(ACTIVITY.stepY)
    }
  })

  it('レーン無しでは col が x の列になる', () => {
    const layout = layoutActivity(
      parseActivity('start\nif (x?) then (y)\n:a;\nelse (n)\n:b;\nendif\nstop')
    )
    const a = layout.nodes.find((n) => n.label === 'a')!
    const b = layout.nodes.find((n) => n.label === 'b')!
    expect(a.centerX).toBe(ACTIVITY.firstColX)
    expect(b.centerX).toBe(ACTIVITY.firstColX + ACTIVITY.colGapX)
    expect(layout.lanes).toHaveLength(0)
  })

  it('レーンがあるときはレーン中心に配置しレーン矩形を返す', () => {
    const layout = layoutActivity(parseActivity('|A|\nstart\n:a;\n|B|\n:b;\nstop'))
    expect(layout.lanes).toHaveLength(2)
    const [laneA, laneB] = layout.lanes
    expect(laneB.x - laneA.x).toBe(ACTIVITY.laneWidth)
    const a = layout.nodes.find((n) => n.label === 'a')!
    const b = layout.nodes.find((n) => n.label === 'b')!
    expect(a.centerX).toBe(laneA.x + ACTIVITY.laneWidth / 2)
    expect(b.centerX).toBe(laneB.x + ACTIVITY.laneWidth / 2)
    // レーンは全ノードを縦に覆う
    const maxY = Math.max(...layout.nodes.map((n) => n.centerY))
    expect(laneA.y + laneA.height).toBeGreaterThan(maxY)
  })

  it('種別ごとの既定サイズが入る', () => {
    const layout = layoutActivity(parseActivity('start\n:a;\nstop'))
    const [initial, action, final] = layout.nodes
    expect(initial.width).toBe(ACTIVITY.terminal.size)
    expect(action.width).toBe(ACTIVITY.action.width)
    expect(final.height).toBe(ACTIVITY.terminal.size)
  })
})
