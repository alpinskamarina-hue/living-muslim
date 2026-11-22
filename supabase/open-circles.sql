-- Living Muslim: open circles and the common circle «Общий круг Living Muslim».
-- Paste into Supabase → SQL Editor and press Run. Needs schema.sql, nicks.sql, chat.sql, chat-files.sql,
-- circle-kick.sql and admin.sql (already run). Safe to run again.
--
-- Open circles: an owner makes his circle visible in «Найти круг». Strangers see only the public card
-- (title, about, rules, numbers). Brothers never see sisters' circles and the other way round; a circle for
-- everyone only after the team checked it (a known teacher or mosque), and then it is text only.
-- A newcomer in an open circle writes only after 24 hours, and sends no links or files for 3 days.
-- Joining is either at once or by request; an accepted request becomes the usual circle invite.
--
-- The common circle: everyone is in it. No free chat: the Fajr counter of the day, the khatm of the month
-- (each takes a juz) and anonymous requests for dua answered with «Амин».

-- ---------- open circles ----------
create table if not exists public.circle_open (
  code text primary key references public.circles(code) on delete cascade,
  id uuid not null unique default gen_random_uuid(),   -- the public id; the circle code is never shown to strangers
  owner uuid not null references public.users(uid) on delete cascade,
  title text not null default '',
  kind text not null default '',
  about text not null default '',
  rules jsonb not null default '[]'::jsonb,
  who text not null default 'brothers' check (who in ('brothers', 'sisters', 'all')),
  wants_all boolean not null default false,            -- the owner asked for «для всех», waiting for the team
  join_mode text not null default 'ask' check (join_mode in ('open', 'ask')),
  lang text not null default 'ru',
  city text not null default '',
  max_n int not null default 30 check (max_n between 3 and 50),
  helpers uuid[] not null default '{}',
  verified boolean not null default false,
  opened timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists circle_open_who on public.circle_open (who, lang);

create table if not exists public.circle_asks (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created timestamptz not null default now(),
  answered timestamptz
);
create unique index if not exists circle_asks_one on public.circle_asks (code, uid) where status = 'pending';
create index if not exists circle_asks_code on public.circle_asks (code, status);
create index if not exists circle_asks_uid on public.circle_asks (uid, created);

alter table public.circle_open enable row level security;
alter table public.circle_asks enable row level security;
revoke all on public.circle_open, public.circle_asks from anon, authenticated;

-- These kinds may be opened. Family, umrah (it has «Ищут людей»), business and chats of two may not.
create or replace function public._lm_open_kind(k text) returns boolean
language sql immutable as $$ select coalesce(k, '') in ('brothers', 'sisters', 'study', 'masjid', 'friends', 'startup', 'other'); $$;

-- Does this open circle fit a person of gender g ('m', 'f' or '' when unknown)?
create or replace function public._lm_open_fits(o public.circle_open, g text) returns boolean
language sql immutable as $$
  select case o.who when 'brothers' then g = 'm' when 'sisters' then g = 'f' else o.verified end;
$$;

-- My gender: the one in my profile, else the one the app asked for.
create or replace function public._lm_gender(p_uid uuid, p_token text, p_gender text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select gender from users where uid = p_uid and _lm_ok(p_uid, p_token)), ''),
    case when p_gender in ('m', 'f') then p_gender else '' end);
$$;

