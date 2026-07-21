import './styles.css'
import type { Node } from '@antv/x6'
import { GraphEditor } from './editor/GraphEditor'
import {
  addActivation,
  addAttachedText,
  addFragment,
  addFragmentDivider,
  addLifeline,
  addMessage,
  nextMessageY
} from './editor/sequence'
import { addActivityNode, addFlow, addFrame, addSwimlane } from './editor/activity'
import { addNoteNode } from './editor/note'
import { resolveConnectionEndpoints } from './editor/connect'
import { getCellKind } from './editor/shapes'
import {
  ACTIVATION,
  ACTIVITY,
  FRAGMENT,
  FRAME,
  LIFELINE,
  MESSAGE,
  NOTE,
  SHAPE,
  TEXT,
  type ActivityNodeKind
} from './editor/constants'
import { PropertiesPanel } from './ui/properties'
import { buildToolbar, type ToolbarHandle } from './ui/toolbar'
import { buildPalette, type PaletteHandle } from './ui/palette'
import { buildSequenceFromText } from './text/buildSequence'
import { buildActivityFromText } from './text/buildActivity'
import { ParseError } from './text/sequenceParser'
import { loadProject, serializeProject, type DiagramType } from './diagram/serialize'
import { exportGraphToDataUrl, exportGraphToSvg, type ImageFormat } from './export/raster'

const SAMPLE_SEQUENCE = `participant ユーザー
participant "Web ブラウザ" as ブラウザ
participant サーバー

ユーザー -> ブラウザ : URLを入力
ブラウザ -> サーバー : HTTPリクエスト
activate サーバー
alt 認証OK
  サーバー -> サーバー : セッション発行
  サーバー --> ブラウザ : HTMLを返す
else 認証NG
  サーバー --> ブラウザ : エラーページ
end
deactivate サーバー
ブラウザ --> ユーザー : ページを表示`

const SAMPLE_ACTIVITY = `start
:注文を受け付ける;
if (在庫あり?) then (yes)
  :商品を引き当てる;
else (no)
  :取り寄せを手配する;
endif
fork
  :請求書を発行する;
fork again
  :商品を発送する;
end fork
:注文を完了する;
stop`

class AppController {
  private readonly editor: GraphEditor
  private readonly toolbar: ToolbarHandle
  private readonly palette: PaletteHandle
  private currentPath: string | null = null
  private dirty = false
  private diagramType: DiagramType = 'sequence'

  private readonly statusEl = document.getElementById('statusbar') as HTMLElement
  private readonly textInput = document.getElementById('text-input') as HTMLTextAreaElement
  private readonly textError = document.getElementById('text-error') as HTMLElement

  constructor() {
    const container = document.getElementById('graph-container') as HTMLElement
    this.editor = new GraphEditor(container)

    this.textInput.value = SAMPLE_SEQUENCE

    new PropertiesPanel(this.editor, document.getElementById('props-body') as HTMLElement)

    this.toolbar = buildToolbar(document.getElementById('toolbar') as HTMLElement, {
      newProject: () => this.newProject(),
      open: () => this.open(),
      save: () => this.save(),
      saveAs: () => this.saveAs(),
      setDiagramType: (t) => void this.switchDiagramType(t),
      deleteSelection: () => this.editor.deleteSelection(),
      zoomIn: () => this.editor.zoomIn(),
      zoomOut: () => this.editor.zoomOut(),
      zoomReset: () => this.editor.zoomActual(),
      fit: () => this.editor.fit(),
      exportImage: (f) => this.exportImage(f)
    })

    this.palette = buildPalette(document.getElementById('palette-body') as HTMLElement, {
      addLifeline: () => this.addLifeline(),
      addExecutionSpec: () => this.addExecutionSpec(),
      addFragment: () => this.addFragment(),
      addConnection: () => this.addConnection(),
      addActivityNode: (kind) => this.addActivityNode(kind),
      addSwimlane: () => this.addSwimlane(),
      addFrame: () => this.addActivityFrame(),
      addText: () => this.addText(),
      addNote: () => this.addNote()
    })
    this.bindSideTabs()

    this.editor.onModelChange(() => this.setDirty(true))

    this.bindMenu()
    this.bindKeys()

    document.getElementById('generate-btn')?.addEventListener('click', () => this.generate())

    // 初期表示としてサンプルを描画
    this.generate()
    this.setDirty(false)
    this.updateStatus()

    this.exposeDiagnostics()
  }

