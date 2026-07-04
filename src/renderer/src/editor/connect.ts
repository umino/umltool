// ツールバー「＋メッセージ／＋フロー」の接続先解決（選択ベース）

import type { Graph, Node } from '@antv/x6'
import { getCellKind } from './shapes'
import type { CellKind } from './constants'
import type { EditorMode } from './GraphEditor'

const SEQUENCE_KINDS: CellKind[] = ['lifeline', 'activation']
const ACTIVITY_KINDS: CellKind[] = ['action', 'decision', 'initial', 'final', 'fork', 'join']

export type ConnectionEndpoints =
  | { source: Node; target: Node }
  | { error: string }

/**
 * 接続する 2 ノードを決める。
 * - 2 つ以上選択 → 選択順の先頭 2 つ
 * - 1 つ選択 → 中心距離が最寄りの別ノード（無ければ同一ノード＝自己メッセージ）
 * - 0 選択 → シーケンスは x 順の先頭 2 本のライフライン / アクティビティは案内
 */
export function resolveConnectionEndpoints(graph: Graph, mode: EditorMode): ConnectionEndpoints {
  const kinds = mode === 'activity' ? ACTIVITY_KINDS : SEQUENCE_KINDS
  const isConnectable = (n: Node): boolean => kinds.includes(getCellKind(n))

  const selected = graph
    .getSelectedCells()
    .filter((c): c is Node => c.isNode() && isConnectable(c as Node))

  if (selected.length >= 2) {
    return { source: selected[0], target: selected[1] }
  }

  const all = graph.getNodes().filter(isConnectable)

  if (selected.length === 1) {
    const source = selected[0]
    const nearest = nearestNode(source, all)
    if (nearest) return { source, target: nearest }
    if (mode === 'sequence') return { source, target: source } // 自己メッセージ
    return { error: '接続先のノードがありません。もう 1 つノードを追加してください。' }
  }

  if (mode === 'sequence') {
    const lifelines = all
      .filter((n) => getCellKind(n) === 'lifeline')
      .sort((a, b) => centerOf(a).x - centerOf(b).x)
    if (lifelines.length >= 2) return { source: lifelines[0], target: lifelines[1] }
    if (lifelines.length === 1) return { source: lifelines[0], target: lifelines[0] }
    return { error: 'ライフラインがありません。先に追加してください。' }
  }

  return { error: '接続する 2 つのノードを選択してください（Shift+クリックで複数選択）。' }
}

function centerOf(node: Node): { x: number; y: number } {
  const bbox = node.getBBox()
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
}

function nearestNode(from: Node, candidates: Node[]): Node | null {
  const fc = centerOf(from)
  let best: Node | null = null
  let bestDist = Infinity
  for (const n of candidates) {
    if (n.id === from.id) continue
    const c = centerOf(n)
    const d = (c.x - fc.x) ** 2 + (c.y - fc.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = n
    }
  }
  return best
}
