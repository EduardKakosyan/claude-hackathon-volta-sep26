-- TEST ONLY. Minimal stand-in for the Phase 2 base migration so Phase 5 SQL can be validated
-- without a Phase 2 checkout. Mirrors the documented `beaches` columns verbatim (verified
-- against Phase 2's real `supabase/migrations/20260912000000_init.sql`); never applied to a
-- project. Fixture rows are copied verbatim (name/authority/lat/lon/waterBody/region/sourceUrl)
-- from the real roster in `lib/seed/beaches.ts` (hrm-kinap, hrm-birch-cove, ns-rainbow-haven) so
-- a later column rename or roster edit fails loudly here instead of silently drifting.
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

insert into beaches (id, name, authority, lat, lon, water_body, region, source_url) values
  (
    'hrm-kinap',
    'Kinap Beach',
    'hrm',
    44.68002,
    -63.30658,
    'Porters Lake',
    'Halifax',
    'https://www.halifax.ca/parks-recreation/programs-activities/swimming/supervised-beaches-outdoor-pools-splash-pads'
  ),
  (
    'hrm-birch-cove',
    'Birch Cove Beach',
    'hrm',
    44.67991,
    -63.56021,
    'Lake Banook',
    'Halifax',
    'https://www.halifax.ca/parks-recreation/programs-activities/swimming/supervised-beaches-outdoor-pools-splash-pads'
  ),
  (
    'ns-rainbow-haven',
    'Rainbow Haven Beach',
    'province',
    44.65006,
    -63.41726,
    'Atlantic Ocean',
    'Halifax',
    'https://parks.novascotia.ca/park/rainbow-haven-beach'
  );
