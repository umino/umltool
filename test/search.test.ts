import { describe, it, expect } from 'vitest'
import {
  findMatches,
  nextMatch,
  normalizeForSearch,
  type SearchItem
} from '../src/renderer/src/editor/search'

const item = (id: string, text: string, x: number, y: number): SearchItem => ({ id, text, x, y })

describe('normalizeForSearch', () => {
  it('全角/半角・大文字/小文字を揃える', () => {
    expect(normalizeForSearch('ＨＴＴＰリクエスト')).toBe('httpリクエスト')
    expect(normalizeForSearch('ｾｯｼｮﾝ')).toBe('セッション')
  })

  it('改行を含む空白の並びは 1 個の空白になる', () => {
    expect(normalizeForSearch('認証結果は\nセッション  に保存')).toBe('認証結果は セッション に保存')
  })
})

describe('findMatches', () => {
  const items = [
    item('c', '商品を発送する', 200, 600),
    item('a', '注文を受け付ける', 100, 100),
    item('b', '商品を引き当てる', 100, 300),
    item('d', '商品を引き当てる（予備）', 50, 300)
  ]

  it('含むものを上から、同じ高さなら左から並べる', () => {
    expect(findMatches(items, '商品').map((m) => m.id)).toEqual(['d', 'b', 'c'])
  })

  it('全角や大文字で打っても当たる', () => {
    const edges = [item('e', 'yes', 0, 0), item('f', 'no', 0, 10)]
    expect(findMatches(edges, 'ＹＥＳ').map((m) => m.id)).toEqual(['e'])
  })

  it('空白だけの query は何にも当たらない', () => {
    expect(findMatches(items, '   ')).toEqual([])
  })

  it('見つからなければ空', () => {
    expect(findMatches(items, '存在しない')).toEqual([])
  })
})

describe('nextMatch', () => {
  const ids = ['a', 'b', 'c']

  it('初回は向きに応じて先頭か末尾から', () => {
    expect(nextMatch(ids, null, 1)).toEqual({ index: 0, wrapped: false })
    expect(nextMatch(ids, null, -1)).toEqual({ index: 2, wrapped: false })
  })

  it('順に進み、末尾の次は先頭へ回り込む（一周の合図付き）', () => {
    expect(nextMatch(ids, 'a', 1)).toEqual({ index: 1, wrapped: false })
    expect(nextMatch(ids, 'c', 1)).toEqual({ index: 0, wrapped: true })
  })

  it('逆向きは先頭の前が末尾', () => {
    expect(nextMatch(ids, 'b', -1)).toEqual({ index: 0, wrapped: false })
    expect(nextMatch(ids, 'a', -1)).toEqual({ index: 2, wrapped: true })
  })

  it('一致が 1 件だけでも、次へで一周したことが分かる', () => {
    expect(nextMatch(['a'], 'a', 1)).toEqual({ index: 0, wrapped: true })
  })

  it('今の一致が消えていたら最初から数え直す', () => {
    expect(nextMatch(ids, 'gone', 1)).toEqual({ index: 0, wrapped: false })
  })

  it('一致が無ければ -1', () => {
    expect(nextMatch([], 'a', 1)).toEqual({ index: -1, wrapped: false })
  })
})
