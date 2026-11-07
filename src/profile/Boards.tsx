import { useEffect, useState } from 'react'
import { PixelArt } from '../components/PixelArt'
import { RatingBadge } from '../components/RatingBadge'
import { call } from '../lib/account'
import { load, save } from '../lib/storage'

type RatingRow = { id: string; name: string; avatar: string | null; rating: number; bot: boolean; letter?: string }
type RateRow = { id: string; name: string; avatar: string | null; hands: number; net: number }

const BIG_BLIND = 10
const SHOW_BOTS = 'ponker-board-bots'

const Face = ({ avatar, letter, name }: { avatar: string | null; letter?: string; name: string }) =>
  avatar ? (
    <PixelArt art={avatar} className="profile-thumb board-thumb" />
  ) : (
    <span className={`profile-thumb board-thumb ${letter ? 'board-bot' : ''}`} aria-hidden="true">
      {letter ?? name[0]?.toUpperCase()}
    </span>
  )

// the boards anyone can see. me lights your own row
export function Boards({ me }: { me?: number }) {
  const [data, setData] = useState<{ rating: RatingRow[]; bb100: RateRow[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<'rating' | 'bb100'>('rating')
  const [bots, setBots] = useState(() => load(SHOW_BOTS, true, (d): d is boolean => typeof d === 'boolean'))

  useEffect(() => {
    call<typeof data>('/boards').then(setData, () => setFailed(true))
  }, [])

  const mine = (id: string) => id === `u:${me}`
  const rating = (data?.rating ?? []).filter((r) => bots || !r.bot).slice(0, 50)

  return (
    <section className="picker-seats">
      <h2>Leaderboards</h2>
      <div className="board-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'rating'} className={`poker-toggle ${tab === 'rating' ? 'on' : ''}`} onClick={() => setTab('rating')}>
          Rating
        </button>
        <button
          role="tab"
          aria-selected={tab === 'bb100'}
          className={`poker-toggle ${tab === 'bb100' ? 'on' : ''}`}
          title="Big blinds won per 100 hands, only hands with no bots at the table"
          onClick={() => setTab('bb100')}
        >
          bb/100
        </button>
        {tab === 'rating' && (
          <label className="board-bots">
            <input
              type="checkbox"
              checked={bots}
              onChange={(e) => {
                setBots(e.target.checked)
                save(SHOW_BOTS, e.target.checked)
              }}
            />
            Show bots
          </label>
        )}
      </div>
      {failed ? (
        <p className="profile-note">Couldn't load the boards. Try again in a minute.</p>
      ) : !data ? (
        <p className="profile-note" role="status">
          Loading…
        </p>
      ) : tab === 'rating' ? (
        <ol className="board">
          {rating.map((r, i) => (
            <li key={r.id} className={mine(r.id) ? 'me' : undefined}>
              <span className="board-rank">{i + 1}</span>
              <Face avatar={r.avatar} letter={r.letter} name={r.name} />
              <span className="board-name">
                <b>{r.name}</b>
                {r.bot && <small>Bot</small>}
              </span>
              <RatingBadge rating={r.rating} size="md" />
            </li>
          ))}
        </ol>
      ) : !data.bb100.length ? (
        <p className="profile-note">Nobody's played enough hands without bots yet.</p>
      ) : (
        <ol className="board">
          {data.bb100.map((r, i) => (
            <li key={r.id} className={mine(r.id) ? 'me' : undefined}>
              <span className="board-rank">{i + 1}</span>
              <Face avatar={r.avatar} name={r.name} />
              <span className="board-name">
                <b>{r.name}</b>
                <small>{r.hands.toLocaleString('en-US')} hands</small>
              </span>
              <span className="board-value">{((r.net / BIG_BLIND / r.hands) * 100).toFixed(1)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
