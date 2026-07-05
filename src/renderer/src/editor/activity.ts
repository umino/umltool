// アクティビティ図の図形ファクトリ

import type { Edge, Graph, Node } from '@antv/x6'
import { ACTIVITY, SHAPE, type ActivityNodeKind } from './constants'
import { applyFrameHeader, setMessageLabel } from './shapes'
import { autoSizeNode } from './autosize'

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
    data: { kind }
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
    data: { kind: 'flow' }
  })
  if (label !== '') setMessageLabel(edge, label)
  return edge
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
    zIndex: 10
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
    zIndex: -1
  })
  return node
}
