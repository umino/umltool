// ラベルに合わせたノードの自動リサイズ。
// 幅は上限までテキストに合わせて拡張し、超えた分は折返し（textWrap）を前提に
// 高さを拡張する。計算部は measurer 注入可能な純関数（ユニットテスト対象）。

import type { Node } from '@antv/x6'
import { ACTIVITY, FONT_FAMILY, LIFELINE, NOTE, TEXT } from './constants'

export type TextMeasurer = (text: string) => number

export interface AutoSizeSpec {
  minWidth: number
  maxWidth: number
  minHeight: number
  /** 左右パディング（片側） */
  padX: number
  /** 上下パディング（合計） */
  padY: number
  lineHeight: number
  /** 図形内でテキストに使える幅の割合（矩形=1、菱形=0.55 など） */
  widthFactor: number
}

export const AUTO_SIZE_SPECS = {
  action: {
    minWidth: ACTIVITY.action.width,
    maxWidth: 320,
    minHeight: ACTIVITY.action.height,
    padX: 14,
    padY: 20,
    lineHeight: 18,
    widthFactor: 1
  },
  decision: {
    minWidth: ACTIVITY.decision.width,
    maxWidth: 260,
    minHeight: ACTIVITY.decision.height,
    padX: 8,
    padY: 28,
    lineHeight: 16,
    widthFactor: 0.55
  },
  lifeline: {
    minWidth: LIFELINE.width,
    // ライフラインの中心間隔（gapX=200）を超えて隣と重ならない上限
    maxWidth: 180,
    minHeight: LIFELINE.headHeight,
    padX: 12,
    padY: 0,
    lineHeight: 18,
    widthFactor: 1
  }
} as const satisfies Record<string, AutoSizeSpec>

export interface AutoSize {
  width: number
  height: number
  lines: number
}

/** ラベルから必要サイズを計算する（純関数） */
export function computeAutoSize(label: string, spec: AutoSizeSpec, measure: TextMeasurer): AutoSize {
  if (label === '') {
    return { width: spec.minWidth, height: spec.minHeight, lines: 1 }
  }
  const textW = Math.max(...label.split('\n').map((line) => measure(line)), 0)

  const requiredWidth = textW / spec.widthFactor + spec.padX * 2
  const width = Math.min(Math.max(spec.minWidth, Math.ceil(requiredWidth)), spec.maxWidth)

  const innerAvail = Math.max(1, (width - spec.padX * 2) * spec.widthFactor)
  const lines = label
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(measure(line) / innerAvail)), 0)

  const height = Math.max(spec.minHeight, lines * spec.lineHeight + spec.padY)
  return { width, height, lines }
}

// ---- DOM 依存部 ----

let canvasCtx: CanvasRenderingContext2D | null = null

function domMeasurer(fontSize: number, fontFamily: string): TextMeasurer {
  if (!canvasCtx) canvasCtx = document.createElement('canvas').getContext('2d')
  const ctx = canvasCtx
  if (!ctx) return (text) => text.length * fontSize
  ctx.font = `${fontSize}px ${fontFamily}`
  return (text) => ctx.measureText(text).width
}

/**
 * 手動リサイズ済みの印を付ける。以後 autoSizeNode はこのノードに触らないので、
 * ラベルを編集してもユーザーが決めたサイズが保たれる。
 */
export function markManuallySized(node: Node): void {
  node.updateData({ manualSize: true })
}

/** 手動リサイズ済みか */
export function isManuallySized(node: Node): boolean {
  return (node.getData() as { manualSize?: boolean } | undefined)?.manualSize === true
}

/** 手動リサイズの印を外し、ラベル連動の自動リサイズを再び有効にする */
export function clearManualSize(node: Node): void {
  node.updateData({ manualSize: false })
}

/**
 * ノードをラベルに合わせてリサイズする（中心 X と上端 Y は維持）。
 * ライフラインは幅のみ変更（高さは生存線の長さなので触らない）。
 * ユーザーが手動リサイズしたノードは、その意思を優先して対象外にする。
 */
export function autoSizeNode(node: Node, label: string): void {
  const kind = (node.getData() as { kind?: string } | undefined)?.kind
  if (kind !== 'action' && kind !== 'decision' && kind !== 'lifeline') return
  if (isManuallySized(node)) return

  const spec = AUTO_SIZE_SPECS[kind]
  const fontSize = kind === 'decision' ? 12 : 13
  const size = computeAutoSize(label, spec, domMeasurer(fontSize, FONT_FAMILY))

  const bbox = node.getBBox()
  const centerX = bbox.x + bbox.width / 2
  const width = size.width
  const height = kind === 'lifeline' ? bbox.height : Math.max(size.height, spec.minHeight)

  if (Math.abs(width - bbox.width) < 1 && Math.abs(height - bbox.height) < 1) return
  node.prop({
    position: { x: centerX - width / 2, y: bbox.y },
    size: { width, height }
  })
}

/**
 * テキスト/ノートの高さを、現在の幅での折り返し行数に合わせる（幅・位置は維持）。
 * 幅リサイズ・内容/フォント変更のたびに呼ぶ。
 */
export function fitTextHeight(node: Node): void {
  const kind = (node.getData() as { kind?: string } | undefined)?.kind
  if (kind !== 'text' && kind !== 'note') return
  const spec = kind === 'note' ? NOTE : TEXT

  const fontSize = Number(node.attr('label/fontSize')) || spec.defaultFontSize
  const text = String(node.attr('label/text') ?? '')
  const width = node.getSize().width
  const measure = domMeasurer(fontSize, FONT_FAMILY)
  const innerAvail = Math.max(1, width - spec.padX * 2)
  const lines =
    text === ''
      ? 1
      : text
          .split('\n')
          .reduce((sum, line) => sum + Math.max(1, Math.ceil(measure(line) / innerAvail)), 0)

  const lineH = Math.round(fontSize * spec.lineHeight)
  const height = Math.max(spec.minHeight, lines * lineH + spec.padY * 2)
  if (Math.abs(height - node.getSize().height) < 1) return
  node.resize(width, height)
}
