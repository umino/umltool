// ? キーで開くショートカット一覧。図の上に半透明で重ねる。
//
// 図を見ながら確認できるように背景は透過させ、クリックか Esc / ? / 任意のキーで
// すぐ閉じられるようにする（読み終わったら邪魔にならないことを優先）。

import { renderShortcutGroup, shortcutGroupsFor } from './shortcuts'
import type { ToolbarDiagramType } from './toolbar'

const DIAGRAM_LABEL: Record<ToolbarDiagramType, string> = {
  sequence: 'シーケンス図',
  activity: 'アクティビティ図',
  mindmap: 'マインドマップ'
}

export interface ShortcutOverlayHandle {
  open: (type: ToolbarDiagramType) => void
  close: () => void
  toggle: (type: ToolbarDiagramType) => void
  isOpen: () => boolean
}

export function buildShortcutOverlay(host: HTMLElement): ShortcutOverlayHandle {
  const overlay = document.createElement('div')
  overlay.className = 'shortcut-overlay'
  overlay.hidden = true

  const panel = document.createElement('div')
  panel.className = 'shortcut-panel'
  overlay.appendChild(panel)

  const header = document.createElement('div')
  header.className = 'shortcut-header'
  const title = document.createElement('div')
  title.className = 'shortcut-heading'
  title.textContent = 'ショートカット'
  const subtitle = document.createElement('div')
  subtitle.className = 'shortcut-subtitle'
  header.appendChild(title)
  header.appendChild(subtitle)
  panel.appendChild(header)

  const groups = document.createElement('div')
  groups.className = 'shortcut-groups'
  panel.appendChild(groups)

  const footer = document.createElement('div')
  footer.className = 'shortcut-footer'
  footer.textContent = 'Esc / ? / クリックで閉じる'
  panel.appendChild(footer)

  const close = (): void => {
    overlay.hidden = true
  }

  const open = (type: ToolbarDiagramType): void => {
    subtitle.textContent = DIAGRAM_LABEL[type]
    groups.innerHTML = ''
    for (const group of shortcutGroupsFor(type)) {
      groups.appendChild(renderShortcutGroup(group))
    }
    overlay.hidden = false
  }

  overlay.addEventListener('mousedown', () => close())

  host.appendChild(overlay)

  return {
    open,
    close,
    toggle: (type) => (overlay.hidden ? open(type) : close()),
    isOpen: () => !overlay.hidden
  }
}
