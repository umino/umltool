// C++ のソースから、関数 1 つ分のアクティビティ図テキスト（PlantUML サブセット）を
// ざっくり作る（ライブラリ非依存・純関数）。
//
// 正確な構文解析はしない。コメント・プリプロセッサ行を除いてから字句に分け、
// 括弧の対応だけを頼りに関数の本体と制御構文（if / while / for / do / switch /
// try / return …）を拾い、それ以外の文はそのままアクションにする。
// マクロだらけのコードやテンプレートの込み入ったコードでは崩れることがあるが、
// それでも「だいたいの流れ」が掴めることを目指す。

export class CppConvertError extends Error {}

interface Token {
  type: 'id' | 'num' | 'str' | 'punct'
  text: string
  /** clean（コメント除去後のソース）上の位置 */
  start: number
  end: number
}

// ---------------------------------------------------------------------------
// 前処理・字句解析
// ---------------------------------------------------------------------------

/** 長いものから順に照合する記号 */
const PUNCTS = [
  '<<=', '>>=', '<=>', '->*', '...',
  '::', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '.*'
]

/**
 * コメントとプリプロセッサ行を空白に置き換える（位置はずらさない）。
 * 文字列・文字リテラルの中の // や /* はコメントとみなさない。
 */
export function stripCppNoise(src: string): string {
  const out = src.split('')
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  let lineStart = true
  while (i < src.length) {
    const c = src[i]
    if (c === '\n') {
      lineStart = true
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (lineStart && c === '#') {
      // 行末の \ で続く行もまとめて捨てる
      let j = i
      while (j < src.length) {
        if (src[j] === '\n') {
          let k = j - 1
          while (k > i && src[k] === '\r') k--
          if (src[k] === '\\') {
            j++
            continue
          }
          break
        }
        j++
      }
      blank(i, j)
      i = j
      continue
    }
    lineStart = false
    if (c === '/' && src[i + 1] === '/') {
      let j = i
      while (j < src.length && src[j] !== '\n') j++
      blank(i, j)
      i = j
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2)
      const j = close < 0 ? src.length : close + 2
      blank(i, j)
      i = j
      continue
    }
    // 生文字列リテラル R"delim( … )delim"
    if (c === 'R' && src[i + 1] === '"' && !/[\w]/.test(src[i - 1] ?? '') ) {
      const open = src.indexOf('(', i + 2)
      if (open >= 0) {
        const delim = src.slice(i + 2, open)
        const close = src.indexOf(`)${delim}"`, open + 1)
        i = close < 0 ? src.length : close + delim.length + 2
        continue
      }
    }
    if (c === '"' || c === "'") {
      // 数字の区切り 1'000 は文字リテラルではない
      if (c === "'" && /[0-9a-fA-F]/.test(src[i - 1] ?? '') && /[0-9a-fA-F]/.test(src[i + 1] ?? '')) {
        i++
        continue
      }
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      i = j + 1
      continue
    }
    i++
  }
  return out.join('')
}

