// プロジェクトの JSON エンベロープ処理（X6 非依存・純関数）

export type DiagramType = 'sequence' | 'activity'

export interface ProjectEnvelope {
  format: 'umltool-project'
  version: number
  diagramType: DiagramType
  /** X6 の graph.toJSON() が返すモデルオブジェクト */
  graph: Record<string, unknown>
}

export const PROJECT_FORMAT = 'umltool-project'
export const PROJECT_VERSION = 2

/** グラフモデルと図種別を JSON エンベロープ文字列に包む */
export function wrapEnvelope(graph: Record<string, unknown>, diagramType: DiagramType): string {
  const env: ProjectEnvelope = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    diagramType,
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
  const diagramType: DiagramType = env.diagramType === 'activity' ? 'activity' : 'sequence'
  return {
    format: PROJECT_FORMAT,
    version: env.version ?? PROJECT_VERSION,
    diagramType,
    graph: env.graph as Record<string, unknown>
  }
}
