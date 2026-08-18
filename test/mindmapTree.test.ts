import { describe, it, expect } from 'vitest'
import { subtreeIds, canReparent, type ChildrenMap } from '../src/renderer/src/text/mindmapTree'

/**
 *   root ─ a ─ a1
 *        │   └ a2
 *        └ b ─ b1
 */
const TREE: ChildrenMap = new Map([
  ['root', ['a', 'b']],
  ['a', ['a1', 'a2']],
  ['b', ['b1']]
])

describe('subtreeIds', () => {
  it('自分と子孫を親→子の順で返す', () => {
    expect(subtreeIds(TREE, 'a')).toEqual(['a', 'a1', 'a2'])
  })

  it('葉は自分だけ', () => {
    expect(subtreeIds(TREE, 'b1')).toEqual(['b1'])
  })

  it('全体を辿れる', () => {
    expect(subtreeIds(TREE, 'root')).toEqual(['root', 'a', 'a1', 'a2', 'b', 'b1'])
  })

  it('循環していても停止する', () => {
    const looped: ChildrenMap = new Map([
      ['x', ['y']],
      ['y', ['x']]
    ])
    expect(subtreeIds(looped, 'x')).toEqual(['x', 'y'])
  })

  it('知らない id は自分だけ', () => {
    expect(subtreeIds(TREE, 'missing')).toEqual(['missing'])
  })
})

describe('canReparent', () => {
  it('別の枝の下へは移せる', () => {
    expect(canReparent(TREE, 'a', 'b')).toEqual({ ok: true })
  })

  it('元の親へ戻すのは許す（付け替えの取り消しになる）', () => {
    expect(canReparent(TREE, 'a1', 'a')).toEqual({ ok: true })
  })

  it('自分自身の下へは移せない', () => {
    const r = canReparent(TREE, 'a', 'a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/同じトピック/)
  })

  it('自分の子孫の下へは移せない', () => {
    const r = canReparent(TREE, 'a', 'a2')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/子孫/)
  })

  it('孫より下でも子孫として弾く', () => {
    expect(canReparent(TREE, 'root', 'b1').ok).toBe(false)
  })
})