export function tokenizeCpp(clean: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < clean.length) {
    const c = clean[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const start = i
    if (/[A-Za-z_$]/.test(c) || c.charCodeAt(0) > 0x7f) {
      while (i < clean.length && (/[\w$]/.test(clean[i]) || clean.charCodeAt(i) > 0x7f)) i++
      // 接頭辞付き文字列（u8"…" L'…' R"(…)" など）は 1 つの文字列にまとめる
      const word = clean.slice(start, i)
      if (/^(?:u8|u|U|L)?R?$/.test(word) && (clean[i] === '"' || clean[i] === "'")) {
        i = skipLiteral(clean, i, word.endsWith('R'))
        tokens.push({ type: 'str', text: clean.slice(start, i), start, end: i })
        continue
      }
      tokens.push({ type: 'id', text: word, start, end: i })
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(clean[i + 1] ?? ''))) {
      i++
      while (i < clean.length) {
        const d = clean[i]
        if (/[\w.']/.test(d)) i++
        else if ((d === '+' || d === '-') && /[eEpP]/.test(clean[i - 1])) i++
        else break
      }
      tokens.push({ type: 'num', text: clean.slice(start, i), start, end: i })
      continue
    }
    if (c === '"' || c === "'") {
      i = skipLiteral(clean, i, false)
      tokens.push({ type: 'str', text: clean.slice(start, i), start, end: i })
      continue
    }
    const p = PUNCTS.find((s) => clean.startsWith(s, i)) ?? c
    i += p.length
    tokens.push({ type: 'punct', text: p, start, end: i })
  }
  return tokens
}

/** i が開きの引用符を指しているリテラルの終わり（次の位置）を返す */
function skipLiteral(s: string, i: number, raw: boolean): number {
  const q = s[i]
  if (raw && q === '"') {
    const open = s.indexOf('(', i + 1)
    if (open >= 0) {
      const delim = s.slice(i + 1, open)
      const close = s.indexOf(`)${delim}"`, open + 1)
      return close < 0 ? s.length : close + delim.length + 2
    }
  }
  let j = i + 1
  while (j < s.length && s[j] !== q && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1
  return Math.min(s.length, j + 1)
}

// ---------------------------------------------------------------------------
// 括弧の対応
// ---------------------------------------------------------------------------

const OPEN_OF: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
const CLOSE_OF: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/** 開き括弧 tokens[i] に対応する閉じ括弧の位置。見つからなければ例外 */
function matchClose(tokens: Token[], i: number, limit = tokens.length): number {
  const stack: string[] = []
  for (let k = i; k < limit; k++) {
    const t = tokens[k].text
    if (tokens[k].type !== 'punct') continue
    if (CLOSE_OF[t]) stack.push(CLOSE_OF[t])
    else if (OPEN_OF[t]) {
      if (stack.pop() !== t) throw new CppConvertError('括弧の対応が取れません')
      if (stack.length === 0) return k
    }
  }
  throw new CppConvertError('括弧が閉じられていません')
}

const isP = (t: Token | undefined, text: string): boolean => t?.type === 'punct' && t.text === text
const isId = (t: Token | undefined, text?: string): boolean =>
  t?.type === 'id' && (text === undefined || t.text === text)

// ---------------------------------------------------------------------------
// 関数の発見
// ---------------------------------------------------------------------------

export interface CppFunction {
  /** 表示名（クラス内で定義されたものは Class::name） */
  name: string
  /** 1 始まりの行番号 */
  line: number
  /** 本体の { と } のトークン位置 */
  open: number
  close: number
}

const SCOPE_KEYWORDS = new Set(['class', 'struct', 'union'])
const NOT_FUNCTION_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'decltype', 'alignas',
  'static_assert', 'noexcept', 'requires', '__attribute__', '__declspec', 'alignof'
])

/** head 内で関数名の直後の「(」の位置（関数らしくなければ -1） */
function functionParen(tokens: Token[], from: number, to: number): number {
  let depth = 0
  for (let k = from; k < to; k++) {
    const t = tokens[k]
    if (t.type === 'punct') {
      if (t.text === '=' && depth === 0) return -1
      if (t.text === '(' && depth === 0) {
        const prev = tokens[k - 1]
        if (k === from || !prev) return -1
        if (prev.type === 'id' && !NOT_FUNCTION_NAMES.has(prev.text)) return k
        // operator() / operator== / テンプレートの特殊化 f<int>(…)
        if (prev.type === 'punct' && (prev.text === '>' || isOperatorName(tokens, k))) return k
        if (prev.type === 'punct' && prev.text === ')' && isOperatorName(tokens, k)) return k
        return -1
      }
      if (t.text === '(' || t.text === '[' || t.text === '{') depth++
      else if (t.text === ')' || t.text === ']' || t.text === '}') depth--
    }
  }
  return -1
}

function isOperatorName(tokens: Token[], paren: number): boolean {
  for (let k = paren - 1; k >= Math.max(0, paren - 3); k--) {
    if (isId(tokens[k], 'operator')) return true
  }
  return false
}

