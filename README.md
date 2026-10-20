# Emmanuel Akinroye, Portfolio

Personal portfolio site for Emmanuel Akinroye, Senior Full-Stack Engineer.
Built with **Next.js 16 (App Router)**, **React 19** and **TypeScript**.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm start          # serve the production build
npm run typecheck  # tsc --noEmit
```

> `next lint` was removed in Next 16, so the lint script is `typecheck` instead.

## Structure

```
app/
  layout.tsx      # metadata, fonts (next/font/local), <html> shell
  not-found.tsx   # branded 404
  fonts/          # self-hosted variable woff2 (no build-time font fetch)
  page.tsx        # composes every section
  games/          # /games index and one route per game (ping-pong, blockfall, hot-lap, whot, ludo)
  globals.css     # design system + all component styles
components/       # Nav, Hero, About, Services, Skills, Experience, Projects, Playground, Contact, Footer
  Icons.tsx       # inline SVG icon set (no unicode glyphs -> no tofu boxes)
  games/          # per game: <Game>Game (canvas, menus, input) and <Game>History;
                  # shared: HistoryPanel, GameRecord, GameIcons, TableHistory,
                  # OnlinePanels (join form, lobby, dropped-player notice)
lib/
  data.ts         # all CV content in one typed module (edit here, not in JSX)
  useReveal.ts    # IntersectionObserver scroll-reveal hook
  games/
    catalog.ts    # the list of games the index page shows
    history.ts    # IndexedDB: finished games (one record type per game) and settings
    stats.ts      # per-game summaries and the "your record" line
    audio.ts      # tiny WebAudio synth shared by every game's sound effects
    pong/         # engine.ts (rules, no rendering), scene.ts (three.js), sound.ts
    blockfall/    # the same split for the falling-block puzzle
    hotlap/       # the same again, plus track.ts: the circuit as sampled curve data
    whot/         # engine.ts (rules + CPU), scene.ts (table and cards), sound.ts
    ludo/         # engine.ts, board.ts (progress -> squares on the grid), scene.ts, sound.ts
    rng.ts        # seeded random numbers, kept in game state so shuffles are replayable
    table.ts      # the referee for turn-based games: turns, CPU seats, pacing
    useSession.ts # one hook for CPU, shared-screen and online play
    net/          # peer.ts (WebRTC via PeerJS), room.ts (lobby, seats, rejoining)
public/
  emmanuel.jpg               # portrait used in the hero
  Emmanuel-Akinroye-CV.pdf   # served by the Download CV buttons
  games/                     # card images for the games
docs/             # design reference image + source CV
```

## Editing content

Almost everything on the page (roles, bullet points, skills, projects and
contact details) lives in [`lib/data.ts`](lib/data.ts). Update it there and every
section re-renders from it.

## Games

`/games` lists small browser games; each one gets a route under `app/games/` and an
entry in [`lib/games/catalog.ts`](lib/games/catalog.ts). So far: Ping Pong,
Blockfall (a falling-block puzzle, deliberately not called Tetris, which is a
trademark its owners enforce), Hot Lap (a time-trial racer), and two you can play
online: Whot (the Nigerian card game) and Ludo.

- **Rules and rendering are separate.** Each game's `engine.ts` has no three.js in it
  and runs at a fixed 120 steps a second; `scene.ts` only draws its state. That split
  is what lets the Pong CPU be tuned and the Blockfall rules be tested by playing
  games headlessly in Node.
- **History stays in the browser.** Finished games and settings are written to an
  IndexedDB database called `akinroye-games` (stores `matches` and `prefs`). Hot Lap
  also keeps your best lap there as a ghost replay (`prefs` key `hot-lap:ghost`). Nothing
  is sent to a server. If storage is blocked (some private windows), the game still
  plays and the history panel says so.
- **Shared controls.** [`lib/games/gamepad.ts`](lib/games/gamepad.ts) polls gamepads once a
  frame (standard button layout, A or Start to begin, Start to pause), and
  [`lib/games/useFullscreen.ts`](lib/games/useFullscreen.ts) gives every stage a full-screen
  toggle (F), falling back to filling the window where the Fullscreen API is missing.
- **Ping Pong has a two-player mode** on one device: keyboard halves, two gamepads, or
  each player on their own half of a touchscreen. Those matches are saved with
  `mode: "versus"` and kept out of the record against the CPU.
- **Whot and Ludo play three ways**: against the CPU, friends sharing one screen, or
  online. They're built on one turn-based core: each game's rules are pure functions over
  plain JSON state (`engine.ts`), and [`lib/games/table.ts`](lib/games/table.ts) runs them,
  taking moves from whoever's turn it is, playing CPU seats, and pacing everything to the
  animations. Whot hides hands on a shared screen behind a "pass the device" screen.
- **Online play is peer to peer.** The host clicks "Create a game link" and sends the link
  (or the six-letter code); guests open it and they're in. Browsers connect over WebRTC
  data channels with [PeerJS](https://peerjs.com): its free public broker introduces the two
  browsers, then moves go directly between them (or via PeerJS's TURN relay on strict
  networks). The site needs no backend. The host's browser is the referee: it holds the
  full game, checks every incoming move, and sends each guest only what their seat may see,
  so Whot hands can't be read from dev tools. Rooms survive drops: a guest who reloads or
  loses signal rejoins their seat, a host who reloads picks the game back up from
  sessionStorage, and the host can hand a dropped seat to the CPU.
- To add a game: add a record type for it to the `PlayRecord` union in `history.ts`,
  a line for it in `recordLine` in `stats.ts`, an entry in the catalog and a route at
  `app/games/<slug>/page.tsx`. Save finished games through `usePlayHistory("<slug>")`
  and the index and homepage pick up the player's record automatically.

## Design

The palette is sampled directly from the portrait in `public/emmanuel.jpg`:

| Token | Value | Source |
| --- | --- | --- |
| `--primary` | `#A32639` | burgundy suit |
| `--primary-lt` | `#C63B50` | suit highlight |
| `--primary-dk` | `#6E1622` | suit shadow |
| `--accent` | `#D9A56B` | warm backdrop highlight |
| `--bg` | `#140E0D` | warm near-black base |

Layout follows the supplied reference (`docs/design-reference.jpeg`), with its
blue theme re-keyed to those warm burgundy tones so the site and the portrait
read as one piece.

## Environment

Everything works with no env file. Optional variables:

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Absolute base URL used by `metadataBase` for Open Graph / Twitter image URLs. Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_PEER_SERVER` | Optional. Your own [PeerServer](https://github.com/peers/peerjs-server) for online games, e.g. `https://peer.example.com:443/myapp`. Without it, online play uses PeerJS's free public broker. |

Copy `.env.example` to `.env` and set `SITE_URL` when deploying to a real domain. It is
deliberately **not** prefixed `NEXT_PUBLIC_`, since metadata renders on the server, so
the value never needs to reach the browser. `NEXT_PUBLIC_PEER_SERVER` is, because the
browser is what connects to it.

## Deploying

The site is fully static-friendly. Deploy to Vercel by pointing it at the repo,
or run `npm run build && npm start` behind any Node host.
# portfolio
