// シーケンス図のレイアウト・スタイル定数

/** 書き出し SVG が単体でも同じ見た目になるよう、フォントは属性で明示する */
export const FONT_FAMILY = '"Yu Gothic UI", "Yu Gothic", "Meiryo", system-ui, sans-serif'

/**
 * 重なり順。数値が大きいほど手前。
 *
 * 他のノードを包含するコンテナ（レーン / フレーム / フラグメント）は、背景色を
 * 付けたときに中身を隠さないよう最背面に置く。通常のノードは
 * ライフライン < 活性化バー < メッセージ の順で、バーは生存線を隠しつつ
 * 矢印には隠されない（矢印がバーの上を通る）。
 *
 * X6 は zIndex 未指定のセルに「現在の最大 + 1」を割り当てるため、コンテナを
 * 負にするだけだと後から足したノードが背面に潜り込みうる。取りこぼしが無いよう、
 * 全ての種別に明示的な値を与えること。
 */
export const Z = {
  swimlane: -20,
  frame: -10,
  /** フラグメントの背景色レイヤ。塗りが中身を隠さないよう本体と分離して最背面に置く */
  fragmentBg: -10,
  /** マインドマップの枝。トピックの背面を通す（線がノードに隠れる） */
  branch: -5,
  lifeline: 1,
  /** アクティビティ図の通常ノード（アクション・分岐・開始/終了など） */
  node: 1,
  activation: 2,
  /** 枠線・タブ・ガード文。テキストが活性化バーに隠れないよう前面（背景は fragmentBg） */
  fragment: 3,
  divider: 3,
  message: 4,
  attachLink: 5,
  annotation: 20
} as const

/**
 * セル種別 → zIndex の対応表。保存ファイルには過去の zIndex がそのまま残るため、
 * 読み込み時にこの表で現行の重なり順へ揃える。
 */
export const Z_BY_KIND: Partial<Record<CellKind, number>> = {
  swimlane: Z.swimlane,
  frame: Z.frame,
  fragmentBg: Z.fragmentBg,
  fragment: Z.fragment,
  divider: Z.divider,
  lifeline: Z.lifeline,
  action: Z.node,
  decision: Z.node,
  merge: Z.node,
  initial: Z.node,
  final: Z.node,
  fork: Z.node,
  join: Z.node,
  rootTopic: Z.node,
  topic: Z.node,
  branch: Z.branch,
  activation: Z.activation,
  message: Z.message,
  flow: Z.message,
  attachLink: Z.attachLink,
  text: Z.annotation,
  note: Z.annotation
}

/** 複数行テキストの水平揃え */
export type TextAlign = 'left' | 'center' | 'right'

export const DEFAULT_TEXT_ALIGN: TextAlign = 'center'

export const TEXT_ALIGN_LABEL: Record<TextAlign, string> = {
  left: '左揃え',
  center: '中央揃え',
  right: '右揃え'
}

/** 右パネルのフォント選択肢。value は SVG の font-family にそのまま入る */
export const FONT_FAMILY_CHOICES: { label: string; value: string }[] = [
  { label: '既定（ゴシック）', value: FONT_FAMILY },
  { label: '明朝', value: '"Yu Mincho", "MS Mincho", serif' },
  { label: 'メイリオ', value: '"Meiryo", sans-serif' },
  { label: '等幅', value: '"Consolas", "MS Gothic", monospace' }
]

/**
 * カラーピッカーのプリセット。自由入力（input[type=color]）と併用する。
 * UML の図でよく使う淡い塗りと、線・文字向けの濃い色を並べる。
 */
export const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: '白', value: '#ffffff' },
  { label: '薄グレー', value: '#f2f4f8' },
  { label: '薄ブルー', value: '#eef2fb' },
  { label: '薄グリーン', value: '#e8f5e9' },
  { label: '薄イエロー', value: '#fffbe6' },
  { label: '薄レッド', value: '#fdecea' },
  { label: '薄パープル', value: '#f3e8fd' },
  { label: '黒', value: '#1d2330' },
  { label: 'グレー', value: '#5b6472' },
  { label: 'ブルー', value: '#2d6cdf' },
  { label: 'グリーン', value: '#2f8f46' },
  { label: 'イエロー', value: '#f5c518' },
  { label: 'オレンジ', value: '#b7791f' },
  { label: 'レッド', value: '#c0392b' },
  { label: 'パープル', value: '#7b4bc9' }
]

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
  defaultHeight: 120,
  /**
   * 入れ子 1 段あたり右へずらす量（astah* 風の積み重ね表現）。
   * 幅の半分にして、外側のバーが半分見えたまま重なるようにする。
   */
  nestOffsetX: 6
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
  /** 区切り線からガードラベルの上端までの間隔（UML 慣例どおり線の下に置く） */
  dividerLabelGap: 3,
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
  fragmentBg: 'uml-fragment-bg',
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
  flow: 'uml-flow',
  rootTopic: 'uml-root-topic',
  topic: 'uml-topic',
  branch: 'uml-branch'
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

