import type { ActivityNodeKind } from '../editor/constants'

export type ToolbarDiagramType = 'sequence' | 'activity'

export interface ToolbarActions {
  newProject: () => void
  open: () => void
  save: () => void
  saveAs: () => void
  setDiagramType: (type: ToolbarDiagramType) => void
  addLifeline: () => void
  addExecutionSpec: () => void
  addFragment: () => void
  addConnection: () => void
  addActivityNode: (kind: ActivityNodeKind) => void
  addSwimlane: () => void
  deleteSelection: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  fit: () => void
  exportImage: (format: 'png' | 'jpg' | 'webp') => void
}

export interface ToolbarHandle {
  /** 図種別に応じて「追加」グループの表示とセレクトの値を切り替える */
  setDiagramType: (type: ToolbarDiagramType) => void
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.title = title
  b.addEventListener('click', onClick)
  return b
}

function group(...children: HTMLElement[]): HTMLElement {
  const g = document.createElement('div')
  g.className = 'group'
  for (const c of children) g.appendChild(c)
  return g
}

function label(text: string): HTMLElement {
  const s = document.createElement('span')
  s.className = 'label'
  s.textContent = text
  return s
}

/** ツールバーを構築する */
export function buildToolbar(host: HTMLElement, actions: ToolbarActions): ToolbarHandle {
  host.innerHTML = ''
  host.appendChild(
    group(
      button('新規', '新規プロジェクト (Ctrl+N)', actions.newProject),
      button('開く', 'プロジェクトを開く (Ctrl+O)', actions.open),
      button('保存', '保存 (Ctrl+S)', actions.save),
      button('名前を付けて保存', '名前を付けて保存 (Ctrl+Shift+S)', actions.saveAs)
    )
  )

  // 図種別セレクト
  const typeSelect = document.createElement('select')
  for (const [value, text] of [
    ['sequence', 'シーケンス図'],
    ['activity', 'アクティビティ図']
  ] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = text
    typeSelect.appendChild(opt)
  }
  typeSelect.addEventListener('change', () =>
    actions.setDiagramType(typeSelect.value as ToolbarDiagramType)
  )
  host.appendChild(group(label('図:'), typeSelect))

  const connectTitle =
    '選択中の 2 要素を接続（1 つ選択なら最寄りへ、Shift+クリックで複数選択）'
  const seqGroup = group(
    label('追加:'),
    button('＋ライフライン', 'ライフラインを追加', actions.addLifeline),
    button(
      '＋活性化バー',
      '選択したライフラインに活性化バー（実行仕様）を追加',
      actions.addExecutionSpec
    ),
    button('＋メッセージ', connectTitle, actions.addConnection),
    button(
      '＋フラグメント',
      '複合フラグメント（alt/opt/loop 等）を追加。種別は右パネルで変更',
      actions.addFragment
    )
  )
  host.appendChild(seqGroup)

  const actGroup = group(
    label('追加:'),
    button('＋アクション', 'アクションを追加', () => actions.addActivityNode('action')),
    button('＋分岐', '分岐（デシジョン）を追加', () => actions.addActivityNode('decision')),
    button('＋合流', '合流（マージ）を追加', () => actions.addActivityNode('merge')),
    button('＋開始', '開始ノードを追加', () => actions.addActivityNode('initial')),
    button('＋終了', '終了ノードを追加', () => actions.addActivityNode('final')),
    button('＋フォーク', 'フォーク（並行開始バー）を追加', () => actions.addActivityNode('fork')),
    button('＋ジョイン', 'ジョイン（並行合流バー）を追加', () => actions.addActivityNode('join')),
    button('＋レーン', 'スイムレーンを追加', actions.addSwimlane),
    button('＋フロー', connectTitle, actions.addConnection)
  )
  host.appendChild(actGroup)

  host.appendChild(group(button('🗑 削除', '選択を削除 (Delete)', actions.deleteSelection)))

  host.appendChild(
    group(
      label('表示:'),
      button('－', 'ズームアウト', actions.zoomOut),
      button('100%', '実寸', actions.zoomReset),
      button('＋', 'ズームイン', actions.zoomIn),
      button('全体', '全体表示', actions.fit)
    )
  )
  host.appendChild(
    group(
      label('書き出し:'),
      button('PNG', 'PNG で書き出し', () => actions.exportImage('png')),
      button('JPG', 'JPEG で書き出し', () => actions.exportImage('jpg')),
      button('WebP', 'WebP で書き出し', () => actions.exportImage('webp'))
    )
  )

  const setDiagramType = (type: ToolbarDiagramType): void => {
    typeSelect.value = type
    seqGroup.style.display = type === 'sequence' ? '' : 'none'
    actGroup.style.display = type === 'activity' ? '' : 'none'
  }
  setDiagramType('sequence')

  return { setDiagramType }
}
