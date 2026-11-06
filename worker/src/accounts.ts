// The rules behind accounts, with no Cloudflare or SQL in them: what a name can be, the signed OAuth
// state, session tokens. Only Web Crypto, which Workers, Node and browsers all have.

import { BOTS } from '../../src/game/roster'

export const SESSION_DAYS = 90
const STATE_MS = 10 * 60_000 // long enough to pick an account on the provider's page, not to sit on a link
export const NAME_MIN = 2
export const NAME_MAX = 16

const enc = new TextEncoder()
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (text: string) => atob(text.replace(/-/g, '+').replace(/_/g, '/'))

export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)))

// only the hash is stored, so a leaked database hands out no sessions
export async function hashToken(token: string) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(token)))
}

async function hmac(key: string, data: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}

// what survives the trip out to Google or Discord and back. Signed rather than stored, so there's no table of
// half-finished sign-ins to clean up
export type State = { p: string; from: string; name: string; at: number }

export async function signState(key: string, state: State) {
  const body = b64url(enc.encode(JSON.stringify(state)))
  return `${body}.${await hmac(key, body)}`
}

export async function readState(key: string, text: string, now: number): Promise<State | null> {
  const [body = '', sig = ''] = text.split('.')
  // ponytail: plain compare. The attacker would need the provider's code for this sign-in too, timing gets them nothing
  if (!body || sig !== (await hmac(key, body))) return null
  try {
    const state = JSON.parse(new TextDecoder().decode(Uint8Array.from(unb64url(body), (c) => c.charCodeAt(0)))) as State
    return now - state.at < STATE_MS && now >= state.at ? state : null
  } catch {
    return null
  }
}

// What an id_token says, without checking its signature. Fine here: it came straight from Google's token
// endpoint over TLS in exchange for our secret, it never passed through anyone's browser
export function jwtSubject(jwt: string) {
  try {
    const payload = JSON.parse(unb64url(jwt.split('.')[1] ?? '')) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

// Slurs and the worst of it, matched anywhere in the name once look-alikes are undone. Short words that hide
// inside real names (Cassie, Dickens, Hancock) only count as a whole word. Not meant to be clever, someone
// determined gets round any list, it just stops the lazy ones
const ANYWHERE = ['nigg', 'nigr', 'fagg', 'faggot', 'kike', 'chink', 'tranny', 'retard', 'fuck', 'fvck', 'fuk', 'fck', 'cunt', 'shit', 'whore', 'slut', 'nazi', 'hitler', 'rapist', 'penis', 'vagina', 'porn', 'pussy', 'bitch', 'twat', 'wank', 'cock']
const WHOLE = ['ass', 'arse', 'spic', 'fag', 'dick', 'tit', 'tits', 'rape', 'cum', 'coon', 'gook', 'kkk']
// nobody gets to look like the house, a bot or a guest
const RESERVED = ['admin', 'ponker', 'mod', 'moderator', 'dealer', 'guest', 'bot', 'watcher', 'player', ...BOTS.map((b) => b.name.toLowerCase())]
const LEET: Record<string, string> = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' }
// cock lives in peacock and hancock, so those get let back through
const FINE = ['peacock', 'hancock', 'cockatoo', 'cockatiel', 'shitake', 'shiitake', 'scunthorpe']

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

// The name to save, or why it can't be. Uniqueness is the database's job, this is the shape and the words
export function checkName(raw: string): { name: string } | { why: string } {
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (name.length < NAME_MIN) return { why: `At least ${NAME_MIN} characters` }
  if (name.length > NAME_MAX) return { why: `At most ${NAME_MAX} characters` }
  if (!NAME.test(name)) return { why: 'Letters, numbers, spaces, dots, dashes and underscores only' }
  const lower = name.toLowerCase()
  const plain = [...lower].map((c) => LEET[c] ?? c).join('')
  const words = plain.split(/[^\p{L}]+/u).filter(Boolean)
  const squashed = FINE.reduce((s, ok) => s.replaceAll(ok, ''), words.join(''))
  if (ANYWHERE.some((w) => squashed.includes(w)) || words.some((w) => WHOLE.includes(w))) return { why: "That name isn't allowed" }
  // "Guest 4" or "Alpha" would pass for something they're not
  if (RESERVED.includes(lower.replace(/[\d\s._-]+$/, ''))) return { why: "That name isn't allowed" }
  return { name }
}
