// マインドマップのリンク（親子とは別の参照）の判定（ライブラリ非依存・純関数）。issue #46
//
// リンクは「A から B を参照する」向き付きの線。木の形（親子）には関わらないので、
// 親や子へのリンクも許す。断るのは自分自身へのものと、同じ向きの重複だけ。

export interface LinkRef {
  /** リンク（エッジ）の id */
  id: string
  source: string
  target: string
}

export type LinkCheck = { ok: true } | { ok: false; reason: string }

export function checkLink(links: LinkRef[], from: string, to: string): LinkCheck {
  if (from === to) return { ok: false, reason: '同じトピック同士はリンクできません。' }
  if (links.some((l) => l.source === from && l.target === to)) {
    return { ok: false, reason: 'そのリンクは既にあります。' }
  }
  return { ok: true }
}

export interface LinkPeer {
  /** 飛び先のトピック */
  id: string
  /** 経由するリンク */
  linkId: string
  /** out = このトピックから張ったリンクの先 / in = このトピックを指しているリンクの元 */
  direction: 'out' | 'in'
}

/**
 * node から辿れる相手を並べる。張ったリンクの先（out）を先に、張られたリンクの
 * 元（in）を後に置く。同じ相手が両方に現れたら先に出た方だけを残す。
 * in を含めるのは、参照先へ飛んだあと J で元の場所へ戻れるようにするため。
 */
export function linkPeers(links: LinkRef[], nodeId: string): LinkPeer[] {
  const peers: LinkPeer[] = []
  const seen = new Set<string>()
  const push = (id: string, linkId: string, direction: LinkPeer['direction']): void => {
    if (id === nodeId || seen.has(id)) return
    seen.add(id)
    peers.push({ id, linkId, direction })
  }
  for (const l of links) if (l.source === nodeId) push(l.target, l.id, 'out')
  for (const l of links) if (l.target === nodeId) push(l.source, l.id, 'in')
  return peers
}

/** peers の中で lastId の次（末尾の次は先頭）。lastId が無ければ先頭。空なら -1 */
export function nextPeerIndex(peers: LinkPeer[], lastId: string | null): number {
  if (peers.length === 0) return -1
  const current = lastId === null ? -1 : peers.findIndex((p) => p.id === lastId)
  return (current + 1) % peers.length
}
