// ラスタ画像書き出し。
// X6 の Export プラグインで独立 SVG を得て、canvas 経由で PNG/JPEG/WebP の
// dataURL に変換する（1 本のパイプラインで 3 形式を賄う）。
// JPEG は背景白、PNG/WebP は透過。

import type { Graph } from '@antv/x6'

export type ImageFormat = 'png' | 'jpg' | 'webp'

const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp'
}

export interface ExportOptions {
  /** 高精細化倍率（既定 2） */
  pixelRatio?: number
  /** 余白 px（既定 16） */
  margin?: number
}

/** グラフを独立 SVG 文字列にする（余白は viewBox に焼き込む） */
export async function exportGraphToSvg(
  graph: Graph,
  margin = 16
): Promise<{ svg: string; width: number; height: number }> {
  const viewBox = graph.graphToLocal(graph.getContentBBox()).inflate(margin)
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
    }
  })
  return { svg, width, height }
}

export async function exportGraphToDataUrl(
  graph: Graph,
  format: ImageFormat,
  options: ExportOptions = {}
): Promise<string> {
  const pixelRatio = options.pixelRatio ?? 2
  const { svg, width, height } = await exportGraphToSvg(graph, options.margin ?? 16)

  const img = await loadSvg(svg)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2D コンテキストを取得できません')

  if (format === 'jpg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.scale(pixelRatio, pixelRatio)
  ctx.drawImage(img, 0, 0, width, height)

  const dataUrl = canvas.toDataURL(MIME[format], 0.92)
  if (!dataUrl.startsWith(`data:${MIME[format]}`)) {
    throw new Error(`${format} 形式への変換に失敗しました`)
  }
  return dataUrl
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
