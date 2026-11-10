import { afterEach, beforeEach, expect, test, vi } from 'vitest'

let store: Map<string, string>

beforeEach(() => {
  vi.resetModules()
  store = new Map([['ponker-session', 'test-session']])
  const events = new EventTarget()
  vi.stubGlobal('location', { hostname: 'localhost' })
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
  expect(store.get('ponker-picture-choices')).toBe('{}')
})

test('an offline visibility choice stays queued until a later successful sync', async () => {
  store.set('ponker-hidden-art', '[2]')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const account = await import('./account')
  account.setArtHidden(2, false)
  await account.syncHiddenArt().catch(() => {})
  expect(account.hiddenArt()).toEqual([])
  expect(store.get('ponker-picture-choices')).toBe('{"2":false}')
  const fetcher = vi.fn().mockResolvedValue(Response.json({ hidden: [], shown: [2] }))
  vi.stubGlobal('fetch', fetcher)
  await account.syncHiddenArt(true)
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).choices).toEqual([{ user: 2, hidden: false }])
  expect(store.get('ponker-picture-choices')).toBe('{}')
})
