-- Living Muslim: «Путь» in a person's profile (prayers, habits, studies, good deeds, goals) and
-- message requests with a topic. Run once in Supabase → SQL Editor after intents.sql. Safe to run again.
--
-- The phone keeps the real data. It sends a short summary (only good things: on-time share, days in a row,
-- what is studied, counts for the month). Each block has its own «кто видит»: all, circles or nobody.

alter table public.users add column if not exists path jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists path_vis jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists path_at timestamptz;
alter table public.users add column if not exists ask_from text not null default 'all';

-- message requests: topics, a push mark and complaints
alter table public.person_asks drop constraint if exists person_asks_kind_check;
alter table public.person_asks add constraint person_asks_kind_check
  check (kind in ('hi', 'umrah', 'job', 'biz', 'study', 'meet', 'question', 'learn', 'dua', 'other'));
alter table public.person_asks add column if not exists pushed boolean not null default true;
alter table public.person_asks alter column pushed set default false;
alter table public.person_asks add column if not exists reported boolean not null default false;
alter table public.person_asks add column if not exists answered timestamptz;

-- who sees block k of u: 'all', 'circles' or 'none'. Defaults: studies for all, goals for nobody,
-- the rest for circles; a sister's blocks default to nobody.
create or replace function public._lm_path_vis(u users, k text) returns text
language sql stable as $$
  select case when u.path_vis->>k in ('all', 'circles', 'none') then u.path_vis->>k
    when coalesce(u.gender, '') = 'f' then 'none'
    when k = 'study' then 'all'
    when k = 'goals' then 'none'
    else 'circles' end;
$$;

