import { describe, it, expect } from 'vitest'
import {
  activationDepths,
  type ActivationSpan
} from '../src/renderer/src/editor/activationNesting'

describe('activationDepths', () => {
  it('バーが無ければ空', () => {
    expect(activationDepths([]).size).toBe(0)
  })

  it('1 本だけなら深さ 0', () => {
    expect(activationDepths([{ id: 'a', y: 0, height: 100 }]).get('a')).toBe(0)
  })

  it('重ならないバーはどちらも深さ 0', () => {
    const spans: ActivationSpan[] = [
      { id: 'a', y: 0, height: 40 },
      { id: 'b', y: 60, height: 40 }
    ]
    const d = activationDepths(spans)
    expect(d.get('a')).toBe(0)
    expect(d.get('b')).toBe(0)
  })

  it('内側のバーは深さ 1', () => {
    const spans: ActivationSpan[] = [
      { id: 'outer', y: 0, height: 100 },
      { id: 'inner', y: 20, height: 40 }
    ]
    const d = activationDepths(spans)
    expect(d.get('outer')).toBe(0)
    expect(d.get('inner')).toBe(1)
  })

  it('3 段の入れ子は 0/1/2 になる', () => {
    const spans: ActivationSpan[] = [
      { id: 'c', y: 40, height: 10 },
      { id: 'a', y: 0, height: 100 },
      { id: 'b', y: 20, height: 60 }
    ]
    const d = activationDepths(spans)
    expect(d.get('a')).toBe(0)
    expect(d.get('b')).toBe(1)
    expect(d.get('c')).toBe(2)
  })

  it('部分的に重なるだけ（包含でない）なら深さは増えない', () => {
    const spans: ActivationSpan[] = [
      { id: 'a', y: 0, height: 50 },
      { id: 'b', y: 30, height: 50 }
    ]
    const d = activationDepths(spans)
    expect(d.get('a')).toBe(0)
    expect(d.get('b')).toBe(0)
  })

  it('入力の順序が変わっても結果は同じ', () => {
    const spans: ActivationSpan[] = [
      { id: 'a', y: 0, height: 100 },
      { id: 'b', y: 20, height: 40 },
      { id: 'c', y: 30, height: 10 }
    ]
    const forward = activationDepths(spans)
    const backward = activationDepths([...spans].reverse())
    for (const s of spans) expect(backward.get(s.id)).toBe(forward.get(s.id))
  })

  it('完全に同じ範囲でも決定的に一方を外側にする', () => {
    const spans: ActivationSpan[] = [
      { id: 'b', y: 10, height: 50 },
      { id: 'a', y: 10, height: 50 }
    ]
    const d = activationDepths(spans)
    expect([d.get('a'), d.get('b')].sort()).toEqual([0, 1])
    // id 順で先に来る a が外側
    expect(d.get('a')).toBe(0)
  })

  it('自己メッセージのような同一開始・短いバーは内側になる', () => {
    const spans: ActivationSpan[] = [
      { id: 'outer', y: 10, height: 80 },
      { id: 'inner', y: 10, height: 30 }
    ]
    const d = activationDepths(spans)
    expect(d.get('outer')).toBe(0)
    expect(d.get('inner')).toBe(1)
  })
})
