// X6 へのカスタムシェイプ / アンカー登録（シーケンス図）
//
// メッセージの水平維持の仕組み:
//   - メッセージ edge は floating 接続（ポート無し）で中央に vertex を 1 つ持つ
//   - 両端の anchor に 'uml-centerline' を使うと、隣接参照点（＝中央 vertex）の
//     Y をノード範囲にクランプし (中心X, y) へ投影するため、常に水平になる
//   - 中央 vertex を上下ドラッグするとメッセージ全体が連続的に上下移動する

import { Graph, Point } from '@antv/x6'
import type { Cell, Edge, Node } from '@antv/x6'
import {
  ACTIVATION,
  ACTIVITY,
  FONT_FAMILY,
  LIFELINE,
  MESSAGE,
  SHAPE,
  type CellKind,
  type MessageKind,
  type UmlCellData
} from './constants'

const COLOR = {
  stroke: '#1d2330',
  headFill: '#eef2fb',
  headStroke: '#2d6cdf',
  lifeline: '#5b6472'
} as const

export { FONT_FAMILY }

/** 塗り矢印（同期） */
const MARKER_FILLED = {
  name: 'block',
  size: 12,
  fill: COLOR.stroke,
  stroke: COLOR.stroke
} as const

/** 開矢印（非同期・戻り）。既定マーカーと深いマージが起きるため fill を明示する */
const MARKER_OPEN = {
  name: 'block',
  open: true,
  size: 12,
  fill: 'none',
  stroke: COLOR.stroke,
  strokeWidth: 1.5
} as const

let registered = false

