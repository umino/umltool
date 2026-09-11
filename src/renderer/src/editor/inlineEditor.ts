// ダブルクリックでのラベル直接編集用の軽量インラインエディタ。
// X6 の node-editor/edge-editor ツールはアタッチのたびに購読が増え、
// 複数エディタが同時に開いて空文字をコミットする事故が起きるため使わない。

import type { Graph } from '@antv/x6'
import { CODE_TOPIC, FONT_FAMILY } from './constants'

export interface InlineEditorOptions {
  /** 編集欄の中心位置（ローカル座標） */
  x: number
  y: number
  text: string
  fontSize: number
  minWidth?: number
  /**
   * コード表示用の編集欄にする。等幅・左揃えで、前後の空白を削らない。
   * Enter は改行（確定は Ctrl+Enter / 欄外クリック）、Tab は空白を入れる。
   */
  code?: boolean
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
  const code = opts.code === true

  const div = document.createElement('div')
  // コードは貼り付けた書式（HTML）を持ち込まないよう素のテキストだけを受け付ける
  div.contentEditable = code ? 'plaintext-only' : 'true'
  div.spellcheck = false
  Object.assign(div.style, {
    position: 'absolute',
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    transform: `scale(${scale.sx}, ${scale.sy}) translate(-50%, -50%)`,
    minWidth: `${opts.minWidth ?? 60}px`,
    maxWidth: code ? '90vw' : '400px',
    padding: '2px 8px',
    fontSize: `${opts.fontSize}px`,
    fontFamily: code ? CODE_TOPIC.fontFamily : FONT_FAMILY,
    lineHeight: code ? String(CODE_TOPIC.lineHeight) : 'normal',
    color: '#1d2330',
    background: '#ffffff',
    border: '1px solid #2d6cdf',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    outline: 'none',
    whiteSpace: 'pre',
    textAlign: code ? 'left' : 'center',
    zIndex: '100'
  } satisfies Partial<CSSStyleDeclaration>)
  if (code) div.textContent = opts.text
  else div.innerText = opts.text

  let done = false
  const finish = (commit: boolean): void => {
    if (done) return
    done = true
    // コードは行頭のインデントが本文なので、末尾の改行だけを落とす
    const value = code
      ? div.innerText.replace(/\n+$/, '')
      : div.innerText.replace(/\n+$/, '').trim()
    div.remove()
    if (active?.dispose === dispose) active = null
    if (commit) opts.onCommit(value)
  }
  const dispose = (): void => finish(false)

  div.addEventListener('keydown', (e) => {
    // グラフ側のショートカットに漏らさない
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      finish(false)
      return
    }
    if (e.isComposing) return
    if (code) {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        finish(true)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        document.execCommand('insertText', false, ' '.repeat(CODE_TOPIC.tabSize))
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      finish(true)
    }
  })
  div.addEventListener('blur', () => finish(true))
  // クリックがキャンバスへ抜けて選択解除にならないように
  for (const type of ['mousedown', 'mouseup', 'click', 'dblclick'] as const) {
    div.addEventListener(type, (e) => e.stopPropagation())
  }

  graph.container.appendChild(div)
  active = { dispose }

  setTimeout(() => {
    div.focus()
    const range = document.createRange()
    range.selectNodeContents(div)
    // 通常はすぐ打ち替えられるよう全選択。コードは書き足すことが多く、
    // うっかり 1 文字打つと全部消えるので末尾にカーソルを置く
    if (code) range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
}