/** 「(」の直前から関数名を組み立てる（A::B::f / ~A / operator== / f<T>） */
function functionName(tokens: Token[], paren: number, clean: string): string {
  let k = paren - 1
  for (let back = paren - 1; back >= Math.max(0, paren - 3); back--) {
    if (isId(tokens[back], 'operator')) {
      k = back
      break
    }
  }
  let first = k
  if (isP(tokens[first], '>')) {
    // テンプレート引数をさかのぼる
    let depth = 0
    for (let j = first; j >= 0; j--) {
      if (isP(tokens[j], '>')) depth++
      else if (isP(tokens[j], '<')) {
        depth--
        if (depth === 0) {
          first = j - 1
          break
        }
      }
    }
  }
  while (first >= 2 && isP(tokens[first - 1], '::') && tokens[first - 2].type === 'id') first -= 2
  if (first >= 1 && isP(tokens[first - 1], '~')) first -= 1
  return squash(clean.slice(tokens[first].start, tokens[paren - 1].end))
}

/** ソース全体から関数定義（本体のあるもの）を探す */
export function findCppFunctions(src: string): CppFunction[] {
  const clean = stripCppNoise(src)
  const tokens = tokenizeCpp(clean)
  return scanFunctions(tokens, clean, src)
}

function scanFunctions(tokens: Token[], clean: string, src: string): CppFunction[] {
  const found: CppFunction[] = []
  const lineOf = (pos: number): number => src.slice(0, pos).split('\n').length

  const scan = (from: number, to: number, prefix: string): void => {
    let stmtStart = from
    let k = from
    while (k < to) {
      const t = tokens[k]
      if (t.type === 'punct' && t.text === ';') {
        stmtStart = k + 1
        k++
        continue
      }
      // public: / private: / protected:
      if (
        t.type === 'id' &&
        (t.text === 'public' || t.text === 'private' || t.text === 'protected') &&
        isP(tokens[k + 1], ':')
      ) {
        stmtStart = k + 2
        k += 2
        continue
      }
      if (t.type === 'punct' && (t.text === '(' || t.text === '[')) {
        k = matchClose(tokens, k, to) + 1
        continue
      }
      if (t.type !== 'punct' || t.text !== '{') {
        k++
        continue
      }
      const close = matchClose(tokens, k, to)
      const head = tokens.slice(stmtStart, k)
      const headText = head.map((h) => h.text)
      if (headText.includes('namespace') || (headText[0] === 'extern' && head[1]?.type === 'str')) {
        scan(k + 1, close, prefix)
        stmtStart = close + 1
        k = close + 1
        continue
      }
      const paren = functionParen(tokens, stmtStart, k)
      if (paren >= 0 && !headText.includes('enum')) {
        // コンストラクタの初期化子 `: a{1}, b(2) {` の {…} は本体ではない
        const parenClose = matchClose(tokens, paren, k + 1)
        const afterParams = tokens.slice(parenClose + 1, k)
        const hasInitList = afterParams.some((a) => isP(a, ':'))
        const prev = tokens[k - 1]
        if (hasInitList && (prev.type === 'id' || isP(prev, '>'))) {
          k = close + 1
          continue
        }
        const name = functionName(tokens, paren, clean)
        found.push({
          name: prefix && !name.includes('::') ? `${prefix}::${name}` : name,
          line: lineOf(tokens[paren].start),
          open: k,
          close
        })
        stmtStart = close + 1
        k = close + 1
        continue
      }
      const scopeAt = headText.findIndex((h) => SCOPE_KEYWORDS.has(h))
      if (scopeAt >= 0 && !headText.includes('enum')) {
        // class Foo : public Bar { … } の中のメンバー関数も拾う
        const nameTok = head.slice(scopeAt + 1).find((h) => h.type === 'id' && !/^(?:final|alignas)$/.test(h.text))
        const className = nameTok ? nameTok.text : ''
        scan(k + 1, close, className ? (prefix ? `${prefix}::${className}` : className) : prefix)
      }
      stmtStart = close + 1
      k = close + 1
    }
  }

  scan(0, tokens.length, '')
  return found
}

// ---------------------------------------------------------------------------
// 文の解析
// ---------------------------------------------------------------------------