/** カスタムシェイプ・アンカーを X6 に登録する（多重呼び出し可） */
export function registerShapes(): void {
  if (registered) return
  registered = true

  // ---- ライフライン: ヘッダ矩形 + 破線の生存線 + 接続用ヒット領域 ----
  // X6 v3 に calc() 構文は無いため、サイズ依存の座標は lifelineGeometryAttrs で
  // 数値を直接設定する（生成時とリサイズ時に適用）。
  Graph.registerNode(
    SHAPE.lifeline,
    {
      markup: [
        { tagName: 'line', selector: 'life' },
        { tagName: 'rect', selector: 'hit' },
        { tagName: 'rect', selector: 'head' },
        { tagName: 'text', selector: 'label' }
      ],
      attrs: mergeAttrs(
        {
          life: {
            stroke: COLOR.lifeline,
            strokeWidth: 1,
            strokeDasharray: '6 4'
          },
          // 生存線は細くて掴みにくいため、透明の帯をメッセージ接続の起点にする
          hit: {
            fill: 'transparent',
            stroke: 'none',
            magnet: true,
            cursor: 'crosshair'
          },
          head: {
            fill: COLOR.headFill,
            stroke: COLOR.headStroke,
            strokeWidth: 1.2,
            rx: 3,
            cursor: 'move'
          },
          label: {
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT_FAMILY,
            fill: COLOR.stroke,
            pointerEvents: 'none',
            textWrap: { width: -24, height: 36, ellipsis: true, breakWord: true }
          }
        },
        lifelineGeometryAttrs(LIFELINE.width, LIFELINE.defaultHeight)
      )
    },
    true
  )

  // ---- 実行仕様（活性化バー） ----
  Graph.registerNode(
    SHAPE.activation,
    {
      markup: [{ tagName: 'rect', selector: 'body' }],
      attrs: {
        body: {
          refWidth: '100%',
          refHeight: '100%',
          fill: '#f8e8c8',
          stroke: '#a97b28',
          strokeWidth: 1.2,
          cursor: 'move'
        }
      }
    },
    true
  )

  // ---- メッセージ（基本形は同期。種別は messageLineAttrs で差し替え） ----
  Graph.registerEdge(
    SHAPE.message,
    {
      attrs: {
        line: {
          stroke: COLOR.stroke,
          strokeWidth: 1.5,
          targetMarker: MARKER_FILLED
        },
        wrap: {
          strokeWidth: 12
        }
      },
      defaultLabel: {
        markup: [
          { tagName: 'rect', selector: 'bg' },
          { tagName: 'text', selector: 'text' }
        ],
        attrs: {
          text: {
            fontSize: 12,
            fontFamily: FONT_FAMILY,
            fill: COLOR.stroke,
            textAnchor: 'middle',
            textVerticalAnchor: 'bottom',
            pointerEvents: 'none'
          },
          bg: {
            ref: 'text',
            fill: '#fbfbfd',
            opacity: 0.85,
            refWidth: '100%',
            refHeight: '100%',
            refX: 0,
            refY: 0
          }
        },
        position: { distance: 0.5, offset: { x: 0, y: -6 } }
      }
    },
    true
  )

  // ---- アクティビティ図のノード（上下左右ポートから接続できる） ----

  const portAttrs = {
    circle: {
      r: 4,
      magnet: true,
      stroke: COLOR.headStroke,
      fill: '#ffffff',
      strokeWidth: 1.5
    }
  }
  const activityPorts = {
    groups: {
      top: { position: 'top', attrs: portAttrs },
      right: { position: 'right', attrs: portAttrs },
      bottom: { position: 'bottom', attrs: portAttrs },
      left: { position: 'left', attrs: portAttrs }
    },
    items: [
      { group: 'top', id: 'top' },
      { group: 'right', id: 'right' },
      { group: 'bottom', id: 'bottom' },
      { group: 'left', id: 'left' }
    ]
  }

  const centeredLabel = {
    refX: '50%',
    refY: '50%',
    textAnchor: 'middle',
    textVerticalAnchor: 'middle',
    fontSize: 13,
    fontFamily: FONT_FAMILY,
    fill: COLOR.stroke,
    pointerEvents: 'none'
  }

  Graph.registerNode(
    SHAPE.action,
    {
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'text', selector: 'label' }
      ],
      attrs: {
        body: {
          refWidth: '100%',
          refHeight: '100%',
          rx: 12,
          fill: '#ffffff',
          stroke: COLOR.headStroke,
          strokeWidth: 1.2,
          cursor: 'move'
        },
        label: { ...centeredLabel, textWrap: { width: -28, breakWord: true } }
      },
      ports: activityPorts
    },
    true
  )

  Graph.registerNode(
    SHAPE.decision,
    {
      markup: [
        { tagName: 'polygon', selector: 'body' },
        { tagName: 'text', selector: 'label' }
      ],
      attrs: {
        body: {
          refPoints: '0,10 10,0 20,10 10,20',
          fill: '#ffffff',
          stroke: '#b7791f',
          strokeWidth: 1.2,
          cursor: 'move'
        },
        label: {
          ...centeredLabel,
          fontSize: 12,
          textWrap: { width: '55%', breakWord: true }
        }
      },
      ports: activityPorts
    },
    true
  )

  Graph.registerNode(
    SHAPE.initial,
    {
      markup: [{ tagName: 'circle', selector: 'body' }],
      attrs: {
        body: {
          refCx: '50%',
          refCy: '50%',
          refR: '50%',
          fill: COLOR.stroke,
          stroke: 'none',
          cursor: 'move'
        }
      },
      ports: activityPorts
    },
    true
  )

  Graph.registerNode(
    SHAPE.final,
    {
      markup: [
        { tagName: 'circle', selector: 'outer' },
        { tagName: 'circle', selector: 'inner' }
      ],
      attrs: {
        outer: {
          refCx: '50%',
          refCy: '50%',
          refR: '50%',
          fill: '#ffffff',
          stroke: COLOR.stroke,
          strokeWidth: 1.5,
          cursor: 'move'
        },
        inner: {
          refCx: '50%',
          refCy: '50%',
          refR: '30%',
          fill: COLOR.stroke,
          stroke: 'none',
          pointerEvents: 'none'
        }
      },
      ports: activityPorts
    },
    true
  )

  Graph.registerNode(
    SHAPE.bar,
    {
      markup: [{ tagName: 'rect', selector: 'body' }],
      attrs: {
        body: {
          refWidth: '100%',
          refHeight: '100%',
          rx: 2,
          fill: COLOR.stroke,
          stroke: 'none',
          cursor: 'move'
        }
      },
      ports: activityPorts
    },
    true
  )

  Graph.registerNode(
    SHAPE.swimlane,
    {
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'rect', selector: 'header' },
        { tagName: 'text', selector: 'label' }
      ],
      attrs: {
        body: {
          refWidth: '100%',
          refHeight: '100%',
          fill: '#fafbfe',
          stroke: '#c3c9d4',
          strokeWidth: 1
        },
        header: {
          refWidth: '100%',
          height: ACTIVITY.laneHeaderHeight,
          fill: COLOR.headFill,
          stroke: '#c3c9d4',
          strokeWidth: 1,
          cursor: 'move'
        },
        label: {
          refX: '50%',
          y: ACTIVITY.laneHeaderHeight / 2,
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: FONT_FAMILY,
          fill: COLOR.stroke,
          pointerEvents: 'none'
        }
      }
    },
    true
  )

  // ---- フロー（アクティビティ図のエッジ: 直交ルーティング） ----
  Graph.registerEdge(
    SHAPE.flow,
    {
      router: { name: 'manhattan', args: { padding: 16 } },
      connector: { name: 'rounded', args: { radius: 8 } },
      attrs: {
        line: {
          stroke: COLOR.stroke,
          strokeWidth: 1.5,
          targetMarker: MARKER_OPEN
        },
        wrap: {
          strokeWidth: 12
        }
      },
      defaultLabel: {
        markup: [
          { tagName: 'rect', selector: 'bg' },
          { tagName: 'text', selector: 'text' }
        ],
        attrs: {
          text: {
            fontSize: 12,
            fontFamily: FONT_FAMILY,
            fill: COLOR.stroke,
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
            pointerEvents: 'none'
          },
          bg: {
            ref: 'text',
            fill: '#fbfbfd',
            opacity: 0.85,
            refWidth: '100%',
            refHeight: '100%',
            refX: 0,
            refY: 0
          }
        },
        position: { distance: 0.5 }
      }
    },
    true
  )

  // ---- 中心線アンカー ----
  // 参照点（隣接 vertex または相手側端点）の Y をノードの縦範囲にクランプし、
  // ノード中心 X へ投影する。ライフラインはヘッダ下端より上には付かない。
  // シーケンス図以外のノードには中心を返す（フロー edge は別アンカーを持つ）。
  Graph.registerAnchor(
    SHAPE.centerlineAnchor,
    function (nodeView, magnet, ref, _args, type) {
      const node = nodeView.cell as Node
      const bbox = node.getBBox()
      const cx = bbox.x + bbox.width / 2
      const kind = getCellKind(node)

      if (kind !== 'lifeline' && kind !== 'activation') {
        // アクティビティ系ノード: ポート magnet を掴んでいるならその中心
        // （＝ノード辺上）に付ける。magnet は自ビュー配下なので測ってよい。
        if (magnet instanceof Element && magnet !== nodeView.container) {
          const view = nodeView as unknown as {
            getBBoxOfElement?: (
              el: Element
            ) => { x: number; y: number; width: number; height: number }
          }
          const mb = view.getBBoxOfElement?.(magnet)
          if (mb) return new Point(mb.x + mb.width / 2, mb.y + mb.height / 2)
        }
        return new Point(cx, bbox.y + bbox.height / 2)
      }

      let refY = bbox.y + bbox.height / 2
      if (ref && typeof (ref as { y?: unknown }).y === 'number') {
        refY = (ref as { y: number }).y
      } else {
        // 参照が SVG 要素（相手側 magnet）の場合は、要素を直接測らず
        // 相手側ターミナルのセル中心 Y を使う（別ビューの要素を自ビューで
        // 測ると DOM を遡ってクラッシュするため）
        const edgeView = this as unknown as {
          sourceView?: { cell?: Cell } | null
          targetView?: { cell?: Cell } | null
        }
        const otherCell =
          type === 'source' ? edgeView.targetView?.cell : edgeView.sourceView?.cell
        if (otherCell && otherCell.isNode()) {
          const ob = (otherCell as Node).getBBox()
          refY = ob.y + ob.height / 2
        }
      }

      const minY = bbox.y + (kind === 'lifeline' ? LIFELINE.headHeight + 4 : 0)
      const maxY = bbox.y + bbox.height
      const y = Math.min(Math.max(refY, minY), maxY)
      void magnet
      return new Point(cx, y)
    },
    true
  )
}

