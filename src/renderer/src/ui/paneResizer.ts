// 左ペインと図の間の境界をドラッグして幅を変える（issue #42）。
//
// 幅は CSS 変数 --left-pane-width で持つ。グリッドの 1 列目がこれを見ているので、
// 値を書き換えるだけでレイアウトが追従し、キャンバスは X6 の autoResize
// （コンテナの ResizeObserver）が拾って描き直す。
//
// 幅は図ではなく作業環境の設定なので、プロジェクトファイルではなく
// localStorage に覚えさせる（次に開いたときも同じ幅で始まる）。

import { LEFT_PANE, clampPaneWidth } from './paneSize'

const STORAGE_KEY = 'umltool.leftPaneWidth'

/** 矢印キーで動かす量（Shift 併用で大きく） */
const KEY_STEP = 16
const KEY_STEP_LARGE = 48

export interface PaneResizer {
  getWidth(): number
  setWidth(width: number): void
}

function readStored(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    // プライベートモード等で localStorage が使えなくても幅の変更自体は使える
    return null
  }
}

function writeStored(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    /* 保存できないだけなので無視する */
  }
}

/**
 * 境界のドラッグ・ダブルクリック・矢印キーを配線する。
 * 必要な要素が無ければ何もせず null を返す。
 */
export function bindPaneResizer(): PaneResizer | null {
  const workspace = document.getElementById('workspace')
  const handle = document.getElementById('pane-resizer')
  if (!workspace || !handle) return null

  let width = clampPaneWidth(readStored() ?? LEFT_PANE.default, workspace.clientWidth)

  const apply = (next: number, persist: boolean): void => {
    width = clampPaneWidth(next, workspace.clientWidth)
    workspace.style.setProperty('--left-pane-width', `${width}px`)
    handle.setAttribute('aria-valuenow', String(width))
    if (persist) writeStored(width)
  }
  apply(width, false)

  // ドラッグ中はテキスト選択を止める（境界をなぞると文字が反転して見苦しい）
  let dragging = false
  // 掴んだ位置とペインの右端とのズレ。保たないと掴んだ瞬間に境界が飛ぶ
  let grabOffset = 0
  const endDrag = (): void => {
    if (!dragging) return
    dragging = false
    handle.classList.remove('dragging')
    document.body.style.userSelect = ''
    writeStored(width)
  }

  handle.addEventListener('pointerdown', (e) => {
    const event = e as PointerEvent
    if (event.button !== 0) return
    event.preventDefault()
    dragging = true
    grabOffset = event.clientX - (workspace.getBoundingClientRect().left + width)
    handle.classList.add('dragging')
    document.body.style.userSelect = 'none'
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      // 合成イベントなど pointerId が無効な場合。document 側で拾えるので続行する
    }
  })

  const onMove = (e: PointerEvent): void => {
    if (!dragging) return
    apply(e.clientX - workspace.getBoundingClientRect().left - grabOffset, false)
  }
  // ハンドルの外へカーソルが出ても追従するよう document で拾う
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)

  handle.addEventListener('dblclick', () => apply(LEFT_PANE.default, true))

  handle.addEventListener('keydown', (e) => {
    const event = e as KeyboardEvent
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    if (event.key === 'ArrowLeft') apply(width - step, true)
    else if (event.key === 'ArrowRight') apply(width + step, true)
    else if (event.key === 'Home') apply(LEFT_PANE.default, true)
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  // ウィンドウが狭くなったら、キャンバスの取り分を守れる幅へ詰める
  window.addEventListener('resize', () => apply(width, false))

  return {
    getWidth: () => width,
    setWidth: (value: number) => apply(value, true)
  }
}
