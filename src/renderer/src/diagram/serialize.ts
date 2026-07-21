// X6 モデル ⇄ .umlproj エンベロープの相互変換

import type { GraphEditor } from '../editor/GraphEditor'
import { parseEnvelope, wrapEnvelope, type DiagramType } from './envelope'

export type { DiagramType }

/** 現在のグラフをプロジェクト文字列に直列化する */
export function serializeProject(editor: GraphEditor, diagramType: DiagramType): string {
  const model = editor.graph.toJSON() as unknown as Record<string, unknown>
  return wrapEnvelope(model, diagramType, { decisionShape: editor.getDecisionShape() })
}

/** プロジェクト文字列を検証してグラフへ読み込む。図種別を返す */
export function loadProject(editor: GraphEditor, content: string): DiagramType {
  const env = parseEnvelope(content)
  editor.graph.fromJSON(env.graph as Parameters<typeof editor.graph.fromJSON>[0])
  // 図形は保存されたノード属性にも入っているが、以降に追加されるノードへ
  // 引き継ぐためエディタ側の設定も合わせる
  editor.setDecisionShape(env.settings.decisionShape)
  editor.graph.cleanHistory()
  return env.diagramType
}
