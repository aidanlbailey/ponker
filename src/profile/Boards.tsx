import { useEffect, useState, type ReactNode } from 'react'
import { PixelArt } from '../components/PixelArt'
import { RatingBadge } from '../components/RatingBadge'
import { shared } from '../lib/account'
import { load, save } from '../lib/storage'

type RatingRow = { id: string; name: string; avatar: string | null; rating: number; bot: boolean; letter?: string }
type RateRow = { id: string; name: string; avatar: string | null; hands: number; net: number }
type BoardData = { rating: RatingRow[]; bb100: RateRow[] }
type Row = { id: string; name: string; avatar: string | null; letter?: string; sub?: string; value: ReactNode }
export type Tab = 'rating' | 'bb100'

export const BIG_BLIND = 10 // every live table is 5/10
export const perHundred = (net: number, hands: number) => ((net / BIG_BLIND / hands) * 100).toFixed(1)
const SHOW_BOTS = 'ponker-board-bots'

export function useBoards() {
  const [data, setData] = useState<BoardData | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    shared<BoardData>('/boards').then(setData, () => setFailed(true))
  }, [])
  return { data, failed }
}

export function useShowBots() {
  const [bots, setBots] = useState(() => load(SHOW_BOTS, true, (d): d is boolean => typeof d === 'boolean'))
  return [bots, (on: boolean) => (setBots(on), save(SHOW_BOTS, on))] as const
}

export const boardRows = (data: BoardData, tab: Tab, bots: boolean): Row[] =>
  tab === 'rating'
    ? data.rating
        .filter((r) => bots || !r.bot)
        .map((r) => ({ ...r, sub: r.bot ? 'Bot' : undefined, value: <RatingBadge rating={r.rating} size="md" /> }))
    : data.bb100.map((r) => ({
        ...r,
        sub: `${r.hands.toLocaleString('en-US')} hands`,
        value: <span className="board-value">{perHundred(r.net, r.hands)}</span>,
      }))

const Face = ({ avatar, letter, name }: { avatar: string | null; letter?: string; name: string }) =>
  avatar ? (
    <PixelArt art={avatar} className="profile-thumb board-thumb" />
  ) : (
    <span className={`profile-thumb board-thumb ${letter ? 'board-bot' : ''}`} aria-hidden="true">
      {letter ?? name[0]?.toUpperCase()}
    </span>
  )

export function BoardTabs({ tab, onTab, children }: { tab: Tab; onTab: (tab: Tab) => void; children?: ReactNode }) {
  return (
    <div className="board-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'rating'} className={`poker-toggle ${tab === 'rating' ? 'on' : ''}`} onClick={() => onTab('rating')}>
        Rating
      </button>
      <button
        role="tab"
        aria-selected={tab === 'bb100'}
        className={`poker-toggle ${tab === 'bb100' ? 'on' : ''}`}
        title="Big blinds won per 100 hands, only hands with no bots at the table"
        onClick={() => onTab('bb100')}
      >
        bb/100
      </button>
      {children}
    </div>
  )
}

// people's rows open their profile, bots and your own row don't go anywhere
export function BoardList({ rows, start = 0, me, open }: { rows: Row[]; start?: number; me?: string; open: (id: number) => void }) {
  return (
    <ol className="leaderboard">
      {rows.map((r, i) => {
        const inside = (
          <>
            <span className="board-rank">{start + i + 1}</span>
            <Face avatar={r.avatar} letter={r.letter} name={r.name} />
            <span className="board-name">
              <b>{r.name}</b>
              {r.sub && <small>{r.sub}</small>}
            </span>
            {r.value}
          </>
        )
        return (
          <li key={r.id} className={r.id === me ? 'me' : undefined}>
            {r.id.startsWith('u:') && r.id !== me ? (
              <button type="button" className="board-row" onClick={() => open(Number(r.id.slice(2)))}>
                {inside}
              </button>
            ) : (
              <div className="board-row">{inside}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// two either side of i, sliding in at the ends so it's still five when the board has five
export function around(length: number, i: number, span = 2) {
  const start = Math.max(0, Math.min(i - span, length - span * 2 - 1))
  return [start, Math.min(length, start + span * 2 + 1)] as const
}

// the whole thing, on #boards. Top 50 people plus every bot
export function Boards({ me, open }: { me?: number; open: (id: number) => void }) {
  const { data, failed } = useBoards()
  const [tab, setTab] = useState<Tab>('rating')
  const [bots, setBots] = useShowBots()
  const rows = data ? boardRows(data, tab, bots) : []

  return (
    <section className="picker-seats">
      <BoardTabs tab={tab} onTab={setTab}>
        {tab === 'rating' && (
          <label className="board-bots">
            <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} />
            Show bots
          </label>
        )}
      </BoardTabs>
      {failed ? (
        <p className="profile-note">Couldn't load the boards. Try again in a minute.</p>
      ) : !data ? (
        <p className="profile-note" role="status">
          Loading…
        </p>
      ) : !rows.length ? (
        <p className="profile-note">Nobody's played enough hands without bots yet.</p>
      ) : (
        <BoardList rows={tab === 'rating' ? rows.slice(0, 50) : rows} me={me ? `u:${me}` : undefined} open={open} />
      )}
    </section>
  )
}
