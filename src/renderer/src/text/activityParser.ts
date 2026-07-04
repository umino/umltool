// PlantUML アクティビティ構文サブセットのパーサー（ライブラリ非依存・純関数）
//
// 対応構文:
//   start / stop / end
//   :アクション;
//   if (条件) then (yes) … else (no) … endif
//   fork … fork again … end fork
//   |レーン名|
//   コメント: 行頭 ' # //、@startuml/@enduml/title は無視

import type { ActivityNodeKind } from '../editor/constants'
import { ParseError } from './sequenceParser'

export interface ActivityNode {
  id: string
  kind: ActivityNodeKind
  label: string
  lane: string | null
  /** 分岐・フォークによる横方向の列（0 起点） */
  col: number
}

export interface ActivityEdge {
  from: string
  to: string
  label: string
}

export interface ParsedActivity {
  nodes: ActivityNode[]
  edges: ActivityEdge[]
  lanes: string[]
}

const RE = {
  comment: /^\s*(?:'|#|\/\/)/,
  skip: /^(?:@startuml|@enduml|title\b)/i,
  start: /^start$/i,
  stop: /^(?:stop|end)$/i,
  action: /^:(.*);$/,
  if: /^if\s*\((.*?)\)\s*then(?:\s*\((.*?)\))?$/i,
  else: /^else(?:\s*\((.*?)\))?$/i,
  endif: /^endif$/i,
  fork: /^fork$/i,
  forkAgain: /^fork\s+again$/i,
  endFork: /^end\s*fork$/i,
  lane: /^\|(.+?)\|$/
}

interface IfFrame {
  type: 'if'
  decisionId: string
  baseCol: number
  branchEnds: string[]
  hasElse: boolean
}

interface ForkFrame {
  type: 'fork'
  forkId: string
  baseCol: number
  nextCol: number
  branchEnds: string[]
}

type Frame = IfFrame | ForkFrame

export function parseActivity(text: string): ParsedActivity {
  const nodes: ActivityNode[] = []
  const edges: ActivityEdge[] = []
  const lanes: string[] = []

  let cursor: string | null = null
  let pendingLabel = ''
  let currentLane: string | null = null
  let currentCol = 0
  const frames: Frame[] = []

  const rawNode = (kind: ActivityNodeKind, label: string): string => {
    const id = `a${nodes.length}`
    nodes.push({ id, kind, label, lane: currentLane, col: currentCol })
    return id
  }

  const flowNode = (kind: ActivityNodeKind, label: string): string => {
    const id = rawNode(kind, label)
    if (cursor !== null) {
      edges.push({ from: cursor, to: id, label: pendingLabel })
    }
    pendingLabel = ''
    cursor = id
    return id
  }

  const lines = text.split(/\r?\n/)
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1
    const line = raw.trim()
    if (line === '' || RE.comment.test(raw) || RE.skip.test(line)) return

    let m: RegExpExecArray | null

    if (RE.start.test(line)) {
      flowNode('initial', '')
      return
    }
    if (RE.stop.test(line)) {
      flowNode('final', '')
      cursor = null
      return
    }
    if ((m = RE.action.exec(line))) {
      const label = m[1].trim()
      if (label === '') throw new ParseError('アクション名が空です', lineNo)
      flowNode('action', label)
      return
    }
    if ((m = RE.if.exec(line))) {
      const decisionId = flowNode('decision', m[1].trim())
      frames.push({
        type: 'if',
        decisionId,
        baseCol: currentCol,
        branchEnds: [],
        hasElse: false
      })
      pendingLabel = (m[2] ?? '').trim()
      return
    }
    if ((m = RE.else.exec(line))) {
      const frame = frames[frames.length - 1]
      if (!frame || frame.type !== 'if') {
        throw new ParseError('対応する if のない else です', lineNo)
      }
      if (frame.hasElse) throw new ParseError('else が重複しています', lineNo)
      if (cursor !== null) frame.branchEnds.push(cursor)
      frame.hasElse = true
      cursor = frame.decisionId
      pendingLabel = (m[1] ?? '').trim()
      currentCol = frame.baseCol + 1
      return
    }
    if (RE.endif.test(line)) {
      const frame = frames.pop()
      if (!frame || frame.type !== 'if') {
        throw new ParseError('対応する if のない endif です', lineNo)
      }
      const ends = [...frame.branchEnds]
      if (cursor !== null && cursor !== frame.decisionId) ends.push(cursor)
      currentCol = frame.baseCol
      cursor = null
      pendingLabel = ''
      const mergeId = rawNode('decision', '')
      for (const end of ends) edges.push({ from: end, to: mergeId, label: '' })
      // else 節が無い場合は「偽」側を直接合流へ流す
      if (!frame.hasElse) edges.push({ from: frame.decisionId, to: mergeId, label: '' })
      cursor = mergeId
      return
    }
    // fork again は fork より先に判定する
    if (RE.forkAgain.test(line)) {
      const frame = frames[frames.length - 1]
      if (!frame || frame.type !== 'fork') {
        throw new ParseError('対応する fork のない fork again です', lineNo)
      }
      if (cursor !== null) frame.branchEnds.push(cursor)
      frame.nextCol += 1
      currentCol = frame.nextCol
      cursor = frame.forkId
      pendingLabel = ''
      return
    }
    if (RE.endFork.test(line)) {
      const frame = frames.pop()
      if (!frame || frame.type !== 'fork') {
        throw new ParseError('対応する fork のない end fork です', lineNo)
      }
      const ends = [...frame.branchEnds]
      if (cursor !== null && cursor !== frame.forkId) ends.push(cursor)
      currentCol = frame.baseCol
      cursor = null
      pendingLabel = ''
      const joinId = rawNode('join', '')
      for (const end of ends) edges.push({ from: end, to: joinId, label: '' })
      cursor = joinId
      return
    }
    if (RE.fork.test(line)) {
      const forkId = flowNode('fork', '')
      frames.push({
        type: 'fork',
        forkId,
        baseCol: currentCol,
        nextCol: currentCol,
        branchEnds: []
      })
      return
    }
    if ((m = RE.lane.exec(line))) {
      const name = m[1].trim()
      if (name === '') throw new ParseError('レーン名が空です', lineNo)
      if (!lanes.includes(name)) lanes.push(name)
      currentLane = name
      return
    }

    throw new ParseError(`解釈できない行です: "${line}"`, lineNo)
  })

  if (frames.length > 0) {
    const frame = frames[frames.length - 1]
    const what = frame.type === 'if' ? 'if が endif' : 'fork が end fork'
    throw new ParseError(`${what} で閉じられていません`, lines.length)
  }

  return { nodes, edges, lanes }
}