  /** 自動検証用フック（main の UMLTOOL_DIAG から呼ばれる） */
  private exposeDiagnostics(): void {
    ;(window as unknown as Record<string, unknown>).__umlDiag = async () => {
      const graph = this.editor.graph
      const vertices = graph.getNodes().length
      const edges = graph.getEdges().length
      const exports: Record<string, string> = {}
      for (const fmt of ['png', 'jpg', 'webp'] as const) {
        try {
          const url = await exportGraphToDataUrl(graph, fmt, { pixelRatio: 1 })
          const mime = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`
          exports[fmt] = url.startsWith(`data:${mime}`)
            ? `ok(${url.length})`
            : `wrong-mime(${url.slice(0, 24)})`
        } catch (e) {
          exports[fmt] = `error: ${(e as Error).message}`
        }
      }

      // 挙動検証: ライフライン移動でメッセージ vertex が中点へ再正規化されるか /
      // 実行仕様が中心線に拘束されるか
      const behavior: Record<string, string> = {}
      try {
        const lifelines = graph.getNodes().filter((n) => getCellKind(n) === 'lifeline')
        const messages = graph.getEdges().filter(
          (e) => getCellKind(e) !== 'unknown' && e.getSourceCellId() !== e.getTargetCellId()
        )
        if (lifelines.length >= 2 && messages.length > 0) {
          const target = lifelines[1]
          const edge = messages.find(
            (e) => e.getSourceCellId() === target.id || e.getTargetCellId() === target.id
          )
          if (edge) {
            const before = edge.getVertices()[0]?.x ?? NaN
            target.translate(80, 0)
            const after = edge.getVertices()[0]?.x ?? NaN
            behavior['moveRenormalize'] =
              Math.abs(after - before - 40) < 1 ? 'ok' : `ng(before=${before}, after=${after})`
            target.translate(-80, 0)
          }
        }

        const host = lifelines[0]
        if (host) {
          const act = addActivation(graph, host, host.getBBox().y + 120, 80)
          const cx = host.getBBox().x + host.getBBox().width / 2
          act.setPosition(act.getPosition().x + 55, act.getPosition().y)
          const actualCx = act.getBBox().x + act.getBBox().width / 2
          behavior['activationClamp'] =
            Math.abs(actualCx - cx) < 1 ? 'ok' : `ng(cx=${cx}, actual=${actualCx})`

          // 横幅リサイズが維持され、中心線に再センタリングされるか
          act.resize(24, act.getSize().height)
          const rs = act.getSize()
          const rcx = act.getBBox().x + rs.width / 2
          behavior['activationResize'] =
            rs.width === 24 && Math.abs(rcx - cx) < 1 ? 'ok' : `ng(w=${rs.width}, cx=${rcx})`
          graph.removeCells([act])
        }
        // ＋メッセージの接続先解決（0 選択 / 1 選択 / 2 選択）
        const byX = [...lifelines].sort((a, b) => a.getBBox().x - b.getBBox().x)
        if (byX.length >= 3) {
          graph.cleanSelection()
          const r0 = resolveConnectionEndpoints(graph, 'sequence')
          const ok0 =
            'source' in r0 && r0.source.id === byX[0].id && r0.target.id === byX[1].id

          graph.resetSelection(byX[1])
          const r1 = resolveConnectionEndpoints(graph, 'sequence')
          const ok1 = 'source' in r1 && r1.source.id === byX[1].id && r1.target.id !== byX[1].id

          graph.resetSelection([byX[2], byX[0]])
          const r2 = resolveConnectionEndpoints(graph, 'sequence')
          const ok2 =
            'source' in r2 && r2.source.id === byX[2].id && r2.target.id === byX[0].id

          behavior['connectResolve'] =
            ok0 && ok1 && ok2 ? 'ok' : `ng(0sel=${ok0}, 1sel=${ok1}, 2sel=${ok2})`
          graph.cleanSelection()
        }
        // コピー＆貼り付け（編集メニュー相当の経路）
        if (byX.length >= 1) {
          const before = graph.getNodes().length
          graph.resetSelection(byX[0])
          this.editor.copySelection()
          const pasted = this.editor.pasteClipboard()
          const after = graph.getNodes().length
          behavior['copyPaste'] =
            pasted.length >= 1 && after > before && graph.getSelectedCells().length >= 1
              ? 'ok'
              : `ng(pasted=${pasted.length}, before=${before}, after=${after})`
          graph.removeCells(pasted)
          graph.cleanSelection()
        }
        // 初期サンプル（as / activate 入り）が正しく生成されているか
        const activations = graph.getNodes().filter((n) => getCellKind(n) === 'activation')
        behavior['dslActivation'] = activations.length >= 1 ? 'ok' : 'ng(no activation)'
        const labels = graph
          .getNodes()
          .filter((n) => getCellKind(n) === 'lifeline')
          .map((n) => {
            const v = n.attr('label/text')
            return typeof v === 'string' ? v : ''
          })
        behavior['dslAsAlias'] = labels.includes('Web ブラウザ')
          ? 'ok'
          : `ng(${labels.join(',')})`

        // 付属テキスト: ライフラインへ付属（子＋破線コネクタ）・移動追従・削除で連動
        if (byX.length >= 1) {
          const ll = byX[0]
          const at = addAttachedText(graph, ll, 'メモ', {
            x: ll.getBBox().x + 200,
            y: ll.getBBox().y + 120,
            width: 160
          })
          await new Promise((r) => setTimeout(r, 30))
          const isChild = at.getParent()?.id === ll.id
          const link = graph
            .getEdges()
            .find((e) => getCellKind(e) === 'attachLink' && e.getSourceCellId() === at.id)
          // ライフライン移動で付属テキストが追従するか
          const ny0 = at.getBBox().y
          ll.translate(0, 40)
          await new Promise((r) => setTimeout(r, 30))
          const followed = Math.abs(at.getBBox().y - (ny0 + 40)) < 2
          ll.translate(0, -40)
          // 削除で付属テキストと破線コネクタが一緒に消えるか
          const linkId = link?.id
          graph.resetSelection(at)
          this.editor.deleteSelection()
          const gone = !graph.getCellById(at.id) && !!linkId && !graph.getCellById(linkId)
          behavior['attachedText'] =
            isChild && !!link && followed && gone
              ? 'ok'
              : `ng(child=${isChild}, link=${!!link}, followed=${followed}, gone=${gone})`
          graph.cleanSelection()
        }
      } catch (e) {
        behavior['error'] = (e as Error).message
      }

      // プロパティパネルの入力欄の挙動検証
      const props: Record<string, unknown> = {}
      try {
        const ll = graph.getNodes().find((n) => getCellKind(n) === 'lifeline')
        if (ll) {
          graph.resetSelection(ll)
          await new Promise((r) => setTimeout(r, 50))
          const input = document.querySelector('#props-body textarea') as HTMLTextAreaElement | null
          props['inputExists'] = input !== null
          if (input) {
            // 入力欄クリック相当のイベントで選択が解除されたりパネルが
            // 作り直されたりしないか
            input.dispatchEvent(
              new MouseEvent('mousedown', { bubbles: true, cancelable: true })
            )
            input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
            input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 50))
            props['selectedAfterClick'] = graph.getSelectedCells().length
            props['inputStillInDom'] = input.isConnected
            input.focus()
            props['focused'] = document.activeElement === input
            // 文字キー・削除キーの keydown / beforeinput が誰かに
            // preventDefault されていないか
            const kdA = new KeyboardEvent('keydown', {
              key: 'a',
              bubbles: true,
              cancelable: true
            })
            input.dispatchEvent(kdA)
            props['charKeydownPrevented'] = kdA.defaultPrevented
            const kdBs = new KeyboardEvent('keydown', {
              key: 'Backspace',
              bubbles: true,
              cancelable: true
            })
            input.dispatchEvent(kdBs)
            props['bsKeydownPrevented'] = kdBs.defaultPrevented
            const bi = new InputEvent('beforeinput', {
              data: 'a',
              bubbles: true,
              cancelable: true
            })
            input.dispatchEvent(bi)
            props['beforeinputPrevented'] = bi.defaultPrevented
          }
          graph.cleanSelection()
        }
      } catch (e) {
        props['error'] = (e as Error).message
      }

      // ラベル編集コミットの検証（パネルの change ハンドラと同じ経路）
      try {
        const ll = graph.getNodes().find((n) => getCellKind(n) === 'lifeline')
        if (ll) {
          const { setNodeLabel, getNodeLabel } = await import('./editor/shapes')
          setNodeLabel(ll, '編集テスト')
          await new Promise((r) => setTimeout(r, 50))
          const dom = document.querySelector(`[data-cell-id="${ll.id}"] text`)
          props['nodeLabelCommit'] =
            getNodeLabel(ll) === '編集テスト' && dom?.textContent === '編集テスト'
              ? 'ok'
              : `ng(model=${getNodeLabel(ll)}, dom=${dom?.textContent})`
        }
        const msg = graph.getEdges().find((e) => getCellKind(e) === 'message')
        if (msg) {
          const { setMessageLabel, getMessageLabel } = await import('./editor/shapes')
          setMessageLabel(msg, 'ラベル変更')
          await new Promise((r) => setTimeout(r, 50))
          const dom = document.querySelector(`[data-cell-id="${msg.id}"] .x6-edge-label text`)
          props['edgeLabelCommit'] =
            getMessageLabel(msg) === 'ラベル変更' && dom?.textContent === 'ラベル変更'
              ? 'ok'
              : `ng(model=${getMessageLabel(msg)}, dom=${dom?.textContent})`
        }
      } catch (e) {
        props['labelCommitError'] = (e as Error).message
      }

      // シーケンス図の見た目確認用（main が diag-output-seq.png に書く）
      try {
        ;(window as unknown as Record<string, unknown>).__seqPng = await exportGraphToDataUrl(
          graph,
          'png',
          { pixelRatio: 2 }
        )
      } catch {
        /* 診断用のため失敗は無視 */
      }

      // 保存→読込ラウンドトリップ検証
      let roundtripVertices = -1
      let roundtripEdges = -1
      let roundtripError = ''
      try {
        const saved = serializeProject(this.editor, this.diagramType)
        loadProject(this.editor, saved)
        roundtripVertices = graph.getNodes().length
        roundtripEdges = graph.getEdges().length
      } catch (e) {
        roundtripError = (e as Error).message
      }

      // フラグメントの検証（サンプル DSL の alt/else。roundtrip 後のグラフに対して）
      const fragment: Record<string, unknown> = {}
      try {
        const frag = graph.getNodes().find((n) => getCellKind(n) === 'fragment')
        const divs = (frag?.getChildren() ?? []).filter((c) => getCellKind(c) === 'divider')
        fragment['roundtrip'] = frag ? 'ok' : 'ng(no fragment after roundtrip)'
        fragment['dividers'] = divs.length === 1 ? 'ok' : `ng(${divs.length})`
        if (frag) {
          // 枠がメッセージ帯を覆っているか（alt 内の 3 本の vertex y が枠内）
          const fb = frag.getBBox()
          const inner = graph
            .getEdges()
            .flatMap((e) => e.getVertices())
            .filter((v) => v.y > fb.y && v.y < fb.y + fb.height)
          fragment['covers'] = inner.length >= 3 ? 'ok' : `ng(${inner.length})`
          // フラグメント削除（アプリの削除経路）で区切り線も一緒に消えるか
          const divId = divs[0]?.id
          graph.resetSelection(frag)
          this.editor.deleteSelection()
          fragment['removeWithChildren'] =
            divId && !graph.getCellById(divId) ? 'ok' : 'ng(divider remains)'
        }
      } catch (e) {
        fragment['error'] = (e as Error).message
      }

      // アクティビティ図: 生成・書き出し・ラウンドトリップ検証
      // （最後に実行し、DIAG-PNG にアクティビティ図が写るようにする）
      const activity: Record<string, unknown> = {}
      try {
        this.applyDiagramType('activity')
        buildActivityFromText(this.editor, SAMPLE_ACTIVITY)
        activity['vertices'] = graph.getNodes().length
        activity['edges'] = graph.getEdges().length
        const url = await exportGraphToDataUrl(graph, 'png', { pixelRatio: 1 })
        activity['png'] = url.startsWith('data:image/png') ? `ok(${url.length})` : 'wrong-mime'
        const saved = serializeProject(this.editor, 'activity')
        activity['roundtripType'] = loadProject(this.editor, saved)
        activity['roundtripVertices'] = graph.getNodes().length
        activity['roundtripEdges'] = graph.getEdges().length
        // DOM に実際に描画されているか（ビュー数と最初のノードの断片）
        await new Promise((r) => setTimeout(r, 300))
        const views = document.querySelectorAll('[data-cell-id]')
        activity['domViews'] = views.length
        activity['domSample'] = (views[0]?.outerHTML ?? '').slice(0, 200)

        // endif の合流が merge ノード（分岐より小さい菱形）になっているか
        {
          const merges = graph.getNodes().filter((n) => getCellKind(n) === 'merge')
          const ms = merges[0]?.getSize()
          activity['mergeNode'] =
            merges.length >= 1 && ms && ms.width < ACTIVITY.decision.width
              ? `ok(${merges.length}, ${ms.width}x${ms.height})`
              : `ng(count=${merges.length})`
        }

        // フレーム: 追加・ヘッダ変更（タブ幅追従）・リサイズ・削除
        {
          const fr = addFrame(graph, 'フレーム', { x: 600, y: 500, width: 300, height: 200 })
          const tabD1 = String(fr.attr('tab/d'))
          const { applyFrameHeader, getNodeLabel } = await import('./editor/shapes')
          applyFrameHeader(fr, '長いヘッダテキストのフレーム')
          const tabD2 = String(fr.attr('tab/d'))
          fr.resize(500, 260)
          await new Promise((r) => setTimeout(r, 50))
          const label = getNodeLabel(fr)
          activity['frame'] =
            getCellKind(fr) === 'frame' &&
            label === '長いヘッダテキストのフレーム' &&
            tabD1 !== tabD2 &&
            fr.getSize().width === 500
              ? 'ok'
              : `ng(label=${label}, tabChanged=${tabD1 !== tabD2}, w=${fr.getSize().width})`
          graph.removeCells([fr])
        }

        // ノート: 自由配置・幅リサイズで高さ追従・スタイル設定
        {
          const t = addNoteNode(graph, '折り返しの確認のための長めのノートです', {
            x: 600,
            y: 800,
            width: 120
          })
          await new Promise((r) => setTimeout(r, 30))
          const h1 = t.getSize().height
          t.resize(300, t.getSize().height)
          await new Promise((r) => setTimeout(r, 30))
          const h2 = t.getSize().height
          const { setTextFontSize, setTextBold, setTextColor, getTextBold, getTextColor } =
            await import('./editor/shapes')
          const { fitTextHeight } = await import('./editor/autosize')
          setTextFontSize(t, 20)
          setTextBold(t, true)
          setTextColor(t, '#cc0000')
          fitTextHeight(t)
          await new Promise((r) => setTimeout(r, 30))
          activity['note'] =
            getCellKind(t) === 'note' &&
            h1 > h2 &&
            getTextBold(t) &&
            getTextColor(t) === '#cc0000'
              ? 'ok'
              : `ng(h1=${h1}, h2=${h2}, bold=${getTextBold(t)}, color=${getTextColor(t)})`
          graph.removeCells([t])
        }

        // 部品パレット: アクティビティ用タイルのクリックでノードが追加されるか
        {
          const grids = document.querySelectorAll('#palette-body .palette-grid')
          const items = grids[1]?.querySelectorAll('.palette-item') ?? []
          const before = graph.getNodes().length
          const tile = [...items].find((b) => b.textContent?.includes('アクション'))
          ;(tile as HTMLButtonElement | undefined)?.click()
          const nodes = graph.getNodes()
          activity['palette'] =
            items.length === 11 && nodes.length === before + 1
              ? 'ok'
              : `ng(items=${items.length}, before=${before}, after=${nodes.length})`
          if (nodes.length === before + 1) graph.removeCells([nodes[nodes.length - 1]])
        }

        // ポート接続（対話ドラッグでポートに落とした場合と同じターミナル形）が
        // ノード中心ではなく辺上に付くか
        try {
          const a1 = addActivityNode(graph, 'action', 'P1', { centerX: 700, centerY: 100 })
          const a2 = addActivityNode(graph, 'action', 'P2', { centerX: 700, centerY: 320 })
          const e = graph.addEdge({
            shape: SHAPE.flow,
            source: { cell: a1.id, port: 'bottom' },
            target: { cell: a2.id, port: 'top' },
            data: { kind: 'flow' }
          })
          await new Promise((r) => setTimeout(r, 100))
          const ev = graph.findViewByCell(e) as unknown as {
            targetPoint?: { x: number; y: number }
            targetAnchor?: { x: number; y: number }
          } | null
          const tp = ev?.targetPoint ?? ev?.targetAnchor
          const topY = a2.getBBox().y
          activity['portAnchor'] =
            tp && Math.abs(tp.y - topY) < 2
              ? 'ok'
              : `ng(expected y=${topY}, got ${JSON.stringify(tp)})`
          // アクティビティの＋フロー接続先解決（0 選択はエラー案内 / 2 選択でペア）
          graph.cleanSelection()
          const r0 = resolveConnectionEndpoints(graph, 'activity')
          graph.resetSelection([a2, a1])
          const r2 = resolveConnectionEndpoints(graph, 'activity')
          activity['connectResolve'] =
            'error' in r0 && 'source' in r2 && r2.source.id === a2.id && r2.target.id === a1.id
              ? 'ok'
              : `ng(r0=${JSON.stringify('error' in r0)}, r2=${'source' in r2})`
          graph.cleanSelection()
          graph.removeCells([a1, a2, e])

          // 長いラベルの自動リサイズ（幅拡張→上限→折返しで高さ拡張）
          const long = addActivityNode(
            graph,
            'action',
            'とても長いアクション名でノードの幅と高さが自動調整されることを確認する',
            { centerX: 900, centerY: 100 }
          )
          const ls = long.getSize()
          activity['autoSize'] =
            ls.width > ACTIVITY.action.width && ls.width <= 320 && ls.height > ACTIVITY.action.height
              ? `ok(${ls.width}x${ls.height})`
              : `ng(${ls.width}x${ls.height})`
          graph.removeCells([long])

          // 手動リサイズ: 全アクティビティ種別でハンドルが出て、印を付けると
          // ラベル編集で自動リサイズに戻されないこと
          {
            const { isManuallySized, markManuallySized, clearManualSize, autoSizeNode } =
              await import('./editor/autosize')
            const kinds: ActivityNodeKind[] = [
              'action',
              'decision',
              'merge',
              'initial',
              'final',
              'fork',
              'join'
            ]
            // 種別ごとにリサイズハンドル（Transform ウィジェット）が出るか
            const notResizable: string[] = []
            for (const kind of kinds) {
              const n = addActivityNode(graph, kind, 'x', { centerX: 1200, centerY: 100 })
              graph.clearTransformWidgets()
              graph.createTransformWidget(n)
              if (!document.querySelector('.x6-widget-transform')) notResizable.push(kind)
              graph.clearTransformWidgets()
              graph.removeCells([n])
            }
            const rn = addActivityNode(graph, 'action', '短い', { centerX: 900, centerY: 300 })
            rn.resize(240, 120)
            markManuallySized(rn)
            autoSizeNode(rn, '短い')
            const kept = rn.getSize()
            clearManualSize(rn)
            autoSizeNode(rn, '短い')
            const restored = rn.getSize()
            activity['manualResize'] =
              notResizable.length === 0 &&
              kept.width === 240 &&
              kept.height === 120 &&
              !isManuallySized(rn) &&
              restored.width === ACTIVITY.action.width
                ? 'ok'
                : `ng(kinds=${notResizable}, kept=${kept.width}x${kept.height}, restored=${restored.width}x${restored.height})`
            graph.removeCells([rn])
          }
        } catch (e) {
          activity['portAnchor'] = `error: ${(e as Error).message}`
        }
      } catch (e) {
        activity['error'] = (e as Error).message
      }

      // main プロセスの sendInputEvent テスト用: ノードを選択して入力欄にフォーカス
      ;(window as unknown as Record<string, unknown>).__umlFocusPropsInput = async () => {
        const ll = graph
          .getNodes()
          .find((n) => getCellKind(n) === 'lifeline' || getCellKind(n) === 'action')
        if (!ll) return 'no-node'
        graph.resetSelection(ll)
        await new Promise((r) => setTimeout(r, 50))
        const input = document.querySelector('#props-body textarea') as HTMLTextAreaElement | null
        if (!input) return 'no-input'
        input.value = ''
        input.focus()
        return document.activeElement === input ? 'focused' : 'not-focused'
      }
      ;(window as unknown as Record<string, unknown>).__umlReadPropsInput = () => {
        const input = document.querySelector('#props-body textarea') as HTMLTextAreaElement | null
        const active = document.activeElement
        return JSON.stringify({
          value: input ? input.value : '(no input)',
          activeTag: active ? active.tagName : '(none)',
          selected: graph.getSelectedCells().length
        })
      }
      // インライン編集テスト用: 最初のノードの現在ラベル
      ;(window as unknown as Record<string, unknown>).__umlFirstNodeLabel = () => {
        const node = graph
          .getNodes()
          .find((n) => getCellKind(n) === 'lifeline' || getCellKind(n) === 'action')
        const v = node?.attr('label/text')
        return typeof v === 'string' ? v : ''
      }

      // マウス操作の完全再現用: 最初のノードと入力欄のクライアント座標
      ;(window as unknown as Record<string, unknown>).__umlGetClickPoints = () => {
        const node = graph
          .getNodes()
          .find((n) => getCellKind(n) === 'lifeline' || getCellKind(n) === 'action')
        if (!node) return JSON.stringify({ error: 'no-node' })
        const bbox = node.getBBox()
        const c = graph.localToClient(bbox.x + bbox.width / 2, bbox.y + 20)
        const input = document.querySelector('#props-body textarea') as HTMLTextAreaElement | null
        const ir = input?.getBoundingClientRect()
        return JSON.stringify({
          node: { x: Math.round(c.x), y: Math.round(c.y) },
          input: ir ? { x: Math.round(ir.x + ir.width / 2), y: Math.round(ir.y + ir.height / 2) } : null
        })
      }

      ;(window as unknown as Record<string, unknown>).__umlExportPng = () =>
        exportGraphToDataUrl(graph, 'png', { pixelRatio: 2 })
      ;(window as unknown as Record<string, unknown>).__umlExportSvg = async () =>
        (await exportGraphToSvg(graph)).svg

      return {
        vertices,
        edges,
        error: this.textError.textContent,
        exports,
        behavior,
        props,
        roundtripVertices,
        roundtripEdges,
        roundtripError,
        fragment,
        activity
      }
    }
  }

  // ---- 図種別 ----
  private async switchDiagramType(type: DiagramType): Promise<void> {
    if (type === this.diagramType) return
    if (this.editor.graph.getCells().length > 0) {
      // window.confirm は Electron でフォーカス状態を壊す（以降テキスト入力不能に
      // なる）ため、main のネイティブダイアログを使う
      const ok = await window.uml.confirmDialog(
        '図種別を切り替えると現在の図はクリアされます。よろしいですか？'
      )
      if (!ok) {
        this.toolbar.setDiagramType(this.diagramType)
        return
      }
    }
    this.applyDiagramType(type)
    this.newProject()
    this.textInput.value = type === 'activity' ? SAMPLE_ACTIVITY : SAMPLE_SEQUENCE
    this.textError.textContent = ''
  }

  /** エディタ・ツールバー・パレット・内部状態の図種別を揃える（クリアはしない） */
  private applyDiagramType(type: DiagramType): void {
    this.diagramType = type
    this.editor.setMode(type)
    this.toolbar.setDiagramType(type)
    this.palette.setDiagramType(type)
  }

  /** 左ペインのタブ（テキスト / 部品）切替 */
  private bindSideTabs(): void {
    const tabs: Array<{ btn: HTMLElement; panel: HTMLElement }> = [
      {
        btn: document.getElementById('tab-btn-text') as HTMLElement,
        panel: document.getElementById('tab-text') as HTMLElement
      },
      {
        btn: document.getElementById('tab-btn-palette') as HTMLElement,
        panel: document.getElementById('tab-palette') as HTMLElement
      }
    ]
    for (const tab of tabs) {
      tab.btn.addEventListener('click', () => {
        for (const t of tabs) {
          t.btn.classList.toggle('active', t === tab)
          t.panel.hidden = t !== tab
        }
      })
    }
  }

  // ---- テキスト → 図 ----
  private generate(): void {
    this.textError.textContent = ''
    try {
      if (this.diagramType === 'activity') {
        buildActivityFromText(this.editor, this.textInput.value)
      } else {
        buildSequenceFromText(this.editor, this.textInput.value)
      }
      this.setDirty(true)
    } catch (e) {
      if (e instanceof ParseError) this.textError.textContent = e.message
      else this.textError.textContent = `生成に失敗しました: ${(e as Error).message}`
    }
  }

  // ---- ライフライン追加 ----
  private addLifeline(): void {
    const graph = this.editor.graph
    let maxX = LIFELINE.firstCenterX - LIFELINE.gapX
    let height: number = LIFELINE.defaultHeight
    let top: number = LIFELINE.top
    for (const node of graph.getNodes()) {
      if (getCellKind(node) !== 'lifeline') continue
      const bbox = node.getBBox()
      maxX = Math.max(maxX, bbox.x + bbox.width / 2)
      height = bbox.height
      top = bbox.y
    }
    const centerX = maxX + LIFELINE.gapX
    let created: Node | null = null
    this.editor.batch(() => {
      created = addLifeline(graph, '新規', { centerX, top, height })
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
    }
  }

  // ---- 実行仕様(ExecutionSpecification)追加 ----
  private addExecutionSpec(): void {
    const graph = this.editor.graph
    const target = this.resolveTargetLifeline()
    if (!target) {
      this.setStatusMessage('ライフラインがありません。先に追加してください。')
      return
    }
    let created: Node | null = null
    this.editor.batch(() => {
      const y = target.getBBox().y + MESSAGE.startY
      created = addActivation(graph, target, y, ACTIVATION.defaultHeight)
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
    }
  }

  // ---- 複合フラグメント追加 ----
  private addFragment(): void {
    const graph = this.editor.graph
    const c = this.editor.getVisibleCenter()
    let created: Node | null = null
    this.editor.batch(() => {
      created = addFragment(graph, 'alt', '条件', {
        x: c.x - FRAGMENT.defaultWidth / 2,
        y: c.y - FRAGMENT.defaultHeight / 2,
        width: FRAGMENT.defaultWidth,
        height: FRAGMENT.defaultHeight
      })
      addFragmentDivider(graph, created, c.y + FRAGMENT.tabHeight / 2)
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
      this.setStatusMessage(
        'フラグメントを追加しました。種別・条件は右パネル、位置は枠線ドラッグで調整できます。'
      )
    }
  }

  // ---- メッセージ / フロー追加（選択ベース） ----
  private addConnection(): void {
    const graph = this.editor.graph
    const resolved = resolveConnectionEndpoints(graph, this.editor.getMode())
    if ('error' in resolved) {
      this.setStatusMessage(resolved.error)
      return
    }
    const { source, target } = resolved
    let created: ReturnType<typeof addMessage> | null = null
    this.editor.batch(() => {
      if (this.editor.getMode() === 'activity') {
        created = addFlow(graph, source, target)
      } else {
        created = addMessage(graph, source, target, 'sync', '', { y: nextMessageY(graph) })
      }
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
    }
  }

  // ---- アクティビティ図のノード追加 ----
  private addActivityNode(kind: ActivityNodeKind): void {
    const graph = this.editor.graph
    const p = this.nextActivityPlacement()
    let created: Node | null = null
    this.editor.batch(() => {
      const label = kind === 'action' ? '新しいアクション' : kind === 'decision' ? '条件?' : ''
      created = addActivityNode(graph, kind, label, { centerX: p.x, centerY: p.y })
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
    }
  }

  private addSwimlane(): void {
    const graph = this.editor.graph
    const area = graph.getContentArea()
    const hasCells = graph.getCells().length > 0
    const rect = hasCells
      ? {
          x: area.x + area.width + 24,
          y: Math.min(area.y, 20),
          width: ACTIVITY.laneWidth,
          height: Math.max(400, area.height + ACTIVITY.lanePaddingY * 2)
        }
      : { x: 20, y: 20, width: ACTIVITY.laneWidth, height: 480 }
    let created: Node | null = null
    this.editor.batch(() => {
      created = addSwimlane(graph, '新しいレーン', rect)
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
    }
  }

  private addActivityFrame(): void {
    const graph = this.editor.graph
    const c = this.editor.getVisibleCenter()
    let created: Node | null = null
    this.editor.batch(() => {
      created = addFrame(graph, 'フレーム', {
        x: c.x - FRAME.defaultWidth / 2,
        y: c.y - FRAME.defaultHeight / 2,
        width: FRAME.defaultWidth,
        height: FRAME.defaultHeight
      })
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
      this.setStatusMessage(
        'フレームを追加しました。ヘッダは右パネルかダブルクリック、位置は枠線ドラッグで調整できます。'
      )
    }
  }

  // テキスト: 選択中のライフラインに付属（破線で結び、移動に追従）
  private addText(): void {
    const graph = this.editor.graph
    const target = this.resolveTargetLifeline()
    if (!target) {
      this.setStatusMessage('ライフラインがありません。先に追加してください。')
      return
    }
    let created: Node | null = null
    this.editor.batch(() => {
      const bbox = target.getBBox()
      created = addAttachedText(graph, target, 'テキスト', {
        x: bbox.x + bbox.width + 24,
        y: bbox.y + LIFELINE.headHeight + 40,
        width: TEXT.defaultWidth
      })
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
      this.setStatusMessage(
        'ライフラインに付属テキストを追加しました。内容はダブルクリック、フォント等は右パネルで設定できます。'
      )
    }
  }

  // ノート: 自由配置（両図種）
  private addNote(): void {
    const graph = this.editor.graph
    const c = this.editor.getVisibleCenter()
    let created: Node | null = null
    this.editor.batch(() => {
      created = addNoteNode(graph, 'ノート', {
        x: c.x - NOTE.defaultWidth / 2,
        y: c.y - NOTE.minHeight / 2,
        width: NOTE.defaultWidth
      })
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
      this.setStatusMessage(
        'ノートを追加しました。内容はダブルクリック、フォント等は右パネルで設定できます。'
      )
    }
  }

  /**
   * 新しいノードの置き場所: 表示中の領域の中央。
   * 同じ場所に連続追加したときは少しずつずらして重なりを避ける。
   */
  private lastPlacementCenter: { x: number; y: number } | null = null
  private placementCascade = 0

  private nextActivityPlacement(): { x: number; y: number } {
    const c = this.editor.getVisibleCenter()
    const last = this.lastPlacementCenter
    if (last && Math.abs(c.x - last.x) < 8 && Math.abs(c.y - last.y) < 8) {
      this.placementCascade += 1
    } else {
      this.placementCascade = 0
      this.lastPlacementCenter = c
    }
    const offset = this.placementCascade * 28
    return { x: c.x + offset, y: c.y + offset }
  }

  /** 操作対象のライフラインを決める: 選択セルに最も近いライフライン、無ければ先頭 */
  private resolveTargetLifeline(): Node | null {
    const graph = this.editor.graph
    const lifelines = graph.getNodes().filter((n) => getCellKind(n) === 'lifeline')
    if (lifelines.length === 0) return null

    const centerX = (cell: (typeof lifelines)[number]): number => {
      const bbox = cell.getBBox()
      return bbox.x + bbox.width / 2
    }

    const sel = graph.getSelectedCells()[0]
    let refX: number | null = null
    if (sel) {
      if (sel.isNode()) {
        refX = centerX(sel)
      } else if (sel.isEdge()) {
        const src = sel.getSourceCell()
        if (src?.isNode()) refX = centerX(src)
      }
    }
    if (refX == null) return lifelines[0]

    let best = lifelines[0]
    let bestDist = Infinity
    for (const ll of lifelines) {
      const d = Math.abs(centerX(ll) - refX)
      if (d < bestDist) {
        bestDist = d
        best = ll
      }
    }
    return best
  }

  // ---- 書き出し ----
  private async exportImage(format: ImageFormat): Promise<void> {
    try {
      const dataUrl = await exportGraphToDataUrl(this.editor.graph, format)
      const name = this.defaultBaseName()
      const saved = await window.uml.exportImage(dataUrl, format, `${name}.${format}`)
      if (saved) this.setStatusMessage(`書き出しました: ${saved}`)
    } catch (e) {
      this.setStatusMessage(`書き出しに失敗しました: ${(e as Error).message}`)
    }
  }

  // ---- プロジェクト ----
  private newProject(): void {
    this.editor.clear()
    this.currentPath = null
    this.setDirty(false)
    this.updateStatus()
  }

  private async open(): Promise<void> {
    const result = await window.uml.openProject()
    if (!result) return
    try {
      const type = loadProject(this.editor, result.content)
      this.applyDiagramType(type)
      this.editor.refreshScrollArea()
      this.currentPath = result.path
      this.setDirty(false)
      this.updateStatus()
    } catch (e) {
      this.setStatusMessage(`読み込みに失敗しました: ${(e as Error).message}`)
    }
  }

  private async save(): Promise<void> {
    const content = serializeProject(this.editor, this.diagramType)
    const path = await window.uml.saveProject(content, this.currentPath)
    if (path) {
      this.currentPath = path
      this.setDirty(false)
      this.updateStatus()
    }
  }

  private async saveAs(): Promise<void> {
    const content = serializeProject(this.editor, this.diagramType)
    const path = await window.uml.saveProjectAs(content, `${this.defaultBaseName()}.umlproj`)
    if (path) {
      this.currentPath = path
      this.setDirty(false)
      this.updateStatus()
    }
  }

  // ---- メニュー / キー ----
  private bindMenu(): void {
    window.uml.onMenu('menu:new', () => this.newProject())
    window.uml.onMenu('menu:open', () => this.open())
    window.uml.onMenu('menu:save', () => this.save())
    window.uml.onMenu('menu:save-as', () => this.saveAs())
    window.uml.onMenu('menu:export-png', () => this.exportImage('png'))
    window.uml.onMenu('menu:export-jpg', () => this.exportImage('jpg'))
    window.uml.onMenu('menu:export-webp', () => this.exportImage('webp'))

    // 編集メニュー: テキスト入力にフォーカスがあればネイティブのテキスト編集、
    // それ以外は図（グラフ）への操作として扱う
    window.uml.onMenu('menu:undo', () =>
      isTextEditing() ? window.uml.nativeEdit('undo') : this.editor.undo()
    )
    window.uml.onMenu('menu:redo', () =>
      isTextEditing() ? window.uml.nativeEdit('redo') : this.editor.redo()
    )
    window.uml.onMenu('menu:cut', () =>
      isTextEditing() ? window.uml.nativeEdit('cut') : this.cutSelection()
    )
    window.uml.onMenu('menu:copy', () =>
      isTextEditing() ? window.uml.nativeEdit('copy') : this.copySelection()
    )
    window.uml.onMenu('menu:paste', () =>
      isTextEditing() ? window.uml.nativeEdit('paste') : this.pasteClipboard()
    )
    window.uml.onMenu('menu:delete', () =>
      isTextEditing() ? window.uml.nativeEdit('delete') : this.editor.deleteSelection()
    )
    window.uml.onMenu('menu:select-all', () =>
      isTextEditing() ? window.uml.nativeEdit('selectAll') : this.editor.selectAll()
    )
  }

  private copySelection(): void {
    if (this.editor.copySelection()) this.setStatusMessage('選択した要素をコピーしました')
    else this.setStatusMessage('コピーする要素が選択されていません')
  }

  private cutSelection(): void {
    if (this.editor.cutSelection()) this.setStatusMessage('選択した要素を切り取りました')
    else this.setStatusMessage('切り取る要素が選択されていません')
  }

  private pasteClipboard(): void {
    const cells = this.editor.pasteClipboard()
    if (cells.length > 0) this.setStatusMessage(`${cells.length} 個の要素を貼り付けました`)
  }

  private bindKeys(): void {
    document.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement
      const inEditable =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (inEditable) return

      const key = e.key.toLowerCase()
      if (e.ctrlKey && !e.shiftKey && key === 'z') {
        e.preventDefault()
        this.editor.undo()
      } else if (e.ctrlKey && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault()
        this.editor.redo()
      } else if (e.ctrlKey && key === 'x') {
        e.preventDefault()
        this.cutSelection()
      } else if (e.ctrlKey && key === 'c') {
        e.preventDefault()
        this.copySelection()
      } else if (e.ctrlKey && key === 'v') {
        e.preventDefault()
        this.pasteClipboard()
      } else if (e.ctrlKey && key === 'a') {
        e.preventDefault()
        this.editor.selectAll()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // 選択があれば削除（キャンバスのフォーカス有無に依らない）
        if (!this.editor.isSelectionEmpty()) {
          e.preventDefault()
          this.editor.deleteSelection()
        }
      }
    })
  }

  // ---- 状態表示 ----
  private setDirty(value: boolean): void {
    this.dirty = value
    this.updateStatus()
  }

  private defaultBaseName(): string {
    if (!this.currentPath) return 'diagram'
    const base = this.currentPath.replace(/\\/g, '/').split('/').pop() ?? 'diagram'
    return base.replace(/\.[^.]+$/, '')
  }

  private updateStatus(): void {
    const name = this.currentPath ?? '(未保存のプロジェクト)'
    const mark = this.dirty ? ' ●未保存' : ''
    this.statusEl.textContent = `${name}${mark}`
    document.title = `UmlTool — ${this.defaultBaseName()}${this.dirty ? ' *' : ''}`
  }

  private setStatusMessage(message: string): void {
    this.statusEl.textContent = message
  }
}

/** テキスト入力（DSL 欄・プロパティパネル・インラインエディタ）にフォーカスがあるか */
function isTextEditing(): boolean {
  const el = document.activeElement as HTMLElement | null
  return (
    !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  )
}

// 描画系の非同期例外はここでしか捕まえられない（診断ログ用）
window.addEventListener('error', (e) => {
  console.error(`[uncaught] ${(e.error as Error | undefined)?.stack ?? e.message}`)
})

window.addEventListener('DOMContentLoaded', () => {
  new AppController()
})
