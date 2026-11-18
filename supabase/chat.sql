-- Living Muslim: chat inside circles (text and voice). Paste into Supabase → SQL Editor and press Run.
-- Needs schema.sql, nicks.sql and push.sql (already run). Safe to run again.

-- ---------- tables ----------
create table if not exists public.chat_msgs (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'voice', 'event')),
  body text not null default '',
  ref jsonb,                       -- {"r": <message id>} a reply; {"t": "dua", "d": "2026-11-18"} an event
  sec int,                         -- voice length, seconds
  bars jsonb,                      -- voice waveform, up to 32 numbers 0..9
  reacts jsonb not null default '{}'::jsonb, -- {"<uid>": "🤲"}
  deleted boolean not null default false,
  created timestamptz not null default now()
);
create index if not exists chat_msgs_code on public.chat_msgs (code, id);
create index if not exists chat_msgs_uid on public.chat_msgs (uid, created);

-- Voice is kept apart so lists stay light; removed after 30 days (see the schedule at the end).
create table if not exists public.chat_voice (
  id bigint primary key references public.chat_msgs(id) on delete cascade,
  mime text not null,
  data bytea not null,
  created timestamptz not null default now()
);

create table if not exists public.chat_seen (
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  last_id bigint not null default 0,
  primary key (code, uid)
);

create table if not exists public.chat_reports (
  id bigserial primary key,
  msg_id bigint not null references public.chat_msgs(id) on delete cascade,
  by_uid uuid not null references public.users(uid) on delete cascade,
  reason text not null default '',
  body text not null default '',
  created timestamptz not null default now(),
  unique (msg_id, by_uid)
);

-- Owner setting: voice messages allowed in this circle (off = text only, e.g. for mixed circles).
alter table public.circles add column if not exists chat_voice boolean not null default true;
-- Which person a push subscription belongs to, and what chat it has already announced.
alter table public.push_subs add column if not exists uid uuid;
alter table public.push_subs add column if not exists chat_sent jsonb not null default '{}'::jsonb;
create index if not exists push_subs_uid on public.push_subs (uid);

alter table public.chat_msgs enable row level security;
alter table public.chat_voice enable row level security;
alter table public.chat_seen enable row level security;
alter table public.chat_reports enable row level security;
revoke all on public.chat_msgs, public.chat_voice, public.chat_seen, public.chat_reports from anon, authenticated;

-- Leaving a circle takes your messages with you.
create or replace function public._lm_chat_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from chat_msgs where code = old.code and uid = old.uid;
  delete from chat_seen where code = old.code and uid = old.uid;
  return old;
end $$;
drop trigger if exists lm_chat_leave on public.members;
create trigger lm_chat_leave after delete on public.members for each row execute function public._lm_chat_leave();

create or replace function public._lm_member(p_uid uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where code = p_code and uid = p_uid);
$$;
revoke all on function public._lm_member(uuid, text) from public, anon, authenticated;

create or replace function public._lm_msg_json(m public.chat_msgs) returns json
language sql stable as $$
  select json_build_object('id', m.id, 'uid', m.uid, 'kind', m.kind,
    'body', case when m.deleted then '' else m.body end, 'ref', m.ref, 'sec', m.sec, 'bars', m.bars,
    'reacts', m.reacts, 'deleted', m.deleted, 'at', m.created,
    'voice', (m.kind = 'voice' and not m.deleted and exists (select 1 from public.chat_voice v where v.id = m.id)));
$$;

-- ---------- reading ----------
-- Newest 60 messages, or those after p_after (polling), or before p_before (scrolling up).
create or replace function public.lm_chat_list(p_uid uuid, p_token text, p_code text, p_after bigint default 0, p_before bigint default 0) returns json
language plpgsql stable security definer set search_path = public as $$
declare rows json;
begin
  if p_uid is null then return null; end if; -- probe from the app: the function exists
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return null; end if;
  select coalesce(json_agg(_lm_msg_json(x) order by x.id), '[]'::json) into rows from (
    select m.* from chat_msgs m
    where m.code = p_code
      and (p_after = 0 or m.id > p_after)
      and (p_before = 0 or m.id < p_before)
      and not exists (select 1 from blocks b where b.uid = p_uid and b.other = m.uid)
    order by m.id desc limit case when p_after > 0 then 200 else 60 end
  ) x;
  return json_build_object(
    'msgs', rows,
    'seen', coalesce((select last_id from chat_seen where code = p_code and uid = p_uid), 0),
    'voice', (select chat_voice from circles where code = p_code),
    'owner', (select owner from circles where code = p_code)
  );
end $$;

