import { describe, expect, it } from 'vitest'
import {
  CppConvertError,
  cppToActivityText,
  findCppFunctions,
  stripCppNoise
} from '../src/renderer/src/text/cppToActivity'
import { parseActivity } from '../src/renderer/src/text/activityParser'
import { defaultFunctionIndex } from '../src/renderer/src/ui/cppImport'

/** 変換結果のうちコメント行を除いた本文（字下げ込み） */
const body = (text: string): string[] =>
  text.split('\n').filter((l) => !l.trim().startsWith("'"))

describe('stripCppNoise', () => {
  it('コメントとプリプロセッサ行を消し、文字列の中は残す', () => {
    const src =
      '#include <x>\n#define A(b) \\\n  (b)\nint f() { // c\n  s = "// not comment"; /* x */\n}'
    const clean = stripCppNoise(src)
    expect(clean.length).toBe(src.length)
    expect(clean).not.toContain('include')
    expect(clean).not.toContain('(b)')
    expect(clean).not.toContain('// c')
    expect(clean).not.toContain('/* x */')
    expect(clean).toContain('"// not comment"')
  })
})

describe('findCppFunctions', () => {
  it('名前空間・クラスの中の関数を拾い、宣言や変数は拾わない', () => {
    const src = `
namespace a { namespace b {
class Foo : public Bar {
public:
  Foo(int x) : x_(x), y_{x * 2} { init(); }
  ~Foo() {}
  void decl();
  bool operator==(const Foo& o) const { return x_ == o.x_; }
private:
  int x_;
  int y_;
};
int Foo::run() noexcept { return 1; }
} }
static int table[] = { 1, 2, 3 };
auto lambda = [](int v) { return v; };
enum class E { A, B };
template <typename T> T twice(T v) { return v * 2; }
int main() { return 0; }`
    const names = findCppFunctions(src).map((f) => f.name)
    expect(names).toEqual([
      'Foo::Foo',
      'Foo::~Foo',
      'Foo::operator==',
      'Foo::run',
      'twice',
      'main'
    ])
  })

  it('行番号は関数名のある行', () => {
    const fns = findCppFunctions('// head\n\nvoid f()\n{\n}\n')
    expect(fns[0].line).toBe(3)
  })

  it('いちばん長い関数を最初の候補にする', () => {
    const fns = findCppFunctions('void a() {}\nvoid b() { x(); y(); z(); }\nvoid c() { x(); }')
    expect(fns[defaultFunctionIndex(fns)].name).toBe('b')
  })
})

describe('cppToActivityText', () => {
  it('if / else と return を分岐・終了にする', () => {
    const text = cppToActivityText(`int sign(int v) {
  if (v > 0) {
    return 1;
  } else if (v < 0) {
    return -1;
  }
  return 0;
}`)
    expect(body(text)).toEqual([
      'start',
      'if (v > 0) then (yes)',
      '  :return 1;',
      '  stop',
      'else (no)',
      '  if (v < 0) then (yes)',
      '    :return -1;',
      '    stop',
      '  endif',
      'endif',
      ':return 0;',
      'stop'
    ])
    expect(() => parseActivity(text)).not.toThrow()
  })

  it('for は初期化・条件・更新に分け、範囲 for は要素ごとの繰り返しにする', () => {
    const text = cppToActivityText(`void f(std::vector<int>& xs) {
  for (int i = 0; i < n; ++i) { use(i); }
  for (auto& x : xs) x = 0;
}`)
    expect(body(text)).toEqual([
      'start',
      ':int i = 0;',
      'while (i < n) is (yes)',
      '  :use(i);',
      '  :++i;',
      'endwhile (no)',
      'while (xs の各要素 auto& x) is (次へ)',
      '  :x = 0;',
      'endwhile (完了)',
      'stop'
    ])
  })

  it('do-while は repeat、break / continue はループの制御になる', () => {
    const text = cppToActivityText(`void f() {
  do { step(); } while (busy());
  while (true) {
    if (skip()) continue;
    if (done()) break;
    work();
  }
}`)
    expect(body(text)).toEqual([
      'start',
      'repeat',
      '  :step();',
      'repeat while (busy()) is (yes) not (no)',
      'while (true) is (yes)',
      '  if (skip()) then (yes)',
      '    continue',
      '  endif',
      '  if (done()) then (yes)',
      '    break',
      '  endif',
      '  :work();',
      'endwhile (no)',
      'stop'
    ])
    const p = parseActivity(text)
    expect(p.nodes.filter((n) => n.kind === 'final')).toHaveLength(1)
  })

  it('switch は case ごとの分岐の入れ子にし、case の break は書かない', () => {
    const text = cppToActivityText(`void f(Kind k) {
  switch (k) {
    case Kind::A:
    case Kind::B:
      a();
      break;
    case Kind::C: c(); break;
    default:
      other();
  }
}`)
    expect(body(text)).toEqual([
      'start',
      'if (k == Kind::A, Kind::B) then (yes)',
      '  :a();',
      'else (no)',
      '  if (k == Kind::C) then (yes)',
      '    :c();',
      '  else (no)',
      '    :other();',
      '  endif',
      'endif',
      'stop'
    ])
    expect(() => parseActivity(text)).not.toThrow()
  })

  it('try / catch は本体の後ろに捕捉の分岐を置く', () => {
    const text = cppToActivityText(`void f() {
  try { send(); }
  catch (const NetError& e) { retry(); }
  catch (...) { throw; }
}`)
    expect(body(text)).toEqual([
      'start',
      ':send();',
      'if (例外 const NetError& e) then (catch)',
      '  :retry();',
      'else (no)',
      '  if (例外 ...) then (catch)',
      '    :throw;',
      '    stop',
      '  endif',
      'endif',
      'stop'
    ])
    expect(() => parseActivity(text)).not.toThrow()
  })

  it('return の後ろの到達しない文は書かず、長い文は省略する', () => {
    const long = 'x'.repeat(100)
    const text = cppToActivityText(`void f() {\n  call(${long});\n  return;\n  never();\n}`)
    const lines = body(text)
    expect(lines.some((l) => l.includes('never'))).toBe(false)
    expect(lines[1].length).toBeLessThanOrEqual(62)
    expect(lines[1].endsWith('…;')).toBe(true)
  })

  it('文の中のラムダや初期化子の波括弧は 1 つの文として扱う', () => {
    const text = cppToActivityText(`void f() {
  auto g = [&](int v) { if (v) return 1; return 2; };
  std::vector<int> v{1, 2, 3};
}`)
    expect(body(text)).toEqual([
      'start',
      ':auto g = [&](int v) { if (v) return 1; return 2; };',
      ':std::vector<int> v{1, 2, 3};',
      'stop'
    ])
  })

  it('関数を選んで変換でき、見出しに関数名を入れる', () => {
    const src = 'void a() { x(); }\nvoid b() { y(); }'
    const text = cppToActivityText(src, 1)
    expect(text.split('\n')[0]).toContain('b')
    expect(body(text)).toEqual(['start', ':y();', 'stop'])
  })

  it('関数が無い・括弧が壊れているときは CppConvertError', () => {
    expect(() => cppToActivityText('int x = 1;')).toThrow(CppConvertError)
    expect(() => cppToActivityText('void f() { if (x { }')).toThrow(CppConvertError)
  })
})
