-- Living Muslim: the assistant in circle chats («@Марьям, напомни…»). Run after chat.sql and chat-files.sql.
-- Paste into Supabase → SQL Editor and press Run. Safe to run again.
-- The assistant answers only messages that call it; its answer is posted by the server (/api/circle-ai) as a
-- message of kind 'ai' on behalf of the person who asked. Reminders it sets are pushed by /api/push-tick.

alter table public.chat_msgs drop constraint if exists chat_msgs_kind_check;
alter table public.chat_msgs add constraint chat_msgs_kind_check check (kind in ('text', 'voice', 'event', 'photo', 'file', 'ai'));
-- The circle owner (amir) can switch the assistant off, and choose who may ask it to remind everyone.
alter table public.circles add column if not exists ai_on boolean not null default true;
alter table public.circles add column if not exists ai_all text not null default 'owner' check (ai_all in ('owner', 'all'));

-- Reminders set in a circle: for one person (uid) or for everyone (uid null), minus those who said «не напоминать мне».
create table if not exists public.chat_ai_pings (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  msg_id bigint not null references public.chat_msgs(id) on delete cascade,
  uid uuid references public.users(uid) on delete cascade,
  at timestamptz not null,
  body text not null,
  skip uuid[] not null default '{}',
  created timestamptz not null default now()
);
create index if not exists chat_ai_pings_at on public.chat_ai_pings (at);
create index if not exists chat_ai_pings_msg on public.chat_ai_pings (msg_id);
create table if not exists public.chat_ai_sent (
  ping_id bigint not null references public.chat_ai_pings(id) on delete cascade,
  endpoint text not null,
  primary key (ping_id, endpoint)
);
alter table public.chat_ai_pings enable row level security;
alter table public.chat_ai_sent enable row level security;
revoke all on public.chat_ai_pings, public.chat_ai_sent from anon, authenticated;

