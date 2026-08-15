import type { Node } from '@antv/x6'
import { addBranch, addRootTopic, addTopic, arrangeMindmap } from '../editor/mindmap'
import type { GraphEditor } from '../editor/GraphEditor'
import { MINDMAP, type MindmapLayout } from '../editor/constants'
import { parseMindmap } from './mindmapParser'

/**
 * アウトライン記法を解析してマインドマップを再構築する（一方向生成）。
 * 既存の図はクリアされる。座標は生成後の arrangeMindmap が決めるので、
 * ここでは仮置きしてサイズだけ確定させる。
 */
export function buildMindmapFromText(
  editor: GraphEditor,
  text: string,
  layout: MindmapLayout
): void {
  const parsed = parseMindmap(text)
  const graph = editor.graph

  editor.clear()

  editor.batch(() => {
    const nodeById = new Map<string, Node>()
    for (const n of parsed.nodes) {
      const opts = { centerX: MINDMAP.originX, centerY: MINDMAP.originY, depth: n.depth }
      const node =
        n.parentId === null
          ? addRootTopic(graph, n.label, opts)
          : addTopic(graph, n.label, opts)
      nodeById.set(n.id, node)

      const parent = n.parentId === null ? undefined : nodeById.get(n.parentId)
      if (parent) addBranch(graph, parent, node)
    }
  })

  editor.batch(() => {
    arrangeMindmap(graph, layout, { x: MINDMAP.originX, y: MINDMAP.originY })
  })
  editor.fit()
}
