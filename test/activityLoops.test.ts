import { describe, expect, it } from 'vitest'
import { parseActivity, type ParsedActivity } from '../src/renderer/src/text/activityParser'
import { ParseError } from '../src/renderer/src/text/sequenceParser'

/** ラベルからノード id を引く */
const idOf = (r: ParsedActivity, label: string): string => {
  const n = r.nodes.find((x) => x.label === label)
  if (!n) throw new Error(`no node: ${label}`)
  return n.id
}
const edge = (r: ParsedActivity, from: string, to: string): ParsedActivity['edges'][number] | undefined =>
  r.edges.find((e) => e.from === from && e.to === to)

describe('activity parser: ループ', () => {
  it('while は本体の最後から条件へ戻り、no で抜ける', () => {
    const r = parseActivity(`start
while (残りあり?) is (yes)
  :取り出す;
endwhile (no)
:終わり;
stop`)
    const cond = idOf(r, '残りあり?')
    const body = idOf(r, '取り出す')
    expect(edge(r, cond, body)?.label).toBe('yes')
    expect(edge(r, body, cond)).toBeDefined()
    expect(edge(r, cond, idOf(r, '終わり'))?.label).toBe('no')
  })

  it('repeat は末尾の条件から先頭の合流点へ戻る', () => {
    const r = parseActivity(`start
repeat
  :試す;
repeat while (失敗?) is (yes) not (no)
:完了;
stop`)
    const start = r.nodes.find((n) => n.kind === 'merge')!.id
    const cond = idOf(r, '失敗?')
    expect(edge(r, start, idOf(r, '試す'))).toBeDefined()
    expect(edge(r, cond, start)?.label).toBe('yes')
    expect(edge(r, cond, idOf(r, '完了'))?.label).toBe('no')
  })

  it('break はループを抜けた先の合流点へ、continue は条件へ繋がる', () => {
    const r = parseActivity(`start
while (次あり?) is (yes)
  if (空?) then (yes)
    continue
  endif
  if (終端?) then (yes)
    break
  endif
  :処理;
endwhile (no)
:後片付け;
stop`)
    const cond = idOf(r, '次あり?')
    const empty = idOf(r, '空?')
    const end = idOf(r, '終端?')
    // continue: 空? の yes から条件へ
    expect(edge(r, empty, cond)?.label).toBe('yes')
    // break: 終端? の yes から合流点へ。条件の no も同じ合流点へ
    const toMerge = r.edges.find((e) => e.from === end && e.label === 'yes')!
    expect(r.nodes.find((n) => n.id === toMerge.to)?.kind).toBe('merge')
    expect(edge(r, cond, toMerge.to)?.label).toBe('no')
    expect(edge(r, toMerge.to, idOf(r, '後片付け'))).toBeDefined()
  })

  it('repeat の continue は末尾の条件へ繋がる', () => {
    const r = parseActivity(`repeat
  if (飛ばす?) then (yes)
    continue
  endif
  :処理;
repeat while (続ける?)`)
    expect(edge(r, idOf(r, '飛ばす?'), idOf(r, '続ける?'))?.label).toBe('yes')
  })

  it('どの枝も stop で終わる if の後ろに合流点・stop を作らない', () => {
    const r = parseActivity(`start
if (a?) then (yes)
  stop
else (no)
  stop
endif
stop`)
    expect(r.nodes.map((n) => n.kind)).toEqual(['initial', 'decision', 'final', 'final'])
  })

  it('ループの外の break / 閉じていない while はエラー', () => {
    expect(() => parseActivity('start\nbreak')).toThrow(ParseError)
    expect(() => parseActivity('start\nwhile (a)\n:x;')).toThrow(/while が endwhile/)
    expect(() => parseActivity('start\nendwhile')).toThrow(ParseError)
  })
})
