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
  MINDMAP_MIN_SIZE,
  NOTE,
  SHAPE,
  TEXT,
  Z_BY_KIND,
  isActivityNodeKind,
  isMindmapNodeKind,
  type DecisionShape,
  type MindmapLayout,
  DEFAULT_MINDMAP_LAYOUT
} from './constants'
import {
  applyDecisionShape,
  applyDividerGeometry,
  applyFrameHeader,
  applyLifelineGeometry,
  applyNoteGeometry,
  centerlineY,
  getCellKind,
  getDividerGuard,
  getFragmentGuard,
  getMessageKind,
  getMessageLabel,
  getNodeLabel,
  getTextFontSize,
  isCodeTopic,
  normalizeLabelFor,
  registerShapes,
  setDividerGuard,
  setFragmentGuard,
  setMessageKind,
  setMessageLabel,
  setNodeLabel
} from './shapes'
import { autoSizeNode, fitTextHeight, markManuallySized } from './autosize'
import { ensureFragmentBg } from './sequence'
import {
  flowTerminalSide,
  markTerminalManual,
  normalizeBranchPorts,
  normalizeFlowTargets,
  setFlowPort,
  setFlowTerminalSide
} from './activity'
import { droppedSide, type Side } from './branchPorts'
import { applyBranchStyle, arrangeMindmap, checkBranch } from './mindmap'
import { activationDepths } from './activationNesting'
import { closeInlineEditor, openInlineEditor } from './inlineEditor'
import {
  alignedPosition,
  centerSnapOffset,
  directionDelta,
  isBeyond,
  unionBox,
  type AlignMode,
  type Box,
  type Direction
} from './arrange'

/** 置いた直後に「繋がっている相手と中心を揃える」ずれの上限 px（issue #35） */
const CENTER_SNAP = 8

const ZOOM_MIN = 0.2
const ZOOM_MAX = 8

export type EditorMode = 'sequence' | 'activity' | 'mindmap'

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
  'join',
  'rootTopic',
  'topic'
])

/** 上下左右のポートを持つ（＝辺を指定して繋げる）ノードか */
function hasFlowPorts(node: Node): boolean {
  const ids = new Set(node.getPorts().map((port) => port.id))
  return ids.has('top') && ids.has('right') && ids.has('bottom') && ids.has('left')
}

