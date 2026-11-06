import { expect, it, vi } from 'vitest'

// just enough of web audio to see what gets started and when
const started: number[] = []
class FakeContext {
  currentTime = 0
  state = 'running'
  destination = {}
  resume() {}
  decodeAudioData = async () => ({ duration: 0.3 })
  createGain = () => ({ gain: { value: 1 }, connect: (to: unknown) => to })
  createBufferSource = () => ({
    buffer: null,
    playbackRate: { value: 1 },
    connect: (to: unknown) => to,
    start: (at: number) => started.push(at),
  })
}

vi.stubGlobal('AudioContext', FakeContext)
vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }))
vi.stubGlobal('document', { hidden: false })
vi.stubGlobal('navigator', {})

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
