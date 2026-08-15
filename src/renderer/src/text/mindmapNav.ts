// マインドマップのキーボード移動（ライブラリ非依存・純関数）
//
// 矢印キーで「親 / 子 / 兄弟」へ選択を移す。木の構造だけでは左右が決まらない
// （マップ表示では枝が左右へ伸びる）ので、現在の座標も併せて見る:
//
//   マップ表示  … 右側の枝は → が子・← が親、左側の枝はその逆。↑↓ は同じ側の兄弟
//   ツリー表示  … ↑↓ は前後の行、← が親、→ が子
//
// 兄弟が尽きたときは「同じ深さ・同じ側」の最寄りへ移る（列を上下に走査できる）。

import type { MindmapLayout } from '../editor/constants'
import type { MindmapSide } from './mindmapLayout'

export type MindmapDirection = 'up' | 'down' | 'left' | 'right'

export interface NavNode {
  id: string
  /** 親ノードの id。ルートは null */
  parentId: string | null
  /** 親から見た側（ルートは 'root'） */
  side: MindmapSide
  /** ルートを 0 とする深さ */
  depth: number
  centerX: number
  centerY: number
}

/** 同じ位置とみなす許容差 */
const EPS = 0.5

/**
 * 移動先のノード id を返す。移動できないときは null。
 * 与えるのは「表示されているノード」だけ（折りたたみで隠れたものは含めない）。
 */
export function resolveMindmapMove(
  nodes: NavNode[],
  currentId: string,
  direction: MindmapDirection,
  layout: MindmapLayout
): string | null {
  const current = nodes.find((n) => n.id === currentId)
  if (!current) return null
  const childrenOf = (id: string): NavNode[] => nodes.filter((n) => n.parentId === id)

  if (layout === 'outline') {
    // 行が上から順に並ぶので、上下は表示順そのもの
    if (direction === 'up' || direction === 'down') {
      return nearestInDirection(others(nodes, currentId), current, direction)
    }
    if (direction === 'left') return current.parentId
    return nearestChild(current, childrenOf(currentId))
  }

  if (direction === 'up' || direction === 'down') {
    const siblings =
      current.parentId === null
        ? []
        : childrenOf(current.parentId).filter(
            (n) => n.id !== currentId && n.side === current.side
          )
    const fromSiblings = nearestInDirection(siblings, current, direction)
    if (fromSiblings !== null) return fromSiblings
    // 兄弟が尽きたら、同じ深さ・同じ側の列を続けて辿る
    const column = others(nodes, currentId).filter(
      (n) => n.depth === current.depth && n.side === current.side
    )
    return nearestInDirection(column, current, direction)
  }

  // ルートは押した向きの側にある子へ入る
  if (current.side === 'root') {
    const wanted: MindmapSide = direction === 'right' ? 'right' : 'left'
    return nearestChild(
      current,
      childrenOf(currentId).filter((n) => n.side === wanted)
    )
  }
  const towardChild = current.side === 'left' ? direction === 'left' : direction === 'right'
  return towardChild ? nearestChild(current, childrenOf(currentId)) : current.parentId
}

function others(nodes: NavNode[], excludeId: string): NavNode[] {
  return nodes.filter((n) => n.id !== excludeId)
}

/** その向きにあるノードのうち、最も近いもの */
function nearestInDirection(
  candidates: NavNode[],
  from: NavNode,
  direction: 'up' | 'down'
): string | null {
  const ahead = candidates.filter((n) =>
    direction === 'up' ? n.centerY < from.centerY - EPS : n.centerY > from.centerY + EPS
  )
  return pickNearest(ahead, from)
}

/** 高さが最も近い子。同じなら横に近い方 */
function nearestChild(from: NavNode, children: NavNode[]): string | null {
  return pickNearest(children, from)
}

/** from に最も近いノード（縦の距離が優先、同じなら横の距離） */
function pickNearest(candidates: NavNode[], from: NavNode): string | null {
  let best: NavNode | null = null
  let bestCost: [number, number] = [Infinity, Infinity]
  for (const node of candidates) {
    const cost: [number, number] = [
      Math.abs(node.centerY - from.centerY),
      Math.abs(node.centerX - from.centerX)
    ]
    if (cost[0] < bestCost[0] || (cost[0] === bestCost[0] && cost[1] < bestCost[1])) {
      best = node
      bestCost = cost
    }
  }
  return best?.id ?? null
}
