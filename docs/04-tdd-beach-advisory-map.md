---
task: halifax-beach-safety-advisory-map-application-hk2d48
type: design-tdd
repo: EduardKakosyan/volta_hackathon
branch: halifax-beach-safety-advisory-map-application-hk2d48
sha: 410d251e838eb3006b076680e150e9527bbe8955
---

# Is the Beach Open: technical design

### System Design

#### The app is one Next.js deployment talking to Supabase; the scraper is a route handler on a schedule

The repository today holds `volta-frontend/`, a Vite + React SPA from a prior hackathon that renders a study-assistant dashboard from `src/data/mockData.ts`. It shares no domain with this project. It stays in the tree untouched; the beach app is a new Next.js App Router project at the repo root.

Everything runs in one Vercel project. Supabase is the only store, and no browser ever talks to a government site directly — halifax.ca and parks.novascotia.ca send no `Access-Control-Allow-Origin`, and halifax.ca returns 403 to non-browser user agents, so all three sources are read server-side with a browser `User-Agent`.

```mermaid
flowchart LR
  subgraph Vercel
    CR[Cron, hourly] --> RF["/api/refresh (route.ts)"]
    PG["app/page.tsx (RSC)"]
    MP["MapLibre map (client)"]
    PG --> MP
  end
  subgraph Gov sources
    H["halifax.ca status table<br/>server-rendered Drupal, no CORS"]
    P["parks.novascotia.ca/advisories<br/>Drupal cards, no feed, no CORS"]
    A["notices.novascotia.ca<br/>blue-green-algae.atom, CORS *"]
  end
  RF --> H & P & A
  RF --> DB[("Supabase Postgres")]
  DB --> PG
```

#### The season is over, so the sources are frozen and the build optimizes for that

It is September. All 18 rows of HRM's table read "Supervision ended for the season" with `Water Sample Results = N/A`, and the provincial supervision window closed August 30. Nothing on any source page will change until July.

This is the dominant design force. Anything that only earns its keep under churn — a raw-payload archive, fuzzy name matching, per-hour diffing — is not built. The ingest is as small as it can be while still being real: fetch, parse, resolve, upsert.

It also means the live map is 35 grey pins, and the demo runs on the seeded August 14, 2026 replay day. Replay is not a nice-to-have here; it is the only path that shows the app working.

#### Normalization happens on the way in, so the read path is a single select

The three sources speak three vocabularies. That collapse into the PRD's four states (Open / Advisory / Closed / Off-season) happens in `/api/refresh`, which writes one resolved row per beach. The page reads those rows and renders them; it applies no rules of its own.

```sql
beaches (           -- the 35-beach roster: hand-curated in the repo, upserted by refresh
  id            text primary key,      -- 'hrm-chocolate-lake'
  name          text not null,
  authority     text not null,         -- 'hrm' | 'province'
  lat           double precision not null,
  lon           double precision not null,
  ...
)

beach_status (      -- current resolved state, one row per beach
  beach_id          text primary key references beaches(id),
  state             text not null,     -- 'open' | 'advisory' | 'closed' | 'offseason'
  source_verbatim   text,              -- "Risk Advisory in Effect"
  source_url        text not null,
  source_posted_at  timestamptz,
  last_confirmed_at timestamptz not null   -- last successful read that produced this row
)

status_day (        -- one row per beach per day: feeds replay and the 14-day strip
  beach_id text references beaches(id),
  day      date,
  state    text not null,
  primary key (beach_id, day)
)

source_health (     -- exactly three rows: 'hrm', 'parks', 'algae'
  source          text primary key,
  last_attempt_at timestamptz not null,
  last_success_at timestamptz,
  last_error      text
)
```

Three properties the PRD asks for fall out of this shape directly:

- **A failed read changes nothing.** `last_confirmed_at` is only written by a read that succeeded, so a source that goes down leaves its pins on their last known status with an honest "last confirmed" timestamp, exactly as the PRD's degradation rule requires. Nothing has to reconstruct that from history.
- **A quiet day and a broken feed look different.** `source_health` separates "we tried" from "we succeeded", which is the whole difference between the footer reading *"HRM checked 9:40 a.m."* and *"HRM last confirmed 8:02 a.m. · couldn't reach halifax.ca since"*. Three rows carry the entire freshness footer.
- **The map is honest about provenance.** Every `beach_status` row carries the verbatim wording and the URL it came from, so a pin can never render a status it cannot attribute.

