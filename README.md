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
  games/          # /games index and one route per game (/games/ping-pong)
  globals.css     # design system + all component styles
components/       # Nav, Hero, About, Services, Skills, Experience, Projects, Playground, Contact, Footer
  Icons.tsx       # inline SVG icon set (no unicode glyphs -> no tofu boxes)
  games/          # game UI: PongGame (canvas, HUD, menus), PlayHistory, GameRecord
lib/
  data.ts         # all CV content in one typed module (edit here, not in JSX)
  useReveal.ts    # IntersectionObserver scroll-reveal hook
  games/
    catalog.ts    # the list of games the index page shows
    history.ts    # IndexedDB: finished matches and per-game settings
    pong/         # engine.ts (rules, no rendering), scene.ts (three.js), sound.ts (WebAudio)
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
entry in [`lib/games/catalog.ts`](lib/games/catalog.ts). The first is Ping Pong.

- **Rules and rendering are separate.** `lib/games/pong/engine.ts` has no three.js in
  it and runs at a fixed 120 steps a second; `scene.ts` only draws its state. That
  split is what lets the CPU levels be tuned by simulating matches in Node.
- **History stays in the browser.** Finished matches and settings are written to an
  IndexedDB database called `akinroye-games` (stores `matches` and `prefs`). Nothing
  is sent to a server. If storage is blocked (some private windows), the game still
  plays and the history panel says so.
- To add a game: add it to the catalog, create `app/games/<slug>/page.tsx`, and save
  its matches through `usePlayHistory("<slug>")` so the index and homepage pick up
  the player's record automatically.

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

Everything works with no env file. One optional variable:

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Absolute base URL used by `metadataBase` for Open Graph / Twitter image URLs. Defaults to `http://localhost:3000`. |

Copy `.env.example` to `.env` and set it when deploying to a real domain. It is
deliberately **not** prefixed `NEXT_PUBLIC_`, since metadata renders on the server, so
the value never needs to reach the browser.

## Deploying

The site is fully static-friendly. Deploy to Vercel by pointing it at the repo,
or run `npm run build && npm start` behind any Node host.
# portfolio
