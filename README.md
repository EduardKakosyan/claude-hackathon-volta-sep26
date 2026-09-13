# Is the Beach Open

A map of every supervised beach around Halifax, coloured by whether you can swim
there right now. One question, answered in ten seconds, with the government's own
words underneath it.

Status comes from three public sources — the HRM supervised-beach table,
Nova Scotia Parks notices, and the provincial blue-green algae feed — read hourly
on the server and normalised into a single Open / Advisory / Closed / Off-season
state per beach.

## Stack

- Next.js 16 (App Router) on Vercel
- MapLibre GL via `react-map-gl` on a paper-styled vector map (`lib/map-style/paper.json`, generated from OpenFreeMap positron by `pnpm map:style`)
- Tailwind v4 + shadcn/ui
- Supabase (Postgres) for status, history, and reports
- Vitest over captured fixtures of the three source pages

## Getting started

```bash
pnpm install
pnpm dev
```

Node 22 (see `.nvmrc`).

The app has two local modes, chosen by whether the Supabase credentials are
set (see `.env.example`):

- **Fixture day** — no `.env.local`. A hand-written, realistic day plus the
  seeded replay days in git; no network, no credentials. A fresh clone,
  `pnpm e2e` and CI all run here, and the footer says so. `?fixture=offseason`
  shows the off-season screens.
- **Live** — `vercel env pull .env.local`. Reads the real database; the footer
  shows when each source was last read. `curl -H "Authorization: Bearer
  $CRON_SECRET" localhost:3000/api/refresh` runs the hourly refresh by hand.

| Script | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm e2e` | Playwright: Chromium desktop, Chromium and WebKit iPhone (portrait and landscape), WebKit iPad; a screenshot per test |
| `pnpm sim <command>` | Drives Mobile Safari on the iPhone 16 Simulator (`docs/sim.md`) |
| `pnpm map:style` | Regenerates the paper map style from OpenFreeMap positron |

## Deploying

`docs/deploy.md` is the runbook: the Vercel project, its variables, the
Supabase migrations, the first refresh, the checks against the real domain,
and the two things only a physical iPhone can verify (Add to Home Screen and a
notification arriving).

## Documentation

`docs/` holds the research, PRD, technical design, and the HTML mockups the UI
is built against.
