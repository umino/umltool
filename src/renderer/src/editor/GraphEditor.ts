// X6 Graph のラッパ。プラグイン統合・シーケンス図の編集挙動・共通操作を提供する。

import {
  Graph,
  History,
  Scroller,
  Selection,
  Snapline,
  Transform,
  Export,
  Clipboard
} from '@antv/x6'
import type { Cell, Edge, EdgeView, Node } from '@antv/x6'
import {
  ACTIVATION,
  ACTIVITY_MIN_SIZE,
  DEFAULT_DECISION_SHAPE,
  FRAGMENT,
  FRAME,
  LIFELINE,
  MESSAGE,
  NOTE,
  SHAPE,
  TEXT,
  isActivityNodeKind,
  type DecisionShape
} from './constants'
import {
  applyDecisionShape,
  applyDividerGeometry,
  applyFrameHeader,
  applyLifelineGeometry,
  applyNoteGeometry,
  getCellKind,
  getDividerGuard,
  getFragmentGuard,
  getMessageKind,
  getMessageLabel,
  getNodeLabel,
  registerShapes,
  setDividerGuard,
  setFragmentGuard,
  setMessageLabel,
  setNodeLabel
} from './shapes'
import { autoSizeNode, fitTextHeight, markManuallySized } from './autosize'
import { normalizeBranchPorts } from './activity'
import { activationDepths } from './activationNesting'
import { closeInlineEditor, openInlineEditor } from './inlineEditor'

const ZOOM_MIN = 0.2
const ZOOM_MAX = 8

export type EditorMode = 'sequence' | 'activity'

/** ドラッグ接続の端点になれるセル種別 */
const CONNECTABLE_KINDS = new Set([
  'lifeline',
  'activation',
  'action',
  'decision',
  'merge',
  'initial',
  'final',
  'fork',
  'join'
])

export class GraphEditor {
  readonly graph: Graph
  private readonly scroller: Scroller
  private normalizing = false
  private mode: EditorMode = 'sequence'
  private decisionShape: DecisionShape = DEFAULT_DECISION_SHAPE

