-- Living Muslim: «Личные» in Circles (22.11.2026).
-- Chats of two get their own tab. They are marked on the server (table dms), so another phone sees them as «Личные» too.
-- «Написать» from a circle: a brother writes to a brother (a sister to a sister) of a shared circle at once, without a request.
-- Everyone else: a request with a topic, as before. A brother and a sister: only a request about something practical,
-- and the sister decides; getting to know each other for nikah goes through «Никах» with the wali.
-- Per chat: mute, pin, hide from the list, report (the last 20 messages go to the owner), block.
-- 3 reports from different people close the person's DMs until the owner looks.
-- Run once in Supabase SQL Editor after profile-path.sql, chat-reads.sql and open-circles.sql. Safe to run again.

alter table public.users add column if not exists dm_circles text not null default 'direct';   -- people of my circles: direct / ask / none
alter table public.users add column if not exists dm_bro boolean not null default true;        -- a sister: practical requests from brothers
alter table public.users add column if not exists dm_ticks boolean not null default true;      -- «прочитано» ✓✓ in my chats of two
alter table public.users add column if not exists dm_locked boolean not null default false;    -- 3 reports: DMs closed until the owner looks
alter table public.users drop constraint if exists users_dm_circles_check;
alter table public.users add constraint users_dm_circles_check check (dm_circles in ('direct', 'ask', 'none'));

create table if not exists public.dms (
  code text primary key references public.circles(code) on delete cascade,
  a uuid not null references public.users(uid) on delete cascade,   -- who started it
  b uuid not null references public.users(uid) on delete cascade,
  src text not null default '',                                      -- 'c:<circle title>' or 'a:<request topic>'
  created timestamptz not null default now()
);
create unique index if not exists dms_pair on public.dms (least(a, b), greatest(a, b));
create index if not exists dms_a on public.dms (a, created);
create index if not exists dms_b on public.dms (b);

create table if not exists public.dm_prefs (
  uid uuid not null references public.users(uid) on delete cascade,
  code text not null references public.dms(code) on delete cascade,
  muted boolean not null default false,
  pinned boolean not null default false,
  hidden_after bigint not null default 0,   -- «Убрать из списка»: back when a newer message comes
  primary key (uid, code)
);

create table if not exists public.dm_reports (
  id bigserial primary key,
  code text not null,
  by_uid uuid not null references public.users(uid) on delete cascade,
  who uuid not null references public.users(uid) on delete cascade,
  reason text not null default '',
  msgs jsonb not null default '[]'::jsonb,
  done boolean not null default false,
  created timestamptz not null default now()
);
create index if not exists dm_reports_who on public.dm_reports (who, created);

alter table public.dms enable row level security;
alter table public.dm_prefs enable row level security;
alter table public.dm_reports enable row level security;
revoke all on public.dms, public.dm_prefs, public.dm_reports from anon, authenticated;

-- Chats of two that requests opened before: they become «Личные» too.
insert into public.dms(code, a, b, src, created)
select distinct on (least(x.from_uid, x.to_uid), greatest(x.from_uid, x.to_uid)) x.code, x.from_uid, x.to_uid, 'a:' || x.kind, x.created
from public.person_asks x
where x.status = 'yes' and x.code <> '' and exists (select 1 from public.circles c where c.code = x.code)
order by least(x.from_uid, x.to_uid), greatest(x.from_uid, x.to_uid), x.created desc
on conflict do nothing;

-- Circles we really share: not a chat of two, not an open circle for brothers and sisters together.
create or replace function public._lm_shared_real(a uuid, b uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m1.code), '{}') from members m1 join members m2 on m2.code = m1.code and m2.uid = b
  where m1.uid = a and not exists (select 1 from dms d where d.code = m1.code)
    and not exists (select 1 from circle_open o where o.code = m1.code and o.who = 'all');
$$;
revoke all on function public._lm_shared_real(uuid, uuid) from public, anon, authenticated;

