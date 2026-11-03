import { describe, expect, it } from 'vitest'
import { applyAction, createTable, viewFor, type TableState } from '../engine/engine'
import { decide, XI, type BotSettings } from './bot'
import { BOTS, botById, randomBots } from './roster'

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function deck(random: () => number) {
  const cards = Array.from({ length: 52 }, (_, i) => i)
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j]!, cards[i]!]
  }
  return cards
}

function table(players: number) {
  let s = createTable(players, 5, 10)
  for (let seat = 0; seat < players; seat++) s = applyAction(s, { type: 'sit', seat, id: `p${seat}`, chips: 1000 })
  return s
}

// Limped heads-up pot, the big blind checks the flop and gets a pot sized bet back.
function foldsToPotBet(bot: BotSettings, spots = 1500) {
  const random = seeded(5)
  let folds = 0
  for (let k = 0; k < spots; k++) {
    let s: TableState = applyAction({ ...table(2), button: 1 }, { type: 'deal', deck: deck(random) })
    s = applyAction(s, { type: 'call', seat: s.toAct })
    s = applyAction(s, { type: 'check', seat: s.toAct })
    const bb = s.toAct
    s = applyAction(s, { type: 'check', seat: bb })
    s = applyAction(s, { type: 'raise', seat: s.toAct, to: 20 })
    if (decide(viewFor(s, bb), random, 400, bot).type === 'fold') folds++
  }
  return folds / spots
}

describe('bot brain', () => {
  // measured at about 38%, and the user complained when it folded more, so keep it here
  it('xi folds a little under half the time to a flop pot bet', () => {
    const rate = foldsToPotBet(XI)
    expect(rate).toBeGreaterThan(0.36)
    expect(rate).toBeLessThan(0.48)
  })

  it('styles fold in the right order', () => {
    const rate = (name: string) => foldsToPotBet(botById(`bot:${name}`)!.settings, 400)
    expect(rate('sigma')).toBeLessThan(rate('zeta')) // station, gambler
    expect(rate('zeta')).toBeLessThan(rate('xi'))
    expect(rate('xi')).toBeLessThan(rate('rho')) // rock
  })

  it('opens tighter under the gun than on the button', () => {
    const random = seeded(8)
    let early = 0
    let late = 0
    for (let k = 0; k < 300; k++) {
      const s = applyAction({ ...table(6), button: 5 }, { type: 'deal', deck: deck(random) })
      if (decide(viewFor(s, s.toAct), random, 300).type === 'raise') early++
      // everyone folds round to the button
      let folded = s
      while (folded.toAct !== folded.button) folded = applyAction(folded, { type: 'fold', seat: folded.toAct })
      if (decide(viewFor(folded, folded.toAct), random, 300).type === 'raise') late++
    }
    expect(early).toBeLessThan(late)
  })

  it('every bot only sends legal actions at a full table', () => {
    const random = seeded(2)
    for (let round = 0; round < 4; round++) {
      const bots = randomBots(6, [], random)
      let s: TableState = table(6)
      for (let hand = 0; hand < 6; hand++) {
        s = applyAction(s, { type: 'deal', deck: deck(random) })
        while (s.toAct >= 0) s = applyAction(s, decide(viewFor(s, s.toAct), random, 60, bots[s.toAct]!.settings))
        s.seats.forEach((seat, i) => {
          if (seat!.chips < 1000) s = applyAction(s, { type: 'topUp', seat: i, chips: 1000 - seat!.chips })
        })
      }
    }
  })
})

describe('roster', () => {
  it('keeps the shuffled names, so xi is the regular grinder', () => {
    expect(BOTS).toHaveLength(24)
    expect(new Set(BOTS.map((bot) => bot.letter)).size).toBe(24)
    expect(botById('bot:xi')).toMatchObject({ skill: 'Regular', style: 'Grinder', letter: 'Ξ', settings: XI })
    expect(botById('bot:omega')).toMatchObject({ skill: 'Novice', style: 'Rock' })
    expect(botById('bot:delta')).toMatchObject({ skill: 'Elite', style: 'Trapper' })
  })

  it('fills seats without repeating a bot', () => {
    const picked = randomBots(5, ['bot:xi'], seeded(1))
    expect(picked).toHaveLength(5)
    expect(new Set(picked.map((bot) => bot.id)).size).toBe(5)
    expect(picked.map((bot) => bot.id)).not.toContain('bot:xi')
  })
})
