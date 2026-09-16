import { describe, it, expect } from 'vitest'
import { PANE, clampPaneWidth } from '../src/renderer/src/ui/paneSize'

describe('clampPaneWidth', () => {
  // 十分に広いウィンドウ（上限・下限だけが効く）
  const wide = 1920

  it('範囲内はそのまま（小数は丸める）', () => {
    expect(clampPaneWidth('left', 420, wide, 260)).toBe(420)
    expect(clampPaneWidth('left', 420.6, wide, 260)).toBe(421)
    expect(clampPaneWidth('right', 380, wide, 280)).toBe(380)
  })

  it('左右それぞれの下限・上限で止まる', () => {
    expect(clampPaneWidth('left', 50, wide, 260)).toBe(PANE.left.min)
    expect(clampPaneWidth('left', 5000, wide, 260)).toBe(PANE.left.max)
    expect(clampPaneWidth('right', 50, wide, 280)).toBe(PANE.right.min)
    expect(clampPaneWidth('right', 5000, wide, 280)).toBe(PANE.right.max)
  })

  it('反対側のペインとキャンバスの取り分を残す', () => {
    // 1000 - 右 260 - キャンバス 320 - 境界 12 = 408 までしか広げられない
    expect(clampPaneWidth('left', 700, 1000, 260)).toBe(408)
    // 左を広げていれば、右はその分だけ狭い上限になる
    expect(clampPaneWidth('right', 600, 1266, 674)).toBe(260)
  })

  it('ウィンドウが狭すぎるときは下限を優先する', () => {
    expect(clampPaneWidth('left', 400, 600, 260)).toBe(PANE.left.min)
    expect(clampPaneWidth('right', 400, 600, 280)).toBe(PANE.right.min)
  })

  it('数値でなければ既定値', () => {
    expect(clampPaneWidth('left', Number.NaN, wide, 260)).toBe(PANE.left.default)
    expect(clampPaneWidth('right', Number.NaN, wide, 280)).toBe(PANE.right.default)
  })
})
