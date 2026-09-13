-- Is the Beach Open: every table is service-role only.
-- The server is the only client (lib/db/client.ts holds the service role key
-- and nothing holds the anon key), so row level security goes on with no
-- policies, the same model the reports migration set for its own table. The
-- service role bypasses RLS; the anon and authenticated roles see nothing.

alter table beaches          enable row level security;
alter table beach_status     enable row level security;
alter table status_day       enable row level security;
alter table source_health    enable row level security;
alter table beach_conditions enable row level security;
alter table buoy_reading     enable row level security;
alter table push_subscription enable row level security;
alter table follow           enable row level security;
