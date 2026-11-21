-- Living Muslim: a person's profile others can open, «Сейчас ищу» (umrah, nikah, job, business, study),
-- «Кто что ищет» across my circles, and asks to get in touch (accepting opens a private chat of two).
-- Run once in Supabase SQL Editor after nicks.sql, chat.sql and nikah.sql. Safe to run again.

alter table public.users add column if not exists city text not null default '';

create table if not exists public.intents (
  uid uuid not null references public.users(uid) on delete cascade,
  kind text not null check (kind in ('umrah', 'nikah', 'job', 'biz', 'study')),
  mode text not null default '' check (length(mode) <= 20),
  title text not null default '' check (length(title) <= 80),
  note text not null default '' check (length(note) <= 140),
  vis text not null default 'circles' check (vis in ('circles', 'all')),
  updated timestamptz not null default now(),
  until date not null default (current_date + 60),
  primary key (uid, kind)
);
create index if not exists intents_updated on public.intents (updated desc);

create table if not exists public.person_asks (
  id uuid primary key default gen_random_uuid(),
  from_uid uuid not null references public.users(uid) on delete cascade,
  to_uid uuid not null references public.users(uid) on delete cascade,
  kind text not null default 'hi' check (kind in ('hi', 'umrah', 'job', 'biz', 'study')),
  note text not null default '' check (length(note) <= 300),
  status text not null default 'new' check (status in ('new', 'yes', 'no')),
  code text not null default '',
  created timestamptz not null default now()
);
create unique index if not exists person_asks_open on public.person_asks (from_uid, to_uid) where status = 'new';
create index if not exists person_asks_to on public.person_asks (to_uid, status);

alter table public.intents enable row level security;
alter table public.person_asks enable row level security;
revoke all on public.intents, public.person_asks from anon, authenticated;

-- can v see o's intent row i?
create or replace function public._lm_in_sees(v uuid, i intents) returns boolean
language sql stable security definer set search_path = public as $$
  select v <> i.uid and i.until >= current_date and not _lm_blocked(v, i.uid)
    and case
      when i.kind = 'nikah' then _lm_nk_sees(v, i.uid)
      when i.vis = 'all' then true
      else cardinality(_lm_shared(v, i.uid)) > 0
    end;
$$;
revoke all on function public._lm_in_sees(uuid, intents) from public, anon, authenticated;

-- may a send an ask of kind k to b? 'ok' or why not
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
  -- sisters: no asks from brothers at all (nikah goes through the wali)
  if ub.gender = 'f' and ua.gender <> 'f' then return 'sister'; end if;
  if ub.sisters_only and ua.gender <> 'f' then return 'sister'; end if;
  -- a brother gets asks from sisters only about work or business he published
  if ua.gender = 'f' and ub.gender = 'm' and k not in ('job', 'biz') then return 'closed'; end if;
  if k = 'hi' then
    if ub.invite_from = 'none' then return 'closed'; end if;
    if sh = 0 then return 'circles'; end if;
    return 'ok';
  end if;
  if not exists (select 1 from intents i where i.uid = b and i.kind = k and _lm_in_sees(a, i)) then return 'closed'; end if;
  return 'ok';
end $$;
revoke all on function public._lm_can_ask(uuid, uuid, text) from public, anon, authenticated;

create or replace function public._lm_in_json(i intents) returns json
language sql stable as $$
  select json_build_object('kind', i.kind, 'mode', i.mode, 'title', i.title, 'note', i.note, 'vis', i.vis, 'updated', i.updated, 'until', i.until);
$$;

