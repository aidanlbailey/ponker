import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAction, createTable, shuffledDeck, viewFor, type TableState } from '../engine/engine'
import { loadHands, netOf, recorder } from './handLog'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  })
})

function headsUp() {
  let s = createTable(2, 5, 10)
  s = applyAction(s, { type: 'sit', seat: 0, id: 'me', chips: 1000 })
  return applyAction(s, { type: 'sit', seat: 1, id: 'bot', chips: 1000 })
}

// plays one hand where seat 1 folds straight away, recording it from seat 0
function foldedHand(log = recorder('Bots')) {
  const before = headsUp()
  let s: TableState = applyAction(before, { type: 'deal', deck: shuffledDeck() })
  log.dealt(viewFor(before, 0), viewFor(s, 0), 0, ['Me', 'Bot'])
  while (s.street !== 'complete') {
    const seat = s.toAct
    const action = { type: seat === 1 ? 'fold' : 'call', seat } as const
    s = applyAction(s, action)
    log.step(viewFor(s, 0), action, seat)
  }
  return { log, end: s }
}

describe('hand log', () => {
  it('keeps a finished hand with the steps as you saw them', () => {
    const { end } = foldedHand()
    const [hand] = loadHands()
    expect(hand).toMatchObject({ where: 'Bots', me: 0, names: ['Me', 'Bot'] })
    expect(hand!.steps[0]!.action?.type).toBe('deal')
    expect(hand!.steps.at(-1)!.table.street).toBe('complete')
    // never anyone else's cards unless they were shown
    expect(hand!.steps[0]!.table.seats[1]!.cards).toEqual([-1, -1])
    expect(netOf(hand!)).toBe(end.seats[0]!.chips - 1000)
  })

  it('never keeps a half played hand', () => {
    const log = recorder('Bots')
    const before = headsUp()
    log.dealt(before, applyAction(before, { type: 'deal', deck: shuffledDeck() }), 0, ['Me', 'Bot'])
    expect(loadHands()).toEqual([])
  })

  it('records nothing for a watcher or after it loses the thread', () => {
    const log = recorder('abcd')
    const before = headsUp()
    const dealt = applyAction(before, { type: 'deal', deck: shuffledDeck() })
    log.dealt(before, dealt, null, [])
    log.jump({ ...dealt, street: 'complete' })
    log.dealt(before, dealt, 0, [])
    log.drop()
    log.jump({ ...dealt, street: 'complete' })
    expect(loadHands()).toEqual([])
  })

  it('keeps the newest 50', () => {
    const log = recorder('Bots')
    for (let i = 0; i < 52; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(1000 + i)
      foldedHand(log)
    }
    const hands = loadHands()
    expect(hands).toHaveLength(50)
    expect(hands[0]!.id).toBe(1051)
    vi.restoreAllMocks()
  })
})