  constructor(container: HTMLElement) {
    registerShapes()

    // connecting.createEdge から参照するため先に宣言する
    let graphRef: Graph | null = null

    this.graph = new Graph({
      container,
      autoResize: true,
      background: { color: '#fbfbfd' },
      grid: { visible: true, size: 8 },
      scaling: { min: ZOOM_MIN, max: ZOOM_MAX },
      mousewheel: {
        enabled: true,
        modifiers: ['ctrl'],
        zoomAtMousePosition: true,
        factor: 1.1
      },
      connecting: {
        snap: { radius: 24 },
        allowBlank: false,
        allowNode: true,
        allowEdge: false,
        allowLoop: true,
        allowMulti: true,
        highlight: true,
        anchor: SHAPE.centerlineAnchor,
        connectionPoint: 'anchor',
        createEdge: () =>
          this.mode === 'activity'
            ? graphRef!.createEdge({ shape: SHAPE.flow, data: { kind: 'flow' } })
            : graphRef!.createEdge({
                shape: SHAPE.message,
                data: { kind: 'message', msgKind: 'sync' }
              }),
        validateConnection: ({ sourceCell, targetCell }) => {
          const ok = (c: Cell | null | undefined): boolean =>
            CONNECTABLE_KINDS.has(getCellKind(c))
          return ok(sourceCell) && ok(targetCell)
        }
      }
    })
    graphRef = this.graph

    this.scroller = new Scroller({
      enabled: true,
      autoResize: true,
      pannable: { enabled: true, eventTypes: ['leftMouseDown'] }
    })
    this.graph.use(this.scroller)
    this.graph.use(
      new Selection({
        enabled: true,
        multiple: true,
        rubberband: true,
        modifiers: 'shift',
        movable: true,
        // 選択されていることが見た目で分かるよう枠を出す。ただし枠が入力を
        // 拾うとノード側のドラッグ・ポート操作を奪ってしまうので pointerEvents
        // は none にする。X6 は「枠が非対話なら」ノードのドラッグを選択全体へ
        // 波及させるので、複数選択したままの移動もこの組み合わせで成立する。
        showNodeSelectionBox: true,
        pointerEvents: 'none'
      })
    )
    this.graph.use(new Snapline({ enabled: true, sharp: true }))
    this.graph.use(new History({ enabled: true }))
    this.graph.use(
      new Transform({
        resizing: {
          enabled: (node: Node) => {
            const kind = getCellKind(node)
            return (
              kind === 'lifeline' ||
              kind === 'activation' ||
              kind === 'swimlane' ||
              kind === 'fragment' ||
              kind === 'frame' ||
              kind === 'text' ||
              kind === 'note' ||
              isActivityNodeKind(kind)
            )
          },
          minWidth: (node: Node) => {
            const kind = getCellKind(node)
            if (isActivityNodeKind(kind)) return ACTIVITY_MIN_SIZE[kind].width
            if (kind === 'activation') return 6
            if (kind === 'swimlane') return 120
            if (kind === 'fragment') return FRAGMENT.minWidth
            if (kind === 'frame') return FRAME.minWidth
            if (kind === 'text') return TEXT.minWidth
            if (kind === 'note') return NOTE.minWidth
            return 60
          },
          minHeight: (node: Node) => {
            const kind = getCellKind(node)
            if (isActivityNodeKind(kind)) return ACTIVITY_MIN_SIZE[kind].height
            if (kind === 'activation') return 24
            if (kind === 'swimlane') return 80
            if (kind === 'fragment') return FRAGMENT.minHeight
            if (kind === 'frame') return FRAME.minHeight
            if (kind === 'text') return TEXT.minHeight
            if (kind === 'note') return NOTE.minHeight
            return LIFELINE.headHeight + 60
          },
          // 開始/終了は真円で描かれる（refR は 50%）ので縦横比を保つ
          preserveAspectRatio: (node: Node) => {
            const kind = getCellKind(node)
            return kind === 'initial' || kind === 'final'
          }
        },
        rotating: false
      })
    )
    this.graph.use(new Export())
    this.graph.use(new Clipboard({ enabled: true }))

    this.wireMiddleButtonPan(container)
    this.wireSequenceBehavior()
    this.wireInlineEditing()
    this.wireActivityResize()
    this.wireBranchPorts()

    // 新しく増えた分岐は、パレット・DSL・貼り付けのどれで来ても現在の図形に揃える
    this.graph.on('node:added', ({ node }: { node: Node }) => {
      if (getCellKind(node) === 'decision') applyDecisionShape(node, this.decisionShape)
    })
  }

  // ---- アクティビティノードの手動リサイズ ----

  /**
   * 手動でリサイズしたアクション/分岐は、以後ラベル編集で自動リサイズされると
   * 指定したサイズが戻されてしまう。リサイズ完了時に印を付けて自動リサイズの
   * 対象から外す（`node:resized` は Transform ウィジェット＝ユーザー操作でのみ発火）。
   */
  private wireActivityResize(): void {
    this.graph.on('node:resized', ({ node }: { node: Node }) => {
      if (isActivityNodeKind(getCellKind(node))) markManuallySized(node)
    })
  }

  // ---- 分岐/合流の枝が重ならないよう接続辺を割り当て直す ----

  /**
   * 枝の向きは相手ノードの位置で決まるので、フローの増減・繋ぎ替えだけでなく
   * ノードの移動・リサイズでも計算し直す。割り当ては edge の source/target を
   * 書き換えるため、withNormalizing で自身の再入を止める。
   */
  private wireBranchPorts(): void {
    const graph = this.graph
    const rerun = (): void => {
      if (this.normalizing || this.mode !== 'activity') return
      this.withNormalizing(() => normalizeBranchPorts(graph))
    }
    graph.on('edge:added', rerun)
    graph.on('edge:removed', rerun)
    graph.on('edge:change:source', rerun)
    graph.on('edge:change:target', rerun)
    graph.on('node:change:position', rerun)
    graph.on('node:change:size', rerun)
  }