-- May a open a chat with b right away? 'direct', 'ask' (send a request with a topic) or why not.
create or replace function public._lm_dm_mode(a uuid, b uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare ua users; ub users;
begin
  if a = b then return 'self'; end if;
  if _lm_blocked(a, b) then return 'closed'; end if;
  select * into ua from users where uid = a;
  select * into ub from users where uid = b;
  if ua.uid is null or ub.uid is null then return 'closed'; end if;
  if ua.dm_locked then return 'locked'; end if;
  if ua.gender = '' or ub.gender = '' or ua.gender <> ub.gender then return 'ask'; end if;
  if cardinality(_lm_shared_real(a, b)) = 0 then return 'ask'; end if;
  if ub.dm_circles = 'none' then return 'closed'; end if;
  if ub.dm_circles = 'ask' then return 'ask'; end if;
  if ua.created > now() - interval '24 hours' then return 'new'; end if;
  return 'direct';
end $$;
revoke all on function public._lm_dm_mode(uuid, uuid) from public, anon, authenticated;

-- Requests (profile-path.sql) with the new rules: a brother may ask a sister about something practical, the sister decides.
create or replace function public._lm_can_ask(a uuid, b uuid, k text) returns text
language plpgsql stable security definer set search_path = public as $$
declare ua users; ub users; sh int; biz text[] := array['question', 'umrah', 'study', 'learn', 'job', 'biz'];
begin
  if a = b then return 'self'; end if;
  if _lm_blocked(a, b) then return 'closed'; end if;
  select * into ua from users where uid = a;
  select * into ub from users where uid = b;
  if ub.uid is null then return 'closed'; end if;
  if ua.dm_locked then return 'locked'; end if;
  if ua.created > now() - interval '24 hours' then return 'new'; end if;
  sh := cardinality(_lm_shared(a, b));
  -- a sister: from brothers only practical topics, and only while she allows it (nikah goes through the wali)
  if (ub.gender = 'f' or ub.sisters_only) and ua.gender <> 'f' then
    if ub.sisters_only or not ub.dm_bro then return 'sister'; end if;
    if not (k = any(biz)) then return 'sister_topic'; end if;
  end if;
  -- a brother gets requests from sisters only about something practical
  if ua.gender = 'f' and ub.gender = 'm' and not (k = any(biz)) then return 'closed'; end if;
  -- about something they published in «Сейчас ищу»: allowed when I can see it
  if k in ('umrah', 'job', 'biz', 'study') and exists (select 1 from intents i where i.uid = b and i.kind = k and _lm_in_sees(a, i)) then return 'ok'; end if;
  if exists (select 1 from person_asks where from_uid = a and to_uid = b and status = 'no' and coalesce(answered, created) > now() - interval '30 days') then return 'later'; end if;
  if ub.ask_from = 'none' or ub.invite_from = 'none' then return 'closed'; end if;
  if ub.ask_from = 'circles' and sh = 0 then return 'circles'; end if;
  return 'ok';
end $$;
revoke all on function public._lm_can_ask(uuid, uuid, text) from public, anon, authenticated;

-- Opens the chat of two (or the one we already have). The circle title each sees is the other's name.
create or replace function public._lm_dm_make(p_a uuid, p_b uuid, p_src text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare c text; abc text := 'abcdefghjkmnpqrstuvwxyz23456789'; n int; an text; bn text;
begin
  select d.code into c from dms d where least(d.a, d.b) = least(p_a, p_b) and greatest(d.a, d.b) = greatest(p_a, p_b);
  select name into an from users where uid = p_a;
  select name into bn from users where uid = p_b;
  if c is null then
    loop
      c := '';
      for n in 1..8 loop c := c || substr(abc, 1 + (get_byte(gen_random_bytes(1), 0) % length(abc)), 1); end loop;
      exit when not exists (select 1 from circles where code = c);
    end loop;
    insert into circles(code, owner) values (c, p_a);
    insert into dms(code, a, b, src) values (c, p_a, p_b, left(coalesce(p_src, ''), 60));
  end if;
  insert into members(code, uid, title, kind) values (c, p_a, left(coalesce(bn, ''), 40), 'friends') on conflict do nothing;
  insert into members(code, uid, title, kind) values (c, p_b, left(coalesce(an, ''), 40), 'friends') on conflict do nothing;
  delete from dm_prefs where code = c and hidden_after > 0 and uid in (p_a, p_b);
  return c;
end $$;
revoke all on function public._lm_dm_make(uuid, uuid, text) from public, anon, authenticated;

-- «Написать» to someone of my circles: opens the chat at once when allowed, else says to send a request.
create or replace function public.lm_dm_open(p_uid uuid, p_token text, p_other uuid) returns json
language plpgsql volatile security definer set search_path = public as $$
declare mode text; c text; t text;
begin
  if not _lm_ok(p_uid, p_token) then return json_build_object('error', 'auth'); end if;
  select d.code into c from dms d where least(d.a, d.b) = least(p_uid, p_other) and greatest(d.a, d.b) = greatest(p_uid, p_other)
    and exists (select 1 from members m where m.code = d.code and m.uid = p_uid);
  if c is not null and not _lm_blocked(p_uid, p_other) then
    delete from dm_prefs where code = c and uid = p_uid;
    return json_build_object('code', c, 'title', (select title from members where code = c and uid = p_uid));
  end if;
  mode := _lm_dm_mode(p_uid, p_other);
  if mode <> 'direct' then return json_build_object('error', mode); end if;
  if (select count(*) from dms where a = p_uid and created > now() - interval '1 day') >= 10 then return json_build_object('error', 'slow'); end if;
  select m.title into t from members m where m.uid = p_uid and m.code = (_lm_shared_real(p_uid, p_other))[1];
  c := _lm_dm_make(p_uid, p_other, 'c:' || coalesce(t, ''));
  return json_build_object('code', c, 'title', (select title from members where code = c and uid = p_uid));
end $$;

-- Accepting a request opens the chat of two (as in intents.sql), now marked as «Личные».
create or replace function public.lm_ask_answer(p_uid uuid, p_token text, p_id uuid, p_yes boolean) returns json
language plpgsql volatile security definer set search_path = public as $$
declare a person_asks; c text; fname text;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into a from person_asks where id = p_id and to_uid = p_uid and status = 'new';
  if a.id is null then return null; end if;
  if not p_yes then update person_asks set status = 'no' where id = p_id; return json_build_object('ok', true); end if;
  select name into fname from users where uid = a.from_uid;
  c := _lm_dm_make(a.from_uid, a.to_uid, 'a:' || a.kind);
  update person_asks set status = 'yes', code = c where id = p_id;
  if a.note <> '' then
    insert into chat_msgs(code, uid, kind, body, ref) values (c, a.from_uid, 'text', a.note, jsonb_build_object('t', 'ask', 'k', a.kind));
  end if;
  return json_build_object('ok', true, 'code', c, 'title', left(coalesce(fname, ''), 40), 'kind', 'friends');
end $$;

-- What the «Написать» button of a person should do.
create or replace function public.lm_dm_can(p_uid uuid, p_token text, p_other uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare c text;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select d.code into c from dms d where least(d.a, d.b) = least(p_uid, p_other) and greatest(d.a, d.b) = greatest(p_uid, p_other)
    and exists (select 1 from members m where m.code = d.code and m.uid = p_uid);
  return json_build_object('mode', case when c is not null and not _lm_blocked(p_uid, p_other) then 'chat' else _lm_dm_mode(p_uid, p_other) end,
    'chat', c, 'ask', _lm_can_ask(p_uid, p_other, 'question'), 'hi', _lm_can_ask(p_uid, p_other, 'hi'));
end $$;

-- My chats of two for the «Личные» tab. Without p_uid: a probe that the function exists.
create or replace function public.lm_dm_list(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return '[]'::json; end if;
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return coalesce((select json_agg(json_build_object(
      'code', d.code, 'uid', o.uid, 'name', o.name, 'nick', o.nick, 'color', o.color, 'avatar', o.avatar, 'gender', o.gender,
      'photo', case when o.show_photo then o.photo else '' end,
      'src', d.src, 'mine', d.a = p_uid, 'muted', coalesce(p.muted, false), 'pinned', coalesce(p.pinned, false),
      'hidden', coalesce(p.hidden_after, 0) > 0 and coalesce(p.hidden_after, 0) >= coalesce((select max(id) from chat_msgs m where m.code = d.code), 0),
      'blocked', exists (select 1 from blocks b where b.uid = p_uid and b.other = o.uid)) order by d.created desc)
    from dms d
    join users o on o.uid = case when d.a = p_uid then d.b else d.a end
    left join dm_prefs p on p.uid = p_uid and p.code = d.code
    where (d.a = p_uid or d.b = p_uid) and exists (select 1 from members m where m.code = d.code and m.uid = p_uid)), '[]'::json);
end $$;

-- People of my circles for «✎ Написать»: who can be written to at once and who gets a request.
create or replace function public.lm_dm_people(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return coalesce((select json_agg(x order by x->>'name') from (
    select json_build_object('uid', u.uid, 'name', u.name, 'nick', u.nick, 'color', u.color, 'avatar', u.avatar, 'gender', u.gender,
      'photo', case when u.show_photo then u.photo else '' end,
      'circle', (select m.title from members m where m.uid = p_uid and m.code = (_lm_shared_real(p_uid, u.uid))[1]),
      'mode', _lm_dm_mode(p_uid, u.uid)) x
    from users u
    where u.uid <> p_uid and cardinality(_lm_shared_real(p_uid, u.uid)) > 0 and not _lm_blocked(p_uid, u.uid)
    limit 300) s), '[]'::json);
end $$;

-- Mute, pin or take a chat off my list (it comes back with a newer message).
create or replace function public.lm_dm_pref(p_uid uuid, p_token text, p_code text, p_muted boolean, p_pinned boolean, p_hide boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare h bigint := 0;
begin
  if not _lm_ok(p_uid, p_token) or not exists (select 1 from dms where code = p_code and (a = p_uid or b = p_uid)) then return false; end if;
  if p_hide then h := coalesce((select max(id) from chat_msgs where code = p_code), 0); if h = 0 then h := 1; end if; end if;
  insert into dm_prefs(uid, code, muted, pinned, hidden_after) values (p_uid, p_code, coalesce(p_muted, false), coalesce(p_pinned, false), h)
  on conflict (uid, code) do update set muted = coalesce(p_muted, dm_prefs.muted), pinned = coalesce(p_pinned, dm_prefs.pinned),
    hidden_after = case when p_hide is null then dm_prefs.hidden_after else h end;
  return true;
end $$;

-- A report about the other person of a chat of two: the last 20 messages go to the owner; optionally block.
create or replace function public.lm_dm_report(p_uid uuid, p_token text, p_code text, p_reason text, p_block boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare d dms; o uuid;
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  select * into d from dms where code = p_code and (a = p_uid or b = p_uid);
  if d.code is null then return false; end if;
  o := case when d.a = p_uid then d.b else d.a end;
  if not exists (select 1 from dm_reports where code = p_code and by_uid = p_uid and created > now() - interval '1 day') then
    insert into dm_reports(code, by_uid, who, reason, msgs) values (p_code, p_uid, o, left(coalesce(p_reason, ''), 200),
      coalesce((select json_agg(json_build_object('who', case when m.uid = p_uid then 'by' else 'him' end, 'kind', m.kind,
          'body', case when m.kind = 'voice' then '[голосовое]' when m.kind = 'photo' then '[фото] ' || m.body
            when m.kind = 'file' then '[файл ' || coalesce(m.file->>'name', '') || '] ' || m.body else m.body end, 'at', m.created) order by m.id)
        from (select * from chat_msgs where code = p_code and not deleted order by id desc limit 20) m), '[]'::json)::jsonb);
  end if;
  if p_block then insert into blocks(uid, other) values (p_uid, o) on conflict do nothing; end if;
  if (select count(distinct by_uid) from dm_reports where who = o and not done and created > now() - interval '30 days') >= 3 then
    update users set dm_locked = true where uid = o;
  end if;
  return true;
end $$;

-- Unblock from «Заблокированные».
create or replace function public.lm_dm_blocked(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return coalesce((select json_agg(json_build_object('uid', u.uid, 'name', u.name, 'nick', u.nick, 'color', u.color) order by b.created desc)
    from blocks b join users u on u.uid = b.other where b.uid = p_uid), '[]'::json);
end $$;
create or replace function public.lm_dm_unblock(p_uid uuid, p_token text, p_other uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  delete from blocks where uid = p_uid and other = p_other;
  return true;
end $$;

-- «Кто может мне писать».
create or replace function public.lm_dm_settings(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare u users;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into u from users where uid = p_uid;
  return json_build_object('circles', u.dm_circles, 'others', u.ask_from, 'ticks', u.dm_ticks, 'bro', u.dm_bro, 'gender', u.gender,
    'sisters_only', u.sisters_only, 'locked', u.dm_locked, 'blocked', (select count(*) from blocks where uid = p_uid));
end $$;
create or replace function public.lm_dm_settings_set(p_uid uuid, p_token text, p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update users set
    dm_circles = case when p->>'circles' in ('direct', 'ask', 'none') then p->>'circles' else dm_circles end,
    ask_from = case when p->>'others' in ('all', 'circles', 'none') then p->>'others' else ask_from end,
    dm_ticks = coalesce((p->>'ticks')::boolean, dm_ticks),
    dm_bro = coalesce((p->>'bro')::boolean, dm_bro)
  where uid = p_uid;
  return true;
end $$;

-- The server side of the rules: whatever path sends a message into a chat of two, it is checked here.
create or replace function public._lm_dm_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dms; o uuid;
begin
  select * into d from dms where code = new.code;
  if d.code is null or new.kind = 'event' or coalesce(new.ref->>'t', '') = 'ask' then return new; end if;
  o := case when d.a = new.uid then d.b else d.a end;
  if _lm_blocked(new.uid, o) then raise exception 'dm_blocked'; end if;
  if (select dm_locked from users where uid = new.uid) then raise exception 'dm_locked'; end if;
  if not exists (select 1 from chat_msgs m where m.code = new.code and m.uid = o and m.kind <> 'event')
    and (new.kind in ('photo', 'file')
      or coalesce(new.body, '') ~* '(https?://|www\.|t\.me/|wa\.me/|\m[a-z0-9-]+\.(com|ru|net|org|io|me|app|link)\M)') then
    raise exception 'dm_first';
  end if;
  return new;
end $$;
drop trigger if exists lm_dm_guard on public.chat_msgs;
create trigger lm_dm_guard before insert on public.chat_msgs for each row execute function public._lm_dm_guard();

-- Read ticks (chat-reads.sql): in a chat of two where either person turned «прочитано» off, nobody sees ✓✓.
create or replace function public._lm_dm_noticks(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dms d join users u on u.uid in (d.a, d.b) where d.code = p_code and not u.dm_ticks);
$$;
revoke all on function public._lm_dm_noticks(text) from public, anon, authenticated;

create or replace function public.lm_chat_reads(p_uid uuid, p_token text, p_code text default null) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return null; end if; -- probe from the app: the function exists
  if not _lm_ok(p_uid, p_token) then return null; end if;
  if p_code is not null then
    if not _lm_member(p_uid, p_code) then return null; end if;
    return coalesce((
      select json_object_agg(mb.uid, json_build_array(
        case when _lm_dm_noticks(p_code) then 0 else coalesce((select s.last_id from chat_seen s where s.code = p_code and s.uid = mb.uid), 0) end,
        (extract(epoch from mb.joined) * 1000)::bigint))
      from members mb where mb.code = p_code and mb.uid <> p_uid
    ), '{}'::json);
  end if;
  return coalesce((
    select json_object_agg(x.code, json_build_array(x.rd, x.tot)) from (
      select me.code,
        case when _lm_dm_noticks(me.code) then 0 else
        (select count(*) from members mb where mb.code = me.code and mb.uid <> p_uid and mb.joined <= lm.created
           and coalesce((select s.last_id from chat_seen s where s.code = me.code and s.uid = mb.uid), 0) >= lm.id) end rd,
        (select count(*) from members mb where mb.code = me.code and mb.uid <> p_uid and mb.joined <= lm.created) tot
      from members me
      cross join lateral (
        select m.id, m.uid, m.created from chat_msgs m where m.code = me.code and not m.deleted
        order by m.id desc limit 1
      ) lm
      where me.uid = p_uid and lm.uid = p_uid
    ) x
  ), '{}'::json);
end $$;

-- Chat push (chat-files.sql): muted chats of two stay quiet.
create or replace function public.lm_chat_push(p_secret text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  return coalesce((
    select json_agg(json_build_object('endpoint', s.endpoint, 'code', x.code, 'title', x.title, 'n', x.n, 'last', x.last_id,
      'from', x.from_name, 'body', x.body, 'kind', x.kind))
    from push_subs s
    join lateral (
      select me.code, me.title,
        count(m.id) n, max(m.id) last_id,
        (array_agg(u.name order by m.id desc))[1] from_name,
        (array_agg(case when m.kind = 'file' then coalesce(m.file->>'name', '') else m.body end order by m.id desc))[1] body,
        (array_agg(m.kind order by m.id desc))[1] kind
      from members me
      join chat_msgs m on m.code = me.code and m.uid <> s.uid and not m.deleted
        and m.created > now() - interval '6 hours'
        and m.id > greatest(coalesce((select last_id from chat_seen c where c.code = me.code and c.uid = s.uid), 0), coalesce((s.chat_sent->>me.code)::bigint, 0))
        and not exists (select 1 from blocks b where b.uid = s.uid and b.other = m.uid)
      join users u on u.uid = m.uid
      where me.uid = s.uid
        and not exists (select 1 from dm_prefs dp where dp.uid = s.uid and dp.code = me.code and dp.muted)
      group by me.code, me.title
    ) x on true
    where s.uid is not null and coalesce((s.prefs->>'chat')::boolean, true)
  ), '[]'::json);
end $$;

-- ---------- owner: reports about DMs ----------
create or replace function public.lm_admin_dm_reports() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return coalesce((select json_agg(json_build_object('id', r.id, 'reason', r.reason, 'msgs', r.msgs, 'done', r.done, 'at', r.created,
      'by', (select coalesce(nullif(u.name, ''), u.nick, '') from users u where u.uid = r.by_uid),
      'who', (select coalesce(nullif(u.name, ''), u.nick, '') from users u where u.uid = r.who),
      'who_uid', r.who, 'locked', (select dm_locked from users where uid = r.who),
      'n', (select count(distinct x.by_uid) from dm_reports x where x.who = r.who and x.created > now() - interval '30 days')) order by r.done, r.id desc)
    from dm_reports r where r.created > now() - interval '90 days'), '[]'::json);
end $$;

-- 'ok': nothing wrong, DMs open again; 'lock': keep DMs closed.
create or replace function public.lm_admin_dm_report(p_id bigint, p_act text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare r dm_reports;
begin
  if not _lm_is_admin() then return false; end if;
  select * into r from dm_reports where id = p_id;
  if r.id is null then return false; end if;
  update dm_reports set done = true where who = r.who and not done;
  update users set dm_locked = (p_act = 'lock') where uid = r.who;
  return true;
end $$;

revoke all on function public.lm_dm_open(uuid,text,uuid), public.lm_dm_can(uuid,text,uuid), public.lm_dm_list(uuid,text), public.lm_dm_people(uuid,text),
  public.lm_dm_pref(uuid,text,text,boolean,boolean,boolean), public.lm_dm_report(uuid,text,text,text,boolean), public.lm_dm_blocked(uuid,text),
  public.lm_dm_unblock(uuid,text,uuid), public.lm_dm_settings(uuid,text), public.lm_dm_settings_set(uuid,text,jsonb),
  public.lm_admin_dm_reports(), public.lm_admin_dm_report(bigint,text), public.lm_ask_answer(uuid,text,uuid,boolean),
  public.lm_chat_reads(uuid,text,text), public.lm_chat_push(text) from public;
grant execute on function public.lm_dm_open(uuid,text,uuid), public.lm_dm_can(uuid,text,uuid), public.lm_dm_list(uuid,text), public.lm_dm_people(uuid,text),
  public.lm_dm_pref(uuid,text,text,boolean,boolean,boolean), public.lm_dm_report(uuid,text,text,text,boolean), public.lm_dm_blocked(uuid,text),
  public.lm_dm_unblock(uuid,text,uuid), public.lm_dm_settings(uuid,text), public.lm_dm_settings_set(uuid,text,jsonb),
  public.lm_ask_answer(uuid,text,uuid,boolean), public.lm_chat_reads(uuid,text,text), public.lm_chat_push(text) to anon, authenticated;
grant execute on function public.lm_admin_dm_reports(), public.lm_admin_dm_report(bigint,text) to authenticated;

select 'dm ready' as status;
