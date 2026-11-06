// Shared by the worker and the client, so keep it free of React and Cloudflare.

// ponytail: a fixed pool, nobody can open more. Add names here if four ever fill up
export const PUBLIC_TABLES = ['venom', 'flash', 'rapier', 'phantom']

// the ids stay as they were, they're the urls and the live tables' Durable Object names. Only the label changed
export const tableName = (id: string) => `Public ${PUBLIC_TABLES.indexOf(id) + 1}`

export const EMOTES = [
  'Good luck',
  'Nice hand',
  'Thanks',
  'Well played',
  'Unlucky',
  'Oops',
  'Hurry up',
  '👍',
  '😂',
  '😮',
  '😬',
  '🔥',
  '🤔',
  '😭',
  '🙏',
]

export type TableInfo = { id: string; humans: number; bots: number; resting: boolean }

// the table with the most people that still has a chair, or a bot who'll give one up. Ties go to
// pool order, so two people hitting Quick Play at once land together
export function pickTable(tables: TableInfo[]) {
  const open = tables.filter((t) => !t.resting && t.humans < 6)
  return open.sort((a, b) => b.humans - a.humans)[0] ?? null
}
