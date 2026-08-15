// プロジェクトの JSON エンベロープ処理（X6 非依存・純関数）

import {
  DEFAULT_DECISION_SHAPE,
  DEFAULT_MINDMAP_LAYOUT,
  type DecisionShape,
  type MindmapLayout
} from '../editor/constants'

export type DiagramType = 'sequence' | 'activity' | 'mindmap'

/** 図全体に効く設定。増えても後方互換を保てるよう、欠けていれば既定値を使う */
export interface ProjectSettings {
  decisionShape: DecisionShape
  /** マインドマップの表示スタイル */
  mindmapLayout: MindmapLayout
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  decisionShape: DEFAULT_DECISION_SHAPE,
  mindmapLayout: DEFAULT_MINDMAP_LAYOUT
}

export interface ProjectEnvelope {
  format: 'umltool-project'
  version: number
  diagramType: DiagramType
  settings: ProjectSettings
  /** X6 の graph.toJSON() が返すモデルオブジェクト */
  graph: Record<string, unknown>
}

export const PROJECT_FORMAT = 'umltool-project'
export const PROJECT_VERSION = 2

/** グラフモデルと図種別を JSON エンベロープ文字列に包む */
export function wrapEnvelope(
  graph: Record<string, unknown>,
  diagramType: DiagramType,
  settings: Partial<ProjectSettings> = {}
): string {
  const env: ProjectEnvelope = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    diagramType,
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...settings },
    graph
  }
  return JSON.stringify(env, null, 2)
}

/** JSON エンベロープ文字列を検証して分解する */
export function parseEnvelope(content: string): ProjectEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('プロジェクトファイルの JSON が不正です')
  }
  const env = parsed as Partial<ProjectEnvelope> & { graph?: unknown }
  if (env.format !== PROJECT_FORMAT) {
    throw new Error('UmlTool のプロジェクトファイルではありません')
  }
  if (typeof env.graph === 'string') {
    throw new Error(
      '旧形式（version 1 / maxGraph）のプロジェクトはこのバージョンでは読み込めません'
    )
  }
  if (typeof env.graph !== 'object' || env.graph === null) {
    throw new Error('プロジェクトファイルに図データがありません')
  }
  // 知らない図種別は既定（シーケンス図）に倒す
  const diagramType: DiagramType =
    env.diagramType === 'activity' || env.diagramType === 'mindmap'
      ? env.diagramType
      : 'sequence'
  // settings は後から足したフィールドなので、無い/壊れている場合は既定値に倒す
  const settings = env.settings as Partial<ProjectSettings> | undefined
  return {
    format: PROJECT_FORMAT,
    version: env.version ?? PROJECT_VERSION,
    diagramType,
    settings: {
      decisionShape: settings?.decisionShape === 'hexagon' ? 'hexagon' : DEFAULT_DECISION_SHAPE,
      mindmapLayout:
        settings?.mindmapLayout === 'outline' ? 'outline' : DEFAULT_MINDMAP_LAYOUT
    },
    graph: env.graph as Record<string, unknown>
  }
}