  /** 図の作り直し後などに、分岐/合流の接続辺をまとめて割り当て直す */
  normalizeBranchPorts(): void {
    if (this.mode !== 'activity') return
    this.withNormalizing(() => normalizeBranchPorts(this.graph))
  }

  // ---- 分岐（デシジョン）の図形 ----

  /** 現在の分岐図形（プロジェクト単位の設定） */
  getDecisionShape(): DecisionShape {
    return this.decisionShape
  }

  /**
   * 分岐の図形を切り替える。既存の分岐すべてに適用し、以降に追加される分岐も
   * この形になる（`node:added` で新規ノードに当てている）。
   * 図形が変わると文字を置ける幅も変わるので、自動サイズを計算し直す。
   */
  setDecisionShape(shape: DecisionShape): void {
    this.decisionShape = shape
    this.withNormalizing(() => {
      for (const node of this.graph.getNodes()) {
        if (getCellKind(node) !== 'decision') continue
        applyDecisionShape(node, shape)
        autoSizeNode(node, getNodeLabel(node))
      }
    })
  }

  /**
   * 図の作り直し後などに、全ライフラインの活性化バーを配置し直す。
   * 生成直後はまだ移動イベントが起きないので、明示的に呼ぶ必要がある。
   */
  normalizeAllActivations(): void {
    for (const node of this.graph.getNodes()) {
      if (getCellKind(node) === 'lifeline') this.normalizeActivations(node)
    }
  }

  // ---- ダブルクリックでラベル直接編集 ----

  private wireInlineEditing(): void {
    const graph = this.graph

    graph.on('node:dblclick', ({ node }: { node: Node }) => {
      const kind = getCellKind(node)
      // フラグメント/区切り線はガード（条件）を編集する
      if (kind === 'fragment' || kind === 'divider') {
        const bbox = node.getBBox()
        const isFragment = kind === 'fragment'
        openInlineEditor(graph, {
          x: bbox.x + FRAGMENT.tabWidth + 60,
          y: bbox.y + (isFragment ? FRAGMENT.tabHeight / 2 : 0),
          text: isFragment ? getFragmentGuard(node) : getDividerGuard(node),
          fontSize: 11,
          minWidth: 120,
          onCommit: (text) =>
            isFragment ? setFragmentGuard(node, text) : setDividerGuard(node, text)
        })
        return
      }
      // フレームはヘッダタブ位置で編集し、確定時にタブ幅を追従させる
      if (kind === 'frame') {
        const bbox = node.getBBox()
        openInlineEditor(graph, {
          x: bbox.x + 70,
          y: bbox.y + FRAME.tabHeight / 2,
          text: getNodeLabel(node),
          fontSize: 12,
          minWidth: 120,
          onCommit: (text) => applyFrameHeader(node, text)
        })
        return
      }
      // テキスト/ノートは内容を編集し、確定時に高さを追従させる
      if (kind === 'text' || kind === 'note') {
        const bbox = node.getBBox()
        const fallback = kind === 'note' ? NOTE.defaultFontSize : TEXT.defaultFontSize
        const fontSize = Number(node.attr('label/fontSize')) || fallback
        openInlineEditor(graph, {
          x: bbox.x + bbox.width / 2,
          y: bbox.y + bbox.height / 2,
          text: getNodeLabel(node),
          fontSize,
          minWidth: Math.min(bbox.width, 200),
          onCommit: (text) => {
            setNodeLabel(node, text)
            this.withNormalizing(() => fitTextHeight(node))
          }
        })
        return
      }
      if (
        kind !== 'lifeline' &&
        kind !== 'action' &&
        kind !== 'decision' &&
        kind !== 'swimlane'
      ) {
        return
      }
      const bbox = node.getBBox()
      // ラベルの位置: ライフライン/レーンはヘッダ中央、他はノード中央
      const y =
        kind === 'lifeline'
          ? bbox.y + LIFELINE.headHeight / 2
          : kind === 'swimlane'
            ? bbox.y + 15
            : bbox.y + bbox.height / 2
      openInlineEditor(graph, {
        x: bbox.x + bbox.width / 2,
        y,
        text: getNodeLabel(node),
        fontSize: kind === 'decision' ? 12 : 13,
        minWidth: Math.min(bbox.width, 200),
        onCommit: (text) => {
          setNodeLabel(node, text)
          autoSizeNode(node, text)
        }
      })
    })

    graph.on(
      'edge:dblclick',
      ({ edge, e }: { edge: Edge; e: { clientX: number; clientY: number } }) => {
        const kind = getCellKind(edge)
        if (kind !== 'message' && kind !== 'flow') return
        const p = graph.clientToLocal(e.clientX, e.clientY)
        openInlineEditor(graph, {
          x: p.x,
          y: p.y - 10,
          text: getMessageLabel(edge),
          fontSize: 12,
          onCommit: (text) => setMessageLabel(edge, text)
        })
      }
    )

    // 図の作り直しや読込時は編集を破棄する
    graph.on('cell:removed', () => closeInlineEditor())
  }

