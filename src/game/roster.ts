// The 24 bots. Names come from a shuffled table so a letter says nothing about how it plays,
// keep it exactly as MASTER_PROMPT.md has it. Style only shows on the bio card.

import { XI, type BotSettings } from './bot'

export const SKILLS = ['Novice', 'Regular', 'Sharp', 'Elite'] as const
export const STYLES = ['Rock', 'Station', 'Grinder', 'Gambler', 'Bluffer', 'Trapper'] as const
export type Skill = (typeof SKILLS)[number]
export type Style = (typeof STYLES)[number]

// rows are skills, columns are styles in the order above
const NAMES = [
  ['Omega', 'Kappa', 'Eta', 'Alpha', 'Tau', 'Nu'],
  ['Rho', 'Sigma', 'Xi', 'Zeta', 'Beta', 'Phi'],
  ['Iota', 'Upsilon', 'Mu', 'Chi', 'Theta', 'Gamma'],
  ['Lambda', 'Pi', 'Epsilon', 'Omicron', 'Psi', 'Delta'],
]

const LETTERS: Record<string, string> = {
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ',
  Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π',
  Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
}

// Each style is a change from Xi at Regular skill
const STYLE: Record<Style, { bio: string; settings: Partial<BotSettings> }> = {
  Rock: {
    bio: 'Plays few hands and means it when it bets. Rarely bluffs, and gives up when you push back.',
    settings: { open: 0.58, valueBet: 0.72, valueRaise: 0.8, bluff: 0.04, read: 1.9, betShare: 0.55, raiseShare: 0.7 },
  },
  Station: {
    bio: 'Hates folding. Calls with almost anything that might be good, but seldom raises.',
    settings: { open: 0.54, valueBet: 0.72, valueRaise: 0.84, bluff: 0.05, read: 0.3, callSlack: 0.1, betShare: 0.5, raiseShare: 0.7 },
  },
  Grinder: {
    bio: 'Solid and steady. Bets its good hands, calls when the price is right, bluffs now and then.',
    settings: {},
  },
  Gambler: {
    bio: 'Loose and loud. Plays lots of hands, bets big and will chase a draw at any price.',
    settings: { open: 0.42, valueBet: 0.64, valueRaise: 0.7, bluff: 0.22, bluffRaise: 0.08, read: 0.7, callSlack: 0.06, betShare: 0.9, raiseShare: 1, noise: 0.1 },
  },
  Bluffer: {
    bio: 'Bets whenever you look weak and raises with nothing more than you would think.',
    settings: { open: 0.47, valueBet: 0.66, valueRaise: 0.73, bluff: 0.34, bluffRaise: 0.12, betShare: 0.75, raiseShare: 0.9 },
  },
  Trapper: {
    bio: 'Checks and calls its monsters to let you hang yourself, then springs the raise late.',
    settings: { valueRaise: 0.76, bluff: 0.08, read: 1.1, callSlack: 0.02, trap: 0.6, raiseShare: 0.85 },
  },
}

// Easier bots are the same brain making mistakes on purpose: shakier reads of their own hand,
// no sense of position, ignoring what a bet means, and the odd plain blunder
const SKILL: Record<Skill, { bio: string; tweak: (s: BotSettings) => BotSettings }> = {
  Novice: {
    bio: 'Still learning, and it shows. Misjudges hands, ignores position and makes the odd howler.',
    tweak: (s) => ({ ...s, noise: s.noise + 0.14, read: s.read * 0.5, position: 0, blunder: 0.07 }),
  },
  Regular: { bio: 'Knows the game and makes few outright mistakes.', tweak: (s) => s },
  Sharp: {
    bio: 'Reads bets well and respects position.',
    tweak: (s) => ({ ...s, noise: s.noise - 0.03, position: 0.025 }),
  },
  Elite: {
    bio: 'The toughest of the bunch. Tight reads, careful with position, very hard to push around.',
    tweak: (s) => ({ ...s, noise: s.noise - 0.045, read: s.read * 1.05, position: 0.03 }),
  },
}

export type Bot = {
  id: string
  name: string
  letter: string
  skill: Skill
  style: Style
  bio: string
  settings: BotSettings
}

export const BOTS: Bot[] = SKILLS.flatMap((skill, row) =>
  STYLES.map((style, col): Bot => {
    const name = NAMES[row]![col]!
    return {
      id: `bot:${name.toLowerCase()}`,
      name,
      letter: LETTERS[name]!,
      skill,
      style,
      bio: `${STYLE[style].bio} ${SKILL[skill].bio}`,
      settings: SKILL[skill].tweak({ ...XI, ...STYLE[style].settings }),
    }
  }),
)

export const botById = (id: string) => BOTS.find((bot) => bot.id === id)

// Fresh bots for the empty seats, never doubling up on one already picked.
export function randomBots(count: number, taken: string[] = [], random = Math.random) {
  const pool = BOTS.filter((bot) => !taken.includes(bot.id))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, count)
}
