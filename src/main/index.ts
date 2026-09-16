import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROJECT_FILTERS = [
  { name: 'UML プロジェクト', extensions: ['umlproj'] },
  { name: 'すべてのファイル', extensions: ['*'] }
]

const IMAGE_FILTERS: Record<string, Electron.FileFilter[]> = {
  png: [{ name: 'PNG 画像', extensions: ['png'] }],
  jpg: [{ name: 'JPEG 画像', extensions: ['jpg', 'jpeg'] }],
  webp: [{ name: 'WebP 画像', extensions: ['webp'] }]
}

let mainWindow: BrowserWindow | null = null
/** renderer が「閉じてよい」と答えたら立てる。close の再入で二重確認しないため */
let allowClose = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'UmlTool',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 未保存のまま閉じられないよう、いったん止めて renderer に確認させる。
  // renderer が 'window:close-confirmed' を返してきたら改めて閉じる。
  mainWindow.on('close', (e) => {
    if (allowClose || process.env['UMLTOOL_DIAG'] || process.env['UMLTOOL_SHOTS']) return
    const wc = mainWindow?.webContents
    // renderer が応答できない状態なら閉じられなくなるので素通しする
    if (!wc || wc.isDestroyed() || wc.isCrashed()) return
    e.preventDefault()
    wc.send('menu:close-request')
  })

  // レンダラのコンソール/クラッシュを main 側へ転送（デバッグ用）
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message}`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.log(`[render-process-gone] ${details.reason}`)
  })

  // 自己診断: UMLTOOL_DIAG=1 のとき図の生成結果を出力して終了
  if (process.env['UMLTOOL_DIAG']) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const r = await mainWindow!.webContents.executeJavaScript(
            'window.__umlDiag ? window.__umlDiag().then(o => JSON.stringify(o)) : JSON.stringify({missing:true})'
          )
          console.log(`[DIAG] ${r}`)
          const png = await mainWindow!.webContents.executeJavaScript(
            'window.__umlExportPng ? window.__umlExportPng() : ""'
          )
          if (typeof png === 'string' && png.startsWith('data:image/png')) {
            const out = join(process.cwd(), 'diag-output.png')
            await writeFile(out, Buffer.from(png.split(',')[1], 'base64'))
            console.log(`[DIAG-PNG] ${out}`)
          }
          // 実入力パイプラインでの完全再現テスト:
          // ノードをマウスでクリック → 入力欄をマウスでクリック → 文字キー入力
          const wc = mainWindow!.webContents
          const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
          const click = (x: number, y: number): void => {
            wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
            wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
          }
          let points = JSON.parse(
            await wc.executeJavaScript(
              'window.__umlGetClickPoints ? window.__umlGetClickPoints() : "{}"'
            )
          )
          if (points.node) {
            click(points.node.x, points.node.y)
            await sleep(200)
            points = JSON.parse(await wc.executeJavaScript('window.__umlGetClickPoints()'))
            if (points.input) {
              click(points.input.x, points.input.y)
              await sleep(200)
              for (const ch of ['a', 'b']) {
                wc.sendInputEvent({ type: 'keyDown', keyCode: ch.toUpperCase() })
                wc.sendInputEvent({ type: 'char', keyCode: ch })
                wc.sendInputEvent({ type: 'keyUp', keyCode: ch.toUpperCase() })
              }
              wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
              wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })
              await sleep(300)
              const typed = await wc.executeJavaScript(
                'window.__umlReadPropsInput ? window.__umlReadPropsInput() : "missing"'
              )
              console.log(`[DIAG-TYPE] mouse-driven result=${typed} (expected value "a")`)
            } else {
              console.log('[DIAG-TYPE] input not found after node click')
            }
          } else {
            console.log(`[DIAG-TYPE] no node point: ${JSON.stringify(points)}`)
          }

          // インライン編集テスト: ダブルクリック → 全選択置換 → Enter で確定
          points = JSON.parse(await wc.executeJavaScript('window.__umlGetClickPoints()'))
          if (points.node) {
            const { x, y } = points.node
            click(x, y)
            wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 2 })
            wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 2 })
            await sleep(300)
            const editorState = await wc.executeJavaScript(
              `(() => { const d = document.querySelector('div[contenteditable]'); ` +
                `return JSON.stringify({ exists: !!d, text: d ? d.innerText : '' }) })()`
            )
            for (const ch of ['x', 'y']) {
              wc.sendInputEvent({ type: 'keyDown', keyCode: ch.toUpperCase() })
              wc.sendInputEvent({ type: 'char', keyCode: ch })
              wc.sendInputEvent({ type: 'keyUp', keyCode: ch.toUpperCase() })
            }
            wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
            wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
            await sleep(200)
            const label = await wc.executeJavaScript(
              'window.__umlFirstNodeLabel ? window.__umlFirstNodeLabel() : "missing"'
            )
            console.log(`[DIAG-EDIT] editor=${editorState} label="${label}" (expected "xy")`)
          }

          const seqPng = await mainWindow!.webContents.executeJavaScript(
            'window.__seqPng ?? ""'
          )
          if (typeof seqPng === 'string' && seqPng.startsWith('data:image/png')) {
            const outSeq = join(process.cwd(), 'diag-output-seq.png')
            await writeFile(outSeq, Buffer.from(seqPng.split(',')[1], 'base64'))
            console.log(`[DIAG-PNG-SEQ] ${outSeq}`)
          }
          const mindmapPng = await mainWindow!.webContents.executeJavaScript(
            'window.__mindmapPng ?? ""'
          )
          if (typeof mindmapPng === 'string' && mindmapPng.startsWith('data:image/png')) {
            const outMm = join(process.cwd(), 'diag-output-mindmap.png')
            await writeFile(outMm, Buffer.from(mindmapPng.split(',')[1], 'base64'))
            console.log(`[DIAG-PNG-MINDMAP] ${outMm}`)
          }
          const codePng = await mainWindow!.webContents.executeJavaScript(
            'window.__codeTopicPng ?? ""'
          )
          if (typeof codePng === 'string' && codePng.startsWith('data:image/png')) {
            const outCode = join(process.cwd(), 'diag-output-code.png')
            await writeFile(outCode, Buffer.from(codePng.split(',')[1], 'base64'))
            console.log(`[DIAG-PNG-CODE] ${outCode}`)
          }
          const linkPng = await mainWindow!.webContents.executeJavaScript(
            'window.__topicLinkPng ?? ""'
          )
          if (typeof linkPng === 'string' && linkPng.startsWith('data:image/png')) {
            const outLink = join(process.cwd(), 'diag-output-link.png')
            await writeFile(outLink, Buffer.from(linkPng.split(',')[1], 'base64'))
            console.log(`[DIAG-PNG-LINK] ${outLink}`)
          }
          const svg = await mainWindow!.webContents.executeJavaScript(
            'window.__umlExportSvg ? window.__umlExportSvg() : ""'
          )
          if (typeof svg === 'string' && svg.length > 0) {
            const outSvg = join(process.cwd(), 'diag-output.svg')
            await writeFile(outSvg, svg, 'utf-8')
            console.log(`[DIAG-SVG] ${outSvg}`)
          }

          // 右パネル（複数選択時の整列欄）のスクリーンショット
          await wc.executeJavaScript(
            'window.__umlShowArrangePanel ? window.__umlShowArrangePanel() : ""'
          )
          await sleep(300)
          const panelShot = await wc.capturePage()
          if (!panelShot.isEmpty()) {
            const outPanel = join(process.cwd(), 'diag-output-panel.png')
            await writeFile(outPanel, panelShot.toPNG())
            console.log(`[DIAG-PANEL] ${outPanel}`)
          }

          // UI 全体のスクリーンショット（部品タブを開いた状態）
          await wc.executeJavaScript('document.getElementById("tab-btn-palette")?.click()')
          await sleep(300)
          const shot = await wc.capturePage()
          if (!shot.isEmpty()) {
            const outUi = join(process.cwd(), 'diag-output-ui.png')
            await writeFile(outUi, shot.toPNG())
            console.log(`[DIAG-UI] ${outUi}`)
          }

          // 左ペインを広げた状態（issue #42）。描画領域が新しい幅へ追従しているか見る
          const widened = await wc.executeJavaScript(
            'window.__umlWidenLeftPane ? window.__umlWidenLeftPane() : ""'
          )
          if (typeof widened === 'string' && widened !== '') {
            await sleep(400)
            const paneShot = await wc.capturePage()
            if (!paneShot.isEmpty()) {
              const outPane = join(process.cwd(), 'diag-output-pane.png')
              await writeFile(outPane, paneShot.toPNG())
              console.log(`[DIAG-PANE] ${outPane} width=${widened}`)
            }
          }

          // 検索バー（issue #45）を開いて一周した状態
          const searched = await wc.executeJavaScript(
            'window.__umlShowSearch ? window.__umlShowSearch("商品") : ""'
          )
          if (typeof searched === 'string' && searched !== '') {
            await sleep(400)
            const searchShot = await wc.capturePage()
            if (!searchShot.isEmpty()) {
              const outSearch = join(process.cwd(), 'diag-output-search.png')
              await writeFile(outSearch, searchShot.toPNG())
              console.log(`[DIAG-SEARCH] ${outSearch}`)
            }
          }
        } catch (err) {
          console.log(`[DIAG-ERROR] ${(err as Error).message}`)
        }
        app.quit()
      }, 2000)
    })
  }

  // README 用のスクリーンショット: UMLTOOL_SHOTS=1 のとき 3 図種を撮って終了。
  // サンプルから作り直した状態を撮るので、図を変えたら撮り直せば README も揃う。
  if (process.env['UMLTOOL_SHOTS']) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        const wc = mainWindow!.webContents
        const wait = (ms: number): Promise<void> =>
          new Promise((resolve) => setTimeout(resolve, ms))
        try {
          const dir = join(process.cwd(), 'docs', 'images')
          await mkdir(dir, { recursive: true })
          // マインドマップは横長・低背なので、縦を詰めないと余白だらけの絵になる
          const height: Record<string, number> = { sequence: 800, activity: 800, mindmap: 600 }
          for (const type of ['sequence', 'activity', 'mindmap']) {
            mainWindow!.setContentSize(1280, height[type] ?? 800)
            await wait(400)
            const done = await wc.executeJavaScript(
              `window.__umlShowcase ? window.__umlShowcase(${JSON.stringify(type)}) : ""`
            )
            await wait(600)
            const shot = await wc.capturePage()
            if (shot.isEmpty()) {
              console.log(`[SHOT-ERROR] ${type}: empty`)
              continue
            }
            const out = join(dir, `${type}.png`)
            await writeFile(out, shot.toPNG())
            console.log(`[SHOT] ${out} (${done})`)
          }
        } catch (err) {
          console.log(`[SHOT-ERROR] ${(err as Error).message}`)
        }
        app.quit()
      }, 2000)
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const send = (channel: string) => () => mainWindow?.webContents.send(channel)
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'ファイル(&F)',
      submenu: [
        { label: '新規', accelerator: 'CmdOrCtrl+N', click: send('menu:new') },
        { label: '開く…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
        { label: '名前を付けて保存…', accelerator: 'CmdOrCtrl+Shift+S', click: send('menu:save-as') },
        { type: 'separator' },
        {
          label: '書き出し',
          submenu: [
            { label: 'PNG…', click: send('menu:export-png') },
            { label: 'JPEG…', click: send('menu:export-jpg') },
            { label: 'WebP…', click: send('menu:export-webp') }
          ]
        },
        { type: 'separator' },
        { role: 'quit', label: '終了' }
      ]
    },
    {
      // renderer 側でフォーカスを見て「テキスト編集」か「図の編集」かに振り分ける。
      // accelerator は表示のみ（registerAccelerator: false）。キー入力自体は
      // ページに届き、テキスト欄は Chromium ネイティブ、図は renderer の
      // keydown ハンドラが処理する。
      label: '編集(&E)',
      submenu: [
        { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: send('menu:undo') },
        { label: 'やり直し', accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: send('menu:redo') },
        { type: 'separator' },
        { label: '切り取り', accelerator: 'CmdOrCtrl+X', registerAccelerator: false, click: send('menu:cut') },
        { label: 'コピー', accelerator: 'CmdOrCtrl+C', registerAccelerator: false, click: send('menu:copy') },
        { label: '貼り付け', accelerator: 'CmdOrCtrl+V', registerAccelerator: false, click: send('menu:paste') },
        { label: '削除', accelerator: 'Delete', registerAccelerator: false, click: send('menu:delete') },
        { type: 'separator' },
        { label: 'すべて選択', accelerator: 'CmdOrCtrl+A', registerAccelerator: false, click: send('menu:select-all') },
        { type: 'separator' },
        { label: '検索…', accelerator: 'CmdOrCtrl+F', registerAccelerator: false, click: send('menu:find') }
      ]
    },
    {
      label: '表示(&V)',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'ズームをリセット' },
        { role: 'zoomIn', label: 'ズームイン' },
        { role: 'zoomOut', label: 'ズームアウト' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全画面表示' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- IPC: 確認ダイアログ ----
// renderer の window.confirm は Electron でフォーカス状態を壊し、以降テキスト入力が
// 効かなくなる既知の不具合があるため、ネイティブダイアログを使う。

// ---- IPC: フォーカス中テキスト入力へのネイティブ編集コマンド ----
// メニュークリック時、renderer がテキスト入力にフォーカスがあると判断した場合に
// 呼ばれる。webContents の編集コマンドはフォーカス中の編集可能要素に作用する。

ipcMain.on('edit:native', (e, action: string) => {
  const wc = e.sender
  switch (action) {
    case 'undo':
      wc.undo()
      break
    case 'redo':
      wc.redo()
      break
    case 'cut':
      wc.cut()
      break
    case 'copy':
      wc.copy()
      break
    case 'paste':
      wc.paste()
      break
    case 'delete':
      wc.delete()
      break
    case 'selectAll':
      wc.selectAll()
      break
  }
})

ipcMain.handle('dialog:confirm', async (_e, message: string) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    buttons: ['OK', 'キャンセル'],
    defaultId: 0,
    cancelId: 1,
    message
  })
  return result.response === 0
})

// 未保存の変更を捨てる操作の前に出す 3 択の確認
const DISCARD_CHOICES = ['save', 'discard', 'cancel'] as const

ipcMain.handle('dialog:confirmDiscard', async (_e, name: string, action: string) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    buttons: ['保存する', '保存しない', 'キャンセル'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: '変更が保存されていません',
    detail: `${name}\n保存せずに${action}と、変更内容は失われます。`
  })
  return DISCARD_CHOICES[result.response] ?? 'cancel'
})

// renderer 側の確認が済んだ（＝閉じてよい）
ipcMain.on('window:close-confirmed', () => {
  allowClose = true
  mainWindow?.close()
})

// ---- IPC: プロジェクト保存/読込 ----

ipcMain.handle('project:save', async (_e, content: string, currentPath: string | null) => {
  let targetPath = currentPath
  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'プロジェクトを保存',
      defaultPath: 'untitled.umlproj',
      filters: PROJECT_FILTERS
    })
    if (result.canceled || !result.filePath) return null
    targetPath = result.filePath
  }
  await writeFile(targetPath, content, 'utf-8')
  return targetPath
})

ipcMain.handle('project:saveAs', async (_e, content: string, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '名前を付けて保存',
    defaultPath: defaultName || 'untitled.umlproj',
    filters: PROJECT_FILTERS
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, content, 'utf-8')
  return result.filePath
})

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'プロジェクトを開く',
    properties: ['openFile'],
    filters: PROJECT_FILTERS
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  const content = await readFile(path, 'utf-8')
  return { path, content }
})

// ---- IPC: 画像書き出し ----

ipcMain.handle(
  'image:export',
  async (_e, dataUrl: string, format: 'png' | 'jpg' | 'webp', defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '画像を書き出し',
      defaultPath: defaultName || `diagram.${format}`,
      filters: IMAGE_FILTERS[format] ?? IMAGE_FILTERS.png
    })
    if (result.canceled || !result.filePath) return null
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    await writeFile(result.filePath, Buffer.from(base64, 'base64'))
    return result.filePath
  }
)

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
