-- Living Muslim: stories in circles (22.11.2026). Paste into Supabase → SQL Editor and press Run.
-- Needs schema.sql, nicks.sql and chat.sql (already run). Safe to run again.
-- A story lives 24 hours and is seen only by the circles its author chose. Replies go to the circle chat (no private messages).
-- Photos are kept apart and removed together with the story; everything older than 25 hours is deleted every hour.

-- ---------- tables ----------
create table if not exists public.stories (
  id bigserial primary key,
  uid uuid not null references public.users(uid) on delete cascade,
  kind text not null check (kind in ('ach', 'photo', 'text', 'ayah')),
  body text not null default '',          -- caption (or the text of a text story)
  card jsonb not null default '{}'::jsonb, -- what the card shows: {"ic": "🏆", "t": "7 дней Фаджр", "s": "серия", "bg": "green"}
  circles text[] not null,                 -- the circles that see it
  w int, h int,                            -- photo size
  thumb text,                              -- tiny photo preview (data URL)
  created timestamptz not null default now()
);
create index if not exists stories_created on public.stories (created);
create index if not exists stories_uid on public.stories (uid, created);
create index if not exists stories_circles on public.stories using gin (circles);

create table if not exists public.story_photos (
  id bigint primary key references public.stories(id) on delete cascade,
  mime text not null,
  data bytea not null
);

-- Who saw a story, and the quick answer they gave (🤲 Амин, ✨ МашаАллах, 🤍 БаракАллах).
create table if not exists public.story_views (
  story bigint not null references public.stories(id) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  react text,
  at timestamptz not null default now(),
  primary key (story, uid)
);

create table if not exists public.story_reports (
  id bigserial primary key,
  story bigint references public.stories(id) on delete set null,
  author uuid,
  by_uid uuid not null references public.users(uid) on delete cascade,
  reason text not null default '',
  body text not null default '',
  created timestamptz not null default now()
);

alter table public.stories enable row level security;
alter table public.story_photos enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reports enable row level security;
revoke all on public.stories, public.story_photos, public.story_views, public.story_reports from anon, authenticated;

-- Leaving a circle (or being removed) takes your stories out of it.
create or replace function public._lm_story_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update stories set circles = array_remove(circles, old.code) where uid = old.uid and old.code = any(circles);
  delete from stories where uid = old.uid and cardinality(circles) = 0;
  return old;
end $$;
drop trigger if exists lm_story_leave on public.members;
create trigger lm_story_leave after delete on public.members for each row execute function public._lm_story_leave();

-- The circles of a story that I can see it in (I and the author are both members), or empty.
create or replace function public._lm_story_in(p_uid uuid, s public.stories) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c), '{}') from unnest(s.circles) c
  where exists (select 1 from members where code = c and uid = p_uid)
    and exists (select 1 from members where code = c and uid = s.uid);
$$;
revoke all on function public._lm_story_in(uuid, public.stories) from public, anon, authenticated;

