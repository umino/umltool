import { describe, it, expect } from 'vitest'
import {
  checkLink,
  linkPeers,
  nextPeerIndex,
  type LinkRef
} from '../src/renderer/src/text/mindmapLinks'

const links: LinkRef[] = [
  { id: 'l1', source: 'a', target: 'b' },
  { id: 'l2', source: 'a', target: 'c' },
  { id: 'l3', source: 'd', target: 'a' },
  { id: 'l4', source: 'b', target: 'a' }
]

describe('checkLink', () => {
  it('自分自身へのリンクは断る', () => {
    expect(checkLink(links, 'a', 'a').ok).toBe(false)
  })

  it('同じ向きの重複は断る', () => {
    const r = checkLink(links, 'a', 'b')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('既に')
  })

  it('逆向きや新しい組み合わせは許す（親子かどうかは問わない）', () => {
    expect(checkLink(links, 'c', 'a').ok).toBe(true)
    expect(checkLink(links, 'b', 'c').ok).toBe(true)
  })
})

describe('linkPeers', () => {
  it('張ったリンクの先を先に、張られたリンクの元を後に並べる', () => {
    expect(linkPeers(links, 'a').map((p) => `${p.direction}:${p.id}`)).toEqual([
      'out:b',
      'out:c',
      'in:d'
    ])
  })

  it('両方向でつながっている相手は 1 回だけ（先に出た out を残す）', () => {
    const peers = linkPeers(links, 'a')
    expect(peers.filter((p) => p.id === 'b')).toHaveLength(1)
    expect(peers.find((p) => p.id === 'b')?.linkId).toBe('l1')
  })

  it('参照された側からは元へ戻れる', () => {
    expect(linkPeers(links, 'c').map((p) => `${p.direction}:${p.id}`)).toEqual(['in:a'])
  })

  it('リンクの無いトピックは空', () => {
    expect(linkPeers(links, 'z')).toEqual([])
  })
})

describe('nextPeerIndex', () => {
  const peers = linkPeers(links, 'a')

  it('初回は先頭、以降は順に進み、末尾の次は先頭', () => {
    expect(nextPeerIndex(peers, null)).toBe(0)
    expect(nextPeerIndex(peers, 'b')).toBe(1)
    expect(nextPeerIndex(peers, 'd')).toBe(0)
  })

  it('知らない相手からは先頭', () => {
    expect(nextPeerIndex(peers, 'zzz')).toBe(0)
  })

  it('相手がいなければ -1', () => {
    expect(nextPeerIndex([], null)).toBe(-1)
  })
})
