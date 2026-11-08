// 矢じりの大きさと、線を矢じりの内側で止めるための寸法（X6 に依存しない純粋関数）。
//
// X6 の矢じり（block マーカー）は線の終点に置く SVG marker で、線そのものは
// 終点まで伸びる。矢じりの大きさが固定だと、線を太くしたとき
//   - 塗り矢印: 先端付近で線の角が矢じりの外へはみ出し、太い棒のように見える
//   - 開矢印: V 字が線に埋もれ、先端が相手の中へ食い込む
// そこで矢じりを線の太さに合わせて大きくし、線は矢じりの内側で止める
// （コネクタで終点を trim だけ手前へ縮め、marker の refX で先端を元の終点へ戻す）。

/** 矢じりの一辺の長さは線の太さのこの倍率（既定の大きさより小さくはしない） */
export const ARROW_SIZE_PER_WIDTH = 3

/**
 * 開矢印の頂点で、輪郭線の角（マイター）が経路の頂点より先へ出る長さの、
 * 輪郭線の太さに対する比。block マーカーは幅と高さが等しく、半頂角 θ は
 * tanθ = 1/2 なので、(1/2) / sinθ = √5 / 2。
 */
export const OPEN_MITER_PER_WIDTH = Math.sqrt(5) / 2

export interface ArrowGeometry {
  /** block マーカーの size（幅＝高さ） */
  size: number
  /** marker の refX。負の値で、先端を線の終点よりこの分だけ先へ出す */
  refX: number
}

/**
 * 線の太さに応じた矢じりの大きさと refX。
 *
 * - 塗り矢印: 線を矢じりの長さの半分だけ手前で止める。そこでの矢じりの幅は
 *   size / 2 ≥ 1.5 × 線の太さなので、線の角がはみ出さない
 * - 開矢印: 線を頂点から線の太さぶん手前で止める（V 字の付け根の塗りに隠れる）
 */
export function arrowGeometry(baseSize: number, lineWidth: number, open: boolean): ArrowGeometry {
  const size = Math.max(baseSize, Math.round(lineWidth * ARROW_SIZE_PER_WIDTH))
  const refX = open ? -lineWidth : -size / 2
  return { size, refX }
}

/**
 * 線の終点をどれだけ手前で止めるか。refX と組で使い、見た目の先端が元の終点
 * （ノードの輪郭など）にぴったり来るようにする。
 *
 * 経路の終点を trim だけ縮めると、矢じりの頂点は (縮めた終点) − refX に来る。
 * 開矢印は輪郭線の角がさらにマイターぶん先へ出るので、その分も縮める。
 */
export function arrowTrim(refX: number, open: boolean, markerStrokeWidth: number): number {
  const miter = open ? markerStrokeWidth * OPEN_MITER_PER_WIDTH : 0
  return Math.max(0, -refX + miter)
}
