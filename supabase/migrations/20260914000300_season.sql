-- Replay for the whole year.
--
-- A fourth basis, 'calendar': the row of a beach on a day outside its
-- authority's published supervision window. No source was read and no notice
-- was found; the state is off-season because the season was. The seed writes
-- these for every off-season day of the year so the day scrubber has no gaps.
alter table status_day drop constraint if exists status_day_basis_check;
alter table status_day
  add constraint status_day_basis_check
  check (basis in ('scraped', 'verified', 'inferred', 'calendar'));

-- One row per recorded day with its state counts: what the scrubber's chips
-- show. security_invoker keeps the RLS model: the service role reads through
-- it, the anon and authenticated roles see nothing.
create or replace view status_day_summary with (security_invoker = true) as
  select
    day,
    count(*) filter (where state = 'open')      as open,
    count(*) filter (where state = 'advisory')  as advisory,
    count(*) filter (where state = 'closed')    as closed,
    count(*) filter (where state = 'offseason') as offseason
  from status_day
  group by day;
