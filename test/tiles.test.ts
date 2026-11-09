import { describe, expect, it } from 'vitest'
import { splitIntoTiles, tileSuffix } from '../src/renderer/src/export/tiles'

describe('splitIntoTiles', () => {
  it('上限以内なら 1 枚のまま', () => {
    expect(splitIntoTiles(4096, 1000, 4096)).toEqual([
      { row: 0, col: 0, x: 0, y: 0, width: 4096, height: 1000 }
    ])
  })

  it('上限を超えた辺だけ分け、ほぼ均等にする', () => {
    const tiles = splitIntoTiles(9000, 3000, 4096)
    expect(tiles.map((t) => [t.row, t.col, t.x, t.width])).toEqual([
      [0, 0, 0, 3000],
      [0, 1, 3000, 3000],
      [0, 2, 6000, 3000]
    ])
    expect(tiles.every((t) => t.height === 3000)).toBe(true)
  })

  it('縦横とも分け、隙間も重なりもなく全体を覆う', () => {
    const W = 10001
    const H = 8193
    const tiles = splitIntoTiles(W, H, 4096)
    expect(tiles.length).toBe(3 * 3)
    for (const t of tiles) {
      expect(t.width).toBeLessThanOrEqual(4096)
      expect(t.height).toBeLessThanOrEqual(4096)
    }
    const area = tiles.reduce((s, t) => s + t.width * t.height, 0)
    expect(area).toBe(W * H)
    const lastRow = tiles.filter((t) => t.col === 2)
    expect(lastRow.every((t) => t.x + t.width === W)).toBe(true)
  })

  it('並びは行優先', () => {
    const order = splitIntoTiles(5000, 5000, 4096).map((t) => `${t.row}${t.col}`)
    expect(order).toEqual(['00', '01', '10', '11'])
  })
})

describe('tileSuffix', () => {
  it('1 枚なら付けず、複数なら行・列を 1 始まりで付ける', () => {
    const tiles = splitIntoTiles(5000, 100, 4096)
    expect(tileSuffix(tiles[0], 1)).toBe('')
    expect(tileSuffix(tiles[1], tiles.length)).toBe('_r1c2')
  })
})
