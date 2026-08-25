// 中心線アンカーの Y クランプ（純粋計算）
//
// shapes.ts は X6 本体を読み込むためテストから import できない。アンカー本体と
// 「vertex を失ったメッセージの現在位置」の両方で同じ式が要るので、計算だけを
// ここへ切り出して共有する。

import { LIFELINE, type CellKind } from './constants'

export interface CenterlineBBox {
  y: number
  height: number
}

/**
 * 参照 Y をノードの縦範囲へクランプした値を返す。
 * ライフラインはヘッダ下端より上へは付かない。シーケンス以外のノードは中心 Y。
 */
export function clampCenterlineY(kind: CellKind, bbox: CenterlineBBox, refY: number): number {
  if (kind !== 'lifeline' && kind !== 'activation') return bbox.y + bbox.height / 2
  const minY = bbox.y + (kind === 'lifeline' ? LIFELINE.headHeight + 4 : 0)
  const maxY = bbox.y + bbox.height
  return Math.min(Math.max(refY, minY), maxY)
}
