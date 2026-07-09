// 自由配置の UML ノート（左上折りの付箋）のファクトリ。両図種で使える。

import type { Graph, Node } from '@antv/x6'
import { NOTE, SHAPE } from './constants'
import { applyNoteGeometry } from './shapes'
import { fitTextHeight } from './autosize'

export interface NoteRect {
  x: number
  y: number
  width: number
}

/** ノートノードを追加する。高さは内容に合わせて自動調整される */
export function addNoteNode(graph: Graph, content: string, rect: NoteRect): Node {
  const node = graph.addNode({
    shape: SHAPE.note,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: NOTE.minHeight,
    attrs: { label: { text: content } },
    data: { kind: 'note' },
    zIndex: 20
  })
  applyNoteGeometry(node)
  fitTextHeight(node)
  return node
}
