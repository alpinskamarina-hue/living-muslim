-- Living Muslim: section analytics for the owner («Для владельца» → «Разделы»). Run once in Supabase → SQL Editor,
-- after admin.sql (it uses lm_admins, _lm_is_admin and _lm_safe from there).
-- The app counts which section was opened and a few main actions inside it, per random device id (the same lm.vid
-- as the visit counter). No names, emails, texts or amounts. «Мой цикл» is never sent.

create table if not exists public.usage (
  day date not null default (now() at time zone 'utc')::date,
  vid text not null,
  sec text not null,
  act text not null default 'open',
  n int not null default 1,
  primary key (day, vid, sec, act)
);
create index if not exists usage_sec on public.usage (sec, day);
create index if not exists usage_vid on public.usage (vid, day);
alter table public.usage enable row level security;
revoke all on public.usage from anon, authenticated;

-- Batch ids already counted: a phone sends a cut-off batch again on its next visit, and it is counted once.
create table if not exists public.usage_batches (id text primary key, at timestamptz not null default now());
create index if not exists usage_batches_at on public.usage_batches (at);
alter table public.usage_batches enable row level security;
revoke all on public.usage_batches from anon, authenticated;

-- A batch from one device: [{d: day, s: section, a: action, n: count}], at most 60 items, days from 2 days ago to today.
drop function if exists public.lm_use(text, jsonb);
create or replace function public.lm_use(p_vid text, p_items jsonb, p_bid text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare today date := (now() at time zone 'utc')::date; rows int;
begin
  if p_vid !~ '^[a-z0-9]{8,40}$' or jsonb_typeof(p_items) <> 'array' then return; end if;
  if p_bid is not null then
    if p_bid !~ '^[a-z0-9]{6,40}$' then return; end if;
    insert into usage_batches(id) values (p_vid || ':' || p_bid) on conflict do nothing;
    if not found then return; end if;
    if random() < 0.02 then delete from usage_batches where at < now() - interval '7 days'; end if;
  end if;
  -- One device cannot fill the table: at most 300 rows a day.
  select count(*) into rows from usage where day = today and vid = p_vid;
  if rows >= 300 then return; end if;
  insert into usage(day, vid, sec, act, n)
  select x.d, p_vid, x.s, x.a, least(greatest(x.n, 1), 5000)
  from (
    select (e ->> 'd')::date d, e ->> 's' s, e ->> 'a' a, (e ->> 'n')::int n
    from jsonb_array_elements(p_items) with ordinality t(e, i)
    where i <= 60 and (e ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$' and (e ->> 's') ~ '^[a-z0-9_:-]{1,48}$'
      and (e ->> 'a') ~ '^[A-Za-z0-9_:.-]{1,60}$' and (e ->> 'n') ~ '^\d{1,6}$' and e ->> 's' not in ('cycle', 'period')
  ) x
  where x.d between today - 2 and today
  on conflict (day, vid, sec, act) do update set n = least(usage.n + excluded.n, 100000);
end $$;
revoke all on function public.lm_use(text, jsonb, text) from public;
grant execute on function public.lm_use(text, jsonb, text) to anon, authenticated;

-- Everything the «Разделы» screen shows for the last p_days days (UTC), with the same length before it for trends.
create or replace function public.lm_admin_sections(p_days int) returns json
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  nd int := greatest(1, least(coalesce(p_days, 30), 365));
  d0 date := (now() at time zone 'utc')::date - nd + 1;
  err jsonb := '{}'; res jsonb := '{}'; r record; q text;
begin
  if not _lm_is_admin() then return null; end if;
  -- $1 = first day of the period, $2 = today. The previous period is $1 - (($2 - $1) + 1) .. $1 - 1.
  for r in select * from (values
    ('active_today', $q$(select count(distinct vid) from (select vid from visits where day = $2 and page = 'app' union select vid from usage where day = $2) a)$q$),
    ('active', $q$(select count(distinct vid) from (select vid from visits where day >= $1 and page = 'app' union select vid from usage where day >= $1) a)$q$),
    ('active_prev', $q$(select count(distinct vid) from (select vid from visits where day between $1 - ($2 - $1 + 1) and $1 - 1 and page = 'app' union select vid from usage where day between $1 - ($2 - $1 + 1) and $1 - 1) a)$q$),
    ('today_prev', $q$(select count(distinct vid) from (select vid from visits where day = $2 - 1 and page = 'app' union select vid from usage where day = $2 - 1) a)$q$),
    ('wau', $q$(select count(distinct vid) from (select vid from visits where day > $2 - 7 and page = 'app' union select vid from usage where day > $2 - 7) a)$q$),
    ('mau', $q$(select count(distinct vid) from (select vid from visits where day > $2 - 30 and page = 'app' union select vid from usage where day > $2 - 30) a)$q$),
    ('dau_avg', $q$(select coalesce(round(avg(n), 1), 0) from (select day, count(distinct vid) n from (select day, vid from visits where day > $2 - 30 and page = 'app' union select day, vid from usage where day > $2 - 30) a group by day) x)$q$),
    ('series', $q$(select coalesce(json_agg(json_build_object('d', g.d, 'v', coalesce(a.n, 0)) order by g.d), '[]')
       from (select t::date d from generate_series($1::timestamp, $2::timestamp, interval '1 day') t) g
       left join (select day, count(distinct vid) n from (select day, vid from visits where day >= $1 and page = 'app' union select day, vid from usage where day >= $1) x group by day) a on a.day = g.d)$q$),
    -- Of the devices whose first day in the app was at least N days ago (last 120 days), how many came back on day N or later.
    ('retention', $q$(with act as (select day, vid from visits where page = 'app' and day > $2 - 150 union select day, vid from usage where day > $2 - 150),
         f as (select vid, min(day) fd from act group by vid having min(day) > $2 - 120)
       select json_agg(json_build_object('n', k, 'base', (select count(*) from f where fd <= $2 - k),
         'back', (select count(*) from f where fd <= $2 - k and exists (select 1 from act a where a.vid = f.vid and a.day >= f.fd + k))) order by k)
       from unnest(array[1, 7, 14, 30]) k)$q$),
    ('funnel', $q$(select json_build_object(
         'landing', (select count(distinct vid) from visits where day >= $1 and page = 'landing'),
         'app', (select count(distinct vid) from (select vid from visits where day >= $1 and page = 'app' union select vid from usage where day >= $1) a),
         'account', (select count(*) from auth.users where created_at::date >= $1),
         'circle', (select count(*) from users u where u.created::date >= $1 and exists (select 1 from members m where m.uid = u.uid)),
         'back7', (select count(*) from (select vid, min(day) f from (select day, vid from visits where page = 'app' union select day, vid from usage) a group by vid) x
                   where x.f >= $1 and exists (select 1 from usage u where u.vid = x.vid and u.day >= x.f + 7 union all select 1 from visits v where v.vid = x.vid and v.page = 'app' and v.day >= x.f + 7))))$q$),
    -- Every section: people, people in the previous period, opens, days per person, how many came only one day,
    -- and how many did something inside (not only opened).
    ('sections', $q$(select coalesce(json_agg(x order by x.u desc), '[]') from (
       select s.sec k, count(distinct s.vid) filter (where s.day >= $1) u,
              count(distinct s.vid) filter (where s.day < $1) p,
              coalesce(sum(s.n) filter (where s.day >= $1 and s.act = 'open'), 0) o,
              (select round(avg(c), 1) from (select count(distinct day) c from usage z where z.sec = s.sec and z.day >= $1 group by vid) y) dpp,
              (select count(*) from (select vid from usage z where z.sec = s.sec and z.day >= $1 group by vid having count(distinct day) = 1) y) one,
              count(distinct s.vid) filter (where s.day >= $1 and s.act <> 'open' and s.act not like 'via:%') did
       from usage s where s.day >= $1 - ($2 - $1 + 1) group by s.sec) x where x.u > 0 or x.p > 0)$q$),
    -- Courses: started, half way, finished per course id (from the phones), with marks and stars from the server.
    ('courses', $q$(select coalesce(json_agg(x order by x.st desc), '[]') from (
       select c k,
              count(distinct vid) filter (where a = 'start') st,
              count(distinct vid) filter (where a = 'half') hf,
              count(distinct vid) filter (where a = 'done') dn,
              coalesce(sum(n) filter (where a = 'lesson'), 0) ls
       from (select vid, n, split_part(act, ':', 1) a, substr(act, length(split_part(act, ':', 1)) + 2) c from usage where sec = 'videos' and day >= $1 and act ~ '^(start|half|done|lesson):') z
       group by c) x)$q$),
    ('course_marks', $q$(select coalesce(json_agg(x), '[]') from (select course k, count(*) filter (where done_at::date >= $1) dn, count(*) dn_all,
       round(avg(stars) filter (where not hidden), 1) avg, count(stars) filter (where not hidden) nr from lm_course_marks group by course) x)$q$),
    ('acts', $q$(select coalesce(json_agg(x), '[]') from (select sec || '|' || act k, count(distinct vid) u, sum(n) n from usage
       where day >= $1 and sec in ('books', 'tests', 'test-salah', 'test-umrah', 'quran', 'azkar', 'today') and act not like 'via:%' group by 1) x)$q$),
    -- Server-side sections with history: count in the period, people, count in the previous period.
    ('srv_chat', $q$(select json_build_object('n', count(*) filter (where created::date >= $1), 'u', count(distinct uid) filter (where created::date >= $1), 'p', count(*) filter (where created::date < $1))
       from chat_msgs where created::date >= $1 - ($2 - $1 + 1) and kind <> 'event' and code not in (select code from dms))$q$),
    ('srv_dm', $q$(select json_build_object('n', count(*) filter (where created::date >= $1), 'u', count(distinct uid) filter (where created::date >= $1), 'p', count(*) filter (where created::date < $1))
       from chat_msgs where created::date >= $1 - ($2 - $1 + 1) and code in (select code from dms))$q$),
    ('srv_stories', $q$(select json_build_object('n', count(*) filter (where created::date >= $1), 'u', count(distinct uid) filter (where created::date >= $1), 'p', count(*) filter (where created::date < $1))
       from stories where created::date >= $1 - ($2 - $1 + 1))$q$),
    ('srv_posts', $q$(select json_build_object('n', count(*) filter (where created::date >= $1), 'u', count(distinct uid) filter (where created::date >= $1), 'p', count(*) filter (where created::date < $1))
       from circle_posts where created::date >= $1 - ($2 - $1 + 1) and uid is not null)$q$),
    ('srv_nikah', $q$(select json_build_object('n', count(*) filter (where created::date >= $1), 'u', count(*), 'p', count(*) filter (where created::date between $1 - ($2 - $1 + 1) and $1 - 1)) from nikah_profiles)$q$),
    ('srv_ai', $q$(select json_build_object('n', coalesce(sum(n) filter (where day >= $1), 0), 'u', count(distinct user_id) filter (where day >= $1), 'p', coalesce(sum(n) filter (where day < $1), 0))
       from lm_ai_usage where day >= $1 - ($2 - $1 + 1))$q$),
    ('srv_courses', $q$(select json_build_object('n', count(*) filter (where done_at::date >= $1), 'u', count(*), 'p', count(*) filter (where done_at::date between $1 - ($2 - $1 + 1) and $1 - 1)) from lm_course_marks)$q$),
    ('srv_umrah', $q$(select json_build_object('n', count(*) filter (where created::date >= $1), 'u', count(distinct uid) filter (where created::date >= $1), 'p', count(*) filter (where created::date < $1))
       from umrah_asks where created::date >= $1 - ($2 - $1 + 1))$q$),
    ('srv_dua', $q$(select json_build_object('n', count(*) filter (where created::date >= $1), 'u', count(distinct uid) filter (where created::date >= $1), 'p', count(*) filter (where created::date < $1))
       from common_dua where created::date >= $1 - ($2 - $1 + 1))$q$),
    ('since', $q$(select min(day) from usage)$q$)
  ) as t(k, q) loop
    select p.p_err, p.val into err, q from _lm_safe(r.q, d0, err, r.k) p;
    res := res || jsonb_build_object(r.k, q::jsonb);
  end loop;
  return (res || jsonb_build_object('from', d0, 'days', nd, 'errors', err))::json;
end $$;
revoke all on function public.lm_admin_sections(int) from public;
grant execute on function public.lm_admin_sections(int) to authenticated;

-- One section in detail: people per day, actions inside, where people came from, their app language and device.
create or replace function public.lm_admin_section(p_sec text, p_days int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  nd int := greatest(1, least(coalesce(p_days, 30), 365));
  d0 date := (now() at time zone 'utc')::date - nd + 1;
  d1 date := (now() at time zone 'utc')::date;
begin
  if not _lm_is_admin() then return null; end if;
  if p_sec !~ '^[a-z0-9_:-]{1,48}$' then return null; end if;
  return json_build_object(
    'from', d0,
    'users', (select count(distinct vid) from usage where sec = p_sec and day >= d0),
    'active', (select count(distinct vid) from (select vid from visits where day >= d0 and page = 'app' union select vid from usage where day >= d0) a),
    'dpp', (select round(avg(c), 1) from (select count(distinct day) c from usage where sec = p_sec and day >= d0 group by vid) y),
    'series', (select coalesce(json_agg(json_build_object('d', g.d, 'v', coalesce(a.n, 0)) order by g.d), '[]')
       from (select t::date d from generate_series(d0::timestamp, d1::timestamp, interval '1 day') t) g
       left join (select day, count(distinct vid) n from usage where sec = p_sec and day >= d0 group by day) a on a.day = g.d),
    'acts', (select coalesce(json_agg(x order by x.u desc, x.n desc), '[]') from (
       select act k, count(distinct vid) u, sum(n) n from usage where sec = p_sec and day >= d0 and act not like 'via:%' and act !~ '^(start|half|done):' group by act) x),
    'via', (select coalesce(json_agg(x order by x.n desc), '[]') from (
       select substr(act, 5) k, sum(n) n from usage where sec = p_sec and day >= d0 and act like 'via:%' group by act order by 2 desc limit 8) x),
    'langs', (select coalesce(json_agg(x order by x.n desc), '[]') from (
       select coalesce(nullif(l.lang, ''), '?') k, count(*) n from (select distinct vid from usage where sec = p_sec and day >= d0) s
       left join lateral (select lang from visits v where v.vid = s.vid order by day desc limit 1) l on true group by 1) x),
    'devices', (select coalesce(json_agg(x order by x.n desc), '[]') from (
       select coalesce(nullif(l.device, ''), '?') k, count(*) n from (select distinct vid from usage where sec = p_sec and day >= d0) s
       left join lateral (select device from visits v where v.vid = s.vid order by day desc limit 1) l on true group by 1) x)
  );
end $$;
revoke all on function public.lm_admin_section(text, int) from public;
grant execute on function public.lm_admin_section(text, int) to authenticated;
