import { describe, it, expect } from 'vitest'
import { parseMindmap } from '../src/renderer/src/text/mindmapParser'
import { layoutMindmap, type MindmapLayoutInput } from '../src/renderer/src/text/mindmapLayout'
import { resolveMindmapMove, type NavNode } from '../src/renderer/src/text/mindmapNav'
import type { MindmapLayout } from '../src/renderer/src/editor/constants'

const W = 100
const H = 40

/**
 * テキストから、実際のレイアウト結果に基づく移動用ノード列を作る。
 * ラベル → id を引けるようにして、テストを読みやすくする。
 */
function navOf(
  text: string,
  layout: MindmapLayout
): { nodes: NavNode[]; id: (label: string) => string; label: (id: string | null) => string } {
  const parsed = parseMindmap(text)
  const inputs: MindmapLayoutInput[] = parsed.nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    width: W,
    height: H
  }))
  const { placements } = layoutMindmap(inputs, layout, { x: 0, y: 0 })
  const byId = new Map(parsed.nodes.map((n) => [n.id, n]))
  const nodes: NavNode[] = placements.map((p) => ({
    id: p.id,
    parentId: byId.get(p.id)?.parentId ?? null,
    side: p.side,
    depth: p.depth,
    centerX: p.centerX,
    centerY: p.centerY
  }))
  return {
    nodes,
    id: (label) => parsed.nodes.find((n) => n.label === label)!.id,
    label: (id) => (id === null ? '(なし)' : (byId.get(id)?.label ?? '(不明)'))
  }
}

const TREE = `* ルート
** 企画
*** 調査
*** 要件
** 開発
*** 設計
*** 実装
** 運用
** 保守`

describe('mindmap navigation (map)', () => {
  const { nodes, id, label } = navOf(TREE, 'map')
  const move = (from: string, dir: 'up' | 'down' | 'left' | 'right'): string =>
    label(resolveMindmapMove(nodes, id(from), dir, 'map'))

  it('右側の枝では → が子、← が親', () => {
    const right = nodes.filter((n) => n.side === 'right')
    expect(right.length).toBeGreaterThan(0)
    const 企画 = nodes.find((n) => n.id === id('企画'))!
    expect(企画.side).toBe('right')
    expect(move('企画', 'right')).toMatch(/調査|要件/)
    expect(move('企画', 'left')).toBe('ルート')
  })

  it('左側の枝では ← が子、→ が親（左右が反転する）', () => {
    const 開発 = nodes.find((n) => n.id === id('開発'))!
    expect(開発.side).toBe('left')
    expect(move('開発', 'left')).toMatch(/設計|実装/)
    expect(move('開発', 'right')).toBe('ルート')
  })

  it('↑↓ で同じ側の兄弟を行き来する', () => {
    expect(move('調査', 'down')).toBe('要件')
    expect(move('要件', 'up')).toBe('調査')
  })

  it('兄弟が尽きたら同じ深さ・同じ側の隣へ移る', () => {
    // 第 1 階層が 4 つあると A/C が右、B/D が左に振り分けられる。
    // A の末の子から下へ辿ると、同じ右側にある C の子へ続けて移れる。
    const four = navOf(
      '* R\n** A\n*** a1\n*** a2\n** B\n*** b1\n*** b2\n** C\n*** c1\n*** c2\n** D\n*** d1\n*** d2',
      'map'
    )
    const sideOf = (l: string): string =>
      four.nodes.find((n) => n.id === four.id(l))!.side
    expect(sideOf('A')).toBe('right')
    expect(sideOf('C')).toBe('right')
    const next = four.label(resolveMindmapMove(four.nodes, four.id('a2'), 'down', 'map'))
    expect(next).toBe('c1')
  })

  it('ルートからは押した向きの側の子へ入る', () => {
    const right = move('ルート', 'right')
    const left = move('ルート', 'left')
    expect(nodes.find((n) => n.id === id(right))!.side).toBe('right')
    expect(nodes.find((n) => n.id === id(left))!.side).toBe('left')
  })

  it('葉から子方向へは動かない', () => {
    expect(move('調査', 'right')).toBe('(なし)')
  })

  it('知らない id では null', () => {
    expect(resolveMindmapMove(nodes, 'missing', 'up', 'map')).toBeNull()
  })
})

describe('mindmap navigation (outline)', () => {
  const { nodes, id, label } = navOf(TREE, 'outline')
  const move = (from: string, dir: 'up' | 'down' | 'left' | 'right'): string =>
    label(resolveMindmapMove(nodes, id(from), dir, 'outline'))

  it('↑↓ は表示順の前後の行', () => {
    expect(move('ルート', 'down')).toBe('企画')
    expect(move('企画', 'down')).toBe('調査')
    expect(move('調査', 'up')).toBe('企画')
  })

  it('← が親、→ が子（左右は反転しない）', () => {
    expect(move('調査', 'left')).toBe('企画')
    expect(move('企画', 'right')).toBe('調査')
  })

  it('先頭行から上、最終行から下へは動かない', () => {
    expect(move('ルート', 'up')).toBe('(なし)')
    expect(move('保守', 'down')).toBe('(なし)')
  })
})

describe('折りたたみ中のノードは移動先にならない', () => {
  it('隠れたノードを除いた一覧で解決する', () => {
    const parsed = parseMindmap(TREE)
    const inputs: MindmapLayoutInput[] = parsed.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      width: W,
      height: H,
      // 「企画」を折りたたむ
      collapsed: n.label === '企画'
    }))
    const { placements, hidden } = layoutMindmap(inputs, 'outline', { x: 0, y: 0 })
    const byId = new Map(parsed.nodes.map((n) => [n.id, n]))
    const nodes: NavNode[] = placements.map((p) => ({
      id: p.id,
      parentId: byId.get(p.id)?.parentId ?? null,
      side: p.side,
      depth: p.depth,
      centerX: p.centerX,
      centerY: p.centerY
    }))
    const 企画 = parsed.nodes.find((n) => n.label === '企画')!
    expect(hidden.length).toBe(2)
    // 折りたたんだ子（調査）へは入れず、次の行（開発）へ進む
    const next = resolveMindmapMove(nodes, 企画.id, 'down', 'outline')
    expect(byId.get(next!)?.label).toBe('開発')
    expect(resolveMindmapMove(nodes, 企画.id, 'right', 'outline')).toBeNull()
  })
})
