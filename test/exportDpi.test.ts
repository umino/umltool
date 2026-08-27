import { describe, it, expect } from 'vitest'
import {
  CSS_DPI,
  DEFAULT_DPI,
  MAX_IMAGE_SIDE,
  resolveExportScale
} from '../src/renderer/src/export/raster'
import { applyJpegDpi, applyPngDpi, dpiToPixelsPerMeter } from '../src/renderer/src/export/dpiMetadata'

describe('resolveExportScale', () => {
  it('96dpi は等倍', () => {
    const s = resolveExportScale(CSS_DPI, 800, 600)
    expect(s.pixelRatio).toBe(1)
    expect([s.width, s.height]).toEqual([800, 600])
    expect(s.clamped).toBe(false)
  })

  it('96 未満の dpi は等倍より小さく書き出す', () => {
    const s = resolveExportScale(72, 800, 600)
    expect(s.pixelRatio).toBe(0.75)
    expect([s.width, s.height]).toEqual([600, 450])
    expect(s.clamped).toBe(false)
  })

  it('72dpi なら 8192px の上限に収まる図の範囲が広がる', () => {
    // 96dpi では上限に当たる大きさでも、72dpi なら要求どおり書き出せる
    expect(resolveExportScale(CSS_DPI, 10000, 800).clamped).toBe(true)
    expect(resolveExportScale(72, 10000, 800).clamped).toBe(false)
  })

  it('既定の 192dpi は 2 倍（従来の pixelRatio: 2 と同じ）', () => {
    const s = resolveExportScale(DEFAULT_DPI, 800, 600)
    expect(s.pixelRatio).toBe(2)
    expect([s.width, s.height]).toEqual([1600, 1200])
  })

  it('1 辺が上限を超えるときは倍率を下げる', () => {
    const s = resolveExportScale(384, 4000, 3000)
    expect(s.clamped).toBe(true)
    expect(s.width).toBe(MAX_IMAGE_SIDE)
    expect(s.height).toBe(6144)
    expect(s.dpi).toBeCloseTo(2.048 * CSS_DPI, 6)
  })

  it('縦長の図は高さで頭打ちになる（縦横比は保つ）', () => {
    const s = resolveExportScale(600, 1000, 5000)
    expect(s.height).toBe(MAX_IMAGE_SIDE)
    expect(s.width).toBe(Math.round(1000 * (MAX_IMAGE_SIDE / 5000)))
  })

  it('上限に収まっている限り dpi はそのまま', () => {
    const s = resolveExportScale(600, 1000, 1000)
    expect(s.clamped).toBe(false)
    expect(s.dpi).toBe(600)
    expect(s.width).toBe(6250)
  })

  it('maxSide は呼び出し側で変えられる', () => {
    const s = resolveExportScale(CSS_DPI, 4000, 100, 1000)
    expect(s.clamped).toBe(true)
    expect(s.width).toBe(1000)
  })

  it('0 以下の dpi でも 1px 以上の画像になる', () => {
    const s = resolveExportScale(0, 10, 10)
    expect(s.width).toBeGreaterThanOrEqual(1)
    expect(s.height).toBeGreaterThanOrEqual(1)
  })
})

/** 最小の PNG（署名 + IHDR + IDAT + IEND）。中身の妥当性までは問わない */
function fakePng(): Uint8Array {
  const chunk = (type: string, data: number[]): number[] => [
    (data.length >>> 24) & 0xff,
    (data.length >>> 16) & 0xff,
    (data.length >>> 8) & 0xff,
    data.length & 0xff,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0 // CRC（読み取りには使わない）
  ]
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', new Array(13).fill(0)),
    ...chunk('IDAT', [1, 2, 3]),
    ...chunk('IEND', [])
  ])
}

function findChunk(png: Uint8Array, type: string): number {
  for (let pos = 8; pos + 8 <= png.length; ) {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    const length = view.getUint32(pos)
    const t = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7])
    if (t === type) return pos
    pos += 12 + length
  }
  return -1
}

describe('applyPngDpi', () => {
  it('IHDR の直後に pHYs を挿入する', () => {
    const out = applyPngDpi(fakePng(), 192)
    const at = findChunk(out, 'pHYs')
    expect(at).toBe(8 + 25) // 署名 + IHDR チャンク
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
    expect(view.getUint32(at)).toBe(9)
    expect(view.getUint32(at + 8)).toBe(dpiToPixelsPerMeter(192))
    expect(view.getUint32(at + 12)).toBe(dpiToPixelsPerMeter(192))
    expect(out[at + 16]).toBe(1) // 単位: メートル
    expect(out.length).toBe(fakePng().length + 21)
  })

  it('既にある pHYs は差し替える（増殖しない）', () => {
    const once = applyPngDpi(fakePng(), 192)
    const twice = applyPngDpi(once, 384)
    expect(twice.length).toBe(once.length)
    const view = new DataView(twice.buffer, twice.byteOffset, twice.byteLength)
    expect(view.getUint32(findChunk(twice, 'pHYs') + 8)).toBe(dpiToPixelsPerMeter(384))
  })

  it('IDAT より前に入る', () => {
    const out = applyPngDpi(fakePng(), 300)
    expect(findChunk(out, 'pHYs')).toBeLessThan(findChunk(out, 'IDAT'))
  })

  it('PNG でないデータはそのまま返す', () => {
    const junk = new Uint8Array([1, 2, 3, 4])
    expect(applyPngDpi(junk, 192)).toBe(junk)
  })

  it('96dpi は約 3780 ピクセル/メートル', () => {
    expect(dpiToPixelsPerMeter(96)).toBe(3780)
  })
})

/** SOI + APP0(JFIF) だけの最小 JPEG ヘッダ */
function fakeJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00
  ])
}

describe('applyJpegDpi', () => {
  it('JFIF の密度をインチ単位で書き換える', () => {
    const out = applyJpegDpi(fakeJpeg(), 192)
    expect(out[13]).toBe(1)
    expect((out[14] << 8) | out[15]).toBe(192)
    expect((out[16] << 8) | out[17]).toBe(192)
  })

  it('元データは書き換えない', () => {
    const src = fakeJpeg()
    applyJpegDpi(src, 300)
    expect(src[13]).toBe(0)
  })

  it('JFIF ヘッダが無ければそのまま返す', () => {
    const junk = new Uint8Array([0xff, 0xd8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(applyJpegDpi(junk, 192)).toBe(junk)
  })
})