-- my summary, from my phone (at most ~8 KB)
create or replace function public.lm_path_set(p_uid uuid, p_token text, p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  if p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 8000 then return false; end if;
  update users set path = p, path_at = now() where uid = p_uid;
  return true;
end $$;

-- who sees what, and who may ask to write to me
create or replace function public.lm_path_mine(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare u users;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into u from users where uid = p_uid;
  return json_build_object('vis', json_build_object('prayer', _lm_path_vis(u, 'prayer'), 'habits', _lm_path_vis(u, 'habits'),
      'study', _lm_path_vis(u, 'study'), 'deeds', _lm_path_vis(u, 'deeds'), 'goals', _lm_path_vis(u, 'goals')),
    'ask_from', u.ask_from, 'sisters_only', u.sisters_only, 'gender', u.gender);
end $$;

create or replace function public.lm_path_vis_set(p_uid uuid, p_token text, p_vis jsonb, p_ask_from text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v jsonb := '{}'::jsonb; k text;
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  select path_vis into v from users where uid = p_uid;
  if p_vis is not null then
    foreach k in array array['prayer', 'habits', 'study', 'deeds', 'goals'] loop
      if p_vis->>k in ('all', 'circles', 'none') then v := v || jsonb_build_object(k, p_vis->>k); end if;
    end loop;
  end if;
  update users set path_vis = v,
    ask_from = case when p_ask_from in ('all', 'circles', 'none') then p_ask_from else ask_from end
  where uid = p_uid;
  return true;
end $$;

-- the «Путь» of p_other as I may see it (same rules as lm_person for opening the profile)
create or replace function public.lm_path(p_uid uuid, p_token text, p_other uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare u users; me users; sh int; o jsonb := '{}'::jsonb; k text; v text;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into u from users where uid = p_other;
  select * into me from users where uid = p_uid;
  if u.uid is null or _lm_blocked(p_uid, p_other) then return null; end if;
  sh := cardinality(_lm_shared(p_uid, p_other));
  if p_other <> p_uid and sh = 0 and (not u.findable or u.nick is null) then return null; end if;
  if p_other <> p_uid and u.sisters_only and me.gender <> 'f' and sh = 0 then return null; end if;
  foreach k in array array['prayer', 'habits', 'study', 'deeds', 'goals'] loop
    v := _lm_path_vis(u, k);
    if u.path ? k and (p_other = p_uid or v = 'all' or (v = 'circles' and sh > 0)) then o := o || jsonb_build_object(k, u.path->k); end if;
  end loop;
  return json_build_object('path', o, 'at', u.path_at);
end $$;

-- may a send a message request of kind k to b? 'ok' or why not
create or replace function public._lm_can_ask(a uuid, b uuid, k text) returns text
language plpgsql stable security definer set search_path = public as $$
declare ua users; ub users; sh int;
begin
  if a = b then return 'self'; end if;
  if _lm_blocked(a, b) then return 'closed'; end if;
  select * into ua from users where uid = a;
  select * into ub from users where uid = b;
  if ub.uid is null then return 'closed'; end if;
  sh := cardinality(_lm_shared(a, b));
  -- sisters: no requests from brothers at all (nikah goes through the wali)
  if ub.gender = 'f' and ua.gender <> 'f' then return 'sister'; end if;
  if ub.sisters_only and ua.gender <> 'f' then return 'sister'; end if;
  -- a brother gets requests from sisters only about work or business
  if ua.gender = 'f' and ub.gender = 'm' and k not in ('job', 'biz') then return 'closed'; end if;
  -- about something they published in «Сейчас ищу»: allowed when I can see it
  if k in ('umrah', 'job', 'biz', 'study') and exists (select 1 from intents i where i.uid = b and i.kind = k and _lm_in_sees(a, i)) then return 'ok'; end if;
  if exists (select 1 from person_asks where from_uid = a and to_uid = b and status = 'no' and coalesce(answered, created) > now() - interval '30 days') then return 'later'; end if;
  if ub.ask_from = 'none' or ub.invite_from = 'none' then return 'closed'; end if;
  if ub.ask_from = 'circles' and sh = 0 then return 'circles'; end if;
  return 'ok';
end $$;
revoke all on function public._lm_can_ask(uuid, uuid, text) from public, anon, authenticated;

-- a message request: a topic and at least 10 characters; 5 a day
create or replace function public.lm_ask(p_uid uuid, p_token text, p_to uuid, p_kind text, p_note text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare why text; n text := left(trim(coalesce(p_note, '')), 300);
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if p_kind not in ('hi', 'umrah', 'job', 'biz', 'study', 'meet', 'question', 'learn', 'dua', 'other') then return 'kind'; end if;
  if length(n) < 10 then return 'short'; end if;
  why := _lm_can_ask(p_uid, p_to, p_kind);
  if why <> 'ok' then return why; end if;
  if exists (select 1 from person_asks where from_uid = p_uid and to_uid = p_to and status = 'new') then return 'already'; end if;
  if (select count(*) from person_asks where from_uid = p_uid and created > now() - interval '1 day') >= 5 then return 'slow'; end if;
  insert into person_asks(from_uid, to_uid, kind, note) values (p_uid, p_to, p_kind, n);
  return 'ok';
end $$;

-- requests to me with what helps to decide: a shared circle and how long they are with us
create or replace function public.lm_asks(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return json_build_object(
    'in', coalesce((select json_agg(json_build_object('id', a.id, 'kind', a.kind, 'note', a.note, 'created', a.created,
        'from', json_build_object('uid', f.uid, 'name', f.name, 'nick', f.nick, 'color', f.color, 'avatar', f.avatar, 'city', f.city, 'since', f.created,
          'shared', to_json(_lm_shared(p_uid, f.uid)),
          'photo', case when f.show_photo and cardinality(_lm_shared(p_uid, f.uid)) > 0 then f.photo else '' end)) order by a.created desc)
      from person_asks a join users f on f.uid = a.from_uid
      where a.to_uid = p_uid and a.status = 'new' and not _lm_blocked(p_uid, a.from_uid)), '[]'::json),
    'out', coalesce((select json_agg(json_build_object('code', a.code, 'title', t.name))
      from person_asks a join users t on t.uid = a.to_uid
      where a.from_uid = p_uid and a.status = 'yes' and a.code <> '' and a.created > now() - interval '30 days'
        and exists (select 1 from members m where m.code = a.code and m.uid = p_uid)), '[]'::json));
end $$;

-- «Не сейчас» remembers when, so the same person can ask again only after 30 days
create or replace function public._lm_ask_answered() returns trigger
language plpgsql as $$
begin
  if new.status <> old.status and new.status in ('yes', 'no') then new.answered := now(); end if;
  return new;
end $$;
drop trigger if exists lm_ask_answered on public.person_asks;
create trigger lm_ask_answered before update on public.person_asks for each row execute function public._lm_ask_answered();

-- a complaint: the request is closed, the sender is blocked, the owner can look at it later
create or replace function public.lm_ask_report(p_uid uuid, p_token text, p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare a person_asks;
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  select * into a from person_asks where id = p_id and to_uid = p_uid;
  if a.id is null then return false; end if;
  update person_asks set status = 'no', reported = true where id = p_id;
  insert into blocks(uid, other) values (p_uid, a.from_uid) on conflict do nothing;
  return true;
end $$;

-- for the push job (api/push-tick.js): new requests, once each
create or replace function public.lm_ask_push(p_secret text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare out json;
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  select coalesce(json_agg(json_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'prefs', s.prefs,
      'who', split_part(f.name, ' ', 1), 'kind', a.kind)), '[]'::json) into out
  from person_asks a join users f on f.uid = a.from_uid join push_subs s on s.uid = a.to_uid
  where a.status = 'new' and not a.pushed and a.created > now() - interval '1 day' and not _lm_blocked(a.to_uid, a.from_uid);
  update person_asks set pushed = true where not pushed;
  return out;
end $$;

revoke all on function public.lm_path_set(uuid, text, jsonb), public.lm_path_mine(uuid, text), public.lm_path_vis_set(uuid, text, jsonb, text),
  public.lm_path(uuid, text, uuid), public.lm_ask_report(uuid, text, uuid), public.lm_ask_push(text) from public;
grant execute on function public.lm_path_set(uuid, text, jsonb), public.lm_path_mine(uuid, text), public.lm_path_vis_set(uuid, text, jsonb, text),
  public.lm_path(uuid, text, uuid), public.lm_ask_report(uuid, text, uuid), public.lm_ask_push(text),
  public.lm_ask(uuid, text, uuid, text, text), public.lm_asks(uuid, text) to anon, authenticated;
