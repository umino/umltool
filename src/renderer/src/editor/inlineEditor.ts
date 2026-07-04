// ダブルクリックでのラベル直接編集用の軽量インラインエディタ。
// X6 の node-editor/edge-editor ツールはアタッチのたびに購読が増え、
// 複数エディタが同時に開いて空文字をコミットする事故が起きるため使わない。

import type { Graph } from '@antv/x6'
import { FONT_FAMILY } from './constants'

export interface InlineEditorOptions {
  /** 編集欄の中心位置（ローカル座標） */
  x: number
  y: number
  text: string
  fontSize: number
  minWidth?: number
  onCommit: (text: string) => void
}

let active: { dispose: () => void } | null = null

/** 開いているエディタがあれば確定せずに閉じる */
export function closeInlineEditor(): void {
  active?.dispose()
  active = null
}

export function openInlineEditor(graph: Graph, opts: InlineEditorOptions): void {
  closeInlineEditor()

  const pos = graph.localToGraph(opts.x, opts.y)
  const scale = graph.scale()

  const div = document.createElement('div')
  div.contentEditable = 'true'
  div.spellcheck = false
  Object.assign(div.style, {
    position: 'absolute',
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    transform: `scale(${scale.sx}, ${scale.sy}) translate(-50%, -50%)`,
    minWidth: `${opts.minWidth ?? 60}px`,
    maxWidth: '400px',
    padding: '2px 8px',
    fontSize: `${opts.fontSize}px`,
    fontFamily: FONT_FAMILY,
    color: '#1d2330',
    background: '#ffffff',
    border: '1px solid #2d6cdf',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    outline: 'none',
    whiteSpace: 'pre',
    textAlign: 'center',
    zIndex: '100'
  } satisfies Partial<CSSStyleDeclaration>)
  div.innerText = opts.text

  let done = false
  const finish = (commit: boolean): void => {
    if (done) return
    done = true
    const value = div.innerText.replace(/\n+$/, '').trim()
    div.remove()
    if (active?.dispose === dispose) active = null
    if (commit) opts.onCommit(value)
  }
  const dispose = (): void => finish(false)

  div.addEventListener('keydown', (e) => {
    // グラフ側のショートカットに漏らさない
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      finish(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      finish(false)
    }
  })
  div.addEventListener('blur', () => finish(true))
  // クリックがキャンバスへ抜けて選択解除にならないように
  for (const type of ['mousedown', 'mouseup', 'click', 'dblclick'] as const) {
    div.addEventListener(type, (e) => e.stopPropagation())
  }

  graph.container.appendChild(div)
  active = { dispose }

  // フォーカスして全選択（すぐ打ち替えられるように）
  setTimeout(() => {
    div.focus()
    const range = document.createRange()
    range.selectNodeContents(div)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
}
