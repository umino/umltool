import type { Node } from '@antv/x6'
import { addLifeline, addMessage } from '../editor/sequence'
import type { GraphEditor } from '../editor/GraphEditor'
import { layoutSequence } from './autoLayout'
import { parseSequence } from './sequenceParser'

/**
 * テキストを解析・自動レイアウトし、エディタのグラフを再構築する（一方向生成）。
 * 既存の図はクリアされる。
 */
export function buildSequenceFromText(editor: GraphEditor, text: string): void {
  const parsed = parseSequence(text)
  const layout = layoutSequence(parsed)
  const graph = editor.graph

  editor.clear()

  editor.batch(() => {
    const cellByName = new Map<string, Node>()
    for (const ll of layout.lifelines) {
      const cell = addLifeline(graph, ll.name, {
        centerX: ll.centerX,
        top: ll.top,
        height: ll.height
      })
      cellByName.set(ll.name, cell)
    }

    parsed.messages.forEach((msg, i) => {
      const source = cellByName.get(msg.from)
      const target = cellByName.get(msg.to)
      if (!source || !target) return
      addMessage(graph, source, target, msg.kind, msg.label, { y: layout.messages[i].y })
    })
  })

  editor.fit()
}
