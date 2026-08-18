// マインドマップの図形ファクトリと整列
//
// 親子関係は「枝（branch edge）」で表す。X6 の親子（getChildren）は包含を表す
// ために使われており、そちらに寄せると子トピックが親の移動に引きずられてしまう。
// ルートは「入ってくる枝を持たないトピック」として毎回導出するので、
// 枝を繋ぎ替えるだけで木の形を変えられる。

import type { Edge, Graph, Node } from '@antv/x6'
import {
  MINDMAP,
  MINDMAP_LEVEL_STYLES,
  MINDMAP_TOPIC_PALETTE,
  SHAPE,
  Z,
  isMindmapNodeKind,
  type MindmapLayout,
  type MindmapNodeKind,
  type UmlCellData
} from './constants'
import { TREE_ROUTER, getCellKind } from './shapes'
import { autoSizeNode } from './autosize'
import {
  layoutMindmap,
  type MindmapLayoutInput,
  type MindmapOrigin,
  type MindmapSide
} from '../text/mindmapLayout'
import { subtreeIds, canReparent, type ReparentCheck } from '../text/mindmapTree'
import type { NavNode } from '../text/mindmapNav'

export interface TopicOptions {
  centerX: number
  centerY: number
  /** 配色に使う深さ（ルート = 0）。省略時は既定の配色のまま */
  depth?: number
}

/** 深さに応じた配色を当てる。生成時にだけ呼び、以後は右パネルの設定を優先する */
export function applyTopicLevelStyle(node: Node, depth: number): void {
  const style = MINDMAP_LEVEL_STYLES[Math.min(depth, MINDMAP_LEVEL_STYLES.length - 1)]
  node.attr('body/fill', style.fill)
  node.attr('body/stroke', style.stroke)
  node.attr('label/fill', style.text)
}

function addTopicNode(
  graph: Graph,
  kind: MindmapNodeKind,
  label: string,
  opts: TopicOptions
): Node {
  const size = kind === 'rootTopic' ? MINDMAP.root : MINDMAP.topic
  const node = graph.addNode({
    shape: kind === 'rootTopic' ? SHAPE.rootTopic : SHAPE.topic,
    x: opts.centerX - size.width / 2,
    y: opts.centerY - size.height / 2,
    width: size.width,
    height: size.height,
    attrs: { label: { text: label } },
    data: { kind },
    zIndex: Z.node
  })
  if (opts.depth !== undefined && kind === 'topic') applyTopicLevelStyle(node, opts.depth)
  autoSizeNode(node, label)
  return node
}

/** 中心トピック（ルート）を追加する */
export function addRootTopic(graph: Graph, label: string, opts: TopicOptions): Node {
  return addTopicNode(graph, 'rootTopic', label, opts)
}

/** 通常のトピックを追加する */
export function addTopic(graph: Graph, label: string, opts: TopicOptions): Node {
  return addTopicNode(graph, 'topic', label, opts)
}

/** 枝（親 → 子）を追加する。実際の接続辺は整列時に配置へ合わせて貼り替える */
export function addBranch(graph: Graph, parent: Node, child: Node): Edge {
  return graph.addEdge({
    shape: SHAPE.branch,
    source: { cell: parent.id, port: 'right' },
    target: { cell: child.id, port: 'left' },
    data: { kind: 'branch' },
    zIndex: Z.branch
  })
}

export function isTopic(cell: Node | null | undefined): boolean {
  return isMindmapNodeKind(getCellKind(cell))
}

export function isCollapsed(node: Node): boolean {
  return node.getData<UmlCellData>()?.collapsed === true
}

// ---- グラフから木を導出する ----

export interface MindmapTree {
  /** レイアウト関数へ渡す入力（グラフ上の実寸込み） */
  inputs: MindmapLayoutInput[]
  nodes: Map<string, Node>
  /** 子 id → 親 id */
  parentOf: Map<string, string>
  /** 親 id → 子 id（枝を追加した順） */
  childrenOf: Map<string, string[]>
  /** 親子が揃っている枝（子 id → 枝） */
  branchOf: Map<string, Edge>
}

/**
 * グラフ上のトピックと枝から木を組み立てる。
 * 同じ子に複数の枝が入っている場合は最初の 1 本だけを親とみなす。
 */
