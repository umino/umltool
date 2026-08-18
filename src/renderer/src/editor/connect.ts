// パレット「＋メッセージ／＋フロー／枝」の接続先解決（選択ベース）

import type { Graph, Node } from '@antv/x6'
import { getCellKind } from './shapes'
import type { CellKind } from './constants'
import type { EditorMode } from './GraphEditor'
import { mindmapTree } from './mindmap'
import { canReparent } from '../text/mindmapTree'

const SEQUENCE_KINDS: CellKind[] = ['lifeline', 'activation']
const ACTIVITY_KINDS: CellKind[] = [
  'action',
  'decision',
  'merge',
  'initial',
  'final',
  'fork',
  'join'
]
const MINDMAP_KINDS: CellKind[] = ['rootTopic', 'topic']

export type ConnectionEndpoints =
  | { source: Node; target: Node }
  | { error: string }

/**
 * 接続する 2 ノードを決める。
 * - 2 つ以上選択 → 選択順の先頭 2 つ
 * - 1 つ選択 → 中心距離が最寄りの別ノード（無ければ同一ノード＝自己メッセージ）
 * - 0 選択 → シーケンスは x 順の先頭 2 本のライフライン / それ以外は案内
 *
 * マインドマップだけは「親 → 子」の向きに意味があるので resolveBranchEndpoints に任せる。
 */
export function resolveConnectionEndpoints(graph: Graph, mode: EditorMode): ConnectionEndpoints {
  if (mode === 'mindmap') return resolveBranchEndpoints(graph)

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

/**
 * 枝（親 → 子）の両端を決める。向きが意味を持つので、選んだ順を親 → 子とする。
 * - 2 つ以上選択 → 選択順の先頭 = 親、2 つ目 = 子
 * - 1 つ選択 → それを親とし、最寄りの「まだ親がいないトピック」を子にする
 *   （既に木に属しているトピックを勝手に奪わないよう、親付きは候補にしない）
 * - 0 選択 → 案内だけ返す
 */
export function resolveBranchEndpoints(graph: Graph): ConnectionEndpoints {
  const isTopicNode = (n: Node): boolean => MINDMAP_KINDS.includes(getCellKind(n))
  const selected = graph
    .getSelectedCells()
    .filter((c): c is Node => c.isNode() && isTopicNode(c as Node))

  if (selected.length >= 2) return { source: selected[0], target: selected[1] }

  if (selected.length === 1) {
    const source = selected[0]
    const tree = mindmapTree(graph)
    const orphans = graph
      .getNodes()
      .filter(
        (n) =>
          isTopicNode(n) &&
          n.id !== source.id &&
          !tree.parentOf.has(n.id) &&
          // 自分がぶら下がっている木の根は選ばない（繋ぐと輪になる）
          canReparent(tree.childrenOf, n.id, source.id).ok
      )
    const nearest = nearestNode(source, orphans)
    if (nearest) return { source, target: nearest }
    return {
      error:
        '子にできるトピックがありません（親のいないトピックが対象です）。親と子を順に選ぶこともできます。'
    }
  }

  return {
    error: '親にするトピック、子にするトピックの順に選んでください（Shift+クリックで複数選択）。'
  }
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
