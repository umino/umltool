import { describe, expect, it } from 'vitest'
import {
  isValidViewState,
  parseViewMemory,
  recallView,
  rememberView,
  type ViewMemory
} from '../src/renderer/src/ui/viewMemory'

const v = (zoom: number, cx = 0, cy = 0): { zoom: number; cx: number; cy: number } => ({
  zoom,
  cx,
  cy
})

describe('rememberView / recallView', () => {
  it('記録した表示状態を取り出せる', () => {
    const m = rememberView([], 'C:\\a\\b.umlproj', v(1.5, 100, 200))
    expect(recallView(m, 'C:\\a\\b.umlproj')).toEqual(v(1.5, 100, 200))
    expect(recallView(m, 'C:\\a\\other.umlproj')).toBeNull()
  })

  it('大文字小文字・区切り文字の違いは同じファイルとして扱う', () => {
    const m = rememberView([], 'C:/Work/Diagram.umlproj', v(2))
    expect(recallView(m, 'c:\\work\\diagram.umlproj')).toEqual(v(2))
  })

  it('同じファイルを記録し直すと上書きして最近側へ回す', () => {
    let m: ViewMemory = []
    m = rememberView(m, 'a', v(1))
    m = rememberView(m, 'b', v(1))
    m = rememberView(m, 'a', v(3))
    expect(m.map(([k]) => k)).toEqual(['b', 'a'])
    expect(recallView(m, 'a')).toEqual(v(3))
  })

  it('上限を超えたら古いものから忘れる', () => {
    let m: ViewMemory = []
    for (const p of ['a', 'b', 'c', 'd']) m = rememberView(m, p, v(1), 3)
    expect(m.map(([k]) => k)).toEqual(['b', 'c', 'd'])
    expect(recallView(m, 'a')).toBeNull()
  })
})

describe('parseViewMemory', () => {
  it('壊れた JSON や不正な項目は捨てる', () => {
    expect(parseViewMemory(null)).toEqual([])
    expect(parseViewMemory('{')).toEqual([])
    expect(parseViewMemory('{"a":1}')).toEqual([])
    const raw = JSON.stringify([
      ['ok', v(1, 2, 3)],
      ['zero', v(0)],
      ['nan', { zoom: 1, cx: 'x', cy: 0 }],
      [1, v(1)]
    ])
    expect(parseViewMemory(raw)).toEqual([['ok', v(1, 2, 3)]])
  })

  it('isValidViewState は有限の数と正の倍率だけを通す', () => {
    expect(isValidViewState(v(1, -5, 5))).toBe(true)
    expect(isValidViewState(v(-1))).toBe(false)
    expect(isValidViewState({ zoom: Infinity, cx: 0, cy: 0 })).toBe(false)
    expect(isValidViewState(null)).toBe(false)
  })
})