  // ---- シーケンス図の編集挙動 ----

  private wireSequenceBehavior(): void {
    const graph = this.graph

    // 選択したエッジに vertex ハンドル / 端点付け替えハンドルを出す
    graph.on('edge:selected', ({ edge }: { edge: Edge }) => {
      const kind = getCellKind(edge)
      if (kind === 'message') {
        edge.addTools([
          { name: 'vertices', args: { addable: false, removable: false, snapRadius: 0 } },
          { name: 'source-arrowhead' },
          { name: 'target-arrowhead' }
        ])
      } else if (kind === 'flow') {
        // フローは経由点の追加/削除も自由（直交ルーティングの調整用）
        edge.addTools([
          { name: 'vertices' },
          { name: 'source-arrowhead' },
          { name: 'target-arrowhead' }
        ])
      }
    })
    graph.on('edge:unselected', ({ edge }: { edge: Edge }) => {
      edge.removeTools()
    })

    // 中央 vertex の X をライフライン間の中点へ正規化（上下ドラッグだけが効く操作感）
    graph.on('edge:change:vertices', ({ edge }: { edge: Edge }) => {
      this.normalizeMessage(edge)
    })

    // 端点の付け替え後も vertex を持たせて水平を保つ。
    // フローはポート以外（ノード本体）への接続を midSide/boundary に揃える。
    graph.on(
      'edge:connected',
      ({ edge, e }: { edge: Edge; e: { clientX: number; clientY: number } }) => {
        const kind = getCellKind(edge)
        if (kind === 'flow') {
          for (const side of ['source', 'target'] as const) {
            const terminal = side === 'source' ? edge.getSource() : edge.getTarget()
            const t = terminal as { cell?: string; port?: string }
            if (!t.cell || t.port) continue
            const next = {
              cell: t.cell,
              anchor: { name: 'midSide' },
              connectionPoint: { name: 'boundary' }
            }
            this.withNormalizing(() =>
              side === 'source' ? edge.setSource(next) : edge.setTarget(next)
            )
          }
          graph.select(edge)
          return
        }
        if (kind !== 'message') return
        if (edge.getVertices().length === 0) {
          const p = graph.clientToLocal(e.clientX, e.clientY)
          this.installMessageVertices(edge, p.y)
        } else {
          this.normalizeMessage(edge)
        }
        graph.select(edge)
      }
    )

    // ノード移動: 実行仕様は親ライフラインの中心線に拘束。
    // ライフライン/実行仕様の移動時は、接続メッセージの vertex を再正規化する。
    // フラグメントの区切り線は親フラグメント内で上下移動のみ。
    graph.on('node:change:position', ({ node }: { node: Node }) => {
      if (this.normalizing) return
      const kind = getCellKind(node)
      if (kind === 'activation') {
        this.clampActivation(node)
        this.renormalizeEdgesOf(node)
      } else if (kind === 'lifeline') {
        this.normalizeActivations(node)
        this.renormalizeEdgesOf(node)
      } else if (kind === 'divider') {
        this.clampDivider(node)
      }
    })

    // リサイズ: 活性化バーは中心線に再センタリング（横幅は自由）、
    // ライフラインは中心線が動くので接続を再正規化。
    // フラグメントは区切り線の幅を追従させる。
    graph.on('node:change:size', ({ node }: { node: Node }) => {
      if (this.normalizing) return
      const kind = getCellKind(node)
      if (kind === 'activation') {
        this.clampActivation(node)
      } else if (kind === 'lifeline') {
        this.withNormalizing(() => applyLifelineGeometry(node))
        this.renormalizeEdgesOf(node)
      } else if (kind === 'fragment') {
        this.syncFragmentDividers(node)
      } else if (kind === 'frame') {
        // タブ幅の上限（幅の 70%）が変わるため再計算する
        this.withNormalizing(() => applyFrameHeader(node, getNodeLabel(node)))
      } else if (kind === 'text') {
        // 幅リサイズに合わせて折り返し行数から高さを再計算する
        this.withNormalizing(() => fitTextHeight(node))
      } else if (kind === 'note') {
        // 付箋の path を新サイズに合わせ、折り返しで高さを追従させる
        this.withNormalizing(() => {
          applyNoteGeometry(node)
          fitTextHeight(node)
        })
      }
    })
  }

