# PONKER 🎲

No-limit Texas hold'em in the browser, with fake chips. Play bots on your own, drop into a public table, or open a private room and send your friends the link. The chip tracker it started as is still [here](https://ponker.aidanbailey.com/#chips) for home games.

**[ponker.aidanbailey.com](https://ponker.aidanbailey.com)**

The poker game is in beta.

## Poker

- **Quick Play** puts you at the busiest public table with a free seat. On your own? Wait, invite someone, or fill the table with bots
- **Bots**: pick up to five of 24 bots across four skill levels and play a solo table, all in your browser
- **Rooms**: four public tables, or a private room of your own with a link to share, text chat and bots the host can add
- 5/10 blinds, 1,000 to sit, free top-ups
- Emotes and quick phrases at every table
- Drop your connection and you get your seat back when you return
- Hints, win chance and a hand rankings sheet while you learn
- Plays on phones and desktops, portrait or landscape

## Chip tracker

A poker chip tracker for players who haven't got the knack of counting their stack yet. Set up your chips, tap as they come and go, and always know what you're holding.

- Add and remove chips with a tap, or swipe down and up on a phone
- Custom chip values and colors (click or long press a chip)
- Presets for common home games and casino denominations
- Cashout summary with a bills and coins breakdown, ready to share with the table
- Felt, dark and light themes
- Saves automatically in your browser

## Stack

React, TypeScript and Vite, with plain CSS. Rooms and public tables run on Cloudflare Workers, one Durable Object per table. The engine is plain TypeScript, so the same rules run in the browser for bots and on the server for live tables.

```
src/
  engine/       hold'em rules, side pots, hand evaluation (no React)
  game/         the table, bots and the bot picker
  room/         live rooms and public tables, the socket client
  hub/          home screen and its pages
  lib/          chip data, cashout maths, storage (no React)
  hooks/        stored state, chip gestures
  components/   shared UI
  styles.css    theme tokens and the tracker's styling
worker/
  src/          the Cloudflare side of a room, thin on purpose
```

## Development

```bash
npm install
npm run dev        # http://localhost:3000, also reachable from your phone on the same wifi
npm test
npm run lint
npm run typecheck
npm run build

cd worker && npx wrangler dev   # rooms on ws://localhost:8787, which the dev site uses by default
```

A production build talks to the rooms worker at `VITE_ROOMS_URL` (a `wss://` address).

### Browser testing

Local browser checks use [Playwright](https://playwright.dev/docs/test-configuration) and Chromium:

```bash
npm run browser:install       # once after installing or updating Playwright
npm run test:browser          # desktop, phone emulation and two guest players
npm run test:browser:headed   # watch the checks in Chromium
npm run test:browser:ui       # interactive test runner
npm run browser:open          # open localhost for manual exploration
npm run browser:report        # inspect the latest report
```

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
The tests reuse Vite on 3000 and Wrangler on 8787. If either is stopped, Playwright
starts it locally for the test run and stops that process afterward. Start both
separately with the development commands above to keep them running for manual testing.
Wrangler needs `--ip 0.0.0.0` for a second player on the LAN origin.

The two-player check uses the local fourth public table, two fresh browser contexts,
and separate origins. It releases its seats when finished. The second origin is
detected from a 10.x or 192.168.x LAN address, with localhost as a fallback. Set
`PONKER_LAN_URL` to a local HTTP origin on port 3000 to choose another address.
The phone checks emulate Chromium, they do not test Safari or a physical phone.

Tests live in `e2e/*.browser.ts`, separate from Vitest's unit tests. Screenshots are
attached to the HTML report, and failures retain a trace of the primary browser
context. Reports and traces stay in ignored `playwright-report/` and `test-results/`
directories. The PONKER title gestures and final animation feel are checked by hand.

Sounds are from [Kenney](https://kenney.nl)'s Casino Audio pack (CC0).

Built by Aidan Bailey. [Buy me a coffee](https://ko-fi.com/aidanlbailey) if it saved you at the table.