-- ---------- reading ----------
-- Every live story I may see (mine included), oldest first, with its author and whether I saw it.
create or replace function public.lm_story_feed(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return null; end if; -- probe from the app: the function exists
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return coalesce((
    select json_agg(json_build_object('id', s.id, 'uid', s.uid, 'kind', s.kind, 'body', s.body, 'card', s.card,
      'w', s.w, 'h', s.h, 'thumb', s.thumb, 'at', s.created, 'in', x.inn,
      'photo', exists (select 1 from story_photos p where p.id = s.id),
      'seen', s.uid = p_uid or exists (select 1 from story_views v where v.story = s.id and v.uid = p_uid),
      'react', (select v.react from story_views v where v.story = s.id and v.uid = p_uid),
      'views', case when s.uid = p_uid then (select count(*) from story_views v where v.story = s.id) end,
      'name', u.name, 'color', u.color, 'avatar', u.avatar, 'pic', case when u.show_photo then u.photo else '' end, 'gender', u.gender)
      order by s.id)
    from stories s
    join users u on u.uid = s.uid
    cross join lateral (select case when s.uid = p_uid then s.circles else _lm_story_in(p_uid, s) end inn) x
    where s.created > now() - interval '24 hours'
      and cardinality(x.inn) > 0
      and not exists (select 1 from blocks b where b.uid = p_uid and b.other = s.uid)
  ), '[]'::json);
end $$;

create or replace function public.lm_story_photo(p_uid uuid, p_token text, p_id bigint) returns json
language plpgsql stable security definer set search_path = public as $$
declare s stories;
begin
  select * into s from stories where id = p_id and created > now() - interval '24 hours';
  if s.id is null or not _lm_ok(p_uid, p_token) then return null; end if;
  if s.uid <> p_uid and cardinality(_lm_story_in(p_uid, s)) = 0 then return null; end if;
  return (select json_build_object('mime', mime, 'b64', translate(encode(data, 'base64'), E'\n', '')) from story_photos where id = p_id);
end $$;

-- ---------- writing ----------
-- p_card: {ic, t, s, bg}; p_photo: base64 JPEG (shrunk on the phone), up to ~1.5 MB. Up to 10 stories a day.
create or replace function public.lm_story_add(p_uid uuid, p_token text, p_kind text, p_body text, p_card jsonb, p_circles jsonb,
  p_mime text default null, p_b64 text default null, p_w int default null, p_h int default null, p_thumb text default null) returns json
language plpgsql volatile security definer set search_path = public as $$
declare cs text[]; s stories; raw bytea;
begin
  if not _lm_ok(p_uid, p_token) then return json_build_object('error', 'auth'); end if;
  if p_kind not in ('ach', 'photo', 'text', 'ayah') then return json_build_object('error', 'kind'); end if;
  select coalesce(array_agg(distinct c), '{}') into cs from jsonb_array_elements_text(case when jsonb_typeof(p_circles) = 'array' then p_circles else '[]'::jsonb end) c where exists (select 1 from members where code = c and uid = p_uid);
  if cardinality(cs) = 0 then return json_build_object('error', 'circles'); end if;
  if (select count(*) from stories where uid = p_uid and created > now() - interval '24 hours') >= 10 then return json_build_object('error', 'day'); end if;
  if p_card is null or jsonb_typeof(p_card) <> 'object' or length(p_card::text) > 1500 then p_card := '{}'::jsonb; end if;
  if p_kind = 'photo' then
    if coalesce(p_mime, '') !~ '^image/(jpeg|png|webp)$' then return json_build_object('error', 'mime'); end if;
    if length(coalesce(p_b64, '')) > 2100000 then return json_build_object('error', 'big'); end if;
    raw := decode(p_b64, 'base64');
    if length(raw) < 100 then return json_build_object('error', 'empty'); end if;
  elsif trim(coalesce(p_body, '')) = '' and coalesce(p_card->>'t', '') = '' then
    return json_build_object('error', 'empty');
  end if;
  if length(coalesce(p_thumb, '')) > 30000 or coalesce(p_thumb, '') !~ '^data:image/(jpeg|png|webp);base64,' then p_thumb := null; end if;
  insert into stories(uid, kind, body, card, circles, w, h, thumb)
  values (p_uid, p_kind, left(trim(coalesce(p_body, '')), 500), p_card, cs,
    case when p_w between 1 and 20000 then p_w end, case when p_h between 1 and 20000 then p_h end, p_thumb)
  returning * into s;
  if raw is not null then insert into story_photos(id, mime, data) values (s.id, p_mime, raw); end if;
  return json_build_object('id', s.id, 'in', s.circles);
end $$;

-- I saw it; with p_react the quick answer too (the same answer again takes it off).
create or replace function public.lm_story_seen(p_uid uuid, p_token text, p_id bigint, p_react text default null) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare s stories;
begin
  select * into s from stories where id = p_id;
  if s.id is null or not _lm_ok(p_uid, p_token) or s.uid = p_uid then return false; end if;
  if cardinality(_lm_story_in(p_uid, s)) = 0 then return false; end if;
  insert into story_views(story, uid, react) values (p_id, p_uid, nullif(left(coalesce(p_react, ''), 24), ''))
  on conflict (story, uid) do update set react = case
    when p_react is null then story_views.react
    when story_views.react = p_react then null
    else left(p_react, 24) end;
  return true;
end $$;

-- My story: who saw it and what they answered.
create or replace function public.lm_story_viewers(p_uid uuid, p_token text, p_id bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not exists (select 1 from stories where id = p_id and uid = p_uid) then return null; end if;
  return coalesce((select json_agg(json_build_object('uid', v.uid, 'name', u.name, 'color', u.color, 'avatar', u.avatar,
      'pic', case when u.show_photo then u.photo else '' end, 'react', v.react, 'at', v.at) order by v.at desc)
    from story_views v join users u on u.uid = v.uid where v.story = p_id), '[]'::json);
end $$;

-- The author deletes the story; a circle owner takes it out of their circle.
create or replace function public.lm_story_delete(p_uid uuid, p_token text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare s stories;
begin
  select * into s from stories where id = p_id;
  if s.id is null or not _lm_ok(p_uid, p_token) then return false; end if;
  if s.uid = p_uid then delete from stories where id = p_id; return true; end if;
  if not exists (select 1 from circles where code = any(s.circles) and owner = p_uid) then return false; end if;
  update stories set circles = (select coalesce(array_agg(c), '{}') from unnest(circles) c where not exists (select 1 from circles where code = c and owner = p_uid))
  where id = p_id;
  delete from stories where id = p_id and cardinality(circles) = 0;
  return true;
end $$;

-- A complaint goes to the app owner; the text is kept in case the story is gone.
create or replace function public.lm_story_report(p_uid uuid, p_token text, p_id bigint, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare s stories;
begin
  select * into s from stories where id = p_id;
  if s.id is null or not _lm_ok(p_uid, p_token) or s.uid = p_uid or cardinality(_lm_story_in(p_uid, s)) = 0 then return false; end if;
  if exists (select 1 from story_reports where story = p_id and by_uid = p_uid) then return true; end if;
  insert into story_reports(story, author, by_uid, reason, body)
  values (p_id, s.uid, p_uid, left(coalesce(p_reason, ''), 200), left(trim(concat_ws(' · ', s.card->>'t', nullif(s.body, ''), case when s.kind = 'photo' then '[фото]' end)), 600));
  return true;
end $$;

-- Admin screen: story complaints of the last 90 days.
create or replace function public.lm_story_reports() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from lm_admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))) then return null; end if;
  return coalesce((select json_agg(json_build_object('id', r.id, 'story', r.story, 'reason', r.reason, 'body', r.body, 'at', r.created,
    'by', (select name from users where uid = r.by_uid), 'author', (select name from users where uid = r.author),
    'deleted', not exists (select 1 from stories s where s.id = r.story)) order by r.id desc)
    from story_reports r where r.created > now() - interval '90 days'), '[]'::json);
end $$;

create or replace function public.lm_story_admin_delete(p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from lm_admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))) then return false; end if;
  delete from stories where id = p_id;
  return found;
end $$;

-- ---------- rights ----------
grant execute on function
  public.lm_story_feed(uuid, text), public.lm_story_photo(uuid, text, bigint),
  public.lm_story_add(uuid, text, text, text, jsonb, jsonb, text, text, int, int, text),
  public.lm_story_seen(uuid, text, bigint, text), public.lm_story_viewers(uuid, text, bigint),
  public.lm_story_delete(uuid, text, bigint), public.lm_story_report(uuid, text, bigint, text)
  to anon, authenticated;
revoke all on function public.lm_story_reports(), public.lm_story_admin_delete(bigint) from public, anon;
grant execute on function public.lm_story_reports(), public.lm_story_admin_delete(bigint) to authenticated;

-- ---------- cleanup: every hour, stories older than 25 hours (photos and views go with them) ----------
create extension if not exists pg_cron;
select cron.unschedule('lm-stories-clean') where exists (select 1 from cron.job where jobname = 'lm-stories-clean');
select cron.schedule('lm-stories-clean', '7 * * * *', $$
  delete from public.stories where created < now() - interval '25 hours';
  delete from public.story_reports where created < now() - interval '90 days';
$$);
