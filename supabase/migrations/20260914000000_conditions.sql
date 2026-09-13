-- Is the Beach Open: conditions.
-- Wind at every beach from Open-Meteo and the Halifax buoy's water temperature
-- from SmartAtlantic ride the hourly refresh into these two tables. Daylight is
-- never stored: the page computes sunrise and sunset at render.

-- One row per beach: the last wind reading at the beach's own coordinates.
create table if not exists beach_conditions (
  beach_id     text primary key references beaches(id),
  wind_kmh     numeric not null,
  wind_dir_deg integer not null,
  air_temp_c   numeric,
  observed_at  timestamptz not null            -- Open-Meteo current.time, not the cron time
);

-- One row per buoy. Only 'smartatlantic-halifax' today; the reading is joined
-- to salt beaches within reach when the page loads, never copied per beach.
create table if not exists buoy_reading (
  buoy         text primary key,
  water_temp_c numeric,                        -- null when the sensor reports a gap
  observed_at  timestamptz not null
);

-- The two feeds get health rows beside the three status sources.
alter table source_health drop constraint if exists source_health_source_check;
alter table source_health
  add constraint source_health_source_check
  check (source in ('hrm', 'parks', 'algae', 'wind', 'buoy'));
