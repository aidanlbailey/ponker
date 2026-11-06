import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { paint, PixelArt } from '../components/PixelArt'
import { call, deleteAccount, session, signInUrl, signOut, type Me } from '../lib/account'
import { blank, decode, encode, PALETTE, SIZE } from '../lib/avatar'
import { haptic } from '../lib/haptics'
import { Screen } from '../hub/Previews'
import './profile.css'

export default function Profile({ name, admin }: { name: string; admin?: boolean }) {
  return admin ? <Admin /> : <Account guestName={name} />
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
      </Screen>
    )
  }

  return (
    <Screen title="Profile">
      <NameForm me={me} onSaved={setMe} />
      <section className="picker-seats">
        <h2>Picture</h2>
        <Editor me={me} onSaved={setMe} />
      </section>
      <AccountActions me={me} onGone={() => (setMe(null), setState('out'))} />
    </Screen>
  )
}

function NameForm({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const [text, setText] = useState(me.name)
  const [why, setWhy] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      onSaved(await call<Me>('/me', { method: 'PUT', body: { name: text } }))
      setWhy('Saved')
      haptic('success')
    } catch (err) {
      setWhy((err as Error).message)
      haptic('error')
    }
  }
  return (
    <section className="picker-seats">
      <h2>Name</h2>
      <form className="preview-join" onSubmit={submit}>
        <input aria-label="Your name" maxLength={16} value={text} onChange={(e) => (setText(e.target.value), setWhy(''))} />
        <button className="poker-toggle" disabled={!text.trim() || text.trim() === me.name}>
          Save
        </button>
      </form>
      {why && <p className="profile-note" role="status">{why}</p>}
    </section>
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
      <h2>Account</h2>
      <div className="button-row">
        {me.admin && (
          <a className="button neutral" href="#admin">
            Reports
          </a>
        )}
        <button type="button" className="button neutral" onClick={() => signOut().then(onGone)}>
          Sign out
        </button>
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
      </div>
      {why && <p className="profile-note" role="status">{why}</p>}
    </section>
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
    <Screen title="Reports">
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
    </Screen>
  )
}
