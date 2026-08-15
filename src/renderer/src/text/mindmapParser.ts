// マインドマップのアウトライン記法パーサー（ライブラリ非依存・純関数）
//
// 2 つの書き方に対応する。どちらの流儀かは最初に階層が下がった行で決まり、
// 1 つのテキスト内での混在はエラーにする。
//
//   マーカー記法（PlantUML mindmap 互換）:
//     * ルート
//     ** 子
//     *** 孫
//   インデント記法:
//     ルート
//       子
//         孫
//
// マーカーは * + - のいずれも「階層の深さ」としてのみ解釈する（PlantUML の
// - による左右指定は、本ツールが左右を自動で振り分けるため無視する）。
// ラベル中の \n は改行になる。

import { ParseError } from './sequenceParser'

export interface MindmapNode {
  id: string
  /** 親ノードの id。ルートは null */
  parentId: string | null
  label: string
  /** ルートを 0 とする深さ */
  depth: number
}

export interface ParsedMindmap {
  nodes: MindmapNode[]
}

/** インデント記法でタブ 1 つを何文字分と数えるか */
const TAB_WIDTH = 4

const RE = {
  comment: /^\s*(?:'|\/\/)/,
  skip: /^\s*(?:@start\w*|@end\w*|title\b|caption\b)/i,
  /** 行頭のマーカー列（* + -）。直後の [#色] 等の装飾は読み飛ばす */
  marker: /^([*+-]+)(?:\[[^\]]*\])?\s*(.*)$/
}

/** 行頭の空白幅。タブは TAB_WIDTH 文字として数える */
function indentWidth(line: string): number {
  let width = 0
  for (const ch of line) {
    if (ch === '\t') width += TAB_WIDTH
    else if (ch === ' ') width += 1
    else break
  }
  return width
}

/** ラベルの整形。\n 表記を実際の改行に変える */
function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\\n/g, '\n')
}

interface SourceLine {
  lineNo: number
  /** マーカー記法での深さ（0 起点）。インデント記法の行では null */
  markerDepth: number | null
  indent: number
  label: string
}

export function parseMindmap(text: string): ParsedMindmap {
  const lines = text.split(/\r?\n/)
  const source: SourceLine[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    if (RE.comment.test(line) || RE.skip.test(line)) continue

    const lineNo = i + 1
    const marker = RE.marker.exec(line.trim())
    if (marker) {
      const label = normalizeLabel(marker[2])
      if (label === '') throw new ParseError('トピック名が空です', lineNo)
      source.push({ lineNo, markerDepth: marker[1].length - 1, indent: 0, label })
    } else {
      source.push({
        lineNo,
        markerDepth: null,
        indent: indentWidth(line),
        label: normalizeLabel(line)
      })
    }
  }

  if (source.length === 0) return { nodes: [] }

  const useMarker = source[0].markerDepth !== null
  for (const line of source) {
    if ((line.markerDepth !== null) !== useMarker) {
      throw new ParseError(
        useMarker
          ? 'マーカー記法（*）とインデント記法は混在させられません'
          : 'インデント記法の途中でマーカー記法（*）は使えません',
        line.lineNo
      )
    }
  }

  const depths = useMarker
    ? source.map((line) => line.markerDepth as number)
    : indentDepths(source)

  if (depths[0] !== 0) {
    throw new ParseError('最初の行はルート（インデント・マーカー無し）にしてください', source[0].lineNo)
  }

  const nodes: MindmapNode[] = []
  /** 深さ → 直近に現れたノードの id */
  const lastByDepth: string[] = []
  for (let i = 0; i < source.length; i++) {
    const depth = depths[i]
    if (depth > 0 && lastByDepth[depth - 1] === undefined) {
      throw new ParseError('階層が飛んでいます（親のないトピックです）', source[i].lineNo)
    }
    const id = `t${i}`
    nodes.push({
      id,
      parentId: depth === 0 ? null : lastByDepth[depth - 1],
      label: source[i].label,
      depth
    })
    lastByDepth[depth] = id
    lastByDepth.length = depth + 1
  }

  return { nodes }
}

/**
 * インデント幅を深さへ変換する。1 段の幅は最初に字下げされた行の幅で決まり、
 * その倍数になっていない行はエラーにする。
 */
function indentDepths(source: SourceLine[]): number[] {
  const unit = source.find((line) => line.indent > 0)?.indent ?? 1
  return source.map((line) => {
    if (line.indent % unit !== 0) {
      throw new ParseError(
        `インデント幅が揃っていません（1 段 = 半角 ${unit} 文字）`,
        line.lineNo
      )
    }
    return line.indent / unit
  })
}
