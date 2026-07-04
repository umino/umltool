import type { Node } from '@antv/x6'
import { addActivityNode, addFlow, addSwimlane } from '../editor/activity'
import type { GraphEditor } from '../editor/GraphEditor'
import { layoutActivity } from './activityLayout'
import { parseActivity } from './activityParser'

/**
 * アクティビティテキストを解析・自動レイアウトし、グラフを再構築する（一方向生成）。
 * 既存の図はクリアされる。
 */
export function buildActivityFromText(editor: GraphEditor, text: string): void {
  const parsed = parseActivity(text)
  const layout = layoutActivity(parsed)
  const graph = editor.graph

  editor.clear()

  editor.batch(() => {
    for (const lane of layout.lanes) {
      addSwimlane(graph, lane.name, lane)
    }

    const nodeById = new Map<string, Node>()
    for (const n of layout.nodes) {
      const node = addActivityNode(graph, n.kind, n.label, {
        centerX: n.centerX,
        centerY: n.centerY
      })
      nodeById.set(n.id, node)
    }

    for (const e of parsed.edges) {
      const source = nodeById.get(e.from)
      const target = nodeById.get(e.to)
      if (!source || !target) continue
      addFlow(graph, source, target, e.label)
    }
  })

  editor.fit()
}