type AttrsBySelector = Record<string, Record<string, unknown>>

/** セレクタ単位で属性オブジェクトをマージする */
function mergeAttrs(base: AttrsBySelector, extra: AttrsBySelector): never {
  const out: AttrsBySelector = { ...base }
  for (const [selector, values] of Object.entries(extra)) {
    out[selector] = { ...out[selector], ...values }
  }
  return out as never
}

/** ライフラインのサイズ依存ジオメトリ属性（生成時・リサイズ時に適用する） */
export function lifelineGeometryAttrs(
  width: number,
  height: number
): Record<string, Record<string, number>> {
  const cx = width / 2
  return {
    life: { x1: cx, y1: LIFELINE.headHeight, x2: cx, y2: height },
    hit: { x: cx - 8, y: LIFELINE.headHeight, width: 16, height: Math.max(0, height - LIFELINE.headHeight) },
    head: { x: 0, y: 0, width, height: LIFELINE.headHeight },
    label: { x: cx, y: LIFELINE.headHeight / 2 }
  }
}

/** ライフラインの現在サイズにジオメトリ属性を合わせる */
export function applyLifelineGeometry(node: Node): void {
  const size = node.getSize()
  const attrs = lifelineGeometryAttrs(size.width, size.height)
  for (const [selector, values] of Object.entries(attrs)) {
    for (const [name, value] of Object.entries(values)) {
      node.attr(`${selector}/${name}`, value)
    }
  }
}

