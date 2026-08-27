// 書き出した画像へ解像度（dpi）情報を埋め込む。
//
// canvas.toDataURL は解像度を書かないため、そのまま Excel などへ貼ると 96dpi
// 相当と見なされ、dpi を上げるほど「紙面で大きく」貼られてしまう。PNG は pHYs
// チャンク、JPEG は JFIF APP0 の密度フィールドに実際の dpi を書いて、解像度を
// 上げても貼り付け寸法が変わらないようにする。
// WebP（canvas 出力の単純な VP8 ファイル）には解像度を書く定位置がないので、
// 何もせずそのまま返す。

/** dpi → ピクセル/メートル（pHYs の単位は「メートルあたり」） */
export function dpiToPixelsPerMeter(dpi: number): number {
  return Math.round(dpi / 0.0254)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

let crcTable: Uint32Array | null = null

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunkType(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])
}

/** pHYs チャンク（長さ + 型 + データ + CRC）を組み立てる */
function buildPhys(dpi: number): Uint8Array {
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9) // データ長
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // 'pHYs'
  const ppm = dpiToPixelsPerMeter(dpi)
  view.setUint32(8, ppm) // 横
  view.setUint32(12, ppm) // 縦
  chunk[16] = 1 // 単位: メートル
  view.setUint32(17, crc32(chunk.subarray(4, 17)))
  return chunk
}

function splice(src: Uint8Array, start: number, deleteCount: number, insert: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length - deleteCount + insert.length)
  out.set(src.subarray(0, start), 0)
  out.set(insert, start)
  out.set(src.subarray(start + deleteCount), start + insert.length)
  return out
}

/**
 * PNG の pHYs チャンクを指定 dpi に書き換える（無ければ IHDR の直後に挿入）。
 * PNG として読めないデータはそのまま返す。
 */
export function applyPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 8 || PNG_SIGNATURE.some((b, i) => png[i] !== b)) return png
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)

  let pos = 8
  let insertAt = -1
  while (pos + 8 <= png.length) {
    const length = view.getUint32(pos)
    const next = pos + 12 + length
    if (next > png.length) break
    const type = chunkType(png, pos + 4)
    if (type === 'pHYs') return splice(png, pos, next - pos, buildPhys(dpi))
    // pHYs は IHDR の後・画像データの前に置く決まり。IHDR 直後に入れる。
    if (type === 'IHDR') insertAt = next
    if (type === 'IDAT' || type === 'IEND') break
    pos = next
  }
  if (insertAt < 0) return png
  return splice(png, insertAt, 0, buildPhys(dpi))
}

/**
 * JPEG（JFIF）の密度フィールドを指定 dpi に書き換える。
 * JFIF ヘッダを持たないデータはそのまま返す。
 */
export function applyJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  // SOI(FFD8) + APP0(FFE0) + 長さ2 + 'JFIF\0'
  const hasJfif =
    jpeg.length >= 18 &&
    jpeg[0] === 0xff &&
    jpeg[1] === 0xd8 &&
    jpeg[2] === 0xff &&
    jpeg[3] === 0xe0 &&
    chunkType(jpeg, 6) === 'JFIF' &&
    jpeg[10] === 0x00
  if (!hasJfif) return jpeg

  const density = Math.min(0xffff, Math.max(1, Math.round(dpi)))
  const out = new Uint8Array(jpeg)
  out[13] = 1 // 単位: インチあたりのドット数
  out[14] = (density >> 8) & 0xff
  out[15] = density & 0xff
  out[16] = (density >> 8) & 0xff
  out[17] = density & 0xff
  return out
}