type Stmt =
  | { k: 'simple'; text: string }
  | { k: 'block'; body: Stmt[] }
  | { k: 'if'; cond: string; then: Stmt; else: Stmt | null }
  | { k: 'while'; cond: string; body: Stmt }
  | { k: 'do'; body: Stmt; cond: string }
  | { k: 'for'; init: string; cond: string; inc: string; body: Stmt }
  | { k: 'forRange'; decl: string; range: string; body: Stmt }
  | { k: 'switch'; subject: string; cases: Array<{ labels: string[]; body: Stmt[] }> }
  | { k: 'return'; expr: string }
  | { k: 'throw'; expr: string }
  | { k: 'break' }
  | { k: 'continue' }
  | { k: 'try'; body: Stmt; handlers: Array<{ decl: string; body: Stmt }> }

class StmtParser {
  constructor(
    private readonly tokens: Token[],
    private readonly clean: string
  ) {}

  text(from: number, to: number): string {
    if (to <= from) return ''
    return squash(this.clean.slice(this.tokens[from].start, this.tokens[to - 1].end))
  }

  /** tokens[from, to) を文の並びとして読む */
  block(from: number, to: number): Stmt[] {
    const out: Stmt[] = []
    let k = from
    while (k < to) {
      const [stmt, next] = this.stmt(k, to)
      if (stmt) out.push(stmt)
      k = next
    }
    return out
  }

  /** 次の ; （括弧の外）の位置。無ければ to */
  semicolon(k: number, to: number): number {
    let j = k
    while (j < to) {
      const t = this.tokens[j]
      if (t.type === 'punct') {
        if (t.text === ';') return j
        if (CLOSE_OF[t.text]) {
          j = matchClose(this.tokens, j, to) + 1
          continue
        }
      }
      j++
    }
    return to
  }

  /** ( … ) を読み、中身のテキストと閉じ括弧の次の位置を返す */
  parens(k: number, to: number): [number, number, number] {
    if (!isP(this.tokens[k], '(')) throw new CppConvertError('「(」が必要な所にありません')
    const close = matchClose(this.tokens, k, to)
    return [k + 1, close, close + 1]
  }

