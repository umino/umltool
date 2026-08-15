import { describe, it, expect } from 'vitest'
import { MINDMAP } from '../src/renderer/src/editor/constants'
import { parseMindmap } from '../src/renderer/src/text/mindmapParser'
import {
  layoutMindmap,
  type MindmapLayoutInput,
  type MindmapPlacement
} from '../src/renderer/src/text/mindmapLayout'

const W = 100
const H = 40

/** テキストから、全ノード同サイズのレイアウト入力を作る */
function inputOf(text: string): MindmapLayoutInput[] {
  return parseMindmap(text).nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    width: W,
    height: H
  }))
}

function byId(placements: MindmapPlacement[]): Map<string, MindmapPlacement> {
  return new Map(placements.map((p) => [p.id, p]))
}

const ORIGIN = { x: 0, y: 0 }

describe('mindmap layout (map)', () => {
  it('ルートは原点、第 1 階層は左右へ振り分けられる', () => {
    const { placements } = layoutMindmap(inputOf('* R\n** a\n** b\n** c\n** d'), 'map', ORIGIN)
    const p = byId(placements)
    expect(p.get('t0')).toMatchObject({ centerX: 0, centerY: 0, side: 'root' })
    const sides = ['t1', 't2', 't3', 't4'].map((id) => p.get(id)!.side)
    expect(sides.filter((s) => s === 'right')).toHaveLength(2)
    expect(sides.filter((s) => s === 'left')).toHaveLength(2)
  })

  it('子は親の辺から levelGapX だけ離れる', () => {
    const { placements } = layoutMindmap(inputOf('* R\n** a'), 'map', ORIGIN)
    const p = byId(placements)
    const child = p.get('t1')!
    expect(child.side).toBe('right')
    expect(child.centerX).toBe(W / 2 + MINDMAP.levelGapX + W / 2)
    // 子が 1 つなら親と同じ高さに並ぶ
    expect(child.centerY).toBe(0)
  })

  it('同じ側の兄弟は siblingGapY 分だけ空けて縦に積む', () => {
    const { placements } = layoutMindmap(inputOf('* R\n** a\n** b'), 'map', ORIGIN)
    const p = byId(placements)
    const a = p.get('t1')!
    const b = p.get('t2')!
    // a は右、b は左（振り分け）なので、それぞれ単独で中央に来る
    expect(a.side).not.toBe(b.side)
    expect(a.centerY).toBe(0)
    expect(b.centerY).toBe(0)

    const three = layoutMindmap(inputOf('* R\n** a\n** b\n** c'), 'map', ORIGIN)
    const q = byId(three.placements)
    // 右側に 2 つ（a, c）、左側に 1 つ（b）
    const rights = ['t1', 't2', 't3'].map((id) => q.get(id)!).filter((x) => x.side === 'right')
    expect(rights).toHaveLength(2)
    expect(Math.abs(rights[1].centerY - rights[0].centerY)).toBe(H + MINDMAP.siblingGapY)
  })

  it('孫は親と同じ側へ伸びる', () => {
    const { placements } = layoutMindmap(
      inputOf('* R\n** a\n** b\n*** b1'),
      'map',
      ORIGIN
    )
    const p = byId(placements)
    expect(p.get('t3')!.side).toBe(p.get('t2')!.side)
    expect(p.get('t3')!.depth).toBe(2)
    // 左側なら x は親より小さく、右側なら大きい
    const dir = p.get('t2')!.side === 'left' ? -1 : 1
    expect(Math.sign(p.get('t3')!.centerX - p.get('t2')!.centerX)).toBe(dir)
  })

  it('同じ側の兄弟同士は縦に重ならない', () => {
    const { placements } = layoutMindmap(
      inputOf('* R\n** a\n*** a1\n*** a2\n*** a3\n** b\n*** b1'),
      'map',
      ORIGIN
    )
    for (const side of ['left', 'right'] as const) {
      const rows = placements
        .filter((x) => x.side === side)
        .sort((x, y) => x.centerY - y.centerY)
      for (let i = 1; i < rows.length; i++) {
        if (Math.abs(rows[i].centerX - rows[i - 1].centerX) > 1) continue // 別の階層
        expect(rows[i].centerY - rows[i - 1].centerY).toBeGreaterThanOrEqual(H)
      }
    }
  })

  it('折りたたんだノードの子孫は配置されず hidden になる', () => {
    const nodes = inputOf('* R\n** a\n*** a1\n** b')
    nodes[1].collapsed = true
    const { placements, hidden } = layoutMindmap(nodes, 'map', ORIGIN)
    expect(hidden).toEqual(['t2'])
    expect(placements.map((p) => p.id)).not.toContain('t2')
  })
})

describe('mindmap layout (outline)', () => {
  it('DFS 順に 1 行ずつ縦に積む', () => {
    const { placements } = layoutMindmap(
      inputOf('* R\n** a\n*** a1\n** b'),
      'outline',
      ORIGIN
    )
    expect(placements.map((p) => p.id)).toEqual(['t0', 't1', 't2', 't3'])
    for (let i = 1; i < placements.length; i++) {
      expect(placements[i].centerY - placements[i - 1].centerY).toBe(H + MINDMAP.rowGapY)
    }
  })

  it('深さに比例して右へインデントする', () => {
    const { placements } = layoutMindmap(inputOf('* R\n** a\n*** a1'), 'outline', ORIGIN)
    const xs = placements.map((p) => p.centerX)
    expect(xs[1] - xs[0]).toBe(MINDMAP.indentX)
    expect(xs[2] - xs[1]).toBe(MINDMAP.indentX)
  })

  it('折りたたんだ部分は行ごと詰められる', () => {
    const nodes = inputOf('* R\n** a\n*** a1\n** b')
    nodes[1].collapsed = true
    const { placements } = layoutMindmap(nodes, 'outline', ORIGIN)
    expect(placements.map((p) => p.id)).toEqual(['t0', 't1', 't3'])
    expect(placements[2].centerY - placements[1].centerY).toBe(H + MINDMAP.rowGapY)
  })
})