export class GraphEditor {
  readonly graph: Graph
  private readonly scroller: Scroller
  private normalizing = false
  /** リサイズ開始時の中心（離したときにここへ戻して中心を保つ） */
  private readonly resizeCenters = new Map<string, { x: number; y: number }>()
  private mode: EditorMode = 'sequence'
  private decisionShape: DecisionShape = DEFAULT_DECISION_SHAPE
  private mindmapLayout: MindmapLayout = DEFAULT_MINDMAP_LAYOUT

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
        createEdge: () => {
          if (this.mode === 'activity') {
            return graphRef!.createEdge({ shape: SHAPE.flow, data: { kind: 'flow' } })
          }
          if (this.mode === 'mindmap') {
            return graphRef!.createEdge({ shape: SHAPE.branch, data: { kind: 'branch' } })
          }
          return graphRef!.createEdge({
            shape: SHAPE.message,
            data: { kind: 'message', msgKind: 'sync' }
          })
        },
        validateConnection: ({ edge, sourceCell, targetCell }) => {
          const ok = (c: Cell | null | undefined): boolean =>
            CONNECTABLE_KINDS.has(getCellKind(c))
          if (!ok(sourceCell) || !ok(targetCell)) return false
          // 枝は「親 → 子」の木なので、二重の親や輪になる繋ぎ方は受け付けない
          if (this.mode === 'mindmap') {
            if (!sourceCell?.isNode() || !targetCell?.isNode()) return false
            return checkBranch(graphRef!, sourceCell, targetCell, edge?.id).ok
          }
          return true
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
        // 背景色レイヤは純描画用なので選択させない（削除・移動されると壊れる）
        filter: (cell: Cell) => getCellKind(cell) !== 'fragmentBg',
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
              isActivityNodeKind(kind) ||
              isMindmapNodeKind(kind)
            )
          },
          minWidth: (node: Node) => {
            const kind = getCellKind(node)
            if (isActivityNodeKind(kind)) return ACTIVITY_MIN_SIZE[kind].width
            if (isMindmapNodeKind(kind)) return MINDMAP_MIN_SIZE[kind].width
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
            if (isMindmapNodeKind(kind)) return MINDMAP_MIN_SIZE[kind].height
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
    this.wireCenterSnap()
    this.wireBranchPorts()

    // 新しく増えた分岐は、パレット・DSL・貼り付けのどれで来ても現在の図形に揃える
    this.graph.on('node:added', ({ node }: { node: Node }) => {
      if (getCellKind(node) === 'decision') applyDecisionShape(node, this.decisionShape)
    })

    // 重なり順は種別で決まる。貼り付けは zIndex を捨てて最前面に置く X6 の仕様
    // なので、そのままだとスイムレーンやフラグメントの背景レイヤが中身の手前に
    // 出てしまう。追加時に種別ごとの値へ戻す。
    this.graph.on('cell:added', ({ cell }: { cell: Cell }) => {
      const z = Z_BY_KIND[getCellKind(cell)]
      if (z !== undefined && cell.getZIndex() !== z) {
        this.withNormalizing(() => cell.setZIndex(z))
      }
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

    // ハンドルでリサイズしても中心は動かさない（issue #26）。
    // 既定では掴んだ辺の反対側が固定されるので、幅を変えるたびに中心が横へずれ、
    // 上下のノードと中心が合わなくなってフローが斜めになる。右パネルの数値入力は
    // 元から中心を保つので、ハンドル操作もそれに揃える。
    //
    // 位置合わせはドラッグ中ではなく離した時に行う。X6 は「掴んだ辺の反対の角」
    // からポインタまでの距離で新しいサイズを決めるので、途中で位置を動かすと
    // 次の mousemove でその分さらに大きくなり、際限なく膨らんでしまう。
    this.graph.on('node:resize', ({ node }: { node: Node }) => {
      if (!isActivityNodeKind(getCellKind(node))) return
      this.resizeCenters.set(node.id, node.getBBox().center)
    })
    this.graph.on('node:resized', ({ node }: { node: Node }) => {
      const center = this.resizeCenters.get(node.id)
      this.resizeCenters.delete(node.id)
      if (!center) return
      const size = node.getSize()
      const next = { x: center.x - size.width / 2, y: center.y - size.height / 2 }
      const now = node.getPosition()
      if (Math.abs(now.x - next.x) < 0.5 && Math.abs(now.y - next.y) < 0.5) return
      node.position(next.x, next.y)
    })
  }

  /**
   * 置いたノードの中心を、フローで繋がっている相手にぴたりと合わせる（issue #35）。
   *
   * フローはノードの辺の中央から出るので、中心が数 px ずれるだけで縦（横）の
   * 矢印が斜めになる。ドラッグを離した時点で、相手との中心の差が CENTER_SNAP
   * 以内なら揃える。それより大きいずれは意図した配置とみなして触らない。
   *
   * まとめて動かしている最中は、1 つだけ吸着させると選択内の相対位置が崩れる
   * ので何もしない。
   */
  private wireCenterSnap(): void {
    this.graph.on('node:moved', ({ node }: { node: Node }) => {
      if (this.mode !== 'activity' || this.normalizing) return
      if (!isActivityNodeKind(getCellKind(node))) return
      if (this.graph.getSelectedCells().filter((c) => c.isNode()).length > 1) return
      const neighbours = this.graph.model
        .getConnectedEdges(node)
        .filter((e) => getCellKind(e) === 'flow')
        .map((e) => (e.getSourceCellId() === node.id ? e.getTargetCell() : e.getSourceCell()))
        .filter((c): c is Node => c != null && c.isNode() && c.id !== node.id)
        .map((n) => n.getBBox() as Box)
      const { dx, dy } = centerSnapOffset(node.getBBox() as Box, neighbours, CENTER_SNAP)
      if (dx === 0 && dy === 0) return
      node.translate(dx, dy)
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
      this.withNormalizing(() => {
        normalizeBranchPorts(graph)
        normalizeFlowTargets(graph)
      })
    }

    // 端点をドラッグしている最中（options.ui）は割り当て直さない。
    //
    // X6 はドラッグ中に吸着したポートへ端点を書き込むが、「吸着先が変わったとき」
    // しか書き込まない。ここで割り当てを走らせると、ユーザーが左のポートへ吸着
    // させた直後に自動割り当てが右へ書き戻し、X6 は吸着先が変わっていないので
    // もう書き込まない。結果、離した時点の端点は元のまま＝変化なしとみなされて
    // edge:connected も飛ばず、手動指定が一切効かなくなる（issue #25）。
    // 確定後の割り当て直しは edge:connected 側で行う。
    const rerunUnlessDragging = ({ options }: { options?: { ui?: boolean } }): void => {
      if (options?.ui) return
      rerun()
    }

    graph.on('edge:added', rerun)
    graph.on('edge:removed', rerun)
    graph.on('edge:change:source', rerunUnlessDragging)
    graph.on('edge:change:target', rerunUnlessDragging)
    graph.on('node:change:position', rerun)
    graph.on('node:change:size', rerun)
  }

  /** フローの端点が今どの辺に固定されているか（'auto' なら自動割り当て） */
  getFlowSide(edge: Edge, terminal: 'source' | 'target'): Side | 'auto' {
    return flowTerminalSide(edge, terminal)
  }

  /**
   * フローの端点を付ける辺を決める（右パネルから使う）。
   * 'auto' に戻すと既定の接続へ戻り、以後は自動割り当ての対象になる。
   */
  setFlowSide(edge: Edge, terminal: 'source' | 'target', side: Side | 'auto'): void {
    const cell = terminal === 'source' ? edge.getSourceCell() : edge.getTargetCell()
    if (!cell?.isNode()) return
    this.withNormalizing(() => setFlowTerminalSide(edge, cell, terminal, side))
    // 辺が空いた / 塞がったので、残りの枝を割り当て直す
    this.normalizeBranchPorts()
  }

  /**
   * フローの経路を初期化する（issue #39）。経由点をすべて消し、手動で決めた
   * 接続辺も「自動」へ戻す。消した経由点の数を返す。
   */
  resetFlowRoute(edge: Edge): number {
    if (getCellKind(edge) !== 'flow') return 0
    const removed = edge.getVertices().length
    this.batch(() => {
      edge.setVertices([])
      for (const side of ['source', 'target'] as const) {
        const cell = side === 'source' ? edge.getSourceCell() : edge.getTargetCell()
        if (cell?.isNode()) {
          this.withNormalizing(() => setFlowTerminalSide(edge, cell, side, 'auto'))
        }
      }
    })
    // 辺が空いたので、残りの枝も割り当て直す
    this.normalizeBranchPorts()
    return removed
  }

  /** 図の作り直し後などに、フローの接続辺をまとめて割り当て直す */
  normalizeBranchPorts(): void {
    if (this.mode !== 'activity') return
    this.withNormalizing(() => {
      normalizeBranchPorts(this.graph)
      normalizeFlowTargets(this.graph)
    })
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

    graph.on('node:dblclick', ({ node }: { node: Node }) => this.startLabelEdit(node))

    graph.on(
      'edge:dblclick',
      ({ edge, e }: { edge: Edge; e: { clientX: number; clientY: number } }) => {
        const kind = getCellKind(edge)
        if (kind !== 'message' && kind !== 'flow' && kind !== 'branch') return
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

  /**
   * ノードのラベルをその場で編集する（ダブルクリックと、追加直後の入力に使う）。
   * 種別ごとに編集欄を重ねる位置と初期値が違う。
   */
  startLabelEdit(node: Node): void {
    const graph = this.graph
    const kind = getCellKind(node)
    // フラグメント/区切り線はガード（条件）を編集する
    if (kind === 'fragment' || kind === 'divider') {
      const bbox = node.getBBox()
      const isFragment = kind === 'fragment'
      // 編集欄は実際のガード表示位置（フラグメントはタブの右、区切り線は線の下）に重ねる
      openInlineEditor(graph, {
        x: bbox.x + (isFragment ? FRAGMENT.tabWidth : 0) + 60,
        y:
          bbox.y +
          (isFragment
            ? FRAGMENT.tabHeight / 2
            : FRAGMENT.dividerHeight / 2 + FRAGMENT.dividerLabelGap + 6),
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
      kind !== 'swimlane' &&
      !isMindmapNodeKind(kind)
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
    // コード表示のトピックは実際の文字サイズで、ノード幅いっぱいの編集欄にする
    const code = isCodeTopic(node)
    openInlineEditor(graph, {
      x: bbox.x + bbox.width / 2,
      y,
      text: getNodeLabel(node),
      fontSize: code
        ? getTextFontSize(node)
        : kind === 'decision'
          ? 12
          : kind === 'rootTopic'
            ? 15
            : 13,
      minWidth: code ? bbox.width : Math.min(bbox.width, 200),
      code,
      onCommit: (text) => {
        const label = normalizeLabelFor(node, text)
        setNodeLabel(node, label)
        autoSizeNode(node, label)
      }
    })
  }

  // ---- シーケンス図の編集挙動 ----

  private wireSequenceBehavior(): void {
    const graph = this.graph

    // 選択したエッジに vertex ハンドル / 端点付け替えハンドルを出す
    graph.on('edge:selected', ({ edge }: { edge: Edge }) => {
      const kind = getCellKind(edge)
      if (kind === 'message') {
        edge.addTools([
          // removeRedundancies を切るのは必須。X6 は掴んだ vertex を離した瞬間に
          // 「両端アンカーと一直線なら冗長」と判断して消すが、メッセージは常に
          // 水平＝必ず一直線なので、上下ドラッグのたびに中央 vertex が消える。
          // vertex が無いメッセージは Y を保持できず、アンカーの既定位置
          // （相手セルの中心 Y）へ戻ってしまう。
          {
            name: 'vertices',
            args: { addable: false, removable: false, removeRedundancies: false, snapRadius: 0 }
          },
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
      } else if (kind === 'branch') {
        // 枝は親子の付け替えだけできれば十分（形は整列が決める）
        edge.addTools([{ name: 'source-arrowhead' }, { name: 'target-arrowhead' }])
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
    // フローはポート以外（ノード本体）へ落とした場合、離した位置に一番近い辺の
    // ポートへ付ける（触っていない側は midSide/boundary の「近い辺」に任せる）。
    graph.on(
      'edge:connected',
      ({
        edge,
        e,
        type,
        currentPort,
        currentPoint
      }: {
        edge: Edge
        e: { clientX: number; clientY: number }
        type?: 'source' | 'target'
        /** ポートの丸の上で離したならその id。ノード本体で離したなら undefined */
        currentPort?: string
        currentPoint?: { x: number; y: number }
      }) => {
        const kind = getCellKind(edge)
        if (kind === 'branch') {
          // 親から見た子の側で枝の形を決める（整列するまでの暫定）
          const source = edge.getSourceCell()
          const target = edge.getTargetCell()
          if (source?.isNode() && target?.isNode()) {
            const side =
              target.getBBox().center.x < source.getBBox().center.x ? 'left' : 'right'
            this.withNormalizing(() => applyBranchStyle(edge, this.mindmapLayout, side))
          }
          graph.select(edge)
          return
        }
        if (kind === 'flow') {
          // 今ポインタで落とした側。ここだけは離した位置で辺を決める
          const dropped = type === 'source' || type === 'target' ? type : null
          const dropPoint = currentPoint ?? graph.clientToLocal(e.clientX, e.clientY)
          for (const side of ['source', 'target'] as const) {
            const terminal = side === 'source' ? edge.getSource() : edge.getTarget()
            const t = terminal as { cell?: string; port?: string }
            if (!t.cell) continue
            // ユーザーが選んだ接続先なので、以後の自動割り当てから外す
            this.withNormalizing(() => markTerminalManual(edge, side))
            const cell = graph.getCellById(t.cell)
            if (side === dropped && currentPort === undefined && cell?.isNode()) {
              // ポートの丸を正確に掴めなくても、落とした位置に近い辺へ付ける。
              // 分岐・合流は小さくポートが密集していて狙った辺に落としにくく、
              // 自動割り当てに任せると意図と違う辺に付く（issue #25）
              // 中央付近で離したときは辺を狙っていないので、既定の「近い辺」に任せる
              const port = hasFlowPorts(cell) ? droppedSide(cell.getBBox(), dropPoint) : null
              if (port) {
                this.withNormalizing(() => setFlowPort(edge, cell, port))
                continue
              }
            }
            if (t.port) continue
            const next = {
              cell: t.cell,
              anchor: { name: 'midSide' },
              connectionPoint: { name: 'boundary' }
            }
            this.withNormalizing(() =>
              side === 'source' ? edge.setSource(next) : edge.setTarget(next)
            )
          }
          // ドラッグ中は割り当てを止めているので、確定したここで残りを整える
          // （手動で埋まった辺を他の枝が避けるようにする）
          this.normalizeBranchPorts()
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

  /**
   * メッセージの端点を指定ライフラインへ付け替える（プロパティパネル用）。
   * 両端が同一になれば自己メッセージへ、自己でなくなれば通常へ正規化される。
   */
  retargetMessage(edge: Edge, side: 'source' | 'target', lifelineId: string): void {
    if (getCellKind(edge) !== 'message') return
    this.batch(() => {
      if (side === 'source') edge.setSource({ cell: lifelineId })
      else edge.setTarget({ cell: lifelineId })
      this.normalizeMessage(edge)
    })
  }

  /** vertex の X を正規化する（通常: 中点固定 / 自己: 右張り出し位置固定） */
  private normalizeMessage(edge: Edge): void {
    if (this.normalizing) return
    if (getCellKind(edge) !== 'message') return
    const src = edge.getSourceCell()
    const tgt = edge.getTargetCell()
    if (!src || !tgt) {
      this.normalizeGateMessage(edge)
      return
    }
    const vertices = edge.getVertices()
    if (vertices.length === 0) {
      // vertex を失ったメッセージ（旧データや X6 の冗長 vertex 削除）は Y を
      // 保持できない。今描かれている位置に中央 vertex を入れ直して復帰させる。
      this.installMessageVertices(edge, this.anchoredMessageY(edge))
      return
    }

    if (src.id === tgt.id) {
      if (vertices.length < 2) {
        // 端点の付け替えで自己メッセージになった直後: コの字ループへ展開する
        this.withNormalizing(() => setMessageKind(edge, 'self'))
        return
      }
      const wantX = centerXOf(src) + MESSAGE.selfWidth
      const needs = vertices.some((v) => Math.abs(v.x - wantX) > 0.5)
      if (needs) {
        this.withNormalizing(() =>
          edge.setVertices(vertices.map((v) => ({ x: wantX, y: v.y })))
        )
      }
      return
    }

    // 自己メッセージを別ノードへ付け替えた場合は通常メッセージに戻し、
    // そのまま下の中点正規化で vertex を 1 つに畳む
    if (getMessageKind(edge) === 'self') {
      this.withNormalizing(() => setMessageKind(edge, 'sync'))
    }

    const midX = (centerXOf(src) + centerXOf(tgt)) / 2
    const v = vertices[0]
    if (Math.abs(v.x - midX) > 0.5 || vertices.length > 1) {
      this.withNormalizing(() => edge.setVertices([{ x: midX, y: v.y }]))
    }
  }

  /**
   * 外部ゲート付きメッセージ（`[-> A` / `A ->]`）の正規化。
   *
   * 片端は座標だけの自由な点で centerline アンカーが効かないため、vertex を上下
   * ドラッグしても点側の y は取り残されて線が斜めになる。点の y を vertex に
   * 合わせて水平を保ち、vertex の x はライフラインと点の中点へ寄せる
   * （ラベルが線の中央に乗るので、中点にないと見た目がずれる）。
   */
  private normalizeGateMessage(edge: Edge): void {
    const src = edge.getSourceCell()
    const tgt = edge.getTargetCell()
    // 自由な点になっている側。両端ともセル / 両端とも点なら対象外
    const side: 'source' | 'target' | null =
      src == null && tgt != null ? 'source' : tgt == null && src != null ? 'target' : null
    if (side === null) return
    const node = side === 'source' ? tgt! : src!
    const point = (side === 'source' ? edge.getSource() : edge.getTarget()) as {
      x?: number
      y?: number
    }
    if (typeof point.x !== 'number' || typeof point.y !== 'number') return
    const pointX = point.x

    const vertices = edge.getVertices()
    const midX = (centerXOf(node) + pointX) / 2
    if (vertices.length === 0) {
      // vertex を失ったら点の高さで入れ直す（水平を保てる唯一の手がかり）
      this.withNormalizing(() => edge.setVertices([{ x: midX, y: point.y as number }]))
      return
    }

    const v = vertices[0]
    const movePoint = Math.abs(point.y - v.y) > 0.5
    const moveVertex = Math.abs(v.x - midX) > 0.5 || vertices.length > 1
    if (!movePoint && !moveVertex) return
    this.withNormalizing(() => {
      if (movePoint) {
        const moved = { x: pointX, y: v.y }
        if (side === 'source') edge.setSource(moved)
        else edge.setTarget(moved)
      }
      if (moveVertex) edge.setVertices([{ x: midX, y: v.y }])
    })
  }

  /**
   * vertex を持たないメッセージが今描かれている Y。
   *
   * vertex が無いと X6 は「相手側の magnet」を参照点としてアンカーへ渡すので、
   * centerline アンカーは相手セルの中心 Y をクランプした値を返す（shapes.ts）。
   * 同じ順にクランプを重ねて、現在の見た目の位置をそのまま再現する。
   */
  private anchoredMessageY(edge: Edge): number {
    const src = edge.getSourceCell()
    const tgt = edge.getTargetCell()
    if (!src?.isNode() || !tgt?.isNode()) return MESSAGE.startY
    const tb = tgt.getBBox()
    return centerlineY(tgt, centerlineY(src, tb.y + tb.height / 2))
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
    const pb = node.getBBox()
    for (const child of node.getChildren() ?? []) {
      const kind = getCellKind(child)
      if (kind === 'fragmentBg') {
        // 背景色レイヤは常に本体と同じ矩形に敷き直す
        const bg = child as Node
        this.withNormalizing(() => {
          bg.position(pb.x, pb.y)
          bg.resize(pb.width, pb.height)
        })
        continue
      }
      if (kind !== 'divider') continue
      const divider = child as Node
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

  // ---- マインドマップ ----

  getMindmapLayout(): MindmapLayout {
    return this.mindmapLayout
  }

  /** 表示スタイル（マップ / ツリー）を切り替え、その配置に並べ直す */
  setMindmapLayout(layout: MindmapLayout): void {
    this.mindmapLayout = layout
    this.arrangeMindmap()
  }

  /**
   * 表示スタイルを記録するだけで並べ直さない（読み込み時用）。
   * 保存ファイルの座標はユーザーが動かした結果なので、開いた瞬間に整列させない。
   */
  restoreMindmapLayout(layout: MindmapLayout): void {
    this.mindmapLayout = layout
  }

  /**
   * トピックを自動配置する。生成時と「整列」操作でだけ呼ぶ（それ以外では
   * ユーザーが動かした位置を保つ）。
   */
  arrangeMindmap(origin?: { x: number; y: number }): void {
    this.batch(() => arrangeMindmap(this.graph, this.mindmapLayout, origin))
    this.refreshScrollArea()
  }

  batch(fn: () => void): void {
    this.graph.batchUpdate(fn)
  }

  clear(): void {
    this.graph.clearCells()
    this.graph.cleanHistory()
  }

  /**
   * 読み込んだモデルを現行仕様へ揃える。
   * 保存ファイルには保存時点の zIndex が残っているため種別ごとの表で再設定し、
   * 背景セルを持たない旧形式のフラグメントにはセルを補って本体の塗りを移す。
   */
  normalizeLoadedCells(): void {
    this.withNormalizing(() => {
      for (const cell of this.graph.getCells()) {
        const z = Z_BY_KIND[getCellKind(cell)]
        if (z !== undefined) cell.setZIndex(z)
      }
      for (const node of this.graph.getNodes()) {
        if (getCellKind(node) === 'fragment') ensureFragmentBg(this.graph, node)
      }
    })
    // vertex を落として保存されたメッセージ（この不具合で Y を失ったもの）に
    // 中央 vertex を入れ直す。位置は今の見た目のままなので図は変わらない。
    for (const edge of this.graph.getEdges()) {
      if (getCellKind(edge) === 'message') this.normalizeMessage(edge)
    }
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

  /**
   * 「まとめて動かせるノード」か。
   *
   * コンテナ（レーン / フレーム / フラグメント）は中身ごと動くので、一括選択に
   * 混ぜると中のノードが二重にずれる。純描画用の背景レイヤや、親に貼り付いて
   * 位置が決まるもの（活性化バー・区切り線）も対象外。
   */
  private isArrangeable(node: Node): boolean {
    const kind = getCellKind(node)
    if (kind === 'swimlane' || kind === 'frame' || kind === 'fragment') return false
    if (kind === 'fragmentBg' || kind === 'divider' || kind === 'activation') return false
    return true
  }

  /** 選択中のノード（祖先も選ばれているものは、二重移動を避けて除く） */
  selectedMovableNodes(): Node[] {
    const nodes = this.graph
      .getSelectedCells()
      .filter((c): c is Node => c.isNode() && this.isArrangeable(c))
    const ids = new Set(nodes.map((n) => n.id))
    return nodes.filter((n) => !n.getAncestors().some((a) => ids.has(a.id)))
  }

  /**
   * 選択の外接矩形より direction 側にあるノードを選択に加える（issue #34）。
   * 追加できた数を返す。「下に空きを作る」ような一括移動の下ごしらえ。
   *
   * 基準は「最初に選んでいたもの」で固定する。1 回目で広がった選択をそのまま
   * 基準にすると外接矩形が図全体に育ってしまい、続けて別の向きを押しても外側に
   * 何も残らない（＝無反応に見える）。下→右と続けて押せば、最初のノードから
   * 見て下にあるものと右にあるものが両方入る。
   *
   * 選択を自分で変えたら（クリック・矩形選択・削除など）基準も取り直す。
   */
  extendSelection(direction: Direction): number {
    const selectedIds = this.graph.getSelectedCells().map((c) => c.id)
    const base = this.extendBaseIds(selectedIds)
    // 基準にしたノードは動かされていることもあるので、位置は都度測り直す
    const anchor = unionBox(
      [...base]
        .map((id) => this.graph.getCellById(id))
        .filter((c): c is Node => c != null && c.isNode())
        .map((n) => n.getBBox() as Box)
    )
    if (anchor === null) return 0
    const ids = new Set(selectedIds)
    const add = this.graph
      .getNodes()
      .filter((n) => !ids.has(n.id) && this.isArrangeable(n))
      .filter((n) => isBeyond(anchor, n.getBBox() as Box, direction))
    if (add.length > 0) this.graph.select(add)
    this.extendAnchor = {
      base,
      selection: new Set(this.graph.getSelectedCells().map((c) => c.id))
    }
    return add.length
  }

  /**
   * 基準にするノードの id。前回の拡張から選択が変わっていなければ引き継ぎ、
   * 変わっていれば（クリックし直した・矩形選択したなど）今の選択から取り直す。
   */
  private extendBaseIds(selectedIds: string[]): Set<string> {
    const previous = this.extendAnchor
    const continuing =
      previous != null &&
      previous.selection.size === selectedIds.length &&
      selectedIds.every((id) => previous.selection.has(id))
    if (continuing) return previous.base
    return new Set(selectedIds)
  }

  /** まとめて選択の基準（連続して別の向きを押したときに使う） */
  private extendAnchor: { base: Set<string>; selection: Set<string> } | null = null

  /** 選択中のノードを direction へ step だけずらす。動かした数を返す */
  nudgeSelection(direction: Direction, step: number): number {
    const nodes = this.selectedMovableNodes()
    if (nodes.length === 0) return 0
    const { dx, dy } = directionDelta(direction, step)
    this.batch(() => {
      for (const node of nodes) node.translate(dx, dy)
    })
    this.ensureCellVisible(nodes[0])
    return nodes.length
  }

  /** 選択中のノードを揃える（基準は選択全体の外接矩形）。揃えた数を返す */
  alignSelection(mode: AlignMode): number {
    const nodes = this.selectedMovableNodes()
    if (nodes.length < 2) return 0
    const target = unionBox(nodes.map((n) => n.getBBox() as Box))
    if (target === null) return 0
    this.batch(() => {
      for (const node of nodes) {
        const box = node.getBBox() as Box
        const next = alignedPosition(box, target, mode)
        if (Math.abs(box.x - next.x) < 0.5 && Math.abs(box.y - next.y) < 0.5) continue
        node.translate(next.x - box.x, next.y - box.y)
      }
    })
    return nodes.length
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

  /** セルを表示領域の中央へ持ってくる（検索のジャンプ用） */
  centerOnCell(cell: Cell): void {
    this.scroller.centerCell(cell)
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
