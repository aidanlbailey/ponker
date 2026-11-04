import { useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '../components/Dialog'
import { legalActions, type TableState } from '../engine/engine'
import { useStoredState } from '../hooks/useStoredState'
import { BetControls } from './BetControls'
import { colorOf, potSize } from './betting'
import { advice, describeHand, HAND_RANKS, priceToCall } from './helpers'
import { Avatar, ChipFlight, ChipPile, PlayingCard, SHOWN } from './Pieces'
import { BIG_BLIND, busted, BUY_IN, SMALL_BLIND, winnings } from './solo'
import { total } from './piles'
import { useSoloTable } from './useSoloTable'
import type { TableGame } from './useStage'
import '@fontsource-variable/manrope'
import '@fontsource/roboto/latin-400.css'
import './game.css'

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
// pot and board: the top seat bets beside its plate, the upper corners just under theirs, and the
// lower ones sideways with the amount riding on the pile, so no two amounts share a row
function betSpot(place: number, seats: number) {
  const angle = angleOf(place, seats)
  if (seats === 2 || place === 0) return { className: 'bet mine', style: around(place, seats, 0.52) }
  if (Math.abs(Math.cos(angle)) < 0.3) return { className: 'bet beside', style: around(place, seats, 1) }
  if (Math.sin(angle) < 0) return { className: 'bet under', style: around(place, seats, 1) }
  return { className: 'bet side', style: around(place, seats, 0.62, 1) }
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
  children?: ReactNode
}

export function Table({ game, name, bar, dock, children }: TableProps) {
  const { view, board, over, paid, idle } = game
  const [hints, setHints] = useStoredState('ponker-hints', true)
  const [sheet, setSheet] = useState(false)
  const [underSeats, setUnderSeats] = useState<HTMLDivElement | null>(null)

  const heroName = name || 'You'
  const nameOf = (seat: number) => (seat === game.me ? heroName : game.nameOf(seat))
  const seats = view.seats.length
  const bottom = game.me ?? 0
  const me = game.me === null ? null : view.seats[game.me]!
  const live = view.street !== 'waiting' && !idle
  const inHand = !!me && me.cards.length > 0 && !me.folded
  const legal = game.dealing || game.moving ? null : legalActions(view)
  const myTurn = me && legal?.seat === game.me && !me.sittingOut ? legal : null
  const pot = potSize(view)
  const shownPot = total(game.pile('pot'))
  const finished = over && paid
  const canShow = finished && inHand && !me.shown
  const newest = Object.values(game.said).at(-1)
  const quiet = game.dealing || view.toAct < 0 || view.toAct === game.me

  return (
    <div className="poker">
      <header className="poker-bar">
        <a href="#" className="poker-link" aria-label="Home">
          <span aria-hidden="true">{'‹'}</span> <span className="poker-link-text">Home</span>
        </a>
        <span className="poker-stakes">
          {SMALL_BLIND}/{BIG_BLIND}
        </span>
        <span className="poker-spacer" />
        {bar}
        <button className={cx('poker-toggle', hints && 'on')} aria-pressed={hints} onClick={() => setHints(!hints)}>
          Hints
        </button>
        <button className="poker-toggle" aria-label="Hand rankings" onClick={() => setSheet(true)}>
          ?
        </button>
        {me && me.chips < BUY_IN && game.toggleTopUp && (
          <button className={cx('poker-toggle', game.topUp && 'on')} aria-pressed={game.topUp} onClick={game.toggleTopUp}>
            {game.topUp ? 'Topping up' : 'Top up'}
          </button>
        )}
        <button className={cx('poker-toggle', game.leaving && 'on')} aria-pressed={game.leaving} onClick={game.toggleLeaving}>
          {game.leaving ? 'Leaving' : 'Leave'}
        </button>
      </header>

      <main className="table-wrap">
        <div className={cx('felt', seats > 2 && 'ring')}>
          <div className="felt-center">
            <output
              className="pot"
              style={{ '--of': game.potStacks.length, '--tall': Math.min(Math.max(1, ...game.potStacks.map((stack) => stack.count)), SHOWN) } as CSSProperties}
            >
              <span className="pile-slot pot-slot" data-spot="pot">
                {game.potStacks.map(({ value, count }, i) => (
                  <span key={value} className="pot-stack" style={{ '--stack': i } as CSSProperties}>
                    <ChipPile colors={Array<string>(count).fill(colorOf(value))} />
                  </span>
                ))}
              </span>
              {shownPot > 0 && <span className="pile-label">Pot {shownPot.toLocaleString('en-US')}</span>}
            </output>
            <div className="board">
              {board.map((card, i) => (
                <PlayingCard key={`${game.hand}-${i}`} card={card} delay={i < 3 ? i * 110 : 0} />
              ))}
            </div>
            {finished && (
              <p key={game.hand} className="result">
                {resultText(view, game.me, nameOf)}
              </p>
            )}
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
            const bet = total(betChips)
            const spot = betSpot(place, seats)
            const turn = view.toAct === i && !game.dealing && !game.moving
            const clock = turn && game.clock?.seat === i ? game.clock : null
            const tag = game.tagOf?.(i)
            const emote = game.emoteOf?.(i)
            return (
              <div key={seat.id}>
                <div
                  className={spot.className}
                  style={{ ...spot.style, '--chips': Math.min(betChips.length, SHOWN) } as CSSProperties}
                >
                  <span className="pile-slot" data-spot={`bet-${i}`}>
                    {bet > 0 && <ChipPile colors={betChips.map(colorOf)} />}
                  </span>
                  {bet > 0 && <span className="pile-label">{bet.toLocaleString('en-US')}</span>}
                </div>
                <div
                  className={cx('seat', isMe && 'me', turn && 'turn', seat.folded && 'folded', won && 'winner', out && 'out', game.arrivals.includes(i) && 'arrive', (spot.className === 'bet under' || spot.className === 'bet beside') && 'upper')}
                  style={around(place, seats, 1)}
                  data-spot={`seat-${i}`}
                >
                  <div className="seat-cards">
                    {seat.cards.map((card, k) => (
                      <PlayingCard key={`${game.hand}-${k}-${card}`} card={card} delay={k * 140 + (isMe ? 0 : 70)} />
                    ))}
                  </div>
                  <div className="seat-plate">
                    <Avatar id={seat.id} />
                    <div className="seat-info">
                      <span className="seat-name">{nameOf(i)}</span>
                      <span className="seat-stack">{out ? 'Out' : game.stack(i).toLocaleString('en-US')}</span>
                    </div>
                    {view.button === i && view.street !== 'waiting' && (
                      <span className="dealer" title="Dealer button">
                        D
                      </span>
                    )}
                    {hints && blind && <span className="seat-blind">{blind}</span>}
                    {tag && <span className="seat-tag">{tag}</span>}
                    {clock && (
                      <span
                        key={clock.key}
                        className={cx('seat-clock', clock.banked && 'banked')}
                        style={{ '--from': clock.ms / clock.of, '--ms': `${clock.ms}ms` } as CSSProperties}
                      />
                    )}
                  </div>
                  {emote ? (
                    <span key={`emote-${emote.key}`} className="said emote">
                      {emote.text}
                    </span>
                  ) : (
                    game.said[i] && (
                      <span key={game.said[i]} className="said">
                        {game.said[i]}
                      </span>
                    )
                  )}
                </div>
              </div>
            )
          })}
          <div ref={setUnderSeats} className="under-seats" />
        </div>
      </main>

      <aside className={cx('dock', hints && 'hinted')}>
        {hints && live && inHand && (
          <div className="hint">
            <b>{describeHand(me.cards, board)}</b>
            {game.chance !== null && <span>Win chance {percent(game.chance)}</span>}
            {myTurn && myTurn.toCall > 0 && <span>Need {percent(priceToCall(myTurn.toCall, pot))} to call</span>}
            {myTurn && game.chance !== null && <em>{advice(game.chance, myTurn, pot)}</em>}
          </div>
        )}

        {myTurn && me && <BetControls key={`${view.street}-${view.currentBet}-${me.bet}`} view={view} legal={myTurn} onAct={game.act} />}

        {idle && me && (canShow || game.deal) && (
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

        {dock ??
          (live && !myTurn && (
            <p className="dock-wait">{me?.sittingOut ? 'Leaving after this hand' : quiet ? '' : `${nameOf(view.toAct)} to act`}</p>
          ))}
      </aside>

      {game.flights.map((flight) => {
        const chip = <ChipFlight key={flight.id} flight={flight} onLand={() => game.land(flight)} />
        // a bet thrown from a seat stays under the seats, same as the pile it lands on. A flick
        // starts out in the dock, off the felt, so that one has to fly over everything
        const under = flight.to.startsWith('bet') && !flight.start && underSeats
        return under ? createPortal(chip, under, String(flight.id)) : chip
      })}

      <p className="sr-only" aria-live="polite">
        {finished ? resultText(view, game.me, nameOf) : newest}
      </p>

      {sheet && <CheatSheet onClose={() => setSheet(false)} />}
      {children}
    </div>
  )
}

export default function Game({ name }: { name: string }) {
  return <Table game={useSoloTable()} name={name} />
}