// ---- 種別ユーティリティ ----

export function getCellKind(cell: Cell | null | undefined): CellKind {
  const data = cell?.getData<UmlCellData>()
  return data?.kind ?? 'unknown'
}

export function getMessageKind(cell: Cell | null | undefined): MessageKind {
  const data = cell?.getData<UmlCellData>()
  return data?.msgKind ?? 'sync'
}

/** メッセージ種別ごとの線・矢印スタイル */
export function messageLineAttrs(kind: MessageKind): Record<string, unknown> {
  switch (kind) {
    case 'async':
      return { strokeDasharray: null, targetMarker: MARKER_OPEN }
    case 'return':
      return { strokeDasharray: '5 3', targetMarker: MARKER_OPEN }
    case 'self':
    case 'sync':
    default:
      return { strokeDasharray: null, targetMarker: MARKER_FILLED }
  }
}

/** メッセージ edge の種別を切り替える（スタイル + data を更新） */
export function setMessageKind(edge: Edge, kind: MessageKind): void {
  const data = { ...(edge.getData<UmlCellData>() ?? { kind: 'message' }), msgKind: kind }
  edge.setData(data, { overwrite: true })
  edge.attr('line', messageLineAttrs(kind) as never)

  const sameTerminal =
    edge.getSourceCellId() !== '' && edge.getSourceCellId() === edge.getTargetCellId()
  const vertices = edge.getVertices()
  if (kind === 'self' && sameTerminal) {
    // 自己メッセージ: 右側へ張り出すループにする
    const y = vertices[0]?.y ?? MESSAGE.startY
    const srcCell = edge.getSourceCell()
    const cx = srcCell ? srcCell.getBBox().x + srcCell.getBBox().width / 2 : 0
    edge.setVertices([
      { x: cx + MESSAGE.selfWidth, y },
      { x: cx + MESSAGE.selfWidth, y: y + MESSAGE.selfHeight }
    ])
  } else if (kind !== 'self' && vertices.length > 1) {
    // ループから通常へ戻す: 中央 vertex 1 つに畳む
    edge.setVertices([vertices[0]])
  }

  // 種別によってラベル位置が変わるため再設定する
  const text = getMessageLabel(edge)
  if (text !== '') setMessageLabel(edge, text)
}

/** メッセージのラベル文字列を取得 */
export function getMessageLabel(edge: Edge): string {
  const label = edge.getLabelAt(0)
  const attrs = label?.attrs as { text?: { text?: string } } | undefined
  return attrs?.text?.text ?? ''
}

/** メッセージのラベル文字列を設定 */
export function setMessageLabel(edge: Edge, text: string): void {
  if (text === '') {
    while (edge.getLabels().length > 0) edge.removeLabelAt(0)
    return
  }
  // 自己メッセージはループ上辺（水平区間）の中央に置く。
  // distance はポリライン全長に対する比率で、ループは 上辺60 + 縦32 + 下辺60。
  const isSelf = getMessageKind(edge) === 'self'
  const label = {
    attrs: { text: { text } },
    position: { distance: isSelf ? 0.2 : 0.5, offset: { x: 0, y: -6 } }
  }
  if (edge.getLabels().length > 0) edge.setLabelAt(0, label)
  else edge.appendLabel(label)
}

/** ライフライン名の取得/設定 */
export function getNodeLabel(node: Node): string {
  const v = node.attr('label/text')
  return typeof v === 'string' ? v : ''
}

export function setNodeLabel(node: Node, text: string): void {
  node.attr('label/text', text)
}

export { ACTIVATION, LIFELINE, MESSAGE }
