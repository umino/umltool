// 作図用の部品（角丸四角 / テキスト / 矢印。issue #53）のファクトリ。
//
// シーケンス図・アクティビティ図の上に描き足す、図の意味を持たない図形。
// どれも他の要素に繋がらず（親子にもしない）、動かしても何も追従しない。
// 重なり順は常に最前面（Z.drawing）。

import type { Edge, Graph, Node } from '@antv/x6'
import { DRAW, SHAPE, TEXT, Z } from './constants'
import { setArrowHeads } from './shapes'
import { fitTextHeight } from './autosize'

export interface DrawingCenter {
  x: number
  y: number
}

/** 角丸四角を中心指定で追加する */
export function addDrawRect(graph: Graph, content: string, center: DrawingCenter): Node {
  const { width, height } = DRAW.rect
  const node = graph.addNode({
    shape: SHAPE.drawRect,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    attrs: { label: { text: content } },
    data: { kind: 'drawRect' },
    zIndex: Z.drawing
  })
  fitTextHeight(node)
  return node
}

/** 何にも付属しないテキストを中心指定で追加する。高さは行数に追従する */
export function addDrawText(graph: Graph, content: string, center: DrawingCenter): Node {
  const width = TEXT.defaultWidth
  const node = graph.addNode({
    shape: SHAPE.drawText,
    x: center.x - width / 2,
    y: center.y - TEXT.minHeight / 2,
    width,
    height: TEXT.minHeight,
    attrs: { label: { text: content } },
    data: { kind: 'drawText' },
    zIndex: Z.drawing
  })
  fitTextHeight(node)
  return node
}

/** 端点が点のままの矢印を、中心から左右へ伸ばして追加する */
export function addDrawArrow(graph: Graph, center: DrawingCenter): Edge {
  const half = DRAW.arrow.length / 2
  const edge = graph.addEdge({
    shape: SHAPE.drawArrow,
    source: { x: center.x - half, y: center.y },
    target: { x: center.x + half, y: center.y },
    data: { kind: 'drawArrow' },
    zIndex: Z.drawing
  })
  setArrowHeads(edge, 'end')
  return edge
}
