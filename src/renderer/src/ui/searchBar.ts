// 図の検索バー（issue #45）。キャンバスの右上に重ねて出す。
//
// Enter で次、Shift+Enter で前、Esc で閉じる。入力が止まったら先頭の一致へ
// 飛ぶ（打ちながら結果を確かめられるように）。検索そのものは呼び出し側が行い、
// ここは入力と結果表示だけを受け持つ。

export interface SearchBarActions {
  /** 検索語が変わった（先頭の一致から数え直す） */
  onInput: (query: string) => void
  /** 次（1）/ 前（-1）の一致へ */
  onStep: (dir: 1 | -1) => void
  onClose: () => void
}

export interface SearchResult {
  /** 表示中の一致の位置（0 始まり）。一致が無ければ -1 */
  index: number
  total: number
}

export interface SearchBar {
  /** 開いて検索欄にフォーカスし、前回の語を全選択する */
  open(): void
  close(): void
  isOpen(): boolean
  getQuery(): string
  setResult(result: SearchResult | null): void
  /** 一周したときの警告など。空文字で消す */
  setNotice(message: string): void
}

/** 打ち終わりを待つ時間。1 文字ごとに画面が飛ぶと落ち着かない */
const INPUT_DELAY = 150

function iconButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = text
  b.title = title
  b.setAttribute('aria-label', title)
  b.addEventListener('click', onClick)
  return b
}

export function buildSearchBar(host: HTMLElement, actions: SearchBarActions): SearchBar {
  const bar = document.createElement('div')
  bar.className = 'search-bar'
  bar.setAttribute('role', 'search')
  bar.hidden = true

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = '図の中を検索'
  input.setAttribute('aria-label', '図の中を検索')
  input.spellcheck = false

  const count = document.createElement('span')
  count.className = 'search-count'
  count.setAttribute('aria-live', 'polite')

  const notice = document.createElement('div')
  notice.className = 'search-notice'
  notice.setAttribute('role', 'status')

  // ボタンで操作したあとも、続けて Enter を押せるよう検索欄へ戻す
  const refocus = (): void => {
    if (!bar.hidden && document.activeElement !== input) input.focus()
  }

  let timer: number | undefined
  const flushInput = (): boolean => {
    if (timer === undefined) return false
    window.clearTimeout(timer)
    timer = undefined
    actions.onInput(input.value)
    refocus()
    return true
  }

  const step = (dir: 1 | -1): void => {
    // 打ち終わり待ちの語があれば、まずその語の先頭へ（Enter で追い越さない）
    if (!flushInput()) actions.onStep(dir)
    refocus()
  }

  const close = (): void => {
    if (bar.hidden) return
    window.clearTimeout(timer)
    timer = undefined
    bar.hidden = true
    notice.textContent = ''
    actions.onClose()
  }

  input.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = undefined
      actions.onInput(input.value)
      refocus()
    }, INPUT_DELAY)
  })

  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })

  // 入力欄とボタンは 1 行に保つ（キャンバスが狭いときは入力欄の方を縮める）
  const row = document.createElement('div')
  row.className = 'search-row'
  row.append(
    input,
    count,
    iconButton('↑', '前へ (Shift+Enter)', () => step(-1)),
    iconButton('↓', '次へ (Enter)', () => step(1)),
    iconButton('×', '閉じる (Esc)', close)
  )
  bar.append(row, notice)
  host.appendChild(bar)

  return {
    open: () => {
      bar.hidden = false
      input.focus()
      input.select()
    },
    close,
    isOpen: () => !bar.hidden,
    getQuery: () => input.value,
    setResult: (result) => {
      count.classList.toggle('none', result !== null && result.total === 0)
      if (result === null) count.textContent = ''
      else if (result.total === 0) count.textContent = '見つかりません'
      // 今の一致が図の変更で当たらなくなった（次へで先頭から数え直す）
      else if (result.index < 0) count.textContent = `- / ${result.total}`
      else count.textContent = `${result.index + 1} / ${result.total}`
    },
    setNotice: (message) => {
      notice.textContent = message
    }
  }
}
