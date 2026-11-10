import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { Dialog } from '../components/Dialog'
import { paint, PixelArt } from '../components/PixelArt'
import { RatingBadge } from '../components/RatingBadge'
import { Avatar } from '../game/Pieces'
import type { Bot } from '../game/roster'
import { addFriend, cachedMe, call, dropFriend, friends, shared, deleteAccount, setArtHidden, session, signInUrl, signOut, type Friend, type Friends, type Me } from '../lib/account'
import { blank, decode, encode, PALETTE, quantize, SIZE } from '../lib/avatar'
import { useHiddenArt } from '../hooks/useHiddenArt'
import { haptic } from '../lib/haptics'
import { Screen } from '../hub/Previews'
import { around, BoardList, Face, boardRows, Boards, BoardTabs, perHundred, useBoards, useShowBots, type Tab } from './Boards'
import './profile.css'

// your own on #profile, someone else's on #player/<id>, the full boards on #boards
export type ProfileView = 'me' | 'admin' | 'boards' | number

const toPlayer = (id: number) => {
  location.hash = `#player/${id}`
}

export default function Profile({ name, view }: { name: string; view: ProfileView }) {
  if (view === 'admin') return <Admin />
  if (view === 'boards') {
    return (
      <Screen title="Leaderboards" back={['#profile', 'Profile']}>
        <Boards me={cachedMe()?.id} open={toPlayer} />
      </Screen>
    )
  }
  if (typeof view === 'number') {
    return (
      <Screen title="Profile" back={['#boards', 'Leaderboards']}>
        <PlayerView id={view} open={toPlayer} wholeBoard />
      </Screen>
    )
  }
  return <Account guestName={name} />
}

// someone's profile over the table, so having a look doesn't cost you your seat
export function PlayerSheet({ id, self, onClose, onReported }: { id: number; self?: boolean; onClose: () => void; onReported?: () => void }) {
  const [who, setWho] = useState(id)
  const [me, setMe] = useState<Me | null>(cachedMe)
  useEffect(() => {
    if (session()) call<Me>('/me').then(setMe, () => {})
  }, [])
  return (
    <ProfileSheet onClose={onClose}>
      {(expanded) => <PlayerView key={who} id={who} own={self && who === id} me={me?.id === who ? me : undefined} onSaved={setMe} open={setWho} onReported={onReported} compact={!expanded} />}
    </ProfileSheet>
  )
}

function ProfileSheet({ onClose, children }: { onClose: () => void; children: ReactNode | ((expanded: boolean) => ReactNode) }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useLayoutEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])
  // no animation to wait for with reduced motion, so straight out
  const back = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? onClose() : setLeaving(true))
  return (
    <dialog
      ref={dialog}
      aria-label="Profile"
      className={`profile-sheet ${expanded ? 'expanded' : 'profile-popout'} ${leaving ? 'leaving' : ''}`}
      onCancel={(e) => { e.preventDefault(); back() }}
      onClick={(e) => e.target === dialog.current && back()}
      onAnimationEnd={(e) => e.target === dialog.current && e.animationName === 'sheet-out' && onClose()}
    >
      <div className="poker picker preview">
        <header className="poker-bar">
          <button type="button" className="poker-link" onClick={back}>
            {expanded ? '‹ Table' : 'Close'}
          </button>
          <span className="poker-spacer" />
          <span className="poker-stakes">Profile</span>
        </header>
        <main className="picker-body">
          {typeof children === 'function' ? children(expanded) : children}
          {!expanded && <button type="button" className="button neutral" onClick={() => setExpanded(true)}>View full profile</button>}
        </main>
      </div>
    </dialog>
  )
}

