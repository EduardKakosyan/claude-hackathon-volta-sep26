# Is the Beach Open

A 3D map of every supervised beach around Halifax, coloured by whether you can swim
there right now. One question, answered in ten seconds, with the government's own
words underneath it.

Status comes from three public sources — the HRM supervised-beach table,
Nova Scotia Parks notices, and the provincial blue-green algae feed — read hourly
on the server and normalised into a single Open / Advisory / Closed / Off-season
state per beach.

## Stack

- Next.js 16 (App Router) on Vercel
- MapLibre GL via `react-map-gl`, Sentinel-2 cloudless imagery, Terrarium terrain
- Tailwind v4 + shadcn/ui
- Supabase (Postgres) for status, history, and reports
- Vitest over captured fixtures of the three source pages

## Getting started

```bash
pnpm install
pnpm dev
```

Node 22 (see `.nvmrc`).

| Script | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |

## Documentation

`docs/` holds the research, PRD, technical design, and the HTML mockups the UI
is built against.