-- Unread counts for all my circles (badges).
create or replace function public.lm_chat_unread(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return coalesce((
    select json_object_agg(mm.code, n) from (
      select me.code, (select count(*) from chat_msgs m
        where m.code = me.code and m.uid <> p_uid and not m.deleted
          and m.id > coalesce((select last_id from chat_seen s where s.code = me.code and s.uid = p_uid), 0)
          and not exists (select 1 from blocks b where b.uid = p_uid and b.other = m.uid)) n
      from members me where me.uid = p_uid
    ) mm where n > 0
  ), '{}'::json);
end $$;

create or replace function public.lm_chat_seen(p_uid uuid, p_token text, p_code text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  insert into chat_seen(code, uid, last_id) values (p_code, p_uid, p_id)
  on conflict (code, uid) do update set last_id = greatest(chat_seen.last_id, excluded.last_id);
  return true;
end $$;

-- ---------- writing ----------
-- Text or an event card. Returns the new message, or {"error": "..."}.
create or replace function public.lm_chat_send(p_uid uuid, p_token text, p_code text, p_body text, p_ref jsonb default null, p_kind text default 'text') returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs; b text := left(trim(coalesce(p_body, '')), 2000);
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return json_build_object('error', 'auth'); end if;
  if p_kind not in ('text', 'event') then return json_build_object('error', 'kind'); end if;
  if b = '' then return json_build_object('error', 'empty'); end if;
  if (select count(*) from chat_msgs where uid = p_uid and created > now() - interval '1 minute') >= 20 then return json_build_object('error', 'slow'); end if;
  if p_ref is not null and length(p_ref::text) > 300 then p_ref := null; end if;
  insert into chat_msgs(code, uid, kind, body, ref) values (p_code, p_uid, p_kind, b, p_ref) returning * into m;
  insert into chat_seen(code, uid, last_id) values (p_code, p_uid, m.id)
  on conflict (code, uid) do update set last_id = greatest(chat_seen.last_id, excluded.last_id);
  return _lm_msg_json(m);
end $$;

-- Voice: base64 audio up to ~400 KB, up to 60 seconds.
create or replace function public.lm_chat_voice_send(p_uid uuid, p_token text, p_code text, p_mime text, p_b64 text, p_sec int, p_bars jsonb, p_ref jsonb default null) returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs; raw bytea;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return json_build_object('error', 'auth'); end if;
  if not (select chat_voice from circles where code = p_code) then return json_build_object('error', 'voice_off'); end if;
  if p_mime !~ '^audio/[a-z0-9.+-]+(;.*)?$' then return json_build_object('error', 'mime'); end if;
  if length(coalesce(p_b64, '')) > 560000 then return json_build_object('error', 'big'); end if;
  if (select count(*) from chat_msgs where uid = p_uid and created > now() - interval '1 minute') >= 20 then return json_build_object('error', 'slow'); end if;
  raw := decode(p_b64, 'base64');
  if length(raw) < 200 then return json_build_object('error', 'empty'); end if;
  if p_bars is not null and (jsonb_typeof(p_bars) <> 'array' or jsonb_array_length(p_bars) > 32) then p_bars := null; end if;
  if p_ref is not null and length(p_ref::text) > 300 then p_ref := null; end if;
  insert into chat_msgs(code, uid, kind, body, ref, sec, bars) values (p_code, p_uid, 'voice', '', p_ref, least(greatest(coalesce(p_sec, 1), 1), 60), p_bars) returning * into m;
  insert into chat_voice(id, mime, data) values (m.id, left(p_mime, 60), raw);
  insert into chat_seen(code, uid, last_id) values (p_code, p_uid, m.id)
  on conflict (code, uid) do update set last_id = greatest(chat_seen.last_id, excluded.last_id);
  return _lm_msg_json(m);
end $$;

create or replace function public.lm_chat_voice(p_uid uuid, p_token text, p_id bigint) returns json
language plpgsql stable security definer set search_path = public as $$
declare c text;
begin
  select code into c from chat_msgs where id = p_id and not deleted;
  if c is null or not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, c) then return null; end if;
  return (select json_build_object('mime', mime, 'b64', translate(encode(data, 'base64'), E'\n', '')) from chat_voice where id = p_id);
end $$;

-- Reaction: the same emoji again takes it off.
create or replace function public.lm_chat_react(p_uid uuid, p_token text, p_id bigint, p_emoji text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs;
begin
  select * into m from chat_msgs where id = p_id;
  if m.id is null or m.deleted or not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, m.code) then return null; end if;
  if p_emoji is null or p_emoji = '' or m.reacts->>p_uid::text = p_emoji then
    update chat_msgs set reacts = reacts - p_uid::text where id = p_id returning * into m;
  else
    update chat_msgs set reacts = reacts || jsonb_build_object(p_uid::text, left(p_emoji, 8)) where id = p_id returning * into m;
  end if;
  return _lm_msg_json(m);
end $$;

-- The author or the circle owner removes a message (text and voice are wiped).
create or replace function public.lm_chat_delete(p_uid uuid, p_token text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs;
begin
  select * into m from chat_msgs where id = p_id;
  if m.id is null or not _lm_ok(p_uid, p_token) then return false; end if;
  if m.uid <> p_uid and (select owner from circles where code = m.code) <> p_uid then return false; end if;
  update chat_msgs set deleted = true, body = '', bars = null, reacts = '{}'::jsonb where id = p_id;
  delete from chat_voice where id = p_id;
  return true;
end $$;

-- A complaint goes to the app owner (admin screen); a copy of the text is kept in case it gets deleted.
create or replace function public.lm_chat_report(p_uid uuid, p_token text, p_id bigint, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs;
begin
  select * into m from chat_msgs where id = p_id;
  if m.id is null or not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, m.code) or m.uid = p_uid then return false; end if;
  insert into chat_reports(msg_id, by_uid, reason, body) values (p_id, p_uid, left(coalesce(p_reason, ''), 200), case when m.kind = 'voice' then '[голосовое]' else m.body end)
  on conflict do nothing;
  return true;
end $$;

create or replace function public.lm_chat_settings(p_uid uuid, p_token text, p_code text, p_voice boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update circles set chat_voice = p_voice where code = p_code and owner = p_uid;
  return found;
end $$;

-- ---------- push ----------
-- The app ties its push subscription to the person, so new messages can be announced.
create or replace function public.lm_push_link(p_uid uuid, p_token text, p_endpoint text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update push_subs set uid = p_uid where endpoint = p_endpoint;
  return found;
end $$;

-- For the minute scheduler: per subscription and circle, new messages from others not yet announced.
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
        (array_agg(m.body order by m.id desc))[1] body,
        (array_agg(m.kind order by m.id desc))[1] kind
      from members me
      join chat_msgs m on m.code = me.code and m.uid <> s.uid and not m.deleted
        and m.created > now() - interval '6 hours'
        and m.id > greatest(coalesce((select last_id from chat_seen c where c.code = me.code and c.uid = s.uid), 0), coalesce((s.chat_sent->>me.code)::bigint, 0))
        and not exists (select 1 from blocks b where b.uid = s.uid and b.other = m.uid)
      join users u on u.uid = m.uid
      where me.uid = s.uid
      group by me.code, me.title
    ) x on true
    where s.uid is not null and coalesce((s.prefs->>'chat')::boolean, true)
  ), '[]'::json);
end $$;

create or replace function public.lm_chat_push_mark(p_secret text, p_endpoint text, p_code text, p_id bigint) returns void
language sql volatile security definer set search_path = public as $$
  update push_subs set chat_sent = chat_sent || jsonb_build_object(p_code, p_id)
  where endpoint = p_endpoint and p_secret = (select val from lm_config where key = 'push_secret');
$$;

-- ---------- admin: complaints ----------
create or replace function public.lm_chat_reports() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  -- signed-in email session of an owner listed in lm_admins (same check as the analytics screen)
  if not exists (select 1 from lm_admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))) then return null; end if;
  return coalesce((select json_agg(json_build_object('id', r.id, 'msg', r.msg_id, 'reason', r.reason, 'body', r.body, 'at', r.created,
    'by', (select name from users where uid = r.by_uid), 'author', (select name from users where uid = m.uid), 'deleted', m.deleted) order by r.id desc)
    from chat_reports r join chat_msgs m on m.id = r.msg_id where r.created > now() - interval '90 days'), '[]'::json);
