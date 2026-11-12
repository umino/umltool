// ファイルごとの「最後に見ていた位置と倍率」を覚えておく（issue #68）。
// 開き直したときに同じ場所から続けられるようにする。図の中身ではないので
// プロジェクトファイルには書かず（保存していない扱いにしないため）、
// localStorage にファイルパスをキーにして残す。
//
// 記録の出し入れは純粋関数にしてテストし、localStorage への読み書きだけを
// 薄く包む。localStorage が使えない環境でも、単に「覚えていない」だけで動く。

/** 表示状態。cx, cy は画面中央に見えている点（図のローカル座標） */
export interface ViewState {
  zoom: number
  cx: number
  cy: number
}

/** パス → 表示状態。並びは古い順（末尾が最近） */
export type ViewMemory = Array<[string, ViewState]>

/** 覚えておくファイルの数。超えたら古いものから忘れる */
export const VIEW_MEMORY_LIMIT = 50

const STORAGE_KEY = 'umltool.viewByPath'

/** 壊れた値・極端な値を弾く（手で書き換えられた localStorage でも落ちない） */
export function isValidViewState(v: unknown): v is ViewState {
  if (typeof v !== 'object' || v === null) return false
  const { zoom, cx, cy } = v as Record<string, unknown>
  return (
    typeof zoom === 'number' &&
    typeof cx === 'number' &&
    typeof cy === 'number' &&
    Number.isFinite(zoom) &&
    Number.isFinite(cx) &&
    Number.isFinite(cy) &&
    zoom > 0
  )
}

/** Windows のパスは大文字小文字を区別しないので、同じファイルを同じキーにする */
function keyOf(path: string): string {
  return path.replace(/\//g, '\\').toLowerCase()
}

/** path の表示状態を記録し、最近使ったものとして末尾へ回す */
export function rememberView(
  memory: ViewMemory,
  path: string,
  view: ViewState,
  limit = VIEW_MEMORY_LIMIT
): ViewMemory {
  const key = keyOf(path)
  const rest = memory.filter(([k]) => k !== key)
  const next: ViewMemory = [...rest, [key, { zoom: view.zoom, cx: view.cx, cy: view.cy }]]
  return next.slice(Math.max(0, next.length - Math.max(1, limit)))
}

/** path の表示状態（覚えていなければ null） */
export function recallView(memory: ViewMemory, path: string): ViewState | null {
  const key = keyOf(path)
  const hit = memory.find(([k]) => k === key)
  return hit ? hit[1] : null
}

/** 保存されていた JSON を ViewMemory に直す（不正な項目は捨てる） */
export function parseViewMemory(raw: string | null): ViewMemory {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is [string, ViewState] =>
        Array.isArray(e) && typeof e[0] === 'string' && isValidViewState(e[1])
    )
  } catch {
    return []
  }
}

function load(): ViewMemory {
  try {
    return parseViewMemory(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

/** 記録済みの表示状態を読む */
export function loadViewFor(path: string): ViewState | null {
  return recallView(load(), path)
}

/** 表示状態を記録する */
export function saveViewFor(path: string, view: ViewState): void {
  if (!isValidViewState(view)) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rememberView(load(), path, view)))
  } catch {
    // 覚えられなくても、開いたときに全体表示になるだけ
  }
}
