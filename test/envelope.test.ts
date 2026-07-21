import { describe, it, expect } from 'vitest'
import {
  parseEnvelope,
  wrapEnvelope,
  PROJECT_FORMAT,
  PROJECT_VERSION
} from '../src/renderer/src/diagram/envelope'

describe('project envelope', () => {
  it('wrap → parse でラウンドトリップする', () => {
    const model = { cells: [{ id: 'a', shape: 'uml-lifeline' }] }
    const env = parseEnvelope(wrapEnvelope(model, 'sequence'))
    expect(env.format).toBe(PROJECT_FORMAT)
    expect(env.version).toBe(PROJECT_VERSION)
    expect(env.diagramType).toBe('sequence')
    expect(env.graph).toEqual(model)
  })

  it('activity 図種別を保持する', () => {
    const env = parseEnvelope(wrapEnvelope({ cells: [] }, 'activity'))
    expect(env.diagramType).toBe('activity')
  })

  it('不正な JSON でエラー', () => {
    expect(() => parseEnvelope('{not json')).toThrow(/JSON/)
  })

  it('別フォーマットを拒否する', () => {
    expect(() => parseEnvelope(JSON.stringify({ format: 'other', graph: {} }))).toThrow(
      /プロジェクトファイル/
    )
  })

  it('graph 欠落を拒否する', () => {
    expect(() => parseEnvelope(JSON.stringify({ format: PROJECT_FORMAT }))).toThrow(/図データ/)
  })

  it('旧形式（graph が XML 文字列）を明示エラーで拒否する', () => {
    const v1 = JSON.stringify({
      format: PROJECT_FORMAT,
      version: 1,
      diagramType: 'sequence',
      graph: '<mxGraphModel><root/></mxGraphModel>'
    })
    expect(() => parseEnvelope(v1)).toThrow(/旧形式/)
  })
})

describe('プロジェクト設定（settings）', () => {
  it('既定では菱形として書き出す', () => {
    const env = parseEnvelope(wrapEnvelope({ cells: [] }, 'activity'))
    expect(env.settings.decisionShape).toBe('diamond')
  })

  it('指定した分岐図形が往復する', () => {
    const text = wrapEnvelope({ cells: [] }, 'activity', { decisionShape: 'hexagon' })
    expect(parseEnvelope(text).settings.decisionShape).toBe('hexagon')
  })

  it('settings が無い旧ファイルは既定値になる', () => {
    const legacy = JSON.stringify({
      format: 'umltool-project',
      version: 2,
      diagramType: 'activity',
      graph: { cells: [] }
    })
    expect(parseEnvelope(legacy).settings.decisionShape).toBe('diamond')
  })

  it('未知の分岐図形は既定値に倒す', () => {
    const broken = JSON.stringify({
      format: 'umltool-project',
      version: 2,
      diagramType: 'activity',
      settings: { decisionShape: 'triangle' },
      graph: { cells: [] }
    })
    expect(parseEnvelope(broken).settings.decisionShape).toBe('diamond')
  })
})
