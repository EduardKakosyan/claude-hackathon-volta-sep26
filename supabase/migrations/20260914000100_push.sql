-- Is the Beach Open: follow a beach with Web Push.
-- A browser that follows a beach hands over its anonymous push subscription
-- (the endpoint the push service issued plus the two encryption keys) and the
-- beach id. Nothing identifying is stored. The hourly refresh reads the
-- followers of every beach whose state changed and sends one notification each.

-- One row per browser: the push service endpoint is the key.
create table if not exists push_subscription (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Which beaches a subscription follows. Deleting the subscription (an endpoint
-- the push service answered 404/410 for, or a last unfollow) takes its follows
-- with it.
create table if not exists follow (
  endpoint text references push_subscription on delete cascade,
  beach_id text references beaches(id),
  primary key (endpoint, beach_id)
);

create index if not exists follow_beach_id on follow (beach_id);
