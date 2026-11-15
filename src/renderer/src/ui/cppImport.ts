// C++ のソースからアクティビティ図を作る操作欄（テキストタブの下、アクティビティ図のときだけ表示）。
//
// 変換結果はアクティビティ図のテキストとしてテキスト欄に入れ、そのまま図を生成する。
// テキスト欄に残るので、手で直してから「テキストから図を生成」し直すこともできる。

import { CppConvertError, cppToActivityText, findCppFunctions, type CppFunction } from '../text/cppToActivity'

export interface CppImportHost {
  /** テキスト欄の今の内容（貼り付けた C++ を読むため） */
  getText: () => string
  /** 変換したアクティビティ図テキストをテキスト欄へ入れて図を作る（失敗したら false） */
  applyActivityText: (text: string) => boolean
  showError: (message: string) => void
  showStatus: (message: string) => void
  openCppSource: () => Promise<{ path: string; content: string } | null>
}

export class CppImportPanel {
  private readonly row: HTMLElement
  private readonly select: HTMLSelectElement
  private source = ''
  private sourceName = ''
  private functions: CppFunction[] = []

  constructor(
    parent: HTMLElement,
    before: Element | null,
    private readonly host: CppImportHost
  ) {
    this.row = document.createElement('div')
    this.row.className = 'cpp-row'
    this.row.hidden = true

    const title = document.createElement('div')
    title.className = 'cpp-title'
    title.textContent = 'C++ のコードから作る（おおまかな流れ）'

    const openBtn = document.createElement('button')
    openBtn.type = 'button'
    openBtn.id = 'cpp-open-btn'
    openBtn.textContent = 'C++ ファイルから…'
    openBtn.title = 'C / C++ のソースファイルを開き、関数の処理の流れをアクティビティ図にします'
    openBtn.addEventListener('click', () => void this.openFile())

    const pasteBtn = document.createElement('button')
    pasteBtn.type = 'button'
    pasteBtn.id = 'cpp-paste-btn'
    pasteBtn.textContent = '貼り付けた C++ を変換'
    pasteBtn.title = '上のテキスト欄に貼り付けた C++ のコードをアクティビティ図にします'
    pasteBtn.addEventListener('click', () => this.loadSource(this.host.getText(), '貼り付けたコード'))

    this.select = document.createElement('select')
    this.select.id = 'cpp-func'
    this.select.title = '図にする関数'
    this.select.hidden = true
    this.select.addEventListener('change', () => this.convert(Number(this.select.value)))

    const buttons = document.createElement('div')
    buttons.className = 'cpp-buttons'
    buttons.append(openBtn, pasteBtn)
    this.row.append(title, buttons, this.select)
    parent.insertBefore(this.row, before)
  }

  setVisible(visible: boolean): void {
    this.row.hidden = !visible
  }

  private async openFile(): Promise<void> {
    const opened = await this.host.openCppSource()
    if (!opened) return
    const name = opened.path.replace(/\\/g, '/').split('/').pop() ?? opened.path
    this.loadSource(opened.content, name)
  }

  /** ソースを読み込み、関数を一覧にして 1 つ目の候補を図にする */
  loadSource(source: string, name: string): void {
    try {
      this.functions = findCppFunctions(source)
    } catch (e) {
      this.fail(e)
      return
    }
    if (this.functions.length === 0) {
      this.select.hidden = true
      this.host.showError(`${name} に関数の定義が見つかりませんでした`)
      return
    }
    this.source = source
    this.sourceName = name
    this.select.innerHTML = ''
    this.functions.forEach((fn, i) => {
      const opt = document.createElement('option')
      opt.value = String(i)
      opt.textContent = `${fn.name}（${fn.line} 行目）`
      this.select.appendChild(opt)
    })
    this.select.hidden = this.functions.length < 2
    const first = defaultFunctionIndex(this.functions)
    this.select.value = String(first)
    this.convert(first)
  }

  private convert(index: number): void {
    const fn = this.functions[index]
    if (!fn) return
    let text: string
    try {
      text = cppToActivityText(this.source, index)
    } catch (e) {
      this.fail(e)
      return
    }
    if (!this.host.applyActivityText(text)) return
    const more = this.functions.length > 1 ? `（${this.functions.length} 個の関数から選べます）` : ''
    this.host.showStatus(`${this.sourceName} の ${fn.name} を図にしました${more}`)
  }

  private fail(e: unknown): void {
    const reason = e instanceof CppConvertError ? e.message : (e as Error).message
    this.host.showError(`C++ の読み取りに失敗しました: ${reason}`)
  }
}

/**
 * 最初に図にする関数。中身の無いコンストラクタやアクセサより、処理の多い関数の
 * 方が見たいものである見込みが高いので、本体がいちばん長いものを選ぶ。
 */
export function defaultFunctionIndex(functions: CppFunction[]): number {
  let best = 0
  functions.forEach((fn, i) => {
    if (fn.close - fn.open > functions[best].close - functions[best].open) best = i
  })
  return best
}
