// Signing in. The worker does the OAuth dance and sends the browser back with a session token, which lives
// here in localStorage (not a cookie: the site and the worker are on different domains, and Safari drops those).

import { load, save } from './storage'

const SESSION = 'ponker-session'
const ME = 'ponker-me' // the last /me, so the hub corner shows you without asking the worker first
const HIDDEN = 'ponker-hidden-art' // players whose picture you reported, hidden for you straight away

export const API = (import.meta.env.VITE_ROOMS_URL || `ws://${location.hostname}:8787`).replace(/^ws/, 'http')

// rating is null while still placing. Older cached ones won't have it at all
export type Me = { id: number; name: string; avatar: string | null; admin: boolean; rating?: number | null }

export const session = () => load(SESSION, '')

const isMe = (d: unknown): d is Me | null => d === null || (typeof d === 'object' && 'name' in d)
export const cachedMe = () => (session() ? load<Me | null>(ME, null, isMe) : null)

function forget() {
  save(SESSION, '')
  save(ME, null)
}

// back from Google or Discord as #signin/<token>. Kept, and taken straight back out of the address bar so it
// isn't sitting in the history. Runs before anything reads the hash
export function takeSignIn() {
  const token = location.hash.match(/^#signin\/([\w-]{20,})$/)?.[1]
  if (!token) return
  save(SESSION, token)
  history.replaceState(null, '', `${location.pathname}${location.search}#profile`)
}

export const signInUrl = (provider: 'google' | 'discord', name: string) =>
  `${API}/auth/${provider}?${new URLSearchParams({ from: location.origin, name })}`

// a 401 means the session's gone (signed out elsewhere, run out, account deleted), so forget it
export async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  // anything that changes something makes the shared reads stale
  if (init.method && init.method !== 'GET') recent.clear()
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${session()}`, ...(init.body !== undefined && { 'Content-Type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (res.status === 401) forget()
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { why?: string }).why ?? `Something went wrong (${res.status})`)
  if (path === '/me' && init.method !== 'DELETE') save(ME, data)
  return data as T
}

// The worker allows 20 calls a minute. A profile, its board slice, the full board and StrictMode's second run
// would each ask again, so public reads are shared for a bit. Failures aren't kept
const SHARE_MS = 30_000
const recent = new Map<string, { at: number; reply: Promise<unknown> }>()
export function shared<T>(path: string): Promise<T> {
  const hit = recent.get(path)
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.reply as Promise<T>
  const reply = call<T>(path)
  reply.catch(() => recent.delete(path))
  recent.set(path, { at: Date.now(), reply })
  return reply
}

export async function signOut() {
  await call('/signout', { method: 'POST' }).catch(() => {})
  forget()
}

export async function deleteAccount() {
  await call('/me', { method: 'DELETE' })
  forget()
}

export const hiddenArt = () => load<number[]>(HIDDEN, [], (d): d is number[] => Array.isArray(d))

export function hideArt(user: number) {
  // ponytail: grows by one per report. Nobody reports thousands of people
  save(HIDDEN, [...new Set([...hiddenArt(), user])])
}
