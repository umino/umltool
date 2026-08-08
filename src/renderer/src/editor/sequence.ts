// シーケンス図の図形ファクトリ

import type { Edge, Graph, Node } from '@antv/x6'
import {
  ACTIVATION,
  FRAGMENT,
  LIFELINE,
  MESSAGE,
  NOTE,
  SHAPE,
  TEXT,
  Z,
  type FragmentOperator,
  type MessageKind
} from './constants'
import {
  applyDividerGeometry,
  applyLifelineGeometry,
  getCellKind,
  messageLineAttrs,
  setDividerGuard,
  setFragmentGuard,
  setMessageLabel
} from './shapes'
import { autoSizeNode, fitTextHeight } from './autosize'

export interface LifelineOptions {
  centerX: number
  top?: number
  height?: number
}

/** ライフラインを追加する */
export function addLifeline(graph: Graph, name: string, opts: LifelineOptions): Node {
  const top = opts.top ?? LIFELINE.top
  const height = opts.height ?? LIFELINE.defaultHeight
  const node = graph.addNode({
    shape: SHAPE.lifeline,
    x: opts.centerX - LIFELINE.width / 2,
    y: top,
    width: LIFELINE.width,
    height,
    attrs: { label: { text: name } },
    data: { kind: 'lifeline' },
    zIndex: Z.lifeline
  })
  autoSizeNode(node, name)
  applyLifelineGeometry(node)
  return node
}

/** 実行仕様（活性化バー）をライフラインの子として追加する */
export function addActivation(graph: Graph, lifeline: Node, y: number, height: number): Node {
  const bbox = lifeline.getBBox()
  const node = graph.addNode({
    shape: SHAPE.activation,
    x: bbox.x + bbox.width / 2 - ACTIVATION.width / 2,
    y,
    width: ACTIVATION.width,
    height,
    data: { kind: 'activation' },
    zIndex: Z.activation
  })
  lifeline.addChild(node)
  return node
}

export interface MessageOptions {
  y: number
}

/** メッセージを追加する。両端は centerline アンカーで常に水平になる */
export function addMessage(
  graph: Graph,
  source: Node,
  target: Node,
  kind: MessageKind,
  label: string,
  opts: MessageOptions
): Edge {
  const srcX = centerX(source)
  const tgtX = centerX(target)
  const isSelf = source.id === target.id || kind === 'self'

  const vertices = isSelf
    ? [
        { x: srcX + MESSAGE.selfWidth, y: opts.y },
        { x: srcX + MESSAGE.selfWidth, y: opts.y + MESSAGE.selfHeight }
      ]
    : [{ x: (srcX + tgtX) / 2, y: opts.y }]

  const edge = graph.addEdge({
    shape: SHAPE.message,
    source: { cell: source.id },
    target: { cell: target.id },
    vertices,
    attrs: { line: messageLineAttrs(isSelf ? 'self' : kind) },
    data: { kind: 'message', msgKind: isSelf ? 'self' : kind },
    zIndex: Z.message
  })
  if (label !== '') setMessageLabel(edge, label)
  return edge
}

export interface GateMessageOptions extends MessageOptions {
  /** 図の外側の端点 x */
  gateX: number
}

/**
 * 図の外を端点にするメッセージ（PlantUML の `[-> A` / `A ->]`）。
 * 片端はライフライン、もう片端は座標だけの自由な点になる。点側には
 * centerline アンカーが効かないので、点の y と vertex の y を揃えて水平を保つ。
 */
export function addGateMessage(
  graph: Graph,
  lifeline: Node,
  direction: 'in' | 'out',
  kind: MessageKind,
  label: string,
  opts: GateMessageOptions
): Edge {
  const lifelineX = centerX(lifeline)
  const gate = { x: opts.gateX, y: opts.y }
  const edge = graph.addEdge({
    shape: SHAPE.message,
    source: direction === 'in' ? gate : { cell: lifeline.id },
    target: direction === 'in' ? { cell: lifeline.id } : gate,
    vertices: [{ x: (lifelineX + opts.gateX) / 2, y: opts.y }],
    attrs: { line: messageLineAttrs(kind) },
    data: { kind: 'message', msgKind: kind, gate: direction },
    zIndex: Z.message
  })
  if (label !== '') setMessageLabel(edge, label)
  return edge
}

function centerX(node: Node): number {
  const bbox = node.getBBox()
  return bbox.x + bbox.width / 2
}

export interface FragmentRect {
  x: number
  y: number
  width: number
  height: number
}