export function mindmapTree(graph: Graph): MindmapTree {
  const nodes = new Map<string, Node>()
  for (const node of graph.getNodes()) {
    if (isTopic(node)) nodes.set(node.id, node)
  }

  const parentOf = new Map<string, string>()
  const childrenOf = new Map<string, string[]>()
  const branchOf = new Map<string, Edge>()
  for (const edge of graph.getEdges()) {
    if (getCellKind(edge) !== 'branch') continue
    const parentId = edge.getSourceCellId()
    const childId = edge.getTargetCellId()
    if (!parentId || !childId) continue
    if (!nodes.has(parentId) || !nodes.has(childId)) continue
    if (parentId === childId || parentOf.has(childId)) continue
    parentOf.set(childId, parentId)
    branchOf.set(childId, edge)
    const siblings = childrenOf.get(parentId) ?? []
    siblings.push(childId)
    childrenOf.set(parentId, siblings)
  }

  // 枝を辿って自分自身に戻る（循環）ものは親なし扱いにして無限再帰を防ぐ
  for (const childId of [...parentOf.keys()]) {
    const seen = new Set<string>([childId])
    let cursor = parentOf.get(childId)
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        parentOf.delete(childId)
        branchOf.delete(childId)
        const siblings = childrenOf.get(cursor)
        if (siblings) childrenOf.set(cursor, siblings.filter((id) => id !== childId))
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor)
    }
  }

  // 入力の並び順が子の並び順になるので、親→子の深さ優先で並べる
  const inputs: MindmapLayoutInput[] = []
  const pushSubtree = (id: string): void => {
    const node = nodes.get(id)
    if (!node) return
    const size = node.getSize()
    inputs.push({
      id,
      parentId: parentOf.get(id) ?? null,
      width: size.width,
      height: size.height,
      collapsed: isCollapsed(node)
    })
    for (const childId of childrenOf.get(id) ?? []) pushSubtree(childId)
  }
  for (const id of nodes.keys()) {
    if (!parentOf.has(id)) pushSubtree(id)
  }

  return { inputs, nodes, parentOf, childrenOf, branchOf }
}

/**
 * キーボード移動用に、表示中のトピックを座標・深さ・左右付きで並べる。
 * 左右は「親より左にあるか」で毎回決める（ユーザーが動かした結果を尊重する）。
 */
export function mindmapNavNodes(graph: Graph): NavNode[] {
  const tree = mindmapTree(graph)
  const out: NavNode[] = []

  const walk = (id: string, depth: number, parentId: string | null): void => {
    const node = tree.nodes.get(id)
    if (!node || !node.isVisible()) return
    const bbox = node.getBBox()
    const parentBox = parentId === null ? null : (tree.nodes.get(parentId)?.getBBox() ?? null)
    const side: MindmapSide =
      parentBox === null ? 'root' : bbox.center.x < parentBox.center.x ? 'left' : 'right'
    out.push({
      id,
      parentId,
      side,
      depth,
      centerX: bbox.center.x,
      centerY: bbox.center.y
    })
    for (const childId of tree.childrenOf.get(id) ?? []) walk(childId, depth + 1, id)
  }
  for (const input of tree.inputs) {
    if (input.parentId === null) walk(input.id, 0, null)
  }
  return out
}

/** 配色パレット（キー 1〜6）を当てる */
export function applyTopicPalette(node: Node, index: number): void {
  const style = MINDMAP_TOPIC_PALETTE[index]
  if (!style) return
  node.attr('body/fill', style.fill)
  node.attr('body/stroke', style.stroke)
  node.attr('label/fill', style.text)
}

/** 直接の子トピック（枝を追加した順） */
export function childTopics(graph: Graph, node: Node): Node[] {
  const tree = mindmapTree(graph)
  return (tree.childrenOf.get(node.id) ?? [])
    .map((id) => tree.nodes.get(id))
    .filter((n): n is Node => n !== undefined)
}

/** 親トピック（ルートなら null） */
export function parentTopic(graph: Graph, node: Node): Node | null {
  const tree = mindmapTree(graph)
  const parentId = tree.parentOf.get(node.id)
  return parentId === undefined ? null : (tree.nodes.get(parentId) ?? null)
}

/** そのノードの深さ（ルート = 0） */
export function topicDepth(graph: Graph, node: Node): number {
  const tree = mindmapTree(graph)
  let depth = 0
  let cursor = tree.parentOf.get(node.id)
  while (cursor !== undefined && depth < 100) {
    depth += 1
    cursor = tree.parentOf.get(cursor)
  }
  return depth
}

/** 折りたたみ状態を設定する（表示の更新は updateMindmapVisibility で行う） */
export function setCollapsed(node: Node, collapsed: boolean): void {
  node.updateData({ collapsed })
}

/**
 * 折りたたみ状態に合わせてトピックと枝の表示/非表示を更新する。位置は動かさない
 * （詰め直したいときはユーザーが「整列」を押す）。
 */
