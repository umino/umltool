// 左ペインの幅の決め方（DOM 非依存・純関数）。
//
// 幅は自由に変えられるが、図を描く場所まで潰れると操作できなくなるので、
// キャンバスと右パネルの取り分を必ず残す。

export const LEFT_PANE = {
  /** 既定の幅（従来の固定値と同じ） */
  default: 280,
  /** これ以上狭くしない（タブ 2 つとボタンが並ぶ幅） */
  min: 200,
  /** これ以上広げない */
  max: 720,
  /**
   * 左ペイン以外に必ず残す幅。
   * 右パネル 260 + キャンバス最低 320 + スプリッタ 6。
   */
  reserve: 586
} as const

/**
 * ドラッグ位置などから決めた幅を、実際に使える値へ丸める。
 * 数値でない場合は既定値に倒す。ウィンドウが狭いときは下限を優先する
 * （最低幅すら取れないほど狭ければ、左ペインは min のまま）。
 */
export function clampPaneWidth(width: number, workspaceWidth: number): number {
  if (!Number.isFinite(width)) return LEFT_PANE.default
  const room = workspaceWidth - LEFT_PANE.reserve
  const max = Math.max(LEFT_PANE.min, Math.min(LEFT_PANE.max, room))
  return Math.round(Math.min(Math.max(width, LEFT_PANE.min), max))
}
