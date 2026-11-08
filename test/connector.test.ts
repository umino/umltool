import { describe, expect, it } from 'vitest'
import { nextConnectorLabel } from '../src/renderer/src/editor/connectorLabel'

describe('nextConnectorLabel', () => {
  it('コネクタが無ければ A', () => {
    expect(nextConnectorLabel([])).toBe('A')
  })

  it('相方のいないラベルがあればそれを返して組にする', () => {
    expect(nextConnectorLabel(['A'])).toBe('A')
    expect(nextConnectorLabel(['A', 'A', 'B'])).toBe('B')
  })

  it('全部組になっていれば未使用の次の文字', () => {
    expect(nextConnectorLabel(['A', 'A'])).toBe('B')
    expect(nextConnectorLabel(['A', 'A', 'C', 'C'])).toBe('B')
  })

  it('自由入力のラベルは無視する', () => {
    expect(nextConnectorLabel(['続き', 'X1'])).toBe('A')
  })
})