There is deliberately no raw-payload log alongside these tables. It would buy replayability of parsing decisions at the cost of 72 identical rows a day for ten months.

#### All curated data lives in the repo, and a scraped row finds its beach by exact alias or not at all

No source carries coordinates alongside status, and every source spells the same beach differently (*Cunard Pond Beach* in HRM's table, *CUNARD JUNIOR HIGH SCHOOL PARK BEACH* in the recreation layer). The algae feed never names a beach at all — it names lakes. So the roster is a TypeScript file, curated once from the research doc's geodata sources, and each entry carries the exact strings every source uses for it. The reconstructed August 14 replay day is a second file of the same kind.

```text
lib/seed/
  beaches.ts           # the 35-beach roster with coordinates and match aliases
  days/2026-08-14.ts   # { 'hrm-chocolate-lake': 'advisory', 'hrm-kinap': 'open', ... }
                       # header comment cites the HRM posts and CBC/CTV coverage it was built from
```

```ts
{
  id: 'hrm-oakfield-park',
  name: 'Oakfield Park Beach',
  authority: 'hrm',
  lat: 44.8875, lon: -63.5744,
  match: {
    hrmTable: 'Oakfield Park Beach',                    // exact cell text on halifax.ca
    lakes:    ['Shubenacadie Grand Lake', 'Grand Lake'], // exact <lake> strings from the atom feed
  },
}
```

Every refresh upserts both files before it touches a government site. Keys are natural (`beaches.id`, `(beach_id, day)`), so re-running is a no-op and the file in git is always the truth. A seeded day and a day the scraper recorded have the same shape in `status_day`, so the page never knows which it is rendering.

```text
refresh()
  upsert seed.beaches           -> beaches
  upsert seed.days[*]           -> status_day
  for each source: fetch, parse, match, resolve
  upsert resolved rows          -> beach_status
  upsert (beach_id, today)      -> status_day        # last-write-wins within the day
  update source_health
```

Matching is a dictionary lookup after trimming whitespace and case. **A name the dictionary doesn't know is logged and ignored, never guessed** — a fuzzy match that lands a Long Lake bloom on Long Pond Beach would be a safety bug with no error to catch. When halifax.ca does rename a row, the pin keeps its last confirmed status and someone adds one alias, which is the degradation path the PRD already designed for. Provincial advisory cards carry no park field, only a free-text title and body; they match on a `/park/<slug>` link in the body when one is present and on the lake-alias list otherwise — still exact, still ignore-if-unknown.

Today's `status_day` row is overwritten by each hourly run. A beach closed at 9 a.m. and reopened by 3 p.m. reads as open in the 14-day strip, which is what the government page would have shown at the end of that day.

#### An hourly Vercel cron is the only thing that triggers a scrape

```json
{ "crons": [{ "path": "/api/refresh", "schedule": "0 * * * *" }] }
```

Vercel invokes the route handler by GET on the production deployment and attaches `Authorization: Bearer $CRON_SECRET`, which the handler checks before doing any work. Hourly scheduling requires a Pro plan — Hobby rejects any sub-daily expression at deploy time — and the project is on Pro.

The PRD's other freshness clause, *"opening the app or pulling down on the sheet re-reads the app's latest data"*, is a caching decision rather than a second scrape path: the page reads Supabase per request instead of being statically cached, so a user always sees the most recent successful refresh. No user action ever reaches a government site.

#### The browser never holds a Supabase key; the page reads on the server and anything shareable is a URL

There is no login and nothing a user can read that isn't public, so the simplest safe arrangement is that only the server talks to Supabase. `app/page.tsx` runs on the server with the service-role key from a server-only env var, reads the roster, current status, and source health in one go, and hands the client map plain JSON. No RLS policies exist because no public credential can reach the tables.

```mermaid
flowchart LR
  B[Browser] -->|"GET /?beach=hrm-kinap&day=2026-08-14"| RSC["app/page.tsx (server)"]
  RSC -->|service-role key, server only| DB[("Supabase")]
  RSC -->|"props: beaches[] + status[] + health[]"| MAP["&lt;BeachMap&gt; (client)"]
  B -->|"report a sign"| SA["server action"] --> DB
```

The whole app is one page, and any state worth sharing is a search param the server reads:

- `?day=2026-08-14` renders from `status_day` rows for that date instead of `beach_status`; the banner and the replaced footer are driven by the param's presence. A replayed map is a shareable link, and closing the banner is navigating back to `/`.
- `?beach=hrm-kinap` renders with that beach's detail sheet open. *Share* on the sheet copies this URL, so a shared link lands on the answer, not the map.

Crowd reports are the one write path and go through a server action, which is also the only place any throttling or verification can live since the browser has nothing to authenticate with.

#### A report costs a human a Turnstile check, and no single person can put a flag on a pin

With no accounts, verification has to prove two cheaper things instead of identity: that a human submitted the report, and that one human can't submit it fifty times. Cloudflare Turnstile handles the first invisibly on the form; a per-IP count in Postgres handles the second. Raw IPs are never stored — only a salted hash.

```text
submitReport(beachId, sign, photo?, turnstileToken)
  POST challenges.cloudflare.com/turnstile/v0/siteverify   -> not success? reject
  ipHash = sha256(salt + x-forwarded-for)
  count reports where ip_hash = ipHash and beach_id = beachId
        and created_at > now() - 1 hour                    -> >= 1? reject 429
  upload photo to Storage bucket 'report-photos' (if any)
  insert reports row
```

```sql
reports (
  id         bigserial primary key,
  beach_id   text not null references beaches(id),
  sign       text not null,          -- 'closed' | 'advisory' | 'clear'
  ip_hash    text not null,
  photo_path text,                   -- object key in the private 'report-photos' bucket
  created_at timestamptz not null default now()
)
```

The flag on a pin — *"⚑ 2 people reported a Closed sign here today"* — only appears once **two or more reports from distinct `ip_hash` values agree on the same sign the same day**. A lone report is stored but not surfaced. Combined with the throttle, that means putting a flag on a pin takes two people at two addresses, which is roughly what it takes to be telling the truth. Phone OTP can be added at the same server action later if abuse shows up; nothing else would need to change.

#### The map is MapLibre over keyless satellite and terrain, exactly as the PRD's live mockup

The PRD's `mockup-3d-map-live.html` is the intended look and already fixes the sources. Nothing needs a key or a billing account; all three are attribution-only.

| Layer | Source | Licence / attribution |
|---|---|---|
| Satellite imagery | EOX Sentinel-2 cloudless 2020 WMTS (`tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/...`) | CC BY-NC-SA 4.0 — *"Sentinel-2 cloudless by EOX"*. Non-commercial only; a commercial imagery source is required if the app is ever sold |
| Terrain + hillshade | AWS Terrain Tiles, Terrarium PNG (`s3.amazonaws.com/elevation-tiles-prod/terrarium/...`) | Public domain / open data; unmaintained but live |
| Engine | MapLibre GL JS, globe projection, `setTerrain` at 1.6× exaggeration | BSD-3 |

There is no vector basemap or label layer over the imagery; the search box and the sheet are how a user finds a beach, and the pins are the only text on the map. Attribution is rendered by MapLibre's compact control.

#### The schema is SQL migration files in git, applied with the Supabase CLI

The five tables and the `report-photos` Storage bucket are declared once, as SQL under `supabase/migrations/`, and reach the hosted project through `supabase db push`. The same files drive `supabase start` for a local Postgres during development, so the schema in git is the only authored copy and a fresh project is one command away.

```text
supabase/
  config.toml
  migrations/
    20260912000000_init.sql   # beaches, beach_status, status_day, source_health, reports, bucket
```

### Program Design

#### Each source reports what it saw; one pure resolver turns readings into the four states

The PRD's status table has two very different halves. HRM is "read a cell, map a word." Provincial status is the *absence* of readings — no advisory card, no algae notice, inside the season — which no single scraper can observe. So scrapers never write status. Each returns a list of `SourceReading`s, and one resolver walks the full roster and decides every pin.

```text
lib/ingest/
├── sources/
│   ├── hrm.ts      fetch → parse table → SourceReading[]   (18, one per row)
│   ├── parks.ts    fetch → parse cards → SourceReading[]   (0..n, matched cards only)
│   └── algae.ts    fetch → parse atom  → SourceReading[]   (0..n, matched lakes only)
├── resolve.ts      (roster, readings, today) → BeachStatusRow[]   (always 35)
└── refresh.ts      seeds → sources → resolve → upsert → health
```

```ts
type SourceReading = {
  beachId:   string
  source:    'hrm' | 'parks' | 'algae'
  kind:      'open' | 'advisory' | 'closed' | 'offseason'   // the source's own claim
  verbatim:  string          // "Risk Advisory in Effect" / card title / lake name
  url:       string
  postedAt?: Date
}

resolve(roster: Beach[], readings: SourceReading[], ok: Set<Source>, today: Date): BeachStatusRow[]
```

`resolve.ts` is the only file that encodes the PRD's table — *algae beats everything*, *HRM's word maps one-to-one*, *a provincial beach with no readings is hollow-green open in season and grey outside it*. Sources know nothing about each other or about those rules.

Because "no reading" means *open* for a provincial beach, the resolver has to know which sources actually answered. A source that throws is absent from `readings` and from `ok`; the resolver then **omits** every beach that source is authoritative for (HRM beaches need `hrm`; provincial beaches need both `parks` and `algae`) instead of guessing. `refresh.ts` upserts only the rows that came back, so an omitted beach keeps its `last_confirmed_at` — the PRD's degradation rule, with no scraper aware it exists.

#### The server seeds the client once; selection is local state that the URL follows shallowly

One server component reads the search params and Supabase, then hands everything to one client component. Below that line nothing fetches: the map, the sheet, and the detail are all controlled by a single `selectedId`.

```tsx
<Page>  (app/page.tsx, server)              reads ?day ?beach, queries Supabase once
  <BeachApp beaches status health replayDay initialBeachId>   (client)
    useState(selectedId ← initialBeachId)   on change: history.replaceState('?beach=…')  — no navigation
    useGeolocation()                         sorts the sheet; falls back to Halifax
    <BeachMap>                               pins as markers; flyTo whenever selectedId changes
    <SearchBox>                              onPick → setSelectedId
    <NearbySheet>                            bottom sheet <lg, side panel ≥lg — one component
      <BeachRow ×n>                          onTap → setSelectedId
      <BeachDetail>                          shown when selectedId; reports + 14-day strip
        <ReportSignForm>                     → server action
    <ReplayControl>                          router.push('/?day=…')  — a real navigation
    <ReplayBanner> <FreshnessFooter>
```

The rule that decides which mechanism a control uses: **if the data changes, navigate; if only the camera changes, set state.** Picking a beach only moves the camera and opens a sheet, so it is a `useState` write plus `history.replaceState` — the fly-to starts on the frame you tap, and the address bar is already what *Share* should copy. Picking a replay day changes which rows the page needs, so it is a real `router.push` and the server renders again from `status_day`.

#### The map is `react-map-gl/maplibre`, and a pin is an ordinary React component in a `<Marker>`

MapLibre needs `window`, so `BeachMap` is loaded with `dynamic(..., { ssr: false })`. Inside it the wrapper owns the map lifecycle; the component owns nothing but props and one effect.

```tsx
// components/beach-map.tsx  ('use client')
<Map ref={mapRef} mapStyle={SATELLITE_TERRAIN_STYLE}
     projection="globe" terrain={{ source: 'dem', exaggeration: 1.6 }}>
  {beaches.map(b => (
    <Marker key={b.id} longitude={b.lon} latitude={b.lat} onClick={() => onSelect(b.id)}>
      <StatusPin state={status[b.id].state}
                 hollow={b.authority === 'province'}
                 flagged={flags[b.id]} />
    </Marker>
  ))}
</Map>

useEffect(() => {                                   // fly-to on every selection
  if (selectedId) mapRef.current?.flyTo({ center: coords(selectedId), zoom: 13.5, pitch: 65 })
}, [selectedId])
```

A `<Marker>` is a DOM element MapLibre screen-anchors, so a pin is upright at 65° pitch by construction — the PRD's "legible at any tilt" without any `pitch-alignment` work. It also means the pin's three states, the hollow provincial ring, the ⚑ report badge, and its tap target are Tailwind and JSX rather than sprite sheets and style expressions. Thirty-five markers cost nothing; a GeoJSON `circle` layer would only pay off at hundreds of points.

`SATELLITE_TERRAIN_STYLE` is a static style object lifted straight from `mockup-3d-map-live.html`: the EOX raster source, the Terrarium `raster-dem` source, a hillshade layer, and `terrain`. The globe intro is the mockup's `flyTo` sequence run once on `load`.

#### Parsers are pure functions over a string, tested against captured pages

Each source module exports a `fetch` that does the network and a `parse` that does not, so a test never touches halifax.ca. The HTML pages go through `cheerio`; the Atom feed goes through `fast-xml-parser`. Regex was rejected because a Drupal template tweak would turn a passing pattern into *zero readings*, which the resolver would read as "no advisories, every provincial beach open."

```ts
// lib/ingest/sources/hrm.ts
export async function fetchHrm(): Promise<string>        // GET with a browser UA; throws on non-200
export function parseHrm(html: string): SourceReading[]  // pure
  $('table[data-title="Supervised beach status updates"] tbody tr')
    → { name: td[0], verbatim: td[5], kind: HRM_WORDS[td[5]] }   // 4 words → 4 kinds; anything else: log, skip

// lib/ingest/sources/algae.ts
export function parseAlgae(xml: string): SourceReading[]
  feed.entry[] → content.notice.{lake, date, county} → match each lake against roster lakes[]
```

```text
lib/ingest/__fixtures__/
  hrm-2026-09-12.html      # captured with curl -A "Mozilla/5.0 …": all 18 rows "Supervision ended"
  hrm-2026-08-14.html      # the same page with two cells hand-edited to "Risk Advisory in Effect"
  parks-2026-09-12.html
  algae-2026-09-12.atom
```

Tests run under `vitest`. Three functions are worth testing and the rest is glue: `parseHrm`, `parseParks` / `parseAlgae`, and `resolve`. The hand-edited in-season HRM fixture is the important one — no live in-season page exists to capture until July, and that file is the only thing that exercises the advisory path, the four-word map, and the resolver's amber output before the season does it for real.

#### One `loadPage()` feeds the page; the corroboration rule is a SQL view

`lib/db/queries.ts` is the only module that imports the Supabase client for reads. It returns one `PageData` and `page.tsx` is three lines: read params, await it, render `<BeachApp {...data} />`.

```ts
export async function loadPage({ day, beachId }: { day?: string; beachId?: string }): Promise<PageData>

type PageData = {
  beaches:    Beach[]
  status:     Record<BeachId, BeachStatusRow>   // beach_status, or status_day rows when day is set
  health:     SourceHealthRow[]                 // 3 rows → freshness footer
  flags:      Record<BeachId, ReportFlag>       // from report_flags; empty when day is set
  strip?:     StatusDayRow[]                    // last 14 days for beachId, when set
  replayDay?: string
}
```

```sql
create view report_flags as
  select beach_id, sign, count(distinct ip_hash) as people, max(created_at) as last_at
  from reports
  where created_at >= date_trunc('day', now() at time zone 'America/Halifax')
  group by beach_id, sign
  having count(distinct ip_hash) >= 2;
```

The `having` clause is the rule with safety weight, and it lives in the migration where neither the page nor the server action can loosen it by accident. Flags are empty whenever `day` is set, so a replayed August map never carries today's reports. Row types come from `supabase gen types`; nothing hand-copies a table shape.

#### The rest of the server side is three small entry points

```ts
// app/api/refresh/route.ts
export const maxDuration = 60
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response(null, { status: 401 })
  return Response.json(await refresh())            // returns the three source_health rows
}

// app/actions/report.ts   ('use server')
export async function submitReport(form: FormData): Promise<{ ok: true } | { ok: false; reason: 'bot' | 'throttled' | 'invalid' }>
  // turnstile → ip hash → throttle count → optional photo upload → insert   (lib/db/reports.ts)

// lib/ingest/refresh.ts
export async function refresh(): Promise<SourceHealthRow[]>
  // today = new Date() in America/Halifax; every step from the System Design pseudocode
```

"Today" is always the Halifax calendar date, computed once in `refresh()` and passed down, so a run at 02:00 UTC writes the right `status_day` row.

#### The project is a Next.js app at the repo root, beside the untouched Vite scaffold

```diff
 volta_hackathon/
+├── app/
+│   ├── layout.tsx, globals.css        # Tailwind v4 + the shadcn token block
+│   ├── page.tsx                       # server: params → loadPage → <BeachApp>
+│   ├── actions/report.ts              # server action
+│   └── api/refresh/route.ts           # cron target
+├── components/
+│   ├── beach-app.tsx                  # client root: selectedId, geolocation, layout switch
+│   ├── beach-map.tsx                  # react-map-gl/maplibre, dynamic ssr:false
+│   ├── status-pin.tsx                 # cva variants: state × hollow × flagged
+│   ├── nearby-sheet.tsx, beach-detail.tsx, search-box.tsx, report-sign-form.tsx
+│   ├── replay-control.tsx, replay-banner.tsx, freshness-footer.tsx, legend.tsx
+│   └── ui/                            # shadcn new-york/neutral: sheet, button, badge, dialog, input
+├── lib/
+│   ├── db/  client.ts, queries.ts, reports.ts, types.ts (generated)
+│   ├── ingest/  sources/{hrm,parks,algae}.ts, resolve.ts, refresh.ts, __fixtures__/
+│   ├── seed/  beaches.ts, days/2026-08-14.ts
+│   ├── map-style.ts                   # SATELLITE_TERRAIN_STYLE from the mockup
+│   └── utils.ts                       # cn()
+├── supabase/  config.toml, migrations/20260912000000_init.sql
+├── vercel.json                        # crons
+├── next.config.ts, tsconfig.json      # tsconfig excludes volta-frontend/
+├── vitest.config.ts
+├── docs/                              # research, PRD, TDD, mockups
 ├── volta-frontend/                    # prior hackathon SPA, not built or imported
 └── README.md
```

Environment variables, all server-only except the Turnstile site key:

```text
SUPABASE_URL                     SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET                      REPORT_IP_SALT
TURNSTILE_SECRET_KEY             NEXT_PUBLIC_TURNSTILE_SITE_KEY
```

### What We're Not Doing

- **No RLS policies and no anon key in the browser.** Every read and write goes through the server; the tables are unreachable from a public credential.
- **No raw fetch archive, no fuzzy matching, no refresh-on-read.** Each was considered and dropped because the sources are frozen until July and the project is on Vercel Pro.
- **No Realtime, no client-side Supabase.** An hourly source cannot feed live push.
- **No `/beach/[slug]` route.** The app is one page; `?beach=` and `?day=` are the only URL state.
- **No label or road layer over the satellite imagery.** Matches the mockup; search and the sheet do the finding.

### Patterns to Follow

The existing `volta-frontend/` shares no domain with this app, but its shadcn setup is the same one the new project re-initialises. Three conventions carry over verbatim.

**Class merging through `cn()`** (`volta-frontend/src/lib/utils.ts:1-6`) — every component that accepts `className` runs it through this, never string concatenation:

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
```

**Semantic colour as `cva` variants, not inline hex** (`volta-frontend/src/components/ui/badge.tsx:8-27`). The old pages broke this rule with `text-red-600` and `style={{ color: '#ef4444' }}`; `StatusPin` and the status chip should follow the primitive instead:

```ts
const badgeVariants = cva("inline-flex items-center …", {
  variants: { variant: { default: "…", secondary: "…", destructive: "…", outline: "…" } },
  defaultVariants: { variant: "default" },
})
// → statusPinVariants({ state: 'open' | 'advisory' | 'closed' | 'offseason', hollow: boolean })
```

**Tokens through `@theme inline`** (`volta-frontend/src/index.css:6-42`, `:root` at 44-77). Tailwind v4 is configured in CSS only — no `tailwind.config.*`. The four status colours are added as `--color-status-open` etc. in the same block so `bg-status-open` works everywhere, rather than re-appearing as palette classes per component.

**`Sheet` sides as the layout switch** (`volta-frontend/src/components/ui/sheet.tsx:62-69`). `NearbySheet` renders the same children in `side="bottom"` below `lg` and as a fixed left column at `lg+`, the way `Layout.tsx` already used `side="left"` for its mobile nav — one component, two placements.
