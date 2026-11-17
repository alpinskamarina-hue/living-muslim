-- Prayer reminders (Web Push). Run once in Supabase → SQL Editor.
-- The secret below must match PUSH_SECRET in Vercel; it is set in the private copy of this file only.

create table if not exists push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  sent jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table push_subs enable row level security;

create table if not exists lm_config (key text primary key, val text not null);
alter table lm_config enable row level security;

create or replace function lm_push_save(p_endpoint text, p_p256dh text, p_auth text, p_prefs jsonb)
returns void language sql security definer set search_path = public as $$
  insert into push_subs (endpoint, p256dh, auth, prefs) values (p_endpoint, p_p256dh, p_auth, p_prefs)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs, updated_at = now();
$$;

create or replace function lm_push_delete(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint;
$$;

create or replace function lm_push_list(p_secret text)
returns setof push_subs language sql security definer set search_path = public as $$
  select * from push_subs where p_secret = (select val from lm_config where key = 'push_secret');
$$;

create or replace function lm_push_mark(p_secret text, p_endpoint text, p_sent jsonb)
returns void language sql security definer set search_path = public as $$
  update push_subs set sent = p_sent
  where endpoint = p_endpoint and p_secret = (select val from lm_config where key = 'push_secret');
$$;

revoke all on function lm_push_list(text) from public;
grant execute on function lm_push_save(text, text, text, jsonb), lm_push_delete(text), lm_push_list(text), lm_push_mark(text, text, jsonb) to anon;

insert into lm_config (key, val) values ('push_secret', '__PUSH_SECRET__')
on conflict (key) do update set val = excluded.val;

-- Once a minute, ask the site to send due reminders.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('lm-push') where exists (select 1 from cron.job where jobname = 'lm-push');
select cron.schedule('lm-push', '* * * * *', $$
  select net.http_post(
    url := 'https://living-muslim.vercel.app/api/push-tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', '__PUSH_SECRET__'),
    body := '{}'::jsonb
  );
$$);
