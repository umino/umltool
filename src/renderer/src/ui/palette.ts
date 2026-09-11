// 部品パレット: ツールバーの追加系コントロールをアイコン＋ラベルのタイルで
// フロー配置する。クリックでツールバーのボタンと同じ追加動作を行う。

import type { ActivityNodeKind } from '../editor/constants'
import { MINDMAP_SHORTCUTS, renderShortcutGroup } from './shortcuts'
import type { ToolbarDiagramType } from './toolbar'

export interface PaletteActions {
  addLifeline: () => void
  addExecutionSpec: () => void
  addFragment: () => void
  addNote: () => void
  addConnection: () => void
  addGate: (direction: 'in' | 'out') => void
  addActivityNode: (kind: ActivityNodeKind) => void
  addSwimlane: () => void
  addFrame: () => void
  addText: () => void
  addRootTopic: () => void
  addChildTopic: () => void
  addSiblingTopic: () => void
  toggleCollapse: () => void
  toggleCodeTopic: () => void
}

/** ライフラインに付属するテキストタイル（シーケンス図） */
function textItem(a: PaletteActions): PaletteItem {
  return {
    label: 'テキスト',
    title: '選択中のライフラインに付属テキストを追加（フォント・色・太字は右パネルで設定）',
    icon:
      `<line x1="8" y1="8" x2="36" y2="8" stroke="${C.gray}" stroke-width="1.6"/>` +
      `<line x1="8" y1="15" x2="30" y2="15" stroke="${C.gray}" stroke-width="1.6"/>` +
      `<line x1="8" y1="22" x2="34" y2="22" stroke="${C.gray}" stroke-width="1.6"/>`,
    onClick: a.addText
  }
}

/** 両図種で使える自由配置ノートタイル（左上折りの付箋） */
function noteItem(a: PaletteActions): PaletteItem {
  return {
    label: 'ノート',
    title: 'ノート（左上折りの付箋）を追加。自由に配置できます',
    icon:
      `<path d="M 14 4 H 38 V 26 H 8 V 10 Z" fill="#fffbe6" stroke="#d9b441" stroke-width="1.4"/>` +
      `<path d="M 14 4 V 10 H 8 Z" fill="#f2e4b8" stroke="#d9b441" stroke-width="1.2"/>`,
    onClick: a.addNote
  }
}

export interface PaletteHandle {
  setDiagramType: (type: ToolbarDiagramType) => void
}

interface PaletteItem {
  label: string
  title: string
  /** 44x30 viewBox のアイコン内容（<svg> の中身） */
  icon: string
  onClick: () => void
}

// 図の実際の配色に合わせたアイコン用カラー
const C = {
  stroke: '#1d2330',
  blue: '#2d6cdf',
  blueFill: '#eef2fb',
  orange: '#b7791f',
  tan: '#f8e8c8',
  tanStroke: '#a97b28',
  gray: '#5b6472',
  laneStroke: '#c3c9d4'
} as const

