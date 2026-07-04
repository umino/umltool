import { describe, it, expect } from 'vitest'
import {
  AUTO_SIZE_SPECS,
  computeAutoSize,
  type TextMeasurer
} from '../src/renderer/src/editor/autosize'

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
