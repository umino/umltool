import { describe, it, expect } from 'vitest'
import { parseSequence, ParseError } from '../src/renderer/src/text/sequenceParser'

describe('parseSequence', () => {
  it('participant 宣言と自動宣言を順序通りに集める', () => {
    const r = parseSequence(`participant ユーザー
participant サーバー
ユーザー -> サーバー : 要求
サーバー -> DB : 問い合わせ`)
    expect(r.participants.map((p) => p.label)).toEqual(['ユーザー', 'サーバー', 'DB'])
    expect(r.messages).toHaveLength(2)
  })

  it('矢印の種類を判別する', () => {
    const r = parseSequence(`A -> B : sync
A ->> B : async
A --> B : ret`)
    expect(r.messages.map((m) => m.kind)).toEqual(['sync', 'async', 'return'])
  })

  it('自己メッセージは self になる', () => {
    const r = parseSequence('A -> A : self check')
    expect(r.messages[0].kind).toBe('self')
    expect(r.messages[0].from).toBe('A')
    expect(r.messages[0].to).toBe('A')
  })

  it('ラベルは任意', () => {
    const r = parseSequence('A -> B')
    expect(r.messages[0].label).toBe('')
  })

  it('引用符付き名称・日本語を扱える', () => {
    const r = parseSequence('"注文 サービス" -> 在庫 : 引当')
    expect(r.participants.map((p) => p.label)).toEqual(['注文 サービス', '在庫'])
  })

  it('participant の as 構文で表示名とエイリアスを分離する', () => {
    const r = parseSequence(`participant "Web ブラウザ" as ブラウザ
participant サーバー
ブラウザ -> サーバー : リクエスト`)
    expect(r.participants).toEqual([
      { id: 'ブラウザ', label: 'Web ブラウザ' },
      { id: 'サーバー', label: 'サーバー' }
    ])
    // 参照はエイリアス（id）で行われる
    expect(r.messages[0].from).toBe('ブラウザ')
    expect(r.messages[0].to).toBe('サーバー')
  })

  it('activate / deactivate で活性化区間を解析する', () => {
    const r = parseSequence(`A -> B : req
activate B
B -> B : work
B --> A : res
deactivate B
A -> B : after`)
    expect(r.messages).toHaveLength(4)
    expect(r.activations).toHaveLength(1)
    const a = r.activations[0]
    expect(a.participant).toBe('B')
    expect(a.startIndex).toBe(0)
    expect(a.endIndex).toBe(2)
  })

  it('deactivate 省略時は末尾で自動的に閉じる', () => {
    const r = parseSequence(`A -> B : req
activate B
B --> A : res`)
    expect(r.activations).toHaveLength(1)
    expect(r.activations[0].endIndex).toBe(1)
  })

  it('対応する activate のない deactivate は ParseError', () => {
    expect(() => parseSequence('A -> B\ndeactivate B')).toThrowError(ParseError)
  })

  it('コメント・空行・@startuml を無視する', () => {
    const r = parseSequence(`@startuml
' これはコメント
# これも

A -> B : x
@enduml`)
    expect(r.messages).toHaveLength(1)
  })

  it('解釈不能な行で ParseError（行番号付き）', () => {
    expect(() => parseSequence('A -> B : ok\nおかしな行')).toThrowError(ParseError)
    try {
      parseSequence('A -> B : ok\nおかしな行')
    } catch (e) {
      expect((e as ParseError).line).toBe(2)
    }
  })

  it('alt/else/end でフラグメントと区切りを解析する', () => {
    const r = parseSequence(`A -> B : 前
alt 成功
  B -> B : 処理
  B --> A : OK
else 失敗
  B --> A : NG
end
A -> B : 後`)
    expect(r.fragments).toHaveLength(1)
    const f = r.fragments[0]
    expect(f.operator).toBe('alt')
    expect(f.guard).toBe('成功')
    expect(f.start).toBe(1)
    expect(f.end).toBe(3)
    expect(f.separators).toEqual([{ guard: '失敗', beforeIndex: 3 }])
    expect(f.depth).toBe(0)
    expect(r.messages).toHaveLength(5)
  })

  it('全演算子を受け付け、ネストの depth を持つ', () => {
    const ops = ['opt', 'loop', 'break', 'par', 'seq', 'strict', 'critical']
    for (const op of ops) {
      const r = parseSequence(`${op} 条件\nA -> B : x\nend`)
      expect(r.fragments[0].operator).toBe(op)
    }
    const nested = parseSequence(`alt 外
A -> B : 1
opt 内
B -> A : 2
end
end`)
    expect(nested.fragments).toHaveLength(2)
    const inner = nested.fragments.find((f) => f.operator === 'opt')!
    const outer = nested.fragments.find((f) => f.operator === 'alt')!
    expect(inner.depth).toBe(1)
    expect(outer.depth).toBe(0)
    expect(outer.start).toBe(0)
    expect(outer.end).toBe(1)
  })

  it('不正なフラグメント構文は ParseError', () => {
    // end されていない
    expect(() => parseSequence('alt x\nA -> B : y')).toThrowError(ParseError)
    // 対応の無い end / else
    expect(() => parseSequence('A -> B : y\nend')).toThrowError(ParseError)
    expect(() => parseSequence('A -> B : y\nelse z')).toThrowError(ParseError)
    // alt/par 以外での else
    expect(() => parseSequence('loop 3\nA -> B : y\nelse z\nA -> B : w\nend')).toThrowError(
      ParseError
    )
    // 空フラグメント / 空オペランド
    expect(() => parseSequence('alt x\nend')).toThrowError(ParseError)
    expect(() => parseSequence('alt x\nA -> B : y\nelse z\nend')).toThrowError(ParseError)
    expect(() => parseSequence('alt x\nelse z\nA -> B : y\nend')).toThrowError(ParseError)
  })
})
