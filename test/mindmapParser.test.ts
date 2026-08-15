import { describe, it, expect } from 'vitest'
import { parseMindmap } from '../src/renderer/src/text/mindmapParser'
import { ParseError } from '../src/renderer/src/text/sequenceParser'

describe('mindmap parser', () => {
  it('マーカー記法（*）の階層を読む', () => {
    const { nodes } = parseMindmap('* ルート\n** 子1\n*** 孫\n** 子2')
    expect(nodes.map((n) => [n.label, n.depth])).toEqual([
      ['ルート', 0],
      ['子1', 1],
      ['孫', 2],
      ['子2', 1]
    ])
    const [root, child1, grand, child2] = nodes
    expect(root.parentId).toBeNull()
    expect(child1.parentId).toBe(root.id)
    expect(grand.parentId).toBe(child1.id)
    expect(child2.parentId).toBe(root.id)
  })

  it('インデント記法でも同じ木になる', () => {
    const marker = parseMindmap('* ルート\n** 子1\n*** 孫\n** 子2')
    const indent = parseMindmap('ルート\n  子1\n    孫\n  子2')
    expect(indent.nodes).toEqual(marker.nodes)
  })

  it('タブのインデントを読む', () => {
    const { nodes } = parseMindmap('ルート\n\t子\n\t\t孫')
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 2])
  })

  it('+ と - もマーカーとして深さに数える', () => {
    const { nodes } = parseMindmap('* ルート\n++ 右\n-- 左')
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 1])
    expect(nodes[2].parentId).toBe(nodes[0].id)
  })

  it('空行・コメント・@start/@end を読み飛ばす', () => {
    const { nodes } = parseMindmap(
      "@startmindmap\n' コメント\n\n* ルート\n// コメント\n** 子\n@endmindmap"
    )
    expect(nodes.map((n) => n.label)).toEqual(['ルート', '子'])
  })

  it('ラベルの \\n を改行にする', () => {
    const { nodes } = parseMindmap('* 1行目\\n2行目')
    expect(nodes[0].label).toBe('1行目\n2行目')
  })

  it('[#色] 装飾は読み飛ばす', () => {
    const { nodes } = parseMindmap('*[#ffcc00] ルート')
    expect(nodes[0].label).toBe('ルート')
  })

  it('ルートが複数あれば森として返す', () => {
    const { nodes } = parseMindmap('* A\n** a1\n* B')
    expect(nodes.filter((n) => n.parentId === null).map((n) => n.label)).toEqual(['A', 'B'])
  })

  it('階層が飛んだらエラー', () => {
    expect(() => parseMindmap('* ルート\n*** 孫')).toThrow(ParseError)
  })

  it('最初の行が字下げされていたらエラー', () => {
    expect(() => parseMindmap('  子')).toThrow(ParseError)
  })

  it('記法の混在はエラー', () => {
    expect(() => parseMindmap('* ルート\n  子')).toThrow(ParseError)
  })

  it('インデント幅が揃っていなければエラー', () => {
    expect(() => parseMindmap('ルート\n  子\n     孫')).toThrow(ParseError)
  })

  it('空テキストは空の木', () => {
    expect(parseMindmap('\n\n').nodes).toEqual([])
  })
})
