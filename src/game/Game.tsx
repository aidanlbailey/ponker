import { isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '../components/Dialog'
import { BotSheet, PlayerSheet } from '../profile/Profile'
import { cachedMe, call, session, type Me } from '../lib/account'
import { botById, type Bot } from './roster'
import { legalActions, type TableState } from '../engine/engine'
import { useStoredState } from '../hooks/useStoredState'
import { setSound, sound, soundOn } from '../lib/sound'
import { BetControls, useFlick } from './BetControls'
import { ChipStack } from '../components/Chip'
import { colorOf, potSize, saidKind } from './betting'
import { advice, describeHand, HAND_RANKS, priceToCall } from './helpers'
import { Avatar, ChipFlight, ChipPile, ChipShadows, DROP_HIT_MS, DROP_MS, PILE_LOOK, PlayingCard, reducedMotion, SHOWN } from './Pieces'
import { busted, BUY_IN, winnings } from './solo'
import { MAX_STACK, total } from './piles'
import { useSoloTable } from './useSoloTable'
import type { TableGame } from './useStage'
import '@fontsource-variable/manrope'
import './game.css'

const MUCK_MS = 450 // the folded cards' landing, keep in step with .seat.me.folded .seat-cards in game.css

const percent = (share: number) => `${Math.round(share * 100)}%`
const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ')
// Smaller rings sit in the six-max spots, clockwise from you at place 0 (place is seats round from you,
// so you're always at the bottom). Spaced evenly, four players put the side seats level with the board,
// right over its end cards on a phone
const SPOTS: Record<number, number[]> = { 3: [0, 2, 4], 4: [0, 2, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] }

function angleOf(place: number, seats: number) {
  const spot = seats === 2 ? place * 3 : SPOTS[seats]![place]!
  return Math.PI / 2 + (2 * Math.PI * spot) / 6
}

// Round the oval from the hero at the bottom. reach is how far out from the middle, 1 is the rail.
function around(place: number, seats: number, reach: number, reachY = reach) {
  const angle = angleOf(place, seats)
  // the top half of a full ring sits a touch lower, a bot's cards stack above its plate
  const tall = seats > 2 && Math.sin(angle) < 0 ? 37 : 40
  return { '--x': `${50 + 43 * reach * Math.cos(angle)}%`, '--y': `${50 + tall * reachY * Math.sin(angle)}%` } as CSSProperties
}

// Heads-up the bets sit halfway in, and so does yours. Round a full ring the middle's taken by the
// pot and board: the top seat bets beside its plate, and the corners sideways, level with their plate.
function betSpot(place: number, seats: number) {
  const angle = angleOf(place, seats)
  if (seats === 2 || place === 0) return { className: 'bet mine', style: around(place, seats, 0.52) }
  if (Math.abs(Math.cos(angle)) < 0.3) return { className: 'bet beside', style: around(place, seats, 1) }
  return { className: cx('bet side', Math.sin(angle) < 0 && 'high'), style: around(place, seats, 0.62, 1) }
}

// the upper right corner's bet sits in the pot amount's row, so a pot with a few colours runs the amount into it.
// Hands back the bet's x so the amount can stop short of it, null when there's nothing there to hit
function crowdingBet(view: TableState, bottom: number, hasChips: (seat: number) => boolean) {
  const seats = view.seats.length
  if (seats <= 2) return null
  for (let i = 0; i < seats; i++) {
    const angle = angleOf((i - bottom + seats) % seats, seats)
    if (Math.sin(angle) < 0 && Math.cos(angle) >= 0.3 && hasChips(i)) return 50 + 43 * 0.62 * Math.cos(angle)
  }
  return null
}

// the next seats round that were dealt in, since a room can have open chairs or someone sat out
function blindOf(view: TableState, seat: number) {
  if (view.street === 'waiting') return null
  const n = view.seats.length
  const next = (from: number) => {
    for (let k = 1; k <= n; k++) if (view.seats[(from + k) % n]?.cards.length) return (from + k) % n
    return -1
  }
  // heads-up the button is the small blind
  const small = view.seats.filter((s) => s?.cards.length).length === 2 ? view.button : next(view.button)
  return seat === small ? 'SB' : seat === next(small) ? 'BB' : null
}

function resultText(view: TableState, me: number | null, nameOf: (seat: number) => string) {
  const won = view.seats.map((_, i) => winnings(view, i))
  const winners = won.flatMap((amount, i) => (amount ? [i] : []))
  if (winners.length > 1) {
    const first = won[winners[0]!]!
    if (winners.every((seat) => won[seat] === first)) return `Split pot, ${first} each`
    // side pots going different ways
    return winners.map((seat) => `${nameOf(seat)} ${won[seat]}`).join(', ')
  }
  const seat = winners[0]
  if (seat === undefined) return ''
  const hand = view.result?.flatMap((pot) => pot.winners).find((winner) => winner.seat === seat && winner.hand)?.hand
  const tail = hand ? ` with ${hand.toLowerCase()}` : ''
  const verb = seat === me && nameOf(seat) === 'You' ? 'win' : 'wins'
  return `${nameOf(seat)} ${verb} ${won[seat]}${tail}`
}

// a pill that fades out instead of vanishing. It hangs on to what it last said so there's something to fade,
// and isn't there at all until it's first shown, or it'd fade out on mount
function Fade({ show, className, children, title }: { show: boolean; className: string; children: ReactNode; title?: string }) {
  const [last, setLast] = useState<ReactNode>(null)
  if (show && last !== children) setLast(children)
  const shown = show ? children : last
  if (shown === null) return null
  return (
    <span className={cx(className, !show && 'gone')} aria-hidden={!show || undefined} title={title}>
      {shown}
    </span>
  )
}

// A seat's plate, sized by its stack. A digit more or less used to snap it wider or narrower, so it eases from
// the width it had to the one it's got. fit is what it's sized by. Mid ease the number's clipped by .seat-info
// rather than poking out the end
function Plate({ fit, children }: { fit: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const was = useRef(0)
  const easing = useRef<Animation | null>(null)
  // kept current, or a width read before the font loaded had every plate dip a couple of px on its first change
  useEffect(() => {
    const el = ref.current!
    const watch = new ResizeObserver(() => {
      if (easing.current?.playState !== 'running') was.current = el.offsetWidth
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  useLayoutEffect(() => {
    const el = ref.current!
    // still easing, so it starts from wherever it's got to
    const from = easing.current?.playState === 'running' ? el.offsetWidth : was.current
    easing.current?.cancel()
    const to = el.offsetWidth
    was.current = to
    if (!from || from === to || reducedMotion()) return
    easing.current = el.animate({ width: [`${from}px`, `${to}px`] }, { duration: 300, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' })
  }, [fit])
  return (
    <div ref={ref} className="seat-plate">
      {children}
    </div>
  )
}

const SAID_EXITS =new Set(['said-fade', 'said-wilt'])

// A seat's action pill. Its exit is timed in game.css, and a new street or hand clearing the seat's line used to
// unmount it partway through. Now it hangs on until its own fade's done. Same words again is a new pill, so n
function Said({ line, muted }: { line?: { text: string; n: number }; muted?: boolean }) {
  const text = line?.text ?? ''
  const [pill, setPill] = useState({ text, n: line?.n ?? 0, faded: false })
  if (line && line.n !== pill.n) setPill({ text: line.text, n: line.n, faded: false })
  // reduced motion has no fade to wait for
  if (!pill.text || (!text && (pill.faded || reducedMotion()))) return null
  return (
    <span
      key={pill.n}
      className={cx('said', saidKind(pill.text), !!muted && 'muted')}
      onAnimationEnd={(e) => SAID_EXITS.has(e.animationName) && setPill((p) => ({ ...p, faded: true }))}
    >
      {pill.text}
    </span>
  )
}

// the dock's main slot. When what it shows changes, the old one fades out and only then does the new one fade
// in, both in one grid cell so nothing jumps. Each id keeps its last children around so there's something to fade
// node is what the layer last showed, kept up to date while it's the current one
type Layer = { id: string; late: boolean; node: ReactNode }
function Swap({ id, children }: { id: string; children: ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>([{ id, late: false, node: children }])
  const top = layers.at(-1)!
  if (top.id !== id) {
    // something's already fading out, so whatever was waiting behind it never got seen. Skip it rather than
    // fade it out too, which would flash it
    const leaving = layers.length > 1 ? layers.slice(0, 1) : layers
    // an empty slot has nothing to wait for, '' is Table's id for showing nothing
    const late = leaving.some((was) => was.id !== '' && was.id !== id)
    setLayers([...leaving.filter((was) => was.id !== id), { id, late, node: children }])
  } else if (top.node !== children) setLayers([...layers.slice(0, -1), { ...top, node: children }])

  return (
    <div className="swap">
      {layers.map((was) => (
        <div
          key={was.id}
          className={cx('swap-layer', was.late && 'late', was.id !== id && 'gone')}
          inert={was.id !== id}
          onAnimationEnd={(e) => {
            // chips inside animate too, only the layer's own fade counts
            if (e.target !== e.currentTarget || was.id === id) return
            setLayers((now) => now.filter((other) => other.id !== was.id))
          }}
        >
          {was.node}
        </div>
      ))}
    </div>
  )
}

function CheatSheet({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Hand rankings" className="cheat-sheet" onClose={onClose}>
      <ol>
        {HAND_RANKS.map(([name, how]) => (
          <li key={name}>
            <b>{name}</b> <span>{how}</span>
          </li>
        ))}
      </ol>
      <p>
        Your best five cards from your two and the five on the table. The two players after the dealer (D) post the
        small blind (SB) and big blind (BB). Play goes clockwise, and the dealer acts last after the flop. Heads-up the
        dealer posts the small blind and acts first before the flop.
      </p>
      <p>
        Win chance is measured against random hands, so treat it as a guide. Someone betting big usually holds better
        than random.
      </p>
    </Dialog>
  )
}

type TableProps = {
  game: TableGame
  name: string
  bar?: ReactNode // extra buttons in the top bar
  dock?: ReactNode // under the bet controls
  side?: ReactNode // pinned over the dock's top right corner, a room's chat. Never moves the controls
  // solo only, it never counts for rating and nobody else can sit in
  canHint?: boolean
  children?: ReactNode
}

export function Table({ game, name, bar, dock, side, canHint, children }: TableProps) {
  const { view, board, over, paid, idle } = game
  const [hintsOn, setHints] = useStoredState('ponker-hints', true)
  const hints = !!canHint && hintsOn
  // saved straight away rather than through useStoredState, so the toggle's own click hears the new setting
  const [audible, setAudible] = useState(soundOn)
  const [sheet, setSheet] = useState(false)
  const [bot, setBot] = useState<Bot | null>(null)
  const [underSeats, setUnderSeats] = useState<HTMLDivElement | null>(null)
  const [overSeats, setOverSeats] = useState<HTMLDivElement | null>(null)

  const heroName = name || 'You'
  const nameOf = (seat: number) => (seat === game.me ? heroName : game.nameOf(seat))
  const seats = view.seats.length
  const bottom = game.me ?? 0
  const crowdX = crowdingBet(view, bottom, (i) => game.pile(`bet-${i}`).length + game.pile(`win-${i}`).length > 0)
  const me = game.me === null ? null : view.seats[game.me]!
  const live = view.street !== 'waiting' && !idle
  const inHand = !!me && me.cards.length > 0 && !me.folded
  const legal = game.dealing || game.moving ? null : legalActions(view)
  const myTurn = me && legal?.seat === game.me && !me.sittingOut ? legal : null
  const pot = potSize(view)
  const shownPot = total(game.pile('pot'))
  const finished = over && paid
  const canShow = finished && inHand && !me.shown
  const newest = Object.values(game.said).at(-1)?.text
  const quiet = game.dealing || view.toAct < 0 || view.toAct === game.me
  const showHint = hints && live && inHand
  const waitText = live && !myTurn && !quiet ? `${nameOf(view.toAct)} to act` : ''
  // whatever the dock shows, spelled out so Swap knows when it's changed. Rooms key their own docks
  const turnKey = myTurn && me ? `${view.street}-${view.currentBet}-${me.bet}` : ''
  const idleKey = idle && me && (canShow || game.deal) ? `idle-${canShow}-${!!game.deal}` : ''
  const dockKey = dock ? String(isValidElement(dock) ? dock.key : 'dock') : waitText
  const clock = game.clock?.seat === game.me ? game.clock : null
  // facing a bet your cards can be flicked at the pot to fold, same as the Fold button
  const canMuck = !!myTurn && !myTurn.canCheck
  // let go on a flick, the folded cards' own transition carries them on from wherever the hand left them
  // a flick lands the cards right back under the hand, so no peeking that hand until the pointer's been off them
  const [noPeek, setNoPeek] = useState<number | null>(null)
  const landsAt = useRef(0)
  const [cardsHeld, cardFlick] = useFlick(
    () => {
      game.act({ type: 'fold', seat: game.me! })
      landsAt.current = performance.now() + MUCK_MS
      setNoPeek(game.hand)
      // landed somewhere the pointer isn't, then the next hover's fine
      setTimeout(() => {
        if (!document.querySelector('.seat.me .seat-cards:hover')) setNoPeek(null)
      }, MUCK_MS)
    },
    (el) => [el.getBoundingClientRect(), document.querySelector('[data-spot="pot"]')!.getBoundingClientRect()],
  )

  // even from a background tab, that's when it's most useful
  useEffect(() => {
    if (turnKey) sound('turn', { hidden: true })
  }, [turnKey])

  // the last five seconds of your clock
  useEffect(() => {
    if (!clock) return
    const timers = [5, 4, 3, 2, 1]
      .map((left) => clock.ms - left * 1000)
      .filter((at) => at >= 0)
      .map((at) => setTimeout(() => sound('tick', { hidden: true }), at))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock?.key])

  return (
    <div className="poker" style={PILE_LOOK}>
      <header className="poker-bar">
        {/* the way out, straight away even mid hand. A room plays your seat out without you */}
        <button className="poker-toggle poker-link" aria-label="Leave" onClick={game.leave}>
          <span aria-hidden="true">{'‹'}</span> <span className="poker-link-text">Leave</span>
        </button>
        <span className="poker-spacer" />
        {bar}
        {canHint && (
          <button className={cx('poker-toggle', hints && 'on')} aria-pressed={hints} onClick={() => setHints(!hints)}>
            Hints
          </button>
        )}
        {/* an icon, a room's bar ran off a phone with it spelled out */}
        <button
          className={cx('poker-toggle', 'poker-icon', audible && 'on')}
          aria-label="Sound"
          aria-pressed={audible}
          onClick={() => {
            setSound(!audible)
            setAudible(!audible)
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />
            <path d={audible ? 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12' : 'M16 9l6 6M22 9l-6 6'} />
          </svg>
        </button>
        <button className="poker-toggle" aria-label="Hand rankings" onClick={() => setSheet(true)}>
          ?
        </button>
        {me && me.chips < BUY_IN && game.toggleTopUp && (
          <button className={cx('poker-toggle', game.topUp && 'on')} aria-pressed={game.topUp} onClick={game.toggleTopUp}>
            {game.topUp ? 'Topping up' : 'Top up'}
          </button>
        )}
      </header>

      <main className="table-wrap">
        <div className={cx('felt', seats > 2 && 'ring')}>
          <ChipShadows />
          <div className="felt-center">
            <output
              className={cx('pot', crowdX !== null && 'crowded')}
              style={{ '--of': game.potStacks.length, '--tall': Math.max(1, ...game.potStacks.map((stack) => stack.count)), '--crowd-x': crowdX ?? 0 } as CSSProperties}
            >
              <span className="pile-slot pot-slot" data-spot="pot">
                {game.potStacks.map(({ value, part, count }, i) => (
                  <span key={`${value}-${part}`} className="pot-stack" style={{ '--stack': i } as CSSProperties}>
                    <ChipPile colors={Array<string>(count).fill(colorOf(value))} shown={MAX_STACK} />
                  </span>
                ))}
              </span>
              <Fade show={shownPot > 0} className="pile-label">
                Pot {shownPot.toLocaleString('en-US')}
              </Fade>
            </output>
            <div className="board">
              {board.map((card, i) => (
                <PlayingCard key={`${game.hand}-${i}`} card={card} delay={i < 3 ? i * 110 : 0} />
              ))}
            </div>
          </div>

          {view.seats.map((seat, i) => {
            const place = (i - bottom + seats) % seats
            if (!seat) {
              return (
                <div key={`open-${i}`} className="seat open" style={around(place, seats, 1)}>
                  <div className="seat-plate">
                    <span className="seat-name">Open seat</span>
                  </div>
                </div>
              )
            }
            const isMe = i === game.me
            const blind = blindOf(view, i)
            const won = finished && winnings(view, i) > 0
            const out = finished && !!game.bustLeaves && busted(view, i, game.me)
            const betChips = game.pile(`bet-${i}`)
            const winChips = game.pile(`win-${i}`)
            const drop = game.drop(i)
            const bet = total(betChips) + total(winChips)
            const spot = betSpot(place, seats)
            const turn = view.toAct === i && !game.dealing && !game.moving
            const clock = turn && game.clock?.seat === i ? game.clock : null
            const tag = game.tagOf?.(i)
            const emote = game.emoteOf?.(i)
            const seatClass = cx('seat', isMe && 'me', turn && 'turn', seat.folded && 'folded', won && 'winner', out && 'out', game.arrivals.includes(i) && 'arrive', spot.className === 'bet beside' && 'upper')
            const stack = out ? 'Out' : game.stack(i).toLocaleString('en-US')
            const seatBot = botById(seat.id)
            const profile = seatBot ? () => setBot(seatBot) : game.openPlayer?.(i)
            const info = (
              <>
                <Avatar id={seat.id} art={game.artOf?.(i)} onTap={profile} label={isMe ? 'See your profile' : undefined} />
                <div className="seat-info">
                  {profile ? (
                    <button type="button" className="seat-name seat-link" onClick={profile}>
                      {nameOf(i)}
                    </button>
                  ) : (
                    <span className="seat-name">{nameOf(i)}</span>
                  )}
                  <span className="seat-stack">{stack}</span>
                </div>
              </>
            )
            return (
              <div key={seat.id}>
                <div
                  className={spot.className}
                  style={{ ...spot.style, '--chips': winChips.length || Math.min(betChips.length, SHOWN) } as CSSProperties}
                >
                  <span className="pile-slot" data-spot={`bet-${i}`}>
                    {betChips.length > 0 && <ChipPile colors={betChips.map(colorOf)} />}
                    {/* the band just banked, shrinking into the felt under the rest as they fall. Outside the pile's
                        check so the last band gets its shrink too */}
                    {drop.band.length > 0 && (
                      <span key={`band-${drop.n}`} className="win-band" style={{ '--shrink-ms': `${DROP_HIT_MS * 0.8}ms` } as CSSProperties}>
                        <ChipStack colors={drop.band.map(colorOf)} under={drop.gone - drop.by} />
                      </span>
                    )}
                    {/* a winner's pile builds where the bets were. Keyed by band so each one banked replays the fall */}
                    {winChips.length > 0 && (
                      <span
                        key={drop.n}
                        className={cx('win-pile', drop.by > 0 && 'drop')}
                        style={{ '--by': drop.by, '--drop-ms': `${DROP_MS}ms` } as CSSProperties}
                      >
                        <ChipPile colors={winChips.map(colorOf)} shown={Infinity} under={drop.gone} />
                      </span>
                    )}
                  </span>
                  <Fade show={bet > 0} className="pile-label">
                    {bet.toLocaleString('en-US')}
                  </Fade>
                </div>
                <div className={seatClass} style={around(place, seats, 1)} data-spot={`seat-${i}`}>
                  <div
                    className={cx('seat-cards', isMe && canMuck && 'muckable', isMe && !!cardsHeld && 'held', isMe && noPeek === game.hand && 'no-peek')}
                    style={isMe && cardsHeld ? ({ '--x': `${cardsHeld.x}px`, '--y': `${cardsHeld.y}px` } as CSSProperties) : undefined}
                    {...(isMe && canMuck ? cardFlick : {})}
                    // leaving mid flight doesn't count, they're about to land back under it
                    onPointerLeave={isMe ? () => performance.now() >= landsAt.current && setNoPeek(null) : undefined}
                  >
                    {seat.cards.map((card, k) => (
                      <PlayingCard key={`${game.hand}-${k}-${card}`} card={card} delay={k * 140 + (isMe ? 0 : 70)} />
                    ))}
                  </div>
                  <Plate fit={stack}>
                    {info}
                    {clock && (
                      <span
                        key={clock.key}
                        className={cx('seat-clock', clock.banked && 'banked')}
                        style={{ '--from': clock.ms / clock.of, '--ms': `${clock.ms}ms` } as CSSProperties}
                      />
                    )}
                  </Plate>
                </div>
                {/* the seat again, invisible, carrying only its badges. Same classes and layout so they sit exactly
                    where they would on the plate, but over the flying chips, which a badge inside the seat can't be */}
                <div className={cx(seatClass, 'seat-badges')} style={around(place, seats, 1)}>
                  <div className="seat-cards" />
                  <Plate fit={stack}>
                    {info}
                    <Fade show={view.button === i && view.street !== 'waiting'} className="dealer" title="Dealer button">
                      D
                    </Fade>
                    <Fade show={!!blind} className="seat-blind">
                      {blind}
                    </Fade>
                    <Fade show={!!tag} className="seat-tag">
                      {tag}
                    </Fade>
                  </Plate>
                  {emote && (
                    <span
                      key={`emote-${emote.key}`}
                      className={cx('said emote', !!emote.draft && 'draft', !!emote.ms && 'chat')}
                      style={emote.ms ? { animationDuration: `${emote.ms}ms` } : undefined}
                    >
                      {emote.text}
                      {emote.draft && <i className="said-caret" aria-hidden="true" />}
                      {emote.note && <small className="said-note">{emote.note}</small>}
                    </span>
                  )}
                  {/* stays mounted under an emote, swapping it out remounted it and replayed the last action once the emote went */}
                  <Said line={game.said[i]} muted={!!emote} />
                </div>
              </div>
            )
          })}
          <div ref={setUnderSeats} className="under-seats" />
          <div ref={setOverSeats} className="over-seats" />
        </div>
      </main>

      <aside className={cx('dock', hints && 'hinted')}>
        {side && <div className="dock-side">{side}</div>}
        <Fade show={showHint} className="hint">
          {showHint && (
            <>
              <b>{describeHand(me.cards, board)}</b>
              {game.chance !== null && <span>Win chance {percent(game.chance)}</span>}
              {myTurn && myTurn.toCall > 0 && <span>Need {percent(priceToCall(myTurn.toCall, pot))} to call</span>}
              {myTurn && game.chance !== null && <em>{advice(game.chance, myTurn, pot)}</em>}
            </>
          )}
        </Fade>

        {/* who won sits in the dock over Next hand. On the felt it wrapped across the seats */}
        <Fade show={finished} className="result">
          {resultText(view, game.me, nameOf)}
        </Fade>

        <Swap id={turnKey || idleKey || dockKey ? [turnKey, idleKey, dockKey].join('|') : ''}>
          {myTurn && me && <BetControls key={turnKey} view={view} legal={myTurn} onAct={game.act} />}

          {idleKey && me && (
            <div className="bet-actions">
              {canShow && (
                <button className="button neutral" onClick={() => game.act({ type: 'show', seat: game.me! })}>
                  Show cards
                </button>
              )}
              {game.deal && (
                <button className="button primary" onClick={game.deal}>
                  {me.chips === 0 ? `Rebuy ${BUY_IN.toLocaleString('en-US')}` : over ? 'Next hand' : 'Deal me in'}
                </button>
              )}
            </div>
          )}

          {dock ?? (waitText && <p className="dock-wait">{waitText}</p>)}
        </Swap>
      </aside>

      {game.flights.map((flight) => {
        const chip = <ChipFlight key={flight.id} flight={flight} onLand={() => game.land(flight)} />
        // Everything flies under the seats, same as the piles it leaves and lands on, so a chip waiting its turn
        // doesn't pop over a plate its pile was tucked under, and a payout pile built from a bet and the pot at
        // once layers as one. Only a flick goes over them, it comes up from the dock under your plate
        const layer = flight.start ? overSeats : underSeats
        return layer ? createPortal(chip, layer, String(flight.id)) : chip
      })}

      <p className="sr-only" aria-live="polite">
        {finished ? resultText(view, game.me, nameOf) : newest}
      </p>

      {sheet && <CheatSheet onClose={() => setSheet(false)} />}
      {bot && <BotSheet key={bot.id} bot={bot} onClose={() => setBot(null)} />}
      {children}
    </div>
  )
}

export default function Game({ name }: { name: string }) {
  const game = useSoloTable()
  const [me, setMe] = useState<Me | null>(cachedMe)
  const [viewing, setViewing] = useState(false)
  useEffect(() => {
    if (session()) call<Me>('/me').then(setMe, () => {})
  }, [])
  return (
    <Table game={{ ...game, openPlayer: (seat) => seat === game.me && me ? () => setViewing(true) : undefined }} name={name} canHint>
      {viewing && me && <PlayerSheet id={me.id} self onClose={() => setViewing(false)} />}
    </Table>
  )
}