-- Settings of the assistant in one circle (any member reads; p_uid null = probe that this file was run).
create or replace function public.lm_chat_ai_get(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return null; end if;
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return null; end if;
  return (select json_build_object('on', ai_on, 'all', ai_all) from circles where code = p_code);
end $$;

create or replace function public.lm_chat_ai_set(p_uid uuid, p_token text, p_code text, p_on boolean, p_all text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update circles set ai_on = coalesce(p_on, ai_on), ai_all = case when p_all in ('owner', 'all') then p_all else ai_all end
  where code = p_code and owner = p_uid;
  return found;
end $$;

-- For the server: is this person a member, is the assistant on here, are they the owner, who is in the circle.
create or replace function public.lm_chat_ai_ctx(p_secret text, p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return json_build_object('ok', false); end if;
  return (select json_build_object('ok', true, 'on', c.ai_on, 'all', c.ai_all, 'owner', c.owner = p_uid,
    'n', (select count(*) from members where code = p_code),
    'today', (select count(*) from chat_msgs where uid = p_uid and kind = 'ai' and created > now() - interval '1 day'),
    'me', (select name from users where uid = p_uid))
    from circles c where c.code = p_code);
end $$;

-- For the server: post the assistant's answer and the reminder it set.
-- p_ping: {"at": "<iso>", "body": "...", "all": true|false}
create or replace function public.lm_chat_ai_post(p_secret text, p_uid uuid, p_code text, p_body text, p_ref jsonb, p_ping jsonb) returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs; b text := left(trim(coalesce(p_body, '')), 2000); all_ boolean := coalesce((p_ping->>'all')::boolean, false);
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  if not _lm_member(p_uid, p_code) or b = '' then return null; end if;
  if all_ and not exists (select 1 from circles where code = p_code and (owner = p_uid or ai_all = 'all')) then all_ := false; end if;
  if p_ref is not null and length(p_ref::text) > 600 then p_ref := null; end if;
  insert into chat_msgs(code, uid, kind, body, ref) values (p_code, p_uid, 'ai', b, p_ref) returning * into m;
  if p_ping is not null and (p_ping->>'at') is not null then
    insert into chat_ai_pings(code, msg_id, uid, at, body)
    values (p_code, m.id, case when all_ then null else p_uid end, (p_ping->>'at')::timestamptz, left(coalesce(p_ping->>'body', b), 200));
  end if;
  return _lm_msg_json(m);
end $$;

-- A member under an assistant reminder: «Мне тоже» (me), «Не напоминать мне» (skip), «Напоминать снова» (unskip),
-- «Отменить» (cancel: the one who asked or the owner).
create or replace function public.lm_chat_ai_ping(p_uid uuid, p_token text, p_msg bigint, p_act text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs; p chat_ai_pings;
begin
  if not _lm_ok(p_uid, p_token) then return json_build_object('error', 'auth'); end if;
  select * into m from chat_msgs where id = p_msg and kind = 'ai';
  if m.id is null or not _lm_member(p_uid, m.code) then return json_build_object('error', 'auth'); end if;
  select * into p from chat_ai_pings where msg_id = p_msg and (uid is null or uid = m.uid) order by id limit 1;
  if p.id is null then return json_build_object('error', 'gone'); end if;
  if p_act = 'me' then
    if p.uid is null then update chat_ai_pings set skip = array_remove(skip, p_uid) where id = p.id;
    elsif not exists (select 1 from chat_ai_pings where msg_id = p_msg and uid = p_uid) then
      insert into chat_ai_pings(code, msg_id, uid, at, body) values (p.code, p_msg, p_uid, p.at, p.body);
    end if;
  elsif p_act = 'notme' then
    if p.uid is null then update chat_ai_pings set skip = array_append(array_remove(skip, p_uid), p_uid) where id = p.id;
    else delete from chat_ai_pings where msg_id = p_msg and uid = p_uid; end if;
  elsif p_act = 'cancel' then
    if p_uid <> m.uid and not exists (select 1 from circles where code = m.code and owner = p_uid) then return json_build_object('error', 'owner'); end if;
    delete from chat_ai_pings where msg_id = p_msg;
  else return json_build_object('error', 'act'); end if;
  return json_build_object('ok', true);
end $$;

-- Live reminders of assistant messages in this circle, and whether each is on for me (to show the buttons right).
create or replace function public.lm_chat_ai_mine(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return null; end if;
  return coalesce((select json_agg(x) from (
    select msg_id as msg, bool_or(uid is null) as "all", bool_or(coalesce(uid = p_uid, false) or (uid is null and not (p_uid = any(skip)))) as "on"
    from chat_ai_pings where code = p_code and at > now() - interval '1 day' group by msg_id) x), '[]'::json);
end $$;

-- For /api/push-tick: assistant reminders due in this window, one row per phone that should get it.
create or replace function public.lm_chat_ai_due(p_secret text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  return coalesce((
    select json_agg(json_build_object('id', p.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'body', p.body, 'title', mb.title, 'code', p.code, 'lang', s.prefs->>'lang'))
    from chat_ai_pings p
    join members mb on mb.code = p.code and (p.uid is null or mb.uid = p.uid) and not (mb.uid = any(p.skip))
    join push_subs s on s.uid = mb.uid
    where p.at <= now() and p.at > now() - interval '20 minutes'
      and not exists (select 1 from chat_ai_sent x where x.ping_id = p.id and x.endpoint = s.endpoint)
  ), '[]'::json);
end $$;

create or replace function public.lm_chat_ai_sent_mark(p_secret text, p_id bigint, p_endpoint text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return; end if;
  insert into chat_ai_sent(ping_id, endpoint) values (p_id, p_endpoint) on conflict do nothing;
end $$;

revoke all on function public.lm_chat_ai_ctx(text, uuid, text, text) from public;
revoke all on function public.lm_chat_ai_post(text, uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.lm_chat_ai_due(text) from public;
revoke all on function public.lm_chat_ai_sent_mark(text, bigint, text) from public;
grant execute on function public.lm_chat_ai_get(uuid, text, text), public.lm_chat_ai_set(uuid, text, text, boolean, text),
  public.lm_chat_ai_ping(uuid, text, bigint, text), public.lm_chat_ai_mine(uuid, text, text),
  public.lm_chat_ai_ctx(text, uuid, text, text), public.lm_chat_ai_post(text, uuid, text, text, jsonb, jsonb),
  public.lm_chat_ai_due(text), public.lm_chat_ai_sent_mark(text, bigint, text) to anon, authenticated;
