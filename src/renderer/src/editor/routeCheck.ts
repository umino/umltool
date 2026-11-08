// 線の経路がノードの上を通っていないかの判定（X6 に依存しない純粋関数）。

export interface Pt {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 線分 a-b が矩形の内側（辺から inset だけ内に縮めた範囲）を通るか。
 * 端点がちょうど輪郭に乗っている場合（ノードに出入りする線）は通過とみなさない。
 */
export function segmentEntersRect(a: Pt, b: Pt, rect: Rect, inset = 1): boolean {
  const x0 = rect.x + inset
  const y0 = rect.y + inset
  const x1 = rect.x + rect.width - inset
  const y1 = rect.y + rect.height - inset
  if (x1 <= x0 || y1 <= y0) return false
  // Liang–Barsky で線分を矩形に切り取り、残る長さがあれば内側を通っている
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (
    clip(-dx, a.x - x0) &&
    clip(dx, x1 - a.x) &&
    clip(-dy, a.y - y0) &&
    clip(dy, y1 - a.y)
  ) {
    const len = Math.hypot(dx, dy) * (t1 - t0)
    return len > 0.5
  }
  return false
}

/** 折れ線（始点・経由点・終点）がいずれかの矩形の内側を通るか */
export function polylineEntersRect(points: Pt[], rect: Rect, inset = 1): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    if (segmentEntersRect(points[i], points[i + 1], rect, inset)) return true
  }
  return false
}
