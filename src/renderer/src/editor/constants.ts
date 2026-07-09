// シーケンス図のレイアウト・スタイル定数

/** 書き出し SVG が単体でも同じ見た目になるよう、フォントは属性で明示する */
export const FONT_FAMILY = '"Yu Gothic UI", "Yu Gothic", "Meiryo", system-ui, sans-serif'

export const LIFELINE = {
  width: 120,
  headHeight: 40,
  top: 24,
  defaultHeight: 460,
  /** ライフライン同士の中心間隔 */
  gapX: 200,
  /** 先頭ライフラインの中心 x */
  firstCenterX: 120
} as const

export const MESSAGE = {
  /** 最初のメッセージの y */
  startY: 96,
  /** メッセージ間の y ステップ */
  stepY: 48,
  /** 自己メッセージのループ幅 */
  selfWidth: 60,
  selfHeight: 32
} as const

export const ACTIVATION = {
  width: 12,
  defaultHeight: 120
} as const

/** 複合フラグメント（alt/opt/loop など） */
export const FRAGMENT = {
  tabWidth: 64,
  tabHeight: 22,
  minWidth: 120,
  minHeight: 70,
  defaultWidth: 260,
  defaultHeight: 160,
  /** 区切り線（divider）ノードの高さ（掴みしろ） */
  dividerHeight: 14,
  /** レイアウト時の余白 */
  padTop: 34,
  padBottom: 24,
  padSide: 60
} as const

// X6 に登録するシェイプ名 / アンカー名
export const SHAPE = {
  lifeline: 'uml-lifeline',
  activation: 'uml-activation',
  message: 'uml-message',
  fragment: 'uml-fragment',
  fragmentDivider: 'uml-fragment-divider',
  centerlineAnchor: 'uml-centerline',
  action: 'uml-action',
  decision: 'uml-decision',
  merge: 'uml-merge',
  initial: 'uml-initial',
  final: 'uml-final',
  bar: 'uml-bar',
  swimlane: 'uml-swimlane',
  frame: 'uml-frame',
  text: 'uml-text',
  note: 'uml-note',
  attachLink: 'uml-attach-link',
  flow: 'uml-flow'
} as const

// アクティビティ図のレイアウト定数
export const ACTIVITY = {
  action: { width: 150, height: 44 },
  decision: { width: 110, height: 60 },
  /** 合流は小さな空の菱形（分岐と区別する） */
  merge: { width: 40, height: 30 },
  terminal: { size: 26 },
  bar: { width: 130, height: 8 },
  /** 列の中心間隔 */
  colGapX: 230,
  /** 先頭列の中心 x（レーン無しのとき） */
  firstColX: 180,
  /** 行間隔 */
  stepY: 90,
  /** 先頭行の中心 y */
  startY: 70,
  /** スイムレーンの幅とヘッダ高 */
  laneWidth: 280,
  laneHeaderHeight: 30,
  lanePaddingY: 40
} as const

/** アクティビティ図のフレーム（コンテナ） */
export const FRAME = {
  tabHeight: 26,
  tabMinWidth: 80,
  minWidth: 140,
  minHeight: 90,
  defaultWidth: 420,
  defaultHeight: 300
} as const

/** 自由配置テキスト（注釈）。両図種で使える汎用要素 */
export const TEXT = {
  defaultWidth: 160,
  minWidth: 48,
  minHeight: 24,
  padX: 8,
  padY: 6,
  defaultFontSize: 14,
  /** フォントサイズに対する行の高さ倍率 */
  lineHeight: 1.4,
  defaultColor: '#1d2330'
} as const

/** ライフラインに付属する UML ノート（左上折りの付箋） */
export const NOTE = {
  /** 折り角の一辺の長さ */
  fold: 12,
  defaultWidth: 160,
  minWidth: 64,
  minHeight: 34,
  padX: 10,
  padY: 8,
  defaultFontSize: 13,
  lineHeight: 1.4,
  fill: '#fffbe6',
  stroke: '#d9b441',
  textColor: '#5c4a12'
} as const

export type MessageKind = 'sync' | 'async' | 'return' | 'self'

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  sync: '同期メッセージ',
  async: '非同期メッセージ',
  return: '戻り（応答）',
  self: '自己メッセージ'
}

/** アクティビティ図のノード種別 */
export type ActivityNodeKind =
  | 'action'
  | 'decision'
  | 'merge'
  | 'initial'
  | 'final'
  | 'fork'
  | 'join'

/** 複合フラグメントの演算子 */
export type FragmentOperator =
  | 'alt'
  | 'opt'
  | 'loop'
  | 'break'
  | 'par'
  | 'seq'
  | 'strict'
  | 'critical'

export const FRAGMENT_OPERATORS: FragmentOperator[] = [
  'alt',
  'opt',
  'loop',
  'break',
  'par',
  'seq',
  'strict',
  'critical'
]

/** 区切り線（破線）を追加できる演算子 */
export const DIVIDABLE_OPERATORS: FragmentOperator[] = ['alt', 'par']

/** cell.data に持たせる種別情報 */
export type CellKind =
  | 'lifeline'
  | 'activation'
  | 'message'
  | 'fragment'
  | 'divider'
  | ActivityNodeKind
  | 'swimlane'
  | 'frame'
  | 'text'
  | 'note'
  | 'attachLink'
  | 'flow'
  | 'unknown'

export const ACTIVITY_KIND_LABEL: Record<
  ActivityNodeKind | 'swimlane' | 'frame' | 'flow',
  string
> = {
  action: 'アクション',
  decision: '分岐（デシジョン）',
  merge: '合流（マージ）',
  initial: '開始',
  final: '終了',
  fork: 'フォーク',
  join: 'ジョイン',
  swimlane: 'スイムレーン',
  frame: 'フレーム',
  flow: 'フロー'
}

export interface UmlCellData {
  kind: CellKind
  /** kind === 'message' のときのみ */
  msgKind?: MessageKind
  /** kind === 'fragment' のときのみ */
  operator?: FragmentOperator
}
