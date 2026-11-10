import { load, save } from './storage'

// Kenney's Casino Audio pack (CC0), denoised and converted to mono mp3 in public/sfx. A few takes of each so a run
// of the same sound doesn't come out identical
const FILES = {
  // the pack's chip lay is on a hard table, so this is it muffled and a touch lower, like felt soaking it up.
  // Just the one take, the other two were poor. The pitch and level jitter keeps a run of them from sounding identical
  chip: ['chip-felt-3'],
  stack: ['chips-stack-1', 'chips-stack-2', 'chips-stack-4'], // on another chip
  handle: ['chips-handle-1', 'chips-handle-3'],
  collide: ['chips-collide-1', 'chips-collide-2'],
  card: ['card-place-1', 'card-place-2'],
  // ponytail: stand-in, every shove and slide take in the pack hisses. Swap in a clean swish when there is one
  fold: ['card-place-1', 'card-place-2'],
  fan: ['card-fan-1'],
  slide: ['card-slide-1'],
}

// a take's own level and pitch, on top of whatever each call asks for. Tune a file here rather than at every call
const TUNE: Partial<Record<keyof typeof FILES, { volume?: number; rate?: number }>> = {
  chip: { volume: 0.8, rate: 1.06 }, // a touch quieter and about a semitone up
}

// the interface noises are just blips, so they're made here rather than shipped. at and ms are in ms
type Blip = { freq: number; to?: number; ms: number; at?: number; type?: OscillatorType; gain?: number }
const BLIPS = {
  chatKey: [
    { freq: 720, to: 240, ms: 24, type: 'triangle', gain: 0.09 },
    { freq: 180, to: 80, ms: 32, type: 'sine', gain: 0.15 },
  ],
  chatOpen: [{ freq: 380, to: 760, ms: 65, type: 'sine', gain: 0.14 }],
  chatSend: [
    { freq: 540, to: 920, ms: 70, type: 'sine', gain: 0.18 },
    { freq: 1080, to: 1400, ms: 85, at: 45, type: 'sine', gain: 0.12 },
  ],
  chatReceive: [
    { freq: 1040, to: 880, ms: 85, type: 'sine', gain: 0.17 },
    { freq: 660, ms: 110, at: 65, type: 'sine', gain: 0.12 },
  ],
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
} satisfies Record<string, Blip[]>

export type SoundName = keyof typeof FILES | keyof typeof BLIPS

const KEY = 'ponker-sound'
// ponytail: fixed caps. A payout is dozens of chips at once and past a few voices it's just noise
const MAX_VOICES = 8
const MASTER = 0.5 // everything at once, turn this to change the whole app's volume
const GAP_S = 0.03 // the same sound closer together than this is one sound

let ctx: AudioContext | null = null
// Everything scheduled, on the audio clock, so the caps go by what'll be sounding at the same moment rather than by
// what's been asked for. A sweep asks for every chip's landing up front, seconds apart, and counting those as they
// were asked for used up all eight voices on the first seats and left the last one's toss silent
const voices: { name: SoundName; start: number; end: number }[] = []
const VOICE_S = 0.6 // ponytail: a guess at a take's length until its file's loaded, then it's the real one
const buffers = new Map<string, Promise<AudioBuffer | null>>()

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
  // iOS mutes web audio on the silent switch unless the page asks to be a player. The cost is it pauses
  // whatever else is playing, which Aidan's fine with for now. Safari 16.4+, nothing elsewhere
  const session = (navigator as { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
  ctx ??= new AudioContext()
  // iOS also has 'interrupted', after a call or another app grabbing the audio
  if (ctx.state !== 'running') void ctx.resume()
  Object.values(FILES).flat().forEach(buffer)
}

// delay is in ms on the audio clock, so it can be the same number an animation was given
export function sound(name: SoundName, { delay = 0, volume = 1, rate = 1, hidden = false } = {}) {
  if (!ctx || ctx.state !== 'running' || !soundOn() || (document.hidden && !hidden)) return
  const now = ctx.currentTime
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i]!.end < now) voices.splice(i, 1)
  const at = now + delay / 1000
  if (voices.some((voice) => voice.name === name && Math.abs(voice.start - at) < GAP_S)) return
  if (voices.filter((voice) => voice.start <= at && at < voice.end).length >= MAX_VOICES) return
  const voice = { name, start: at, end: at + VOICE_S }
  voices.push(voice)

  const context = ctx
  const blips: Blip[] | undefined = BLIPS[name as keyof typeof BLIPS]
  if (blips) {
    voice.end = at + Math.max(...blips.map(({ ms, at: offset = 0 }) => offset + ms)) / 1000
    return blip(context, blips, at, volume)
  }

  const files = FILES[name as keyof typeof FILES]
  const tune = TUNE[name as keyof typeof FILES]
  volume *= tune?.volume ?? 1
  rate *= tune?.rate ?? 1
  void buffer(files[Math.floor(Math.random() * files.length)]!).then((data) => {
    if (!data) return (voice.end = 0)
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = data
    source.playbackRate.value = rate * (0.94 + Math.random() * 0.12)
    gain.gain.value = MASTER * volume * (0.85 + Math.random() * 0.15)
    source.connect(gain).connect(context.destination)
    const start = Math.max(at, context.currentTime)
    voice.end = start + data.duration / source.playbackRate.value
    source.start(start)
  })
}

function blip(context: AudioContext, parts: Blip[], at: number, volume: number) {
  parts.forEach(({ freq, to, ms, at: offset = 0, type = 'sine', gain: level = 0.2 }) => {
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
    osc.start(start)
    osc.stop(end)
  })
}
