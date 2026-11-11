import { beforeEach, expect, it, vi } from 'vitest'

// just enough of web audio to see what gets started and when
const started: number[] = []
const stopped: number[] = []
const generated: Float32Array[] = []
const files = new Map<ArrayBuffer, string>()
const played: { file: string; rate: number; at: number }[] = []
class FakeContext {
  sampleRate = 44100
  currentTime = 0
  state = 'running'
  destination = {}
  resume() {}
  decodeAudioData = async (data: ArrayBuffer) => ({ duration: 0.3, file: files.get(data) })
  createGain = () => ({
    gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect: (to: unknown) => to,
  })
  createOscillator = () => ({
    type: 'sine',
    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect: (to: unknown) => to,
    start: (at: number) => started.push(at),
    stop() {},
  })
  createBufferSource = () => {
    const node = {
      buffer: null as { file?: string } | null,
      playbackRate: { value: 1 },
      connect: (to: unknown) => to,
      start: (at: number) => {
        started.push(at)
        played.push({ file: node.buffer?.file ?? '', rate: node.playbackRate.value, at })
      },
      stop: () => stopped.push(1),
    }
    return node
  }
  createBuffer = (_channels: number, length: number) => {
    const data = new Float32Array(length)
    generated.push(data)
    return { getChannelData: () => data }
  }
  createBiquadFilter = () => ({
    type: 'bandpass', frequency: { value: 0 }, Q: { value: 0 },
    connect: (to: unknown) => to,
  })
}

vi.stubGlobal('AudioContext', FakeContext)
vi.stubGlobal('fetch', async (url: string) => ({ arrayBuffer: async () => {
  const data = new ArrayBuffer(0)
  files.set(data, url)
  return data
} }))
vi.stubGlobal('document', { hidden: false })
vi.stubGlobal('navigator', {})

beforeEach(() => {
  vi.resetModules()
  started.length = 0
  stopped.length = 0
  generated.length = 0
  played.length = 0
  files.clear()
  const settings = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => settings.get(key) ?? null,
    setItem: (key: string, value: string) => settings.set(key, value),
  })
})

it('keeps the drumroll to the river wait, cancels on exit and silences an active roll on mute', async () => {
  const { sound, unlock, setSound } = await import('./sound')
  const { DRUMROLL_MS } = await import('../game/runout')
  unlock()
  const stop = sound('drumroll')
  expect(started).toEqual([0])
  expect(generated[0]).toHaveLength(44100 * DRUMROLL_MS / 1000)
  expect(generated[0]!.some((sample) => sample !== 0)).toBe(true)
  expect(Math.abs(generated[0]!.at(-1)!)).toBeLessThan(0.001)
  stop?.()
  expect(stopped).toHaveLength(1)
  sound('drumroll', { delay: 2000 })
  setSound(false)
  expect(stopped).toHaveLength(2)
  sound('drumroll', { delay: 4000 })
  expect(started).toHaveLength(2)
})

it('plays every landing of a sweep asked for up front, it only caps what sounds at once', async () => {
  const { sound, unlock } = await import('./sound')
  unlock()
  // a sweep: 20 chips, all asked for as it starts, landing 300ms apart. The cap of 8 used to eat the last 12
  for (let i = 0; i < 20; i++) sound('chip', { delay: i * 300 })
  await vi.waitFor(() => expect(started).toHaveLength(20))
  // and twenty at the very same moment still only play a few
  started.length = 0
  for (let i = 0; i < 20; i++) sound('stack', { delay: 10_000 + i * 31 })
  await vi.waitFor(() => expect(started.length).toBeGreaterThan(0))
  expect(started.length).toBeLessThanOrEqual(8)
})

it('plays a short all-in cue once, leaving room for the chips, and respects mute', async () => {
  const { sound, unlock, setSound } = await import('./sound')
  unlock()
  sound('allin')
  sound('allin')
  await vi.waitFor(() => expect(started).toEqual([0]))
  sound('chip', { delay: 500 })
  await vi.waitFor(() => expect(started).toHaveLength(2))
  setSound(false)
  sound('allin', { delay: 1000 })
  expect(started).toHaveLength(2)
})

it('uses the six ordered pitch clusters at their original pitch and caps the highest step', async () => {
  const { sound, unlock } = await import('./sound')
  unlock()
  for (let i = 0; i < 7; i++) sound('allin', { variant: i, delay: i * 1000 })
  await vi.waitFor(() => expect(played).toHaveLength(7))
  expect(played.map((clip) => clip.file.split('/').at(-1))).toEqual([
    'all-in-1.wav', 'all-in-2.wav', 'all-in-3.wav', 'all-in-4.wav', 'all-in-5.wav', 'all-in-6.wav', 'all-in-6.wav',
  ])
  expect(played.every((clip) => clip.rate === 1)).toBe(true)
})

it('can cancel the final burst before playback or while it plays, including muting', async () => {
  const { sound, unlock, setSound } = await import('./sound')
  unlock()
  const cancel = sound('runoutEnd', { delay: 450 })
  await vi.waitFor(() => expect(played).toHaveLength(1))
  expect(played[0]).toMatchObject({ rate: 1, at: 0.45 })
  expect(played[0]!.file).toContain('runout-end.wav')
  cancel?.()
  expect(stopped).toHaveLength(1)
  sound('runoutEnd', { delay: 2000 })
  setSound(false)
  await Promise.resolve()
  expect(played).toHaveLength(1)
  setSound(true)
  sound('runoutEnd', { delay: 4000 })?.()
  await Promise.resolve()
  expect(played).toHaveLength(1)
})

it('rapid typing leaves room for a receive sound and muting silences every chat cue', async () => {
  const { sound, unlock, setSound } = await import('./sound')
  unlock()
  sound('chatKey')
  const oneKey = started.length
  for (let i = 0; i < 30; i++) sound('chatKey')
  expect(started).toHaveLength(oneKey)
  sound('chatReceive')
  expect(started.length).toBeGreaterThan(oneKey)

  const beforeMute = started.length
  setSound(false)
  for (const name of ['chatKey', 'chatOpen', 'chatSend', 'chatReceive'] as const) sound(name, { delay: 1000 })
  expect(started).toHaveLength(beforeMute)
})
