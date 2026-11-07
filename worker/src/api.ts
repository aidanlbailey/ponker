// Accounts over plain HTTP: signing in with Google or Discord, your name and picture, reports and the
// admin queue. index.ts hands over anything under these paths. The SQL is in db.ts, the rules in accounts.ts.

import { isArt } from '../../src/lib/avatar'
import { checkName, jwtSubject, readState, signState } from './accounts'
import * as db from './db'

export interface AccountEnv {
  DB: D1Database
  STATE_KEY: string
  GOOGLE_ID: string
  GOOGLE_SECRET: string
  DISCORD_ID: string
  DISCORD_SECRET: string
  ADMIN_ID?: string // Aidan's user id. Unset, nobody's admin
}

export const API_PATH = /^\/(auth\/|me$|me\/stats$|signout$|report$|admin\/)/

const PROVIDERS = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid',
    id: (env: AccountEnv) => env.GOOGLE_ID,
    secret: (env: AccountEnv) => env.GOOGLE_SECRET,
  },
  discord: {
    auth: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    scope: 'identify',
    id: (env: AccountEnv) => env.DISCORD_ID,
    secret: (env: AccountEnv) => env.DISCORD_SECRET,
  },
}
type Provider = keyof typeof PROVIDERS

const isProvider = (p: string): p is Provider => p in PROVIDERS

// what the provider calls this person. Google puts it in the id_token, Discord wants another call
async function whoIs(p: Provider, tokens: { id_token?: string; access_token?: string }) {
  if (p === 'google') return tokens.id_token ? jwtSubject(tokens.id_token) : null
  const res = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
  if (!res.ok) return null
  const me = (await res.json()) as { id?: unknown }
  return typeof me.id === 'string' ? me.id : null
}

// a first sign-in keeps the name they had as a guest if it's allowed and free, otherwise a numbered one
// they can change in Profile
async function firstName(DB: D1Database, wanted: string) {
  const checked = checkName(wanted)
  if ('name' in checked && !(await db.nameTaken(DB, checked.name))) return checked.name
  return `Player ${1000 + Math.floor(Math.random() * 9000)}`
}

async function signIn(env: AccountEnv, p: Provider, providerId: string, wanted: string, now: number) {
  let user = await db.userByProvider(env.DB, p, providerId)
  // a numbered name can clash too, a few goes sorts it
  for (let tries = 0; !user && tries < 5; tries++) {
    user = await db.createUser(env.DB, p, providerId, tries ? await firstName(env.DB, '') : await firstName(env.DB, wanted), now)
  }
  if (!user) throw new Error('no free name')
  return db.createSession(env.DB, user.id, now)
}

export async function api(request: Request, env: AccountEnv, origins: RegExp): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const now = Date.now()
  const origin = request.headers.get('Origin')
  const cors: Record<string, string> = origin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE', Vary: 'Origin' }
    : {}
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors })
  const fail = (why: string, status = 400) => json({ why }, status)

  // the sign-in pages are full page visits from our site, they come back to it by redirect
  const start = path.match(/^\/auth\/(\w+)$/)
  const back = path.match(/^\/auth\/(\w+)\/callback$/)
  if (start || back) {
    const p = (start ?? back)![1]!
    if (!isProvider(p)) return new Response('not found', { status: 404 })
    const provider = PROVIDERS[p]
    const redirect = `${url.origin}/auth/${p}/callback`
    if (start) {
      const from = url.searchParams.get('from') ?? ''
      if (!origins.test(from)) return new Response('not from here', { status: 403 })
      const state = await signState(env.STATE_KEY, { p, from, name: (url.searchParams.get('name') ?? '').slice(0, 40), at: now })
      const to = new URL(provider.auth)
      to.search = new URLSearchParams({ client_id: provider.id(env), redirect_uri: redirect, response_type: 'code', scope: provider.scope, state }).toString()
      return Response.redirect(to.toString(), 302)
    }
    const state = await readState(env.STATE_KEY, url.searchParams.get('state') ?? '', now)
    if (!state || state.p !== p) return new Response('That sign-in link went stale. Go back and try again.', { status: 400 })
    const home = (hash: string) => Response.redirect(`${state.from}/${hash}`, 302)
    const code = url.searchParams.get('code')
    // they said no on the provider's page
    if (!code) return home('#profile')
    const res = await fetch(provider.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: provider.id(env), client_secret: provider.secret(env), redirect_uri: redirect, grant_type: 'authorization_code' }),
    })
    const providerId = res.ok ? await whoIs(p, await res.json()) : null
    if (!providerId) return home('#profile')
    return home(`#signin/${await signIn(env, p, providerId, state.name, now)}`)
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]
  const me = token ? await db.userBySession(env.DB, token, now) : null
  if (!me) return fail('signed out', 401)
  const admin = String(me.id) === env.ADMIN_ID
  const body = async () => {
    try {
      return (await request.json()) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  if (path === '/me' && request.method === 'GET') return json({ ...me, admin })
  if (path === '/me/stats' && request.method === 'GET') return json(await db.statsOf(env.DB, me.id))
  if (path === '/me' && request.method === 'PUT') {
    const changes = await body()
    if (typeof changes.name === 'string') {
      const checked = checkName(changes.name)
      if ('why' in checked) return fail(checked.why)
      if (checked.name !== me.name && !(await db.rename(env.DB, me.id, checked.name))) return fail('Someone already has that name', 409)
      me.name = checked.name
    }
    if ('avatar' in changes) {
      const art = changes.avatar
      if (art !== null && !isArt(art)) return fail('bad picture')
      await db.setAvatar(env.DB, me.id, art)
      me.avatar = art
    }
    return json({ ...me, admin })
  }
  if (path === '/me' && request.method === 'DELETE') {
    await db.deleteUser(env.DB, me.id)
    return json({})
  }
  if (path === '/signout' && request.method === 'POST') {
    await db.endSession(env.DB, token!)
    return json({})
  }
  if (path === '/report' && request.method === 'POST') {
    const user = Number((await body()).user)
    if (!Number.isInteger(user) || user === me.id) return fail('bad report')
    return (await db.report(env.DB, user, me.id, now)) ? json({}) : fail('nothing to report', 404)
  }

  // everyone else gets the same 404 as a page that isn't there
  if (!admin) return new Response('not found', { status: 404, headers: cors })
  if (path === '/admin/reports' && request.method === 'GET') return json(await db.reported(env.DB))
  const decide = path.match(/^\/admin\/reports\/(\d+)$/)
  if (decide && request.method === 'POST') {
    const user = Number(decide[1])
    if ((await body()).reset) await db.setAvatar(env.DB, user, null)
    else await db.dismiss(env.DB, user)
    return json({})
  }
  return new Response('not found', { status: 404, headers: cors })
}
