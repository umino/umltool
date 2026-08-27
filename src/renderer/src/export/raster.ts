// ラスタ画像書き出し。
// X6 の Export プラグインで独立 SVG を得て、canvas 経由で PNG/JPEG/WebP の
// dataURL に変換する（1 本のパイプラインで 3 形式を賄う）。
// JPEG は背景白、PNG/WebP は透過。

import type { Graph } from '@antv/x6'
import { applyJpegDpi, applyPngDpi } from './dpiMetadata'

export type ImageFormat = 'png' | 'jpg' | 'webp'

const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp'
}

/** CSS px の基準解像度。96dpi のとき画面上の実寸と等倍になる */
export const CSS_DPI = 96

/** 既定の書き出し解像度（従来の pixelRatio: 2 相当） */
export const DEFAULT_DPI = 192

/** 1 辺の上限 px。Excel はこれを超える画像を貼り付けられない */
export const MAX_IMAGE_SIDE = 8192

/** ツールバーに並べる解像度の候補（96 未満は等倍より小さく書き出す） */
export const DPI_CHOICES = [72, 96, 144, 192, 288, 384, 600] as const

export interface ExportOptions {
  /** 出力解像度 dpi（既定 192）。上限を超えるときは自動で下げる */
  dpi?: number
  /** 旧来の倍率指定。dpi 未指定のときだけ使う（1 = 96dpi） */
  pixelRatio?: number
  /** 余白 px（既定 16） */
  margin?: number
  /** 1 辺の上限 px（既定 MAX_IMAGE_SIDE）。Infinity で無制限 */
  maxSide?: number
}

export interface ExportScale {
  /** SVG 1px あたりの出力画素数 */
  pixelRatio: number
  /** 実際に適用される解像度 dpi */
  dpi: number
  /** 上限に収めるため要求 dpi から下げたか */
  clamped: boolean
  /** 出力画素数 */
  width: number
  height: number
}

export interface ExportResult extends ExportScale {
  dataUrl: string
  /** 呼び出し側が要求した dpi */
  requestedDpi: number
}

/**
 * 要求 dpi を「1 辺 maxSide px 以内」に収まる倍率へ丸める（純粋計算）。
 * 図が大きいほど上限に先に当たるので、そのときは要求より低い dpi になる。
 */
export function resolveExportScale(
  requestedDpi: number,
  width: number,
  height: number,
  maxSide: number = MAX_IMAGE_SIDE
): ExportScale {
  const wanted = Math.max(requestedDpi, 1) / CSS_DPI
  const longest = Math.max(width, height, 1)
  const limit = maxSide / longest
  const clamped = limit < wanted
  const pixelRatio = clamped ? limit : wanted
  return {
    pixelRatio,
    dpi: pixelRatio * CSS_DPI,
    clamped,
    width: Math.max(1, Math.round(width * pixelRatio)),
    height: Math.max(1, Math.round(height * pixelRatio))
  }
}

/**
 * 書き出す範囲。
 *
 * セルの矩形だけで測ると、はみ出したラベルが切れる。エッジのラベルは線の中点に
 * 置かれるだけで線の長さには収まらないので、`[-> A` のような短いゲート線に長い
 * ラベルを乗せると顕著に欠ける。実際に描かれている範囲（DOM 実測）との和を取る。
 * DOM 側は選択中の編集ハンドルなども含みうるが、範囲が広がるだけで害はない
 * （ハンドル自体は beforeSerialize で消している）。
 */
function contentBBoxWithLabels(graph: Graph): ReturnType<Graph['getContentBBox']> {
  const geometry = graph.getContentBBox()
  try {
    const drawn = graph.getContentBBox({ useCellGeometry: false })
    if (drawn.width > 0 && drawn.height > 0) return geometry.union(drawn)
  } catch {
    // 描画前などで実測できないときはセルの矩形だけで書き出す
  }
  return geometry
}

/** グラフを独立 SVG 文字列にする（余白は viewBox に焼き込む） */
export async function exportGraphToSvg(
  graph: Graph,
  margin = 16
): Promise<{ svg: string; width: number; height: number }> {
  const viewBox = graph.graphToLocal(contentBBoxWithLabels(graph)).inflate(margin)
  const width = Math.max(1, viewBox.width)
  const height = Math.max(1, viewBox.height)
  const svg = await graph.toSVGAsync({
    viewBox,
    preserveDimensions: { width, height },
    copyStyles: false,
    serializeImages: true,
    // Export プラグインは stage の transform しか除去しないため、ズーム行列が
    // 残る viewport の transform をここで外す（viewBox はローカル座標なので、
    // これが残ると座標系がズレて何も写らない）
    beforeSerialize: (svgEl: SVGSVGElement) => {
      svgEl.querySelector('.x6-graph-svg-viewport')?.removeAttribute('transform')
      // 画面では CSS で隠している接続ポートは、画像には含めない
      svgEl.querySelectorAll('.x6-port').forEach((el) => el.remove())
      // 選択中のセルに出ている編集ハンドル（vertex / 端点付け替え）も画像には含めない
      svgEl.querySelectorAll('.x6-cell-tools').forEach((el) => el.remove())
    }
  })
  return { svg, width, height }
}

/** グラフを画像化し、実際に使われた解像度と画素数まで返す */
export async function exportGraphToImage(
  graph: Graph,
  format: ImageFormat,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const requestedDpi =
    options.dpi ?? (options.pixelRatio != null ? options.pixelRatio * CSS_DPI : DEFAULT_DPI)
  const { svg, width, height } = await exportGraphToSvg(graph, options.margin ?? 16)
  const scale = resolveExportScale(requestedDpi, width, height, options.maxSide ?? MAX_IMAGE_SIDE)

  const img = await loadSvg(svg)

  const canvas = document.createElement('canvas')
  canvas.width = scale.width
  canvas.height = scale.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2D コンテキストを取得できません')

  if (format === 'jpg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.scale(scale.pixelRatio, scale.pixelRatio)
  ctx.drawImage(img, 0, 0, width, height)

  const dataUrl = canvas.toDataURL(MIME[format], 0.92)
  if (!dataUrl.startsWith(`data:${MIME[format]}`)) {
    throw new Error(`${format} 形式への変換に失敗しました`)
  }
  return { ...scale, requestedDpi, dataUrl: embedDpi(dataUrl, format, scale.dpi) }
}

export async function exportGraphToDataUrl(
  graph: Graph,
  format: ImageFormat,
  options: ExportOptions = {}
): Promise<string> {
  return (await exportGraphToImage(graph, format, options)).dataUrl
}

/** dataURL の中身へ解像度情報を書き込む（書けない形式はそのまま返す） */
function embedDpi(dataUrl: string, format: ImageFormat, dpi: number): string {
  if (format === 'webp') return dataUrl
  const bytes = dataUrlToBytes(dataUrl)
  const patched = format === 'png' ? applyPngDpi(bytes, dpi) : applyJpegDpi(bytes, dpi)
  if (patched === bytes) return dataUrl
  return bytesToDataUrl(patched, MIME[format])
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  // 巨大画像でも引数上限に当たらないよう小分けに文字列化する
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG の読み込みに失敗しました'))
    }
    img.src = url
  })
}
