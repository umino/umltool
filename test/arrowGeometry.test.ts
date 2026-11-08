import { describe, expect, it } from 'vitest'
import {
  ARROW_SIZE_PER_WIDTH,
  OPEN_MITER_PER_WIDTH,
  arrowGeometry,
  arrowTrim
} from '../src/renderer/src/editor/arrowGeometry'

describe('arrowGeometry', () => {
  it('細い線では既定の大きさのまま', () => {
    expect(arrowGeometry(12, 1.5, false).size).toBe(12)
    expect(arrowGeometry(10, 3, false).size).toBe(10)
  })

  it('太い線では線の太さに比例して大きくなる', () => {
    expect(arrowGeometry(10, 8, false).size).toBe(8 * ARROW_SIZE_PER_WIDTH)
    expect(arrowGeometry(12, 12, true).size).toBe(36)
  })

  it('塗り矢印は線を矢じりの中ほどで止める（そこで矢じりは線より太い）', () => {
    for (const w of [1.5, 5, 8, 12]) {
      const { size, refX } = arrowGeometry(10, w, false)
      const trim = arrowTrim(refX, false, 1)
      // 先端から trim の位置での矢じりの幅（高さ＝幅＝size の三角形）
      const widthAtLineEnd = size * (trim / size)
      expect(widthAtLineEnd).toBeGreaterThanOrEqual(w)
      expect(trim).toBeLessThan(size)
    }
  })

  it('開矢印は頂点のマイターぶんも縮めて、見た目の先端を終点に合わせる', () => {
    const { refX } = arrowGeometry(12, 6, true)
    const trim = arrowTrim(refX, true, 6)
    // 頂点（経路上）＝ 縮めた終点 − refX、見た目の先端 ＝ 頂点 ＋ マイター
    const apexFromOriginalEnd = -trim - refX
    expect(apexFromOriginalEnd + 6 * OPEN_MITER_PER_WIDTH).toBeCloseTo(0)
  })
})
