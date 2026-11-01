import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHIPS, isChips } from './chips'
import { load, save } from './storage'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  })
})

describe('storage', () => {
  it('reads strings saved raw by older versions', () => {
    store.set('ponker-user-name', 'Sam')
    expect(load('ponker-user-name', '')).toBe('Sam')
  })

  it('writes strings raw and everything else as JSON', () => {
    save('name', 'Sam')
    save('flag', false)
    expect(store.get('name')).toBe('Sam')
    expect(store.get('flag')).toBe('false')
  })

  it('reads old-format chips unchanged', () => {
    const chips = { white: { count: 3, value: 1, color: '#ffffff' }, chip_123: { count: 0, value: 0.5, color: '#FF6B6B' } }
    store.set('ponker-chips', JSON.stringify(chips))
    expect(load('ponker-chips', DEFAULT_CHIPS, isChips)).toEqual(chips)
  })

  it.each(['{not json', '[]', '{}', 'null', '{"a":{"count":"x","value":1,"color":"#ffffff"}}', '{"a":{"count":1,"value":1,"color":"red"}}'])(
    'falls back on bad chip data: %s',
    (raw) => {
      store.set('ponker-chips', raw)
      expect(load('ponker-chips', DEFAULT_CHIPS, isChips)).toBe(DEFAULT_CHIPS)
    },
  )

  it('falls back when a value fails its check', () => {
    store.set('ponker-theme', 'neon')
    const isTheme = (data: unknown): data is string => data === 'felt'
    expect(load('ponker-theme', 'felt', isTheme)).toBe('felt')
  })
})
