import { describe, it, expect } from 'vitest'
import type { Node } from '@antv/x6'
import {
  AUTO_SIZE_SPECS,
  autoSizeNode,
  clearManualSize,
  computeAutoSize,
  isManuallySized,
  markManuallySized,
  type TextMeasurer
} from '../src/renderer/src/editor/autosize'
import { ACTIVITY_MIN_SIZE } from '../src/renderer/src/editor/constants'

// 1 文字 = 10px の単純な measurer
const measure: TextMeasurer = (text) => text.length * 10

describe('computeAutoSize', () => {
  const action = AUTO_SIZE_SPECS.action

  it('空ラベルは最小サイズ', () => {
    const r = computeAutoSize('', action, measure)
    expect(r.width).toBe(action.minWidth)
    expect(r.height).toBe(action.minHeight)
  })

  it('短いラベルは最小幅を下回らない', () => {
    const r = computeAutoSize('あいう', action, measure)
    expect(r.width).toBe(action.minWidth)
    expect(r.lines).toBe(1)
  })

  it('中くらいのラベルは幅がテキストに追従する', () => {
    const text = 'あ'.repeat(20) // 200px
    const r = computeAutoSize(text, action, measure)
    expect(r.width).toBeGreaterThan(action.minWidth)
    expect(r.width).toBeLessThanOrEqual(action.maxWidth)
    expect(r.width).toBe(200 + action.padX * 2)
    expect(r.lines).toBe(1)
  })

  it('長いラベルは上限幅で折返して高さが伸びる', () => {
    const text = 'あ'.repeat(60) // 600px > maxWidth
    const r = computeAutoSize(text, action, measure)
    expect(r.width).toBe(action.maxWidth)
    expect(r.lines).toBeGreaterThan(1)
    expect(r.height).toBeGreaterThan(action.minHeight)
    expect(r.height).toBe(r.lines * action.lineHeight + action.padY)
  })

  it('菱形（decision）は widthFactor の分だけ幅を広めに取る', () => {
    const decision = AUTO_SIZE_SPECS.decision
    const text = 'あ'.repeat(10) // 100px
    const r = computeAutoSize(text, decision, measure)
    expect(r.width).toBe(Math.ceil(100 / decision.widthFactor) + decision.padX * 2)
  })

  it('ライフラインは隣と重ならない上限で頭打ち', () => {
    const lifeline = AUTO_SIZE_SPECS.lifeline
    const r = computeAutoSize('あ'.repeat(50), lifeline, measure)
    expect(r.width).toBe(lifeline.maxWidth)
    expect(lifeline.maxWidth).toBeLessThan(200) // gapX より小さいこと
  })
})

/** getData/updateData/prop だけを持つ最小のノードスタブ */
function stubNode(data: Record<string, unknown>): Node & { propCalls: number } {
  const stub = {
    data,
    propCalls: 0,
    getData: () => stub.data,
    updateData: (patch: Record<string, unknown>) => {
      stub.data = { ...stub.data, ...patch }
    },
    getBBox: () => ({ x: 0, y: 0, width: 150, height: 44 }),
    prop: () => {
      stub.propCalls += 1
    }
  }
  return stub as unknown as Node & { propCalls: number }
}

describe('手動リサイズの印', () => {
  it('印を付ける/外すで判定が切り替わる', () => {
    const node = stubNode({ kind: 'action' })
    expect(isManuallySized(node)).toBe(false)
    markManuallySized(node)
    expect(isManuallySized(node)).toBe(true)
    clearManualSize(node)
    expect(isManuallySized(node)).toBe(false)
  })

  it('kind を壊さずに印だけを更新する', () => {
    const node = stubNode({ kind: 'action' })
    markManuallySized(node)
    expect((node.getData() as { kind?: string }).kind).toBe('action')
  })

  it('手動リサイズ済みなら autoSizeNode はサイズを変更しない', () => {
    const node = stubNode({ kind: 'action', manualSize: true })
    autoSizeNode(node, 'とても長いアクション名'.repeat(5))
    expect(node.propCalls).toBe(0)
  })
})

describe('ACTIVITY_MIN_SIZE', () => {
  it('全種別に正の下限がある', () => {
    const kinds = ['action', 'decision', 'merge', 'initial', 'final', 'fork', 'join'] as const
    for (const kind of kinds) {
      expect(ACTIVITY_MIN_SIZE[kind].width).toBeGreaterThan(0)
      expect(ACTIVITY_MIN_SIZE[kind].height).toBeGreaterThan(0)
    }
    expect(Object.keys(ACTIVITY_MIN_SIZE).sort()).toEqual([...kinds].sort())
  })
})
