import { afterEach, beforeEach, expect, test, vi } from 'vitest'

let store: Map<string, string>
const savedChoices = () => [...store].find(([key]) => key.startsWith('ponker-picture-choices:'))?.[1]

beforeEach(() => {
  vi.resetModules()
  store = new Map([['ponker-session', 'test-session']])
  const events = new EventTarget()
  vi.stubGlobal('location', { hostname: 'localhost' })
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events))
  vi.stubGlobal('dispatchEvent', events.dispatchEvent.bind(events))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  })
})

afterEach(() => vi.unstubAllGlobals())

test('an account show choice removes a stale browser hide', async () => {
  store.set('ponker-hidden-art', '[2,3]')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ hidden: [3], shown: [2] })))
  const account = await import('./account')
  await account.syncHiddenArt()
  expect(account.hiddenArt()).toEqual([3])
})

test('a show click during sync wins over the old reply and is sent next', async () => {
  store.set('ponker-hidden-art', '[2]')
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
    .mockResolvedValueOnce(Response.json({ hidden: [], shown: [2] }))
  vi.stubGlobal('fetch', fetcher)
  const account = await import('./account')
  const syncing = account.syncHiddenArt()
  account.setArtHidden(2, false)
  expect(account.hiddenArt()).toEqual([])
  finish(Response.json({ hidden: [2], shown: [] }))
  await syncing
  expect(account.hiddenArt()).toEqual([])
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).choices).toEqual([{ user: 2, hidden: false }])
  expect(savedChoices()).toBe('{}')
})

test('an offline visibility choice stays queued until a later successful sync', async () => {
  store.set('ponker-hidden-art', '[2]')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const account = await import('./account')
  account.setArtHidden(2, false)
  await account.syncHiddenArt().catch(() => {})
  expect(account.hiddenArt()).toEqual([])
  expect(savedChoices()).toBe('{"2":false}')
  const fetcher = vi.fn().mockResolvedValue(Response.json({ hidden: [], shown: [2] }))
  vi.stubGlobal('fetch', fetcher)
  await account.syncHiddenArt(true)
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).choices).toEqual([{ user: 2, hidden: false }])
  expect(savedChoices()).toBe('{}')
})

test('account hides and offline choices do not leak to another account or the guest', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const account = await import('./account')
  account.setArtHidden(2, true)
  await account.syncHiddenArt().catch(() => {})
  store.set('ponker-session', 'other-account')
  expect(account.hiddenArt()).toEqual([])
  const fetcher = vi.fn().mockResolvedValue(Response.json({ hidden: [], shown: [] }))
  vi.stubGlobal('fetch', fetcher)
  await account.syncHiddenArt()
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ ids: [], choices: [] })
  store.set('ponker-session', '')
  expect(account.hiddenArt()).toEqual([])
  store.set('ponker-session', 'test-session')
  expect(account.hiddenArt()).toEqual([2])
  expect(savedChoices()).toBe('{"2":true}')
})

test('guest visibility choices carry into sign-in and stay separate from account state', async () => {
  store.set('ponker-session', '')
  const account = await import('./account')
  account.setArtHidden(2, true)
  account.setArtHidden(3, false)
  store.set('ponker-session', 'test-session')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ hidden: [2, 4], shown: [3] })))
  await account.syncHiddenArt()
  expect(account.hiddenArt()).toEqual([2, 4])
  store.set('ponker-session', '')
  expect(account.hiddenArt()).toEqual([2])
})

test('failed storage writes do not repeatedly resubmit an acknowledged choice', async () => {
  const account = await import('./account')
  account.hiddenArt()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: () => { throw new Error('full') },
  })
  const fetcher = vi.fn().mockResolvedValue(Response.json({ hidden: [2], shown: [] }))
  vi.stubGlobal('fetch', fetcher)
  account.setArtHidden(2, true)
  await account.syncHiddenArt()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(account.hiddenArt()).toEqual([2])
})

test('a new session can sync while the previous session still has a request in flight', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
    .mockResolvedValueOnce(Response.json({ hidden: [3], shown: [] }))
  vi.stubGlobal('fetch', fetcher)
  const account = await import('./account')
  const old = account.syncHiddenArt()
  store.set('ponker-session', 'other-account')
  await account.syncHiddenArt()
  expect(account.hiddenArt()).toEqual([3])
  finish(Response.json({ hidden: [2], shown: [] }))
  await old
  expect(account.hiddenArt()).toEqual([3])
})

test('a late unauthorized response cannot sign out a newer session', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve })))
  const account = await import('./account')
  const old = account.call('/me').catch(() => {})
  store.set('ponker-session', 'other-account')
  finish(Response.json({ why: 'signed out' }, { status: 401 }))
  await old
  expect(account.session()).toBe('other-account')
})
