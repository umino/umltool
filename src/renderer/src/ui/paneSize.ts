// 左右のペインの幅の決め方（DOM 非依存・純関数）。
//
// 幅は自由に変えられるが、図を描く場所まで潰れると操作できなくなるので、
// 反対側のペインとキャンバスの取り分を必ず残す。

export type PaneSide = 'left' | 'right'

export const PANE = {
  /** 左ペイン（テキスト / 部品）。既定は従来の固定値 */
  left: { default: 280, min: 200, max: 720 },
  /** 右パネル（プロパティ）。下限は色見本が 1 行に 7 つ並ぶ幅 */
  right: { default: 260, min: 220, max: 640 },
  /** キャンバスに必ず残す幅 */
  canvasMin: 320,
  /** 境界 1 本の幅（左右で 2 本ある） */
  bar: 6
} as const

/**
 * ドラッグ位置などから決めた幅を、実際に使える値へ丸める。
 * otherWidth は反対側のペインの今の幅。数値でない場合は既定値に倒す。
 * ウィンドウが狭いときは下限を優先する（最低幅すら取れなければ min のまま）。
 */
export function clampPaneWidth(
  side: PaneSide,
  width: number,
  workspaceWidth: number,
  otherWidth: number
): number {
  const spec = PANE[side]
  if (!Number.isFinite(width)) return spec.default
  const room = workspaceWidth - otherWidth - PANE.canvasMin - PANE.bar * 2
  const max = Math.max(spec.min, Math.min(spec.max, room))
  return Math.round(Math.min(Math.max(width, spec.min), max))
}
