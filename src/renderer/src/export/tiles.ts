// 書き出し画像の分割（DOM に依存しない純粋関数）。
//
// 縦横どちらかが大きい画像は、貼り付け先（Excel / PowerPoint / Word など）で
// 扱いにくい。1 辺が上限を超えるときは、上限以内のタイルに分けて書き出す。
// 端だけ細いタイルが残らないよう、行・列ごとにほぼ均等な大きさに割る。

/** 既定の分割しきい値（1 辺の px） */
export const DEFAULT_SPLIT_SIZE = 4096

/** ツールバーに並べる分割しきい値の候補 */
export const SPLIT_SIZE_CHOICES = [2048, 4096, 8192] as const

export interface Tile {
  /** 0 始まりの行・列番号 */
  row: number
  col: number
  /** 全体画像の中での位置と大きさ（px） */
  x: number
  y: number
  width: number
  height: number
}

/** length を maxPart 以内のほぼ均等な区間に分ける（[開始, 長さ] の並び） */
function splitLength(length: number, maxPart: number): Array<[number, number]> {
  const count = Math.max(1, Math.ceil(length / maxPart))
  const parts: Array<[number, number]> = []
  for (let i = 0; i < count; i++) {
    const start = Math.round((length * i) / count)
    const end = Math.round((length * (i + 1)) / count)
    parts.push([start, end - start])
  }
  return parts
}

/**
 * width × height の画像を、1 辺 maxSide 以内のタイルに分ける。
 * 収まっていれば 1 枚（全体）を返す。並びは行優先（左上 → 右下）。
 */
export function splitIntoTiles(width: number, height: number, maxSide: number): Tile[] {
  const limit = Math.max(1, Math.floor(maxSide))
  const cols = splitLength(Math.max(1, width), limit)
  const rows = splitLength(Math.max(1, height), limit)
  const tiles: Tile[] = []
  rows.forEach(([y, h], row) => {
    cols.forEach(([x, w], col) => {
      tiles.push({ row, col, x, y, width: w, height: h })
    })
  })
  return tiles
}

/** タイルのファイル名に付ける接尾辞（例: `_r1c2`。1 枚だけなら空） */
export function tileSuffix(tile: Tile, total: number): string {
  return total <= 1 ? '' : `_r${tile.row + 1}c${tile.col + 1}`
}
