import type { Cell, Edge, Node } from '@antv/x6'
import type { GraphEditor } from '../editor/GraphEditor'
import { autoSizeNode } from '../editor/autosize'
import {
  getCellKind,
  getMessageKind,
  getMessageLabel,
  getNodeLabel,
  setMessageKind,
  setMessageLabel,
  setNodeLabel
} from '../editor/shapes'
import {
  ACTIVITY_KIND_LABEL,
  MESSAGE_KIND_LABEL,
  type CellKind,
  type MessageKind
} from '../editor/constants'

const MESSAGE_KINDS: MessageKind[] = ['sync', 'async', 'return', 'self']

/** 選択セルのプロパティ編集パネル */
export class PropertiesPanel {
  private current: Cell[] = []

  constructor(
    private readonly editor: GraphEditor,
    private readonly host: HTMLElement
  ) {
    editor.onSelectionChange((cells) => this.render(cells))

    // パネル外（ダブルクリック編集など）でラベルが変わったとき表示を追従させる。
    // ただしパネル内で入力中はフォーカスを奪わないよう再描画しない。
    const refresh = ({ cell }: { cell: Cell }): void => {
      if (this.current.length !== 1 || this.current[0].id !== cell.id) return
      if (this.host.contains(document.activeElement)) return
      this.render(this.current)
    }
    editor.graph.on('cell:change:attrs', refresh)
    editor.graph.on('cell:change:labels', refresh)

    this.render([])
  }

  private render(cells: Cell[]): void {
    this.current = cells
    this.host.innerHTML = ''
    if (cells.length === 0) {
      this.host.appendChild(hint('要素を選択すると、ここで編集できます。'))
      return
    }
    if (cells.length > 1) {
      this.host.appendChild(hint(`${cells.length} 個の要素を選択中`))
      return
    }
    const cell = cells[0]
    const kind = getCellKind(cell)
    this.host.appendChild(typeRow(kind, cell))

    if (kind === 'activation') {
      this.host.appendChild(hint('活性化バー。ドラッグで上下移動・リサイズできます。'))
      return
    }

    if (kind === 'lifeline') {
      this.host.appendChild(
        labelInput('名前', getNodeLabel(cell as Node), (value) => {
          setNodeLabel(cell as Node, value)
          autoSizeNode(cell as Node, value)
        })
      )
      return
    }

    if (kind === 'message') {
      const edge = cell as Edge
      this.host.appendChild(
        labelInput('メッセージ', getMessageLabel(edge), (value) => {
          setMessageLabel(edge, value)
        })
      )
      this.host.appendChild(
        kindSelect(getMessageKind(edge), (newKind) => {
          setMessageKind(edge, newKind)
          this.render([edge])
        })
      )
      return
    }

    if (kind === 'action' || kind === 'decision' || kind === 'swimlane') {
      const caption = kind === 'swimlane' ? 'レーン名' : kind === 'decision' ? '条件' : 'アクション'
      this.host.appendChild(
        labelInput(caption, getNodeLabel(cell as Node), (value) => {
          setNodeLabel(cell as Node, value)
          autoSizeNode(cell as Node, value)
        })
      )
      return
    }

    if (kind === 'flow') {
      const edge = cell as Edge
      this.host.appendChild(
        labelInput('ガード条件', getMessageLabel(edge), (value) => {
          setMessageLabel(edge, value)
        })
      )
      return
    }

    this.host.appendChild(hint('この要素には編集可能なプロパティがありません。'))
    void this.editor
  }
}

function hint(text: string): HTMLElement {
  const div = document.createElement('div')
  div.className = 'empty'
  div.textContent = text
  return div
}

function typeRow(kind: CellKind, cell: Cell): HTMLElement {
  let text: string
  switch (kind) {
    case 'lifeline':
      text = 'ライフライン'
      break
    case 'activation':
      text = '活性化バー'
      break
    case 'message':
      text = MESSAGE_KIND_LABEL[getMessageKind(cell)]
      break
    case 'action':
    case 'decision':
    case 'merge':
    case 'initial':
    case 'final':
    case 'fork':
    case 'join':
    case 'swimlane':
    case 'flow':
      text = ACTIVITY_KIND_LABEL[kind]
      break
    default:
      text = '要素'
  }
  const div = document.createElement('div')
  div.style.fontWeight = '600'
  div.textContent = text
  return div
}

function labelInput(
  caption: string,
  value: string,
  onCommit: (value: string) => void
): HTMLElement {
  const wrap = document.createElement('label')
  wrap.textContent = caption
  const input = document.createElement('textarea')
  input.value = value
  const syncRows = (): void => {
    input.rows = Math.min(6, Math.max(2, input.value.split('\n').length))
  }
  syncRows()
  // Enter は改行（textarea の既定動作）。確定は欄外クリック等のフォーカス喪失時。
  input.addEventListener('input', syncRows)
  input.addEventListener('change', () => onCommit(input.value))
  wrap.appendChild(input)
  return wrap
}

function kindSelect(value: MessageKind, onChange: (kind: MessageKind) => void): HTMLElement {
  const wrap = document.createElement('label')
  wrap.textContent = '種別'
  const select = document.createElement('select')
  for (const k of MESSAGE_KINDS) {
    const opt = document.createElement('option')
    opt.value = k
    opt.textContent = MESSAGE_KIND_LABEL[k]
    if (k === value) opt.selected = true
    select.appendChild(opt)
  }
  select.addEventListener('change', () => onChange(select.value as MessageKind))
  wrap.appendChild(select)
  return wrap
}
