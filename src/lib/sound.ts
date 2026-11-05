import { load, save } from './storage'

// Kenney's Casino Audio pack (CC0), denoised and converted to mono mp3 in public/sfx. A few takes of each so a run
// of the same sound doesn't come out identical
const FILES = {
  // the pack's chip lay is on a hard table, so these are it muffled and a touch lower, like felt soaking it up
  chip: ['chip-felt-1', 'chip-felt-2', 'chip-felt-3'],
  stack: ['chips-stack-1', 'chips-stack-2', 'chips-stack-4'], // on another chip
  handle: ['chips-handle-1', 'chips-handle-3'],
  collide: ['chips-collide-1', 'chips-collide-2'],
  card: ['card-place-1', 'card-place-2'],
  // ponytail: stand-in, every shove and slide take in the pack hisses. Swap in a clean swish when there is one
  fold: ['card-place-1', 'card-place-2'],
  fan: ['card-fan-1'],
  slide: ['card-slide-1'],
}

// the interface noises are just blips, so they're made here rather than shipped. at and ms are in ms
type Blip = { freq: number; to?: number; ms: number; at?: number; type?: OscillatorType; gain?: number }
const BLIPS: Record<string, Blip[]> = {
  click: [{ freq: 1800, to: 900, ms: 35, type: 'triangle', gain: 0.18 }],
  toggle: [
    { freq: 1100, ms: 30, type: 'triangle', gain: 0.15 },
    { freq: 1500, ms: 40, at: 45, type: 'triangle', gain: 0.15 },
  ],
  turn: [
    { freq: 880, ms: 180, type: 'sine', gain: 0.22 },
    { freq: 1320, ms: 260, at: 120, type: 'sine', gain: 0.22 },
  ],
  tick: [{ freq: 2200, ms: 25, type: 'square', gain: 0.06 }],
  // two knuckles on the felt
  check: [
    { freq: 180, to: 60, ms: 90, type: 'sine', gain: 0.7 },
    { freq: 170, to: 60, ms: 90, at: 120, type: 'sine', gain: 0.6 },
  ],
}

export type SoundName = keyof typeof FILES | 'click' | 'toggle' | 'turn' | 'tick' | 'check'

const KEY = 'ponker-sound'
// ponytail: fixed caps. A payout is dozens of chips at once and past a few voices it's just noise
const MAX_VOICES = 8
const MASTER = 0.5 // everything at once, turn this to change the whole app's volume
const GAP_S = 0.03 // the same sound closer together than this is one sound

let ctx: AudioContext | null = null
let voices = 0
const buffers = new Map<string, Promise<AudioBuffer | null>>()
const last: Partial<Record<SoundName, number>> = {}

export const soundOn = () => load(KEY, true)
export const setSound = (on: boolean) => save(KEY, on)

const buffer = (file: string) => {
  let pending = buffers.get(file)
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}sfx/${file}.mp3`)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx!.decodeAudioData(data))
      .catch(() => null) // a missing file is just a quiet one
    buffers.set(file, pending)
  }
  return pending
}

// browsers only start audio from a tap, so the first one makes the context and warms every file
export function unlock() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  Object.values(FILES).flat().forEach(buffer)
}

// delay is in ms on the audio clock, so it can be the same number an animation was given
export function sound(name: SoundName, { delay = 0, volume = 1, rate = 1, hidden = false } = {}) {
  if (!ctx || ctx.state !== 'running' || !soundOn() || (document.hidden && !hidden)) return
  const at = ctx.currentTime + delay / 1000
  if (Math.abs(at - (last[name] ?? -1)) < GAP_S || voices >= MAX_VOICES) return
  last[name] = at
  voices++

  const context = ctx
  const blips = BLIPS[name]
  if (blips) return blip(context, blips, at, volume)

  const files = FILES[name as keyof typeof FILES]
  void buffer(files[Math.floor(Math.random() * files.length)]!).then((data) => {
    if (!data) return voices--
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = data
    source.playbackRate.value = rate * (0.94 + Math.random() * 0.12)
    gain.gain.value = MASTER * volume * (0.85 + Math.random() * 0.15)
    source.connect(gain).connect(context.destination)
    source.onended = () => voices--
    source.start(Math.max(at, context.currentTime))
  })
}

function blip(context: AudioContext, parts: Blip[], at: number, volume: number) {
  parts.forEach(({ freq, to, ms, at: offset = 0, type = 'sine', gain: level = 0.2 }, i) => {
    const start = at + offset / 1000
    const end = start + ms / 1000
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (to) osc.frequency.exponentialRampToValueAtTime(to, end)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(MASTER * level * volume, start + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(gain).connect(context.destination)
    if (i === parts.length - 1) osc.onended = () => voices--
    osc.start(start)
    osc.stop(end)
  })
}
