// 活性化バーの入れ子の深さ計算。
//
// 同じライフライン上でバーが重なったとき、astah* のように内側のバーを右へ
// ずらして積み重ねる。どれだけずらすかは「自分を包含するバーが何本あるか」＝
// 入れ子の深さで決まる。計算部はグラフ非依存の純関数にしてテスト対象にする。

/** ライフライン上のバー 1 本の縦範囲 */
export interface ActivationSpan {
  id: string
  y: number
  height: number
}

/**
 * 各バーの入れ子の深さ（0 が最外）を返す。
 *
 * 上端が早い順、同じなら長い順に並べ、自分より前に来て自分を包含するバーの数を
 * 深さとする。完全に同じ範囲のバーが複数あっても、この順序で先に来た方を外側と
 * 見なすので結果は決定的になる。
 */
export function activationDepths(spans: ActivationSpan[]): Map<string, number> {
  const ordered = [...spans].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    if (a.height !== b.height) return b.height - a.height
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const depths = new Map<string, number>()
  ordered.forEach((span, i) => {
    let depth = 0
    for (let j = 0; j < i; j += 1) {
      const outer = ordered[j]
      if (outer.y <= span.y && outer.y + outer.height >= span.y + span.height) depth += 1
    }
    depths.set(span.id, depth)
  })
  return depths
}