export function BotSheet({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const [rating, setRating] = useState<number | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [info, setInfo] = useState(false)
  useEffect(() => {
    let gone = false
    shared<Record<string, number | null>>(`/ratings?ids=${encodeURIComponent(bot.id)}`).then(
      (ratings) => { if (!gone) setRating(ratings[bot.id] ?? null) },
      () => { if (!gone) setFailed(true) },
    )
    return () => { gone = true }
  }, [bot.id])
  return (
    <ProfileSheet onClose={onClose}>
      <div className="player-view">
        <header className="player-head">
          <span className="player-pic bot-pic"><Avatar id={bot.id} /></span>
          <h2 className="player-name">{bot.name}</h2>
          {rating !== undefined ? (
            <button
              type="button"
              className="player-rating"
              aria-expanded={info}
              aria-label={`Rating ${rating ?? 'still placing'}, how rating works`}
              onClick={() => setInfo(!info)}
            >
              <RatingBadge rating={rating} size="lg" />
            </button>
          ) : (
            <p className="profile-note" role="status">{failed ? 'Rating unavailable' : 'Loading rating...'}</p>
          )}
          <p className="player-hands">{bot.skill} {bot.style}</p>
          <div className={`rating-fold ${info ? 'open' : ''}`} inert={!info}>
            <div><RatingInfo /></div>
          </div>
        </header>
        <section className="picker-seats">
          <h2>Personality</h2>
          <p>{bot.bio}</p>
        </section>
      </div>
    </ProfileSheet>
  )
}

function Account({ guestName }: { guestName: string }) {
  const [me, setMe] = useState<Me | null>(null)
  const [state, setState] = useState<'loading' | 'out' | 'in' | 'down'>(() => (session() ? 'loading' : 'out'))

  useEffect(() => {
    if (!session()) return
    call<Me>('/me')
      .then((user) => (setMe(user), setState('in')))
      .catch(() => setState(session() ? 'down' : 'out'))
  }, [])

  if (state === 'loading' || state === 'down') {
    return (
      <Screen title="Profile">
        <p className="preview-loading" role="status">
          {state === 'loading' ? 'Loading…' : "Couldn't load your profile. Try again in a minute."}
        </p>
      </Screen>
    )
  }

  if (state === 'out' || !me) {
    return (
      <Screen title="Profile">
        <section className="picker-seats">
          <h2>Sign in</h2>
          <p>A name nobody else can take, and a picture of your own at the table. Guests can still play everything.</p>
          <div className="profile-providers">
            <a className="button primary" href={signInUrl('google', guestName)}>
              Sign in with Google
            </a>
            <a className="button primary" href={signInUrl('discord', guestName)}>
              Sign in with Discord
            </a>
          </div>
          <p className="profile-note">
            No email, nothing else from your account. <a href="privacy.html">What's kept</a>
          </p>
        </section>
        <div className="button-row">
          <a className="button neutral" href="#boards">
            Leaderboards
          </a>
          <HistoryLink />
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Profile">
      <PlayerView id={me.id} me={me} onSaved={setMe} open={toPlayer} wholeBoard>
        <AccountActions me={me} onGone={() => (setMe(null), setState('out'))} />
      </PlayerView>
    </Screen>
  )
}

// kept in this browser, so guests get it too
const HistoryLink = () => (
  <a className="button neutral" href="#history">
    Hand history
  </a>
)

type Stats = {
  bots: number
  hands: number
  net: number
  vpip: number
  pfr: number
  showdowns: number
  showdown_wins: number
  biggest: number
}
type Player = { id: number; name: string; avatar: string | null; rating: number | null; stats: Stats[] }

type ViewProps = {
  id: number
  me?: Me // only when it's yours, that's what gives it the edit pencil
  onSaved?: (me: Me) => void
  open: (id: number) => void
  wholeBoard?: boolean
  compact?: boolean
  own?: boolean
  onReported?: () => void
  children?: ReactNode // your account buttons, at the bottom
}

const Pencil = ({ className }: { className?: string }) => (
  <span className={className} aria-hidden="true">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  </span>
)

// one page for everyone. Yours has a pencil up top that opens the name and the picture for editing
export function PlayerView({ id, me, onSaved, open, wholeBoard, compact, own, onReported, children }: ViewProps) {
  const [player, setPlayer] = useState<Player | null>(null)
  const [failed, setFailed] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [naming, setNaming] = useState(false)
  const [painting, setPainting] = useState(false)
  const [info, setInfo] = useState(false)
  const [reporting, setReporting] = useState(false)
  const hidden = useHiddenArt().includes(id)
  const [note, setNote] = useState('')

  useEffect(() => {
    shared<Player>(`/players/${id}`).then(setPlayer, () => setFailed(true))
  }, [id])

  if (failed) return <p className="preview-loading">Couldn't load this profile. Try again in a minute.</p>
  if (!player) {
    return (
      <p className="preview-loading" role="status">
        Loading…
      </p>
    )
  }

  const mine = own || me?.id === id
  const editing = mine && editMode
  const art = hidden && !mine ? null : player.avatar
  const hands = player.stats.reduce((n, s) => n + s.hands, 0)
  const saved = (next: Me, message: string) => {
    setPlayer({ ...player, name: next.name, avatar: next.avatar })
    onSaved?.(next)
    setNote(message)
  }
  const picture = art ? <PixelArt art={art} className="player-art" /> : <span aria-hidden="true">{player.name[0]?.toUpperCase()}</span>

  return (
    <div className={`player-view ${editing ? 'editing' : ''}`}>
      {mine && !compact && (
        <div className="player-top">
          <button
            type="button"
            className={`player-edit ${editMode ? 'on' : ''}`}
            aria-pressed={editMode}
            aria-label={editMode ? 'Done editing' : 'Edit your profile'}
            onClick={() => (setEditMode(!editMode), setNaming(false))}
          >
            <Pencil />
          </button>
        </div>
      )}
      <header className="player-head">
        {/* yours stays a button either way, just disabled out of edit mode, so the pencils ease in and out
            instead of the whole thing being swapped */}
        {mine ? (
          <button
            type="button"
            className="player-pic"
            disabled={!editing}
            aria-label={editing ? 'Edit your picture' : 'Your picture'}
            onClick={() => (setPainting(true), setNote(''))}
          >
            {picture}
            <Pencil className="player-pencil" />
          </button>
        ) : (
          <span className="player-pic">{picture}</span>
        )}
        {editing && naming ? (
          <NameForm name={player.name} onSaved={(next) => (saved(next, 'Saved'), setNaming(false))} onCancel={() => setNaming(false)} />
        ) : mine ? (
          <h2 className="player-name">
            <button
              type="button"
              disabled={!editing}
              aria-label={editing ? `${player.name}, change your name` : undefined}
              onClick={() => (setNaming(true), setNote(''))}
            >
              {player.name}
              <Pencil className="name-pencil" />
            </button>
          </h2>
        ) : (
          <h2 className="player-name">{player.name}</h2>
        )}
        <button
          type="button"
          className="player-rating"
          aria-expanded={info}
          aria-label={`Rating ${player.rating ?? 'still placing'}, how rating works`}
          onClick={() => setInfo(!info)}
        >
          <RatingBadge rating={player.rating} size="lg" />
        </button>
        <p className="player-hands">
          {hands.toLocaleString('en-US')} {hands === 1 ? 'hand' : 'hands'} played
        </p>
        {!mine && <FriendButton id={id} />}
        {note && (
          <p className="profile-note" role="status">
            {note}
          </p>
        )}
        {/* always there so it can fold shut as smoothly as it opens */}
        <div className={`rating-fold ${info ? 'open' : ''}`} inert={!info}>
          <div>
            <RatingInfo />
          </div>
        </div>
      </header>
      {!compact && <StatsCard rows={player.stats} you={mine} />}
      {!compact && <BoardSlice id={id} placing={player.rating === null} open={open} wholeBoard={wholeBoard} />}
      {mine && !compact && <FriendsCard open={open} />}
      {mine && children}
      {!mine && art && (
        <button type="button" className="player-report" onClick={() => setReporting(true)}>
          Report picture
        </button>
      )}
      {!mine && hidden && (
        <button type="button" className="player-report" onClick={() => setArtHidden(id, false)}>
          Show picture
        </button>
      )}
      {reporting && (
        <ReportArt
          user={id}
          name={player.name}
          onClose={() => setReporting(false)}
          onReported={(hide) => (setArtHidden(id, hide), onReported?.())}
        />
      )}
      {painting && me && (
        <Dialog title="Your picture" className="profile-paint" onClose={() => setPainting(false)}>
          {(close) => (
            <Editor
              me={{ ...me, name: player.name, avatar: player.avatar }}
              onSaved={(next) => close(() => saved(next, 'Saved. It shows from the next table you sit at'))}
            />
          )}
        </Dialog>
      )}
    </div>
  )
}

// signed in and not yourself. Friends are who reads your chat at public tables
function FriendButton({ id }: { id: number }) {
  // a tab that's never been to the hub hasn't cached you yet
  const [viewer, setViewer] = useState(cachedMe)
  const [lists, setLists] = useState<Friends | null>(null)
  useEffect(() => {
    if (session() && !viewer) call<Me>('/me').then(setViewer, () => {})
  }, [viewer])
  const [sure, setSure] = useState(false)
  const [why, setWhy] = useState('')
  const other = !!viewer && viewer.id !== id
  useEffect(() => {
    if (other) friends().then(setLists, () => {})
  }, [id, other])
  if (!other || !lists) return null
  const has = (l: Friend[]) => l.some((u) => u.id === id)
  const act = (f: (id: number) => Promise<Friends>) => {
    setWhy('')
    f(id).then(
      (l) => (setLists(l), setSure(false)),
      (e: Error) => setWhy(e.message),
    )
  }
  const button = (label: string, f: typeof addFriend, primary = false) => (
    <button type="button" className={`button ${primary ? 'primary' : 'neutral'}`} onClick={() => act(f)}>
      {label}
    </button>
  )
  return (
    <div className="player-friend">
      {has(lists.friends) ? (
        sure ? (
          <>
            {button('Unfriend', dropFriend)}
            <button type="button" className="button neutral" onClick={() => setSure(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="button neutral" aria-label="Friends, tap to unfriend" onClick={() => setSure(true)}>
            Friends
          </button>
        )
      ) : has(lists.incoming) ? (
        <>
          {button('Accept friend request', addFriend, true)}
          {button('Decline', dropFriend)}
        </>
      ) : has(lists.outgoing) ? (
        <button type="button" className="button neutral" aria-label="Request sent, tap to take it back" onClick={() => act(dropFriend)}>
          Requested
        </button>
      ) : (
        button('Add friend', addFriend, true)
      )}
      {why && (
        <p className="profile-note" role="status">
          {why}
        </p>
      )}
    </div>
  )
}

function FriendsCard({ open }: { open: (id: number) => void }) {
  const [lists, setLists] = useState<Friends | null>(null)
  const hidden = useHiddenArt()
  useEffect(() => {
    friends().then(setLists, () => {})
  }, [])
  if (!lists) return null
  const answer = (f: typeof addFriend, id: number) => f(id).then(setLists, () => {})
  const face = (u: Friend) => <Face avatar={hidden.includes(u.id) ? null : u.avatar} name={u.name} />
  const known = [...lists.friends.map((u) => ({ ...u, sub: '' })), ...lists.outgoing.map((u) => ({ ...u, sub: 'Request sent' }))]
  return (
    <section className="picker-seats">
      <div className="player-section-head">
        <h2>Friends</h2>
        <small>only they read your chat at public tables</small>
      </div>
      {lists.incoming.length > 0 && (
        <ol className="leaderboard">
          {lists.incoming.map((u) => (
            <li key={u.id}>
              <div className="board-row friend-row">
                {face(u)}
                <span className="board-name">
                  <b>{u.name}</b>
                  <small>wants to be friends</small>
                </span>
                <span className="friend-answer">
                  <button type="button" className="poker-toggle" onClick={() => answer(addFriend, u.id)}>
                    Accept
                  </button>
                  <button type="button" className="poker-toggle" onClick={() => answer(dropFriend, u.id)}>
                    Decline
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {known.length ? (
        <ol className="leaderboard">
          {known.map((u) => (
            <li key={u.id}>
              <button type="button" className="board-row friend-row" onClick={() => open(u.id)}>
                {face(u)}
                <span className="board-name">
                  <b>{u.name}</b>
                  {u.sub && <small>{u.sub}</small>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        !lists.incoming.length && <p className="profile-note">No friends yet. Tap someone's name at a table to add them.</p>
      )}
    </section>
  )
}

const TIERS = [
  [850, 'under 900'],
  [900, '900+'],
  [950, '950+'],
  [1000, '1,000+'],
  [1050, '1,050+'],
  [1100, '1,100+'],
  [1150, '1,150+'],
] as const

// the plain words version of worker/src/rating.ts. Change one, change the other
function RatingInfo() {
  return (
    <div className="rating-info">
      <h3>How rating works</h3>
      <p>
        Everyone starts at 1,000. Yours shows once you've played 30 hands at a public table or in a room. Solo games against bots
        never count.
      </p>
      <p>
        Whenever you share a table with someone, you trade rating based on how many chips you won off each other. Beating someone
        rated higher earns more, and losing to them costs less.
      </p>
      <p>It's zero-sum: whatever you gain, they lose. The only way up is outplaying people.</p>
      <p>
        Luck is kept in check. No single hand counts for more than 100 big blinds, and you can only trade so much with one player in a
        day.
      </p>
      <p>
        Your first few results move faster, so a new rating settles quickly. Bots are rated the same way as people.
      </p>
      <div className="rating-tiers">
        {TIERS.map(([n, label]) => (
          <div key={n}>
            <RatingBadge rating={n} size="md" />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '-')
const chips = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('en-US')}`

// live tables only, solo can't be trusted. With bots first, it's where most hands are
function StatsCard({ rows, you }: { rows: Stats[]; you: boolean }) {
  const [bots, setBots] = useState(1)
  const s = rows.find((r) => r.bots === bots)
  const they = you ? 'you' : 'they'
  const tab = (n: number, label: string, tip: string) => (
    <button role="tab" aria-selected={bots === n} className={`poker-toggle ${bots === n ? 'on' : ''}`} title={tip} onClick={() => setBots(n)}>
      {label}
    </button>
  )
  const line = (label: string, tip: string, value: string) => (
    <tr>
      <th scope="row" title={tip}>
        {label}
      </th>
      <td>{value}</td>
    </tr>
  )
  return (
    <section className="picker-seats">
      <div className="player-section-head">
        <h2>Stats</h2>
        <small>public tables and rooms</small>
      </div>
      <div className="board-tabs" role="tablist">
        {tab(1, 'With bots', 'Hands with at least one bot at the table')}
        {tab(0, 'No bots', 'Hands where everyone else at the table was a person')}
      </div>
      {!s ? (
        <p key={bots} className="profile-note player-swap">
          No hands {bots ? 'with' : 'without'} bots yet.
        </p>
      ) : (
        <div key={bots} className="player-swap">
          <div className="player-tiles">
            <div title="Hands dealt in at public tables and rooms. Solo games don't count">
              <b>{s.hands.toLocaleString('en-US')}</b>
              <span>Hands</span>
            </div>
            <div title="Big blinds won per 100 hands. Above 0 is winning, but it takes a few thousand hands to mean much">
              <b>{perHundred(s.net, s.hands)}</b>
              <span>bb/100</span>
            </div>
            <div title={`Everything ${they} won minus everything ${they} put in`}>
              <b>{chips(s.net)}</b>
              <span>Net chips</span>
            </div>
          </div>
          <table className="profile-stats">
            <tbody>
              {line('Played (VPIP)', `How often ${they} chose to put money in before the flop. Forced blinds don't count`, pct(s.vpip, s.hands))}
              {line('Raised preflop (PFR)', `How often ${they} raised before the flop`, pct(s.pfr, s.hands))}
              {line('Went to showdown', `How often ${they} made it to the end and cards were turned over`, pct(s.showdowns, s.hands))}
              {line('Won at showdown', 'Of the hands that went to showdown, how often some of the pot was won', pct(s.showdown_wins, s.showdowns))}
              {line('Biggest pot', 'The most won in one hand', s.biggest.toLocaleString('en-US'))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// where they sit on the boards, two either side
function BoardSlice({ id, placing, open, wholeBoard }: { id: number; placing: boolean; open: (id: number) => void; wholeBoard?: boolean }) {
  const { data, failed } = useBoards()
  const [tab, setTab] = useState<Tab>('rating')
  const [bots] = useShowBots()
  const who = `u:${id}`
  const rows = data ? boardRows(data, tab, bots) : []
  const i = rows.findIndex((r) => r.id === who)
  const [from, to] = around(rows.length, i)
  const missing =
    tab === 'bb100'
      ? 'Not on this board yet. It takes 200 hands with no bots at the table.'
      : placing
        ? 'Shows after 30 hands at public tables or rooms.'
        : 'Not in the top 50 yet.'
  return (
    <section className="picker-seats">
      <h2>Leaderboards</h2>
      <BoardTabs tab={tab} onTab={setTab} />
      {failed ? (
        <p className="profile-note">Couldn't load the boards. Try again in a minute.</p>
      ) : !data ? (
        <p className="profile-note" role="status">
          Loading…
        </p>
      ) : (
        <div key={tab} className="player-swap">
          {i < 0 ? <p className="profile-note">{missing}</p> : <BoardList rows={rows.slice(from, to)} start={from} me={who} open={open} />}
        </div>
      )}
      {wholeBoard && (
        <a className="profile-more" href="#boards">
          See the whole board
        </a>
      )}
    </section>
  )
}

function NameForm({ name, onSaved, onCancel }: { name: string; onSaved: (me: Me) => void; onCancel: () => void }) {
  const [text, setText] = useState(name)
  const [why, setWhy] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      onSaved(await call<Me>('/me', { method: 'PUT', body: { name: text } }))
      haptic('success')
    } catch (err) {
      setWhy((err as Error).message)
      haptic('error')
    }
  }
  return (
    <div className="player-rename">
      <form className="preview-join" onSubmit={submit}>
        <input aria-label="Your name" maxLength={16} value={text} autoFocus onChange={(e) => (setText(e.target.value), setWhy(''))} />
        <button className="poker-toggle" disabled={!text.trim() || text.trim() === name}>
          Save
        </button>
        <button type="button" className="poker-toggle" onClick={onCancel}>
          Cancel
        </button>
      </form>
      {why && (
        <p className="profile-note" role="status">
          {why}
        </p>
      )}
    </div>
  )
}

// Tap or drag to paint, with a finger or a mouse. Index 0 is the eraser
function Editor({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const [pixels, setPixels] = useState(() => (me.avatar ? decode(me.avatar) : blank()))
  const [color, setColor] = useState(1)
  const [note, setNote] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  // the last cell painted this stroke. Pointer moves skip cells when the hand's quick, so each move fills the line from here
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => paint(canvas.current!, pixels), [pixels])

  const dab = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = Math.floor(((e.clientX - box.left) / box.width) * SIZE)
    const y = Math.floor(((e.clientY - box.top) / box.height) * SIZE)
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
    const from = last.current ?? { x, y }
    last.current = { x, y }
    const steps = Math.max(Math.abs(x - from.x), Math.abs(y - from.y), 1)
    setPixels((prev) => {
      const next = [...prev]
      for (let i = 0; i <= steps; i++) {
        next[Math.round(from.y + ((y - from.y) * i) / steps) * SIZE + Math.round(from.x + ((x - from.x) * i) / steps)] = color
      }
      return next.every((p, i) => p === prev[i]) ? prev : next
    })
    setNote('')
  }

  // the photo never leaves the browser. Centre crop to a square, let the browser average it down, then snap to the palette
  const upload = async (file: File | undefined) => {
    if (!file) return
    try {
      const img = await createImageBitmap(file)
      const side = Math.min(img.width, img.height)
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
      ctx.canvas.width = ctx.canvas.height = SIZE
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
      img.close()
      setPixels(quantize(ctx.getImageData(0, 0, SIZE, SIZE).data))
      setNote('Touch it up if you like, then Save')
    } catch {
      setNote("Couldn't read that image")
      haptic('error')
    }
  }

  const saved = me.avatar ?? null
  const current = encode(pixels)
  const save = async () => {
    try {
      onSaved(await call<Me>('/me', { method: 'PUT', body: { avatar: current } }))
      setNote('Saved. It shows from the next table you sit at')
      haptic('success')
    } catch (err) {
      setNote((err as Error).message)
      haptic('error')
    }
  }

  return (
    <div className="profile-editor">
      <canvas
        ref={canvas}
        className="profile-canvas"
        width={SIZE}
        height={SIZE}
        aria-label="Your picture, tap or drag to paint"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          last.current = null
          dab(e)
        }}
        onPointerMove={(e) => e.buttons && dab(e)}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <div className="profile-palette" role="radiogroup" aria-label="Colour">
        {PALETTE.map((hex, i) => (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={color === i}
            aria-label={i ? `Colour ${i}` : 'Eraser'}
            className={i ? undefined : 'eraser'}
            style={i ? { background: hex } : undefined}
            onClick={() => setColor(i)}
          />
        ))}
      </div>
      <div className="button-row">
        <label className="button neutral">
          Upload
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <button type="button" className="button neutral" onClick={() => setPixels(blank())} disabled={!current}>
          Clear
        </button>
        <button type="button" className="button neutral" onClick={() => setPixels(saved ? decode(saved) : blank())} disabled={current === saved}>
          Undo changes
        </button>
        <button type="button" className="button primary" onClick={save} disabled={current === saved}>
          Save
        </button>
      </div>
      {note && <p className="profile-note" role="status">{note}</p>}
    </div>
  )
}

function AccountActions({ me, onGone }: { me: Me; onGone: () => void }) {
  const [sure, setSure] = useState(false)
  const [why, setWhy] = useState('')
  return (
    <section className="picker-seats">
      <HistoryLink />
      <div className="button-row">
        {me.admin && (
          <a className="button neutral" href="#admin">
            Admin
          </a>
        )}
        <button type="button" className="button neutral" onClick={() => signOut().then(onGone)}>
          Sign out
        </button>
      </div>
      <button
        type="button"
        className="button danger"
        onClick={() => {
          if (!sure) return setSure(true)
          deleteAccount().then(onGone, (err: Error) => setWhy(err.message))
        }}
      >
        {sure ? 'Tap again to delete' : 'Delete account'}
      </button>
      {why && <p className="profile-note" role="status">{why}</p>}
    </section>
  )
}

// Hides the picture for you straight away. Signed in, it also goes to Aidan to look at. A guest's report would be
// one anyone could send by the thousand, so theirs only hides it
function ReportArt({ user, name, onClose, onReported }: { user: number; name: string; onClose: () => void; onReported: (hidden: boolean) => void }) {
  const signedIn = !!session()
  const [hide, setHide] = useState(true)
  return (
    <Dialog title="Report picture" onClose={onClose}>
      {(close) => (
        <>
          <p>
            Report {name}'s picture{signedIn ? ' and send it to be looked at' : ''}?
          </p>
          <label className="picture-hide-choice">
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
            Hide their picture for me
          </label>
          <p className="profile-note">{hide ? "You'll see the default until you choose Show picture on their profile." : "You'll keep seeing their picture."}</p>
          <div className="button-row">
            <button type="button" className="button neutral" onClick={() => close()}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                if (signedIn) call('/report', { method: 'POST', body: { user, hidden: hide } }).catch(() => {})
                close(() => onReported(hide))
                haptic('success')
              }}
            >
              Report
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}

type Reported = { id: number; name: string; avatar: string | null; reports: number; last: number }

// Aidan's queue. Anyone else gets a 404 from the worker and sees nothing here
function Admin() {
  const [list, setList] = useState<Reported[] | null>(null)
  const [why, setWhy] = useState('')

  useEffect(() => {
    call<Reported[]>('/admin/reports').then(setList, (err: Error) => setWhy(err.message))
  }, [])

  const decide = async (id: number, reset: boolean) => {
    try {
      await call(`/admin/reports/${id}`, { method: 'POST', body: { reset } })
      setList((prev) => prev!.filter((r) => r.id !== id))
    } catch (err) {
      setWhy((err as Error).message)
    }
  }

  return (
    <Screen title="Admin">
      <h2>Reports</h2>
      {why ? (
        <p className="preview-loading">Nothing here.</p>
      ) : !list ? (
        <p className="preview-loading" role="status">
          Loading…
        </p>
      ) : !list.length ? (
        <p className="preview-loading">No reports waiting.</p>
      ) : (
        <ul className="preview-list profile-reports">
          {list.map((r) => (
            <li key={r.id}>
              {r.avatar ? <PixelArt art={r.avatar} className="profile-thumb" /> : <span className="profile-thumb" />}
              <b>{r.name}</b>
              <span>
                {r.reports} {r.reports === 1 ? 'report' : 'reports'}
              </span>
              <button className="poker-toggle" onClick={() => decide(r.id, false)}>
                Dismiss
              </button>
              <button className="poker-toggle" onClick={() => decide(r.id, true)}>
                Reset
              </button>
            </li>
          ))}
        </ul>
      )}
      {!why && <Pairs />}
    </Screen>
  )
}

type PairDay = { a: string; b: string; a_name: string; b_name: string; moved: number }

// who swapped the most rating today, New York time. A pair near 32 hit the cap, which is where feeding shows up
function Pairs() {
  const [list, setList] = useState<PairDay[] | null>(null)
  const [done, setDone] = useState<string[]>([])
  useEffect(() => {
    call<PairDay[]>('/admin/pairs').then(setList, () => setList([]))
  }, [])
  const reset = (who: string) =>
    call(`/admin/rating/${who.slice(2)}`, { method: 'POST' }).then(() => setDone((d) => [...d, who]), () => {})
  // bots can't be reset, only people
  const resetButton = (who: string, name: string) =>
    who.startsWith('u:') && (
      <button key={who} type="button" className="profile-mini" disabled={done.includes(who)} onClick={() => reset(who)}>
        {done.includes(who) ? `${name} reset` : `Reset ${name}`}
      </button>
    )
  return (
    <>
      <h2>Rating swapped today</h2>
      {!list ? null : !list.length ? (
        <p className="preview-loading">Nothing yet today.</p>
      ) : (
        <ul className="preview-list profile-pairs">
          {list.map((p) => (
            <li key={`${p.a}|${p.b}`}>
              <span className="profile-pair-names">
                {p.a_name} and {p.b_name}
              </span>
              <b>{p.moved.toFixed(1)}</b>
              <span className="profile-pair-resets">
                {resetButton(p.a, p.a_name)}
                {resetButton(p.b, p.b_name)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
