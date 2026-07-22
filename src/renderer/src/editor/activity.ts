// アクティビティ図の図形ファクトリ

import type { Edge, Graph, Node } from '@antv/x6'
import { ACTIVITY, SHAPE, Z, type ActivityNodeKind } from './constants'
import { applyFrameHeader, getCellKind, setMessageLabel } from './shapes'
import { autoSizeNode } from './autosize'
import {
  DECISION_OUT_SIDES,
  MERGE_IN_SIDES,
  assignBranchSides,
  type BranchEnd,
  type Side
} from './branchPorts'

/** ノード種別ごとの既定サイズ */
export function activityNodeSize(kind: ActivityNodeKind): { width: number; height: number } {
  switch (kind) {
    case 'action':
      return { ...ACTIVITY.action }
    case 'decision':
      return { ...ACTIVITY.decision }
    case 'merge':
      return { ...ACTIVITY.merge }
    case 'initial':
    case 'final':
      return { width: ACTIVITY.terminal.size, height: ACTIVITY.terminal.size }
    case 'fork':
    case 'join':
      return { ...ACTIVITY.bar }
  }
}

export interface ActivityNodeOptions {
  centerX: number
  centerY: number
  width?: number
  height?: number
}

/** アクティビティ図のノードを追加する */
export function addActivityNode(
  graph: Graph,
  kind: ActivityNodeKind,
  label: string,
  opts: ActivityNodeOptions
): Node {
  const size = activityNodeSize(kind)
  const width = opts.width ?? size.width
  const height = opts.height ?? size.height
  const shapeByKind: Record<ActivityNodeKind, string> = {
    action: SHAPE.action,
    decision: SHAPE.decision,
    merge: SHAPE.merge,
    initial: SHAPE.initial,
    final: SHAPE.final,
    fork: SHAPE.bar,
    join: SHAPE.bar
  }
  const hasLabel = kind === 'action' || kind === 'decision'
  const node = graph.addNode({
    shape: shapeByKind[kind],
    x: opts.centerX - width / 2,
    y: opts.centerY - height / 2,
    width,
    height,
    attrs: hasLabel ? { label: { text: label } } : undefined,
    data: { kind },
    zIndex: Z.node
  })
  // 呼び出し側が明示サイズを指定していない場合のみラベルに合わせる
  if (hasLabel && opts.width == null && opts.height == null) {
    autoSizeNode(node, label)
  }
  return node
}

/** フロー edge のターミナル指定（辺の中点に付き、輪郭で止まる） */
export function flowTerminal(node: Node): {
  cell: string
  anchor: { name: string }
  connectionPoint: { name: string }
} {
  return {
    cell: node.id,
    anchor: { name: 'midSide' },
    connectionPoint: { name: 'boundary' }
  }
}

/** フロー（矢印）を追加する。manhattan ルータで直交配線される */
export function addFlow(graph: Graph, source: Node, target: Node, label = ''): Edge {
  const edge = graph.addEdge({
    shape: SHAPE.flow,
    source: flowTerminal(source),
    target: flowTerminal(target),
    data: { kind: 'flow' },
    zIndex: Z.message
  })
  if (label !== '') setMessageLabel(edge, label)
  return edge
}

/**
 * 分岐/合流に付くフローの接続辺を割り当て直す。
 *
 * 分岐は下・右・左へ、合流は上・右・左から枝が出入りするようにして、矢印同士が
 * 重ならないようにする。分岐の入口は上、合流の出口は下に固定して、枝が使える
 * 3 辺を空けておく。
 */
export function normalizeBranchPorts(graph: Graph): void {
  for (const node of graph.getNodes()) {
    const kind = getCellKind(node)
    if (kind !== 'decision' && kind !== 'merge') continue

    const bbox = node.getBBox()
    const center = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
    const flows = graph
      .getConnectedEdges(node)
      .filter((edge) => getCellKind(edge) === 'flow')

    const branches: Edge[] = []
    const trunkSide: Side = kind === 'decision' ? 'top' : 'bottom'
    for (const edge of flows) {
      // 分岐の入口 / 合流の出口が「幹」。枝はその反対側の端。
      const isBranch = kind === 'decision' ? isSource(edge, node) : isTarget(edge, node)
      if (isBranch) branches.push(edge)
      else setPort(edge, node, trunkSide)
    }

    const ends: BranchEnd[] = []
    for (const edge of branches) {
      const other = otherEndCenter(graph, edge, node)
      if (other) ends.push({ id: edge.id, x: other.x, y: other.y })
    }
    const allowed = kind === 'decision' ? DECISION_OUT_SIDES : MERGE_IN_SIDES
    const sides = assignBranchSides(center, ends, allowed)
    for (const edge of branches) {
      const side = sides.get(edge.id)
      if (side) setPort(edge, node, side)
    }
  }
}

function isSource(edge: Edge, node: Node): boolean {
  return edge.getSourceCellId() === node.id
}

function isTarget(edge: Edge, node: Node): boolean {
  return edge.getTargetCellId() === node.id
}

/** エッジの node 側の端を、その辺のポートに繋ぎ直す（既に同じなら何もしない） */
function setPort(edge: Edge, node: Node, side: Side): void {
  const atSource = isSource(edge, node)
  const current = atSource ? edge.getSource() : edge.getTarget()
  if ((current as { port?: string }).port === side) return
  const terminal = { cell: node.id, port: side }
  if (atSource) edge.setSource(terminal)
  else edge.setTarget(terminal)
}

/** エッジの node ではない側の中心。相手がノードでなければ端点座標を使う */
function otherEndCenter(
  graph: Graph,
  edge: Edge,
  node: Node
): { x: number; y: number } | null {
  const otherId = isSource(edge, node) ? edge.getTargetCellId() : edge.getSourceCellId()
  if (otherId != null && otherId !== node.id) {
    const other = graph.getCellById(otherId)
    if (other && other.isNode()) {
      const b = other.getBBox()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
  }
  const point = isSource(edge, node) ? edge.getTargetPoint() : edge.getSourcePoint()
  return point ? { x: point.x, y: point.y } : null
}

export interface SwimlaneRect {
  x: number
  y: number
  width: number
  height: number
}

/** フレーム（コンテナ）を追加する。中身は透過の枠＋左上のヘッダタブ */
export function addFrame(graph: Graph, header: string, rect: SwimlaneRect): Node {
  const node = graph.addNode({
    shape: SHAPE.frame,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    data: { kind: 'frame' },
    zIndex: Z.frame
  })
  applyFrameHeader(node, header)
  return node
}

/** スイムレーンを追加する（背面に敷く） */
export function addSwimlane(graph: Graph, name: string, rect: SwimlaneRect): Node {
  const node = graph.addNode({
    shape: SHAPE.swimlane,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    attrs: { label: { text: name } },
    data: { kind: 'swimlane' },
    zIndex: Z.swimlane
  })
  return node
}
