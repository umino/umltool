// マインドマップの自動レイアウト（ライブラリ非依存・純関数）
//
// 同じ木を 2 通りに配置する:
//   map     … ルートを中心に、第 1 階層の子を左右へ振り分けて展開する
//   outline … 1 ノード 1 行の縦インデント（ツリー）
//
// ノードの実寸は呼び出し側から渡す（ラベルに合わせた自動リサイズ後の値）。
// 折りたたまれたノードの子孫は配置せず、hidden として返す。

import { MINDMAP, type MindmapLayout } from '../editor/constants'

export interface MindmapLayoutInput {
  id: string
  /** 親ノードの id。ルートは null */
  parentId: string | null
  width: number
  height: number
  /** true なら子孫を配置しない（隠す） */
  collapsed?: boolean
}

export type MindmapSide = 'root' | 'left' | 'right'

export interface MindmapPlacement {
  id: string
  centerX: number
  centerY: number
  /** 親から見てどちら側に置かれたか（枝の描き方に使う） */
  side: MindmapSide
  depth: number
}

export interface MindmapLayoutResult {
  placements: MindmapPlacement[]
  /** 折りたたみによって隠れるノードの id */
  hidden: string[]
}

export interface MindmapOrigin {
  /** 最初のルートノードの中心 */
  x: number
  y: number
}

const DEFAULT_ORIGIN: MindmapOrigin = { x: MINDMAP.originX, y: MINDMAP.originY }

interface TreeNode extends MindmapLayoutInput {
  children: TreeNode[]
}

/** 入力配列から木（森）を組み立てる。子の順序は入力順 */
function buildForest(nodes: MindmapLayoutInput[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const node of nodes) byId.set(node.id, { ...node, children: [] })

  const roots: TreeNode[] = []
  for (const node of nodes) {
    const self = byId.get(node.id)
    if (!self) continue
    const parent = node.parentId === null ? undefined : byId.get(node.parentId)
    // 親が見つからない（枝が切れている）ノードもルートとして扱う
    if (parent && parent !== self) parent.children.push(self)
    else roots.push(self)
  }
  return roots
}

/** 折りたたみで隠れる子孫を集める */
function collectHidden(node: TreeNode, out: string[]): void {
  for (const child of node.children) {
    out.push(child.id)
    collectHidden(child, out)
  }
}

/** 配置対象の子（折りたたみ中は無し） */
function visibleChildren(node: TreeNode): TreeNode[] {
  return node.collapsed === true ? [] : node.children
}

export function layoutMindmap(
  nodes: MindmapLayoutInput[],
  layout: MindmapLayout,
  origin: MindmapOrigin = DEFAULT_ORIGIN
): MindmapLayoutResult {
  const roots = buildForest(nodes)
  const hidden: string[] = []
  // 折りたたまれたノードの子孫を集める（ルート側から辿る）
  const walk = (node: TreeNode): void => {
    if (node.collapsed === true) {
      collectHidden(node, hidden)
      return
    }
    for (const child of node.children) walk(child)
  }
  for (const root of roots) walk(root)

  const placements =
    layout === 'outline' ? layoutOutline(roots, origin) : layoutMap(roots, origin)
  return { placements, hidden }
}

// ---- map: 中心から左右へ ----

/** 部分木が縦に必要とする高さ */
function subtreeHeight(node: TreeNode, cache: Map<string, number>): number {
  const cached = cache.get(node.id)
  if (cached !== undefined) return cached
  const children = visibleChildren(node)
  let height = node.height
  if (children.length > 0) {
    const total =
      children.reduce((sum, child) => sum + subtreeHeight(child, cache), 0) +
      (children.length - 1) * MINDMAP.siblingGapY
    height = Math.max(height, total)
  }
  cache.set(node.id, height)
  return height
}

/** 兄弟をすき間込みで縦に並べたときの高さ */
function groupHeight(group: TreeNode[], cache: Map<string, number>): number {
  if (group.length === 0) return 0
  return (
    group.reduce((sum, child) => sum + subtreeHeight(child, cache), 0) +
    (group.length - 1) * MINDMAP.siblingGapY
  )
}

