import './styles.css'
import type { Edge, EdgeView, Node } from '@antv/x6'
import { GraphEditor } from './editor/GraphEditor'
import {
  addActivation,
  addAttachedText,
  addFragment,
  addFragmentDivider,
  addGateMessage,
  addLifeline,
  addMessage,
  attachLinkOf,
  isAttachLinkVisible,
  nextMessageY,
  setAttachLinkVisible
} from './editor/sequence'
import { addActivityNode, addFlow, addFrame, addSwimlane } from './editor/activity'
import {
  addBranch,
  addRootTopic,
  addTopic,
  applyTopicLevelStyle,
  applyTopicPalette,
  attachAsChild,
  canMoveTopic,
  checkBranch,
  childTopics,
  cloneSubtree,
  detachFromParent,
  isCollapsed,
  isTopic,
  markSubtreeCut,
  mindmapNavNodes,
  moveSubtree,
  parentTopic,
  setCollapsed,
  topicDepth,
  updateMindmapVisibility
} from './editor/mindmap'
import { addNoteNode } from './editor/note'
import { resolveConnectionEndpoints } from './editor/connect'
import {
  getCellKind,
  getNodeLabel,
  getTextBold,
  getTextFontSize,
  setNodeFill,
  setTextBold,
  setTextFontSize
} from './editor/shapes'
import { autoSizeNode } from './editor/autosize'
import {
  ACTIVATION,
  ACTIVITY,
  COLOR_PRESETS,
  FRAGMENT,
  FRAME,
  LIFELINE,
  MESSAGE,
  MINDMAP,
  MINDMAP_FONT_SIZE,
  MINDMAP_TOPIC_PALETTE,
  NOTE,
  SHAPE,
  TEXT,
  type ActivityNodeKind,
  type MindmapLayout
} from './editor/constants'
import { PropertiesPanel } from './ui/properties'
import { buildToolbar, type ToolbarHandle } from './ui/toolbar'
import { buildPalette, type PaletteHandle } from './ui/palette'
import { buildShortcutOverlay } from './ui/shortcutOverlay'
import { buildSequenceFromText } from './text/buildSequence'
import { buildActivityFromText } from './text/buildActivity'
import { buildMindmapFromText } from './text/buildMindmap'
import { resolveMindmapMove, type MindmapDirection } from './text/mindmapNav'
import { ParseError } from './text/sequenceParser'
import { loadProject, serializeProject, type DiagramType } from './diagram/serialize'
import { dpiToPixelsPerMeter } from './export/dpiMetadata'
import {
  DEFAULT_DPI,
  MAX_IMAGE_SIDE,
  exportGraphToDataUrl,
  exportGraphToImage,
  exportGraphToSvg,
  type ImageFormat
} from './export/raster'

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
ブラウザ --> ユーザー : ページを表示
note right of ブラウザ : 描画はここで完了
note over サーバー : 認証結果はセッションに保存`

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

const SAMPLE_MINDMAP = `* Webサイト刷新
** 企画
*** 競合調査
*** 要件定義
** 設計
*** 情報設計
*** ビジュアル
** 開発
*** フロントエンド
*** バックエンド
** 運用
*** 効果測定`

/** Ctrl+矢印でトピックを動かす量（グリッド 1 マス / Shift 併用で 5 マス） */
const NUDGE_STEP = 8
const NUDGE_STEP_LARGE = 40

const SAMPLE_TEXT: Record<DiagramType, string> = {
  sequence: SAMPLE_SEQUENCE,
  activity: SAMPLE_ACTIVITY,
  mindmap: SAMPLE_MINDMAP
}

/**
 * 切り取り / コピー中のサブツリー。
 * 切り取りは元の親を覚えておき、Esc で繋ぎ直せるようにする。
 */
type MindmapClip =
  | { mode: 'cut'; rootId: string; formerParentId: string | null }
  | { mode: 'copy'; rootId: string }

class AppController {
  private readonly editor: GraphEditor
  private readonly toolbar: ToolbarHandle
  private readonly palette: PaletteHandle
  private currentPath: string | null = null
  private dirty = false
  private diagramType: DiagramType = 'sequence'
  /** マインドマップの付け替え用クリップボード（図をまたいでは持ち越さない） */
  private mindmapClip: MindmapClip | null = null
  /** 画像書き出しの解像度（ツールバーのセレクトと同期。メニュー経由でも使う） */
  private exportDpi: number = DEFAULT_DPI

  private readonly shortcuts = buildShortcutOverlay(document.getElementById('app') as HTMLElement)

  private readonly statusEl = document.getElementById('statusbar') as HTMLElement
  private readonly textInput = document.getElementById('text-input') as HTMLTextAreaElement
  private readonly textError = document.getElementById('text-error') as HTMLElement

  constructor() {
    const container = document.getElementById('graph-container') as HTMLElement
    this.editor = new GraphEditor(container)

    this.textInput.value = SAMPLE_SEQUENCE

    new PropertiesPanel(this.editor, document.getElementById('props-body') as HTMLElement)

    this.toolbar = buildToolbar(document.getElementById('toolbar') as HTMLElement, {
      newProject: () => void this.newProjectInteractive(),
      open: () => void this.open(),
      save: () => void this.save(),
      saveAs: () => void this.saveAs(),
      setDiagramType: (t) => void this.switchDiagramType(t),
      setDecisionShape: (s) => {
        this.editor.setDecisionShape(s)
        this.setDirty(true)
      },
      setMindmapLayout: (l) => this.setMindmapLayout(l),
      arrangeMindmap: () => this.arrangeMindmap(),
      deleteSelection: () => this.editor.deleteSelection(),
      zoomIn: () => this.editor.zoomIn(),
      zoomOut: () => this.editor.zoomOut(),
      zoomReset: () => this.editor.zoomActual(),
      fit: () => this.editor.fit(),
      setExportDpi: (dpi) => {
        this.exportDpi = dpi
      },
      exportImage: (f) => this.exportImage(f),
      showShortcuts: () => this.shortcuts.toggle(this.diagramType)
    })

    this.palette = buildPalette(document.getElementById('palette-body') as HTMLElement, {
      addLifeline: () => this.addLifeline(),
      addExecutionSpec: () => this.addExecutionSpec(),
      addFragment: () => this.addFragment(),
      addConnection: () => this.addConnection(),
      addGate: (direction) => this.addGate(direction),
      addActivityNode: (kind) => this.addActivityNode(kind),
      addSwimlane: () => this.addSwimlane(),
      addFrame: () => this.addActivityFrame(),
      addText: () => this.addText(),
      addNote: () => this.addNote(),
      addRootTopic: () => this.addRootTopic(),
      addChildTopic: () => this.addRelatedTopic('child'),
      addSiblingTopic: () => this.addRelatedTopic('sibling'),
      toggleCollapse: () => this.toggleCollapse()
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

      // 書き出し解像度: dpi で画素数が変わるか / 1 辺の上限で自動的に下がるか /
      // PNG に解像度（pHYs）が埋まっているか
      const exportDpi: Record<string, string> = {}
      try {
        const base = await exportGraphToImage(graph, 'png', { dpi: 96 })
        const high = await exportGraphToImage(graph, 'png', { dpi: 192 })
        exportDpi['scales'] =
          high.width === base.width * 2 && high.height === base.height * 2
            ? 'ok'
            : `ng(96=${base.width}x${base.height}, 192=${high.width}x${high.height})`

        const small = await exportGraphToImage(graph, 'png', { dpi: 72 })
        exportDpi['shrink'] =
          small.width === Math.round(base.width * 0.75) && small.width > 0
            ? 'ok'
            : `ng(72=${small.width}x${small.height}, 96=${base.width}x${base.height})`

        const capped = await exportGraphToImage(graph, 'png', { dpi: 600, maxSide: 400 })
        exportDpi['clamp'] =
          capped.clamped && Math.max(capped.width, capped.height) === 400 && capped.dpi < 600
            ? 'ok'
            : `ng(clamped=${capped.clamped}, size=${capped.width}x${capped.height}, dpi=${capped.dpi})`

        const bytes = atob(high.dataUrl.slice(high.dataUrl.indexOf(',') + 1))
        const phys = bytes.indexOf('pHYs')
        const ppm =
          phys < 0
            ? -1
            : ((bytes.charCodeAt(phys + 4) << 24) |
                (bytes.charCodeAt(phys + 5) << 16) |
                (bytes.charCodeAt(phys + 6) << 8) |
                bytes.charCodeAt(phys + 7)) >>>
              0
        exportDpi['png-phys'] = ppm === dpiToPixelsPerMeter(192) ? 'ok' : `ng(ppm=${ppm})`
      } catch (e) {
        exportDpi['error'] = (e as Error).message
      }

      // 書き出し範囲: 線からはみ出したラベルが切れないか / 編集ハンドルが写らないか。
      // ゲートメッセージ（`[-> A`）は線が短いのに対しラベルが長く、ラベルは線の
      // 中点に置かれるため、セルの矩形だけで範囲を決めると左側が欠ける。
      const exportBounds: Record<string, string> = {}
      try {
        buildSequenceFromText(
          this.editor,
          '[-> A : 外部システムから受信する要求を処理する準備\nA -> B : 通常'
        )
        await new Promise((r) => setTimeout(r, 150))
        const gateEdge = graph
          .getEdges()
          .find((e) => (e.getData() as { gate?: string })?.gate === 'in')
        const view = gateEdge ? graph.findViewByCell(gateEdge) : null
        const labelEl = view?.container.querySelector('.x6-edge-label') as SVGGElement | null
        const labelBox = labelEl?.getBBox()
        const shift = labelEl?.transform.baseVal.consolidate()?.matrix.e ?? 0
        const labelLeft = (labelBox?.x ?? NaN) + shift
        const labelRight = labelLeft + (labelBox?.width ?? 0)
        const edgeLeft = gateEdge?.getBBox().x ?? NaN

        const { svg } = await exportGraphToSvg(graph)
        const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg)
        const left = vb ? Number(vb[1]) : NaN
        const right = left + (vb ? Number(vb[3]) : NaN)
        exportBounds['labelOverflows'] =
          labelLeft < edgeLeft ? `ok(${Math.round(edgeLeft - labelLeft)}px)` : 'ng(no overflow)'
        exportBounds['labelInside'] =
          left <= labelLeft && labelRight <= right
            ? 'ok'
            : `ng(viewBox=${left}..${right}, label=${labelLeft}..${labelRight})`

        if (gateEdge) {
          graph.select(gateEdge)
          await new Promise((r) => setTimeout(r, 150))
          const selected = (await exportGraphToSvg(graph)).svg
          exportBounds['noTools'] = selected.includes('x6-cell-tools') ? 'ng(tools in svg)' : 'ok'
          graph.cleanSelection()
        }
        buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
      } catch (e) {
        exportBounds['error'] = (e as Error).message
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

        // メッセージが中央 vertex を失っても Y を保てるか（上下ドラッグが
        // 定位置へ戻る不具合の回帰確認）。X6 の vertices ツールは既定で
        // 「両端と一直線な vertex」を離した瞬間に消すため、無効化してある。
        const msg = messages.find((e) => getCellKind(e) === 'message')
        if (msg) {
          const keep = msg.getVertices()
          msg.setVertices([{ ...keep[0], y: keep[0].y + 40 }])
          const movedY = msg.getVertices()[0]?.y ?? NaN
          msg.setVertices([]) // ＝冗長 vertex 削除で起きる状態
          const restored = msg.getVertices()[0]
          behavior['messageVertexRestore'] = restored
            ? 'ok'
            : `ng(moved=${movedY}, restored=none)`
          graph.resetSelection(msg)
          const items = (msg.getTools()?.items ?? []) as { name?: string; args?: unknown }[]
          const args = items.find((i) => i?.name === 'vertices')?.args as
            | { removeRedundancies?: boolean }
            | undefined
          behavior['messageVertexTool'] =
            args?.removeRedundancies === false ? 'ok' : `ng(${JSON.stringify(args)})`
          graph.cleanSelection()
          msg.setVertices(keep)
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

        // DSL の note: left/right of は付属テキスト、over は自由配置ノート
        {
          buildSequenceFromText(
            this.editor,
            `A -> B : 送る
note right of B : 受け取った
note over A, B : 二者に跨る
note left of A
1 行目
2 行目
end note`
          )
          const texts = graph.getNodes().filter((n) => getCellKind(n) === 'text')
          const noteNodes = graph.getNodes().filter((n) => getCellKind(n) === 'note')
          const lifelineA = graph.getNodes().find((n) => getNodeLabel(n) === 'A')
          // 付属テキストはライフラインの子になり、破線コネクタで結ばれる
          const attached = texts.every((t) => t.getParent() !== null)
          const multiline = texts.some((t) => getNodeLabel(t).includes('\n'))
          const links = graph.getEdges().filter((e) => getCellKind(e) === 'attachLink')
          const leftOfA =
            lifelineA !== undefined &&
            texts.some((t) => t.getBBox().x + t.getBBox().width < lifelineA.getBBox().x)
          behavior['dslNote'] =
            texts.length === 2 &&
            noteNodes.length === 1 &&
            attached &&
            multiline &&
            links.length === 2 &&
            leftOfA
              ? 'ok'
              : `ng(texts=${texts.length}, notes=${noteNodes.length}, attached=${attached}, multiline=${multiline}, links=${links.length}, leftOfA=${leftOfA})`
          buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
        }

        // DSL の外部ゲート: 片端が座標だけの点になり、水平が保たれる
        {
          buildSequenceFromText(
            this.editor,
            `[-> A : 外から
A ->] : 外へ
A -> B : 通常`
          )
          await new Promise((r) => setTimeout(r, 100))
          const msgs = graph.getEdges().filter((e) => getCellKind(e) === 'message')
          const gates = msgs.filter((e) => (e.getData() as { gate?: string })?.gate)
          const lifelineA = graph.getNodes().find((n) => getNodeLabel(n) === 'A')
          const aBox = lifelineA?.getBBox()
          const aCx = aBox ? aBox.x + aBox.width / 2 : 0
          // ゲート側の端点は座標（cell を持たない）で、相手の左右に出る
          const inbound = gates.find((e) => (e.getData() as { gate?: string }).gate === 'in')
          const outbound = gates.find((e) => (e.getData() as { gate?: string }).gate === 'out')
          const inPoint = inbound?.getSource() as { x?: number; cell?: string } | undefined
          const outPoint = outbound?.getTarget() as { x?: number; cell?: string } | undefined
          // 水平か（vertex の y とゲート点の y が一致）
          const horizontal = gates.every((e) => {
            const v = e.getVertices()[0]
            const p = ((e.getData() as { gate?: string }).gate === 'in'
              ? e.getSource()
              : e.getTarget()) as { y?: number }
            return v !== undefined && p.y !== undefined && Math.abs(v.y - p.y) < 0.5
          })
          behavior['dslGate'] =
            gates.length === 2 &&
            graph.getNodes().filter((n) => getCellKind(n) === 'lifeline').length === 2 &&
            inPoint?.cell === undefined &&
            outPoint?.cell === undefined &&
            (inPoint?.x ?? 0) < aCx &&
            (outPoint?.x ?? 0) > aCx &&
            horizontal
              ? 'ok'
              : `ng(gates=${gates.length}, inX=${inPoint?.x}, outX=${outPoint?.x}, aCx=${aCx}, horizontal=${horizontal})`
          buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
        }

        // 部品パレットの「外部から」「外部へ」でゲート付きメッセージが作れるか。
        // 作った後の上下ドラッグで、点側の端点も追従して水平が保たれるか。
        {
          buildSequenceFromText(this.editor, 'participant A\nparticipant B')
          await new Promise((r) => setTimeout(r, 100))
          const tiles = [
            ...(document
              .querySelectorAll('#palette-body .palette-grid')[0]
              ?.querySelectorAll('.palette-item') ?? [])
          ]
          const click = (label: string): void =>
            (tiles.find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined)
              ?.click() ?? undefined
          const lifelineA = graph.getNodes().find((n) => getNodeLabel(n) === 'A')
          if (lifelineA) graph.resetSelection(lifelineA)
          click('外部から')
          click('外部へ')

          const gates = graph.getEdges().filter((e) => (e.getData() as { gate?: string })?.gate)
          const inbound = gates.find((e) => (e.getData() as { gate?: string }).gate === 'in')
          const outbound = gates.find((e) => (e.getData() as { gate?: string }).gate === 'out')
          const aBox2 = lifelineA?.getBBox()
          const cx = aBox2 ? aBox2.x + aBox2.width / 2 : 0
          const pointOf = (e: Edge | undefined, side: 'source' | 'target'): { x?: number; y?: number } =>
            ((side === 'source' ? e?.getSource() : e?.getTarget()) ?? {}) as { x?: number; y?: number }
          const inPt = pointOf(inbound, 'source')
          const outPt = pointOf(outbound, 'target')
          behavior['gatePalette'] =
            gates.length === 2 &&
            inbound?.getTargetCellId() === lifelineA?.id &&
            outbound?.getSourceCellId() === lifelineA?.id &&
            inPt.x === cx - MESSAGE.gateLength &&
            outPt.x === cx + MESSAGE.gateLength
              ? 'ok'
              : `ng(gates=${gates.length}, inX=${inPt.x}, outX=${outPt.x}, cx=${cx})`

          // 上下ドラッグ相当: vertex を 40 下げると点側も同じ y へ動く
          let dragResult = 'ng(no gate)'
          if (inbound) {
            const v = inbound.getVertices()[0]
            inbound.setVertices([{ x: v.x, y: v.y + 40 }])
            const moved = inbound.getVertices()[0]
            const pt = pointOf(inbound, 'source')
            dragResult =
              Math.abs((pt.y ?? NaN) - moved.y) < 0.5 && Math.abs(moved.y - (v.y + 40)) < 0.5
                ? 'ok'
                : `ng(vertexY=${moved.y}, pointY=${pt.y}, want=${v.y + 40})`
          }
          behavior['gateDragHorizontal'] = dragResult

          // 保存→読込で点側の端点（cell を持たない終端）が残るか
          const saved = serializeProject(this.editor, 'sequence')
          loadProject(this.editor, saved)
          const reloaded = graph.getEdges().filter((e) => (e.getData() as { gate?: string })?.gate)
          const stillPoints = reloaded.every((e) => {
            const g = (e.getData() as { gate?: string }).gate
            const p = (g === 'in' ? e.getSource() : e.getTarget()) as { x?: number; cell?: string }
            return p.cell === undefined && typeof p.x === 'number'
          })
          behavior['gateRoundtrip'] =
            reloaded.length === 2 && stillPoints
              ? 'ok'
              : `ng(gates=${reloaded.length}, points=${stillPoints})`
          buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
        }

        // 入れ子の活性化バーは 1 段ごとに右へずれて積み重なる
        {
          buildSequenceFromText(
            this.editor,
            `participant A
participant B
activate B
A -> B : 1段目
activate B
B -> B : 2段目
activate B
B -> B : 3段目
deactivate B
deactivate B
B --> A : 戻り
deactivate B`
          )
          await new Promise((r) => setTimeout(r, 100))
          const bars = graph
            .getNodes()
            .filter((n) => getCellKind(n) === 'activation')
            .sort((a, b) => a.getBBox().x - b.getBBox().x)
          const xs = bars.map((b) => b.getBBox().x)
          const steps = xs.slice(1).map((x, i) => Math.round(x - xs[i]))
          // 外側ほど左。段差はちょうど nestOffsetX、上端は内側ほど下
          const nested =
            bars.length === 3 &&
            steps.every((s) => s === ACTIVATION.nestOffsetX) &&
            bars[0].getBBox().y <= bars[1].getBBox().y &&
            bars[1].getBBox().y <= bars[2].getBBox().y
          behavior['activationNesting'] = nested
            ? 'ok'
            : `ng(bars=${bars.length}, steps=${steps.join('/')})`
          buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
        }

        // 重なり順: ライフライン < 活性化バー < メッセージ
        // （バーは生存線を隠し、矢印はバーの上を通る）
        {
          buildSequenceFromText(
            this.editor,
            `participant A
participant B
participant C
activate B
A -> C : Bの上を通る
deactivate B`
          )
          await new Promise((r) => setTimeout(r, 100))
          const zOf = (kind: string): number | undefined => {
            const cell = graph.getCells().find((c) => getCellKind(c) === kind)
            return cell?.getZIndex()
          }
          const zLifeline = zOf('lifeline')
          const zActivation = zOf('activation')
          const zMessage = zOf('message')
          behavior['zOrder'] =
            zLifeline !== undefined &&
            zActivation !== undefined &&
            zMessage !== undefined &&
            zLifeline < zActivation &&
            zActivation < zMessage
              ? 'ok'
              : `ng(lifeline=${zLifeline}, activation=${zActivation}, message=${zMessage})`
          buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
        }

        // #21: フラグメントの枠・ガード文は活性化バーより前面、背景色は背面の
        // 専用セルに分離される（塗っても中身を隠さない）
        {
          await new Promise((r) => setTimeout(r, 100))
          const frag = graph.getNodes().find((n) => getCellKind(n) === 'fragment')
          const act = graph.getNodes().find((n) => getCellKind(n) === 'activation')
          const ll = graph.getNodes().find((n) => getCellKind(n) === 'lifeline')
          const bg = (frag?.getChildren() ?? []).find((c) => getCellKind(c) === 'fragmentBg')
          const zFront =
            frag !== undefined &&
            act !== undefined &&
            (frag.getZIndex() ?? 0) > (act.getZIndex() ?? 0)
          const zBack =
            bg !== undefined && (bg.getZIndex() ?? 0) < (ll?.getZIndex() ?? 0)
          let fillMoved = false
          if (frag && bg) {
            setNodeFill(frag, '#fff3bf')
            fillMoved =
              bg.attr('body/fill') === '#fff3bf' && frag.attr('body/fill') !== '#fff3bf'
          }
          behavior['fragmentFront'] =
            zFront && zBack && fillMoved
              ? 'ok'
              : `ng(front=${zFront}, back=${zBack}, fillMoved=${fillMoved})`
        }

        // #22: テキストの紐づけ線は透過（非表示）へ切り替えでき、元にも戻せる
        {
          const text = graph.getNodes().find((n) => getCellKind(n) === 'text')
          const link = text ? attachLinkOf(graph, text) : null
          let toggled = false
          if (link) {
            setAttachLinkVisible(link, false)
            const hidden =
              !isAttachLinkVisible(link) && link.attr('line/stroke') === 'transparent'
            setAttachLinkVisible(link, true)
            toggled = hidden && isAttachLinkVisible(link)
          }
          behavior['attachLinkToggle'] = toggled ? 'ok' : `ng(link=${link !== null})`
          buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
        }

        // DSL の autoactivate: 呼び出しでバーが開き、戻りで閉じる
        {
          buildSequenceFromText(
            this.editor,
            `autoactivate on
A -> B : 呼ぶ
B -> C : さらに呼ぶ
C --> B : 返す
B --> A : 返す`
          )
          await new Promise((r) => setTimeout(r, 100))
          const bars = graph.getNodes().filter((n) => getCellKind(n) === 'activation')
          // バーは B と C の 2 本。内側（右の C）は外側（B）より後に始まり短い
          const byX = [...bars].sort((a, b) => a.getBBox().x - b.getBBox().x)
          const bBar = byX[0]?.getBBox()
          const cBar = byX[1]?.getBBox()
          behavior['dslAutoActivate'] =
            bars.length === 2 && bBar && cBar && cBar.y > bBar.y && cBar.height < bBar.height
              ? 'ok'
              : `ng(bars=${bars.length}, b=${JSON.stringify(bBar)}, c=${JSON.stringify(cBar)})`
          buildSequenceFromText(this.editor, SAMPLE_SEQUENCE)
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

      // 中央 vertex を落として保存された旧ファイルが、読み込み時に修復されるか。
      // 検証後は元のグラフへ戻す（以降の検証が保存時の座標を前提にしているため）
      let legacyVertexRepair = ''
      try {
        const pristine = serializeProject(this.editor, this.diagramType)
        const doc = JSON.parse(pristine) as { graph: { cells: Record<string, unknown>[] } }
        let stripped = 0
        for (const cell of doc.graph.cells) {
          const kind = (cell['data'] as { kind?: string } | undefined)?.kind
          if (kind === 'message' && Array.isArray(cell['vertices'])) {
            cell['vertices'] = []
            stripped += 1
          }
        }
        loadProject(this.editor, JSON.stringify(doc))
        const missing = graph
          .getEdges()
          .filter(
            (e) =>
              getCellKind(e) === 'message' &&
              e.getSourceCell() != null &&
              e.getTargetCell() != null &&
              e.getVertices().length === 0
          ).length
        legacyVertexRepair =
          stripped > 0 && missing === 0 ? 'ok' : `ng(stripped=${stripped}, missing=${missing})`
        loadProject(this.editor, pristine)
      } catch (e) {
        legacyVertexRepair = `error: ${(e as Error).message}`
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

        // 分岐/合流の枝が別々の辺から出入りしているか（ラウンドトリップ後も維持）
        {
          const portOf = (edge: Edge, at: 'source' | 'target'): string => {
            const terminal = at === 'source' ? edge.getSource() : edge.getTarget()
            return String((terminal as { port?: string }).port ?? '(none)')
          }
          const problems: string[] = []
          for (const node of graph.getNodes()) {
            const kind = getCellKind(node)
            if (kind !== 'decision' && kind !== 'merge') continue
            const flows = graph.getConnectedEdges(node).filter((e) => getCellKind(e) === 'flow')
            // 分岐は出る枝、合流は入る枝を見る
            const branches = flows.filter((e) =>
              kind === 'decision'
                ? e.getSourceCellId() === node.id
                : e.getTargetCellId() === node.id
            )
            const sides = branches.map((e) =>
              portOf(e, kind === 'decision' ? 'source' : 'target')
            )
            const forbidden = kind === 'decision' ? 'top' : 'bottom'
            if (sides.includes('(none)')) problems.push(`${kind}:no-port`)
            if (sides.includes(forbidden)) problems.push(`${kind}:uses-${forbidden}`)
            // 枝が 3 本以内なら重なってはいけない
            if (branches.length <= 3 && new Set(sides).size !== sides.length) {
              problems.push(`${kind}:dup(${sides.join('/')})`)
            }
          }
          activity['branchPorts'] = problems.length === 0 ? 'ok' : `ng(${problems.join(',')})`
        }

        // フローの接続先: 上にあるノードからは上辺中央、合流は例外、手動は不変
        {
          const a = await import('./editor/activity')
          const portOfTarget = (e: Edge): string =>
            String((e.getTarget() as { port?: string }).port ?? '(none)')
          const flows = graph.getEdges().filter((e) => getCellKind(e) === 'flow')
          const targetKind = (e: Edge): string => {
            const id = e.getTargetCellId()
            const cell = id == null ? null : graph.getCellById(id)
            return cell ? getCellKind(cell) : 'unknown'
          }
          // 生成された図では、合流以外への流入はすべて上辺中央
          const nonMerge = flows.filter((e) => targetKind(e) !== 'merge')
          const allTop = nonMerge.every((e) => portOfTarget(e) === 'top')
          // 合流へは枝ごとに振り分けられるので、全部が上ではない
          const toMerge = flows.filter((e) => targetKind(e) === 'merge')
          const mergeVaried = new Set(toMerge.map(portOfTarget)).size > 1

          // 手動で決めた端点は、以後ノードを動かしても保たれる
          const victim = nonMerge[0]
          a.markTerminalManual(victim, 'target')
          victim.setTarget({ cell: victim.getTargetCellId() as string, port: 'left' })
          const moved = graph.getNodes().find((n) => getCellKind(n) === 'action')
          moved?.translate(1, 1)
          await new Promise((r) => setTimeout(r, 50))
          const manualKept = portOfTarget(victim) === 'left'

          activity['flowTargetPort'] =
            nonMerge.length > 0 && allTop && mergeVaried && manualKept
              ? 'ok'
              : `ng(nonMerge=${nonMerge.length}, allTop=${allTop}, mergeVaried=${mergeVaried}, manualKept=${manualKept})`
          buildActivityFromText(this.editor, SAMPLE_ACTIVITY)
        }

        // 複数行テキストの行揃え: ノート/テキストだけが対象で、往復もする
        {
          const s = await import('./editor/shapes')
          const n = addNoteNode(graph, '1 行目\n2 行目', { x: 1200, y: 900, width: 200 })
          const seen: string[] = []
          for (const align of ['left', 'right', 'center'] as const) {
            s.setTextAlign(n, align)
            seen.push(s.getTextAlign(n))
          }
          // 揃えると本文の基準位置（textAnchor）が変わる
          s.setTextAlign(n, 'left')
          const leftAnchor = String(n.attr('label/textAnchor'))
          s.setTextAlign(n, 'right')
          const rightAnchor = String(n.attr('label/textAnchor'))
          // ラベル位置が固定のライフラインなどは対象外
          const lifeline = graph.getNodes().find((x) => getCellKind(x) === 'lifeline')
          const action = graph.getNodes().find((x) => getCellKind(x) === 'action')
          activity['textAlign'] =
            seen.join(',') === 'left,right,center' &&
            leftAnchor === 'start' &&
            rightAnchor === 'end' &&
            s.canSetTextAlign(n) &&
            (lifeline === undefined || !s.canSetTextAlign(lifeline)) &&
            (action === undefined || !s.canSetTextAlign(action))
              ? 'ok'
              : `ng(seen=${seen.join(',')}, left=${leftAnchor}, right=${rightAnchor})`
          graph.removeCells([n])
        }

        // コンテナ（レーン/フレーム）は中身を隠さないよう常に背面
        {
          const lane = addSwimlane(graph, '背面レーン', { x: 40, y: 40, width: 300, height: 400 })
          const fr = addFrame(graph, '背面フレーム', { x: 60, y: 60, width: 260, height: 300 })
          const zLane = lane.getZIndex() ?? 0
          const zFrame = fr.getZIndex() ?? 0
          // 図中の通常ノード（コンテナ以外）すべてより後ろにあること
          const contentZ = graph
            .getNodes()
            .filter((n) => {
              const k = getCellKind(n)
              return k !== 'swimlane' && k !== 'frame' && k !== 'fragment'
            })
            .map((n) => n.getZIndex() ?? 0)
          const edgeZ = graph.getEdges().map((e) => e.getZIndex() ?? 0)
          const minContent = Math.min(...contentZ, ...edgeZ)
          activity['containerBehind'] =
            zLane < zFrame && zFrame < minContent
              ? 'ok'
              : `ng(lane=${zLane}, frame=${zFrame}, minContent=${minContent})`
          graph.removeCells([lane, fr])
        }

        // 分岐の図形: 既存・新規ともに切り替わり、保存で往復し、合流は菱形のまま
        {
          const { getDecisionShape } = await import('./editor/shapes')
          const decisionsOf = (): Node[] =>
            graph.getNodes().filter((n) => getCellKind(n) === 'decision')
          this.editor.setDecisionShape('hexagon')
          const existing = decisionsOf().every((n) => getDecisionShape(n) === 'hexagon')
          // 切り替え後に追加した分岐も同じ形になる
          const added = addActivityNode(graph, 'decision', '新しい分岐', {
            centerX: 1200,
            centerY: 700
          })
          const newOne = getDecisionShape(added) === 'hexagon'
          // 合流は分岐と見分けが付くよう菱形のまま
          const merge = graph.getNodes().find((n) => getCellKind(n) === 'merge')
          const mergeUnchanged =
            merge !== undefined && String(merge.attr('body/refPoints')).split(' ').length === 4
          // 保存 → 読込で図形が保たれる
          const saved2 = serializeProject(this.editor, 'activity')
          loadProject(this.editor, saved2)
          const survived =
            this.editor.getDecisionShape() === 'hexagon' &&
            decisionsOf().every((n) => getDecisionShape(n) === 'hexagon')
          this.editor.setDecisionShape('diamond')
          const backToDiamond = decisionsOf().every((n) => getDecisionShape(n) === 'diamond')
          activity['decisionShape'] =
            existing && newOne && mergeUnchanged && survived && backToDiamond
              ? 'ok'
              : `ng(existing=${existing}, new=${newOne}, merge=${mergeUnchanged}, roundtrip=${survived}, back=${backToDiamond})`
          graph.removeCells(decisionsOf().filter((n) => getNodeLabel(n) === '新しい分岐'))
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

          // 外観（背景色/線色/文字スタイル）が種別ごとに正しい対象へ当たるか
          {
            const s = await import('./editor/shapes')
            const bad: string[] = []
            const kinds: ActivityNodeKind[] = [
              'action',
              'decision',
              'merge',
              'initial',
              'final',
              'fork',
              'join'
            ]
            for (const kind of kinds) {
              const n = addActivityNode(graph, kind, 'x', { centerX: 1200, centerY: 400 })
              // 背景色は全種別が持つ
              if (!s.canSetFill(n)) bad.push(`${kind}:no-fill`)
              s.setNodeFill(n, '#123456')
              if (s.getNodeFill(n) !== '#123456') bad.push(`${kind}:fill`)
              if (s.canSetStroke(n)) {
                s.setNodeStroke(n, '#654321')
                if (s.getNodeStroke(n) !== '#654321') bad.push(`${kind}:stroke`)
              }
              if (s.canSetTextStyle(n)) {
                s.setTextColor(n, '#abcdef')
                s.setTextFontSize(n, 21)
                s.setTextBold(n, true)
                s.setTextFontFamily(n, '"Yu Mincho", serif')
                if (
                  s.getTextColor(n) !== '#abcdef' ||
                  s.getTextFontSize(n) !== 21 ||
                  !s.getTextBold(n) ||
                  s.getTextFontFamily(n) !== '"Yu Mincho", serif'
                ) {
                  bad.push(`${kind}:text`)
                }
              }
              graph.removeCells([n])
            }
            // ラベルを持つ種別/持たない種別の判定が期待どおりか
            const labelled = addActivityNode(graph, 'action', 'x', { centerX: 1200, centerY: 500 })
            const unlabelled = addActivityNode(graph, 'merge', '', { centerX: 1200, centerY: 560 })
            if (!s.canSetTextStyle(labelled)) bad.push('action:text-style-missing')
            if (s.canSetTextStyle(unlabelled)) bad.push('merge:text-style-unexpected')
            graph.removeCells([labelled, unlabelled])
            activity['nodeStyle'] = bad.length === 0 ? 'ok' : `ng(${bad.join(',')})`

            // 複数選択: 選択枠が見えること＋その状態で片方を動かすと全部ついてくること
            {
              const m1 = addActivityNode(graph, 'action', 'M1', { centerX: 1500, centerY: 100 })
              const m2 = addActivityNode(graph, 'action', 'M2', { centerX: 1500, centerY: 240 })
              graph.resetSelection([m1, m2])
              await new Promise((r) => setTimeout(r, 100))
              const boxes = document.querySelectorAll('.x6-widget-selection-box').length
              const inner = document.querySelectorAll(
                '.x6-widget-selection-inner[data-selection-length="2"]'
              ).length
              const before2 = m2.getBBox()
              m1.translate(30, 40, { ui: true, translateBy: m1.id })
              const moved = m2.getBBox()
              const dx = moved.x - before2.x
              const dy = moved.y - before2.y
              activity['multiSelect'] =
                boxes === 2 && inner === 1 && dx === 30 && dy === 40
                  ? 'ok'
                  : `ng(boxes=${boxes}, inner=${inner}, moved=${dx},${dy})`
              graph.cleanSelection()
              graph.removeCells([m1, m2])
            }

            // フォントを大きくしたら自動サイズもその実寸に追従すること
            const { autoSizeNode } = await import('./editor/autosize')
            const fn = addActivityNode(graph, 'action', '文字送りの確認', {
              centerX: 1200,
              centerY: 620
            })
            const before = fn.getSize().width
            s.setTextFontSize(fn, 26)
            autoSizeNode(fn, '文字送りの確認')
            const after = fn.getSize().width
            activity['fontRefit'] = after > before ? `ok(${before}→${after})` : `ng(${before}→${after})`
            graph.removeCells([fn])
          }

          // 右パネル: 選択したノードに外観欄とカラープリセットが出るか
          {
            const a = addActivityNode(graph, 'action', 'スタイル', { centerX: 900, centerY: 400 })
            graph.resetSelection(a)
            await new Promise((r) => setTimeout(r, 100))
            const body = document.getElementById('props-body')
            const swatches = body?.querySelectorAll('.swatch').length ?? 0
            const colorPickers = body?.querySelectorAll('input[type="color"]').length ?? 0
            const fonts = body?.querySelectorAll('select').length ?? 0
            activity['stylePanel'] =
              swatches >= COLOR_PRESETS.length * 3 && colorPickers === 3 && fonts === 1
                ? 'ok'
                : `ng(swatches=${swatches}, pickers=${colorPickers}, fontSelects=${fonts})`
            graph.cleanSelection()
            graph.removeCells([a])
          }

          // 画面内の座標を作るための基準（elementFromPoint はビューポート内だけ有効）
          const viewCenter = ((): { x: number; y: number } => {
            const rect = graph.container.getBoundingClientRect()
            return graph.clientToLocal(rect.left + rect.width / 2, rect.top + rect.height / 2)
          })()
          const clientOf = (p: { x: number; y: number }): { x: number; y: number } =>
            graph.localToClient(p.x, p.y)
          const hitCellId = (p: { x: number; y: number }): string | null => {
            const c = clientOf(p)
            const el = document.elementFromPoint(c.x, c.y)
            const owner = el?.closest('[data-cell-id]')
            return owner?.getAttribute('data-cell-id') ?? null
          }

          // 選択枠の内側にある未選択ノードもクリックできること（issue #28）
          {
            const spots = [
              { x: viewCenter.x - 140, y: viewCenter.y - 90 },
              { x: viewCenter.x + 140, y: viewCenter.y - 90 },
              { x: viewCenter.x - 140, y: viewCenter.y + 90 },
              { x: viewCenter.x + 140, y: viewCenter.y + 90 }
            ]
            const corners = spots.map((p, i) =>
              addActivityNode(graph, 'action', `C${i}`, { centerX: p.x, centerY: p.y })
            )
            graph.resetSelection(corners.slice(0, 3))
            await new Promise((r) => setTimeout(r, 120))
            const inner = document.querySelectorAll(
              '.x6-widget-selection-inner[data-selection-length="3"]'
            ).length
            const last = corners[3]
            const hit = hitCellId(last.getBBox().center)
            activity['selectionClickThrough'] =
              inner === 1 && hit === last.id ? 'ok' : `ng(inner=${inner}, hit=${hit})`
            graph.cleanSelection()
            graph.removeCells(corners)
          }

          // スイムレーンは中身では掴めず、ヘッダ帯でだけ動かせること（issue #27）
          {
            const lane = addSwimlane(graph, 'レーン', {
              x: viewCenter.x - 200,
              y: viewCenter.y - 120,
              width: 400,
              height: 240
            })
            const inside = addActivityNode(graph, 'action', '中のノード', {
              centerX: viewCenter.x,
              centerY: viewCenter.y + 40
            })
            await new Promise((r) => setTimeout(r, 120))
            const box = lane.getBBox()
            const header = hitCellId({ x: box.center.x, y: box.y + ACTIVITY.laneHeaderHeight / 2 })
            const empty = hitCellId({ x: box.x + 40, y: box.y + 160 })
            const overNode = hitCellId(inside.getBBox().center)
            activity['swimlaneGrip'] =
              header === lane.id && empty !== lane.id && overNode === inside.id
                ? 'ok'
                : `ng(header=${header === lane.id}, body=${empty}, node=${overNode === inside.id})`

            // コピー＆貼り付けしたレーンも背面のままであること
            // （X6 の貼り付けは zIndex を捨てるので、放っておくと中身を覆い隠す）
            {
              graph.resetSelection(lane)
              this.editor.copySelection()
              const pasted = this.editor.pasteClipboard()
              await new Promise((r) => setTimeout(r, 120))
              const copy = pasted.find((c) => getCellKind(c) === 'swimlane')
              const copyZ = copy?.getZIndex()
              activity['pasteLaneZOrder'] =
                copy !== undefined &&
                copyZ === lane.getZIndex() &&
                copyZ !== undefined &&
                copyZ < (inside.getZIndex() ?? 0)
                  ? 'ok'
                  : `ng(z=${copyZ}, lane=${lane.getZIndex()}, node=${inside.getZIndex()})`
              graph.cleanSelection()
              if (copy) graph.removeCells([copy])
            }
            graph.removeCells([lane, inside])
          }

          // ハンドルでリサイズしても中心が動かないこと（issue #26）
          {
            const n = addActivityNode(graph, 'action', 'リサイズ', {
              centerX: viewCenter.x,
              centerY: viewCenter.y
            })
            // リサイズハンドルは node:click で出るので、描画を待って実際にクリックする
            await new Promise((r) => setTimeout(r, 150))
            {
              const c = clientOf(n.getBBox().center)
              const el = document.elementFromPoint(c.x, c.y)
              for (const type of ['mousedown', 'mouseup', 'click']) {
                el?.dispatchEvent(
                  new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: c.x,
                    clientY: c.y,
                    button: 0
                  })
                )
              }
            }
            await new Promise((r) => setTimeout(r, 150))
            const handle = document.querySelector(
              '.x6-widget-transform-resize[data-position="right"]'
            ) as HTMLElement | null
            const before = n.getBBox()
            if (handle) {
              const h = handle.getBoundingClientRect()
              const from = { x: h.left + h.width / 2, y: h.top + h.height / 2 }
              const fire = (type: string, target: EventTarget, dx: number): void => {
                target.dispatchEvent(
                  new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: from.x + dx,
                    clientY: from.y,
                    button: 0,
                    buttons: 1
                  })
                )
              }
              fire('mousedown', handle, 0)
              fire('mousemove', document, 64)
              fire('mouseup', document, 64)
              await new Promise((r) => setTimeout(r, 120))
            }
            const after = n.getBBox()
            const grew = after.width > before.width
            const kept =
              Math.abs(after.center.x - before.center.x) < 1 &&
              Math.abs(after.center.y - before.center.y) < 1
            activity['resizeKeepsCenter'] =
              handle && grew && kept
                ? `ok(${before.width}→${after.width})`
                : `ng(handle=${handle !== null}, grew=${grew}, dx=${Math.round(after.center.x - before.center.x)}, widgets=${document.querySelectorAll('.x6-widget-transform').length}, sel=${graph.getSelectedCells().length})`
            graph.cleanSelection()
            graph.removeCells([n])
          }

          // 落とした位置の辺にフローが付き、その辺は自動割り当てが避けること（issue #25）
          {
            const dec = addActivityNode(graph, 'decision', '条件?', {
              centerX: viewCenter.x,
              centerY: viewCenter.y
            })
            const from = addActivityNode(graph, 'action', '手前', {
              centerX: viewCenter.x,
              centerY: viewCenter.y + 220
            })
            const leftTarget = addActivityNode(graph, 'action', '左へ', {
              centerX: viewCenter.x - 320,
              centerY: viewCenter.y
            })
            const incoming = addFlow(graph, from, dec)
            const box = dec.getBBox()
            // 分岐の左端付近で離した、と同じ状態を作る
            graph.trigger('edge:connected', {
              edge: incoming,
              e: { clientX: 0, clientY: 0 },
              type: 'target',
              currentPoint: { x: box.x + 3, y: box.center.y }
            })
            const droppedPort = (incoming.getTarget() as { port?: string }).port
            // 左は手で決めた枝が塞いでいるので、自動の枝は別の辺へ回る
            const outgoing = addFlow(graph, dec, leftTarget)
            this.editor.normalizeBranchPorts()
            const autoPort = (outgoing.getSource() as { port?: string }).port
            activity['flowDropSide'] =
              droppedPort === 'left' && autoPort !== 'left' && autoPort !== undefined
                ? `ok(auto=${autoPort})`
                : `ng(dropped=${droppedPort}, auto=${autoPort})`
            graph.removeCells([dec, from, leftTarget, incoming, outgoing])
          }
          // 合流の入口を右パネルから左へ付け替えられること（issue #25）
          {
            const top = addActivityNode(graph, 'merge', '', {
              centerX: viewCenter.x,
              centerY: viewCenter.y - 150
            })
            const bottom = addActivityNode(graph, 'merge', '', {
              centerX: viewCenter.x,
              centerY: viewCenter.y + 150
            })
            const init = addActivityNode(graph, 'initial', '', {
              centerX: viewCenter.x,
              centerY: viewCenter.y - 250
            })
            const fromInit = addFlow(graph, init, top)
            const back = addFlow(graph, bottom, top)
            this.editor.normalizeBranchPorts()
            await new Promise((r) => setTimeout(r, 150))
            // 真下から戻る矢印は、自動だと右に付く（上は開始からの矢印が使う）
            const before = (back.getTarget() as { port?: string }).port
            graph.resetSelection(back)
            await new Promise((r) => setTimeout(r, 150))

            const pick = (caption: string): HTMLSelectElement | null => {
              const labels = [...document.querySelectorAll('#props-body label')]
              const hit = labels.find((l) => (l.textContent ?? '').startsWith(caption))
              return (hit?.querySelector('select') as HTMLSelectElement | null) ?? null
            }
            const choose = async (
              select: HTMLSelectElement | null,
              value: string
            ): Promise<void> => {
              if (!select) return
              select.value = value
              select.dispatchEvent(new Event('change', { bubbles: true }))
              await new Promise((r) => setTimeout(r, 150))
            }
            await choose(pick('入口'), 'left')
            const afterLeft = (back.getTarget() as { port?: string }).port
            // 手で決めた辺は、以後の自動割り当てでも動かない
            top.translate(0, -8)
            this.editor.normalizeBranchPorts()
            const keptLeft = (back.getTarget() as { port?: string }).port
            const initPort = (fromInit.getTarget() as { port?: string }).port
            // 「自動」に戻すと元の割り当てへ戻る
            await choose(pick('入口'), 'auto')
            const backToAuto = (back.getTarget() as { port?: string }).port

            activity['flowSidePanel'] =
              before === 'right' &&
              afterLeft === 'left' &&
              keptLeft === 'left' &&
              initPort === 'top' &&
              backToAuto === 'right'
                ? 'ok'
                : `ng(before=${before}, left=${afterLeft}, kept=${keptLeft}, init=${initPort}, auto=${backToAuto})`

            // 端点ハンドルを合流の左へドラッグしても左に付くこと（issue #25）
            {
              graph.resetSelection(back)
              await new Promise((r) => setTimeout(r, 150))
              const tool = document.querySelector(
                '.x6-edge-tool-target-arrowhead'
              ) as SVGElement | null
              const rect = tool?.getBoundingClientRect()
              const box = top.getBBox()
              const drop = graph.localToClient(box.x + 3, box.center.y)
              if (tool && rect) {
                const fire = (t: string, target: EventTarget, x: number, y: number): void => {
                  target.dispatchEvent(
                    new MouseEvent(t, {
                      bubbles: true,
                      cancelable: true,
                      clientX: x,
                      clientY: y,
                      button: 0,
                      buttons: 1
                    })
                  )
                }
                fire('mousedown', tool, rect.left + rect.width / 2, rect.top + rect.height / 2)
                fire('mousemove', document, drop.x, drop.y)
                fire('mouseup', document, drop.x, drop.y)
                await new Promise((r) => setTimeout(r, 200))
              }
              const dragged = (back.getTarget() as { port?: string }).port
              const manual = (back.getData() as { manualTarget?: boolean } | undefined)
                ?.manualTarget
              // 付け替えた辺は、そのあとノードを動かしても動かない
              top.translate(0, -8)
              this.editor.normalizeBranchPorts()
              const stillLeft = (back.getTarget() as { port?: string }).port
              activity['flowSideDrag'] =
                tool !== null && dragged === 'left' && manual === true && stillLeft === 'left'
                  ? 'ok'
                  : `ng(tool=${tool !== null}, port=${dragged}, manual=${manual}, kept=${stillLeft})`
            }
            graph.cleanSelection()
            graph.removeCells([top, bottom, init])
          }
        } catch (e) {
          activity['portAnchor'] = `error: ${(e as Error).message}`
        }
      } catch (e) {
        activity['error'] = (e as Error).message
      }

      // マインドマップ: 生成・2 つの配置・折りたたみ・ラウンドトリップ検証
      // （最後にアクティビティ図へ戻すので、DIAG-PNG の中身は変わらない）
      const mindmap: Record<string, unknown> = {}
      try {
        const mm = await import('./editor/mindmap')
        this.applyDiagramType('mindmap')
        this.editor.restoreMindmapLayout('map')
        buildMindmapFromText(this.editor, SAMPLE_MINDMAP, 'map')
        await new Promise((r) => setTimeout(r, 100))

        const topics = graph.getNodes().filter((n) => mm.isTopic(n))
        const branches = graph.getEdges().filter((e) => getCellKind(e) === 'branch')
        const roots = graph.getNodes().filter((n) => getCellKind(n) === 'rootTopic')
        mindmap['built'] =
          topics.length === 12 && branches.length === 11 && roots.length === 1
            ? 'ok'
            : `ng(topics=${topics.length}, branches=${branches.length}, roots=${roots.length})`

        // 第 1 階層が左右に振り分けられているか
        const root = roots[0]
        if (root) {
          const rootCx = root.getBBox().center.x
          const level1 = mm.childTopics(graph, root)
          const rightCount = level1.filter((n) => n.getBBox().center.x > rootCx).length
          const leftCount = level1.filter((n) => n.getBBox().center.x < rootCx).length
          mindmap['balance'] =
            level1.length === 4 && rightCount === 2 && leftCount === 2
              ? 'ok'
              : `ng(level1=${level1.length}, right=${rightCount}, left=${leftCount})`
        }

        // ツリー（縦インデント）表示: 深さが増えるほど右、行は上から順
        this.editor.setMindmapLayout('outline')
        await new Promise((r) => setTimeout(r, 100))
        {
          const rows = graph
            .getNodes()
            .filter((n) => mm.isTopic(n))
            .sort((a, b) => a.getBBox().y - b.getBBox().y)
          const rootRow = rows[0]
          const deeper = rows.filter(
            (n) => n.getBBox().x > (rootRow?.getBBox().x ?? 0)
          ).length
          const overlap = rows.some(
            (n, i) => i > 0 && n.getBBox().y < rows[i - 1].getBBox().bottom
          )
          mindmap['outline'] =
            getCellKind(rootRow) === 'rootTopic' && deeper === 11 && !overlap
              ? 'ok'
              : `ng(first=${getCellKind(rootRow)}, deeper=${deeper}, overlap=${overlap})`
        }

        // 枝の形: 親の下端 → 直角 → 子の左端。子をどこへ動かしても崩れないこと
        {
          const parent = graph.getNodes().find((n) => getCellKind(n) === 'rootTopic')
          const child = parent ? mm.childTopics(graph, parent)[0] : undefined
          const edge = child
            ? graph.getEdges().find((e) => e.getTargetCellId() === child.id)
            : undefined
          const shapeOf = (): string => {
            if (!parent || !child || !edge) return 'no-edge'
            const view = graph.findViewByCell(edge) as EdgeView | null
            if (!view) return 'no-view'
            const pb = parent.getBBox()
            const cb = child.getBBox()
            const points = view.routePoints
            const corner = points[0]
            const near = (a: number, b: number): boolean => Math.abs(a - b) < 1.5
            if (points.length !== 1) return `bends=${points.length}`
            // 縦線は親の左端から indentX の半分だけ右（＝子の左端より外側）に落ちる
            const gutterX = pb.x + MINDMAP.indentX / 2
            if (!near(view.sourceAnchor.x, gutterX) || !near(view.sourceAnchor.y, pb.bottom)) {
              return `source=${Math.round(view.sourceAnchor.x)},${Math.round(view.sourceAnchor.y)}`
            }
            if (!near(view.targetAnchor.x, cb.x) || !near(view.targetAnchor.y, cb.center.y)) {
              return `target=${Math.round(view.targetAnchor.x)},${Math.round(view.targetAnchor.y)}`
            }
            // 曲がり角は「縦線の真下・子と同じ高さ」の 1 点
            return near(corner.x, gutterX) && near(corner.y, cb.center.y)
              ? 'ok'
              : `corner=${Math.round(corner.x)},${Math.round(corner.y)}`
          }
          const arranged = shapeOf()
          // 整列後は縦線が子の左端より外側にあり、横線が子の裏に潜らない
          const gutterOutside =
            parent !== undefined &&
            child !== undefined &&
            parent.getBBox().x + MINDMAP.indentX / 2 < child.getBBox().x
          // 子を親の左上へ動かしても L 字のまま
          child?.translate(-320, -220)
          await new Promise((r) => setTimeout(r, 60))
          const movedUp = shapeOf()
          child?.translate(320, 220)
          await new Promise((r) => setTimeout(r, 60))
          mindmap['treeBranch'] =
            arranged === 'ok' && movedUp === 'ok' && gutterOutside
              ? 'ok'
              : `ng(arranged=${arranged}, moved=${movedUp}, gutter=${gutterOutside})`
        }

        // 折りたたみ: 子孫（ノードと枝）が隠れ、展開で戻る
        {
          const root2 = graph.getNodes().find((n) => getCellKind(n) === 'rootTopic')
          const target = root2 ? mm.childTopics(graph, root2)[0] : undefined
          if (target) {
            mm.setCollapsed(target, true)
            mm.updateMindmapVisibility(graph)
            const hiddenNodes = graph.getNodes().filter((n) => !n.isVisible()).length
            const hiddenEdges = graph.getEdges().filter((e) => !e.isVisible()).length
            mm.setCollapsed(target, false)
            mm.updateMindmapVisibility(graph)
            const restored = graph.getCells().every((c) => c.isVisible())
            mindmap['collapse'] =
              hiddenNodes === 2 && hiddenEdges === 2 && restored
                ? 'ok'
                : `ng(nodes=${hiddenNodes}, edges=${hiddenEdges}, restored=${restored})`
          }
        }

        // 書き出しと保存→読込
        this.editor.setMindmapLayout('map')
        const url = await exportGraphToDataUrl(graph, 'png', { pixelRatio: 1 })
        mindmap['png'] = url.startsWith('data:image/png') ? `ok(${url.length})` : 'wrong-mime'
        ;(window as unknown as Record<string, unknown>).__mindmapPng =
          await exportGraphToDataUrl(graph, 'png', { pixelRatio: 2 })
        const saved = serializeProject(this.editor, 'mindmap')
        const positions = graph
          .getNodes()
          .filter((n) => mm.isTopic(n))
          .map((n) => `${Math.round(n.getBBox().x)},${Math.round(n.getBBox().y)}`)
          .join('|')
        mindmap['roundtripType'] = loadProject(this.editor, saved)
        const after = graph
          .getNodes()
          .filter((n) => mm.isTopic(n))
          .map((n) => `${Math.round(n.getBBox().x)},${Math.round(n.getBBox().y)}`)
          .join('|')
        mindmap['roundtripLayout'] = this.editor.getMindmapLayout()
        // 読み込みで勝手に整列し直していないこと（座標がそのまま）
        mindmap['roundtripPositions'] = positions === after ? 'ok' : 'ng(moved)'

        // キー操作: Tab = 子トピック / Enter = 兄弟トピック / Space = 折りたたみ
        {
          const { closeInlineEditor } = await import('./editor/inlineEditor')
          const key = async (
            k: string,
            mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}
          ): Promise<void> => {
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods })
            )
            await new Promise((r) => setTimeout(r, 60))
          }
          const root = graph.getNodes().find((n) => getCellKind(n) === 'rootTopic')
          const before = graph.getNodes().length
          if (root) {
            graph.resetSelection(root)
            await key('Tab')
            const child = graph.getSelectedCells()[0] as Node | undefined
            const editorOpen = document.querySelector('div[contenteditable]') !== null
            closeInlineEditor()
            const childOk =
              child !== undefined &&
              mm.isTopic(child) &&
              mm.parentTopic(graph, child)?.id === root.id

            graph.resetSelection(child as Node)
            await key('Enter')
            const sibling = graph.getSelectedCells()[0] as Node | undefined
            closeInlineEditor()
            const siblingOk =
              sibling !== undefined &&
              sibling.id !== child?.id &&
              mm.parentTopic(graph, sibling)?.id === root.id

            graph.resetSelection(root)
            await key(' ')
            const hidden = graph.getNodes().filter((n) => !n.isVisible()).length
            await key(' ')
            const shown = graph.getNodes().every((n) => n.isVisible())

            mindmap['keys'] =
              graph.getNodes().length === before + 2 &&
              childOk &&
              siblingOk &&
              editorOpen &&
              hidden === before + 1 &&
              shown
                ? 'ok'
                : `ng(added=${graph.getNodes().length - before}, child=${childOk}, sibling=${siblingOk}, editor=${editorOpen}, hidden=${hidden}, shown=${shown})`

            // 整列: 動かしたトピックが元の位置へ戻る
            // （キー操作で足したトピックの分だけ配置が変わるので、基準を取る前に一度整列する）
            this.editor.arrangeMindmap()
            const moved = mm.childTopics(graph, root)[0]
            const home = moved.getBBox()
            moved.translate(400, 300)
            this.editor.arrangeMindmap()
            const back = moved.getBBox()
            mindmap['arrange'] =
              Math.abs(back.x - home.x) < 1 && Math.abs(back.y - home.y) < 1
                ? 'ok'
                : `ng(${Math.round(back.x - home.x)},${Math.round(back.y - home.y)})`

            // 矢印キーの移動: ルート → 左右の子 → 親、兄弟の上下、Home でルートへ
            const selectedId = (): string => graph.getSelectedCells()[0]?.id ?? ''
            graph.resetSelection(root)
            await key('ArrowRight')
            const rightChild = selectedId()
            await key('ArrowLeft')
            const backToRoot = selectedId()
            graph.resetSelection(root)
            await key('ArrowLeft')
            const leftChild = selectedId()
            await key('ArrowRight')
            const backToRoot2 = selectedId()
            const rightOk =
              rightChild !== root.id &&
              mm.parentTopic(graph, graph.getCellById(rightChild) as Node)?.id === root.id &&
              (graph.getCellById(rightChild) as Node).getBBox().center.x >
                root.getBBox().center.x
            const leftOk =
              leftChild !== root.id &&
              leftChild !== rightChild &&
              (graph.getCellById(leftChild) as Node).getBBox().center.x <
                root.getBBox().center.x

            // 兄弟の上下移動（子が 2 つ以上ある枝で試す）
            const branch = mm
              .childTopics(graph, root)
              .find((n) => mm.childTopics(graph, n).length >= 2)
            let siblingMove = 'skipped'
            if (branch) {
              const kids = mm.childTopics(graph, branch)
              const sorted = [...kids].sort((a, b) => a.getBBox().y - b.getBBox().y)
              graph.resetSelection(sorted[0])
              await key('ArrowDown')
              const down = selectedId()
              await key('ArrowUp')
              const up = selectedId()
              siblingMove = down === sorted[1].id && up === sorted[0].id ? 'ok' : `ng(${down})`
            }

            graph.resetSelection(mm.childTopics(graph, root)[0])
            await key('Home')
            const home2 = selectedId()

            mindmap['navigate'] =
              rightOk &&
              leftOk &&
              backToRoot === root.id &&
              backToRoot2 === root.id &&
              siblingMove === 'ok' &&
              home2 === root.id
                ? 'ok'
                : `ng(right=${rightOk}, left=${leftOk}, back=${backToRoot === root.id}/${backToRoot2 === root.id}, sibling=${siblingMove}, home=${home2 === root.id})`

            // Ctrl+矢印でトピック自体が動く（選択の移動ではない）
            {
              const target = mm.childTopics(graph, root)[0]
              graph.resetSelection(target)
              const from = target.getBBox()
              await key('ArrowRight', { ctrlKey: true })
              const nudged = target.getBBox()
              await key('ArrowLeft', { ctrlKey: true, shiftKey: true })
              const large = target.getBBox()
              mindmap['nudge'] =
                Math.round(nudged.x - from.x) === 8 && Math.round(large.x - nudged.x) === -40
                  ? 'ok'
                  : `ng(${Math.round(nudged.x - from.x)}, ${Math.round(large.x - nudged.x)})`
              target.position(from.x, from.y)
            }

            // ? キーでショートカット一覧が開き、何か押すと閉じる
            {
              graph.cleanSelection()
              await key('?')
              const overlay = document.querySelector('.shortcut-overlay') as HTMLElement | null
              const opened = overlay !== null && !overlay.hidden
              const groups = overlay?.querySelectorAll('.shortcut-group').length ?? 0
              const rows = overlay?.querySelectorAll('.shortcut-row').length ?? 0
              // 一覧を開いている間のキーは図に効かない（閉じるだけ）
              const before = graph.getNodes().length
              await key('Tab')
              const closed = overlay !== null && overlay.hidden
              mindmap['shortcutOverlay'] =
                opened && groups === 3 && rows > 20 && closed &&
                graph.getNodes().length === before
                  ? 'ok'
                  : `ng(opened=${opened}, groups=${groups}, rows=${rows}, closed=${closed})`
            }

            // 装飾: 数字キーで配色 / B で太字 / +- で文字サイズ / 0 で既定色へ
            {
              const s = await import('./editor/shapes')
              const target = mm.childTopics(graph, root)[0]
              graph.resetSelection(target)
              const baseFill = String(target.attr('body/fill'))
              const baseSize = s.getTextFontSize(target)
              await key('2')
              const colored = String(target.attr('body/fill')) === MINDMAP_TOPIC_PALETTE[1].fill
              await key('b')
              const bold = s.getTextBold(target)
              await key('b')
              const unbold = !s.getTextBold(target)
              await key('+')
              const bigger = s.getTextFontSize(target) === baseSize + MINDMAP_FONT_SIZE.step
              await key('-')
              const restored = s.getTextFontSize(target) === baseSize
              await key('0')
              const reset = String(target.attr('body/fill')) === baseFill
              mindmap['decorate'] =
                colored && bold && unbold && bigger && restored && reset
                  ? 'ok'
                  : `ng(color=${colored}, bold=${bold}/${unbold}, size=${bigger}/${restored}, reset=${reset})`
            }

            // サブツリーの切り取り / 貼り付け（トピックの付け替え）
            {
              const kids = mm.childTopics(graph, root)
              const src = kids.find((n) => mm.childTopics(graph, n).length >= 1)
              const dst = kids.find((n) => src !== undefined && n.id !== src.id)
              if (src && dst) {
                const subtree = mm.subtreeTopics(graph, src).length
                const total = graph.getNodes().length

                graph.resetSelection(src)
                await key('x', { ctrlKey: true })
                const detached = mm.parentTopic(graph, src) === null
                const marked = src.attr('body/strokeDasharray') !== undefined
                const kept = mm.subtreeTopics(graph, src).length === subtree

                // 自分の子孫の下へは貼れない（木が輪になる）
                graph.resetSelection(mm.subtreeTopics(graph, src)[1])
                await key('v', { ctrlKey: true })
                const refused = mm.parentTopic(graph, src) === null

                graph.resetSelection(dst)
                await key('v', { ctrlKey: true })
                const moved = mm.parentTopic(graph, src)?.id === dst.id
                const unmarked = src.attr('body/strokeDasharray') === undefined
                const sameCount = graph.getNodes().length === total

                // コピーはルートの下に複製が増える（元は動かない）
                graph.resetSelection(src)
                await key('c', { ctrlKey: true })
                graph.resetSelection(root)
                await key('v', { ctrlKey: true })
                const copyRoot = graph.getSelectedCells()[0] as Node | undefined
                const copyOk =
                  graph.getNodes().length === total + subtree &&
                  copyRoot !== undefined &&
                  copyRoot.id !== src.id &&
                  mm.parentTopic(graph, copyRoot)?.id === root.id &&
                  mm.parentTopic(graph, src)?.id === dst.id

                // Esc で切り取りを取り消すと元の親へ戻る
                graph.resetSelection(src)
                await key('x', { ctrlKey: true })
                await key('Escape')
                const undone =
                  mm.parentTopic(graph, src)?.id === dst.id &&
                  src.attr('body/strokeDasharray') === undefined

                mindmap['cutPaste'] =
                  detached && marked && kept && refused && moved && unmarked && sameCount &&
                  copyOk && undone
                    ? 'ok'
                    : `ng(detach=${detached}, mark=${marked}, kept=${kept}, refuse=${refused}, move=${moved}, unmark=${unmarked}, count=${sameCount}, copy=${copyOk}, esc=${undone})`

                // 複製は後続のテストに混ざらないよう片付ける
                if (copyRoot) graph.removeCells(mm.subtreeTopics(graph, copyRoot))
              } else {
                mindmap['cutPaste'] = 'skipped'
              }
            }

            // パレットの「枝でつなぐ」: 選択順に親 → 子の枝が 1 本だけ張られる
            {
              const btn = [
                ...document.querySelectorAll('#palette-body .palette-item')
              ].find(
                (b) => b.querySelector('.palette-label')?.textContent === '枝でつなぐ'
              ) as HTMLButtonElement | undefined
              const click = async (): Promise<void> => {
                btn?.click()
                await new Promise((r) => setTimeout(r, 60))
              }
              const parent = mm.childTopics(graph, root)[0]
              const loose = mm.addTopic(graph, '浮いたトピック', {
                centerX: parent.getBBox().center.x,
                centerY: parent.getBBox().center.y + 240
              })
              const edges = graph.getEdges().length

              graph.resetSelection([parent, loose])
              await click()
              const linked = mm.parentTopic(graph, loose)?.id === parent.id
              // 枝以外（メッセージ等）が混ざっていないこと
              const branchOnly =
                graph.getEdges().length === edges + 1 &&
                graph.getEdges().every((e) => getCellKind(e) === 'branch')

              // 既に親がいる子へ二重に張らない
              graph.resetSelection([root, loose])
              await click()
              const noDouble = graph.getEdges().length === edges + 1

              // 輪になる向き（子孫 → 祖先）も断る
              graph.resetSelection([loose, root])
              await click()
              const noCycle = graph.getEdges().length === edges + 1

              mindmap['branchTile'] =
                btn !== undefined && linked && branchOnly && noDouble && noCycle
                  ? 'ok'
                  : `ng(btn=${btn !== undefined}, linked=${linked}, branchOnly=${branchOnly}, double=${noDouble}, cycle=${noCycle})`
              graph.removeCells([loose])
            }
            graph.cleanSelection()
          }
        }
      } catch (e) {
        mindmap['error'] = (e as Error).message
      }

      // 以降の入力テストはアクティビティ図の状態を前提にしているので戻す
      try {
        this.applyDiagramType('activity')
        buildActivityFromText(this.editor, SAMPLE_ACTIVITY)
        await new Promise((r) => setTimeout(r, 100))
      } catch (e) {
        mindmap['restore'] = (e as Error).message
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
        exportDpi,
        exportBounds,
        exports,
        behavior,
        props,
        roundtripVertices,
        roundtripEdges,
        roundtripError,
        legacyVertexRepair,
        fragment,
        activity,
        mindmap
      }
    }
  }

  // ---- 図種別 ----
  private async switchDiagramType(type: DiagramType): Promise<void> {
    if (type === this.diagramType) return
    if (this.editor.graph.getCells().length > 0) {
      // window.confirm は Electron でフォーカス状態を壊す（以降テキスト入力不能に
      // なる）ため、main のネイティブダイアログを使う。
      // 未保存の変更があるときは保存の機会も出したいので 3 択の方に寄せる。
      const ok = this.dirty
        ? await this.confirmDiscard('図種別を切り替える')
        : await window.uml.confirmDialog(
            '図種別を切り替えると現在の図はクリアされます。よろしいですか？'
          )
      if (!ok) {
        this.toolbar.setDiagramType(this.diagramType)
        return
      }
    }
    this.applyDiagramType(type)
    this.newProject()
    this.textInput.value = SAMPLE_TEXT[type]
    this.textError.textContent = ''
  }

  /** エディタ・ツールバー・パレット・内部状態の図種別を揃える（クリアはしない） */
  private applyDiagramType(type: DiagramType): void {
    // 図が入れ替わると控えていたトピックの id は無効になる
    this.mindmapClip = null
    this.diagramType = type
    this.editor.setMode(type)
    this.toolbar.setDiagramType(type)
    this.toolbar.setDecisionShape(this.editor.getDecisionShape())
    this.toolbar.setMindmapLayout(this.editor.getMindmapLayout())
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
    this.mindmapClip = null
    this.textError.textContent = ''
    try {
      if (this.diagramType === 'activity') {
        buildActivityFromText(this.editor, this.textInput.value)
      } else if (this.diagramType === 'mindmap') {
        buildMindmapFromText(this.editor, this.textInput.value, this.editor.getMindmapLayout())
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

  // ---- 外部ゲート付きメッセージ追加（PlantUML の `[-> A` / `A ->]`）----
  //
  // 片端が図の外（座標だけの点）になるメッセージ。相手はライフライン 1 つで
  // 決まるので、接続の 2 要素選択ではなく単独のパレット操作にしている。
  private addGate(direction: 'in' | 'out'): void {
    const graph = this.editor.graph
    const target = this.resolveTargetLifeline()
    if (!target) {
      this.setStatusMessage('ライフラインがありません。先に追加してください。')
      return
    }
    const bbox = target.getBBox()
    const centerX = bbox.x + bbox.width / 2
    const gateX = direction === 'in' ? centerX - MESSAGE.gateLength : centerX + MESSAGE.gateLength
    let created: Edge | null = null
    this.editor.batch(() => {
      created = addGateMessage(graph, target, direction, 'sync', '', {
        y: nextMessageY(graph),
        gateX
      })
    })
    if (created) {
      graph.resetSelection(created)
      this.editor.ensureCellVisible(created)
      const name = getNodeLabel(target)
      this.setStatusMessage(
        direction === 'in'
          ? `図の外から「${name}」へのメッセージを追加しました。ラベルは右パネルかダブルクリックで入力できます。`
          : `「${name}」から図の外へのメッセージを追加しました。ラベルは右パネルかダブルクリックで入力できます。`
      )
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

  // ---- メッセージ / フロー / 枝の追加（選択ベース） ----
  private addConnection(): void {
    const graph = this.editor.graph
    const mode = this.editor.getMode()
    const resolved = resolveConnectionEndpoints(graph, mode)
    if ('error' in resolved) {
      this.setStatusMessage(resolved.error)
      return
    }
    const { source, target } = resolved

    // マインドマップは「親 → 子」の枝。木を壊す繋ぎ方は理由を出して断る
    if (mode === 'mindmap') {
      const check = checkBranch(graph, source, target)
      if (!check.ok) {
        this.setStatusMessage(check.reason)
        return
      }
      let branch: Edge | null = null
      this.editor.batch(() => {
        branch = attachAsChild(graph, source, target, this.editor.getMindmapLayout())
      })
      if (branch) {
        graph.resetSelection(branch)
        this.editor.ensureCellVisible(branch)
      }
      this.setStatusMessage(
        `「${getNodeLabel(source)}」の子として「${getNodeLabel(target)}」を繋ぎました。`
      )
      return
    }

    let created: ReturnType<typeof addMessage> | null = null
    this.editor.batch(() => {
      if (mode === 'activity') {
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

  // ---- マインドマップ ----

  /** 中心トピック（ルート）を追加する */
  private addRootTopic(): void {
    const graph = this.editor.graph
    const c = this.editor.getVisibleCenter()
    let created: Node | null = null
    this.editor.batch(() => {
      created = addRootTopic(graph, '中心トピック', { centerX: c.x, centerY: c.y, depth: 0 })
    })
    this.focusNewTopic(created)
  }

  /**
   * 選択中のトピックを基準に、子（Tab）または兄弟（Enter）を追加する。
   * ルートで兄弟を求められたときは相手がいないので子として足す。
   */
  private addRelatedTopic(relation: 'child' | 'sibling'): void {
    const graph = this.editor.graph
    const selected = this.selectedTopic()
    if (!selected) {
      this.setStatusMessage(
        'トピックを選択してください（無ければ「中心トピック」から追加できます）。'
      )
      return
    }
    const parent =
      relation === 'child' ? selected : (parentTopic(graph, selected) ?? selected)
    const depth = topicDepth(graph, parent) + 1
    const spot = this.nextTopicPlacement(parent)

    let created: Node | null = null
    this.editor.batch(() => {
      created = addTopic(graph, '新しいトピック', {
        centerX: spot.x,
        centerY: spot.y,
        depth
      })
      addBranch(graph, parent, created)
      // 折りたたんだ親に足すと子が見えないので開いておく
      if (isCollapsed(parent)) setCollapsed(parent, false)
      updateMindmapVisibility(graph)
    })
    this.focusNewTopic(created)
  }

  /** 追加したトピックを選択し、そのままラベルを打てる状態にする */
  private focusNewTopic(created: Node | null): void {
    if (!created) return
    this.editor.graph.resetSelection(created)
    this.editor.ensureCellVisible(created)
    this.editor.startLabelEdit(created)
  }

  /**
   * 新しい子トピックの置き場所。既存の兄弟の下、親の外側（親が左へ伸びていれば左）へ置く。
   * 全体の再配置はしない（位置を揃えたいときはツールバーの「整列」）。
   */
  private nextTopicPlacement(parent: Node): { x: number; y: number } {
    const graph = this.editor.graph
    const pb = parent.getBBox()
    const size = MINDMAP.topic
    const siblings = childTopics(graph, parent).filter((n) => n.isVisible())
    const bottom =
      siblings.length > 0 ? Math.max(...siblings.map((n) => n.getBBox().bottom)) : null

    if (this.editor.getMindmapLayout() === 'outline') {
      const top = bottom ?? pb.bottom
      return {
        x: pb.x + MINDMAP.indentX + size.width / 2,
        y: top + MINDMAP.rowGapY + size.height / 2
      }
    }

    // 親がどちら側へ伸びているかを祖父との位置関係で判断する（ルートは右）
    const grand = parentTopic(graph, parent)
    const dir = grand !== null && pb.center.x < grand.getBBox().center.x ? -1 : 1
    return {
      x: pb.center.x + dir * (pb.width / 2 + MINDMAP.levelGapX + size.width / 2),
      y:
        bottom === null
          ? pb.center.y
          : bottom + MINDMAP.siblingGapY + size.height / 2
    }
  }

  // ---- サブツリーの切り取り / 貼り付け（トピックの付け替え） ----
  //
  // 親子は枝なので、付け替えは「枝を外して張り直す」だけで済む。切り取りは
  // ノードを消さずに枝だけ外すので、貼り付けを忘れても図からトピックは消えない
  // （枝を持たない = 独立したルートとして残る）。Esc で元の親へ戻せる。

  /** Ctrl+X: 選択トピックとその子孫を親から切り離して貼り付け待ちにする */
  private cutTopicSubtree(): boolean {
    const graph = this.editor.graph
    const root = this.selectedTopic()
    if (!root) {
      // ノートなど、トピック以外を選んでいるなら共通のクリップボードに任せる
      if (!this.editor.isSelectionEmpty()) return false
      this.setStatusMessage('切り取るトピックを選択してください。')
      return true
    }
    this.cancelTopicCut()
    let formerParentId: string | null = null
    this.editor.batch(() => {
      formerParentId = detachFromParent(graph, root)
      markSubtreeCut(graph, root, true)
      updateMindmapVisibility(graph)
    })
    this.mindmapClip = { mode: 'cut', rootId: root.id, formerParentId }
    this.setStatusMessage(
      '切り取りました。貼り付け先のトピックを選んで Ctrl+V（Esc で元へ戻す）。'
    )
    return true
  }

  /** Ctrl+C: 選択トピックとその子孫を複製元として覚える */
  private copyTopicSubtree(): boolean {
    const root = this.selectedTopic()
    if (!root) return false // トピック以外は共通のクリップボードに任せる
    this.cancelTopicCut()
    this.mindmapClip = { mode: 'copy', rootId: root.id }
    this.setStatusMessage('コピーしました。貼り付け先のトピックを選んで Ctrl+V。')
    return true
  }

  /** Ctrl+V: 覚えているサブツリーを、選択トピックの子として繋ぐ */
  private pasteTopicSubtree(): boolean {
    const clip = this.mindmapClip
    if (!clip) return false // マインドマップの切り取りが無ければ共通の貼り付けへ
    const graph = this.editor.graph
    const source = graph.getCellById(clip.rootId)
    if (!source?.isNode() || !isTopic(source)) {
      this.mindmapClip = null
      this.setStatusMessage('切り取ったトピックが見つかりません。')
      return true
    }
    const target = this.selectedTopic()
    if (!target) {
      this.setStatusMessage('貼り付け先のトピックを選択してください。')
      return true
    }
    // 移動は木が輪になり得るので確認する（複製は別のノードになるので起こらない）
    if (clip.mode === 'cut') {
      const check = canMoveTopic(graph, source, target)
      if (!check.ok) {
        this.setStatusMessage(check.reason)
        return true
      }
    }

    const spot = this.nextTopicPlacement(target)
    let pasted: Node | null = null
    this.editor.batch(() => {
      if (clip.mode === 'cut') markSubtreeCut(graph, source, false)
      const moving = clip.mode === 'copy' ? cloneSubtree(graph, source) : source
      const center = moving.getBBox().center
      moveSubtree(graph, moving, spot.x - center.x, spot.y - center.y)
      attachAsChild(graph, target, moving, this.editor.getMindmapLayout())
      pasted = moving
    })
    this.mindmapClip = null
    if (pasted) {
      graph.resetSelection(pasted)
      this.editor.ensureCellVisible(pasted)
    }
    this.setStatusMessage(
      clip.mode === 'cut' ? 'トピックを移しました。' : 'トピックを複製しました。'
    )
    return true
  }

  /** Esc: 控えている切り取り / コピーを取り消す。控えが無ければ false */
  private cancelTopicCut(): boolean {
    const clip = this.mindmapClip
    this.mindmapClip = null
    if (!clip) return false
    if (clip.mode === 'copy') {
      this.setStatusMessage('コピーを取り消しました。')
      return true
    }
    this.setStatusMessage('切り取りを取り消しました。')

    const graph = this.editor.graph
    const root = graph.getCellById(clip.rootId)
    if (!root?.isNode() || !isTopic(root)) return true
    this.editor.batch(() => {
      markSubtreeCut(graph, root, false)
      const parentId = clip.formerParentId
      const parent = parentId === null ? null : graph.getCellById(parentId)
      // 切り取ったあとに別の親へ繋がれていたら、そのままにする
      if (parent?.isNode() && isTopic(parent) && parentTopic(graph, root) === null) {
        attachAsChild(graph, parent, root, this.editor.getMindmapLayout())
      }
    })
    return true
  }

  /** 選択中のトピック（1 つも選ばれていなければ null） */
  private selectedTopic(): Node | null {
    return this.selectedTopics()[0] ?? null
  }

  /** 選択中のトピックすべて（装飾はまとめて当てられるようにする） */
  private selectedTopics(): Node[] {
    return this.editor.graph
      .getSelectedCells()
      .filter((c): c is Node => c.isNode() && isTopic(c))
  }

  /**
   * 矢印キーで選択を移す。マップ表示では枝の向き（左右）に合わせて
   * ← → の意味が入れ替わる（左の枝では ← が子）。
   */
  private moveTopicSelection(direction: MindmapDirection): void {
    const graph = this.editor.graph
    const current = this.selectedTopic()
    if (!current) {
      // 何も選んでいなければ入口としてルート（無ければ最初のトピック）を選ぶ
      const nodes = mindmapNavNodes(graph)
      const entry = nodes.find((n) => n.parentId === null) ?? nodes[0]
      if (entry) this.selectTopicById(entry.id)
      return
    }
    const nextId = resolveMindmapMove(
      mindmapNavNodes(graph),
      current.id,
      direction,
      this.editor.getMindmapLayout()
    )
    if (nextId === null) return
    this.selectTopicById(nextId)
  }

  /** ルート（選択中のトピックが属する木の根）へ移動する */
  private moveToRoot(): void {
    const nodes = mindmapNavNodes(this.editor.graph)
    const current = this.selectedTopic()
    let id = current?.id ?? nodes.find((n) => n.parentId === null)?.id
    if (id === undefined) return
    for (let i = 0; i < nodes.length; i++) {
      const parentId = nodes.find((n) => n.id === id)?.parentId
      if (parentId === null || parentId === undefined) break
      id = parentId
    }
    this.selectTopicById(id)
  }

  private selectTopicById(id: string): void {
    const node = this.editor.graph.getCellById(id)
    if (!node || !node.isNode()) return
    this.editor.graph.resetSelection(node)
    this.editor.ensureCellVisible(node)
  }

  /** 選択中のトピックすべてに装飾を当てる（何も選ばれていなければ案内を出す） */
  private decorateTopics(apply: (node: Node) => void, message: string): void {
    const topics = this.selectedTopics()
    if (topics.length === 0) {
      this.setStatusMessage('装飾するトピックを選択してください。')
      return
    }
    this.editor.batch(() => {
      for (const node of topics) apply(node)
    })
    this.setDirty(true)
    this.setStatusMessage(message)
  }

  /** 文字サイズを増減し、ラベルに合わせてノードを測り直す */
  private changeTopicFontSize(delta: number): void {
    this.decorateTopics((node) => {
      const size = Math.min(
        MINDMAP_FONT_SIZE.max,
        Math.max(MINDMAP_FONT_SIZE.min, getTextFontSize(node) + delta)
      )
      setTextFontSize(node, size)
      autoSizeNode(node, getNodeLabel(node))
    }, delta > 0 ? '文字を大きくしました。' : '文字を小さくしました。')
  }

  /** 太字を切り替える（複数選択時は先頭の状態に合わせる） */
  private toggleTopicBold(): void {
    const first = this.selectedTopic()
    if (!first) {
      this.setStatusMessage('装飾するトピックを選択してください。')
      return
    }
    const bold = !getTextBold(first)
    this.decorateTopics((node) => {
      setTextBold(node, bold)
      autoSizeNode(node, getNodeLabel(node))
    }, bold ? '太字にしました。' : '太字を解除しました。')
  }

  /**
   * 数字キーの配色。1〜6 はパレット、0 は深さに応じた既定色に戻す。
   */
  private applyTopicColor(index: number): void {
    if (index === 0) {
      const graph = this.editor.graph
      this.decorateTopics(
        (node) => applyTopicLevelStyle(node, topicDepth(graph, node)),
        '配色を既定に戻しました。'
      )
      return
    }
    const style = MINDMAP_TOPIC_PALETTE[index - 1]
    if (!style) return
    this.decorateTopics(
      (node) => applyTopicPalette(node, index - 1),
      `配色を「${style.label}」にしました。`
    )
  }

  /** 選択中のトピックを Ctrl+矢印でずらす（マウスを使わない配置調整） */
  private nudgeTopics(direction: MindmapDirection, step: number): void {
    const topics = this.selectedTopics()
    if (topics.length === 0) {
      this.setStatusMessage('動かすトピックを選択してください。')
      return
    }
    const dx = direction === 'left' ? -step : direction === 'right' ? step : 0
    const dy = direction === 'up' ? -step : direction === 'down' ? step : 0
    this.editor.batch(() => {
      for (const node of topics) node.translate(dx, dy)
    })
    this.editor.ensureCellVisible(topics[0])
  }

  /** 選択中のトピックの名前をその場で編集する（F2） */
  private editSelectedTopic(): void {
    const target = this.selectedTopic()
    if (!target) {
      this.setStatusMessage('編集するトピックを選択してください。')
      return
    }
    this.editor.startLabelEdit(target)
  }

  /** 選択中のトピックの子孫を隠す / 表示する */
  private toggleCollapse(): void {
    const selected = this.selectedTopic()
    if (!selected) {
      this.setStatusMessage('折りたたむトピックを選択してください。')
      return
    }
    if (childTopics(this.editor.graph, selected).length === 0) {
      this.setStatusMessage('このトピックには子がありません。')
      return
    }
    const collapsed = !isCollapsed(selected)
    this.editor.batch(() => {
      setCollapsed(selected, collapsed)
      updateMindmapVisibility(this.editor.graph)
    })
    this.setStatusMessage(
      collapsed
        ? '子孫を折りたたみました（「整列」で詰め直せます）。'
        : '子孫を展開しました。'
    )
  }

  private setMindmapLayout(layout: MindmapLayout): void {
    this.editor.setMindmapLayout(layout)
    this.setDirty(true)
    this.setStatusMessage(
      layout === 'outline'
        ? 'ツリー表示に切り替えました。'
        : 'マインドマップ表示に切り替えました。'
    )
  }

  private arrangeMindmap(): void {
    if (this.editor.graph.getNodes().length === 0) {
      this.setStatusMessage('整列するトピックがありません。')
      return
    }
    this.editor.arrangeMindmap()
    this.editor.fit()
    this.setDirty(true)
    this.setStatusMessage('トピックを整列しました。')
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
      const image = await exportGraphToImage(this.editor.graph, format, { dpi: this.exportDpi })
      const name = this.defaultBaseName()
      const saved = await window.uml.exportImage(image.dataUrl, format, `${name}.${format}`)
      if (!saved) return
      const size = `${image.width}×${image.height}px / ${Math.round(image.dpi)}dpi`
      const note = image.clamped
        ? `（1辺 ${MAX_IMAGE_SIDE}px の上限に合わせて ${image.requestedDpi}dpi から下げました）`
        : ''
      this.setStatusMessage(`書き出しました: ${saved} ${size}${note}`)
    } catch (e) {
      this.setStatusMessage(`書き出しに失敗しました: ${(e as Error).message}`)
    }
  }

  // ---- プロジェクト ----

  /**
   * 未保存の変更を捨てる操作の前に確認する。実行してよければ true。
   * 「保存する」を選んだときは保存まで済ませ、保存がキャンセルされたら中止する。
   */
  private async confirmDiscard(action: string): Promise<boolean> {
    if (!this.dirty) return true
    const name = this.currentPath ?? '(未保存のプロジェクト)'
    const choice = await window.uml.confirmDiscard(name, action)
    if (choice === 'cancel') return false
    if (choice === 'save') return await this.save()
    return true
  }

  /** 「新規」操作（未保存なら確認してから） */
  private async newProjectInteractive(): Promise<void> {
    if (!(await this.confirmDiscard('新規作成する'))) return
    this.newProject()
  }

  /** 図をクリアして未保存状態に戻す（確認はしない） */
  private newProject(): void {
    this.mindmapClip = null
    this.editor.clear()
    this.currentPath = null
    this.setDirty(false)
    this.updateStatus()
  }

  private async open(): Promise<void> {
    if (!(await this.confirmDiscard('開く'))) return
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

  /** 保存できたら true（保存先ダイアログをキャンセルしたら false） */
  private async save(): Promise<boolean> {
    const content = serializeProject(this.editor, this.diagramType)
    const path = await window.uml.saveProject(content, this.currentPath)
    if (!path) return false
    this.currentPath = path
    this.setDirty(false)
    this.updateStatus()
    return true
  }

  private async saveAs(): Promise<boolean> {
    const content = serializeProject(this.editor, this.diagramType)
    const path = await window.uml.saveProjectAs(content, `${this.defaultBaseName()}.umlproj`)
    if (!path) return false
    this.currentPath = path
    this.setDirty(false)
    this.updateStatus()
    return true
  }

  // ---- メニュー / キー ----
  private bindMenu(): void {
    window.uml.onMenu('menu:new', () => void this.newProjectInteractive())
    window.uml.onMenu('menu:open', () => void this.open())
    window.uml.onMenu('menu:save', () => void this.save())
    window.uml.onMenu('menu:save-as', () => void this.saveAs())
    // ウィンドウを閉じる要求。main が close を保留しているので、確認が通ったら
    // 改めて閉じてもらう（キャンセルならそのまま何もしない）
    window.uml.onMenu('menu:close-request', () => {
      void this.confirmDiscard('終了する').then((ok) => {
        if (ok) window.uml.confirmClose()
      })
    })

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

  /**
   * マインドマップ専用のキー割り当て。処理したら true（既定のキー処理は行わない）。
   *
   * 移動（矢印）・追加（Tab/Enter）・折りたたみ（Space）・装飾（数字 / B / +-）を
   * 修飾キー無しで打てるようにしている。図の中に文字入力欄は無いので、単独の
   * 英数字キーを割り当てても入力とぶつからない。
   */
  private handleMindmapKey(e: KeyboardEvent): boolean {
    const ARROWS: Record<string, MindmapDirection> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right'
    }
    const direction = ARROWS[e.key]

    // Ctrl+X / C / V はサブツリー（トピック＋子孫）の切り取り・複製・貼り付け。
    // 対象がトピックでなければ false を返し、共通のクリップボードへ回す。
    if (e.ctrlKey && !e.altKey && !e.shiftKey) {
      const key = e.key.toLowerCase()
      const handler =
        key === 'x'
          ? (): boolean => this.cutTopicSubtree()
          : key === 'c'
            ? (): boolean => this.copyTopicSubtree()
            : key === 'v'
              ? (): boolean => this.pasteTopicSubtree()
              : null
      if (handler) {
        if (!handler()) return false
        e.preventDefault()
        return true
      }
    }

    // Ctrl + 矢印はトピック自体の移動。マウスを使わずに配置を直せるようにする
    // （Ctrl+Z などの共通ショートカットは触らずに素通しする）
    if (e.ctrlKey || e.altKey) {
      if (direction === undefined || e.altKey) return false
      e.preventDefault()
      this.nudgeTopics(direction, e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP)
      return true
    }

    // Esc は切り取り / コピーの取り消し（何も控えていなければ他の処理へ通す）
    if (e.key === 'Escape') {
      if (!this.cancelTopicCut()) return false
      e.preventDefault()
      return true
    }

    if (direction) {
      e.preventDefault()
      this.moveTopicSelection(direction)
      return true
    }
    switch (e.key) {
      case 'Tab':
        e.preventDefault()
        this.addRelatedTopic('child')
        return true
      case 'Enter':
        e.preventDefault()
        this.addRelatedTopic('sibling')
        return true
      case 'F2':
        e.preventDefault()
        this.editSelectedTopic()
        return true
      case ' ':
        e.preventDefault()
        this.toggleCollapse()
        return true
      case 'Home':
        e.preventDefault()
        this.moveToRoot()
        return true
      case 'b':
      case 'B':
        e.preventDefault()
        this.toggleTopicBold()
        return true
      case '+':
      case '=':
        e.preventDefault()
        this.changeTopicFontSize(MINDMAP_FONT_SIZE.step)
        return true
      case '-':
        e.preventDefault()
        this.changeTopicFontSize(-MINDMAP_FONT_SIZE.step)
        return true
      default:
        break
    }
    if (/^[0-9]$/.test(e.key) && Number(e.key) <= MINDMAP_TOPIC_PALETTE.length) {
      e.preventDefault()
      this.applyTopicColor(Number(e.key))
      return true
    }
    return false
  }

  private bindKeys(): void {
    document.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement
      const inEditable =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (inEditable) return

      // ショートカット一覧を開いている間は、読み終えたら何を押しても閉じるだけ
      // （うっかり図が編集されないよう、他のキー処理へは通さない）
      if (this.shortcuts.isOpen()) {
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') return
        e.preventDefault()
        this.shortcuts.close()
        return
      }
      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault()
        this.shortcuts.open(this.diagramType)
        return
      }

      // マインドマップはキーボード主体で編集できるよう、専用の割り当てを持つ
      if (this.diagramType === 'mindmap' && this.handleMindmapKey(e)) return

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
