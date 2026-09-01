// ノードの一括選択・整列まわりの計算。
//
// X6 に依存する処理は呼び出し側（GraphEditor / main）に置き、ここは矩形の
// 計算だけにしてテストできるようにする（`import type` は実行時に消えるので、
// 型としての Graph/Node は持ち込んでよい）。

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** 一括選択・移動の向き */
export type Direction = 'up' | 'down' | 'left' | 'right'

/** 整列の基準 */
export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

export const ALIGN_LABEL: Record<AlignMode, string> = {
  left: '左',
  centerX: '左右中央',
  right: '右',
  top: '上',
  centerY: '上下中央',
  bottom: '下'
}

export const DIRECTION_LABEL: Record<Direction, string> = {
  up: '上',
  down: '下',
  left: '左',
  right: '右'
}

/** 矩形をすべて含む矩形。空なら null */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * base の direction 側にあるか。
 *
 * 「下に空きを作る」ときに掴みたいのは、基準より下から始まっているものだけ。
 * 基準と縦に重なっているノードは、押し下げると重なり方が壊れるので含めない。
 */
export function isBeyond(base: Box, box: Box, direction: Direction): boolean {
  switch (direction) {
    case 'down':
      return box.y >= base.y + base.height
    case 'up':
      return box.y + box.height <= base.y
    case 'right':
      return box.x >= base.x + base.width
    case 'left':
      return box.x + box.width <= base.x
  }
}

/** direction 方向へ step ずらす量 */
export function directionDelta(
  direction: Direction,
  step: number
): { dx: number; dy: number } {
  return {
    dx: direction === 'left' ? -step : direction === 'right' ? step : 0,
    dy: direction === 'up' ? -step : direction === 'down' ? step : 0
  }
}

/** target（選択全体の外接矩形）に揃えたときの新しい位置 */
export function alignedPosition(box: Box, target: Box, mode: AlignMode): { x: number; y: number } {
  switch (mode) {
    case 'left':
      return { x: target.x, y: box.y }
    case 'centerX':
      return { x: target.x + (target.width - box.width) / 2, y: box.y }
    case 'right':
      return { x: target.x + target.width - box.width, y: box.y }
    case 'top':
      return { x: box.x, y: target.y }
    case 'centerY':
      return { x: box.x, y: target.y + (target.height - box.height) / 2 }
    case 'bottom':
      return { x: box.x, y: target.y + target.height - box.height }
  }
}

/**
 * 繋がっている相手と中心を揃えるための補正量。
 *
 * 手で置いた位置は数 px ずれることがあり、上下に繋いだフローがわずかに斜めに
 * なる（issue #35）。tolerance 以内の「揃えるつもりだったずれ」だけを直し、
 * それより大きいずらしは意図的な配置とみなして触らない。軸ごとに独立して、
 * 最も近い相手に合わせる。
 */
export function centerSnapOffset(
  box: Box,
  neighbours: Box[],
  tolerance: number
): { dx: number; dy: number } {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  let dx = 0
  let dy = 0
  for (const n of neighbours) {
    const ndx = n.x + n.width / 2 - cx
    const ndy = n.y + n.height / 2 - cy
    if (ndx !== 0 && Math.abs(ndx) <= tolerance && (dx === 0 || Math.abs(ndx) < Math.abs(dx))) {
      dx = ndx
    }
    if (ndy !== 0 && Math.abs(ndy) <= tolerance && (dy === 0 || Math.abs(ndy) < Math.abs(dy))) {
      dy = ndy
    }
  }
  return { dx, dy }
}
