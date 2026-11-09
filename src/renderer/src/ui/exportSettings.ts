// 画像書き出しの分割設定。次に開いたときも同じ設定で始まるよう localStorage に残す。
// localStorage が使えない環境（プライベートモード等）でも既定値で動く。

import { DEFAULT_SPLIT_SIZE, SPLIT_SIZE_CHOICES } from '../export/tiles'
import type { SplitOptions } from '../export/raster'

const STORAGE_KEY = 'umltool.exportSplit'

/** 既定は「4096px を超えたら分割する」 */
export const DEFAULT_SPLIT: SplitOptions = { enabled: true, maxSide: DEFAULT_SPLIT_SIZE }

export function loadSplitSettings(): SplitOptions {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SPLIT }
    const parsed = JSON.parse(raw) as Partial<SplitOptions>
    const maxSide = (SPLIT_SIZE_CHOICES as readonly number[]).includes(Number(parsed.maxSide))
      ? Number(parsed.maxSide)
      : DEFAULT_SPLIT.maxSide
    return { enabled: parsed.enabled !== false, maxSide }
  } catch {
    return { ...DEFAULT_SPLIT }
  }
}

export function saveSplitSettings(split: SplitOptions): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(split))
  } catch {
    // 保存できなくても、このセッション中の設定はそのまま使える
  }
}
