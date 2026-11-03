import { useState, type CSSProperties } from 'react'
import { Dialog } from '../components/Dialog'
import { legalActions, type TableState } from '../engine/engine'
import { useStoredState } from '../hooks/useStoredState'
import { BetControls } from './BetControls'
import { colorOf, potSize } from './betting'
import { advice, describeHand, HAND_RANKS, priceToCall } from './helpers'
import { Avatar, ChipFlight, ChipPile, PlayingCard, SHOWN } from './Pieces'
import { botById } from './roster'
import { BIG_BLIND, BUY_IN, HERO, SMALL_BLIND, winnings } from './solo'
import { total } from './piles'
import { useSoloTable } from './useSoloTable'
import '@fontsource-variable/manrope'
import './game.css'

const percent = (share: number) => `${Math.round(share * 100)}%`
const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ')
const botName = (view: TableState, seat: number) => botById(view.seats[seat]!.id)?.name ?? 'Bot'
const angleOf = (seat: number, seats: number) => Math.PI / 2 + (2 * Math.PI * ((seat - HERO + seats) % seats)) / seats

// Round the oval from the hero at the bottom. reach is how far out from the middle, 1 is the rail.
function around(seat: number, seats: number, reach: number, reachY = reach) {
  const angle = angleOf(seat, seats)
  // the top half of a full ring sits a touch lower, a bot's cards stack above its plate
  const tall = seats > 2 && Math.sin(angle) < 0 ? 37 : 40
  return { '--x': `${50 + 43 * reach * Math.cos(angle)}%`, '--y': `${50 + tall * reachY * Math.sin(angle)}%` } as CSSProperties
}

// Heads-up the bets sit halfway in, and so does yours. Round a full ring the board's in the way:
// the top seat comes straight in, the upper corners bet just under their plate, and the lower ones
// bet sideways with the amount riding on the pile, so no two amounts share a row
function betSpot(seat: number, seats: number) {
  const angle = angleOf(seat, seats)
  if (seats === 2 || seat === HERO) return { className: 'bet', style: around(seat, seats, 0.52) }
  if (Math.abs(Math.cos(angle)) < 0.3) return { className: 'bet', style: around(seat, seats, 0.62, 0.6) }
  if (Math.sin(angle) < 0) return { className: 'bet under', style: around(seat, seats, 1) }
  return { className: 'bet side', style: around(seat, seats, 0.62, 0.95) }
}

// solo tables have every seat filled, so the blinds are just the next seats round
function blindOf(view: TableState, seat: number) {
  if (view.street === 'waiting') return null
  const n = view.seats.length
  // heads-up the button is the small blind
  const small = n === 2 ? view.button : (view.button + 1) % n
  return seat === small ? 'SB' : seat === (small + 1) % n ? 'BB' : null
}

function resultText(view: TableState, heroName: string) {
  const won = view.seats.map((_, i) => winnings(view, i))
  const winners = won.flatMap((amount, i) => (amount ? [i] : []))
  const nameOf = (seat: number) => (seat === HERO ? heroName : botName(view, seat))
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
  const verb = seat === HERO && heroName === 'You' ? 'win' : 'wins'
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

export default function Game({ name }: { name: string }) {
  const game = useSoloTable()
  const { view, board, over, paid, idle } = game
  const [hints, setHints] = useStoredState('ponker-hints', true)
  const [sheet, setSheet] = useState(false)

  const heroName = name || 'You'
  const seats = view.seats.length
  const me = view.seats[HERO]!
  const live = view.street !== 'waiting' && !idle
  const inHand = me.cards.length > 0 && !me.folded
  const legal = game.dealing || game.moving ? null : legalActions(view)
  const myTurn = legal?.seat === HERO && !me.sittingOut ? legal : null
  const pot = potSize(view)
  const shownPot = total(game.pile('pot'))
  const finished = over && paid
  const canShow = finished && inHand && !me.shown
  const newest = Object.values(game.said).at(-1)

  return (
    <div className="poker">
      <header className="poker-bar">
        <a href="#" className="poker-link">
          <span aria-hidden="true">{'‹'}</span> Chips
        </a>
        <span className="poker-stakes">
          {SMALL_BLIND}/{BIG_BLIND}
        </span>
        <span className="poker-spacer" />
        <button className={cx('poker-toggle', hints && 'on')} aria-pressed={hints} onClick={() => setHints(!hints)}>
          Hints
        </button>
        <button className="poker-toggle" aria-label="Hand rankings" onClick={() => setSheet(true)}>
          ?
        </button>
        {me.chips < BUY_IN && (
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
            <output className="pot" style={{ '--of': game.potStacks.length } as CSSProperties}>
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
                {resultText(view, heroName)}
              </p>
            )}
          </div>

          {view.seats.map((seat, i) => {
            const isMe = i === HERO
            const blind = blindOf(view, i)
            const won = finished && winnings(view, i) > 0
            const betChips = game.pile(`bet-${i}`)
            const bet = total(betChips)
            const spot = betSpot(i, seats)
            return (
              <div key={seat!.id}>
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
                  className={cx('seat', isMe && 'me', view.toAct === i && !game.dealing && !game.moving && 'turn', seat!.folded && 'folded', won && 'winner')}
                  style={around(i, seats, 1)}
                  data-spot={`seat-${i}`}
                >
                  <div className="seat-cards">
                    {seat!.cards.map((card, k) => (
                      <PlayingCard key={`${game.hand}-${k}-${card}`} card={card} delay={k * 140 + (isMe ? 0 : 70)} />
                    ))}
                  </div>
                  <div className="seat-plate">
                    <Avatar id={seat!.id} />
                    <div className="seat-info">
                      <span className="seat-name">{isMe ? heroName : botName(view, i)}</span>
                      <span className="seat-stack">{game.stack(i).toLocaleString('en-US')}</span>
                    </div>
                    {view.button === i && view.street !== 'waiting' && (
                      <span className="dealer" title="Dealer button">
                        D
                      </span>
                    )}
                    {hints && blind && <span className="seat-blind">{blind}</span>}
                  </div>
                  {game.said[i] && (
                    <span key={game.said[i]} className="said">
                      {game.said[i]}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
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

        {myTurn && <BetControls key={`${view.street}-${view.currentBet}-${me.bet}`} view={view} legal={myTurn} onAct={game.act} />}

        {idle && (
          <div className="bet-actions">
            {canShow && (
              <button className="button neutral" onClick={() => game.act({ type: 'show', seat: HERO })}>
                Show cards
              </button>
            )}
            <button className="button primary" onClick={game.deal}>
              {over ? 'Next hand' : 'Deal me in'}
            </button>
          </div>
        )}

        {live && !myTurn && <p className="dock-wait">{me.sittingOut ? 'Leaving after this hand' : game.dealing || view.toAct < 0 || view.toAct === HERO ? '' : `${botName(view, view.toAct)} to act`}</p>}
      </aside>

      {game.flights.map((flight) => (
        <ChipFlight key={flight.id} flight={flight} onLand={() => game.land(flight)} />
      ))}

      <p className="sr-only" aria-live="polite">
        {finished ? resultText(view, heroName) : newest}
      </p>

      {sheet && <CheatSheet onClose={() => setSheet(false)} />}
    </div>
  )
}
