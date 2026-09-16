// 左右のペインと図の間の境界をドラッグして幅を変える（issue #42。右パネルも同じ操作）。
//
// 幅は CSS 変数 --left-pane-width / --right-pane-width で持つ。グリッドの両端の列が
// これを見ているので、値を書き換えるだけでレイアウトが追従し、キャンバスは X6 の
// autoResize（コンテナの ResizeObserver）が拾って描き直す。
//
// 幅は図ではなく作業環境の設定なので、プロジェクトファイルではなく
// localStorage に覚えさせる（次に開いたときも同じ幅で始まる）。

import { PANE, clampPaneWidth, type PaneSide } from './paneSize'

const SETTINGS: Record<PaneSide, { handleId: string; cssVar: string; storageKey: string }> = {
  left: {
    handleId: 'pane-resizer',
    cssVar: '--left-pane-width',
    storageKey: 'umltool.leftPaneWidth'
  },
  right: {
    handleId: 'pane-resizer-right',
    cssVar: '--right-pane-width',
    storageKey: 'umltool.rightPaneWidth'
  }
}

const SIDES: PaneSide[] = ['left', 'right']

/** 矢印キーで動かす量（Shift 併用で大きく） */
const KEY_STEP = 16
const KEY_STEP_LARGE = 48

export interface PaneResizer {
  getWidth(): number
  /** persist = false なら幅を変えるだけで保存しない（診断の撮影用） */
  setWidth(width: number, persist?: boolean): void
}

export type PaneResizers = Record<PaneSide, PaneResizer>

function readStored(side: PaneSide): number | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS[side].storageKey)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    // プライベートモード等で localStorage が使えなくても幅の変更自体は使える
    return null
  }
}

function writeStored(side: PaneSide, width: number): void {
  try {
    window.localStorage.setItem(SETTINGS[side].storageKey, String(width))
  } catch {
    /* 保存できないだけなので無視する */
  }
}

const opposite = (side: PaneSide): PaneSide => (side === 'left' ? 'right' : 'left')

/**
 * 左右の境界のドラッグ・ダブルクリック・矢印キーを配線する。
 * 片方の上限は反対側の今の幅で決まるので、両方の幅をここでまとめて持つ。
 * 必要な要素が無ければ何もせず null を返す。
 */
export function bindPaneResizers(): PaneResizers | null {
  const workspace = document.getElementById('workspace')
  const left = document.getElementById(SETTINGS.left.handleId)
  const right = document.getElementById(SETTINGS.right.handleId)
  if (!workspace || !left || !right) return null
  const handles: Record<PaneSide, HTMLElement> = { left, right }

  const widths: Record<PaneSide, number> = {
    left: readStored('left') ?? PANE.left.default,
    right: readStored('right') ?? PANE.right.default
  }

  const apply = (side: PaneSide, next: number, persist: boolean): void => {
    const width = clampPaneWidth(side, next, workspace.clientWidth, widths[opposite(side)])
    widths[side] = width
    workspace.style.setProperty(SETTINGS[side].cssVar, `${width}px`)
    handles[side].setAttribute('aria-valuenow', String(width))
    if (persist) writeStored(side, width)
  }
  for (const side of SIDES) apply(side, widths[side], false)

  /** 境界の位置（クライアント座標） */
  const edgeX = (side: PaneSide): number => {
    const box = workspace.getBoundingClientRect()
    return side === 'left' ? box.left + widths.left : box.right - widths.right
  }
  /** 境界を x に置いたときの幅 */
  const widthFor = (side: PaneSide, x: number): number => {
    const box = workspace.getBoundingClientRect()
    return side === 'left' ? x - box.left : box.right - x
  }

  // grabOffset は掴んだ位置と境界とのズレ。保たないと掴んだ瞬間に境界が飛ぶ
  let dragging: { side: PaneSide; grabOffset: number } | null = null

  for (const side of SIDES) {
    const handle = handles[side]
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      dragging = { side, grabOffset: e.clientX - edgeX(side) }
      handle.classList.add('dragging')
      // ドラッグ中はテキスト選択を止める（境界をなぞると文字が反転して見苦しい）
      document.body.style.userSelect = 'none'
      try {
        handle.setPointerCapture(e.pointerId)
      } catch {
        // 合成イベントなど pointerId が無効な場合。document 側で拾えるので続行する
      }
    })

    handle.addEventListener('dblclick', () => apply(side, PANE[side].default, true))

    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP
      // 境界は押した矢印の向きへ動く（右パネルは ← で広がる）
      const grow = side === 'left' ? 1 : -1
      if (e.key === 'ArrowLeft') apply(side, widths[side] - step * grow, true)
      else if (e.key === 'ArrowRight') apply(side, widths[side] + step * grow, true)
      else if (e.key === 'Home') apply(side, PANE[side].default, true)
      else return
      e.preventDefault()
      e.stopPropagation()
    })
  }

  // ハンドルの外へカーソルが出ても追従するよう document で拾う
  document.addEventListener('pointermove', (e) => {
    const current = dragging
    if (!current) return
    apply(current.side, widthFor(current.side, e.clientX - current.grabOffset), false)
  })
  const endDrag = (): void => {
    const current = dragging
    if (!current) return
    dragging = null
    handles[current.side].classList.remove('dragging')
    document.body.style.userSelect = ''
    writeStored(current.side, widths[current.side])
  }
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)

  // ウィンドウが狭くなったら、キャンバスの取り分を守れる幅へ詰める
  window.addEventListener('resize', () => {
    for (const side of SIDES) apply(side, widths[side], false)
  })

  const api = (side: PaneSide): PaneResizer => ({
    getWidth: () => widths[side],
    setWidth: (value: number, persist = true) => apply(side, value, persist)
  })
  return { left: api('left'), right: api('right') }
}
