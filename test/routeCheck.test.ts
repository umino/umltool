import { describe, expect, it } from 'vitest'
import { polylineEntersRect, segmentEntersRect } from '../src/renderer/src/editor/routeCheck'

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