  /** メッセージに中央 vertex（自己メッセージはループ vertex）を設定する */
  installMessageVertices(edge: Edge, y: number): void {
    const src = edge.getSourceCell()
    const tgt = edge.getTargetCell()
    if (!src || !tgt) return
    this.withNormalizing(() => {
      if (src.id === tgt.id) {
        const cx = centerXOf(src)
        edge.setVertices([
          { x: cx + MESSAGE.selfWidth, y },
          { x: cx + MESSAGE.selfWidth, y: y + MESSAGE.selfHeight }
        ])
        edge.setData({ ...edge.getData(), msgKind: 'self' })
      } else {
        edge.setVertices([{ x: (centerXOf(src) + centerXOf(tgt)) / 2, y }])
      }
    })
  }

  /** vertex の X を正規化する（通常: 中点固定 / 自己: 右張り出し位置固定） */
  private normalizeMessage(edge: Edge): void {
    if (this.normalizing) return
    if (getCellKind(edge) !== 'message') return
    const src = edge.getSourceCell()
    const tgt = edge.getTargetCell()
    if (!src || !tgt) return
    const vertices = edge.getVertices()
    if (vertices.length === 0) return

    if (src.id === tgt.id || getMessageKind(edge) === 'self') {
      const wantX = centerXOf(src) + MESSAGE.selfWidth
      const needs = vertices.some((v) => Math.abs(v.x - wantX) > 0.5)
      if (needs) {
        this.withNormalizing(() =>
          edge.setVertices(vertices.map((v) => ({ x: wantX, y: v.y })))
        )
      }
      return
    }

    const midX = (centerXOf(src) + centerXOf(tgt)) / 2
    const v = vertices[0]
    if (Math.abs(v.x - midX) > 0.5 || vertices.length > 1) {
      this.withNormalizing(() => edge.setVertices([{ x: midX, y: v.y }]))
    }
  }

  /** ノード（とその子）に接続されたメッセージを再正規化する */
  private renormalizeEdgesOf(node: Node): void {
    const targets: Cell[] = [node, ...(node.getChildren() ?? [])]
    const seen = new Set<string>()
    for (const cell of targets) {
      for (const edge of this.graph.model.getConnectedEdges(cell)) {
        if (seen.has(edge.id)) continue
        seen.add(edge.id)
        this.normalizeMessage(edge)
      }
    }
  }

