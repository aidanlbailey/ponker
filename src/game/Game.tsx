import { useState, type CSSProperties } from 'react'
import { Dialog } from '../components/Dialog'
import { legalActions, type TableState } from '../engine/engine'
import { useStoredState } from '../hooks/useStoredState'
import { BetControls } from './BetControls'
import { colorOf, potSize } from './betting'
import { advice, describeHand, HAND_RANKS, priceToCall } from './helpers'
import { Avatar, ChipFlight, ChipPile, PlayingCard } from './Pieces'
import { BIG_BLIND, BUY_IN, HERO, SMALL_BLIND, winnings } from './solo'
import { total } from './piles'
import { useSoloTable } from './useSoloTable'
import '@fontsource-variable/manrope'
import './game.css'

const BOT_NAME = 'Xi'
const percent = (share: number) => `${Math.round(share * 100)}%`
const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ')

// Round the oval from the hero at the bottom. reach is how far out from the middle, 1 is the rail.
function around(seat: number, seats: number, reach: number) {
  const angle = Math.PI / 2 + (2 * Math.PI * ((seat - HERO + seats) % seats)) / seats
  return { left: `${50 + 43 * reach * Math.cos(angle)}%`, top: `${50 + 40 * reach * Math.sin(angle)}%` } as CSSProperties
}

function blindOf(view: TableState, seat: number) {
  // heads-up the button is the small blind
  return view.street === 'waiting' ? null : view.button === seat ? 'SB' : 'BB'
}

function resultText(view: TableState, name: string) {
  const [mine, theirs] = [winnings(view, HERO), winnings(view, 1 - HERO)]
  if (mine && theirs) return `Split pot, ${mine} each`
  const hand = view.result?.flatMap((pot) => pot.winners).find((winner) => winner.hand)?.hand
  const tail = hand ? ` with ${hand.toLowerCase()}` : ''
  return mine ? `${name} ${name === 'You' ? 'win' : 'wins'} ${mine}${tail}` : `${BOT_NAME} wins ${theirs}${tail}`
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
        Your best five cards from your two and the five on the table. The dealer (D) posts the small blind (SB), the
        other player the big blind (BB), and the dealer acts first before the flop and last after it.
      </p>
      <p>
        Win chance is measured against a random hand, so treat it as a guide. Someone betting big usually holds better
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
        <div className="felt">
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
            return (
              <div key={seat!.id}>
                <div className="bet" style={around(i, seats, 0.52)}>
                  <span className="pile-slot" data-spot={`bet-${i}`}>
                    {bet > 0 && <ChipPile colors={betChips.map(colorOf)} />}
                  </span>
                  {bet > 0 && <span className="pile-label">{bet.toLocaleString('en-US')}</span>}
                </div>
                <div
                  className={cx('seat', isMe && 'me', view.toAct === i && !game.dealing && 'turn', seat!.folded && 'folded', won && 'winner')}
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
                      <span className="seat-name">{isMe ? heroName : BOT_NAME}</span>
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

        {live && !myTurn && <p className="dock-wait">{me.sittingOut ? 'Leaving after this hand' : game.dealing || view.toAct !== 1 - HERO ? '' : `${BOT_NAME} to act`}</p>}
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
