-- Living Muslim: owner analytics. Run once in Supabase → SQL Editor.
-- Visits are anonymous: a random id from the browser, the page, where the person came from, country and city
-- from Vercel's edge, device type and language. No IP address, no cookies, no names.
-- Only emails listed in lm_admins can read the numbers (checked against the signed-in email session).

create table if not exists public.visits (
  day date not null default (now() at time zone 'utc')::date,
  vid text not null,
  page text not null,
  ref text not null default '',
  utm text not null default '',
  country text not null default '',
  city text not null default '',
  device text not null default '',
  lang text not null default '',
  hits int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (day, vid, page)
);
create index if not exists visits_vid on public.visits(vid, day);
alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;

create table if not exists public.lm_admins (email text primary key);
alter table public.lm_admins enable row level security;
revoke all on public.lm_admins from anon, authenticated;

-- One row per visitor, page and day; repeat visits only bump the counter.
create or replace function public.lm_hit(p_vid text, p_page text, p_ref text, p_utm text, p_country text, p_city text, p_device text, p_lang text)
returns void language sql volatile security definer set search_path = public as $$
  insert into visits(vid, page, ref, utm, country, city, device, lang)
  select left(p_vid, 40), left(p_page, 20), left(coalesce(p_ref, ''), 80), left(coalesce(p_utm, ''), 60),
         left(coalesce(p_country, ''), 2), left(coalesce(p_city, ''), 60), left(coalesce(p_device, ''), 10), left(coalesce(p_lang, ''), 5)
  where p_vid ~ '^[a-z0-9]{8,40}$' and p_page in ('landing', 'app', 'guide', 'privacy')
  on conflict (day, vid, page) do update set hits = visits.hits + 1, last_at = now();
$$;
revoke all on function public.lm_hit(text,text,text,text,text,text,text,text) from public;
grant execute on function public.lm_hit(text,text,text,text,text,text,text,text) to anon, authenticated;

create or replace function public._lm_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lm_admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public._lm_is_admin() from public, anon, authenticated;

create or replace function public.lm_is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select _lm_is_admin(); $$;
revoke all on function public.lm_is_admin() from public;
grant execute on function public.lm_is_admin() to authenticated;

-- Everything the owner screen shows, for the last p_days days (UTC). Each number is computed on its own,
-- so a missing table only empties that number; its error is returned under 'errors'.
create or replace function public._lm_safe(p_sql text, p_d0 date, inout p_err jsonb, p_key text, out val json)
language plpgsql volatile security definer set search_path = public, auth as $$
begin
  execute 'select to_json((' || p_sql || '))' into val using p_d0, (now() at time zone 'utc')::date;
exception when others then
  p_err := p_err || jsonb_build_object(p_key, sqlerrm); val := null;
end $$;
revoke all on function public._lm_safe(text, date, jsonb, text) from public, anon, authenticated;