end $$;

-- Owner removes a reported message from the admin screen.
create or replace function public.lm_chat_admin_delete(p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from lm_admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))) then return false; end if;
  update chat_msgs set deleted = true, body = '', bars = null, reacts = '{}'::jsonb where id = p_id;
  delete from chat_voice where id = p_id;
  return found;
end $$;

-- ---------- rights ----------
revoke all on function public.lm_chat_push(text), public.lm_chat_push_mark(text, text, text, bigint) from public;
grant execute on function public.lm_chat_push(text), public.lm_chat_push_mark(text, text, text, bigint) to anon;
grant execute on function
  public.lm_chat_list(uuid, text, text, bigint, bigint), public.lm_chat_unread(uuid, text), public.lm_chat_seen(uuid, text, text, bigint),
  public.lm_chat_send(uuid, text, text, text, jsonb, text), public.lm_chat_voice_send(uuid, text, text, text, text, int, jsonb, jsonb),
  public.lm_chat_voice(uuid, text, bigint), public.lm_chat_react(uuid, text, bigint, text), public.lm_chat_delete(uuid, text, bigint),
  public.lm_chat_settings(uuid, text, text, boolean), public.lm_push_link(uuid, text, text),
  public.lm_chat_report(uuid, text, bigint, text)
  to anon, authenticated;
revoke all on function public.lm_chat_reports(), public.lm_chat_admin_delete(bigint), public._lm_msg_json(public.chat_msgs) from public, anon;
grant execute on function public.lm_chat_reports(), public.lm_chat_admin_delete(bigint) to authenticated;

-- ---------- cleanup: voice after 30 days ----------
create extension if not exists pg_cron;
select cron.unschedule('lm-chat-clean') where exists (select 1 from cron.job where jobname = 'lm-chat-clean');
select cron.schedule('lm-chat-clean', '17 3 * * *', $$
  delete from public.chat_voice where created < now() - interval '30 days';
  update public.chat_msgs set deleted = true where kind = 'voice' and not deleted and created < now() - interval '30 days';
$$);
