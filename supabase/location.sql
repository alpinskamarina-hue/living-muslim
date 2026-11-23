-- Living Muslim: location in circle chats («Место»). Run after chat.sql and dm.sql. Paste into Supabase → SQL Editor → Run.
-- Safe to run again.
-- A single point is an ordinary chat message (ref {"t": "loc", ...}). Live sharing for 15 min / 1 hour / «до встречи»
-- keeps only the latest point per person and circle here; it is removed when the time is up or the person stops.
-- No history of movements is kept anywhere.

create table if not exists public.chat_live (
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  until timestamptz not null,
  upd timestamptz not null default now(),
  primary key (code, uid)
);
alter table public.chat_live enable row level security;
revoke all on public.chat_live from anon, authenticated;

-- The circle owner can switch «Место» off (for example in mixed circles), like voice messages.
alter table public.circles add column if not exists chat_loc boolean not null default true;

-- Who shares their place in this circle right now. p_uid null = probe from the app (the function exists).
create or replace function public.lm_loc_get(p_uid uuid, p_token text, p_code text) returns json
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_uid is null then return null; end if;
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return null; end if;
  delete from chat_live where until < now();
  return json_build_object(
    'on', (select chat_loc from circles where code = p_code),
    'live', coalesce((select json_agg(json_build_object('uid', l.uid, 'lat', l.lat, 'lng', l.lng, 'until', l.until, 'upd', l.upd))
      from chat_live l join members m on m.code = l.code and m.uid = l.uid where l.code = p_code), '[]'::json));
end $$;

-- My current point while sharing (every 20–30 s while the app is open). p_until null or past = stop and remove.
create or replace function public.lm_loc_set(p_uid uuid, p_token text, p_code text, p_lat double precision, p_lng double precision, p_until timestamptz) returns json
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return json_build_object('error', 'auth'); end if;
  if p_until is null or p_until <= now() then
    delete from chat_live where code = p_code and uid = p_uid;
    return json_build_object('ok', true);
  end if;
  if not (select chat_loc from circles where code = p_code) then return json_build_object('error', 'loc_off'); end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return json_build_object('error', 'bad'); end if;
  insert into chat_live(code, uid, lat, lng, until, upd)
  values (p_code, p_uid, round(p_lat::numeric, 4)::float8, round(p_lng::numeric, 4)::float8, least(p_until, now() + interval '8 hours'), now())
  on conflict (code, uid) do update set lat = excluded.lat, lng = excluded.lng, until = excluded.until, upd = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.lm_loc_setting(p_uid uuid, p_token text, p_code text, p_on boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare ok boolean;
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update circles set chat_loc = p_on where code = p_code and owner = p_uid;
  ok := found;
  if ok and not p_on then delete from chat_live where code = p_code; end if;
  return ok;
end $$;

-- Personal messages (dm.sql): a place, like photos and files, only after the other person has written.
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
    and (new.kind in ('photo', 'file') or coalesce(new.ref->>'t', '') = 'loc'
      or coalesce(new.body, '') ~* '(https?://|www\.|t\.me/|wa\.me/|\m[a-z0-9-]+\.(com|ru|net|org|io|me|app|link)\M)') then
    raise exception 'dm_first';
  end if;
  return new;
end $$;

grant execute on function public.lm_loc_get(uuid, text, text), public.lm_loc_set(uuid, text, text, double precision, double precision, timestamptz),
  public.lm_loc_setting(uuid, text, text, boolean) to anon, authenticated;
