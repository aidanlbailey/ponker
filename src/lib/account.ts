// Signing in. The worker does the OAuth dance and sends the browser back with a session token, which lives
// here in localStorage (not a cookie: the site and the worker are on different domains, and Safari drops those).

import { load, save } from './storage'

const SESSION = 'ponker-session'
const ME = 'ponker-me' // the last /me, so the hub corner shows you without asking the worker first
const HIDDEN = 'ponker-hidden-art' // players whose picture you reported, hidden for you straight away
const PICTURE_CHOICES = 'ponker-picture-choices'

export const API = (import.meta.env.VITE_ROOMS_URL || `ws://${location.hostname}:8787`).replace(/^ws/, 'http')

// rating is null while still placing. Older cached ones won't have it at all
export type Me = { id: number; name: string; avatar: string | null; admin: boolean; rating?: number | null; requests?: number }

export const session = () => load(SESSION, '')

const isMe = (d: unknown): d is Me | null => d === null || (typeof d === 'object' && 'name' in d)
export const cachedMe = () => (session() ? load<Me | null>(ME, null, isMe) : null)

function forget() {
  save(SESSION, '')
  save(ME, null)
  dispatchEvent(new Event('hidden-art'))
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
  if (init.method && init.method !== 'GET' && path !== '/me/hidden-art') recent.clear()
  const token = session()
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined && { 'Content-Type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (res.status === 401 && session() === token) forget()
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { why?: string }).why ?? `Something went wrong (${res.status})`)
  if (path === '/me' && init.method !== 'DELETE' && session() === token) save(ME, data)
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

const isHidden = (d: unknown): d is number[] => Array.isArray(d) && d.every((id) => Number.isSafeInteger(id) && id > 0)
type PictureChoices = Record<string, boolean>
const isChoices = (d: unknown): d is PictureChoices => !!d && typeof d === 'object' && !Array.isArray(d) &&
  Object.entries(d).every(([id, hidden]) => Number.isSafeInteger(Number(id)) && Number(id) > 0 && typeof hidden === 'boolean')
function pictureKey(key: string, token: string) {
  if (!token) return key
  // Separate session caches without keeping another copy of the bearer token on disk.
  let hash = 14695981039346656037n
  for (const char of token) hash = BigInt.asUintN(64, (hash ^ BigInt(char.charCodeAt(0))) * 1099511628211n)
  return `${key}:${hash.toString(16)}`
}
let pictures: { token: string; hidden: number[]; choices: PictureChoices } | undefined

function pictureState() {
  const token = session()
  if (pictures?.token === token) return pictures
  const guestHidden = load(HIDDEN, [], isHidden)
  const guestChoices = load(PICTURE_CHOICES, {}, isChoices)
  const stored = token ? load<number[] | null>(pictureKey(HIDDEN, token), null, (d): d is number[] | null => d === null || isHidden(d)) : null
  pictures = {
    token,
    hidden: stored ?? guestHidden,
    choices: token ? load(pictureKey(PICTURE_CHOICES, token), stored === null ? guestChoices : {}, isChoices) : guestChoices,
  }
  // Keep the guest import separate from pictures learned from an account.
  if (token) {
    save(pictureKey(HIDDEN, token), pictures.hidden)
    save(pictureKey(PICTURE_CHOICES, token), pictures.choices)
  }
  return pictures
}

addEventListener('storage', (event) => {
  if (event.key === null || event.key === SESSION || event.key === pictureKey(HIDDEN, session()) || event.key === pictureKey(PICTURE_CHOICES, session())) pictures = undefined
})

export const hiddenArt = () => pictureState().hidden
const pictureChoices = () => ({ ...pictureState().choices })
function rememberChoices(choices: PictureChoices) {
  const state = pictureState()
  state.choices = choices
  save(pictureKey(PICTURE_CHOICES, state.token), choices)
}

function rememberHidden(ids: number[], shown: number[] = []) {
  const state = pictureState()
  const current = state.hidden
  const next = [...new Set([...current, ...ids])].filter((id) => !shown.includes(id))
  if (next.length === current.length && next.every((id) => current.includes(id))) return
  state.hidden = next
  save(pictureKey(HIDDEN, state.token), next)
  dispatchEvent(new Event('hidden-art'))
}

let syncing: { token: string; reply: Promise<void> } | undefined
let lastSync = { token: '', at: 0 }
export function syncHiddenArt(force = false): Promise<void> {
  if (!session()) return Promise.resolve()
  const token = session()
  if (syncing?.token === token) return syncing.reply
  if (!force && lastSync.token === token && Date.now() - lastSync.at < 30_000) return Promise.resolve()
  const ids = hiddenArt()
  const reply = (async () => {
    // Chunk old browser lists so imports stay inside D1's bind limit.
    let at = 0
    do {
      const choices = Object.entries(pictureChoices()).slice(0, 90).map(([user, hidden]) => ({ user: Number(user), hidden }))
      const remote = await call<{ hidden: number[]; shown: number[] }>('/me/hidden-art', { method: 'POST', body: { ids: ids.slice(at, at + 90), choices } })
      if (session() !== token) return
      const pending = pictureChoices()
      for (const choice of choices) if (pending[choice.user] === choice.hidden) delete pending[choice.user]
      rememberChoices(pending)
      // A click during the request wins over that request's older reply.
      const hidden = new Set([...hiddenArt(), ...remote.hidden])
      remote.shown.forEach((id) => hidden.delete(id))
      Object.entries(pending).forEach(([id, hide]) => hide ? hidden.add(Number(id)) : hidden.delete(Number(id)))
      rememberHidden([...hidden], hiddenArt().filter((id) => !hidden.has(id)))
      at += 90
    } while (at < ids.length || Object.keys(pictureChoices()).length)
    lastSync = { token, at: Date.now() }
  })().finally(() => { if (syncing?.reply === reply) syncing = undefined })
  syncing = { token, reply }
  return reply
}

export function setArtHidden(user: number, hidden: boolean) {
  rememberChoices({ ...pictureChoices(), [user]: hidden })
  rememberHidden(hidden ? [user] : [], hidden ? [] : [user])
  void syncHiddenArt(true).catch(() => {})
}

export type Friend = { id: number; name: string; avatar: string | null }
export type Friends = { friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }

export const friends = () => shared<Friends>('/me/friends')
// a request, or yes to theirs. Both give back the lists as they are now
export const addFriend = (id: number) => call<Friends>(`/friends/${id}`, { method: 'POST' })
// no to a request, taking yours back, or unfriending
export const dropFriend = (id: number) => call<Friends>(`/friends/${id}`, { method: 'DELETE' })