  /** 1 文を読む。[文（空文は null）, 次の位置] */
  stmt(k: number, to: number): [Stmt | null, number] {
    const t = this.tokens[k]
    const tokens = this.tokens
    if (isP(t, ';')) return [null, k + 1]
    if (isP(t, '{')) {
      const close = matchClose(tokens, k, to)
      return [{ k: 'block', body: this.block(k + 1, close) }, close + 1]
    }
    if (t.type === 'id') {
      switch (t.text) {
        case 'if': {
          let p = k + 1
          if (isId(tokens[p], 'constexpr') || isId(tokens[p], 'consteval')) p++
          if (isP(tokens[p], '!') && isId(tokens[p + 1], 'consteval')) p += 2
          const [cs, ce, next] = this.parens(p, to)
          // if (init; cond) は条件の部分だけを使う
          const cond = this.text(this.lastSemicolonInside(cs, ce), ce)
          const [thenStmt, afterThen] = this.stmtOrEmpty(next, to)
          if (isId(tokens[afterThen], 'else')) {
            const [elseStmt, afterElse] = this.stmtOrEmpty(afterThen + 1, to)
            return [{ k: 'if', cond, then: thenStmt, else: elseStmt }, afterElse]
          }
          return [{ k: 'if', cond, then: thenStmt, else: null }, afterThen]
        }
        case 'while': {
          const [cs, ce, next] = this.parens(k + 1, to)
          const [body, after] = this.stmtOrEmpty(next, to)
          return [{ k: 'while', cond: this.text(cs, ce), body }, after]
        }
        case 'do': {
          const [body, after] = this.stmtOrEmpty(k + 1, to)
          if (!isId(tokens[after], 'while')) throw new CppConvertError('do に対応する while がありません')
          const [cs, ce, next] = this.parens(after + 1, to)
          const end = isP(tokens[next], ';') ? next + 1 : next
          return [{ k: 'do', body, cond: this.text(cs, ce) }, end]
        }
        case 'for': {
          const [cs, ce, next] = this.parens(k + 1, to)
          const [body, after] = this.stmtOrEmpty(next, to)
          const semis = this.topLevel(cs, ce, ';')
          if (semis.length >= 2) {
            return [
              {
                k: 'for',
                init: this.text(cs, semis[0]),
                cond: this.text(semis[0] + 1, semis[1]),
                inc: this.text(semis[1] + 1, ce),
                body
              },
              after
            ]
          }
          const colon = this.topLevel(cs, ce, ':')
          if (colon.length > 0) {
            const c = colon[colon.length - 1]
            return [{ k: 'forRange', decl: this.text(cs, c), range: this.text(c + 1, ce), body }, after]
          }
          return [{ k: 'for', init: '', cond: this.text(cs, ce), inc: '', body }, after]
        }
        case 'switch': {
          const [cs, ce, next] = this.parens(k + 1, to)
          if (!isP(tokens[next], '{')) {
            const [, after] = this.stmtOrEmpty(next, to)
            return [{ k: 'simple', text: this.text(k, after) }, after]
          }
          const close = matchClose(tokens, next, to)
          return [{ k: 'switch', subject: this.text(cs, ce), cases: this.cases(next + 1, close) }, close + 1]
        }
        case 'return':
        case 'co_return': {
          const end = this.semicolon(k + 1, to)
          return [{ k: 'return', expr: this.text(k + 1, end) }, end + 1]
        }
        case 'throw': {
          const end = this.semicolon(k + 1, to)
          return [{ k: 'throw', expr: this.text(k + 1, end) }, end + 1]
        }
        case 'break':
          return [{ k: 'break' }, this.semicolon(k, to) + 1]
        case 'continue':
          return [{ k: 'continue' }, this.semicolon(k, to) + 1]
        case 'try': {
          if (!isP(tokens[k + 1], '{')) break
          const close = matchClose(tokens, k + 1, to)
          const body: Stmt = { k: 'block', body: this.block(k + 2, close) }
          const handlers: Array<{ decl: string; body: Stmt }> = []
          let p = close + 1
          while (isId(tokens[p], 'catch')) {
            const [ds, de, next] = this.parens(p + 1, to)
            if (!isP(tokens[next], '{')) break
            const hClose = matchClose(tokens, next, to)
            handlers.push({ decl: this.text(ds, de), body: { k: 'block', body: this.block(next + 1, hClose) } })
            p = hClose + 1
          }
          return [{ k: 'try', body, handlers }, p]
        }
        case 'case':
        case 'default': {
          // switch の外に出てきたラベルは読み飛ばす
          const colon = this.topLevel(k, to, ':')[0]
          return [null, colon !== undefined ? colon + 1 : to]
        }
        case 'else':
          // 対応する if の無い else（マクロ等で崩れたとき）は読み飛ばす
          return [null, k + 1]
      }
      // ラベル付き文 `name:`
      if (isP(tokens[k + 1], ':') && !isP(tokens[k + 2], ':')) return [null, k + 2]
    }
    const end = this.semicolon(k, to)
    const text = this.text(k, end)
    return [text ? { k: 'simple', text } : null, end + 1]
  }

  stmtOrEmpty(k: number, to: number): [Stmt, number] {
    if (k >= to) return [{ k: 'block', body: [] }, k]
    const [s, next] = this.stmt(k, to)
    return [s ?? { k: 'block', body: [] }, next]
  }

  /** 括弧の外にある記号 text の位置の一覧 */
  topLevel(from: number, to: number, text: string): number[] {
    const hits: number[] = []
    let j = from
    while (j < to) {
      const t = this.tokens[j]
      if (t.type === 'punct') {
        if (t.text === text) hits.push(j)
        if (CLOSE_OF[t.text]) {
          j = matchClose(this.tokens, j, to) + 1
          continue
        }
      }
      j++
    }
    return hits
  }

  lastSemicolonInside(from: number, to: number): number {
    const semis = this.topLevel(from, to, ';')
    return semis.length > 0 ? semis[semis.length - 1] + 1 : from
  }

