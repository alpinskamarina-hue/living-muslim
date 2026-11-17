-- Living Muslim: «Никах через свои круги».
-- A person (with their wali) fills a short profile without photo or contacts and chooses which of their circles
-- and which trusted people (an imam) may see it. Someone who knows a suitable family asks that family first, then
-- sends a short anonymous profile to the seeker and the wali. Families talk; strangers never chat in the app.
-- Run once in Supabase SQL Editor after schema.sql and nicks.sql. Safe to run again.

create table if not exists public.nikah_profiles (
  uid uuid primary key references public.users(uid) on delete cascade,
  gender text not null check (gender in ('m', 'f')),
  data jsonb not null default '{}'::jsonb,       -- age, city, prayer, madhab, kids, move, work
  about text not null default '' check (length(about) <= 160),
  circles text[] not null default '{}',          -- circle codes that see the profile
  shared uuid[] not null default '{}',           -- trusted people outside those circles (an imam), up to 5
  wali uuid references public.users(uid) on delete set null,
  wali_rel text not null default '' check (length(wali_rel) <= 20),
  wali_ok boolean not null default false,
  active boolean not null default true,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists nikah_profiles_wali on public.nikah_profiles (wali);

create table if not exists public.nikah_props (
  id uuid primary key default gen_random_uuid(),
  to_uid uuid not null references public.nikah_profiles(uid) on delete cascade,
  from_uid uuid not null references public.users(uid) on delete cascade,
  code text not null default '',                 -- circle it came through ('' = shared directly)
  data jsonb not null default '{}'::jsonb,       -- the candidate: age, city, prayer, madhab, kids, work
  note text not null default '' check (length(note) <= 160),
  contact text not null default '' check (length(contact) <= 120),  -- the candidate's wali, shown after istikhara
  status text not null default 'new' check (status in ('new', 'interested', 'contacts', 'meet', 'done', 'declined')),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists nikah_props_to on public.nikah_props (to_uid, status);
create index if not exists nikah_props_from on public.nikah_props (from_uid, created);

alter table public.nikah_profiles enable row level security;
alter table public.nikah_props enable row level security;
revoke all on public.nikah_profiles, public.nikah_props from anon, authenticated;

-- Short fields only, never more than the form offers.
create or replace function public._lm_nk_data(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, left(trim(p->>k), 40)) filter (where p ? k and coalesce(p->>k, '') <> ''), '{}'::jsonb)
  from unnest(array['age', 'city', 'prayer', 'madhab', 'kids', 'move', 'work']) k;
$$;

-- Can v see the profile of o?
create or replace function public._lm_nk_sees(v uuid, o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from nikah_profiles p where p.uid = o and p.active and (p.gender = 'm' or p.wali_ok) and v <> o
      and not _lm_blocked(v, o)
      and (v = any(p.shared) or v = p.wali
        or exists (select 1 from members a join members b on b.code = a.code and b.uid = v where a.uid = o and a.code = any(p.circles)))
  );
$$;
revoke all on function public._lm_nk_sees(uuid, uuid) from public, anon, authenticated;

create or replace function public._lm_nk_card(p nikah_profiles, v uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('uid', p.uid, 'name', u.name, 'color', u.color, 'gender', p.gender, 'data', p.data, 'about', p.about,
    'wali_rel', p.wali_rel, 'wali_name', case when p.wali_ok then (select name from users where uid = p.wali) else '' end,
    'props', (select count(*) from nikah_props x where x.to_uid = p.uid and x.status <> 'declined'),
    'sent', exists (select 1 from nikah_props x where x.to_uid = p.uid and x.from_uid = v and x.status <> 'declined'))
  from users u where u.uid = p.uid;
$$;
revoke all on function public._lm_nk_card(nikah_profiles, uuid) from public, anon, authenticated;

-- Everything for my own screen: my profile, the people I am wali for, proposals to me (or my wards), proposals I sent.
create or replace function public.lm_nikah_me(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return json_build_object(
    'mine', (select json_build_object('gender', p.gender, 'data', p.data, 'about', p.about, 'circles', p.circles, 'shared',
        (select coalesce(json_agg(json_build_object('uid', s.uid, 'name', s.name, 'nick', s.nick)), '[]'::json) from users s where s.uid = any(p.shared)),
        'wali', p.wali, 'wali_name', (select name from users where uid = p.wali), 'wali_rel', p.wali_rel, 'wali_ok', p.wali_ok, 'active', p.active)
      from nikah_profiles p where p.uid = p_uid),
    'wards', (select coalesce(json_agg(json_build_object('uid', p.uid, 'name', u.name, 'gender', p.gender, 'data', p.data, 'about', p.about, 'rel', p.wali_rel, 'ok', p.wali_ok)), '[]'::json)
      from nikah_profiles p join users u on u.uid = p.uid where p.wali = p_uid),
    'inbox', (select coalesce(json_agg(json_build_object('id', x.id, 'to', x.to_uid, 'to_name', t.name, 'from_name', f.name, 'code', x.code,
        'data', x.data, 'note', x.note, 'status', x.status, 'created', x.created,
        'contact', case when x.status in ('contacts', 'meet', 'done') then x.contact else '' end) order by x.created desc), '[]'::json)
      from nikah_props x join nikah_profiles p on p.uid = x.to_uid join users t on t.uid = x.to_uid join users f on f.uid = x.from_uid
      where (x.to_uid = p_uid or (p.wali = p_uid and p.wali_ok)) and x.status <> 'declined'),
    'sent', (select coalesce(json_agg(json_build_object('id', x.id, 'to_name', t.name, 'status', x.status, 'created', x.created) order by x.created desc), '[]'::json)
      from nikah_props x join users t on t.uid = x.to_uid where x.from_uid = p_uid and x.created > now() - interval '120 days')
  );
end $$;

-- p: gender, data, about, circles, shared (uuid list), wali (uuid or null), wali_rel, active
create or replace function public.lm_nikah_save(p_uid uuid, p_token text, p jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare g text := p->>'gender'; w uuid := nullif(p->>'wali', '')::uuid; old nikah_profiles; cs text[]; sh uuid[];
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if g not in ('m', 'f') then return 'gender'; end if;
  if w = p_uid then return 'wali_self'; end if;
  if w is not null and not exists (select 1 from users where uid = w) then return 'wali_none'; end if;
  select coalesce(array_agg(c), '{}') into cs from jsonb_array_elements_text(coalesce(p->'circles', '[]'::jsonb)) c
    where exists (select 1 from members where code = c and uid = p_uid);
  select coalesce(array_agg(distinct s::uuid), '{}') into sh from (select s from jsonb_array_elements_text(coalesce(p->'shared', '[]'::jsonb)) s limit 5) q
    where exists (select 1 from users where uid = s::uuid) and s::uuid <> p_uid;
  select * into old from nikah_profiles where uid = p_uid;
  insert into nikah_profiles (uid, gender, data, about, circles, shared, wali, wali_rel, wali_ok, active)
  values (p_uid, g, _lm_nk_data(p->'data'), left(trim(coalesce(p->>'about', '')), 160), cs, sh, w, left(trim(coalesce(p->>'wali_rel', '')), 20), false, coalesce((p->>'active')::boolean, true))
  on conflict (uid) do update set gender = excluded.gender, data = excluded.data, about = excluded.about, circles = excluded.circles,
    shared = excluded.shared, wali = excluded.wali, wali_rel = excluded.wali_rel, active = excluded.active, updated = now(),
    wali_ok = case when nikah_profiles.wali is not distinct from excluded.wali then nikah_profiles.wali_ok else false end;
  return 'ok';
end $$;

-- Removes my profile and every proposal made to it.
create or replace function public.lm_nikah_delete(p_uid uuid, p_token text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  delete from nikah_profiles where uid = p_uid;
  return true;
end $$;

-- The wali confirms (or refuses) being wali for this profile.
create or replace function public.lm_nikah_wali(p_uid uuid, p_token text, p_owner uuid, p_ok boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  if p_ok then update nikah_profiles set wali_ok = true, updated = now() where uid = p_owner and wali = p_uid;
  else update nikah_profiles set wali = null, wali_ok = false, updated = now() where uid = p_owner and wali = p_uid; end if;
  return found;
end $$;

-- Profiles I may see: in circle p_code, or (p_code = '') the ones shared with me directly.
create or replace function public.lm_nikah_feed(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  if coalesce(p_code, '') = '' then
    return coalesce((select json_agg(_lm_nk_card(p, p_uid)) from nikah_profiles p
      where p_uid = any(p.shared) and _lm_nk_sees(p_uid, p.uid)), '[]'::json);
  end if;
  if not exists (select 1 from members where code = p_code and uid = p_uid) then return '[]'::json; end if;
  return coalesce((select json_agg(_lm_nk_card(p, p_uid)) from nikah_profiles p
    where p_code = any(p.circles) and p.uid <> p_uid and exists (select 1 from members where code = p_code and uid = p.uid)
      and _lm_nk_sees(p_uid, p.uid)), '[]'::json);
end $$;

-- People who share a circle with me: to choose a wali or a trusted person.
create or replace function public.lm_nikah_people(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  return coalesce((select json_agg(json_build_object('uid', u.uid, 'name', u.name, 'nick', u.nick, 'color', u.color) order by u.name)
    from users u where u.uid <> p_uid and not _lm_blocked(p_uid, u.uid)
      and exists (select 1 from members a join members b on b.code = a.code where a.uid = p_uid and b.uid = u.uid)), '[]'::json);
end $$;

-- p: data (the candidate), note, contact (the candidate's wali). Only after the candidate's family agreed.
create or replace function public.lm_nikah_propose(p_uid uuid, p_token text, p_to uuid, p_code text, p jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if not _lm_nk_sees(p_uid, p_to) then return 'closed'; end if;
  if coalesce((p->>'agreed')::boolean, false) is not true then return 'agree'; end if;
  if length(trim(coalesce(p->>'contact', ''))) < 3 then return 'contact'; end if;
  if (select count(*) from nikah_props where from_uid = p_uid and to_uid = p_to and status <> 'declined') >= 3 then return 'limit'; end if;
  if (select count(*) from nikah_props where from_uid = p_uid and created > now() - interval '1 day') >= 10 then return 'limit'; end if;
  insert into nikah_props (to_uid, from_uid, code, data, note, contact)
  values (p_to, p_uid, left(coalesce(p_code, ''), 20), _lm_nk_data(p->'data'), left(trim(coalesce(p->>'note', '')), 160), left(trim(p->>'contact'), 120));
  return 'ok';
end $$;

-- The seeker or the confirmed wali moves a proposal on, step by step, or declines it.
-- A declined proposal keeps nothing about the candidate.
create or replace function public.lm_nikah_answer(p_uid uuid, p_token text, p_id uuid, p_status text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare x nikah_props; pr nikah_profiles; nxt text;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  select * into x from nikah_props where id = p_id;
  if x.id is null then return 'none'; end if;
  select * into pr from nikah_profiles where uid = x.to_uid;
  if not (x.to_uid = p_uid or (pr.wali is not distinct from p_uid and pr.wali_ok)) then return 'none'; end if;
  if p_status = 'declined' then
    update nikah_props set status = 'declined', data = '{}'::jsonb, note = '', contact = '', updated = now() where id = p_id;
    return 'ok';
  end if;
  nxt := case x.status when 'new' then 'interested' when 'interested' then 'contacts' when 'contacts' then 'meet' when 'meet' then 'done' end;
  if nxt is null or nxt <> p_status then return 'step'; end if;
  update nikah_props set status = nxt, updated = now() where id = p_id;
  return 'ok';
end $$;

-- The one who proposed can take it back while nobody has answered yet.
create or replace function public.lm_nikah_withdraw(p_uid uuid, p_token text, p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  delete from nikah_props where id = p_id and from_uid = p_uid and status = 'new';
  return found;
end $$;

revoke all on function public.lm_nikah_me(uuid, text), public.lm_nikah_save(uuid, text, jsonb), public.lm_nikah_delete(uuid, text),
  public.lm_nikah_wali(uuid, text, uuid, boolean), public.lm_nikah_feed(uuid, text, text), public.lm_nikah_people(uuid, text),
  public.lm_nikah_propose(uuid, text, uuid, text, jsonb), public.lm_nikah_answer(uuid, text, uuid, text), public.lm_nikah_withdraw(uuid, text, uuid) from public;
grant execute on function public.lm_nikah_me(uuid, text), public.lm_nikah_save(uuid, text, jsonb), public.lm_nikah_delete(uuid, text),
  public.lm_nikah_wali(uuid, text, uuid, boolean), public.lm_nikah_feed(uuid, text, text), public.lm_nikah_people(uuid, text),
  public.lm_nikah_propose(uuid, text, uuid, text, jsonb), public.lm_nikah_answer(uuid, text, uuid, text), public.lm_nikah_withdraw(uuid, text, uuid) to anon, authenticated;

-- Check: should show 0 profiles (or yours).
select count(*) as nikah_profiles from public.nikah_profiles;
