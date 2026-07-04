// アクティビティ図の自動レイアウト（ライブラリ非依存・純関数）
//
// ノードは上から順に一定ステップの y に積み、分岐・フォークの枝は col で
// 右方向にずらす。スイムレーンがある場合はレーンが x の基準になる。

import { ACTIVITY, type ActivityNodeKind } from '../editor/constants'
import type { ParsedActivity } from './activityParser'

export interface ActivityNodeLayout {
  id: string
  kind: ActivityNodeKind
  label: string
  lane: string | null
  centerX: number
  centerY: number
  width: number
  height: number
}

export interface LaneLayout {
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface ActivityLayout {
  nodes: ActivityNodeLayout[]
  lanes: LaneLayout[]
}

function sizeOf(kind: ActivityNodeKind): { width: number; height: number } {
  switch (kind) {
    case 'action':
      return { ...ACTIVITY.action }
    case 'decision':
      return { ...ACTIVITY.decision }
    case 'initial':
    case 'final':
      return { width: ACTIVITY.terminal.size, height: ACTIVITY.terminal.size }
    case 'fork':
    case 'join':
      return { ...ACTIVITY.bar }
  }
}

export function layoutActivity(parsed: ParsedActivity): ActivityLayout {
  const hasLanes = parsed.lanes.length > 0
  const laneIndex = new Map(parsed.lanes.map((name, i) => [name, i]))
  const laneMarginX = 20
  const laneTop = 20
  const topOffset = hasLanes ? laneTop + ACTIVITY.laneHeaderHeight : 0

  const nodes: ActivityNodeLayout[] = parsed.nodes.map((node, row) => {
    const size = sizeOf(node.kind)
    let centerX: number
    if (hasLanes) {
      const li = node.lane !== null ? (laneIndex.get(node.lane) ?? 0) : 0
      // レーン内では分岐の枝を小さくずらすだけに留める
      centerX = laneMarginX + li * ACTIVITY.laneWidth + ACTIVITY.laneWidth / 2 + node.col * 36
    } else {
      centerX = ACTIVITY.firstColX + node.col * ACTIVITY.colGapX
    }
    const centerY = topOffset + ACTIVITY.startY + row * ACTIVITY.stepY
    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      lane: node.lane,
      centerX,
      centerY,
      width: size.width,
      height: size.height
    }
  })

  let lanes: LaneLayout[] = []
  if (hasLanes) {
    const contentBottom =
      topOffset + ACTIVITY.startY + Math.max(0, parsed.nodes.length - 1) * ACTIVITY.stepY
    const height = contentBottom - laneTop + ACTIVITY.lanePaddingY + ACTIVITY.stepY / 2
    lanes = parsed.lanes.map((name, i) => ({
      name,
      x: laneMarginX + i * ACTIVITY.laneWidth,
      y: laneTop,
      width: ACTIVITY.laneWidth,
      height
    }))
  }

  return { nodes, lanes }
}