/** 複合フラグメント（alt/opt/loop など）を追加する。中身は透過の枠 */
export function addFragment(
  graph: Graph,
  operator: FragmentOperator,
  guard: string,
  rect: FragmentRect
): Node {
  const node = graph.addNode({
    shape: SHAPE.fragment,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    attrs: { label: { text: operator } },
    data: { kind: 'fragment', operator },
    zIndex: Z.fragment
  })
  setFragmentGuard(node, guard)
  ensureFragmentBg(graph, node)
  return node
}

/**
 * フラグメントの背景セルを返す（無ければ作成する）。
 * 旧形式（本体 body に塗りが直接付いたファイル）は塗りを背景セルへ移す。
 */
export function ensureFragmentBg(graph: Graph, fragment: Node): Node {
  const existing = (fragment.getChildren() ?? []).find((c) => getCellKind(c) === 'fragmentBg')
  if (existing && existing.isNode()) return existing

  const bbox = fragment.getBBox()
  const bg = graph.addNode({
    shape: SHAPE.fragmentBg,
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    data: { kind: 'fragmentBg' },
    zIndex: Z.fragmentBg
  })
  fragment.addChild(bg)

  const bodyFill = fragment.attr('body/fill')
  if (typeof bodyFill === 'string' && bodyFill !== '' && bodyFill !== 'none') {
    bg.attr('body/fill', bodyFill)
    fragment.attr('body/fill', 'none')
  }
  return bg
}

/** テキストとライフラインを結ぶ紐づけ線を返す */
export function attachLinkOf(graph: Graph, text: Node): Edge | null {
  const edges = graph.model.getConnectedEdges(text)
  return edges.find((e) => getCellKind(e) === 'attachLink') ?? null
}

/** 紐づけ線が表示中か（透過にしていないか） */
export function isAttachLinkVisible(link: Edge): boolean {
  return link.attr('line/stroke') !== 'transparent'
}

/** 紐づけ線の表示/透過を切り替える。テキスト本文の色には影響しない */
export function setAttachLinkVisible(link: Edge, visible: boolean): void {
  link.attr('line/stroke', visible ? NOTE.stroke : 'transparent')
}

/** フラグメントに区切り線（破線）を子として追加する。y は線の中心（絶対座標） */
export function addFragmentDivider(
  graph: Graph,
  fragment: Node,
  y: number,
  guard = ''
): Node {
  const bbox = fragment.getBBox()
  const node = graph.addNode({
    shape: SHAPE.fragmentDivider,
    x: bbox.x,
    y: y - FRAGMENT.dividerHeight / 2,
    width: bbox.width,
    height: FRAGMENT.dividerHeight,
    data: { kind: 'divider' },
    zIndex: Z.divider
  })
  setDividerGuard(node, guard)
  applyDividerGeometry(node)
  fragment.addChild(node)
  return node
}

export interface AttachedTextRect {
  x: number
  y: number
  width: number
}

/**
 * ライフラインに付属するテキストを追加する。
 * ライフラインの子にして移動に追従させ、破線コネクタで対象と結ぶ。
 */
export function addAttachedText(
  graph: Graph,
  lifeline: Node,
  content: string,
  rect: AttachedTextRect
): Node {
  const node = graph.addNode({
    shape: SHAPE.text,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: TEXT.minHeight,
    attrs: { label: { text: content } },
    data: { kind: 'text' },
    zIndex: Z.annotation
  })
  fitTextHeight(node)
  lifeline.addChild(node)
  graph.addEdge({
    shape: SHAPE.attachLink,
    source: { cell: node.id },
    target: { cell: lifeline.id },
    data: { kind: 'attachLink' },
    zIndex: Z.attachLink
  })
  return node
}

/** 次に追加するメッセージの y（既存メッセージの下、ライフライン範囲内） */
export function nextMessageY(graph: Graph): number {
  let maxY = -Infinity
  for (const edge of graph.getEdges()) {
    for (const v of edge.getVertices()) maxY = Math.max(maxY, v.y)
  }

  let laneTop: number = LIFELINE.top
  let laneBottom: number = LIFELINE.top + LIFELINE.defaultHeight
  const lifelines = graph.getNodes().filter((n) => n.getData()?.kind === 'lifeline')
  if (lifelines.length > 0) {
    const bbox = lifelines[0].getBBox()
    laneTop = bbox.y
    laneBottom = bbox.y + bbox.height
  }

  const y = maxY === -Infinity ? laneTop + MESSAGE.startY - LIFELINE.top : maxY + MESSAGE.stepY
  return Math.min(Math.max(y, laneTop + LIFELINE.headHeight + 12), laneBottom - 12)
}
