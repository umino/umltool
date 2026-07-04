import { describe, it, expect } from 'vitest'
import { parseSequence, ParseError } from '../src/renderer/src/text/sequenceParser'

describe('parseSequence', () => {
  it('participant 宣言と自動宣言を順序通りに集める', () => {
    const r = parseSequence(`participant ユーザー
participant サーバー
ユーザー -> サーバー : 要求
サーバー -> DB : 問い合わせ`)
    expect(r.participants).toEqual(['ユーザー', 'サーバー', 'DB'])
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
    expect(r.participants).toEqual(['注文 サービス', '在庫'])
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
})
