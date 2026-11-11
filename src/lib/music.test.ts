import { beforeEach, expect, it, vi } from 'vitest'

let hidden = false
let nextPlay: Promise<void>
const players: FakeAudio[] = []
class FakeAudio {
  loop = false
  preload = ''
  volume = 1
  paused = true
  currentTime = 90
  play = vi.fn(() => {
    this.paused = false
    return nextPlay
  })
  pause = vi.fn(() => { this.paused = true })
  addEventListener = vi.fn()
  constructor(public src: string) { players.push(this) }
}

beforeEach(() => {
  vi.resetModules()
  hidden = false
  nextPlay = Promise.resolve()
  players.length = 0
  const settings = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => settings.get(key) ?? null,
    setItem: (key: string, value: string) => settings.set(key, value),
  })
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('document', { get hidden() { return hidden } })
})

it('saves volume independently, applies it before playback and adjusts the current track', async () => {
  const music = await import('./music')
  music.setMusicVolume(0.65)
  expect(players).toHaveLength(0)
  expect(music.musicState().enabled).toBe(false)
  expect(localStorage.getItem('ponker-music-volume')).toBe('0.65')
  music.setMusic(true)
  expect(players[0]!.volume).toBe(0.65)
  music.setMusicVolume(0)
  expect(players[0]).toMatchObject({ volume: 0, currentTime: 90, paused: false })
  expect(music.musicState().enabled).toBe(true)
  music.setMusic(false)
  music.setMusic(true)
  expect(players[0]!.volume).toBe(0)
})

it('restores saved music volume and rejects invalid stored levels', async () => {
  localStorage.setItem('ponker-music-volume', '0.75')
  expect((await import('./music')).musicState().volume).toBe(0.75)
  vi.resetModules()
  localStorage.setItem('ponker-music-volume', '4')
  expect((await import('./music')).musicState().volume).toBe(0.3)
})

it('streams only after opting in, saves music independently and reuses the player', async () => {
  const music = await import('./music')
  music.unlockMusic()
  expect(players).toHaveLength(0)
  localStorage.setItem('ponker-sound', 'false')
  music.setMusic(true)
  await vi.waitFor(() => expect(players[0]!.play).toHaveBeenCalledTimes(1))
  expect(players[0]).toMatchObject({ loop: true, preload: 'none', volume: 0.3 })
  expect(localStorage.getItem('ponker-music')).toBe('true')
  expect(localStorage.getItem('ponker-sound')).toBe('false')
  music.setMusic(false)
  expect(players[0]!.paused).toBe(true)
  music.setMusic(true)
  expect(players).toHaveLength(1)
  expect(players[0]!.currentTime).toBe(90)
})

it('pauses a hidden tab and resumes only while music is enabled', async () => {
  const music = await import('./music')
  music.setMusic(true)
  await vi.waitFor(() => expect(players[0]!.paused).toBe(false))
  await new Promise((done) => setTimeout(done, 0))
  hidden = true
  music.musicVisibility()
  expect(players[0]!.paused).toBe(true)
  hidden = false
  music.musicVisibility()
  expect(players[0]!.play).toHaveBeenCalledTimes(2)
  music.setMusic(false)
  music.musicVisibility()
  expect(players[0]!.paused).toBe(true)
})

it('retries autoplay blocking on a gesture without duplicate pending plays', async () => {
  let reject!: (error: unknown) => void
  nextPlay = new Promise((_, fail) => { reject = fail })
  const music = await import('./music')
  music.setMusic(true)
  music.unlockMusic()
  expect(players[0]!.play).toHaveBeenCalledTimes(1)
  players[0]!.paused = true
  reject(new DOMException('Gesture needed', 'NotAllowedError'))
  await new Promise((done) => setTimeout(done, 0))
  expect(music.musicState().failed).toBe(false)
  nextPlay = Promise.resolve()
  music.unlockMusic()
  expect(players[0]!.play).toHaveBeenCalledTimes(2)
})

it('reports stream failures and clears the failure after a successful retry', async () => {
  nextPlay = Promise.reject(new Error('Stream unavailable'))
  const music = await import('./music')
  const listener = vi.fn()
  const unsubscribe = music.subscribeMusic(listener)
  music.setMusic(true)
  await vi.waitFor(() => expect(music.musicState().failed).toBe(true))
  players[0]!.paused = true
  nextPlay = Promise.resolve()
  music.setMusic(true)
  await vi.waitFor(() => expect(music.musicState().failed).toBe(false))
  expect(listener).toHaveBeenCalled()
  unsubscribe()
})

it('restores an enabled preference but waits for a gesture before streaming', async () => {
  localStorage.setItem('ponker-music', 'true')
  const music = await import('./music')
  expect(music.musicState().enabled).toBe(true)
  expect(players).toHaveLength(0)
  music.unlockMusic()
  expect(players[0]!.play).toHaveBeenCalledTimes(1)
})

it('resumes when music is switched off and back on before play settles', async () => {
  let resolve!: () => void
  nextPlay = new Promise((done) => { resolve = done })
  const music = await import('./music')
  music.setMusic(true)
  music.setMusic(false)
  music.setMusic(true)
  expect(players[0]!.paused).toBe(true)
  nextPlay = Promise.resolve()
  resolve()
  await vi.waitFor(() => expect(players[0]!.paused).toBe(false))
  expect(players[0]!.play).toHaveBeenCalledTimes(2)
})
