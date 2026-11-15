// PlantUML アクティビティ構文サブセットのパーサー（ライブラリ非依存・純関数）
//
// 対応構文:
//   start / stop / end
//   :アクション;
//   if (条件) then (yes) … else (no) … endif
//   fork … fork again … end fork
//   while (条件) is (yes) … endwhile (no)
//   repeat … repeat while (条件) is (yes) not (no)
//   break（もっとも内側の while / repeat を抜ける）
//   continue（もっとも内側の while / repeat の条件へ戻る。PlantUML には無い拡張）
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
  lane: /^\|(.+?)\|$/,
  while: /^while\s*\((.*?)\)(?:\s*is\s*\((.*?)\))?$/i,
  endwhile: /^end\s*while(?:\s*\((.*?)\))?$/i,
  repeat: /^repeat$/i,
  repeatWhile: /^repeat\s+while\s*\((.*?)\)(?:\s*is\s*\((.*?)\))?(?:\s*not\s*\((.*?)\))?$/i,
  break: /^break$/i,
  continue: /^continue$/i
}

/**
 * 分岐の各枝の終端。
 *
 * 枝に中身があれば終端はその最後のノードで、分岐ラベル（yes/no）は既に
 * decision → 先頭ノードの edge が消費しているため label は空。枝が空の場合は
 * 終端が decision 自身になり、合流へ引く edge がラベルを持つ必要がある。
 */
interface BranchEnd {
  id: string
  label: string
}

interface IfFrame {
  type: 'if'
  decisionId: string
  baseCol: number
  branchEnds: BranchEnd[]
  hasElse: boolean
}

interface ForkFrame {
  type: 'fork'
  forkId: string
  baseCol: number
  nextCol: number
  branchEnds: string[]
}

/** while: 条件の分岐へ本体の最後から戻る。break した位置は抜けた先で合流する */
interface WhileFrame {
  type: 'while'
  decisionId: string
  baseCol: number
  breaks: BranchEnd[]
}

/** repeat: 先頭の合流点へ、末尾の条件分岐から戻る */
interface RepeatFrame {
  type: 'repeat'
  startId: string
  breaks: BranchEnd[]
  /** continue した位置。末尾の条件分岐ができたらそこへ繋ぐ */
  continues: BranchEnd[]
}

type Frame = IfFrame | ForkFrame | WhileFrame | RepeatFrame

const FRAME_OPEN: Record<Frame['type'], string> = {
  if: 'if が endif',
  fork: 'fork が end fork',
  while: 'while が endwhile',
  repeat: 'repeat が repeat while'
}

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

  /**
   * 枝の終端を作る。終端が decision 自身＝枝が空なので、未消費の分岐ラベルを
   * 合流への edge に引き継ぐ
   */
  const branchEnd = (endId: string, decisionId: string): BranchEnd => ({
    id: endId,
    label: endId === decisionId ? pendingLabel : ''
  })

  /**
   * ループを抜けた先を決める。break が無ければ条件分岐から（pendingLabel を
   * 付けて）そのまま続け、あれば合流点を作って break した位置もそこへ集める。
   */
  const closeLoop = (decisionId: string, breaks: BranchEnd[]): void => {
    if (breaks.length === 0) {
      cursor = decisionId
      return
    }
    const mergeId = rawNode('merge', '')
    edges.push({ from: decisionId, to: mergeId, label: pendingLabel })
    for (const b of breaks) edges.push({ from: b.id, to: mergeId, label: b.label })
    pendingLabel = ''
    cursor = mergeId
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
      // どこからも流れ着かない stop（直前の枝がすべて stop 済み等）は置かない
      if (cursor === null && nodes.length > 0) return
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
      if (cursor !== null) frame.branchEnds.push(branchEnd(cursor, frame.decisionId))
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
      if (cursor !== null) ends.push(branchEnd(cursor, frame.decisionId))
      // else 節が無い場合は「偽」側を直接合流へ流す。ただし then 節も空だった
      // ときは既に decision 発の終端があるので二重に引かない
      if (!frame.hasElse && !ends.some((e) => e.id === frame.decisionId)) {
        ends.push({ id: frame.decisionId, label: '' })
      }
      currentCol = frame.baseCol
      pendingLabel = ''
      // どの枝も stop / break で終わっていれば、合流点は作らない（後続は到達しない）
      if (ends.length === 0) {
        cursor = null
        return
      }
      const mergeId = rawNode('merge', '')
      for (const end of ends) edges.push({ from: end.id, to: mergeId, label: end.label })
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
    // repeat while は repeat より先に判定する
    if ((m = RE.repeatWhile.exec(line))) {
      const frame = frames.pop()
      if (!frame || frame.type !== 'repeat') {
        throw new ParseError('対応する repeat のない repeat while です', lineNo)
      }
      // 本体が continue / break で終わっていれば、条件分岐へは continue からだけ入る
      const decisionId = flowNode('decision', m[1].trim())
      for (const c of frame.continues) edges.push({ from: c.id, to: decisionId, label: c.label })
      edges.push({ from: decisionId, to: frame.startId, label: (m[2] ?? '').trim() })
      pendingLabel = (m[3] ?? '').trim()
      closeLoop(decisionId, frame.breaks)
      return
    }
    if (RE.repeat.test(line)) {
      const startId = flowNode('merge', '')
      frames.push({ type: 'repeat', startId, breaks: [], continues: [] })
      return
    }
    if ((m = RE.while.exec(line))) {
      const decisionId = flowNode('decision', m[1].trim())
      frames.push({ type: 'while', decisionId, baseCol: currentCol, breaks: [] })
      pendingLabel = (m[2] ?? '').trim()
      // 本体は 1 列右に置き、抜ける線が本体を貫かずにまっすぐ下へ行けるようにする
      currentCol += 1
      return
    }
    if ((m = RE.endwhile.exec(line))) {
      const frame = frames.pop()
      if (!frame || frame.type !== 'while') {
        throw new ParseError('対応する while のない endwhile です', lineNo)
      }
      // 本体の最後から条件へ戻る（本体が空なら条件の yes がそのまま戻る）
      if (cursor !== null) {
        edges.push({ from: cursor, to: frame.decisionId, label: pendingLabel })
      }
      pendingLabel = (m[1] ?? '').trim()
      currentCol = frame.baseCol
      closeLoop(frame.decisionId, frame.breaks)
      return
    }
    if (RE.break.test(line) || RE.continue.test(line)) {
      const isBreak = RE.break.test(line)
      const loop = [...frames]
        .reverse()
        .find((f): f is WhileFrame | RepeatFrame => f.type === 'while' || f.type === 'repeat')
      if (!loop) {
        throw new ParseError(
          `while / repeat の外で ${isBreak ? 'break' : 'continue'} は使えません`,
          lineNo
        )
      }
      if (cursor !== null) {
        if (isBreak) loop.breaks.push({ id: cursor, label: pendingLabel })
        else if (loop.type === 'while') {
          edges.push({ from: cursor, to: loop.decisionId, label: pendingLabel })
        } else loop.continues.push({ id: cursor, label: pendingLabel })
      }
      cursor = null
      pendingLabel = ''
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
    throw new ParseError(`${FRAME_OPEN[frame.type]} で閉じられていません`, lines.length)
  }

  return { nodes, edges, lanes }
}