  /** 実行仕様を親ライフラインの中心線上・生存線範囲内に収める */
  private clampActivation(node: Node): void {
    const parent = node.getParent()
    if (!parent || getCellKind(parent) !== 'lifeline') return
    this.normalizeActivations(parent as Node)
  }

  /**
   * ライフライン上の活性化バーを縦範囲内に収め、入れ子の深さだけ右へずらす。
   *
   * ずらす量は他のバーとの包含関係で決まるので、1 本だけでは決められず
   * ライフライン単位でまとめて計算する。
   */
  private normalizeActivations(lifeline: Node): void {
    const bars = (lifeline.getChildren() ?? []).filter(
      (c) => getCellKind(c) === 'activation'
    ) as Node[]
    if (bars.length === 0) return

    const pb = lifeline.getBBox()
    const centerX = pb.x + pb.width / 2
    const depths = activationDepths(
      bars.map((bar) => ({ id: bar.id, y: bar.getPosition().y, height: bar.getSize().height }))
    )

    for (const bar of bars) {
      const size = bar.getSize()
      const pos = bar.getPosition()
      const depth = depths.get(bar.id) ?? 0
      const wantX = centerX - size.width / 2 + depth * ACTIVATION.nestOffsetX
      const minY = pb.y + LIFELINE.headHeight + 4
      const maxY = pb.y + pb.height - size.height
      const wantY = Math.min(Math.max(pos.y, minY), Math.max(minY, maxY))
      if (Math.abs(pos.x - wantX) > 0.5 || Math.abs(pos.y - wantY) > 0.5) {
        this.withNormalizing(() => bar.setPosition(wantX, wantY))
      }
    }
  }

  /** 区切り線を親フラグメントの幅いっぱい・縦範囲内に収める */
  private clampDivider(node: Node): void {
    const parent = node.getParent()
    if (!parent || getCellKind(parent) !== 'fragment') return
    const pb = (parent as Node).getBBox()
    const size = node.getSize()
    const pos = node.getPosition()
    const minY = pb.y + FRAGMENT.tabHeight + 6
    const maxY = pb.y + pb.height - size.height - 6
    const wantY = Math.min(Math.max(pos.y, minY), Math.max(minY, maxY))
    if (Math.abs(pos.x - pb.x) > 0.5 || Math.abs(pos.y - wantY) > 0.5) {
      this.withNormalizing(() => node.setPosition(pb.x, wantY))
    }
  }

  /** フラグメントのリサイズに区切り線の幅・位置を追従させる */
  private syncFragmentDividers(node: Node): void {
    for (const child of node.getChildren() ?? []) {
      if (getCellKind(child) !== 'divider') continue
      const divider = child as Node
      const pb = node.getBBox()
      this.withNormalizing(() => {
        divider.resize(pb.width, divider.getSize().height)
        applyDividerGeometry(divider)
      })
      this.clampDivider(divider)
    }
  }

  private withNormalizing(fn: () => void): void {
    const prev = this.normalizing
    this.normalizing = true
    try {
      fn()
    } finally {
      this.normalizing = prev
    }
  }

  // ---- 中ボタンドラッグでパン ----