function sequenceItems(a: PaletteActions): PaletteItem[] {
  return [
    {
      label: 'ライフライン',
      title: 'ライフラインを追加',
      icon:
        `<rect x="10" y="2" width="24" height="10" rx="2" fill="${C.blueFill}" stroke="${C.blue}" stroke-width="1.4"/>` +
        `<line x1="22" y1="12" x2="22" y2="28" stroke="${C.gray}" stroke-width="1.2" stroke-dasharray="3 2"/>`,
      onClick: a.addLifeline
    },
    {
      label: '活性化バー',
      title: '選択したライフラインに活性化バーを追加',
      icon:
        `<line x1="22" y1="2" x2="22" y2="28" stroke="${C.gray}" stroke-width="1.2" stroke-dasharray="3 2"/>` +
        `<rect x="19" y="7" width="6" height="16" fill="${C.tan}" stroke="${C.tanStroke}" stroke-width="1.2"/>`,
      onClick: a.addExecutionSpec
    },
    {
      label: 'メッセージ',
      title: '選択中の 2 要素を接続（1 つ選択なら最寄りへ）',
      icon:
        `<line x1="4" y1="15" x2="34" y2="15" stroke="${C.stroke}" stroke-width="1.6"/>` +
        `<path d="M 34 15 L 26 10.5 V 19.5 Z" fill="${C.stroke}"/>`,
      onClick: a.addConnection
    },
    // 図の外を端点にするメッセージ（PlantUML の `[-> A` / `A ->]`）。
    // 相手はライフライン 1 つで決まるので、2 要素を選ばなくても押せる。
    {
      label: '外部から',
      title:
        '図の外から選択中のライフラインへのメッセージを追加（PlantUML の [-> A）。' +
        '選択がなければ一番左のライフラインに付きます',
      icon:
        `<line x1="6" y1="3" x2="6" y2="27" stroke="${C.gray}" stroke-width="2"/>` +
        `<line x1="6" y1="15" x2="38" y2="15" stroke="${C.stroke}" stroke-width="1.6"/>` +
        `<path d="M 38 15 L 30 10.5 V 19.5 Z" fill="${C.stroke}"/>`,
      onClick: () => a.addGate('in')
    },
    {
      label: '外部へ',
      title:
        '選択中のライフラインから図の外へのメッセージを追加（PlantUML の A ->]）。' +
        '選択がなければ一番左のライフラインに付きます',
      icon:
        `<line x1="4" y1="15" x2="34" y2="15" stroke="${C.stroke}" stroke-width="1.6"/>` +
        `<path d="M 34 15 L 26 10.5 V 19.5 Z" fill="${C.stroke}"/>` +
        `<line x1="38" y1="3" x2="38" y2="27" stroke="${C.gray}" stroke-width="2"/>`,
      onClick: () => a.addGate('out')
    },
    {
      label: 'フラグメント',
      title: '複合フラグメント（alt/opt/loop 等）を追加',
      icon:
        `<rect x="4" y="3" width="36" height="24" fill="none" stroke="${C.gray}" stroke-width="1.4"/>` +
        `<path d="M 4 3 H 20 V 8 L 16 11 H 4 Z" fill="${C.blueFill}" stroke="${C.gray}" stroke-width="1.2"/>` +
        `<line x1="4" y1="19" x2="40" y2="19" stroke="${C.gray}" stroke-width="1" stroke-dasharray="3 2"/>`,
      onClick: a.addFragment
    },
    textItem(a),
    noteItem(a)
  ]
}