export function updateMindmapVisibility(graph: Graph): void {
  const tree = mindmapTree(graph)
  const hidden = new Set<string>()
  // inputs は親 → 子の順に並ぶので、前から見れば祖先の状態が既に確定している
  for (const input of tree.inputs) {
    if (input.parentId === null) continue
    const parent = tree.nodes.get(input.parentId)
    if (hidden.has(input.parentId) || (parent !== undefined && isCollapsed(parent))) {
      hidden.add(input.id)
    }
  }
  for (const [id, node] of tree.nodes) {
    if (hidden.has(id)) node.hide()
    else node.show()
  }
  for (const [childId, edge] of tree.branchOf) {
    if (hidden.has(childId)) edge.hide()
    else edge.show()
  }
}

// ---- 整列 ----

/** 枝の見た目を配置に合わせる（マップ = 左右の曲線 / ツリー = 親の下から L 字） */
export function applyBranchStyle(edge: Edge, layout: MindmapLayout, side: MindmapSide): void {
  if (layout === 'outline') {
    // 親の下端から落として子の左端へ入れる（エクスプローラ風の L 字）。
    //
    // 縦線は「親の左端から indentX の半分だけ右」に落とす。下端の中央から落とすと
    // 子の左端より右になり、横線が子の裏へ潜って線が見えなくなる。左下隅からの
    // 固定オフセットにしておけば、ラベル変更で親の幅が変わってもずれない。
    // 経路は TREE_ROUTER が曲がり角 1 点に固定するので、子をどこへ動かしても L 字を保つ。
    edge.setSource({
      cell: edge.getSourceCellId() as string,
      anchor: { name: 'bottomLeft', args: { dx: MINDMAP.indentX / 2 } },
      connectionPoint: { name: 'anchor' }
    })
    edge.setTarget({
      cell: edge.getTargetCellId() as string,
      anchor: { name: 'left' },
      connectionPoint: { name: 'anchor' }
    })
    edge.setRouter(TREE_ROUTER)
    edge.setConnector('rounded', { radius: 6 })
    return
  }
  const childPort = side === 'left' ? 'right' : 'left'
  const parentPort = side === 'left' ? 'left' : 'right'
  edge.setSource({ cell: edge.getSourceCellId() as string, port: parentPort })
  edge.setTarget({ cell: edge.getTargetCellId() as string, port: childPort })
  edge.removeRouter()
  edge.setConnector('smooth')
}

/**
 * トピックを自動配置する。生成直後と「整列」操作でのみ呼ばれ、それ以外では
 * ユーザーが動かした位置をそのまま保つ。
 *
 * origin を省略すると最初のルートの現在位置を基準にするので、整列しても
 * 図全体が画面外へ飛ばない。
 */
export function arrangeMindmap(
  graph: Graph,
  layout: MindmapLayout,
  origin?: MindmapOrigin
): void {
  const tree = mindmapTree(graph)
  if (tree.inputs.length === 0) return

  const firstRootId = tree.inputs.find((input) => input.parentId === null)?.id
  const firstRoot = firstRootId === undefined ? undefined : tree.nodes.get(firstRootId)
  const base =
    origin ??
    (firstRoot
      ? {
          x: firstRoot.getBBox().x + firstRoot.getBBox().width / 2,
          y: firstRoot.getBBox().y + firstRoot.getBBox().height / 2
        }
      : { x: MINDMAP.originX, y: MINDMAP.originY })

  const { placements, hidden } = layoutMindmap(tree.inputs, layout, base)
  const placementOf = new Map(placements.map((p) => [p.id, p]))
  const hiddenSet = new Set(hidden)

  for (const placement of placements) {
    const node = tree.nodes.get(placement.id)
    if (!node) continue
    const size = node.getSize()
    node.position(placement.centerX - size.width / 2, placement.centerY - size.height / 2)
    node.show()
  }
  for (const id of hiddenSet) tree.nodes.get(id)?.hide()

  for (const [childId, edge] of tree.branchOf) {
    if (hiddenSet.has(childId)) {
      edge.hide()
      continue
    }
    edge.show()
    applyBranchStyle(edge, layout, placementOf.get(childId)?.side ?? 'right')
  }
}

// ---- サブツリーの切り取り / 貼り付け ----
//
// 親子は枝なので、木の付け替えは「枝を外して張り直す」だけで済む。
// 切り取りはノードを消さずに枝だけ外すので、貼り付けを忘れても図から
// トピックが消えることはない（枝を持たない = 独立したルートとして残る）。

/** 枝の見た目に使う左右。親より左にあれば左側の枝とみなす */
function branchSide(parent: Node, child: Node): MindmapSide {
  return child.getBBox().center.x < parent.getBBox().center.x ? 'left' : 'right'
}

