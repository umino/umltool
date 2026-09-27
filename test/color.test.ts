import { describe, expect, it } from 'vitest'
import { alphaPercent, formatColor, parseColor } from '../src/renderer/src/editor/color'

describe('parseColor', () => {
  it('reads #rrggbb as opaque', () => {
    expect(parseColor('#2D6CDF')).toEqual({ hex: '#2d6cdf', alpha: 1 })
  })

  it('expands #rgb', () => {
    expect(parseColor('#abc')).toEqual({ hex: '#aabbcc', alpha: 1 })
  })

  it('reads the alpha byte of #rrggbbaa', () => {
    const c = parseColor('#2d6cdf80')
    expect(c.hex).toBe('#2d6cdf')
    expect(c.alpha).toBeCloseTo(128 / 255)
  })

  it('treats transparent / none as fully transparent fallback', () => {
    expect(parseColor('transparent', '#ffffff')).toEqual({ hex: '#ffffff', alpha: 0 })
    expect(parseColor('none', '#ffffff')).toEqual({ hex: '#ffffff', alpha: 0 })
  })

  it('falls back to an opaque color for unknown values', () => {
    expect(parseColor('red', '#123456')).toEqual({ hex: '#123456', alpha: 1 })
  })
})

describe('formatColor', () => {
  it('keeps #rrggbb when opaque', () => {
    expect(formatColor('#2d6cdf', 1)).toBe('#2d6cdf')
  })

  it('appends the alpha byte when translucent', () => {
    expect(formatColor('#2d6cdf', 0.5)).toBe('#2d6cdf80')
    expect(formatColor('#2d6cdf', 0)).toBe('#2d6cdf00')
  })

  it('clamps out-of-range alpha', () => {
    expect(formatColor('#2d6cdf', 2)).toBe('#2d6cdf')
    expect(formatColor('#2d6cdf', -1)).toBe('#2d6cdf00')
  })

  it('round-trips through parseColor', () => {
    const c = parseColor(formatColor('#c0392b', 0.3))
    expect(c.hex).toBe('#c0392b')
    expect(alphaPercent(c.alpha)).toBe(30)
  })
})
