// Rating maths, no D1 in here. Zero-sum Elo between pairs at a table: whatever one side gains the other loses,
// so feeding a friend only moves rating around and never makes any.

export const START = 1000
export const K = 4
// pair results at double K, so a new rating settles fast. One full table's block is up to 5 of them
export const PROVISIONAL = 5
export const PAIR_CAP = K * 4 // rating one pair can swap in a New York day, past it they stop counting
export const PLACEMENT_HANDS = 30

// fitted on bot-sim v2-quick in 100-hand blocks (2026-11-07), bots averaging 1000, then stretched x1.818 round 1000
// when SPREAD went 10,000 to 5,500. Refit if the roster changes.
// ponytail: fitted on win/lose, scored on chips now. Margin and win/lose fit the field the same in the sim, good enough
// for a start that live play then moves
export const BOT_SEEDS: Record<string, number> = {
  'bot:psi': 1136, 'bot:lambda': 1116, 'bot:rho': 1109, 'bot:omicron': 1107, 'bot:delta': 1093, 'bot:iota': 1089,
  'bot:epsilon': 1085, 'bot:xi': 1080, 'bot:pi': 1076, 'bot:mu': 1069, 'bot:chi': 1053, 'bot:beta': 1031,
  'bot:gamma': 1027, 'bot:theta': 1025, 'bot:upsilon': 989, 'bot:phi': 985, 'bot:omega': 967, 'bot:zeta': 929,
  'bot:eta': 922, 'bot:sigma': 898, 'bot:nu': 840, 'bot:tau': 822, 'bot:kappa': 782, 'bot:alpha': 765,
}
export const isBot = (who: string) => who.startsWith('bot:')

// u:<id> for people, the roster id for bots
export const seedOf = (who: string) => BOT_SEEDS[who] ?? START

export const BLOCK_HANDS = 100
// Scored on chips won, not on who's ahead. Who's ahead let anyone leave the moment they were up and bank a win,
// 76% of the time against an equal in the bot sim. Chips add up the same whenever you stop, so leaving early or
// late gains nothing. SPREAD is what a 100-hand lead is worth: this much ahead is a full win. At 10,000 red took
// ~280bb/100 over the field and nobody could get there. 5,500 puts red (+100 over 1,000) at ~154bb/100, about an
// Elite bot, and gold at ~224. K went 8 to 4 alongside so luck, about ±32, doesn't double with it.
// Changing it again? Stretch every rating by old/new round 1000 so they stay meaningful, never reset them
export const SPREAD = 5_500 // chips, 550bb at 5/10
export const HAND_CAP = 1_000 // no one hand counts for more than 100bb, so a cooler can't swing a whole block

// what a gains (b loses the same) over hands they shared where a won lead chips more than b. The expected part
// is what Elo says a should be up by over that many hands. 0 once the pair's used up today's cap
export function exchange(ra: number, rb: number, hands: number, lead: number, provisional: boolean, movedToday: number) {
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400))
  const delta = K * (provisional ? 2 : 1) * (lead / (2 * SPREAD) - (hands / BLOCK_HANDS) * (expected - 0.5))
  const room = Math.max(0, PAIR_CAP - movedToday)
  return Math.max(-room, Math.min(room, delta))
}

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
// YYYY-MM-DD in New York, daylight saving and all
export const nyDay = (now: number) => NY.format(now)
