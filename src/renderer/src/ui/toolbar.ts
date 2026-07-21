import { DECISION_SHAPE_LABEL, type DecisionShape } from '../editor/constants'

export type ToolbarDiagramType = 'sequence' | 'activity'

export interface ToolbarActions {
  newProject: () => void
  open: () => void
  save: () => void
  saveAs: () => void
  setDiagramType: (type: ToolbarDiagramType) => void
  setDecisionShape: (shape: DecisionShape) => void
  deleteSelection: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  fit: () => void
  exportImage: (format: 'png' | 'jpg' | 'webp') => void
}

export interface ToolbarHandle {
  /** セレクトの表示値を図種別に合わせる */
  setDiagramType: (type: ToolbarDiagramType) => void
  /** セレクトの表示値を分岐図形に合わせる */
  setDecisionShape: (shape: DecisionShape) => void
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.title = title
  b.addEventListener('click', onClick)
  return b
}

function group(...children: HTMLElement[]): HTMLElement {
  const g = document.createElement('div')
  g.className = 'group'
  for (const c of children) g.appendChild(c)
  return g
}

function label(text: string): HTMLElement {
  const s = document.createElement('span')
  s.className = 'label'
  s.textContent = text
  return s
}

/** ツールバーを構築する */
export function buildToolbar(host: HTMLElement, actions: ToolbarActions): ToolbarHandle {
  host.innerHTML = ''
  host.appendChild(
    group(
      button('新規', '新規プロジェクト (Ctrl+N)', actions.newProject),
      button('開く', 'プロジェクトを開く (Ctrl+O)', actions.open),
      button('保存', '保存 (Ctrl+S)', actions.save),
      button('名前を付けて保存', '名前を付けて保存 (Ctrl+Shift+S)', actions.saveAs)
    )
  )

  // 図種別セレクト
  const typeSelect = document.createElement('select')
  for (const [value, text] of [
    ['sequence', 'シーケンス図'],
    ['activity', 'アクティビティ図']
  ] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = text
    typeSelect.appendChild(opt)
  }
  typeSelect.addEventListener('change', () =>
    actions.setDiagramType(typeSelect.value as ToolbarDiagramType)
  )
  host.appendChild(group(label('図:'), typeSelect))

  // 分岐の図形（図全体に効く設定）。アクティビティ図でだけ意味があるので
  // シーケンス図のときは隠す。
  const shapeSelect = document.createElement('select')
  for (const value of ['diamond', 'hexagon'] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = DECISION_SHAPE_LABEL[value]
    shapeSelect.appendChild(opt)
  }
  shapeSelect.title = '分岐（デシジョン）の図形。図の中のすべての分岐に適用されます'
  shapeSelect.addEventListener('change', () =>
    actions.setDecisionShape(shapeSelect.value as DecisionShape)
  )
  const shapeGroup = group(label('分岐:'), shapeSelect)
  host.appendChild(shapeGroup)

  host.appendChild(group(button('🗑 削除', '選択を削除 (Delete)', actions.deleteSelection)))

  host.appendChild(
    group(
      label('表示:'),
      button('－', 'ズームアウト', actions.zoomOut),
      button('100%', '実寸', actions.zoomReset),
      button('＋', 'ズームイン', actions.zoomIn),
      button('全体', '全体表示', actions.fit)
    )
  )
  host.appendChild(
    group(
      label('書き出し:'),
      button('PNG', 'PNG で書き出し', () => actions.exportImage('png')),
      button('JPG', 'JPEG で書き出し', () => actions.exportImage('jpg')),
      button('WebP', 'WebP で書き出し', () => actions.exportImage('webp'))
    )
  )

  const setDiagramType = (type: ToolbarDiagramType): void => {
    typeSelect.value = type
    shapeGroup.hidden = type !== 'activity'
  }
  const setDecisionShape = (shape: DecisionShape): void => {
    shapeSelect.value = shape
  }
  setDiagramType('sequence')
  setDecisionShape('diamond')

  return { setDiagramType, setDecisionShape }
}
