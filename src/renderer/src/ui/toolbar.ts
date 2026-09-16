import {
  DECISION_SHAPE_LABEL,
  MINDMAP_LAYOUT_LABEL,
  type DecisionShape,
  type MindmapLayout
} from '../editor/constants'
import { CSS_DPI, DEFAULT_DPI, DPI_CHOICES, MAX_IMAGE_SIDE } from '../export/raster'

export type ToolbarDiagramType = 'sequence' | 'activity' | 'mindmap'

export interface ToolbarActions {
  newProject: () => void
  open: () => void
  save: () => void
  saveAs: () => void
  setDiagramType: (type: ToolbarDiagramType) => void
  setDecisionShape: (shape: DecisionShape) => void
  setMindmapLayout: (layout: MindmapLayout) => void
  arrangeMindmap: () => void
  deleteSelection: () => void
  openSearch: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  fit: () => void
  setExportDpi: (dpi: number) => void
  exportImage: (format: 'png' | 'jpg' | 'webp') => void
  showShortcuts: () => void
}

export interface ToolbarHandle {
  /** セレクトの表示値を図種別に合わせる */
  setDiagramType: (type: ToolbarDiagramType) => void
  /** セレクトの表示値を分岐図形に合わせる */
  setDecisionShape: (shape: DecisionShape) => void
  /** セレクトの表示値をマインドマップの表示スタイルに合わせる */
  setMindmapLayout: (layout: MindmapLayout) => void
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
    ['activity', 'アクティビティ図'],
    ['mindmap', 'マインドマップ']
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

  // マインドマップの表示スタイルと整列。マインドマップのときだけ出す。
  const layoutSelect = document.createElement('select')
  for (const value of ['map', 'outline'] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = MINDMAP_LAYOUT_LABEL[value]
    layoutSelect.appendChild(opt)
  }
  layoutSelect.title = '同じ内容を、放射状のマインドマップか縦のツリーで表示します'
  layoutSelect.addEventListener('change', () =>
    actions.setMindmapLayout(layoutSelect.value as MindmapLayout)
  )
  const mindmapGroup = group(
    label('表示:'),
    layoutSelect,
    button('整列', 'トピックを自動配置し直す', actions.arrangeMindmap)
  )
  host.appendChild(mindmapGroup)

  host.appendChild(
    group(
      button('🗑 削除', '選択を削除 (Delete)', actions.deleteSelection),
      button('🔍 検索', '図の中の文字を検索 (Ctrl+F)', actions.openSearch)
    )
  )

  // 倍率のボタンは記号だけで意味が通るのでラベルを置かない
  // （「表示:」はマインドマップの表示スタイルで使っており、紛らわしい）
  host.appendChild(
    group(
      button('－', 'ズームアウト', actions.zoomOut),
      button('100%', '実寸', actions.zoomReset),
      button('＋', 'ズームイン', actions.zoomIn),
      button('全体', '全体表示', actions.fit)
    )
  )
  // 書き出し解像度。数字を上げるほど画素数が増えるので、Excel の貼り付け上限
  // （1 辺 8192px）を超える図では書き出し側が自動で下げる。
  const dpiSelect = document.createElement('select')
  for (const dpi of DPI_CHOICES) {
    const opt = document.createElement('option')
    opt.value = String(dpi)
    const note = dpi < CSS_DPI ? '（縮小）' : dpi === CSS_DPI ? '（等倍）' : dpi === DEFAULT_DPI ? '（標準）' : ''
    opt.textContent = `${dpi} dpi${note}`
    dpiSelect.appendChild(opt)
  }
  dpiSelect.value = String(DEFAULT_DPI)
  dpiSelect.title =
    `書き出す画像の解像度。96dpi が画面の実寸と等倍です。\n` +
    `1 辺が ${MAX_IMAGE_SIDE}px（Excel に貼れる上限）を超える場合は自動で下げます。`
  dpiSelect.addEventListener('change', () => actions.setExportDpi(Number(dpiSelect.value)))

  host.appendChild(
    group(
      label('書き出し:'),
      dpiSelect,
      button('PNG', 'PNG で書き出し', () => actions.exportImage('png')),
      button('JPG', 'JPEG で書き出し', () => actions.exportImage('jpg')),
      button('WebP', 'WebP で書き出し', () => actions.exportImage('webp'))
    )
  )
  host.appendChild(group(button('?', 'ショートカット一覧 (?)', actions.showShortcuts)))

  const setDiagramType = (type: ToolbarDiagramType): void => {
    typeSelect.value = type
    shapeGroup.hidden = type !== 'activity'
    mindmapGroup.hidden = type !== 'mindmap'
  }
  const setDecisionShape = (shape: DecisionShape): void => {
    shapeSelect.value = shape
  }
  const setMindmapLayout = (layout: MindmapLayout): void => {
    layoutSelect.value = layout
  }
  setDiagramType('sequence')
  setDecisionShape('diamond')
  setMindmapLayout('map')

  return { setDiagramType, setDecisionShape, setMindmapLayout }
}
