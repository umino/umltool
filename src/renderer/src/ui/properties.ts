import type { Cell, Edge, Node } from '@antv/x6'
import type { GraphEditor } from '../editor/GraphEditor'
import {
  autoSizeNode,
  clearManualSize,
  fitTextHeight,
  isManuallySized,
  markManuallySized
} from '../editor/autosize'
import { addFragmentDivider } from '../editor/sequence'
import {
  applyFrameHeader,
  getCellKind,
  getDividerGuard,
  getFragmentGuard,
  getFragmentOperator,
  getMessageKind,
  getMessageLabel,
  getNodeLabel,
  getTextBold,
  getTextColor,
  getTextFontSize,
  setDividerGuard,
  setFragmentGuard,
  setFragmentOperator,
  setMessageKind,
  setMessageLabel,
  setNodeLabel,
  setTextBold,
  setTextColor,
  setTextFontSize
} from '../editor/shapes'
import {
  ACTIVITY_KIND_LABEL,
  ACTIVITY_MIN_SIZE,
  DIVIDABLE_OPERATORS,
  FRAGMENT,
  FRAGMENT_OPERATORS,
  MESSAGE_KIND_LABEL,
  isActivityNodeKind,
  type CellKind,
  type FragmentOperator,
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

    if (kind === 'fragment') {
      const node = cell as Node
      this.host.appendChild(
        operatorSelect(getFragmentOperator(node), (op) => {
          setFragmentOperator(node, op)
          this.render([node])
        })
      )
      const dividable = DIVIDABLE_OPERATORS.includes(getFragmentOperator(node))
      if (dividable) {
        // alt / par は複数のオペランド（分岐）を持つ。先頭はフラグメント自身の
        // ガード、2 つ目以降は区切り線のガードとして、まとめて編集できるようにする。
        const dividers = childDividers(node)
        this.host.appendChild(
          labelInput('オペランド 1 の条件', getFragmentGuard(node), (value) => {
            setFragmentGuard(node, value)
          })
        )
        dividers.forEach((d, i) => {
          this.host.appendChild(
            labelInput(`オペランド ${i + 2} の条件`, getDividerGuard(d), (value) => {
              setDividerGuard(d, value)
            })
          )
        })
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = '＋オペランド（分岐）を追加'
        btn.title = '破線の区切り線を追加（上下にドラッグで移動、Delete で削除）'
        btn.addEventListener('click', () => {
          const bbox = node.getBBox()
          // 最後の区切り線（無ければタブ下端）と下端の中間に置く
          const base =
            dividers.length > 0
              ? Math.max(...dividers.map((d) => d.getBBox().y))
              : bbox.y + FRAGMENT.tabHeight
          const y = (base + bbox.y + bbox.height) / 2
          addFragmentDivider(this.editor.graph, node, y)
          this.render([node])
        })
        this.host.appendChild(btn)
      } else {
        this.host.appendChild(
          labelInput('条件（ガード）', getFragmentGuard(node), (value) => {
            setFragmentGuard(node, value)
          })
        )
      }
      this.host.appendChild(
        hint('枠線をドラッグで移動、選択してハンドルでリサイズできます。')
      )
      return
    }

    if (kind === 'divider') {
      this.host.appendChild(
        labelInput('条件（ガード）', getDividerGuard(cell as Node), (value) => {
          setDividerGuard(cell as Node, value)
        })
      )
      this.host.appendChild(hint('上下にドラッグで移動、Delete で削除できます。'))
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

    if (kind === 'frame') {
      const node = cell as Node
      this.host.appendChild(
        labelInput('ヘッダ', getNodeLabel(node), (value) => {
          applyFrameHeader(node, value)
        })
      )
      this.host.appendChild(
        hint('枠線またはヘッダをドラッグで移動、選択してハンドルでリサイズできます。')
      )
      return
    }

    if (kind === 'text' || kind === 'note') {
      const node = cell as Node
      const caption = kind === 'note' ? 'ノート' : 'テキスト'
      this.host.appendChild(
        labelInput(caption, getNodeLabel(node), (value) => {
          setNodeLabel(node, value)
          fitTextHeight(node)
        })
      )
      this.host.appendChild(
        numberInput('フォントサイズ', getTextFontSize(node), 8, 96, (value) => {
          setTextFontSize(node, value)
          fitTextHeight(node)
        })
      )
      this.host.appendChild(
        checkboxInput('太字', getTextBold(node), (value) => {
          setTextBold(node, value)
        })
      )
      this.host.appendChild(
        colorInput('色', getTextColor(node), (value) => {
          setTextColor(node, value)
        })
      )
      this.host.appendChild(
        hint(
          kind === 'text'
            ? 'ライフラインに付属します。ドラッグで移動、ハンドルで横幅を変更（自動折り返し）。'
            : 'ドラッグで移動、ハンドルで横幅を変更（高さは自動で折り返し）。'
        )
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
      if (kind !== 'swimlane') this.appendSizeSection(cell as Node)
      return
    }

    if (isActivityNodeKind(kind)) {
      this.appendSizeSection(cell as Node)
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

  /**
   * アクティビティノードのサイズ欄。手動リサイズするとラベル連動の自動リサイズを
   * 止めるため、自動に戻す導線もここに置く（戻せないと詰むので必須）。
   */
  private appendSizeSection(node: Node): void {
    const kind = getCellKind(node)
    const autoSized = kind === 'action' || kind === 'decision'
    const { width, height } = node.getSize()
    const min = isActivityNodeKind(kind) ? ACTIVITY_MIN_SIZE[kind] : { width: 1, height: 1 }

    const resize = (w: number, h: number): void => {
      const bbox = node.getBBox()
      // 中心を保ったままリサイズする（ハンドル操作と揃える）
      node.prop({
        position: { x: bbox.x + (bbox.width - w) / 2, y: bbox.y + (bbox.height - h) / 2 },
        size: { width: w, height: h }
      })
      markManuallySized(node)
    }

    this.host.appendChild(
      numberInput('幅', width, min.width, 2000, (value) => resize(value, node.getSize().height))
    )
    this.host.appendChild(
      numberInput('高さ', height, min.height, 2000, (value) => resize(node.getSize().width, value))
    )

    if (autoSized && isManuallySized(node)) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = 'サイズを自動に戻す'
      btn.title = 'ラベルに合わせた自動リサイズを再び有効にする'
      btn.addEventListener('click', () => {
        clearManualSize(node)
        autoSizeNode(node, getNodeLabel(node))
        this.render([node])
      })
      this.host.appendChild(btn)
    }

    this.host.appendChild(
      hint(
        autoSized
          ? 'ハンドルまたは上の数値でリサイズできます。リサイズするとラベル連動の自動サイズは止まります。'
          : 'ハンドルまたは上の数値でリサイズできます。'
      )
    )
  }
}

/** フラグメントの子の区切り線を上から順に返す */
function childDividers(fragment: Node): Node[] {
  return (fragment.getChildren() ?? [])
    .filter((c) => getCellKind(c) === 'divider')
    .map((c) => c as Node)
    .sort((a, b) => a.getBBox().y - b.getBBox().y)
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
    case 'fragment':
      text = `フラグメント (${getFragmentOperator(cell as Node)})`
      break
    case 'divider':
      text = '区切り線'
      break
    case 'text':
      text = 'テキスト'
      break
    case 'note':
      text = 'ノート'
      break
    case 'action':
    case 'decision':
    case 'merge':
    case 'initial':
    case 'final':
    case 'fork':
    case 'join':
    case 'swimlane':
    case 'frame':
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

function numberInput(
  caption: string,
  value: number,
  min: number,
  max: number,
  onCommit: (value: number) => void
): HTMLElement {
  const wrap = document.createElement('label')
  wrap.textContent = caption
  const input = document.createElement('input')
  input.type = 'number'
  input.min = String(min)
  input.max = String(max)
  input.value = String(value)
  input.addEventListener('change', () => {
    const v = Math.min(max, Math.max(min, Number(input.value) || value))
    input.value = String(v)
    onCommit(v)
  })
  wrap.appendChild(input)
  return wrap
}

function checkboxInput(
  caption: string,
  value: boolean,
  onChange: (value: boolean) => void
): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'inline'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  wrap.appendChild(input)
  wrap.appendChild(document.createTextNode(caption))
  return wrap
}

function colorInput(
  caption: string,
  value: string,
  onChange: (value: string) => void
): HTMLElement {
  const wrap = document.createElement('label')
  wrap.textContent = caption
  const input = document.createElement('input')
  input.type = 'color'
  input.value = toHexColor(value)
  input.addEventListener('input', () => onChange(input.value))
  wrap.appendChild(input)
  return wrap
}

/** input[type=color] は #rrggbb しか受け付けないため整形する */
function toHexColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1d2330'
}

function operatorSelect(
  value: FragmentOperator,
  onChange: (op: FragmentOperator) => void
): HTMLElement {
  const wrap = document.createElement('label')
  wrap.textContent = '種別'
  const select = document.createElement('select')
  for (const op of FRAGMENT_OPERATORS) {
    const opt = document.createElement('option')
    opt.value = op
    opt.textContent = op
    if (op === value) opt.selected = true
    select.appendChild(opt)
  }
  select.addEventListener('change', () => onChange(select.value as FragmentOperator))
  wrap.appendChild(select)
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
