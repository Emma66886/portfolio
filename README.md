# Emmanuel Akinroye, Portfolio

Personal portfolio site for Emmanuel Akinroye, Senior Frontend Engineer.
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
  globals.css     # design system + all component styles
components/       # Nav, Hero, About, Services, Skills, Experience, Projects, Contact, Footer
  Icons.tsx       # inline SVG icon set (no unicode glyphs -> no tofu boxes)
lib/
  data.ts         # all CV content in one typed module (edit here, not in JSX)
  useReveal.ts    # IntersectionObserver scroll-reveal hook
public/
  emmanuel.jpg               # portrait used in the hero
  Emmanuel-Akinroye-CV.pdf   # served by the Download CV buttons
docs/             # design reference image + source CV
```

## Editing content

Almost everything on the page (roles, bullet points, skills, projects and
contact details) lives in [`lib/data.ts`](lib/data.ts). Update it there and every
section re-renders from it.

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
