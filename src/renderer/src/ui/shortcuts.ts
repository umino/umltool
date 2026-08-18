// ショートカット一覧の定義と描画。
//
// 同じ内容を「部品パレットの下の常設ヘルプ」と「? キーで開くオーバーレイ」の
// 両方で使うため、データと DOM 生成をここに集約する。

import type { ToolbarDiagramType } from './toolbar'

export interface ShortcutRow {
  /** キーの並び。'＋'（全角）と '〜' はキーではなく区切り記号として描く */
  keys: string[]
  label: string
}

export interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

/** 図種別を問わず使えるキー */
export const COMMON_SHORTCUTS: ShortcutGroup = {
  title: '共通',
  rows: [
    { keys: ['?'], label: 'この一覧を開く / 閉じる' },
    { keys: ['Ctrl', '＋', 'N'], label: '新規' },
    { keys: ['Ctrl', '＋', 'O'], label: '開く' },
    { keys: ['Ctrl', '＋', 'S'], label: '保存' },
    { keys: ['Ctrl', '＋', 'Shift', '＋', 'S'], label: '名前を付けて保存' },
    { keys: ['Ctrl', '＋', 'Z'], label: '元に戻す' },
    { keys: ['Ctrl', '＋', 'Y'], label: 'やり直し' },
    { keys: ['Ctrl', '＋', 'X'], label: '切り取り' },
    { keys: ['Ctrl', '＋', 'C'], label: 'コピー' },
    { keys: ['Ctrl', '＋', 'V'], label: '貼り付け' },
    { keys: ['Ctrl', '＋', 'A'], label: 'すべて選択' },
    { keys: ['Delete'], label: '選択を削除' }
  ]
}

/** キーではないが同じ表で案内した方が分かりやすいマウス操作 */
export const MOUSE_SHORTCUTS: ShortcutGroup = {
  title: 'マウス',
  rows: [
    { keys: ['ホイール'], label: 'スクロール' },
    { keys: ['Ctrl', '＋', 'ホイール'], label: 'ズーム（カーソル位置基準）' },
    { keys: ['中ドラッグ'], label: 'パン（空白を左ドラッグでも可）' },
    { keys: ['Shift', '＋', '左ドラッグ'], label: '矩形選択' },
    { keys: ['Ctrl', '＋', 'クリック'], label: '選択に追加 / 解除' },
    { keys: ['ダブルクリック'], label: 'ラベルをその場で編集' }
  ]
}

/** マインドマップ専用のキー */
export const MINDMAP_SHORTCUTS: ShortcutGroup = {
  title: 'マインドマップ',
  rows: [
    { keys: ['↑', '↓'], label: '兄弟トピックへ移動' },
    { keys: ['←', '→'], label: '親 / 子トピックへ移動（枝の向きに追従）' },
    { keys: ['Home'], label: 'ルートへ移動' },
    { keys: ['Ctrl', '＋', '←→↑↓'], label: 'トピックを動かす（Shift 併用で大きく）' },
    { keys: ['Tab'], label: '子トピックを追加' },
    { keys: ['Enter'], label: '兄弟トピックを追加' },
    { keys: ['F2'], label: '名前を編集' },
    { keys: ['Space'], label: '折りたたみ / 展開' },
    { keys: ['Ctrl', '＋', 'X'], label: 'トピックを子ごと切り取り（親から外す）' },
    { keys: ['Ctrl', '＋', 'C'], label: 'トピックを子ごとコピー' },
    { keys: ['Ctrl', '＋', 'V'], label: '選択トピックの子として貼り付け' },
    { keys: ['Esc'], label: '切り取り / コピーを取り消す' },
    { keys: ['1', '〜', '6'], label: '配色を変える' },
    { keys: ['0'], label: '配色を既定（深さの色）に戻す' },
    { keys: ['B'], label: '太字' },
    { keys: ['+', '-'], label: '文字サイズ' }
  ]
}

/** 図種別に応じた一覧（先頭がその図の固有キー） */
export function shortcutGroupsFor(type: ToolbarDiagramType): ShortcutGroup[] {
  const groups: ShortcutGroup[] = []
  if (type === 'mindmap') groups.push(MINDMAP_SHORTCUTS)
  groups.push(COMMON_SHORTCUTS, MOUSE_SHORTCUTS)
  return groups
}

/** キーの並びを <kbd> の列にする */
function renderCombo(keys: string[]): HTMLElement {
  const combo = document.createElement('span')
  combo.className = 'shortcut-combo'
  for (const key of keys) {
    // 区切り記号はキーではないので枠を付けない
    if (key === '＋' || key === '〜') {
      const sep = document.createElement('span')
      sep.className = 'shortcut-sep'
      sep.textContent = key === '＋' ? '+' : '〜'
      combo.appendChild(sep)
      continue
    }
    const kbd = document.createElement('kbd')
    kbd.textContent = key
    combo.appendChild(kbd)
  }
  return combo
}

/** 1 グループ分（見出し + 行）を組み立てる */
export function renderShortcutGroup(group: ShortcutGroup): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'shortcut-group'

  const title = document.createElement('div')
  title.className = 'shortcut-title'
  title.textContent = group.title
  wrap.appendChild(title)

  for (const row of group.rows) {
    const line = document.createElement('div')
    line.className = 'shortcut-row'
    line.appendChild(renderCombo(row.keys))
    const label = document.createElement('span')
    label.className = 'shortcut-label'
    label.textContent = row.label
    line.appendChild(label)
    wrap.appendChild(line)
  }
  return wrap
}
