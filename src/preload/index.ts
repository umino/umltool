import { contextBridge, ipcRenderer } from 'electron'

export type ImageFormat = 'png' | 'jpg' | 'webp'

export interface OpenedProject {
  path: string
  content: string
}

const api = {
  // プロジェクト
  saveProject: (content: string, currentPath: string | null): Promise<string | null> =>
    ipcRenderer.invoke('project:save', content, currentPath),
  saveProjectAs: (content: string, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('project:saveAs', content, defaultName),
  openProject: (): Promise<OpenedProject | null> => ipcRenderer.invoke('project:open'),

  // 画像書き出し
  exportImage: (dataUrl: string, format: ImageFormat, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('image:export', dataUrl, format, defaultName),

  // 確認ダイアログ（window.confirm はフォーカスを壊すため使わない）
  confirmDialog: (message: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', message),

  // 未保存の変更を捨てる操作の前の確認（保存する / 保存しない / キャンセル）
  confirmDiscard: (name: string, action: string): Promise<DiscardChoice> =>
    ipcRenderer.invoke('dialog:confirmDiscard', name, action),

  // 'menu:close-request' を受けて確認が済んだあと、実際にウィンドウを閉じる
  confirmClose: (): void => {
    ipcRenderer.send('window:close-confirmed')
  },

  // フォーカス中のテキスト入力へのネイティブ編集コマンド
  // （編集メニューから、テキスト入力にフォーカスがあるときに使う）
  nativeEdit: (action: NativeEditAction): void => {
    ipcRenderer.send('edit:native', action)
  },

  // メニュー → renderer 通知
  onMenu: (channel: MenuChannel, handler: () => void): (() => void) => {
    const listener = (): void => handler()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

/** 未保存の変更を捨てる操作の前に出す確認の答え */
export type DiscardChoice = 'save' | 'discard' | 'cancel'

export type NativeEditAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'selectAll'

export type MenuChannel =
  | 'menu:new'
  | 'menu:open'
  | 'menu:save'
  | 'menu:save-as'
  | 'menu:export-png'
  | 'menu:export-jpg'
  | 'menu:export-webp'
  | 'menu:undo'
  | 'menu:redo'
  | 'menu:cut'
  | 'menu:copy'
  | 'menu:paste'
  | 'menu:delete'
  | 'menu:select-all'
  | 'menu:find'
  | 'menu:close-request'

export type UmlApi = typeof api

contextBridge.exposeInMainWorld('uml', api)
