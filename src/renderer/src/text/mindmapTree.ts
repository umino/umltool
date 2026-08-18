// マインドマップの木構造だけを扱う純関数（X6 非依存）。
// サブツリーの切り取り / 貼り付けで「どこへ移せるか」を判定するのに使う。

/** 親 id → 子 id の並び */
export type ChildrenMap = ReadonlyMap<string, readonly string[]>

/**
 * root とその子孫の id を、親 → 子の順（深さ優先）で返す。
 * 枝が循環していても同じ id を二度辿らないので停止する。
 */
export function subtreeIds(childrenOf: ChildrenMap, rootId: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    out.push(id)
    for (const childId of childrenOf.get(id) ?? []) walk(childId)
  }
  walk(rootId)
  return out
}

export type ReparentCheck = { ok: true } | { ok: false; reason: string }

/**
 * moving（とその子孫）を target の子として繋ぎ直せるかを判定する。
 * 自分自身・自分の子孫の下へ移すと木が輪になってしまうので断る。
 */
export function canReparent(
  childrenOf: ChildrenMap,
  movingId: string,
  targetId: string
): ReparentCheck {
  if (movingId === targetId) {
    return { ok: false, reason: '同じトピックの下へは移せません。' }
  }
  if (subtreeIds(childrenOf, movingId).includes(targetId)) {
    return { ok: false, reason: '自分の子孫の下へは移せません。' }
  }
  return { ok: true }
}