  /** switch の本体を case ごとに分ける（中身の無い case は次とまとめる） */
  cases(from: number, to: number): Array<{ labels: string[]; body: Stmt[] }> {
    const groups: Array<{ labels: string[]; body: Stmt[] }> = []
    let current: { labels: string[]; body: Stmt[] } | null = null
    let k = from
    while (k < to) {
      const t = this.tokens[k]
      if (isId(t, 'case') || (isId(t, 'default') && isP(this.tokens[k + 1], ':'))) {
        const colon = this.caseColon(k + 1, to)
        const label = isId(t, 'default') ? '' : this.text(k + 1, colon)
        if (!current || current.body.length > 0) {
          current = { labels: [], body: [] }
          groups.push(current)
        }
        current.labels.push(label)
        k = colon + 1
        continue
      }
      const [stmt, next] = this.stmt(k, to)
      if (stmt) {
        if (!current) {
          current = { labels: [], body: [] }
          groups.push(current)
        }
        current.body.push(stmt)
      }
      k = next
    }
    return groups
  }

  /** case ラベルの「:」（:: や三項演算子の : は飛ばす） */
  caseColon(k: number, to: number): number {
    let ternary = 0
    let j = k
    while (j < to) {
      const t = this.tokens[j]
      if (isP(t, '?')) ternary++
      else if (isP(t, ':')) {
        if (ternary === 0) return j
        ternary--
      } else if (t.type === 'punct' && CLOSE_OF[t.text]) {
        j = matchClose(this.tokens, j, to) + 1
        continue
      }
      j++
    }
    throw new CppConvertError('case ラベルの「:」が見つかりません')
  }
}

// ---------------------------------------------------------------------------
// アクティビティ図テキストへの書き出し
// ---------------------------------------------------------------------------

/** ラベルの最大文字数（長い式は省略する） */
export const MAX_LABEL = 60

/** 空白をまとめ、末尾の ; を落とし、長ければ省略する */
function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function label(s: string): string {
  let t = squash(s).replace(/;+$/, '').trim()
  if (t.length > MAX_LABEL) t = `${t.slice(0, MAX_LABEL - 1)}…`
  return t
}

/** 条件ラベル。if (…) then の解析を崩さないよう、末尾の「)」の後ろに文字を残さない */
function condLabel(s: string): string {
  const t = label(s)
  return t === '' ? '条件' : t
}

type Breakable = 'loop' | 'switch'

class Emitter {
  readonly lines: string[] = []
  private depth = 0
  /** break / continue の行き先（内側が末尾） */
  private readonly breakables: Breakable[] = []

  line(s: string): void {
    this.lines.push(`${'  '.repeat(this.depth)}${s}`)
  }

  action(s: string): void {
    const t = label(s)
    if (t !== '') this.line(`:${t};`)
  }

  /** 文の並びを書く。戻り値は「最後まで流れ着くか」（return 等で終わったら false） */
  stmts(list: Stmt[]): boolean {
    for (const s of list) {
      // return / break などの後ろは到達しないので書かない
      if (!this.stmt(s)) return false
    }
    return true
  }

  indented(fn: () => boolean): boolean {
    this.depth++
    const r = fn()
    this.depth--
    return r
  }

  inLoop(): boolean {
    return this.breakables.includes('loop')
  }

  loopBody(body: Stmt, extra?: () => void): void {
    this.breakables.push('loop')
    this.indented(() => {
      const flows = this.stmt(body)
      if (flows && extra) extra()
      return flows
    })
    this.breakables.pop()
  }

