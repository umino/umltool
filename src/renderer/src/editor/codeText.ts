// コード表示トピックの本文整形（ライブラリ非依存・純関数）
//
// SVG の text はタブを空白 1 個ぶん程度にしか描かないため、インデントを保つには
// 保存する時点で空白へ展開しておく。行頭の空白そのものは X6 が NBSP に置き換えて
// 描くので、ここでは詰めたり揃え直したりしない（貼り付けた形をそのまま残す）。

/** タブを tabSize 桁ごとのタブ位置まで空白で埋める */
export function expandTabs(line: string, tabSize: number): string {
  if (!line.includes('\t')) return line
  let out = ''
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(tabSize - (out.length % tabSize))
    else out += ch
  }
  return out
}

/**
 * コードとして保存する形に整える。
 * 改行コードを LF に揃え、タブを空白に展開し、行末の空白と前後の空行を落とす。
 * 行頭のインデントは触らない。
 */
export function normalizeCodeText(text: string, tabSize: number): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => expandTabs(line, tabSize).replace(/\s+$/, ''))
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}