/** node とその子孫のトピックを親 → 子の順で返す */
export function subtreeTopics(graph: Graph, root: Node): Node[] {
  const tree = mindmapTree(graph)
  return subtreeIds(tree.childrenOf, root.id)
    .map((id) => tree.nodes.get(id))
    .filter((n): n is Node => n !== undefined)
}

/** サブツリーの内側にある枝（親も子もサブツリーに含まれる枝） */
export function subtreeBranches(graph: Graph, root: Node): Edge[] {
  const tree = mindmapTree(graph)
  const ids = new Set(subtreeIds(tree.childrenOf, root.id))
  const out: Edge[] = []
  for (const [childId, edge] of tree.branchOf) {
    if (ids.has(childId) && childId !== root.id) out.push(edge)
  }
  return out
}

/** moving を target の子にできるか（自分自身・自分の子孫は不可） */
export function canMoveTopic(graph: Graph, moving: Node, target: Node): ReparentCheck {
  return canReparent(mindmapTree(graph).childrenOf, moving.id, target.id)
}

/**
 * 親との枝を外して独立させる。外す前の親 id を返す（元々ルートなら null）。
 * ノード自体は消さないので、貼り付けなくても図には残る。
 */
export function detachFromParent(graph: Graph, node: Node): string | null {
  const tree = mindmapTree(graph)
  const parentId = tree.parentOf.get(node.id)
  const edge = tree.branchOf.get(node.id)
  if (edge) graph.removeCell(edge)
  return parentId ?? null
}

/** child を parent の子として繋ぐ。折りたたんだ親は開く */
export function attachAsChild(
  graph: Graph,
  parent: Node,
  child: Node,
  layout: MindmapLayout
): Edge {
  const edge = addBranch(graph, parent, child)
  applyBranchStyle(edge, layout, branchSide(parent, child))
  if (isCollapsed(parent)) setCollapsed(parent, false)
  updateMindmapVisibility(graph)
  return edge
}

/** サブツリー全体を平行移動する（内側の相対位置は保つ） */
export function moveSubtree(graph: Graph, root: Node, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  for (const node of subtreeTopics(graph, root)) {
    const p = node.getPosition()
    node.position(p.x + dx, p.y + dy)
  }
}

/**
 * サブツリーを複製する。複製したルートを返す。
 * 見た目・折りたたみ状態はそのまま引き継ぎ、id だけ新しくなる。
 */
export function cloneSubtree(graph: Graph, root: Node): Node {
  const tree = mindmapTree(graph)
  const ids = subtreeIds(tree.childrenOf, root.id)
  const copyOf = new Map<string, Node>()
  for (const id of ids) {
    const source = tree.nodes.get(id)
    if (!source) continue
    const copy = source.clone()
    graph.addNode(copy)
    copyOf.set(id, copy)
  }
  for (const id of ids) {
    const parentId = tree.parentOf.get(id)
    if (parentId === undefined || !copyOf.has(parentId) || id === root.id) continue
    const parent = copyOf.get(parentId)
    const child = copyOf.get(id)
    if (parent && child) addBranch(graph, parent, child)
  }
  return copyOf.get(root.id) as Node
}

/** 切り取り中であることを示す見た目（破線・薄め）を付け外しする */
export function markSubtreeCut(graph: Graph, root: Node, cut: boolean): void {
  for (const node of subtreeTopics(graph, root)) {
    node.attr('body/strokeDasharray', cut ? '6 4' : null)
    node.attr('body/opacity', cut ? 0.55 : null)
    node.attr('label/opacity', cut ? 0.55 : null)
  }
  for (const edge of subtreeBranches(graph, root)) {
    edge.attr('line/strokeDasharray', cut ? '6 4' : null)
    edge.attr('line/opacity', cut ? 0.55 : null)
  }
}

/**
 * parent → child の枝を張ってよいか。理由付きで返す。
 *
 * 「既に親がいる子」を二重に繋ぐと 2 本目は木に反映されず（最初の 1 本だけを
 * 親とみなす）、消えない線だけが残るので断る。輪になる組み合わせも同じく断る。
 * ignoreEdgeId には既存の枝を繋ぎ替えるときにその枝の id を渡す。
 */
export function checkBranch(
  graph: Graph,
  parent: Node,
  child: Node,
  ignoreEdgeId?: string
): ReparentCheck {
  if (parent.id === child.id) {
    return { ok: false, reason: '同じトピック同士は繋げません。' }
  }
  const tree = mindmapTree(graph)
  const current = tree.branchOf.get(child.id)
  if (current !== undefined && current.id !== ignoreEdgeId) {
    return {
      ok: false,
      reason: 'そのトピックには既に親がいます。付け替えは Ctrl+X → 新しい親を選んで Ctrl+V。'
    }
  }
  return canReparent(tree.childrenOf, child.id, parent.id)
}