  stmt(s: Stmt): boolean {
    switch (s.k) {
      case 'simple':
        this.action(s.text)
        return true
      case 'block':
        return this.stmts(s.body)
      case 'if': {
        this.line(`if (${condLabel(s.cond)}) then (yes)`)
        const thenFlows = this.indented(() => this.stmt(s.then))
        let elseFlows = true
        if (s.else && !isEmpty(s.else)) {
          this.line('else (no)')
          elseFlows = this.indented(() => this.stmt(s.else!))
        }
        this.line('endif')
        return thenFlows || elseFlows
      }
      case 'while':
        this.line(`while (${condLabel(s.cond)}) is (yes)`)
        this.loopBody(s.body)
        this.line('endwhile (no)')
        return true
      case 'for':
        if (s.init) this.action(s.init)
        this.line(`while (${s.cond ? condLabel(s.cond) : '繰り返す'}) is (yes)`)
        this.loopBody(s.body, () => {
          if (s.inc) this.action(s.inc)
        })
        this.line('endwhile (no)')
        return true
      case 'forRange':
        this.line(`while (${condLabel(`${label(s.range)} の各要素 ${label(s.decl)}`)}) is (次へ)`)
        this.loopBody(s.body)
        this.line('endwhile (完了)')
        return true
      case 'do':
        this.line('repeat')
        this.loopBody(s.body)
        this.line(`repeat while (${condLabel(s.cond)}) is (yes) not (no)`)
        return true
      case 'switch':
        return this.switchStmt(s.subject, s.cases)
      case 'return':
        if (s.expr) this.action(`return ${s.expr}`)
        this.line('stop')
        return false
      case 'throw':
        this.action(s.expr ? `throw ${s.expr}` : 'throw')
        this.line('stop')
        return false
      case 'break': {
        const inner = this.breakables[this.breakables.length - 1]
        // switch の break は「その case の終わり」なので何も書かない
        if (inner === 'loop') {
          this.line('break')
          return false
        }
        return inner !== 'switch'
      }
      case 'continue':
        if (this.inLoop()) {
          this.line('continue')
          return false
        }
        return true
      case 'try': {
        const flows = this.stmt(s.body)
        // 本体が最後まで流れないなら、捕捉の分岐を置いても到達しない
        if (s.handlers.length === 0 || !flows) return flows
        // 例外の捕捉は「起きたら処理する」分岐として後ろに並べる（catch ごとに入れ子）
        s.handlers.forEach((h, i) => {
          if (i > 0) {
            this.line('else (no)')
            this.depth++
          }
          this.line(`if (${condLabel(`例外 ${h.decl}`)}) then (catch)`)
          this.indented(() => this.stmt(h.body))
        })
        for (let i = s.handlers.length - 1; i >= 0; i--) {
          this.line('endif')
          if (i > 0) this.depth--
        }
        return true
      }
    }
  }

  switchStmt(subject: string, cases: Array<{ labels: string[]; body: Stmt[] }>): boolean {
    const normal = cases.filter((c) => !c.labels.includes(''))
    const fallback = cases.find((c) => c.labels.includes(''))
    this.breakables.push('switch')
    let flows = false
    let opened = 0
    normal.forEach((c, i) => {
      const values = c.labels.join(', ')
      if (i > 0) {
        this.line('else (no)')
        this.depth++
      }
      this.line(`if (${condLabel(`${label(subject)} == ${values}`)}) then (yes)`)
      opened++
      flows = this.indented(() => this.stmts(c.body)) || flows
    })
    if (fallback) {
      if (normal.length > 0) {
        this.line('else (no)')
        flows = this.indented(() => this.stmts(fallback.body)) || flows
      } else {
        flows = this.stmts(fallback.body) || flows
      }
    } else {
      flows = true
    }
    for (let i = opened - 1; i >= 0; i--) {
      this.line('endif')
      if (i > 0) this.depth--
    }
    this.breakables.pop()
    return flows || normal.length === 0
  }
}

function isEmpty(s: Stmt): boolean {
  return s.k === 'block' && s.body.every(isEmpty)
}

/**
 * 関数 1 つ分をアクティビティ図テキストにする。
 * functionIndex は findCppFunctions の並びでの番号。
 */
export function cppToActivityText(src: string, functionIndex = 0): string {
  const clean = stripCppNoise(src)
  const tokens = tokenizeCpp(clean)
  const functions = scanFunctions(tokens, clean, src)
  if (functions.length === 0) {
    throw new CppConvertError('関数の定義が見つかりませんでした')
  }
  const fn = functions[Math.min(Math.max(0, functionIndex), functions.length - 1)]
  const parser = new StmtParser(tokens, clean)
  const body = parser.block(fn.open + 1, fn.close)
  const em = new Emitter()
  em.line(`' ${fn.name}（${fn.line} 行目）`)
  em.line('start')
  if (em.stmts(body)) em.line('stop')
  return em.lines.join('\n')
}
