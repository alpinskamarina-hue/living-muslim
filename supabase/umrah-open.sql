-- Living Muslim: «Ищут людей», open umrah groups. Paste into Supabase → SQL Editor and press Run.
-- Needs schema.sql, nicks.sql, push.sql and chat.sql (already run). Safe to run again.
--
-- An amir opens his trip himself (places, who is welcome, a note). Strangers see only the title, month, city,
-- the amir's first name, how many go and how many places are left. A person asks to join with a short note;
-- the amir accepts (that sends the usual circle invite), writes back once, or says no.

create table if not exists public.umrah_open (
  host uuid primary key references public.users(uid) on delete cascade,
  code text not null references public.circles(code) on delete cascade,
  places int not null default 1 check (places between 0 and 20),
  who text not null default 'brothers' check (who in ('brothers', 'sisters', 'families', 'all')),
  note text not null default '',
  opened timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists umrah_open_code on public.umrah_open(code);

create table if not exists public.umrah_asks (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.users(uid) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  note text not null default '',
  reply text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  pushed_host boolean not null default false,
  pushed_me boolean not null default true,
  created timestamptz not null default now(),
  answered timestamptz
);
create unique index if not exists umrah_asks_one on public.umrah_asks(host, uid) where status = 'pending';
create index if not exists umrah_asks_host on public.umrah_asks(host, status);
create index if not exists umrah_asks_uid on public.umrah_asks(uid, created);

alter table public.umrah_open enable row level security;
alter table public.umrah_asks enable row level security;
revoke all on public.umrah_open, public.umrah_asks from anon, authenticated;

-- The trip document of a host in a circle, and its return day when the dates are chosen.
create or replace function public._lm_um_trip(p_host uuid, p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data from docs where code = p_code and coll = 'umrahTrip' and key = p_host;
$$;
create or replace function public._lm_um_end(t jsonb) returns text
language sql immutable as $$
  select d->>'to' from jsonb_array_elements(coalesce(t->'dates', '[]'::jsonb)) d where d->>'id' = t->>'chosen' limit 1;
$$;
create or replace function public._lm_um_going(p_host uuid, p_code text) returns int
language sql stable security definer set search_path = public as $$
  select 1 + count(*)::int from docs d join members m on m.code = d.code and m.uid = d.key
  where d.code = p_code and d.coll = 'umrahRsvp' and d.key <> p_host and d.data->(p_host::text)->>'s' = 'go';
$$;
revoke all on function public._lm_um_trip(uuid, text), public._lm_um_going(uuid, text) from public, anon, authenticated;

-- Open or update my trip in «Ищут людей»; p = null closes it.
create or replace function public.lm_umrah_open_set(p_uid uuid, p_token text, p_code text, p jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare t jsonb;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if p is null then delete from umrah_open where host = p_uid; return 'ok'; end if;
  if not exists (select 1 from members where code = p_code and uid = p_uid) then return 'not_member'; end if;
  t := _lm_um_trip(p_uid, p_code);
  if t is null then return 'no_trip'; end if;
  insert into umrah_open(host, code, places, who, note)
  values (p_uid, p_code, least(20, greatest(0, coalesce((p->>'places')::int, 1))),
    case when p->>'who' in ('brothers', 'sisters', 'families', 'all') then p->>'who' else 'brothers' end,
    left(trim(coalesce(p->>'note', '')), 200))
  on conflict (host) do update set code = excluded.code, places = excluded.places, who = excluded.who, note = excluded.note, updated = now();
  return 'ok';
end $$;

-- My own listing, if open.
create or replace function public.lm_umrah_open_mine(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return (select json_build_object('code', code, 'places', places, 'who', who, 'note', note) from umrah_open where host = p_uid);
end $$;

-- Open groups I could ask to join: not my own, not circles I am in, not people I blocked, fitting brothers/sisters,
-- trips that are not over. Only the public fields.
create or replace function public.lm_umrah_open_list(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare me users;
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  select * into me from users where uid = p_uid;
  return coalesce((select json_agg(x order by x.sort, x.opened desc) from (
    select o.host, o.places, o.who, o.note, o.opened,
      left(coalesce(t->>'title', ''), 60) as title, left(coalesce(t->>'month', ''), 40) as month, left(coalesce(t->>'city', ''), 40) as city,
      (select d->>'from' from jsonb_array_elements(coalesce(t->'dates', '[]'::jsonb)) d where d->>'id' = t->>'chosen' limit 1) as "from",
      split_part(h.name, ' ', 1) as amir,
      _lm_um_going(o.host, o.code) as going,
      coalesce((select d->>'from' from jsonb_array_elements(coalesce(t->'dates', '[]'::jsonb)) d where d->>'id' = t->>'chosen' limit 1), '9999') as sort,
      (select json_build_object('id', a.id, 'status', a.status, 'reply', a.reply) from umrah_asks a
        where a.host = o.host and a.uid = p_uid order by a.created desc limit 1) as mine
    from umrah_open o
    join users h on h.uid = o.host
    cross join lateral (select _lm_um_trip(o.host, o.code) t) tt
    where o.host <> p_uid and o.places > 0 and t is not null
      and exists (select 1 from members m where m.code = o.code and m.uid = o.host)
      and not exists (select 1 from members m where m.code = o.code and m.uid = p_uid)
      and not _lm_blocked(p_uid, o.host)
      and coalesce(_lm_um_end(t), '9999') >= to_char(now(), 'YYYY-MM-DD')
      and not (o.who = 'sisters' and coalesce(me.gender, '') = 'm')
      and not (o.who = 'brothers' and coalesce(me.gender, '') = 'f')
      and not (h.sisters_only and coalesce(me.gender, '') <> 'f')
  ) x), '[]'::json);
end $$;

-- Ask to join with a short note.
create or replace function public.lm_umrah_ask(p_uid uuid, p_token text, p_host uuid, p_note text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare o umrah_open;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  select * into o from umrah_open where host = p_host;
  if o.host is null or o.places <= 0 then return 'closed'; end if;
  if p_host = p_uid or _lm_blocked(p_uid, p_host) then return 'closed'; end if;
  if exists (select 1 from members where code = o.code and uid = p_uid) then return 'already_in'; end if;
  if exists (select 1 from umrah_asks where host = p_host and uid = p_uid and status = 'pending') then return 'already'; end if;
  if exists (select 1 from umrah_asks where host = p_host and uid = p_uid and status = 'declined' and answered > now() - interval '30 days') then return 'declined'; end if;
  if (select count(*) from umrah_asks where uid = p_uid and created > now() - interval '1 day') >= 5 then return 'limit'; end if;
  insert into umrah_asks(host, uid, note) values (p_host, p_uid, left(trim(coalesce(p_note, '')), 300));
  return 'ok';
end $$;

create or replace function public.lm_umrah_ask_cancel(p_uid uuid, p_token text, p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update umrah_asks set status = 'cancelled', answered = now() where id = p_id and uid = p_uid and status = 'pending';
  return found;
end $$;

-- Requests to my trip (pending, newest first) and the answers to my own requests (last 30 days).
create or replace function public.lm_umrah_asks(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return json_build_object(
    'to_me', coalesce((select json_agg(json_build_object('id', a.id, 'uid', u.uid, 'name', u.name, 'nick', u.nick, 'color', u.color,
        'avatar', u.avatar, 'gender', u.gender, 'note', a.note, 'reply', a.reply, 'created', a.created) order by a.created desc)
      from umrah_asks a join users u on u.uid = a.uid
      where a.host = p_uid and a.status = 'pending' and not _lm_blocked(p_uid, a.uid)), '[]'::json),
    'mine', coalesce((select json_agg(json_build_object('id', a.id, 'host', a.host, 'amir', split_part(h.name, ' ', 1),
        'title', coalesce(left(_lm_um_trip(a.host, o.code)->>'title', 60), ''), 'status', a.status, 'reply', a.reply, 'created', a.created) order by a.created desc)
      from umrah_asks a join users h on h.uid = a.host left join umrah_open o on o.host = a.host
      where a.uid = p_uid and a.status <> 'cancelled' and a.created > now() - interval '30 days'), '[]'::json));
end $$;

-- The amir answers: accept (the usual circle invite goes out, a place is taken), no, or a short reply.
create or replace function public.lm_umrah_answer(p_uid uuid, p_token text, p_id uuid, p_act text, p_text text default '') returns text
language plpgsql volatile security definer set search_path = public as $$
declare a umrah_asks; o umrah_open; m members;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  select * into a from umrah_asks where id = p_id and host = p_uid and status = 'pending';
  if a.id is null then return 'gone'; end if;
  if p_act = 'reply' then
    update umrah_asks set reply = left(trim(coalesce(p_text, '')), 300), pushed_me = false where id = p_id;
    return 'ok';
  end if;
  if p_act = 'no' then
    update umrah_asks set status = 'declined', answered = now(), pushed_me = false where id = p_id;
    return 'ok';
  end if;
  if p_act <> 'yes' then return 'bad'; end if;
  select * into o from umrah_open where host = p_uid;
  if o.host is null then return 'closed'; end if;
  select * into m from members where code = o.code and uid = p_uid;
  if m.uid is null then return 'not_member'; end if;
  if (select count(*) from members where code = o.code) >= 50 then return 'full'; end if;
  if not exists (select 1 from members where code = o.code and uid = a.uid) then
    insert into invites(code, from_uid, to_uid, title, kind) values (o.code, p_uid, a.uid, coalesce(m.title, ''), coalesce(m.kind, ''))
    on conflict (code, to_uid) where status = 'pending' do nothing;
  end if;
  update umrah_asks set status = 'accepted', answered = now(), pushed_me = false where id = p_id;
  update umrah_open set places = greatest(0, places - 1), updated = now() where host = p_uid;
  return 'ok';
end $$;

-- For the push job (api/push-tick.js): new requests for amirs and answers for the people who asked.
-- Returns the phones to notify and marks the rows as pushed.
create or replace function public.lm_umrah_push(p_secret text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare out json;
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  select coalesce(json_agg(x), '[]'::json) into out from (
    select s.endpoint, s.p256dh, s.auth, s.prefs, 'ask' k, u.name who, coalesce(_lm_um_trip(a.host, o.code)->>'title', '') title, a.reply
    from umrah_asks a join users u on u.uid = a.uid left join umrah_open o on o.host = a.host
    join push_subs s on s.uid = a.host
    where a.status = 'pending' and not a.pushed_host and a.created > now() - interval '1 day'
    union all
    select s.endpoint, s.p256dh, s.auth, s.prefs, case when a.status = 'pending' then 'reply' else a.status end, split_part(h.name, ' ', 1),
      coalesce(_lm_um_trip(a.host, o.code)->>'title', ''), a.reply
    from umrah_asks a join users h on h.uid = a.host left join umrah_open o on o.host = a.host
    join push_subs s on s.uid = a.uid
    where not a.pushed_me and a.status in ('pending', 'accepted', 'declined') and coalesce(a.answered, a.created) > now() - interval '1 day'
  ) x;
  update umrah_asks set pushed_host = true where not pushed_host;
  update umrah_asks set pushed_me = true where not pushed_me;
  return out;
end $$;

grant execute on function public.lm_umrah_open_set(uuid, text, text, jsonb), public.lm_umrah_open_mine(uuid, text),
  public.lm_umrah_open_list(uuid, text), public.lm_umrah_ask(uuid, text, uuid, text), public.lm_umrah_ask_cancel(uuid, text, uuid),
  public.lm_umrah_asks(uuid, text), public.lm_umrah_answer(uuid, text, uuid, text, text), public.lm_umrah_push(text) to anon, authenticated;
