import { describe, it, expect } from 'vitest'
import { parseActivity } from '../src/renderer/src/text/activityParser'
import { ParseError } from '../src/renderer/src/text/sequenceParser'

describe('activity parser', () => {
  it('直列フローを解析する', () => {
    const r = parseActivity(`start
:受付;
:処理;
stop`)
    expect(r.nodes.map((n) => n.kind)).toEqual(['initial', 'action', 'action', 'final'])
    expect(r.edges).toHaveLength(3)
    expect(r.edges[0]).toMatchObject({ from: r.nodes[0].id, to: r.nodes[1].id })
  })

  it('if/else/endif で分岐・合流する', () => {
    const r = parseActivity(`start
if (在庫あり?) then (yes)
  :引当;
else (no)
  :取り寄せ;
endif
stop`)
    const kinds = r.nodes.map((n) => n.kind)
    // initial, decision, action(yes), action(no), merge, final
    expect(kinds).toEqual(['initial', 'decision', 'action', 'action', 'merge', 'final'])
    const decision = r.nodes[1]
    const yesEdge = r.edges.find((e) => e.from === decision.id && e.label === 'yes')
    const noEdge = r.edges.find((e) => e.from === decision.id && e.label === 'no')
    expect(yesEdge).toBeDefined()
    expect(noEdge).toBeDefined()
    // 両枝が merge に合流する
    const merge = r.nodes[4]
    expect(r.edges.filter((e) => e.to === merge.id)).toHaveLength(2)
    // else 枝は右の列に置かれる
    expect(r.nodes[3].col).toBe(r.nodes[2].col + 1)
  })

  it('else 無しの if は decision から直接合流する', () => {
    const r = parseActivity(`start
if (要確認?) then (yes)
  :確認する;
endif
stop`)
    const decision = r.nodes[1]
    const merge = r.nodes[3]
    expect(merge.kind).toBe('merge')
    expect(r.edges.some((e) => e.from === decision.id && e.to === merge.id)).toBe(true)
  })

  it('fork / fork again / end fork で並行フローになる', () => {
    const r = parseActivity(`start
fork
  :請求;
fork again
  :発送;
end fork
stop`)
    const kinds = r.nodes.map((n) => n.kind)
    expect(kinds).toEqual(['initial', 'fork', 'action', 'action', 'join', 'final'])
    const fork = r.nodes[1]
    const join = r.nodes[4]
    expect(r.edges.filter((e) => e.from === fork.id)).toHaveLength(2)
    expect(r.edges.filter((e) => e.to === join.id)).toHaveLength(2)
    expect(r.nodes[3].col).toBe(r.nodes[2].col + 1)
  })

  it('スイムレーンを収集しノードに割り当てる', () => {
    const r = parseActivity(`|受付|
start
:受注;
|倉庫|
:出荷;
stop`)
    expect(r.lanes).toEqual(['受付', '倉庫'])
    expect(r.nodes[1].lane).toBe('受付')
    expect(r.nodes[2].lane).toBe('倉庫')
  })

  it('コメントと @startuml/@enduml を無視する', () => {
    const r = parseActivity(`@startuml
' コメント
# コメント
// コメント
start
stop
@enduml`)
    expect(r.nodes).toHaveLength(2)
  })

  it('解釈できない行は行番号付きでエラー', () => {
    expect(() => parseActivity('start\nこれは不正')).toThrowError(ParseError)
    try {
      parseActivity('start\nこれは不正')
    } catch (e) {
      expect((e as ParseError).line).toBe(2)
    }
  })

  it('閉じられていない if はエラー', () => {
    expect(() => parseActivity('if (x?) then (y)\n:a;')).toThrow(/endif/)
  })

  it('対応の無い else / endif / end fork はエラー', () => {
    expect(() => parseActivity('else')).toThrow(/else/)
    expect(() => parseActivity('endif')).toThrow(/endif/)
    expect(() => parseActivity('end fork')).toThrow(/end fork/)
  })
})