  private wireMiddleButtonPan(container: HTMLElement): void {
    container.addEventListener('mousedown', (e) => {
      if (e.button !== 1) return
      e.preventDefault()
      const sc = this.scroller.container
      const start = { x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop }
      const onMove = (me: MouseEvent): void => {
        sc.scrollLeft = start.left - (me.clientX - start.x)
        sc.scrollTop = start.top - (me.clientY - start.y)
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    })
  }

  // ---- 共通操作 ----

  /** 図種別モード（ドラッグ接続で作られるエッジの種類が変わる） */
  setMode(mode: EditorMode): void {
    this.mode = mode
  }

  getMode(): EditorMode {
    return this.mode
  }

  batch(fn: () => void): void {
    this.graph.batchUpdate(fn)
  }

  clear(): void {
    this.graph.clearCells()
    this.graph.cleanHistory()
  }

  fit(): void {
    this.graph.zoomToFit({ padding: 24, maxScale: 1 })
    this.scroller.centerContent()
  }

  zoomIn(): void {
    this.graph.zoom(0.15)
  }

  zoomOut(): void {
    this.graph.zoom(-0.15)
  }

  zoomActual(): void {
    this.graph.zoomTo(1)
  }

  undo(): void {
    if (this.graph.canUndo()) this.graph.undo()
  }

  redo(): void {
    if (this.graph.canRedo()) this.graph.redo()
  }

  deleteSelection(): void {
    const cells = this.graph.getSelectedCells()
    if (cells.length === 0) return
    // graph.removeCells は子孫も接続エッジも消さないため、明示的に集めて一緒に削除する
    // （フラグメントの区切り線・活性化バー、ノートの破線コネクタなど）
    const toRemove = new Map<string, Cell>()
    const collect = (cell: Cell): void => {
      if (toRemove.has(cell.id)) return
      toRemove.set(cell.id, cell)
      for (const child of cell.getChildren() ?? []) collect(child)
      if (cell.isNode()) {
        for (const edge of this.graph.model.getConnectedEdges(cell)) collect(edge)
      }
    }
    for (const cell of cells) collect(cell)
    this.graph.removeCells([...toRemove.values()])
  }

  /** 選択セルをコピー（子・両端が含まれるエッジも一緒に）。対象が無ければ false */
  copySelection(): boolean {
    const cells = this.graph.getSelectedCells()
    if (cells.length === 0) return false
    this.graph.copy(cells, { deep: true })
    return true
  }

  cutSelection(): boolean {
    const cells = this.graph.getSelectedCells()
    if (cells.length === 0) return false
    this.graph.cut(cells, { deep: true })
    return true
  }

  /** クリップボードの内容を少しずらして貼り付け、貼り付けたセルを選択する */
  pasteClipboard(): Cell[] {
    if (this.graph.isClipboardEmpty()) return []
    const cells = this.graph.paste({ offset: { dx: 24, dy: 24 } })
    if (cells.length > 0) {
      this.graph.resetSelection(cells)
      this.ensureCellVisible(cells[0])
    }
    return cells
  }

  selectAll(): void {
    this.graph.resetSelection(this.graph.getCells())
  }

  isSelectionEmpty(): boolean {
    return this.graph.getSelectedCells().length === 0
  }

  /** 読込・生成後にスクロール領域を内容に合わせる */
  refreshScrollArea(): void {
    this.scroller.updateScroller()
  }

  /** 現在表示中の領域の中心（ローカル座標） */
  getVisibleCenter(): { x: number; y: number } {
    const area = this.scroller.getVisibleArea()
    return { x: area.x + area.width / 2, y: area.y + area.height / 2 }
  }

  /** セルが画面外なら見える位置までスクロールする */
  ensureCellVisible(cell: Cell): void {
    if (!this.scroller.isCellVisible(cell)) this.scroller.scrollToCell(cell)
  }

  onSelectionChange(handler: (cells: Cell[]) => void): void {
    this.graph.on('selection:changed', ({ selected }: { selected: Cell[] }) => {
      handler(selected)
    })
  }

  onModelChange(handler: () => void): void {
    this.graph.on('cell:added', handler)
    this.graph.on('cell:removed', handler)
    this.graph.on('cell:changed', handler)
  }

  dispose(): void {
    this.graph.dispose()
  }
}

function centerXOf(cell: Cell): number {
  const bbox = (cell as Node).getBBox()
  return bbox.x + bbox.width / 2
}

export type { Cell, Edge, EdgeView, Node }
