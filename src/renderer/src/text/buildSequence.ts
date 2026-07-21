import type { Node } from '@antv/x6'
import {
  addActivation,
  addAttachedText,
  addFragment,
  addFragmentDivider,
  addGateMessage,
  addLifeline,
  addMessage
} from '../editor/sequence'
import { addNoteNode } from '../editor/note'
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
    const cellById = new Map<string, Node>()
    for (const ll of layout.lifelines) {
      const cell = addLifeline(graph, ll.label, {
        centerX: ll.centerX,
        top: ll.top,
        height: ll.height
      })
      cellById.set(ll.id, cell)
    }

    parsed.messages.forEach((msg, i) => {
      const placed = layout.messages[i]
      if (msg.gate !== null) {
        const lifeline = cellById.get(msg.gate === 'in' ? msg.to : msg.from)
        if (!lifeline || placed.gateX === null) return
        addGateMessage(graph, lifeline, msg.gate, msg.kind, msg.label, {
          y: placed.y,
          gateX: placed.gateX
        })
        return
      }
      const source = cellById.get(msg.from)
      const target = cellById.get(msg.to)
      if (!source || !target) return
      addMessage(graph, source, target, msg.kind, msg.label, { y: placed.y })
    })

    for (const a of layout.activations) {
      const lifeline = cellById.get(a.participantId)
      if (lifeline) addActivation(graph, lifeline, a.y, a.height)
    }

    for (const f of layout.fragments) {
      const node = addFragment(graph, f.operator, f.guard, {
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height
      })
      for (const d of f.dividers) {
        addFragmentDivider(graph, node, d.y, d.guard)
      }
    }

    // note left of / right of は付属テキスト、note over は自由配置のノート
    for (const note of layout.notes) {
      if (note.kind === 'note') {
        addNoteNode(graph, note.text, { x: note.x, y: note.y, width: note.width })
        continue
      }
      const lifeline = cellById.get(note.participantId)
      if (lifeline) {
        addAttachedText(graph, lifeline, note.text, {
          x: note.x,
          y: note.y,
          width: note.width
        })
      }
    }
  })

  // バーが出揃ってから、重なっているものを入れ子として右へずらす
  editor.normalizeAllActivations()
  editor.fit()
}