-- my own intents (expired ones too, so I can renew them) and my city
create or replace function public.lm_intents_mine(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return json_build_object('city', (select city from users where uid = p_uid),
    'list', coalesce((select json_agg(_lm_in_json(i) order by i.kind) from intents i where i.uid = p_uid), '[]'::json));
end $$;

-- p: {mode, title, note, vis} saves (and renews for 60 days); null removes
create or replace function public.lm_intent_set(p_uid uuid, p_token text, p_kind text, p jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if p_kind not in ('umrah', 'nikah', 'job', 'biz', 'study') then return 'kind'; end if;
  if p is null then delete from intents where uid = p_uid and kind = p_kind; return 'ok'; end if;
  insert into intents(uid, kind, mode, title, note, vis, updated, until)
  values (p_uid, p_kind, left(coalesce(p->>'mode', ''), 20), left(trim(coalesce(p->>'title', '')), 80), left(trim(coalesce(p->>'note', '')), 140),
    case when p->>'vis' = 'all' and p_kind <> 'nikah' then 'all' else 'circles' end, now(), current_date + 60)
  on conflict (uid, kind) do update set mode = excluded.mode, title = excluded.title, note = excluded.note, vis = excluded.vis,
    updated = now(), until = current_date + 60;
  return 'ok';
end $$;

create or replace function public.lm_city_set(p_uid uuid, p_token text, p_city text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update users set city = left(trim(coalesce(p_city, '')), 40) where uid = p_uid;
  return true;
end $$;

-- the profile of another person, as I may see it
create or replace function public.lm_person(p_uid uuid, p_token text, p_other uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare u users; me users; sh text[];
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into u from users where uid = p_other;
  select * into me from users where uid = p_uid;
  if u.uid is null or _lm_blocked(p_uid, p_other) then return null; end if;
  sh := _lm_shared(p_uid, p_other);
  if p_other <> p_uid and cardinality(sh) = 0 and (not u.findable or u.nick is null) then return null; end if;
  if p_other <> p_uid and u.sisters_only and me.gender <> 'f' and cardinality(sh) = 0 then return null; end if;
  return json_build_object('uid', u.uid, 'name', u.name, 'nick', u.nick, 'bio', u.bio, 'avatar', u.avatar, 'color', u.color,
    'gender', u.gender, 'city', u.city, 'since', u.created,
    'photo', case when u.show_photo and (cardinality(sh) > 0 or p_other = p_uid) then u.photo else '' end,
    'shared', to_json(sh),
    'intents', coalesce((select json_agg(_lm_in_json(i) order by i.updated desc) from intents i where i.uid = p_other
      and (p_other = p_uid or _lm_in_sees(p_uid, i))), '[]'::json),
    'can', json_build_object('hi', _lm_can_ask(p_uid, p_other, 'hi'), 'umrah', _lm_can_ask(p_uid, p_other, 'umrah'),
      'job', _lm_can_ask(p_uid, p_other, 'job'), 'biz', _lm_can_ask(p_uid, p_other, 'biz'), 'study', _lm_can_ask(p_uid, p_other, 'study')),
    'asked', exists (select 1 from person_asks where from_uid = p_uid and to_uid = p_other and status = 'new'),
    'chat', (select a.code from person_asks a where a.status = 'yes' and a.code <> ''
      and ((a.from_uid = p_uid and a.to_uid = p_other) or (a.from_uid = p_other and a.to_uid = p_uid))
      and exists (select 1 from members m where m.code = a.code and m.uid = p_uid) order by a.created desc limit 1));
end $$;

-- «Кто что ищет»: what people in my circles (and open ones I may see) are looking for now
create or replace function public.lm_intents_feed(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  return coalesce((select json_agg(x order by (x->>'updated') desc) from (
    select json_build_object('uid', u.uid, 'name', u.name, 'nick', u.nick, 'color', u.color, 'avatar', u.avatar, 'gender', u.gender, 'city', u.city,
      'photo', case when u.show_photo then u.photo else '' end,
      'code', (_lm_shared(p_uid, u.uid))[1], 'kind', i.kind, 'mode', i.mode, 'title', i.title, 'note', i.note, 'updated', i.updated) x
    from intents i join users u on u.uid = i.uid
    where i.uid <> p_uid and cardinality(_lm_shared(p_uid, i.uid)) > 0 and _lm_in_sees(p_uid, i)
    order by i.updated desc limit 100) s), '[]'::json);
end $$;

-- ask to get in touch: kind 'hi' (Написать) or about one of their intents
create or replace function public.lm_ask(p_uid uuid, p_token text, p_to uuid, p_kind text, p_note text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare why text;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if p_kind not in ('hi', 'umrah', 'job', 'biz', 'study') then return 'kind'; end if;
  why := _lm_can_ask(p_uid, p_to, p_kind);
  if why <> 'ok' then return why; end if;
  if exists (select 1 from person_asks where from_uid = p_uid and to_uid = p_to and status = 'new') then return 'already'; end if;
  if (select count(*) from person_asks where from_uid = p_uid and created > now() - interval '1 day') >= 10 then return 'slow'; end if;
  insert into person_asks(from_uid, to_uid, kind, note) values (p_uid, p_to, p_kind, left(trim(coalesce(p_note, '')), 300));
  return 'ok';
end $$;

-- in: asks to me waiting for an answer; out: my asks that were answered yes (their chat), for the last 30 days
create or replace function public.lm_asks(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return json_build_object(
    'in', coalesce((select json_agg(json_build_object('id', a.id, 'kind', a.kind, 'note', a.note, 'created', a.created,
        'from', json_build_object('uid', f.uid, 'name', f.name, 'nick', f.nick, 'color', f.color, 'avatar', f.avatar, 'city', f.city,
          'photo', case when f.show_photo and cardinality(_lm_shared(p_uid, f.uid)) > 0 then f.photo else '' end)) order by a.created desc)
      from person_asks a join users f on f.uid = a.from_uid
      where a.to_uid = p_uid and a.status = 'new' and not _lm_blocked(p_uid, a.from_uid)), '[]'::json),
    'out', coalesce((select json_agg(json_build_object('code', a.code, 'title', t.name))
      from person_asks a join users t on t.uid = a.to_uid
      where a.from_uid = p_uid and a.status = 'yes' and a.code <> '' and a.created > now() - interval '30 days'
        and exists (select 1 from members m where m.code = a.code and m.uid = p_uid)), '[]'::json));
end $$;

-- yes: a private circle of the two opens (or the one we already have); the ask becomes its first message
create or replace function public.lm_ask_answer(p_uid uuid, p_token text, p_id uuid, p_yes boolean) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a person_asks; c text; abc text := 'abcdefghjkmnpqrstuvwxyz23456789'; n int; fname text; tname text;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into a from person_asks where id = p_id and to_uid = p_uid and status = 'new';
  if a.id is null then return null; end if;
  if not p_yes then update person_asks set status = 'no' where id = p_id; return json_build_object('ok', true); end if;
  select name into fname from users where uid = a.from_uid;
  select name into tname from users where uid = a.to_uid;
  select x.code into c from person_asks x where x.status = 'yes' and x.code <> ''
    and ((x.from_uid = a.from_uid and x.to_uid = a.to_uid) or (x.from_uid = a.to_uid and x.to_uid = a.from_uid))
    and exists (select 1 from circles where code = x.code) order by x.created desc limit 1;
  if c is null then
    loop
      c := '';
      for n in 1..8 loop c := c || substr(abc, 1 + (get_byte(gen_random_bytes(1), 0) % length(abc)), 1); end loop;
      exit when not exists (select 1 from circles where code = c);
    end loop;
    insert into circles(code, owner) values (c, p_uid);
  end if;
  insert into members(code, uid, title, kind) values (c, a.to_uid, left(coalesce(fname, ''), 40), 'friends') on conflict do nothing;
  insert into members(code, uid, title, kind) values (c, a.from_uid, left(coalesce(tname, ''), 40), 'friends') on conflict do nothing;
  update person_asks set status = 'yes', code = c where id = p_id;
  if a.note <> '' then
    insert into chat_msgs(code, uid, kind, body, ref) values (c, a.from_uid, 'text', a.note, jsonb_build_object('t', 'ask', 'k', a.kind));
  end if;
  return json_build_object('ok', true, 'code', c, 'title', left(coalesce(fname, ''), 40), 'kind', 'friends');
end $$;

revoke all on function public.lm_intents_mine(uuid,text), public.lm_intent_set(uuid,text,text,jsonb), public.lm_city_set(uuid,text,text),
  public.lm_person(uuid,text,uuid), public.lm_intents_feed(uuid,text), public.lm_ask(uuid,text,uuid,text,text),
  public.lm_asks(uuid,text), public.lm_ask_answer(uuid,text,uuid,boolean) from public;
grant execute on function public.lm_intents_mine(uuid,text), public.lm_intent_set(uuid,text,text,jsonb), public.lm_city_set(uuid,text,text),
  public.lm_person(uuid,text,uuid), public.lm_intents_feed(uuid,text), public.lm_ask(uuid,text,uuid,text,text),
  public.lm_asks(uuid,text), public.lm_ask_answer(uuid,text,uuid,boolean) to anon, authenticated;
