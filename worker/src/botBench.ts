// Spike code for milestone 1, only here to put real numbers on bot CPU cost.
// ponytail: bitmask evaluator, not lookup tables. The milestone 2 engine can go
// faster, so the numbers from this are a safe upper bound.

// A card is 0-51: rank is card >> 2 (0 = deuce, 12 = ace), suit is card & 3.

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

const hand = (category: number, tiebreak: number) => category * 0x100000 + tiebreak

// bigger score wins. Takes 5 to 7 cards.
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

// What a live bot would have to do without tables: deal out the rest of the
// hand n times. Costs n * (opponents + 1) evaluations.
export function monteCarloEquity(hero: number[], board: number[], opponents: number, n: number) {
  const known = new Set([...hero, ...board])
  const deck: number[] = []
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c)

  const heroCards = new Uint8Array(7)
  const oppCards = new Uint8Array(7)
  heroCards.set(hero)
  heroCards.set(board, 2)
  oppCards.set(board, 2)

  const missing = 5 - board.length
  const draw = missing + opponents * 2
  let won = 0
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < draw; d++) {
      const j = d + Math.floor(Math.random() * (deck.length - d))
      const swap = deck[d]!
      deck[d] = deck[j]!
      deck[j] = swap
    }
    for (let m = 0; m < missing; m++) heroCards[2 + board.length + m] = oppCards[2 + board.length + m] = deck[m]!

    const score = evaluate(heroCards)
    let best = 0
    let ties = 1
    for (let o = 0; o < opponents; o++) {
      oppCards[0] = deck[missing + o * 2]!
      oppCards[1] = deck[missing + o * 2 + 1]!
      const opp = evaluate(oppCards)
      if (opp > best) {
        best = opp
        ties = 1
      } else if (opp === best) ties++
    }
    if (score > best) won += 1
    else if (score === best) won += 1 / (ties + 1)
  }
  return won / n
}

// Stand-ins for the shipped strategy tables. The contents don't matter here,
// the cost of reading them does.
const preflopTable = Uint8Array.from({ length: 169 }, (_, i) => (i * 37) % 100)
const strengthByCategory = [20, 50, 65, 75, 80, 85, 92, 98, 100]

// What a multiplayer bot does instead: table lookups plus pot odds.
export function tableDecision(hero: number[], board: number[], pot: number, toCall: number) {
  let strength: number
  if (board.length === 0) {
    const [a, b] = [hero[0]! >> 2, hero[1]! >> 2]
    const suited = (hero[0]! & 3) === (hero[1]! & 3) ? 1 : 0
    strength = preflopTable[(Math.max(a, b) * 13 + Math.min(a, b) + suited * 91) % 169]!
  } else {
    strength = strengthByCategory[Math.floor(evaluate([...hero, ...board]) / 0x100000)]!
  }
  const odds = toCall === 0 ? 0 : (100 * toCall) / (pot + toCall)
  if (strength > 80) return 'raise'
  return strength >= odds ? 'call' : 'fold'
}
