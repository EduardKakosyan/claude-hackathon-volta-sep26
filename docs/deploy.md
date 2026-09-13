# Deploying nsbeaches.ca

The site is one Vercel project (`claude-hackathon-volta-sep26`, production
domain `www.nsbeaches.ca`) reading and writing one Supabase project
(`nsbeaches`, ref `ahbvuiettzvapfeewpvz`, `ca-central-1`, in the AI-First
Consulting org). Vercel Cron calls `/api/refresh` at the top of every hour;
that route is the only thing that writes to the database.

With no database credentials the app serves the fixture day (see
`.env.example`), and refuses to do so in production: a production deployment
with `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing fails every request
on purpose rather than pass a fixture off as live status.

## What the Vercel project holds

| Variable | Environments | Where it comes from |
| --- | --- | --- |
| `SUPABASE_URL` | production, development | `https://ahbvuiettzvapfeewpvz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | production, development | Supabase dashboard → Project Settings → API keys → `service_role` (secret). Copied by hand once; nothing in this repo or the connector can read it. |
| `CRON_SECRET` | production, development | `openssl rand -hex 32`. Vercel Cron sends it as the bearer token; the same value in `.env.local` lets you curl the refresh locally. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | production | One pair, generated once with `web-push generateVAPIDKeys()`. Rotating it orphans every stored subscription. |
| `VAPID_SUBJECT` | production | `https://www.nsbeaches.ca`. Push services need a contact for the sender; web-push accepts a `mailto:` address or an `https:` URL, and the site URL keeps a personal address out of every push JWT. |

Preview deployments deliberately get none of these. Every preview URL serves
the fixture day, which is what the Playwright suite asserts on, and nothing a
preview does can touch the live tables. Local development gets the database
and the cron secret (`vercel env pull .env.local`) but no VAPID pair: without
one a throwaway pair is generated per server process, so the bell works and
its subscriptions die with the process.

Add or rotate a value without echoing it:

```bash
printf '%s' "$VALUE" | vercel env add NAME production --sensitive --yes
printf '%s' "$VALUE" | vercel env add NAME development --sensitive --yes
vercel env ls        # names and environments only; values are never printed
```

## The database

The six migrations in `supabase/migrations/` were applied in order through
the Supabase connector's `apply_migration` (the local CLI is logged in to a
different account, so `supabase link` was not an option). To apply a new one
the same way, or with the CLI against the direct connection string:

```bash
supabase db push --db-url "$POSTGRES_URL_NON_POOLING"     # percent-encode the password
supabase migration list --db-url "$POSTGRES_URL_NON_POOLING"
```

`supabase_migrations.schema_migrations` on the project lists what has been
applied. The app never reads that table; it only matters for the next push.

Every table is service-role only. `20260914000200_rls.sql` turns row level
security on with no policies for the eight tables the earlier migrations left
open (the reports migration already did this for its own), so the anon and
authenticated roles Supabase's client libraries use see nothing; the server's
service role bypasses RLS. Nothing in the app holds the anon key.

## First run, and the checks

1. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (table above). Every
   other variable is already on the project.
2. Merge to `main`. `main` is protected: the `typecheck · lint · test · e2e`
   check must pass and the branch must be current, for admins too, and it
   cannot be force-pushed or deleted. The merge is the production deploy.
3. Fire the first refresh instead of waiting for the hour:

   ```bash
   vercel env pull .env.local
   source .env.local
   curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.nsbeaches.ca/api/refresh | jq .
   ```

   Expected in September: `seeded.beaches` 35, `live.sources` empty (both
   authorities off-season, no fetch made), 35 `offseason` rows,
   `conditions.sources` with `wind` and `buoy` ok, and `pushed` with nothing
   sent. In season, `live.sources` names `hrm`, `parks` and `algae`.
4. `curl -s https://www.nsbeaches.ca | grep -o 'checked [0-9:]* [ap].m.'` —
   the footer carries a real timestamp, not "fixture".
5. `pnpm dev` with the pulled `.env.local`: the local footer shows the same
   line. (`?fixture=offseason` is ignored against a database.)
6. `PLAYWRIGHT_BASE_URL=https://www.nsbeaches.ca pnpm e2e --project=chromium-desktop`
   — the directory, detail and location specs against the real site. The
   fixture-only assertions (the footer's fixture line, the exact unknown
   count, `?fixture=offseason`) are expected to fail there; everything else
   must pass.
7. `pnpm sim prod && pnpm sim shot p10-prod` — the real domain in Mobile
   Safari on the Simulator.

## Physical iPhone (the two things emulation cannot do)

- Open nsbeaches.ca, Share → Add to Home Screen, open it from the icon: it
  launches standalone with a paper-coloured splash (`app/manifest.ts`). Open a
  beach, tap the bell → the permission prompt → "Following".
- Trigger one transition: in the Supabase dashboard's table editor change
  `beach_status.state` for the followed beach (say `offseason` → `advisory`),
  then curl the refresh as above. The notification arrives within the send;
  tapping it opens that beach (`/?beach=…`). The next refresh writes the real
  state back.
