// シーケンス図の図形ファクトリ

import type { Edge, Graph, Node } from '@antv/x6'
import { ACTIVATION, LIFELINE, MESSAGE, SHAPE, type MessageKind } from './constants'
import { applyLifelineGeometry, messageLineAttrs, setMessageLabel } from './shapes'
import { autoSizeNode } from './autosize'

export interface LifelineOptions {
  centerX: number
  top?: number
  height?: number
}

/** ライフラインを追加する */
export function addLifeline(graph: Graph, name: string, opts: LifelineOptions): Node {
  const top = opts.top ?? LIFELINE.top
  const height = opts.height ?? LIFELINE.defaultHeight
  const node = graph.addNode({
    shape: SHAPE.lifeline,
    x: opts.centerX - LIFELINE.width / 2,
    y: top,
    width: LIFELINE.width,
    height,
    attrs: { label: { text: name } },
    data: { kind: 'lifeline' }
  })
  autoSizeNode(node, name)
  applyLifelineGeometry(node)
  return node
}

/** 実行仕様（活性化バー）をライフラインの子として追加する */
export function addActivation(graph: Graph, lifeline: Node, y: number, height: number): Node {
  const bbox = lifeline.getBBox()
  const node = graph.addNode({
    shape: SHAPE.activation,
    x: bbox.x + bbox.width / 2 - ACTIVATION.width / 2,
    y,
    width: ACTIVATION.width,
    height,
    data: { kind: 'activation' }
  })
  lifeline.addChild(node)
  return node
}

export interface MessageOptions {
  y: number
}

/** メッセージを追加する。両端は centerline アンカーで常に水平になる */
export function addMessage(
  graph: Graph,
  source: Node,
  target: Node,
  kind: MessageKind,
  label: string,
  opts: MessageOptions
): Edge {
  const srcX = centerX(source)
  const tgtX = centerX(target)
  const isSelf = source.id === target.id || kind === 'self'

  const vertices = isSelf
    ? [
        { x: srcX + MESSAGE.selfWidth, y: opts.y },
        { x: srcX + MESSAGE.selfWidth, y: opts.y + MESSAGE.selfHeight }
      ]
    : [{ x: (srcX + tgtX) / 2, y: opts.y }]

  const edge = graph.addEdge({
    shape: SHAPE.message,
    source: { cell: source.id },
    target: { cell: target.id },
    vertices,
    attrs: { line: messageLineAttrs(isSelf ? 'self' : kind) },
    data: { kind: 'message', msgKind: isSelf ? 'self' : kind }
  })
  if (label !== '') setMessageLabel(edge, label)
  return edge
}

function centerX(node: Node): number {
  const bbox = node.getBBox()
  return bbox.x + bbox.width / 2
}

/** 次に追加するメッセージの y（既存メッセージの下、ライフライン範囲内） */
export function nextMessageY(graph: Graph): number {
  let maxY = -Infinity
  for (const edge of graph.getEdges()) {
    for (const v of edge.getVertices()) maxY = Math.max(maxY, v.y)
  }

  let laneTop: number = LIFELINE.top
  let laneBottom: number = LIFELINE.top + LIFELINE.defaultHeight
  const lifelines = graph.getNodes().filter((n) => n.getData()?.kind === 'lifeline')
  if (lifelines.length > 0) {
    const bbox = lifelines[0].getBBox()
    laneTop = bbox.y
    laneBottom = bbox.y + bbox.height
  }

  const y = maxY === -Infinity ? laneTop + MESSAGE.startY - LIFELINE.top : maxY + MESSAGE.stepY
  return Math.min(Math.max(y, laneTop + LIFELINE.headHeight + 12), laneBottom - 12)
}
