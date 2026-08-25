import { describe, it, expect } from 'vitest'
import { clampCenterlineY } from '../src/renderer/src/editor/centerline'
import { LIFELINE } from '../src/renderer/src/editor/constants'

describe('clampCenterlineY', () => {
  const lifeline = { y: 24, height: 564 }
  // arrow_fixed_location.umlproj の「Web ブラウザ」上の実行仕様バー
  const activation = { y: 120, height: 120 }

  it('範囲内の参照 Y はそのまま通す', () => {
    expect(clampCenterlineY('lifeline', lifeline, 300)).toBe(300)
    expect(clampCenterlineY('activation', activation, 180)).toBe(180)
  })

  it('ライフラインはヘッダより上に付かない', () => {
    expect(clampCenterlineY('lifeline', lifeline, 0)).toBe(24 + LIFELINE.headHeight + 4)
  })

  it('生存線の下端で頭打ちになる', () => {
    expect(clampCenterlineY('lifeline', lifeline, 9999)).toBe(24 + 564)
  })

  it('実行仕様バーは自身の縦範囲へクランプされる', () => {
    expect(clampCenterlineY('activation', activation, 40)).toBe(120)
    expect(clampCenterlineY('activation', activation, 400)).toBe(240)
  })

  it('シーケンス以外のノードは中心 Y を返す', () => {
    expect(clampCenterlineY('action', { y: 100, height: 44 }, 0)).toBe(122)
  })

  it('vertex を失ったメッセージの復帰位置は今の見た目と一致する', () => {
    // vertex が無いとアンカーは「相手セルの中心 Y」を参照点にする。
    // 実行仕様バー（120..240）が相手なら、その中心 180 に張り付く。
    const sourceY = clampCenterlineY('lifeline', lifeline, activation.y + activation.height / 2)
    expect(clampCenterlineY('activation', activation, sourceY)).toBe(180)
  })
})