/**
 * 分岐（デシジョン）の図形。プロジェクト単位の設定で、全ての分岐に一括で効く。
 * PlantUML は横長の 6 角形で描くため、菱形と選べるようにする。
 */
export type DecisionShape = 'diamond' | 'hexagon'

export const DEFAULT_DECISION_SHAPE: DecisionShape = 'diamond'

/** polygon の refPoints（0〜20 の相対座標） */
export const DECISION_SHAPE_POINTS: Record<DecisionShape, string> = {
  diamond: '0,10 10,0 20,10 10,20',
  hexagon: '0,10 5,0 15,0 20,10 15,20 5,20'
}

export const DECISION_SHAPE_LABEL: Record<DecisionShape, string> = {
  diamond: '菱形',
  hexagon: '6 角形'
}

/**
 * 図形内でラベルに使える幅の割合。6 角形は上下の辺が平らな分、
 * 菱形より横に広く文字を置ける。
 */
export const DECISION_WIDTH_FACTOR: Record<DecisionShape, number> = {
  diamond: 0.55,
  hexagon: 0.75
}

/**
 * アクティビティ図ノードを手動リサイズするときの下限。
 * 図形が潰れて種別を判別できなくならない程度に留める。
 */
export const ACTIVITY_MIN_SIZE: Record<ActivityNodeKind, { width: number; height: number }> = {
  action: { width: 60, height: 28 },
  decision: { width: 60, height: 40 },
  merge: { width: 24, height: 18 },
  initial: { width: 12, height: 12 },
  final: { width: 16, height: 16 },
  fork: { width: 40, height: 4 },
  join: { width: 40, height: 4 }
}

export function isActivityNodeKind(kind: string | undefined): kind is ActivityNodeKind {
  return kind !== undefined && kind in ACTIVITY_MIN_SIZE
}

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

// ---- マインドマップ ----

export const MINDMAP = {
  /** 中心トピック / トピックの既定サイズ */
  root: { width: 170, height: 52 },
  topic: { width: 140, height: 40 },
  /** マインドマップ配置: 階層 1 段あたりの水平な隙間（ノードの端から端まで） */
  levelGapX: 64,
  /** マインドマップ配置: 兄弟ノード間の垂直な隙間 */
  siblingGapY: 14,
  /** ツリー配置: 1 段あたりのインデント量 */
  indentX: 36,
  /** ツリー配置: 行間の隙間 */
  rowGapY: 10,
  /** 生成時の基準点（ルートの中心） */
  originX: 520,
  originY: 360
} as const

/** マインドマップのノード種別 */
export type MindmapNodeKind = 'rootTopic' | 'topic'

/** 手動リサイズ時の下限 */
export const MINDMAP_MIN_SIZE: Record<MindmapNodeKind, { width: number; height: number }> = {
  rootTopic: { width: 80, height: 32 },
  topic: { width: 56, height: 26 }
}

export function isMindmapNodeKind(kind: string | undefined): kind is MindmapNodeKind {
  return kind !== undefined && kind in MINDMAP_MIN_SIZE
}

/**
 * マインドマップの表示レイアウト。同じ木を 2 通りに描き分ける。
 * map = 中心から左右へ展開 / outline = 縦インデントのツリー
 */
export type MindmapLayout = 'map' | 'outline'

export const DEFAULT_MINDMAP_LAYOUT: MindmapLayout = 'map'

export const MINDMAP_LAYOUT_LABEL: Record<MindmapLayout, string> = {
  map: 'マインドマップ',
  outline: 'ツリー'
}

/**
 * 深さごとのトピック配色。ルートが 0 で、以降は深さそのまま（表の末尾で頭打ち）。
 * ノード生成時にだけ適用し、以後は右パネルの設定を優先する。
 */
export const MINDMAP_LEVEL_STYLES: { fill: string; stroke: string; text: string }[] = [
  { fill: '#2d6cdf', stroke: '#1f4ea3', text: '#ffffff' },
  { fill: '#eef2fb', stroke: '#2d6cdf', text: '#1d2330' },
  { fill: '#ffffff', stroke: '#5b6472', text: '#1d2330' }
]

export const MINDMAP_KIND_LABEL: Record<MindmapNodeKind | 'branch', string> = {
  rootTopic: '中心トピック',
  topic: 'トピック',
  branch: '枝'
}

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
  | 'fragmentBg'
  | 'divider'
  | ActivityNodeKind
  | 'swimlane'
  | 'frame'
  | 'text'
  | 'note'
  | 'attachLink'
  | 'flow'
  | MindmapNodeKind
  | 'branch'
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
  /** トピックのときのみ。true なら子孫を折りたたんで隠している */
  collapsed?: boolean
}