function layoutMap(roots: TreeNode[], origin: MindmapOrigin): MindmapPlacement[] {
  const cache = new Map<string, number>()
  const placements: MindmapPlacement[] = []
  // ルートが複数（森）のときは 2 本目以降を下へ積む
  let cursorTop = Number.NaN

  for (const root of roots) {
    // 第 1 階層は部分木の高さが釣り合うように左右へ振り分ける
    const right: TreeNode[] = []
    const left: TreeNode[] = []
    let rightWeight = 0
    let leftWeight = 0
    for (const child of visibleChildren(root)) {
      const weight = subtreeHeight(child, cache) + MINDMAP.siblingGapY
      if (rightWeight <= leftWeight) {
        right.push(child)
        rightWeight += weight
      } else {
        left.push(child)
        leftWeight += weight
      }
    }

    const groups = [
      { side: 'right' as const, nodes: right, total: groupHeight(right, cache) },
      { side: 'left' as const, nodes: left, total: groupHeight(left, cache) }
    ]
    const blockHeight = Math.max(root.height, ...groups.map((g) => g.total))
    const rootCenterY = Number.isNaN(cursorTop) ? origin.y : cursorTop + blockHeight / 2

    placements.push({
      id: root.id,
      centerX: origin.x,
      centerY: rootCenterY,
      side: 'root',
      depth: 0
    })

    for (const group of groups) {
      if (group.nodes.length === 0) continue
      let top = rootCenterY - group.total / 2
      for (const child of group.nodes) {
        placeMapSubtree(
          child,
          group.side,
          origin.x + edgeOffset(root, group.side),
          top,
          1,
          cache,
          placements
        )
        top += subtreeHeight(child, cache) + MINDMAP.siblingGapY
      }
    }

    cursorTop = rootCenterY + blockHeight / 2 + MINDMAP.siblingGapY * 4
  }

  return placements
}

/** 親の中心から、その辺（左右）までの符号付きオフセット */
function edgeOffset(node: TreeNode, side: 'left' | 'right'): number {
  return side === 'right' ? node.width / 2 : -node.width / 2
}

/**
 * 部分木を再帰的に配置する。
 * @param anchorX 親の辺の x（この位置から levelGapX だけ離した所にノードを置く）
 * @param top 部分木の上端 y
 */
function placeMapSubtree(
  node: TreeNode,
  side: 'left' | 'right',
  anchorX: number,
  top: number,
  depth: number,
  cache: Map<string, number>,
  out: MindmapPlacement[]
): void {
  const height = subtreeHeight(node, cache)
  const centerY = top + height / 2
  const centerX =
    side === 'right'
      ? anchorX + MINDMAP.levelGapX + node.width / 2
      : anchorX - MINDMAP.levelGapX - node.width / 2
  out.push({ id: node.id, centerX, centerY, side, depth })

  const children = visibleChildren(node)
  if (children.length === 0) return
  const total =
    children.reduce((sum, child) => sum + subtreeHeight(child, cache), 0) +
    (children.length - 1) * MINDMAP.siblingGapY
  let childTop = centerY - total / 2
  const childAnchorX = centerX + edgeOffset(node, side)
  for (const child of children) {
    placeMapSubtree(child, side, childAnchorX, childTop, depth + 1, cache, out)
    childTop += subtreeHeight(child, cache) + MINDMAP.siblingGapY
  }
}

// ---- outline: 縦インデントのツリー ----

function layoutOutline(roots: TreeNode[], origin: MindmapOrigin): MindmapPlacement[] {
  const placements: MindmapPlacement[] = []
  const left = origin.x - (roots[0]?.width ?? 0) / 2
  let cursorY = origin.y - (roots[0]?.height ?? 0) / 2

  const walk = (node: TreeNode, depth: number): void => {
    placements.push({
      id: node.id,
      centerX: left + depth * MINDMAP.indentX + node.width / 2,
      centerY: cursorY + node.height / 2,
      side: depth === 0 ? 'root' : 'right',
      depth
    })
    cursorY += node.height + MINDMAP.rowGapY
    for (const child of visibleChildren(node)) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)

  return placements
}