function activityItems(a: PaletteActions): PaletteItem[] {
  return [
    {
      label: 'アクション',
      title: 'アクションを追加',
      icon: `<rect x="6" y="7" width="32" height="16" rx="7" fill="#ffffff" stroke="${C.blue}" stroke-width="1.4"/>`,
      onClick: () => a.addActivityNode('action')
    },
    {
      label: '分岐',
      title: '分岐（デシジョン）を追加',
      icon: `<path d="M 22 3 L 38 15 L 22 27 L 6 15 Z" fill="#ffffff" stroke="${C.orange}" stroke-width="1.4"/>`,
      onClick: () => a.addActivityNode('decision')
    },
    {
      label: '合流',
      title: '合流（マージ）を追加',
      icon: `<path d="M 22 9 L 30 15 L 22 21 L 14 15 Z" fill="#ffffff" stroke="${C.orange}" stroke-width="1.4"/>`,
      onClick: () => a.addActivityNode('merge')
    },
    {
      label: '開始',
      title: '開始ノードを追加',
      icon: `<circle cx="22" cy="15" r="8" fill="${C.stroke}"/>`,
      onClick: () => a.addActivityNode('initial')
    },
    {
      label: '終了',
      title: '終了ノードを追加',
      icon:
        `<circle cx="22" cy="15" r="9" fill="#ffffff" stroke="${C.stroke}" stroke-width="1.6"/>` +
        `<circle cx="22" cy="15" r="5" fill="${C.stroke}"/>`,
      onClick: () => a.addActivityNode('final')
    },
    {
      label: 'フォーク',
      title: 'フォーク（並行開始バー）を追加',
      icon:
        `<rect x="6" y="12" width="32" height="6" rx="2" fill="${C.stroke}"/>` +
        `<path d="M 22 4 V 12 M 14 18 V 26 M 30 18 V 26" stroke="${C.stroke}" stroke-width="1.4" fill="none"/>`,
      onClick: () => a.addActivityNode('fork')
    },
    {
      label: 'ジョイン',
      title: 'ジョイン（並行合流バー）を追加',
      icon:
        `<rect x="6" y="12" width="32" height="6" rx="2" fill="${C.stroke}"/>` +
        `<path d="M 14 4 V 12 M 30 4 V 12 M 22 18 V 26" stroke="${C.stroke}" stroke-width="1.4" fill="none"/>`,
      onClick: () => a.addActivityNode('join')
    },
    {
      label: 'レーン',
      title: 'スイムレーンを追加',
      icon:
        `<rect x="8" y="3" width="28" height="24" fill="#fafbfe" stroke="${C.laneStroke}" stroke-width="1.4"/>` +
        `<rect x="8" y="3" width="28" height="7" fill="${C.blueFill}" stroke="${C.laneStroke}" stroke-width="1.4"/>`,
      onClick: a.addSwimlane
    },
    {
      label: 'フレーム',
      title: 'フレーム（コンテナ）を追加',
      icon:
        `<rect x="4" y="3" width="36" height="24" rx="2" fill="none" stroke="${C.stroke}" stroke-width="1.4"/>` +
        `<path d="M 4 3 H 20 V 8 L 16 11 H 4 Z" fill="${C.blueFill}" stroke="${C.stroke}" stroke-width="1.2"/>`,
      onClick: a.addFrame
    },
    {
      label: 'フロー',
      title: '選択中の 2 ノードを接続（1 つ選択なら最寄りへ）',
      icon:
        `<path d="M 6 24 H 22 V 8 H 32" fill="none" stroke="${C.stroke}" stroke-width="1.6"/>` +
        `<path d="M 38 8 L 30 3.5 V 12.5 Z" fill="none" stroke="${C.stroke}" stroke-width="1.4"/>`,
      onClick: () => a.addConnection()
    },
    noteItem(a)
  ]
}

