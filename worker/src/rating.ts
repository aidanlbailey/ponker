// Rating maths, no D1 in here. Zero-sum Elo between pairs at a table: whatever one side gains the other loses,
// so feeding a friend only moves rating around and never makes any.

export const START = 1000
export const K = 8
// pair results at double K, so a new rating settles fast. One full table's block is up to 5 of them
export const PROVISIONAL = 5
export const PAIR_CAP = K * 4 // rating one pair can swap in a New York day, past it they stop counting
export const PLACEMENT_HANDS = 30

// fitted on bot-sim v2-quick in 100-hand blocks (2026-11-07), bots averaging 1000. Refit if the roster changes
export const BOT_SEEDS: Record<string, number> = {
  'bot:psi': 1075, 'bot:lambda': 1064, 'bot:rho': 1060, 'bot:omicron': 1059, 'bot:delta': 1051, 'bot:iota': 1049,
  'bot:epsilon': 1047, 'bot:xi': 1044, 'bot:pi': 1042, 'bot:mu': 1038, 'bot:chi': 1029, 'bot:beta': 1017,
  'bot:gamma': 1015, 'bot:theta': 1014, 'bot:upsilon': 994, 'bot:phi': 992, 'bot:omega': 982, 'bot:zeta': 961,
  'bot:eta': 957, 'bot:sigma': 944, 'bot:nu': 912, 'bot:tau': 902, 'bot:kappa': 880, 'bot:alpha': 871,
}

// u:<id> for people, the roster id for bots
export const seedOf = (who: string) => BOT_SEEDS[who] ?? START
export const isBot = (who: string) => who.startsWith('bot:')

// what a gains (b loses the same). 0 once the pair's used up today's cap
export function exchange(ra: number, rb: number, score: number, provisional: boolean, movedToday: number) {
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400))
  const delta = K * (provisional ? 2 : 1) * (score - expected)
  const room = Math.max(0, PAIR_CAP - movedToday)
  return Math.max(-room, Math.min(room, delta))
}

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
// YYYY-MM-DD in New York, daylight saving and all
export const nyDay = (now: number) => NY.format(now)
