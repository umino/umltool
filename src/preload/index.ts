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

export type UmlApi = typeof api

contextBridge.exposeInMainWorld('uml', api)