function mindmapItems(a: PaletteActions): PaletteItem[] {
  return [
    {
      label: '中心トピック',
      title: '中心トピック（ルート）を追加',
      icon: `<rect x="4" y="6" width="36" height="18" rx="7" fill="${C.blue}" stroke="#1f4ea3" stroke-width="1.4"/>`,
      onClick: a.addRootTopic
    },
    {
      label: '子トピック',
      title: '選択中のトピックの子を追加（Tab）',
      icon:
        `<rect x="2" y="10" width="16" height="11" rx="4" fill="${C.blueFill}" stroke="${C.blue}" stroke-width="1.3"/>` +
        `<path d="M 18 15 C 24 15 24 15 28 15" fill="none" stroke="${C.gray}" stroke-width="1.4"/>` +
        `<rect x="28" y="9" width="14" height="12" rx="4" fill="#ffffff" stroke="${C.gray}" stroke-width="1.3"/>`,
      onClick: a.addChildTopic
    },
    {
      label: '兄弟トピック',
      title: '選択中のトピックと同じ階層に追加（Enter）',
      icon:
        `<rect x="24" y="2" width="18" height="11" rx="4" fill="${C.blueFill}" stroke="${C.blue}" stroke-width="1.3"/>` +
        `<rect x="24" y="17" width="18" height="11" rx="4" fill="#ffffff" stroke="${C.gray}" stroke-width="1.3"/>` +
        `<path d="M 6 15 C 14 15 16 7.5 24 7.5 M 6 15 C 14 15 16 22.5 24 22.5" fill="none" stroke="${C.gray}" stroke-width="1.2"/>`,
      onClick: a.addSiblingTopic
    },
    {
      label: '枝でつなぐ',
      title:
        '離れたトピック同士を親子にする。' +
        '「親にするトピック → 子にするトピック」の順に選んでから押します' +
        '（1 つだけ選んだときは、近くにある親のいないトピックが子になります）',
      icon:
        `<path d="M 6 24 C 16 24 18 8 32 8" fill="none" stroke="${C.gray}" stroke-width="1.8"/>` +
        `<circle cx="6" cy="24" r="3" fill="${C.gray}"/>` +
        `<circle cx="32" cy="8" r="3" fill="${C.gray}"/>`,
      onClick: a.addConnection
    },
    {
      label: '折りたたみ',
      title: '選択中のトピックの子孫を隠す / 表示する（Space）',
      icon:
        `<rect x="4" y="9" width="18" height="12" rx="4" fill="${C.blueFill}" stroke="${C.blue}" stroke-width="1.3"/>` +
        `<circle cx="31" cy="15" r="6" fill="#ffffff" stroke="${C.gray}" stroke-width="1.3"/>` +
        `<path d="M 28 15 H 34" stroke="${C.gray}" stroke-width="1.6"/>`,
      onClick: a.toggleCollapse
    },
    {
      label: 'コード',
      title:
        '選択中のトピックをコード表示に切り替える / 戻す（C）。' +
        '等幅・左揃えで、行頭のインデントを保ちます',
      icon:
        `<rect x="3" y="4" width="38" height="22" rx="3" fill="#f6f8fa" stroke="${C.gray}" stroke-width="1.3"/>` +
        `<path d="M 15 10 L 10 15 L 15 20 M 29 10 L 34 15 L 29 20" fill="none" stroke="${C.blue}" stroke-width="1.6"/>` +
        `<path d="M 24 9 L 20 21" stroke="${C.gray}" stroke-width="1.4"/>`,
      onClick: a.toggleCodeTopic
    },
    noteItem(a)
  ]
}

/**
 * マインドマップのキー一覧。キーボード主体で編集するモードなので、
 * ? キーの一覧を開かなくても割り当てが分かるようパレットの下にも常設する。
 */
function renderKeyHelp(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'palette-keys'
  wrap.appendChild(renderShortcutGroup(MINDMAP_SHORTCUTS))
  const more = document.createElement('div')
  more.className = 'palette-keys-more'
  more.textContent = '? キーで全ショートカットを表示'
  wrap.appendChild(more)
  return wrap
}

/** パレットを構築する */
export function buildPalette(host: HTMLElement, actions: PaletteActions): PaletteHandle {
  const seqGrid = renderGrid(sequenceItems(actions))
  const actGrid = renderGrid(activityItems(actions))
  const mindPane = document.createElement('div')
  mindPane.appendChild(renderGrid(mindmapItems(actions)))
  mindPane.appendChild(renderKeyHelp())
  host.innerHTML = ''
  host.appendChild(seqGrid)
  host.appendChild(actGrid)
  host.appendChild(mindPane)

  const setDiagramType = (type: ToolbarDiagramType): void => {
    seqGrid.style.display = type === 'sequence' ? '' : 'none'
    actGrid.style.display = type === 'activity' ? '' : 'none'
    mindPane.style.display = type === 'mindmap' ? '' : 'none'
  }
  setDiagramType('sequence')

  return { setDiagramType }
}

function renderGrid(items: PaletteItem[]): HTMLElement {
  const grid = document.createElement('div')
  grid.className = 'palette-grid'
  for (const item of items) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'palette-item'
    btn.title = item.title
    btn.addEventListener('click', item.onClick)

    const iconWrap = document.createElement('div')
    iconWrap.className = 'palette-icon'
    iconWrap.innerHTML = `<svg viewBox="0 0 44 30" width="44" height="30" aria-hidden="true">${item.icon}</svg>`

    const label = document.createElement('span')
    label.className = 'palette-label'
    label.textContent = item.label

    btn.appendChild(iconWrap)
    btn.appendChild(label)
    grid.appendChild(btn)
  }
  return grid
}
