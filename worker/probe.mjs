// Drives a test table from outside and reports what actually happened.
//   node worker/probe.mjs <ws url> [hibernation|bench <reps>|idle <minutes>]
// PROBE_KEY comes from the environment.

const [base = 'ws://localhost:8787', mode = 'all', arg] = process.argv.slice(2)
const key = process.env.PROBE_KEY ?? 'local'
const table = `probe-${Date.now()}`
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000))
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

function connect(seat, name = table) {
  const ws = new WebSocket(`${base}?key=${key}&table=${name}&seat=${seat}`)
  const client = { ws, seat, events: [], closed: null, closedAt: null, pongs: 0, nextId: 0, pending: new Map() }
  ws.addEventListener('message', ({ data }) => {
    if (data === 'pong') {
      client.pongs++
      return client.pending.get('pong')?.(data)
    }
    const msg = JSON.parse(data)
    if (msg.event) client.events.push(msg)
    else client.pending.get(msg.id)?.(msg)
  })
  const died = (e) => {
    client.closed = { code: e.code, reason: e.reason, message: e.message }
    client.closedAt ??= Date.now()
    for (const fail of client.pending.values()) fail(null)
  }
  ws.addEventListener('close', died)
  ws.addEventListener('error', died)
  client.send = (t, extra = {}) =>
    new Promise((resolve) => {
      if (client.closed) return resolve(null)
      const id = ++client.nextId
      client.pending.set(id, (m) => (client.pending.delete(id), resolve(m)))
      ws.send(JSON.stringify({ t, id, ...extra }))
    })
  client.ping = () =>
    new Promise((resolve) => {
      client.pending.set('pong', () => (client.pending.delete('pong'), resolve(true)))
      ws.send('ping')
    })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(client))
    ws.addEventListener('error', () => reject(new Error(`could not connect to ${base}`)))
  })
}

const waitForEvent = async (client, name, seconds) => {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    const found = client.events.find((e) => e.event === name)
    if (found) return found
    await sleep(0.1)
  }
  return null
}

async function hibernation() {
  console.log(`\n== hibernation, table ${table}`)
  const a = await connect(1)
  const b = await connect(2)
  const first = await a.send('act')
  check('two sockets on one table', first.sockets === 2, `instance ${first.instance}`)
  check('seat kept in the socket attachment', first.seat === 1)
  console.log(`      state is ${first.stateBytes} bytes, one save wrote ${first.rows.written} row(s)`)

  // shortest idle gap that wipes the object
  let before = first
  let wipedAt = null
  for (const gap of [5, 10, 15, 30, 60, 120]) {
    await sleep(gap)
    const after = await a.send('act')
    const wiped = after.instance !== before.instance
    console.log(`      idle ${gap}s: ${wiped ? 'memory wiped' : 'still awake'}  instance ${after.instance}`)
    check(`state survived ${gap}s idle`, after.actions === before.actions + 1, `actions ${after.actions}`)
    check(`socket survived ${gap}s idle`, a.ws.readyState === WebSocket.OPEN && b.ws.readyState === WebSocket.OPEN)
    if (wiped) {
      wipedAt ??= gap
      check('attachment survived the wipe', after.seat === 1)
      check('in-memory counter really reset', after.handled === 1, `handled ${after.handled}`)
    }
    before = after
  }
  check('object hibernated at some gap', wipedAt !== null, wipedAt ? `by ${wipedAt}s` : 'never saw a wipe')

  b.events.length = 0
  await sleep(wipedAt ?? 30)
  const woke = await a.send('act')
  const relay = await waitForEvent(b, 'action', 5)
  check('wake broadcasts to the other socket', !!relay, `instance ${relay?.instance}`)
  check('other socket keeps its seat after wake', relay?.seat === 2)
  void woke

  // keepalive for clients. should answer without waking anything, so ping well
  // inside the hibernation window or this passes even if pings do wake it
  await sleep(wipedAt ?? 30)
  const asleep = await a.send('hello')
  const pingEvery = Math.max(1, (wipedAt ?? 30) / 4)
  for (let i = 0; i < 12; i++) {
    await sleep(pingEvery)
    await a.ping()
  }
  check('12 pings answered', true, `every ${pingEvery}s`)
  const afterPings = await a.send('hello')
  check('pings do not keep it awake', afterPings.instance !== asleep.instance, `${asleep.instance} -> ${afterPings.instance}`)

  // same clock as a real turn
  a.events.length = 0
  b.events.length = 0
  const armed = await a.send('timer', { ms: 20000 })
  const armedAt = Date.now()
  const fired = await waitForEvent(a, 'alarm', 40)
  const firedLate = Date.now() - armedAt - 20000
  const firedB = await waitForEvent(b, 'alarm', 2)
  check('20s alarm fired', !!fired, `${firedLate}ms late as seen by the client`)
  check('alarm reached both sockets', !!firedB)
  check('alarm woke a fresh instance', fired?.instance !== armed.instance, `${armed.instance} -> ${fired?.instance}`)

  // drop and come back
  a.events.length = 0
  await sleep(wipedAt ?? 30)
  b.ws.close()
  const left = await waitForEvent(a, 'left', 10)
  check('close wakes it and tells the others', !!left, `left ${left?.left}`)
  const back = await connect(2)
  const hello = await back.send('hello')
  check('rejoin gets the seat and saved state', hello.seat === 2 && hello.actions === woke.actions, `actions ${hello.actions}`)
  a.ws.close()
  back.ws.close()
}

