// A card is 0-51: rank is card >> 2 (0 = deuce, 12 = ace), suit is card & 3.
// ponytail: bitmask evaluator, not lookup tables. About 0.1ms per bot decision
// in milestone 1, swap in tables if live equity sims ever need it.

const counts = new Uint8Array(13)
const suits = new Uint16Array(4)

const popcount = (n: number) => {
  let c = 0
  for (; n; n &= n - 1) c++
  return c
}

// top straight card index, or -1. The extra low bit lets the ace play low.
function straightHigh(mask: number) {
  const m = (mask << 1) | (mask >> 12)
  const run = m & (m >> 1) & (m >> 2) & (m >> 3) & (m >> 4)
  return run ? 31 - Math.clz32(run) + 3 : -1
}

// best ranks from mask, packed a nibble each so ties compare as plain numbers
function top(mask: number, n: number) {
  let out = 0
  while (n--) {
    const r = mask ? 31 - Math.clz32(mask) : 0
    out = (out << 4) | r
    mask &= ~(1 << r)
  }
  return out
}

const CATEGORY = 0x100000
const hand = (category: number, tiebreak: number) => category * CATEGORY + tiebreak

// bigger score wins, equal scores split. Takes 5 to 7 cards.
export function evaluate(cards: ArrayLike<number>) {
  counts.fill(0)
  suits.fill(0)
  let all = 0
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!
    const r = c >> 2
    counts[r]!++
    suits[c & 3]! |= 1 << r
    all |= 1 << r
  }

  // safe to return early: 7 cards can't hold a flush and a full house or quads
  for (let s = 0; s < 4; s++) {
    const mask = suits[s]!
    if (popcount(mask) < 5) continue
    const sf = straightHigh(mask)
    return sf >= 0 ? hand(8, sf) : hand(5, top(mask, 5))
  }

  let quad = -1
  let trip = -1
  let pair = -1
  let pair2 = -1
  for (let r = 12; r >= 0; r--) {
    const n = counts[r]!
    if (n === 4) quad = r
    else if (n === 3 && trip < 0) trip = r
    else if (n >= 2) {
      // a second set of trips plays as the pair in a full house
      if (pair < 0) pair = r
      else if (pair2 < 0) pair2 = r
    }
  }

  if (quad >= 0) return hand(7, (quad << 4) | top(all & ~(1 << quad), 1))
  if (trip >= 0 && pair >= 0) return hand(6, (trip << 4) | pair)
  const straight = straightHigh(all)
  if (straight >= 0) return hand(4, straight)
  if (trip >= 0) return hand(3, (trip << 8) | top(all & ~(1 << trip), 2))
  if (pair2 >= 0) {
    return hand(2, (pair << 8) | (pair2 << 4) | top(all & ~(1 << pair) & ~(1 << pair2), 1))
  }
  if (pair >= 0) return hand(1, (pair << 12) | top(all & ~(1 << pair), 3))
  return hand(0, top(all, 5))
}

const NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
]

export function handName(score: number) {
  return score === hand(8, 12) ? 'Royal flush' : NAMES[Math.floor(score / CATEGORY)]!
}