drop function if exists public.lm_admin_stats(int);
create or replace function public.lm_admin_stats(p_days int) returns json
language plpgsql volatile security definer set search_path = public, auth as $$
declare d0 date := (now() at time zone 'utc')::date - greatest(1, least(coalesce(p_days, 30), 365)) + 1; err jsonb := '{}'; res jsonb := '{}'; r record; q text;
begin
  if not _lm_is_admin() then return null; end if;
  for r in select * from (values
    ('visitors_today', $q$(select count(distinct vid) from visits where day = $2)$q$),
    ('visitors', $q$(select count(distinct vid) from visits where day >= $1)$q$),
    ('visits', $q$(select coalesce(sum(hits), 0) from visits where day >= $1)$q$),
    ('new_visitors', $q$(select count(*) from (select vid from visits group by vid having min(day) >= $1) x)$q$),
    ('returning', $q$(select count(*) from (select vid from visits where day >= $1 group by vid having count(distinct day) > 1) x)$q$),
    ('app_users', $q$(select count(distinct vid) from visits where day >= $1 and page = 'app')$q$),
    ('series', $q$(select coalesce(json_agg(json_build_object('d', g.d, 'v', coalesce(v.n, 0), 'a', coalesce(v.a, 0), 's', coalesce(s.n, 0)) order by g.d), '[]')
               from (select t::date d from generate_series($1::timestamp, $2::timestamp, interval '1 day') t) g
               left join (select day, count(distinct vid) n, count(distinct vid) filter (where page = 'app') a from visits where day >= $1 group by day) v on v.day = g.d
               left join (select created::date d, count(*) n from signups where created::date >= $1 group by 1) s on s.d = g.d)$q$),
    ('refs', $q$(select coalesce(json_agg(x), '[]') from (select coalesce(nullif(ref, ''), 'direct') k, count(distinct vid) n from visits where day >= $1 group by 1 order by 2 desc limit 15) x)$q$),
    ('utm', $q$(select coalesce(json_agg(x), '[]') from (select utm k, count(distinct vid) n from visits where day >= $1 and utm <> '' group by 1 order by 2 desc limit 10) x)$q$),
    ('countries', $q$(select coalesce(json_agg(x), '[]') from (select coalesce(nullif(country, ''), '?') k, count(distinct vid) n from visits where day >= $1 group by 1 order by 2 desc limit 20) x)$q$),
    ('cities', $q$(select coalesce(json_agg(x), '[]') from (select city || ', ' || country k, count(distinct vid) n from visits where day >= $1 and city <> '' group by 1 order by 2 desc limit 15) x)$q$),
    ('devices', $q$(select coalesce(json_agg(x), '[]') from (select coalesce(nullif(device, ''), '?') k, count(distinct vid) n from visits where day >= $1 group by 1 order by 2 desc) x)$q$),
    ('langs', $q$(select coalesce(json_agg(x), '[]') from (select coalesce(nullif(lang, ''), '?') k, count(distinct vid) n from visits where day >= $1 group by 1 order by 2 desc limit 8) x)$q$),
    ('pages', $q$(select coalesce(json_agg(x), '[]') from (select page k, count(distinct vid) n from visits where day >= $1 group by 1 order by 2 desc) x)$q$),
    ('signups_total', $q$(select count(*) from signups)$q$),
    ('signups', $q$(select count(*) from signups where created::date >= $1)$q$),
    ('accounts_total', $q$(select count(*) from auth.users)$q$),
    ('accounts', $q$(select count(*) from auth.users where created_at::date >= $1)$q$),
    ('profiles_total', $q$(select count(*) from users)$q$),
    ('profiles', $q$(select count(*) from users where created::date >= $1)$q$),
    ('nicks', $q$(select count(*) from users where nick is not null and nick <> '')$q$),
    ('circles', $q$(select count(*) from circles)$q$),
    ('circles_real', $q$(select count(*) from (select code from members group by code having count(*) >= 2) x)$q$),
    ('members', $q$(select count(*) from members)$q$),
    ('active_circle_people', $q$(select count(distinct key) from docs where updated >= now() - interval '7 days')$q$),
    ('push', $q$(select count(*) from push_subs)$q$),
    ('recent', $q$(select coalesce(json_agg(x), '[]') from (select name, email, lang, source, created from signups order by created desc limit 30) x)$q$)
  ) as t(k, q) loop
    select p.p_err, p.val into err, q from _lm_safe(r.q, d0, err, r.k) p;
    res := res || jsonb_build_object(r.k, q::jsonb);
  end loop;
  return (res || jsonb_build_object('from', d0, 'errors', err))::json;
end $$;
revoke all on function public.lm_admin_stats(int) from public;
grant execute on function public.lm_admin_stats(int) to authenticated;

-- The owner. Use the email you sign in with in the app (Profile → Account).
insert into public.lm_admins(email) values (lower('OWNER_EMAIL')) on conflict do nothing;
