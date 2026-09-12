-- Phase 5: crowd reports. Depends on the documented base schema (beaches.id text primary key)
-- from 20260912000000_init.sql. Verified against Phase 2's actual init migration, that file
-- creates beaches/beach_status/status_day/source_health only and never creates `reports`, so
-- there is no duplicate to reconcile here. Kept idempotent (`if not exists` / `or replace`)
-- anyway, since it costs nothing and protects against a future init that does add one.

create table if not exists public.reports (
  id          bigserial primary key,
  beach_id    text        not null references public.beaches(id),
  sign        text        not null check (sign in ('closed', 'advisory', 'clear')),
  -- sha256 hex of (REPORT_IP_SALT + "\n" + client ip); the raw address is never stored
  ip_hash     text        not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  -- object key in the private 'report-photos' bucket, always under the beach's own prefix
  photo_path  text        check (photo_path is null or (photo_path like beach_id || '/%' and length(photo_path) <= 200)),
  created_at  timestamptz not null default now()
);

create index if not exists reports_throttle on public.reports (ip_hash, beach_id, created_at);
create index if not exists reports_day      on public.reports (beach_id, created_at);

-- Locked to the service role: RLS on, no policies. The server is the only client.
alter table public.reports enable row level security;

-- One definition of "today" for both the view and the RPC. Second AT TIME ZONE converts the
-- Halifax wall-clock midnight back to an instant; without it the comparison depends on the session TZ.
create or replace function public.halifax_day_start(ts timestamptz)
returns timestamptz language sql stable as $$
  select date_trunc('day', ts at time zone 'America/Halifax') at time zone 'America/Halifax'
$$;

-- The rule with safety weight. `having` is the two-person threshold; nothing in the app can lower it.
create or replace view public.report_flags with (security_invoker = true) as
  select beach_id,
         sign,
         count(distinct ip_hash)::integer as people,
         max(created_at)                  as last_at
  from public.reports
  where created_at >= public.halifax_day_start(now())
  group by beach_id, sign
  having count(distinct ip_hash) >= 2;

-- Atomic throttle + insert. The advisory lock serialises concurrent submissions from the same
-- address at the same beach, so a read-then-write race cannot produce two rows.
create or replace function public.submit_report(
  p_beach_id       text,
  p_sign           text,
  p_ip_hash        text,
  p_window_seconds integer default 3600
) returns table (outcome text, id bigint, people integer)
language plpgsql as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_ip_hash || ':' || p_beach_id));

  if exists (
    select 1 from public.reports r
    where r.ip_hash = p_ip_hash and r.beach_id = p_beach_id
      and r.created_at > now() - make_interval(secs => p_window_seconds)
  ) then
    return query select 'throttled'::text, null::bigint, 0;
    return;
  end if;

  insert into public.reports (beach_id, sign, ip_hash) values (p_beach_id, p_sign, p_ip_hash)
  returning reports.id into v_id;

  return query
    select 'inserted'::text, v_id,
           (select count(distinct r.ip_hash)::integer from public.reports r
             where r.beach_id = p_beach_id and r.sign = p_sign
               and r.created_at >= public.halifax_day_start(now()));
end $$;

-- Postgres grants EXECUTE on every new function to the PUBLIC pseudo-role by default (unlike
-- tables, which have no such default). Revoking from `anon`/`authenticated` alone leaves that
-- inherited grant in effect, so `has_function_privilege('anon', …)` would still read true.
-- PUBLIC always exists, on Supabase and on a plain Postgres alike, so this revoke needs no guard.
revoke execute on function public.submit_report(text, text, text, integer) from public;

-- Defence in depth: the public roles never touch these objects. Guarded so the file also
-- applies to a plain Postgres (the PGlite harness) where Supabase's roles do not exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.reports from anon;
    revoke all on public.report_flags from anon;
    revoke execute on function public.submit_report(text, text, text, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.reports from authenticated;
    revoke all on public.report_flags from authenticated;
    revoke execute on function public.submit_report(text, text, text, integer) from authenticated;
  end if;
end $$;