// Workers freeze timers during compute, so all timing here is client side.
// Each rung repeats because a free plan CPU cap can be fuzzy, not a hard wall.
async function bench() {
  console.log(`\n== bot cpu, table ${table}-bench`)
  let c = await connect(1, `${table}-bench`)
  await c.send('hello')
  const reps = Number(arg ?? 15)

  const rtts = []
  for (let i = 0; i < reps * 2; i++) {
    const t = performance.now()
    await c.send('hello')
    rtts.push(performance.now() - t)
  }
  const base = median(rtts)
  console.log(`      baseline round trip ${base.toFixed(1)}ms`)

  async function rung(t, n, label) {
    const times = []
    let died = 0
    for (let i = 0; i < reps; i++) {
      if (c.closed) c = await connect(1, `${table}-bench`)
      const start = performance.now()
      const res = await c.send(t, { n }).catch(() => null)
      if (res) times.push(performance.now() - start)
      else {
        died++
        console.log(`      ${label} died: ${JSON.stringify(c.closed)}`)
      }
    }
    const work = times.length ? Math.max(0, median(times) - base) : NaN
    console.log(`      ${label.padEnd(24)} ${work.toFixed(1).padStart(8)}ms   died ${died}/${reps}`)
    return { work, died }
  }

  await rung('bench-table', 1, 'table bot x1')
  await rung('bench-table', 100, 'table bot x100')
  for (const n of [100, 1000, 10000, 30000, 100000, 300000, 1000000, 3000000]) {
    const { died } = await rung('bench-mc', n, `monte carlo ${n}`)
    if (died === reps) break
  }
  c.ws.close()
}

// one silent socket, one with the keepalive a real client would run
async function idle(minutes) {
  console.log(`\n== long idle, ${minutes} minutes, silent socket against 30s pings`)
  const name = { silent: `${table}-silent`, pinged: `${table}-pinged` }
  const started = Date.now()
  const silent = await connect(1, name.silent)
  const pinged = await connect(1, name.pinged)
  const before = await silent.send('act')
  await pinged.send('act')

  for (let waited = 0; waited < minutes * 60 && !(silent.closed && pinged.closed); waited += 30) {
    await sleep(30)
    if (!pinged.closed) pinged.ws.send('ping')
  }

  for (const [label, c] of [['silent', silent], ['pinged', pinged]]) {
    const lasted = ((c.closedAt ?? Date.now()) - started) / 1000
    check(`${label} socket stayed open`, !c.closed, `lasted ${lasted.toFixed(0)}s ${c.closed ? JSON.stringify(c.closed) : ''}`)
  }
  check('pinged socket got its pongs', pinged.pongs > 0, `${pinged.pongs} pongs`)

  // a drop is survivable as long as the seat and table come back
  const back = await connect(1, name.silent)
  const hello = await back.send('hello')
  check('rejoin after the wait finds saved state', hello?.actions === before.actions, `actions ${hello?.actions}`)
  for (const c of [silent, pinged, back]) if (!c.closed) c.ws.close()
}

if (mode === 'all' || mode === 'hibernation') await hibernation()
if (mode === 'all' || mode === 'bench') await bench()
if (mode === 'idle') await idle(Number(arg ?? 15))

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
// not process.exit, that trips a libuv assert on windows while sockets are closing
process.exitCode = failed ? 1 : 0
