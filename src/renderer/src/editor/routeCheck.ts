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

export type RectSide = 'top' | 'right' | 'bottom' | 'left'

/**
 * 点が矩形のどの辺の上に乗っているか。角（2 辺に乗る）や辺の外は null。
 *
 * フローの端点（辺の中央・ポート）がどの辺から出入りするかを決めるのに使う。
 * manhattan ルータは既定で上下左右どこからでも出られるため、上辺中央の端点から
 * 左へ出る経路を選ぶと線が上辺に沿って走り、角に付いたように見える（issue #63）。
 */
export function sideOfPointOnRect(p: Pt, rect: Rect, tolerance = 1): RectSide | null {
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= tolerance
  const withinX = p.x >= rect.x - tolerance && p.x <= rect.x + rect.width + tolerance
  const withinY = p.y >= rect.y - tolerance && p.y <= rect.y + rect.height + tolerance
  const sides: RectSide[] = []
  if (withinX && near(p.y, rect.y)) sides.push('top')
  if (withinX && near(p.y, rect.y + rect.height)) sides.push('bottom')
  if (withinY && near(p.x, rect.x)) sides.push('left')
  if (withinY && near(p.x, rect.x + rect.width)) sides.push('right')
  return sides.length === 1 ? sides[0] : null
}

const SIDE_DIR: Record<RectSide, Pt> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
}

const isVerticalSide = (s: RectSide): boolean => s === 'top' || s === 'bottom'

/**
 * 端点の辺から垂直に出て、相手の辺へ垂直に入る直交経路（両端を除く折れ点）。
 *
 * manhattan が経路を見つけられないとき（ノードの間隔が余白より狭いなど）の
 * 代わり。X6 既定の orth は出入りの辺を気にしないため、辺に沿って走って角に
 * 付くことがある（issue #63）。障害物は避けない。
 */
export function sideAwareRoute(
  source: Pt,
  sourceSide: RectSide,
  target: Pt,
  targetSide: RectSide,
  stub = 12
): Pt[] {
  const sd = SIDE_DIR[sourceSide]
  const td = SIDE_DIR[targetSide]
  const vs = isVerticalSide(sourceSide)
  const vt = isVerticalSide(targetSide)
  const ahead = (from: Pt, dir: Pt, to: Pt): boolean =>
    (to.x - from.x) * dir.x + (to.y - from.y) * dir.y > 0
  // 向かい合う辺: 中間で 1 度だけ曲がる（同じ軸上なら直線）
  if (vs === vt && sd.x === -td.x && sd.y === -td.y && ahead(source, sd, target)) {
    if (vs) {
      if (source.x === target.x) return []
      const midY = (source.y + target.y) / 2
      return [{ x: source.x, y: midY }, { x: target.x, y: midY }]
    }
    if (source.y === target.y) return []
    const midX = (source.x + target.x) / 2
    return [{ x: midX, y: source.y }, { x: midX, y: target.y }]
  }
  // 直交する辺: 角 1 つの L 字で済むとき
  if (vs !== vt) {
    const corner = vs ? { x: source.x, y: target.y } : { x: target.x, y: source.y }
    if (ahead(source, sd, corner) && ahead(target, td, corner)) return [corner]
  }
  // それ以外: 両端から少し出てから繋ぐ
  const s1 = { x: source.x + sd.x * stub, y: source.y + sd.y * stub }
  const t1 = { x: target.x + td.x * stub, y: target.y + td.y * stub }
  const corner = vs ? { x: t1.x, y: s1.y } : { x: s1.x, y: t1.y }
  return [s1, corner, t1]
}
