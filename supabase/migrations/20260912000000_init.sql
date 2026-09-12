-- Is the Beach Open: base schema.
-- Applied with `supabase db push`; row types are then generated with
-- `supabase gen types typescript --linked > lib/db/types.ts`.

create table if not exists beaches (
  id          text primary key,
  name        text not null,
  authority   text not null check (authority in ('hrm', 'province')),
  lat         double precision not null,
  lon         double precision not null,
  water_body  text not null,
  region      text not null,
  source_url  text not null
);

-- Current resolved state: one row per beach that has ever resolved.
-- Written only by a successful read of a government source.
create table if not exists beach_status (
  beach_id          text primary key references beaches(id),
  state             text not null check (state in ('open', 'advisory', 'closed', 'offseason')),
  source            text not null check (source in ('hrm', 'parks', 'algae', 'season')),
  source_verbatim   text,
  source_url        text not null,
  source_posted_at  timestamptz,
  last_confirmed_at timestamptz not null
);

-- One row per beach per Halifax calendar day. A seeded day and a scraped day
-- have the same shape; `basis` says which it was so replay never claims more
-- than it knows.
create table if not exists status_day (
  beach_id text not null references beaches(id),
  day      date not null,
  state    text not null check (state in ('open', 'advisory', 'closed', 'offseason')),
  basis    text not null default 'scraped' check (basis in ('scraped', 'verified', 'inferred')),
  note     text,
  primary key (beach_id, day)
);

create index if not exists status_day_day on status_day (day);

-- Exactly three rows: what was tried and what succeeded, per source.
create table if not exists source_health (
  source          text primary key check (source in ('hrm', 'parks', 'algae')),
  last_attempt_at timestamptz not null,
  last_success_at timestamptz,
  last_error      text
);
