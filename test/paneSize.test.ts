import { describe, it, expect } from 'vitest'
import { LEFT_PANE, clampPaneWidth } from '../src/renderer/src/ui/paneSize'

describe('clampPaneWidth', () => {
  // 十分に広いウィンドウ（上限・下限だけが効く）
  const wide = 1920

  it('範囲内はそのまま（小数は丸める）', () => {
    expect(clampPaneWidth(420, wide)).toBe(420)
    expect(clampPaneWidth(420.6, wide)).toBe(421)
  })

  it('下限・上限で止まる', () => {
    expect(clampPaneWidth(50, wide)).toBe(LEFT_PANE.min)
    expect(clampPaneWidth(5000, wide)).toBe(LEFT_PANE.max)
  })

  it('キャンバスと右パネルの取り分を残す', () => {
    // 1000px のウィンドウでは 1000 - 586 = 414 までしか広げられない
    expect(clampPaneWidth(700, 1000)).toBe(414)
  })

  it('ウィンドウが狭すぎるときは下限を優先する', () => {
    expect(clampPaneWidth(400, 600)).toBe(LEFT_PANE.min)
  })

  it('数値でなければ既定値', () => {
    expect(clampPaneWidth(Number.NaN, wide)).toBe(LEFT_PANE.default)
  })
})
