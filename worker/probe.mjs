// Drives a real room from outside and reports what actually happened.
//   node worker/probe.mjs <ws url> [budget <hands>|drop|sleep]
// budget: two guests and two bots play real hands, guests call or check at once. Rows per hand.
// drop: a guest's process gets killed mid-hand, so the socket dies with no close frame.
// sleep: the room is left alone past hibernation, then checked it still has everything.

import { spawn } from 'node:child_process'

const [base = 'ws://127.0.0.1:8787', mode = 'budget', arg] = process.argv.slice(2)
const room = `probe${Date.now().toString(36)}`.slice(0, 16)
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000))
const token = (who) => `probe-${who}-${room}`.padEnd(16, 'x')

// a child that only connects and then waits to be killed, see drop
if (mode === 'child') {
  const ws = new WebSocket(`${base}/room/${arg}?token=${process.argv[5]}&name=Doomed`)
  ws.addEventListener('message', () => {})
  setInterval(() => {}, 1000)
} else {
  run().then(
    (ok) => process.exit(ok ? 0 : 1),
    (e) => {
      console.error(e)
      process.exit(1)
    },
  )
}

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

function connect(who, { autoplay = false } = {}) {
  const ws = new WebSocket(`${base}/room/${room}?token=${token(who)}&name=${who}`)
  const client = { ws, who, state: null, closed: null, stats: null }
  ws.addEventListener('message', ({ data }) => {
    if (data === 'pong') return
    const msg = JSON.parse(data)
    if (msg.t === 'stats') client.stats = msg
    if (msg.t !== 'state') return
    client.state = msg
    const { table, me, turn } = msg
    if (autoplay && me !== null && turn?.seat === me && table.toAct === me) {
      const seat = table.seats[me]
      const type = table.currentBet > seat.bet ? 'call' : 'check'
      ws.send(JSON.stringify({ t: 'act', action: { type } }))
    }
    if (autoplay && me !== null && table.seats[me]?.chips === 0 && !msg.topUp) ws.send(JSON.stringify({ t: 'topUp' }))
  })
  ws.addEventListener('close', (e) => (client.closed = e.code))
  client.send = (cmd) => ws.send(JSON.stringify(cmd))
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(client))
    ws.addEventListener('error', () => reject(new Error(`could not connect to ${base}`)))
  })
}

const until = async (what, seconds, test) => {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    if (test()) return true
    await sleep(0.1)
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function stats(client) {
  client.stats = null
  client.send({ t: 'stats' })
  await until('stats', 5, () => client.stats)
  return client.stats
}

async function budget(hands) {
  const a = await connect('ann', { autoplay: true })
  await until('a seat', 5, () => a.state?.me === 0)
  const b = await connect('bob', { autoplay: true })
  a.send({ t: 'addBot' })
  a.send({ t: 'addBot' })
  const start = await stats(a)
  const t0 = Date.now()
  await until(`${hands} hands`, hands * 40, () => (a.state?.hand ?? 0) > hands)
  const end = await stats(a)
  const played = end.hands - start.hands - 1 // the one just dealt has barely started
  const rows = end.rows - start.rows
  const actions = end.actions - start.actions
  console.log(
    `${played} hands, ${actions} actions, ${rows} rows in ${Math.round((Date.now() - t0) / 1000)}s: ` +
      `${(rows / played).toFixed(1)} rows a hand, ${(rows / actions).toFixed(2)} a action`,
  )
  console.log(`100,000 rows a day is about ${Math.round(100_000 / (rows / played))} hands like these`)
  check('rows stay near 2 an action', rows / actions < 2.6, `${(rows / actions).toFixed(2)}`)
  a.ws.close()
  b.ws.close()
}

async function drop() {
  const a = await connect('ann')
  await until('a seat', 5, () => a.state?.me === 0)
  const doomed = token('doomed')
  const child = spawn(process.execPath, [import.meta.filename, base, 'child', room, doomed], { stdio: 'ignore' })
  await until('the second player', 10, () => a.state?.seats[3])
  await until('a hand', 10, () => a.state?.table.street === 'preflop')
  child.kill('SIGKILL')
  const killed = Date.now()
  await until('the away tag', 15, () => a.state?.seats[3]?.away)
  check('the room sees a socket die with no close frame', true, `${Date.now() - killed}ms`)
  // it's whoever's turn. Ann just folds or checks along so the hand gets to the dead seat
  const started = Date.now()
  while (!a.state.seats[3]?.out) {
    const { table, turn, me } = a.state
    if (turn?.seat === me && table.toAct === me) a.send({ t: 'act', action: { type: table.currentBet > table.seats[me].bet ? 'call' : 'check' } })
    await sleep(0.3)
    if (Date.now() - started > 40_000) break
  }
  const waited = Date.now() - started
  check('the dead seat timed out on the plain clock, no bank', a.state.seats[3]?.out && waited < 26_000, `${waited}ms`)
  check('and it sat out, still in its seat', a.state.table.seats[3]?.sittingOut === true)
  const back = await connect('doomed')
  await until('their state', 5, () => back.state)
  check('the same token gets the same seat back', back.state.me === 3)
  check('with their own cards visible', back.state.table.seats[3].cards.every((c) => c >= -1))
  check('and nobody else’s', back.state.table.seats[0].cards.every((c) => c === -1) || !back.state.table.seats[0].cards.length)
  back.send({ t: 'back' })
  await until('sat back in', 5, () => back.state.table.seats[3].sittingOut === false)
  check('I’m back sits them in', true)
  a.ws.close()
  back.ws.close()
}

async function hibernate() {
  const a = await connect('ann')
  await until('a seat', 5, () => a.state?.me === 0)
  a.send({ t: 'chat', text: 'still here?' })
  await sleep(0.5)
  const before = a.state.seq
  console.log('idle 15s so the room can hibernate')
  await sleep(15)
  a.send({ t: 'addBot' })
  await until('the bot', 5, () => a.state.seats.some((s) => s?.bot))
  check('the room kept its state through the idle gap', a.state.seq === before + 1 && a.state.me === 0)
  a.ws.close()
  const again = await connect('ann')
  await until('state', 5, () => again.state)
  check('a reconnect finds the same seat', again.state.me === 0)
  again.ws.close()
}

async function run() {
  console.log(`room ${room} on ${base}`)
  if (mode === 'budget') await budget(Number(arg ?? 20))
  if (mode === 'drop') await drop()
  if (mode === 'sleep') await hibernate()
  return results.every(Boolean)
}
