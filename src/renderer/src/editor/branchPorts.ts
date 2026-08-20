// フローがノードのどの辺に付くかの割り当て。
//
// 分岐（デシジョン）は下・右・左へ、合流（マージ）は上・右・左から、それぞれ枝が
// 重ならないように出入りさせる。枝が割り当て可能な辺の数を超えたら重複を許す
// （合流は多数の遷移先になりうるため）。
//
// それ以外のノードへ入るフローは、上から下へ流れる図を素直に読めるよう上辺中央に
// 揃える。合流だけは枝が集まるので、この規則ではなく上の割り当てに任せる。
//
// 計算部はグラフ非依存の純関数にしてユニットテスト対象にする。

export type Side = 'top' | 'right' | 'bottom' | 'left'

/** 矩形（位置とサイズ） */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 合流以外のノードへ入るフローの接続辺。
 *
 * 送信元が送信先の完全に上にある（縦に重なっていない）ときだけ上辺中央に付ける。
 * 横並びや下から上へ向かう場合は null を返し、既定の「近い辺を選ぶ」挙動に任せる。
 */
export function flowTargetSide(source: Box, target: Box): Side | null {
  return source.y + source.height <= target.y ? 'top' : null
}

/**
 * 点がノードのどの辺に一番近いか。
 *
 * ノードの中心から見た相対位置を「半幅・半高で割った比」で比べる。縦横比に
 * 依らず「上下左右のどこを狙ったか」が素直に決まるので、小さな分岐・合流でも
 * 離した位置の辺に付けられる（issue #25）。
 */
export function nearestSide(box: Box, point: { x: number; y: number }): Side {
  const dx = (point.x - (box.x + box.width / 2)) / Math.max(1, box.width / 2)
  const dy = (point.y - (box.y + box.height / 2)) / Math.max(1, box.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

/**
 * 落とした位置から接続する辺を決める。ノードの中央付近（どの辺も狙っていない）
 * なら null を返し、既定の「相手に近い辺」に任せる。
 *
 * threshold は中心からの距離の比（0〜1）。0.5 ならノードの外側半分を狙ったとき
 * だけ辺の指定とみなす。
 */
export function droppedSide(
  box: Box,
  point: { x: number; y: number },
  threshold = 0.5
): Side | null {
  const dx = (point.x - (box.x + box.width / 2)) / Math.max(1, box.width / 2)
  const dy = (point.y - (box.y + box.height / 2)) / Math.max(1, box.height / 2)
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null
  return nearestSide(box, point)
}

/** 分岐/合流ノードから見た枝 1 本 */
export interface BranchEnd {
  /** エッジ ID。同点時の決定的なタイブレークに使う */
  id: string
  /** 相手側の中心座標 */
  x: number
  y: number
}

const SIDE_VECTOR: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
}

/** 分岐の出口。下を最優先にして、被る分を右→左へ逃がす */
export const DECISION_OUT_SIDES: Side[] = ['bottom', 'right', 'left']

/** 合流の入口。上を最優先にして、被る分を右→左へ逃がす */
export const MERGE_IN_SIDES: Side[] = ['top', 'right', 'left']

/**
 * 相手がその辺の方向にどれだけ沿っているか（-1〜1）。
 * 真横に並ぶ相手なら right/left が 1 に近づく。
 */
function affinity(center: { x: number; y: number }, end: BranchEnd, side: Side): number {
  const dx = end.x - center.x
  const dy = end.y - center.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return 0
  const v = SIDE_VECTOR[side]
  return (dx * v.x + dy * v.y) / len
}

/**
 * 枝に辺を割り当てる。位置関係に素直な辺を優先しつつ、同じ辺が重複しないようにする。
 *
 * allowed の本数を超えた枝は、空きが無いので最も素直な辺へ重ねる（issue #10 の
 * 「3 つ以上あるときは被っても良い」に相当）。
 *
 * occupied には「ユーザーが手で決めた枝が既に使っている辺」を渡す。自動割り当ての
 * 対象外でも場所は塞いでいるので、空き扱いにすると手動の枝へ重なってしまう
 * （issue #25）。
 */
export function assignBranchSides(
  center: { x: number; y: number },
  ends: BranchEnd[],
  allowed: Side[],
  occupied: Side[] = []
): Map<string, Side> {
  const result = new Map<string, Side>()
  if (ends.length === 0 || allowed.length === 0) return result

  // (枝, 辺) の全組を相性の良い順に見て、両方空いていれば確定する貪欲法。
  // 枝数が高々数本なので総当たりで十分。
  const pairs: { end: BranchEnd; side: Side; score: number }[] = []
  for (const end of ends) {
    for (const side of allowed) {
      pairs.push({ end, side, score: affinity(center, end, side) })
    }
  }
  pairs.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // 同点なら allowed の並び（＝既定の優先順）を優先し、最後は id で決定的にする
    const sideDiff = allowed.indexOf(a.side) - allowed.indexOf(b.side)
    if (sideDiff !== 0) return sideDiff
    return a.end.id < b.end.id ? -1 : a.end.id > b.end.id ? 1 : 0
  })

  const usedSides = new Set<Side>(occupied)
  for (const pair of pairs) {
    if (result.has(pair.end.id) || usedSides.has(pair.side)) continue
    result.set(pair.end.id, pair.side)
    usedSides.add(pair.side)
  }

  // 辺が足りずに溢れた枝は、空き状況を無視して最も素直な辺へ重ねる
  for (const end of ends) {
    if (result.has(end.id)) continue
    let best = allowed[0]
    let bestScore = -Infinity
    for (const side of allowed) {
      const score = affinity(center, end, side)
      if (score > bestScore) {
        best = side
        bestScore = score
      }
    }
    result.set(end.id, best)
  }

  return result
}
