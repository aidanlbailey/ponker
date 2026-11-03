import { expect, test } from 'vitest'
import { evaluate, monteCarloEquity, tableDecision } from './botBench'

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

test('monte carlo lands near known equity', () => {
  // AA against one random hand is about 85%
  expect(monteCarloEquity(cards('Ac Ad'), [], 1, 20000)).toBeCloseTo(0.85, 1)
  expect(monteCarloEquity(cards('Ac Ad'), cards('Ah As 2c 7d 9h'), 1, 2000)).toBeGreaterThan(0.99)
})

test('table bot folds junk to a big bet and raises a monster', () => {
  expect(tableDecision(cards('Ac Ad'), cards('Ah As 2c'), 100, 50)).toBe('raise')
  expect(tableDecision(cards('2c 7d'), cards('Ah Ks Qc'), 10, 1000)).toBe('fold')
})
