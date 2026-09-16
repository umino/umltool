// 図の中の文字列検索（DOM・X6 非依存の純関数）。issue #45
//
// 一致は図の上から下（同じ高さなら左から右）の順に並べる。シーケンス図なら
// 時間の流れ、アクティビティ図なら処理の流れに沿って「次へ」が進む。

export interface SearchItem {
  id: string
  text: string
  /** 並び順に使う左上の座標 */
  x: number
  y: number
}

/**
 * 比較用に正規化する。全角/半角・大文字/小文字の違いを無視し、
 * 改行を含む連続した空白は 1 個の空白として扱う（複数行ラベルにも当たるように）。
 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
}

/** query を含む項目を、図の上から順に返す。空の query は何にも当たらない */
export function findMatches(items: SearchItem[], query: string): SearchItem[] {
  const needle = normalizeForSearch(query).trim()
  if (needle === '') return []
  return items
    .filter((item) => normalizeForSearch(item.text).includes(needle))
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

export interface MatchStep {
  /** 次に表示する一致の位置。一致が無ければ -1 */
  index: number
  /** 端を越えて反対側へ回り込んだか（一周した合図） */
  wrapped: boolean
}

/**
 * 現在の一致から dir の向きへ 1 つ進める。
 *
 * 現在の一致が一覧に無い（初回・図が変わって消えた）ときは、向きに応じて
 * 先頭か末尾から始める。端を越えたら反対側へ回り込み、wrapped で知らせる。
 */
export function nextMatch(ids: string[], currentId: string | null, dir: 1 | -1): MatchStep {
  const total = ids.length
  if (total === 0) return { index: -1, wrapped: false }
  const current = currentId === null ? -1 : ids.indexOf(currentId)
  if (current === -1) return { index: dir === 1 ? 0 : total - 1, wrapped: false }
  const next = current + dir
  if (next >= total) return { index: 0, wrapped: true }
  if (next < 0) return { index: total - 1, wrapped: true }
  return { index: next, wrapped: false }
}
