import { describe, it, expect } from 'vitest'
import { expandTabs, normalizeCodeText } from '../src/renderer/src/editor/codeText'
import { AUTO_SIZE_SPECS, computeAutoSize } from '../src/renderer/src/editor/autosize'

describe('computeAutoSize（コード表示 = noWrap）', () => {
  // 1 文字 = 10px の単純な measurer
  const measure = (text: string): number => text.length * 10
  const spec = { ...AUTO_SIZE_SPECS.topic, maxWidth: 1600, noWrap: true }

  it('一番長い行に合わせて広がり、折り返し分の行を足さない', () => {
    const code = 'int main() {\n    return 0;\n}'
    const r = computeAutoSize(code, spec, measure)
    expect(r.lines).toBe(3)
    // 一番長いのはインデント込みの 2 行目（行頭の空白も幅に数える）
    expect(r.width).toBe('    return 0;'.length * 10 + spec.padX * 2)
    expect(r.height).toBe(Math.max(spec.minHeight, 3 * spec.lineHeight + spec.padY))
  })

  it('上限幅で止まっても行数は改行の数のまま', () => {
    const r = computeAutoSize('x'.repeat(400) + '\ny', spec, measure)
    expect(r.width).toBe(1600)
    expect(r.lines).toBe(2)
  })
})

describe('expandTabs', () => {
  it('タブの無い行はそのまま', () => {
    expect(expandTabs('    return 0;', 4)).toBe('    return 0;')
  })

  it('行頭のタブは tabSize 個の空白になる', () => {
    expect(expandTabs('\t\treturn 0;', 4)).toBe('        return 0;')
  })

  it('途中のタブは次のタブ位置まで埋める', () => {
    expect(expandTabs('int\tx;', 4)).toBe('int x;')
    expect(expandTabs('ab\tc', 4)).toBe('ab  c')
    expect(expandTabs('abcd\te', 4)).toBe('abcd    e')
  })
})

describe('normalizeCodeText', () => {
  it('行頭のインデントは保つ', () => {
    const code = 'int main() {\n    if (x) {\n        return 1;\n    }\n}'
    expect(normalizeCodeText(code, 4)).toBe(code)
  })

  it('CRLF を LF に揃え、タブを展開する', () => {
    expect(normalizeCodeText('void f() {\r\n\tg();\r\n}', 4)).toBe('void f() {\n    g();\n}')
  })

  it('行末の空白と前後の空行を落とす（途中の空行は残す）', () => {
    expect(normalizeCodeText('\n\n  a();  \n\n  b();\t\n\n', 4)).toBe('  a();\n\n  b();')
  })

  it('空白だけなら空文字', () => {
    expect(normalizeCodeText(' \n\t\n', 4)).toBe('')
  })
})
