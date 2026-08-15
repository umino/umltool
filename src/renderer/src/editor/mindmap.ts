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
  SHAPE,
  Z,
  isMindmapNodeKind,
  type MindmapLayout,
  type MindmapNodeKind,
  type UmlCellData
} from './constants'
import { getCellKind } from './shapes'
import { autoSizeNode } from './autosize'
import {
  layoutMindmap,
  type MindmapLayoutInput,
  type MindmapOrigin,
  type MindmapSide
} from '../text/mindmapLayout'

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
    // アンカーを左へずらすと orth が回り込む経路を選んでしまうため、辺の中央を使う。
    edge.setSource({ cell: edge.getSourceCellId() as string, port: 'bottom' })
    edge.setTarget({ cell: edge.getTargetCellId() as string, port: 'left' })
    edge.setRouter('orth')
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
