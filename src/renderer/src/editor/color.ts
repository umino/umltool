// 色と不透明度の分解・組み立て（ライブラリ非依存・純関数。issue #59）
//
// 不透明度は色の値そのものに #rrggbbaa として持たせる。SVG の fill / stroke に
// そのまま入り、矢じりへの色の引き継ぎや保存形式も今までの色の扱いのまま通る。
// 不透明なときは従来どおり #rrggbb を返し、既存のファイルや比較を変えない。

export interface ColorParts {
  /** #rrggbb（小文字） */
  hex: string
  /** 不透明度 0〜1 */
  alpha: number
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * 色の文字列を #rrggbb と不透明度に分ける。
 * 'transparent' / 'none' は不透明度 0、読めない値は fallback の不透明色とみなす。
 */
export function parseColor(value: string, fallback = '#1d2330'): ColorParts {
  const v = value.trim().toLowerCase()
  if (v === 'transparent' || v === 'none') return { hex: fallback.toLowerCase(), alpha: 0 }
  const m = HEX.exec(v)
  if (m === null) return { hex: fallback.toLowerCase(), alpha: 1 }
  const digits = m[1]
  if (digits.length === 3) {
    return { hex: `#${[...digits].map((d) => d + d).join('')}`, alpha: 1 }
  }
  const hex = `#${digits.slice(0, 6)}`
  if (digits.length === 6) return { hex, alpha: 1 }
  return { hex, alpha: parseInt(digits.slice(6), 16) / 255 }
}

/** #rrggbb と不透明度から色の文字列を作る（不透明なら #rrggbb のまま） */
export function formatColor(hex: string, alpha: number): string {
  const base = parseColor(hex).hex
  const a = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1))
  const byte = Math.round(a * 255)
  if (byte >= 255) return base
  return `${base}${byte.toString(16).padStart(2, '0')}`
}

/** 不透明度をパーセント（整数）で表す */
export function alphaPercent(alpha: number): number {
  return Math.round(Math.min(1, Math.max(0, alpha)) * 100)
}
