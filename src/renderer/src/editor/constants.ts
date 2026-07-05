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

// X6 に登録するシェイプ名 / アンカー名
export const SHAPE = {
  lifeline: 'uml-lifeline',
  activation: 'uml-activation',
  message: 'uml-message',
  centerlineAnchor: 'uml-centerline',
  action: 'uml-action',
  decision: 'uml-decision',
  merge: 'uml-merge',
  initial: 'uml-initial',
  final: 'uml-final',
  bar: 'uml-bar',
  swimlane: 'uml-swimlane',
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

/** cell.data に持たせる種別情報 */
export type CellKind =
  | 'lifeline'
  | 'activation'
  | 'message'
  | ActivityNodeKind
  | 'swimlane'
  | 'flow'
  | 'unknown'

export const ACTIVITY_KIND_LABEL: Record<ActivityNodeKind | 'swimlane' | 'flow', string> = {
  action: 'アクション',
  decision: '分岐（デシジョン）',
  merge: '合流（マージ）',
  initial: '開始',
  final: '終了',
  fork: 'フォーク',
  join: 'ジョイン',
  swimlane: 'スイムレーン',
  flow: 'フロー'
}

export interface UmlCellData {
  kind: CellKind
  /** kind === 'message' のときのみ */
  msgKind?: MessageKind
}
