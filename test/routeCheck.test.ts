import { describe, expect, it } from 'vitest'
import { polylineEntersRect, segmentEntersRect, sideAwareRoute, sideOfPointOnRect } from '../src/renderer/src/editor/routeCheck'

const box = { x: 100, y: 100, width: 100, height: 40 }

describe('segmentEntersRect', () => {
  it('横切る線は通過', () => {
    expect(segmentEntersRect({ x: 50, y: 120 }, { x: 250, y: 120 }, box)).toBe(true)
  })

  it('外側を回る線は通過しない', () => {
    expect(segmentEntersRect({ x: 50, y: 90 }, { x: 250, y: 90 }, box)).toBe(false)
  })

  it('輪郭から出ていく線（端点が辺の上）は通過しない', () => {
    expect(segmentEntersRect({ x: 150, y: 140 }, { x: 150, y: 300 }, box)).toBe(false)
  })

  it('輪郭の下辺から上へ抜ける線は通過', () => {
    expect(segmentEntersRect({ x: 150, y: 140 }, { x: 150, y: 50 }, box)).toBe(true)
  })

  it('辺に沿って走る線は通過しない', () => {
    expect(segmentEntersRect({ x: 50, y: 100 }, { x: 250, y: 100 }, box)).toBe(false)
  })
})

describe('polylineEntersRect', () => {
  it('どこか 1 区間でも中を通れば通過', () => {
    const pts = [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 200 }
    ]
    expect(polylineEntersRect(pts, box)).toBe(true)
  })
})

describe('sideOfPointOnRect', () => {
  const rect = { x: 0, y: 0, width: 100, height: 40 }
  it('辺の中央はその辺', () => {
    expect(sideOfPointOnRect({ x: 50, y: 0 }, rect)).toBe('top')
    expect(sideOfPointOnRect({ x: 50, y: 40 }, rect)).toBe('bottom')
    expect(sideOfPointOnRect({ x: 0, y: 20 }, rect)).toBe('left')
    expect(sideOfPointOnRect({ x: 100, y: 20.5 }, rect)).toBe('right')
  })
  it('角・内側・外側は null', () => {
    expect(sideOfPointOnRect({ x: 0, y: 0 }, rect)).toBeNull()
    expect(sideOfPointOnRect({ x: 50, y: 20 }, rect)).toBeNull()
    expect(sideOfPointOnRect({ x: 200, y: 0 }, rect)).toBeNull()
  })
})

describe('sideAwareRoute', () => {
  it('向かい合う辺が同じ軸上なら直線', () => {
    expect(sideAwareRoute({ x: 50, y: 58 }, 'top', { x: 50, y: 42 }, 'bottom')).toEqual([])
  })
  it('向かい合う辺がずれていれば中間で曲がる', () => {
    expect(sideAwareRoute({ x: 0, y: 0 }, 'bottom', { x: 40, y: 100 }, 'top')).toEqual([
      { x: 0, y: 50 },
      { x: 40, y: 50 }
    ])
  })
  it('直交する辺は L 字', () => {
    expect(sideAwareRoute({ x: 0, y: 0 }, 'right', { x: 100, y: 80 }, 'top')).toEqual([
      { x: 100, y: 0 }
    ])
  })
  it('どの折れ線も出入りの辺に垂直', () => {
    const sides = ['top', 'right', 'bottom', 'left'] as const
    for (const ss of sides) {
      for (const ts of sides) {
        const s = { x: 0, y: 0 }
        const t = { x: 30, y: -20 }
        const pts = [s, ...sideAwareRoute(s, ss, t, ts), t]
        const first = pts[1]
        const last = pts[pts.length - 2]
        if (ss === 'top' || ss === 'bottom') expect(first.x).toBe(s.x)
        else expect(first.y).toBe(s.y)
        if (ts === 'top' || ts === 'bottom') expect(last.x).toBe(t.x)
        else expect(last.y).toBe(t.y)
        for (let i = 1; i < pts.length; i++) {
          expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true)
        }
      }
    }
  })
})
