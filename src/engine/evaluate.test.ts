import { expect, test } from 'vitest'
import { evaluate, handName } from './evaluate'

const RANKS = '23456789TJQKA'
const SUITS = 'cdhs'
const cards = (text: string) =>
  text.split(' ').map((c) => (RANKS.indexOf(c[0]!) << 2) | SUITS.indexOf(c[1]!))
const score = (text: string) => evaluate(cards(text))

test('categories rank in the right order', () => {
  const ladder = [
    'Ac Kd 9h 7s 3c 2d 4h', // high card
    'Ac Ad 9h 7s 3c 2d 5h', // pair
    'Ac Ad 9h 9s 3c 2d 5h', // two pair
    'Ac Ad Ah 9s 3c 2d 5h', // trips
    'Ac 2d 3h 4s 5c 9d Kh', // wheel
    '9c Td Jh Qs Kc 2d 3h', // straight
    'Ac Kc 9c 7c 3c 2d 4h', // flush
    'Ac Ad Ah 9s 9c 2d 5h', // full house
    'Ac Ad Ah As 9c 2d 5h', // quads
    'Ac 2c 3c 4c 5c 9d Kh', // steel wheel
    'Ts Js Qs Ks As 2d 3h', // royal
  ]
  for (let i = 1; i < ladder.length; i++) {
    expect(score(ladder[i]!)).toBeGreaterThan(score(ladder[i - 1]!))
  }
})

test('ties and kickers', () => {
  expect(score('Ac Ad Kh 9s 7c 3d 2h')).toBeGreaterThan(score('Ah As Qh 9d 7s 3c 2d'))
  // the board plays, so these split
  expect(score('2c 3d Ah Kh Qh Jh Th')).toBe(score('4c 5d Ah Kh Qh Jh Th'))
  // two sets of trips is a full house, aces over kings
  expect(score('Ac Ad Ah Kc Kd Kh 2s')).toBeGreaterThan(score('Qc Qd Qh Ks Kc Kd 2s'))
  // three pair keeps the best kicker
  expect(score('Ac Ad Kh Ks Qc Qd Jh')).toBeGreaterThan(score('Ac Ad Kh Ks 2c 2d Jh'))
  // sixth straight card makes it a higher straight
  expect(score('2c 3d 4h 5s 6c 7d Kh')).toBeGreaterThan(score('2c 3d 4h 5s 6c Td Kh'))
})

test('every 5 card hand lands on the known counts', () => {
  const found = new Map<string, number>()
  const distinct = new Set<number>()
  const hand = new Uint8Array(5)
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++)
        for (let d = c + 1; d < 52; d++)
          for (let e = d + 1; e < 52; e++) {
            hand[0] = a
            hand[1] = b
            hand[2] = c
            hand[3] = d
            hand[4] = e
            const s = evaluate(hand)
            distinct.add(s)
            const name = handName(s)
            found.set(name, (found.get(name) ?? 0) + 1)
          }

  expect(Object.fromEntries(found)).toEqual({
    'Royal flush': 4,
    'Straight flush': 36,
    'Four of a kind': 624,
    'Full house': 3744,
    Flush: 5108,
    Straight: 10200,
    'Three of a kind': 54912,
    'Two pair': 123552,
    Pair: 1098240,
    'High card': 1302540,
  })
  expect(distinct.size).toBe(7462)
})

test('7 cards score the same as their best 5', () => {
  let seed = 12345
  const rand = (n: number) => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) % n
  const deck = Array.from({ length: 52 }, (_, i) => i)

  for (let run = 0; run < 20000; run++) {
    for (let i = 0; i < 7; i++) {
      const j = i + rand(52 - i)
      ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
    }
    const seven = deck.slice(0, 7)
    let best = 0
    for (let skipA = 0; skipA < 7; skipA++)
      for (let skipB = skipA + 1; skipB < 7; skipB++)
        best = Math.max(best, evaluate(seven.filter((_, i) => i !== skipA && i !== skipB)))
    expect(evaluate(seven)).toBe(best)
  }
})