-- Members of a circle who did something today (their day summary in the circle).
create or replace function public._lm_open_today(p_code text, p_day text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from docs d join members m on m.code = d.code and m.uid = d.key
  where d.code = p_code and d.coll = 'circle' and d.data->>'day' = p_day
    and (coalesce((d.data->>'prayers')::int, 0) > 0 or coalesce((d.data->>'done')::int, 0) > 0);
$$;

-- Fajr on time over the last 7 days, in percent of all member-days.
create or replace function public._lm_open_fajr(p_code text, p_day text) returns int
language sql stable security definer set search_path = public as $$
  select case when count(distinct m.uid) = 0 then 0 else
    least(100, round(100.0 * coalesce(sum((select count(*) from jsonb_array_elements_text(coalesce(d.data->'fj', '[]'::jsonb)) x
      where x >= to_char(p_day::date - 6, 'YYYY-MM-DD') and x <= p_day)), 0) / (count(distinct m.uid) * 7)))::int end
  from members m left join docs d on d.code = m.code and d.key = m.uid and d.coll = 'circle'
  where m.code = p_code;
$$;

create or replace function public._lm_open_card(o public.circle_open, p_uid uuid, p_day text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'about', o.about, 'who', o.who, 'join', o.join_mode,
    'lang', o.lang, 'city', o.city, 'max', o.max_n, 'verified', o.verified,
    'n', (select count(*) from members where code = o.code),
    'today', _lm_open_today(o.code, p_day),
    'member', exists (select 1 from members where code = o.code and uid = p_uid),
    'asked', (select status from circle_asks where code = o.code and uid = p_uid order by created desc limit 1));
$$;
revoke all on function public._lm_gender(uuid, text, text), public._lm_open_today(text, text), public._lm_open_fajr(text, text),
  public._lm_open_card(public.circle_open, uuid, text) from public, anon, authenticated;

-- The catalog. Works without an account too (then p_gender decides what is shown).
create or replace function public.lm_open_list(p_uid uuid, p_token text, p_gender text, p_day text) returns json
language plpgsql stable security definer set search_path = public as $$
declare g text := _lm_gender(p_uid, p_token, p_gender); me uuid := case when _lm_ok(p_uid, p_token) then p_uid else null end;
begin
  return coalesce((select json_agg(c order by (c->>'verified')::boolean desc, (c->>'today')::int desc, (c->>'n')::int desc) from (
    select _lm_open_card(o, me, coalesce(p_day, to_char(now(), 'YYYY-MM-DD'))) c
    from circle_open o
    where _lm_open_fits(o, g)
      and (me is null or (not _lm_blocked(me, o.owner) and not exists (select 1 from circle_bans b where b.code = o.code and b.uid = me)))
    limit 200
  ) x), '[]'::json);
end $$;

-- One open circle before joining: the card, rules, the amir's first name and the week's Fajr.
create or replace function public.lm_open_view(p_uid uuid, p_token text, p_gender text, p_id uuid, p_day text) returns json
language plpgsql stable security definer set search_path = public as $$
declare o circle_open; g text := _lm_gender(p_uid, p_token, p_gender); me uuid := case when _lm_ok(p_uid, p_token) then p_uid else null end;
  d text := coalesce(p_day, to_char(now(), 'YYYY-MM-DD'));
begin
  select * into o from circle_open where id = p_id;
  if o.code is null or not _lm_open_fits(o, g) then return null; end if;
  if me is not null and _lm_blocked(me, o.owner) then return null; end if;
  return (_lm_open_card(o, me, d) || jsonb_build_object(
    'rules', o.rules,
    'amir', (select coalesce(nullif(u.nick, ''), split_part(u.name, ' ', 1)) from users u where u.uid = o.owner),
    'fajr', _lm_open_fajr(o.code, d),
    'days', greatest(1, (now()::date - (select created from circles where code = o.code)::date) + 1),
    'code', case when me is not null and exists (select 1 from members where code = o.code and uid = me) then o.code end
  ))::json;
end $$;

-- Join an open circle, or ask to join one that is by request.
-- {r: 'ok', code, title, kind} | {r: 'asked'} | {r: 'full' | 'closed' | 'banned' | 'auth'}
create or replace function public.lm_open_join(p_uid uuid, p_token text, p_id uuid, p_note text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare o circle_open; g text;
begin
  if not _lm_ok(p_uid, p_token) then return json_build_object('r', 'auth'); end if;
  select * into o from circle_open where id = p_id;
  g := _lm_gender(p_uid, p_token, '');
  if o.code is null or not _lm_open_fits(o, g) or _lm_blocked(p_uid, o.owner) then return json_build_object('r', 'closed'); end if;
  if exists (select 1 from circle_bans where code = o.code and uid = p_uid) then return json_build_object('r', 'banned'); end if;
  if exists (select 1 from members where code = o.code and uid = p_uid) then
    return json_build_object('r', 'ok', 'code', o.code, 'title', o.title, 'kind', o.kind);
  end if;
  if (select count(*) from members where code = o.code) >= o.max_n then return json_build_object('r', 'full'); end if;
  if o.join_mode = 'open' then
    insert into members(code, uid, title, kind) values (o.code, p_uid, o.title, o.kind) on conflict do nothing;
    return json_build_object('r', 'ok', 'code', o.code, 'title', o.title, 'kind', o.kind);
  end if;
  if (select count(*) from circle_asks where uid = p_uid and created > now() - interval '1 day') >= 10 then return json_build_object('r', 'often'); end if;
  insert into circle_asks(code, uid, note) values (o.code, p_uid, left(trim(coalesce(p_note, '')), 200))
  on conflict (code, uid) where status = 'pending' do update set note = excluded.note;
  return json_build_object('r', 'asked');
end $$;

create or replace function public.lm_open_ask_cancel(p_uid uuid, p_token text, p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update circle_asks set status = 'cancelled', answered = now()
  where uid = p_uid and status = 'pending' and code = (select code from circle_open where id = p_id);
  return found;
end $$;

-- Owner or a helper of this circle?
create or replace function public._lm_open_boss(p_uid uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select owner from circles where code = p_code) = p_uid
      or exists (select 1 from circle_open where code = p_code and p_uid = any(helpers));
$$;
revoke all on function public._lm_open_boss(uuid, text) from public, anon, authenticated;

-- Settings and requests, for the owner and helpers. Also says what this circle may do.
create or replace function public.lm_open_mine(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare o circle_open; m members; ow uuid;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_open_boss(p_uid, p_code) then return null; end if;
  select * into o from circle_open where code = p_code;
  ow := (select owner from circles where code = p_code);
  select * into m from members where code = p_code and uid = ow;
  return json_build_object(
    'owner', ow = p_uid,
    'can', _lm_open_kind(m.kind),
    'kind', m.kind,
    'gender', (select gender from users where uid = ow),
    'open', case when o.code is null then null else json_build_object('id', o.id, 'about', o.about, 'rules', o.rules, 'who', o.who, 'wants_all', o.wants_all,
      'join', o.join_mode, 'lang', o.lang, 'city', o.city, 'max', o.max_n, 'helpers', o.helpers, 'verified', o.verified) end,
    'asks', coalesce((select json_agg(json_build_object('id', a.id, 'uid', a.uid, 'name', u.name, 'nick', u.nick, 'color', u.color, 'avatar', u.avatar,
        'city', coalesce(to_jsonb(u)->>'city', ''), 'since', u.created, 'note', a.note, 'created', a.created) order by a.created)
      from circle_asks a join users u on u.uid = a.uid where a.code = p_code and a.status = 'pending' and not _lm_blocked(p_uid, a.uid)), '[]'::json),
    'members', coalesce((select json_agg(json_build_object('uid', u.uid, 'name', u.name)) from members x join users u on u.uid = x.uid
      where x.code = p_code and x.uid <> ow), '[]'::json)
  );
end $$;

-- Circles where people are waiting for my answer (I am the owner or a helper).
create or replace function public.lm_open_pending(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  return coalesce((select json_agg(json_build_object('code', a.code, 'title', o.title, 'n', a.n)) from (
    select code, count(*)::int n from circle_asks where status = 'pending' group by code) a
    join circle_open o on o.code = a.code
    where _lm_open_boss(p_uid, a.code)), '[]'::json);
end $$;

-- Open, change or close (p = null) my circle in the catalog. Only the owner.
-- 'ok' | 'auth' | 'not_owner' | 'kind' | 'gender'
create or replace function public.lm_open_set(p_uid uuid, p_token text, p_code text, p jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare m members; g text; w text; v boolean; hs uuid[]; rs jsonb;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if (select owner from circles where code = p_code) is distinct from p_uid then return 'not_owner'; end if;
  if p is null then
    delete from circle_open where code = p_code;
    update circle_asks set status = 'declined', answered = now() where code = p_code and status = 'pending';
    return 'ok';
  end if;
  select * into m from members where code = p_code and uid = p_uid;
  if not _lm_open_kind(m.kind) then return 'kind'; end if;
  g := (select gender from users where uid = p_uid);
  if g not in ('m', 'f') then return 'gender'; end if;
  w := case when p->>'who' in ('brothers', 'sisters', 'all') then p->>'who' else case g when 'f' then 'sisters' else 'brothers' end end;
  if m.kind = 'sisters' then w := 'sisters'; end if;
  if m.kind = 'brothers' then w := 'brothers'; end if;
  if (w = 'sisters' and g <> 'f') or (w = 'brothers' and g <> 'm') then return 'gender'; end if;
  v := coalesce((select verified from circle_open where code = p_code), false);
  select coalesce(array_agg(x::uuid), '{}') into hs from (
    select x from jsonb_array_elements_text(coalesce(p->'helpers', '[]'::jsonb)) x
    where x ~ '^[0-9a-f-]{36}$' and exists (select 1 from members where code = p_code and uid = x::uuid) and x::uuid <> p_uid limit 3) h;
  select coalesce(jsonb_agg(left(trim(r), 120)), '[]'::jsonb) into rs from (
    select r from jsonb_array_elements_text(case when jsonb_typeof(p->'rules') = 'array' then p->'rules' else '[]'::jsonb end) r where trim(r) <> '' limit 5) q;
  insert into circle_open(code, owner, title, kind, about, rules, who, wants_all, join_mode, lang, city, max_n, helpers)
  values (p_code, p_uid, m.title, m.kind, left(trim(coalesce(p->>'about', '')), 300), rs,
    case when w = 'all' and not v then case g when 'f' then 'sisters' else 'brothers' end else w end,
    w = 'all',
    case when p->>'join' = 'open' then 'open' else 'ask' end,
    case when p->>'lang' in ('ru', 'en') then p->>'lang' else 'ru' end,
    left(trim(coalesce(p->>'city', '')), 40),
    least(50, greatest(3, coalesce((p->>'max')::int, 30))), hs)
  on conflict (code) do update set title = excluded.title, kind = excluded.kind, about = excluded.about, rules = excluded.rules,
    who = excluded.who, wants_all = excluded.wants_all, join_mode = excluded.join_mode, lang = excluded.lang, city = excluded.city,
    max_n = excluded.max_n, helpers = excluded.helpers, updated = now();
  -- a circle for everyone is text only
  update circles set chat_voice = false where code = p_code and w = 'all' and v;
  return 'ok';
end $$;

-- Accept (becomes a circle invite in their inbox) or decline a request. Owner or helper.
-- 'ok' | 'full' | 'gone' | 'auth'
create or replace function public.lm_open_answer(p_uid uuid, p_token text, p_ask uuid, p_yes boolean) returns text
language plpgsql volatile security definer set search_path = public as $$
declare a circle_asks; o circle_open;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  select * into a from circle_asks where id = p_ask and status = 'pending';
  if a.id is null or not _lm_open_boss(p_uid, a.code) then return 'gone'; end if;
  if not p_yes then
    update circle_asks set status = 'declined', answered = now() where id = p_ask;
    return 'ok';
  end if;
  select * into o from circle_open where code = a.code;
  if (select count(*) from members where code = a.code) >= coalesce(o.max_n, 50) then return 'full'; end if;
  if not exists (select 1 from members where code = a.code and uid = a.uid) then
    insert into invites(code, from_uid, to_uid, title, kind) values (a.code, p_uid, a.uid, coalesce(o.title, ''), coalesce(o.kind, ''))
    on conflict (code, to_uid) where status = 'pending' do nothing;
  end if;
  update circle_asks set status = 'accepted', answered = now() where id = p_ask;
  return 'ok';
end $$;

-- What applies to me in this circle's chat: newcomer wait, links, text only, am I a helper.
create or replace function public.lm_open_me(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare o circle_open; j timestamptz; boss boolean;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into o from circle_open where code = p_code;
  if o.code is null then return json_build_object('open', false); end if;
  select joined into j from members where code = p_code and uid = p_uid;
  boss := _lm_open_boss(p_uid, p_code);
  return json_build_object('open', true, 'id', o.id, 'who', o.who, 'helper', p_uid = any(o.helpers), 'boss', boss,
    'write_at', case when boss or j is null then null else j + interval '24 hours' end,
    'links_at', case when boss or j is null then null else j + interval '3 days' end,
    'text_only', o.who = 'all' and o.verified and not boss);
end $$;

-- The server side of the newcomer rules: whatever path sends a message, it is checked here.
create or replace function public._lm_open_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare o circle_open; j timestamptz;
begin
  select * into o from circle_open where code = new.code;
  if o.code is null or _lm_open_boss(new.uid, new.code) then return new; end if;
  select joined into j from members where code = new.code and uid = new.uid;
  if j is null then return new; end if;
  if new.kind <> 'event' and now() < j + interval '24 hours' then raise exception 'open_wait'; end if;
  if now() < j + interval '3 days' and (new.kind in ('photo', 'file')
      or coalesce(new.body, '') ~* '(https?://|www\.|t\.me/|wa\.me/|\m[a-z0-9-]+\.(com|ru|net|org|io|me|app|link)\M)') then raise exception 'open_links'; end if;
  if o.who = 'all' and o.verified and new.kind in ('voice', 'photo', 'file') then raise exception 'open_text'; end if;
  return new;
end $$;
drop trigger if exists lm_open_guard on public.chat_msgs;
create trigger lm_open_guard before insert on public.chat_msgs for each row execute function public._lm_open_guard();

-- Helpers may delete messages too (same as chat-files.sql, plus helpers).
create or replace function public.lm_chat_delete(p_uid uuid, p_token text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs;
begin
  select * into m from chat_msgs where id = p_id;
  if m.id is null or not _lm_ok(p_uid, p_token) then return false; end if;
  if m.uid <> p_uid and not _lm_open_boss(p_uid, m.code) then return false; end if;
  update chat_msgs set deleted = true, body = '', bars = null, file = null, reacts = '{}'::jsonb where id = p_id;
  delete from chat_voice where id = p_id;
  delete from chat_files where id = p_id;
  return true;
end $$;

-- Helpers may remove people too, but never the owner or another helper (same as circle-kick.sql otherwise).
create or replace function public.lm_kick(p_uid uuid, p_token text, p_code text, p_other uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare ow uuid;
begin
  if p_uid is null or not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  ow := (select owner from circles where code = p_code);
  if not _lm_open_boss(p_uid, p_code) then return 'not_owner'; end if;
  if p_other = p_uid then return 'self'; end if;
  if p_other = ow or (ow <> p_uid and _lm_open_boss(p_other, p_code)) then return 'not_owner'; end if;
  insert into circle_bans(code, uid) values (p_code, p_other) on conflict do nothing;
  delete from docs where code = p_code and key = p_other;
  delete from members where code = p_code and uid = p_other;
  update invites set status = 'declined' where code = p_code and to_uid = p_other and status = 'pending';
  update circle_asks set status = 'declined', answered = now() where code = p_code and uid = p_other and status = 'pending';
  return 'ok';
end $$;

-- ---------- the common circle ----------
create table if not exists public.common_marks (
  day text not null,
  uid uuid not null references public.users(uid) on delete cascade,
  primary key (day, uid)
);
create table if not exists public.common_khatm (
  month text not null,                -- 'YYYY-MM'
  juz int not null check (juz between 1 and 30),
  uid uuid not null references public.users(uid) on delete cascade,
  done boolean not null default false,
  taken timestamptz not null default now(),
  primary key (month, juz)
);
create index if not exists common_khatm_uid on public.common_khatm (uid, month);
create table if not exists public.common_dua (
  id bigserial primary key,
  uid uuid not null references public.users(uid) on delete cascade,
  body text not null,
  amin int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created timestamptz not null default now()
);
create index if not exists common_dua_created on public.common_dua (created desc);
create table if not exists public.common_amin (
  id bigint not null references public.common_dua(id) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  primary key (id, uid)
);
create table if not exists public.common_dua_reports (
  id bigint not null references public.common_dua(id) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  primary key (id, uid)
);
alter table public.common_marks enable row level security;
alter table public.common_khatm enable row level security;
alter table public.common_dua enable row level security;
alter table public.common_amin enable row level security;
alter table public.common_dua_reports enable row level security;
revoke all on public.common_marks, public.common_khatm, public.common_dua, public.common_amin, public.common_dua_reports from anon, authenticated;

-- Everything the common circle shows. Without an account: only the numbers.
create or replace function public.lm_common(p_uid uuid, p_token text, p_day text, p_month text) returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := case when _lm_ok(p_uid, p_token) then p_uid else null end;
begin
  return json_build_object(
    'people', (select count(*) from users),
    'fajr', (select count(*) from common_marks where day = p_day),
    'marked', me is not null and exists (select 1 from common_marks where day = p_day and uid = me),
    'khatm', coalesce((select json_agg(json_build_object('juz', juz, 'done', done, 'mine', uid = me) order by juz) from common_khatm where month = p_month), '[]'::json),
    'dua', coalesce((select json_agg(json_build_object('id', d.id, 'body', d.body, 'amin', d.amin, 'created', d.created, 'mine', d.uid = me,
        'said', me is not null and exists (select 1 from common_amin a where a.id = d.id and a.uid = me)) order by d.created desc)
      from (select * from common_dua where not hidden and created > now() - interval '7 days'
        and (me is null or not exists (select 1 from common_dua_reports r where r.id = common_dua.id and r.uid = me))
        order by created desc limit 40) d), '[]'::json)
  );
end $$;

create or replace function public.lm_common_mark(p_uid uuid, p_token text, p_day text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or p_day !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  if abs(p_day::date - now()::date) > 1 then return false; end if;
  insert into common_marks(day, uid) values (p_day, p_uid) on conflict do nothing;
  return true;
end $$;

-- Take a juz, mark it read, or give it back. One juz at a time that is not read yet.
-- 'ok' | 'taken' | 'one' | 'auth'
create or replace function public.lm_common_juz(p_uid uuid, p_token text, p_month text, p_juz int, p_act text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or p_month !~ '^\d{4}-\d{2}$' or p_juz not between 1 and 30 then return 'auth'; end if;
  if p_act = 'take' then
    if exists (select 1 from common_khatm where month = p_month and uid = p_uid and not done) then return 'one'; end if;
    insert into common_khatm(month, juz, uid) values (p_month, p_juz, p_uid) on conflict do nothing;
    return case when found then 'ok' else 'taken' end;
  elsif p_act = 'done' then
    update common_khatm set done = true where month = p_month and juz = p_juz and uid = p_uid;
  elsif p_act = 'drop' then
    delete from common_khatm where month = p_month and juz = p_juz and uid = p_uid and not done;
  end if;
  return 'ok';
end $$;

-- Ask for dua anonymously. 'ok' | 'new' (account younger than a day) | 'often' | 'link' | 'short' | 'auth'
create or replace function public.lm_common_dua_add(p_uid uuid, p_token text, p_body text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare b text := left(regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g'), 200);
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if length(b) < 5 then return 'short'; end if;
  if (select created from users where uid = p_uid) > now() - interval '24 hours' then return 'new'; end if;
  if exists (select 1 from common_dua where uid = p_uid and created > now() - interval '24 hours') then return 'often'; end if;
  if b ~* '(https?://|www\.|t\.me/|wa\.me/|@[a-z0-9_]{3,}|\+?\d[\d ()-]{7,})' then return 'link'; end if;
  insert into common_dua(uid, body) values (p_uid, b);
  return 'ok';
end $$;

create or replace function public.lm_common_amin(p_uid uuid, p_token text, p_id bigint) returns int
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  insert into common_amin(id, uid) values (p_id, p_uid) on conflict do nothing;
  if found then update common_dua set amin = amin + 1 where id = p_id; end if;
  return (select amin from common_dua where id = p_id);
end $$;

-- A complaint hides the request for me at once, and for everyone after 3 complaints.
create or replace function public.lm_common_report(p_uid uuid, p_token text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  insert into common_dua_reports(id, uid) values (p_id, p_uid) on conflict do nothing;
  if found then update common_dua set reports = reports + 1, hidden = hidden or reports + 1 >= 3 where id = p_id; end if;
  return true;
end $$;

create or replace function public.lm_common_dua_del(p_uid uuid, p_token text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  delete from common_dua where id = p_id and uid = p_uid;
  return found;
end $$;

-- ---------- for the owner of the app (signed-in email in lm_admins) ----------
create or replace function public.lm_admin_open() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return json_build_object(
    'circles', coalesce((select json_agg(json_build_object('code', o.code, 'title', o.title, 'kind', o.kind, 'about', o.about, 'who', o.who,
        'wants_all', o.wants_all, 'verified', o.verified, 'join', o.join_mode, 'city', o.city, 'lang', o.lang,
        'n', (select count(*) from members where code = o.code), 'owner', u.name, 'nick', u.nick, 'opened', o.opened)
      order by (o.wants_all and not o.verified) desc, o.opened desc) from circle_open o join users u on u.uid = o.owner), '[]'::json),
    'dua', coalesce((select json_agg(json_build_object('id', id, 'body', body, 'reports', reports, 'hidden', hidden, 'created', created) order by created desc)
      from (select * from common_dua where reports > 0 order by created desc limit 50) d), '[]'::json)
  );
end $$;

-- Check a circle for everyone (a known teacher or mosque): it becomes visible to all, text only. Or take the mark back.
create or replace function public.lm_admin_open_verify(p_code text, p_ok boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare g text;
begin
  if not _lm_is_admin() then return false; end if;
  g := (select u.gender from circle_open o join users u on u.uid = o.owner where o.code = p_code);
  update circle_open set verified = p_ok,
    who = case when p_ok and wants_all then 'all' when not p_ok and who = 'all' then case g when 'f' then 'sisters' else 'brothers' end else who end,
    updated = now()
  where code = p_code;
  if p_ok then update circles set chat_voice = false where code = p_code and (select who from circle_open where code = p_code) = 'all'; end if;
  return found;
end $$;

create or replace function public.lm_admin_open_close(p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return false; end if;
  delete from circle_open where code = p_code;
  return found;
end $$;

create or replace function public.lm_admin_dua(p_id bigint, p_hide boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return false; end if;
  if p_hide is null then delete from common_dua where id = p_id; return found; end if;
  update common_dua set hidden = p_hide, reports = case when p_hide then reports else 0 end where id = p_id;
  return found;
end $$;

revoke all on function public.lm_open_list(uuid,text,text,text), public.lm_open_view(uuid,text,text,uuid,text), public.lm_open_join(uuid,text,uuid,text),
  public.lm_open_ask_cancel(uuid,text,uuid), public.lm_open_mine(uuid,text,text), public.lm_open_set(uuid,text,text,jsonb),
  public.lm_open_answer(uuid,text,uuid,boolean), public.lm_open_me(uuid,text,text), public.lm_open_pending(uuid,text),
  public.lm_common(uuid,text,text,text), public.lm_common_mark(uuid,text,text), public.lm_common_juz(uuid,text,text,int,text),
  public.lm_common_dua_add(uuid,text,text), public.lm_common_amin(uuid,text,bigint), public.lm_common_report(uuid,text,bigint),
  public.lm_common_dua_del(uuid,text,bigint), public.lm_admin_open(), public.lm_admin_open_verify(text,boolean),
  public.lm_admin_open_close(text), public.lm_admin_dua(bigint,boolean) from public;
grant execute on function public.lm_open_list(uuid,text,text,text), public.lm_open_view(uuid,text,text,uuid,text), public.lm_open_join(uuid,text,uuid,text),
  public.lm_open_ask_cancel(uuid,text,uuid), public.lm_open_mine(uuid,text,text), public.lm_open_set(uuid,text,text,jsonb),
  public.lm_open_answer(uuid,text,uuid,boolean), public.lm_open_me(uuid,text,text), public.lm_open_pending(uuid,text),
  public.lm_common(uuid,text,text,text), public.lm_common_mark(uuid,text,text), public.lm_common_juz(uuid,text,text,int,text),
  public.lm_common_dua_add(uuid,text,text), public.lm_common_amin(uuid,text,bigint), public.lm_common_report(uuid,text,bigint),
  public.lm_common_dua_del(uuid,text,bigint), public.lm_kick(uuid,text,text,uuid), public.lm_chat_delete(uuid,text,bigint) to anon, authenticated;
grant execute on function public.lm_admin_open(), public.lm_admin_open_verify(text,boolean), public.lm_admin_open_close(text), public.lm_admin_dua(bigint,boolean) to authenticated;

select 'open circles ready' as status;
