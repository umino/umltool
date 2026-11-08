// コネクタ（結合子。いわゆる「おたまじゃくし」）のファクトリ。全図種で使える。
//
// 中にラベルを書いた小さな円で、同じラベルのコネクタ同士は線が続いていることを
// 表す（遠くへ伸びる線や、交差する線を省くための UML 記法）。

import type { Graph, Node } from '@antv/x6'
import { CONNECTOR, SHAPE, Z } from './constants'
import { getCellKind } from './shapes'

/** コネクタを中心座標に追加する */
export function addConnectorNode(
  graph: Graph,
  label: string,
  center: { x: number; y: number }
): Node {
  return graph.addNode({
    shape: SHAPE.connector,
    x: center.x - CONNECTOR.size / 2,
    y: center.y - CONNECTOR.size / 2,
    width: CONNECTOR.size,
    height: CONNECTOR.size,
    attrs: { label: { text: label } },
    data: { kind: 'connector' },
    zIndex: Z.node
  })
}

export { nextConnectorLabel } from './connectorLabel'

/** 図にあるコネクタのラベル一覧 */
export function connectorLabels(graph: Graph): string[] {
  return graph
    .getNodes()
    .filter((n) => getCellKind(n) === 'connector')
    .map((n) => String(n.attr('label/text') ?? ''))
}
