-- Living Muslim: «Гиды» for umrah. Paste into Supabase → SQL Editor and press Run.
-- Needs schema.sql, nicks.sql, admin.sql and umrah-open.sql (already run). Safe to run again.
--
-- A guide applies (knowledge, where he is, services and prices). The owner checks the diploma, the Saudi licence
-- if there is one, and the imam's recommendation, and approves. Only approved guides are listed.
-- A person calls a guide into a trip; when the guide accepts, the usual circle invite goes out.
-- A review can only be left by someone whose call the guide accepted. Money goes from person to guide directly:
-- the app stores no payments.

create table if not exists public.umrah_guides (
  uid uuid primary key references public.users(uid) on delete cascade,
  name text not null default '',
  langs text[] not null default '{}',
  about text not null default '',
  school text not null default '',
  field text not null default '',
  grad int,
  years int not null default 0 check (years between 0 and 80),
  groups int not null default 0 check (groups between 0 and 10000),
  place text not null default 'fly' check (place in ('makkah', 'madinah', 'fly')),
  city text not null default '',
  until text not null default '',
  free text not null default '',
  services jsonb not null default '[]'::jsonb,
  sisters boolean not null default false,
  license boolean not null default false,
  imam text not null default '',
  diploma_photo text,
  license_photo text,
  checks jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'ok', 'no')),
  paused boolean not null default false,
  note text not null default '',
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  decided timestamptz
);
create index if not exists umrah_guides_status on public.umrah_guides(status, paused);

create table if not exists public.umrah_guide_calls (
  id uuid primary key default gen_random_uuid(),
  guide uuid not null references public.users(uid) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  code text references public.circles(code) on delete set null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created timestamptz not null default now(),
  answered timestamptz
);
create unique index if not exists umrah_guide_calls_one on public.umrah_guide_calls(guide, uid) where status = 'pending';
create index if not exists umrah_guide_calls_guide on public.umrah_guide_calls(guide, status);
create index if not exists umrah_guide_calls_uid on public.umrah_guide_calls(uid, created);

create table if not exists public.umrah_guide_reviews (
  guide uuid not null references public.users(uid) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  stars int not null check (stars between 1 and 5),
  text text not null default '',
  created timestamptz not null default now(),
  primary key (guide, uid)
);

alter table public.umrah_guides enable row level security;
alter table public.umrah_guide_calls enable row level security;
alter table public.umrah_guide_reviews enable row level security;
revoke all on public.umrah_guides, public.umrah_guide_calls, public.umrah_guide_reviews from anon, authenticated;

-- The public card of a guide: no photos of documents, only which checks the owner made.
create or replace function public._lm_guide_card(g umrah_guides) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('uid', g.uid, 'name', coalesce(nullif(g.name, ''), u.name), 'color', u.color, 'avatar', u.avatar,
    'langs', g.langs, 'about', g.about, 'school', g.school, 'field', g.field, 'grad', g.grad, 'years', g.years, 'groups', g.groups,
    'place', g.place, 'city', g.city, 'until', g.until, 'free', g.free, 'services', g.services, 'sisters', g.sisters,
    'license', g.license and coalesce((g.checks->>'license')::boolean, false),
    'checks', g.checks, 'imam', g.imam,
    'stars', (select round(avg(r.stars)::numeric, 1) from umrah_guide_reviews r where r.guide = g.uid),
    'reviews', (select count(*) from umrah_guide_reviews r where r.guide = g.uid))
  from users u where u.uid = g.uid;
$$;
revoke all on function public._lm_guide_card(umrah_guides) from public, anon, authenticated;

-- Approved guides, not paused, not blocked; with my last call to each.
create or replace function public.lm_guides_list(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  return coalesce((select json_agg(x.c || jsonb_build_object('mine', x.mine) order by x.sort desc, x.years desc) from (
    select _lm_guide_card(g) c, g.years,
      (select count(*) from umrah_guide_reviews r where r.guide = g.uid) as sort,
      (select jsonb_build_object('id', c.id, 'status', c.status) from umrah_guide_calls c where c.guide = g.uid and c.uid = p_uid order by c.created desc limit 1) as mine
    from umrah_guides g
    where g.status = 'ok' and not g.paused and g.uid <> p_uid and not _lm_blocked(p_uid, g.uid)
  ) x), '[]'::json);
end $$;

-- One guide with the last 30 reviews, and whether I may leave a review.
create or replace function public.lm_guide_get(p_uid uuid, p_token text, p_guide uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare g umrah_guides;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into g from umrah_guides where uid = p_guide;
  if g.uid is null or (g.status <> 'ok' and g.uid <> p_uid) or _lm_blocked(p_uid, p_guide) then return null; end if;
  return (_lm_guide_card(g) || jsonb_build_object(
    'list', coalesce((select jsonb_agg(jsonb_build_object('name', split_part(u.name, ' ', 1), 'stars', r.stars, 'text', r.text, 'created', r.created) order by r.created desc)
      from (select * from umrah_guide_reviews where guide = p_guide order by created desc limit 30) r join users u on u.uid = r.uid), '[]'::jsonb),
    'can_review', exists (select 1 from umrah_guide_calls c where c.guide = p_guide and c.uid = p_uid and c.status = 'accepted'),
    'my_review', (select jsonb_build_object('stars', stars, 'text', text) from umrah_guide_reviews where guide = p_guide and uid = p_uid),
    'mine', (select jsonb_build_object('id', c.id, 'status', c.status) from umrah_guide_calls c where c.guide = p_guide and c.uid = p_uid order by c.created desc limit 1)
  ))::json;
end $$;

-- Apply or update my guide card. Changing the knowledge or the licence sends it back to the owner's check.
create or replace function public.lm_guide_apply(p_uid uuid, p_token text, p jsonb, p_diploma text default null, p_license text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
declare old umrah_guides; recheck boolean;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if length(coalesce(p_diploma, '')) > 600000 or length(coalesce(p_license, '')) > 600000 then return 'big'; end if;
  if length(trim(coalesce(p->>'school', ''))) < 3 then return 'school'; end if;
  select * into old from umrah_guides where uid = p_uid;
  recheck := old.uid is null or old.status = 'no'
    or old.school is distinct from left(trim(p->>'school'), 120) or old.field is distinct from left(trim(coalesce(p->>'field', '')), 80)
    or old.license is distinct from coalesce((p->>'license')::boolean, false) or p_diploma is not null or p_license is not null;
  insert into umrah_guides(uid, name, langs, about, school, field, grad, years, groups, place, city, until, free, services, sisters, license, imam, diploma_photo, license_photo)
  values (p_uid, left(trim(coalesce(p->>'name', '')), 60),
    coalesce((select array_agg(left(x, 8)) from (select jsonb_array_elements_text(coalesce(p->'langs', '[]'::jsonb)) x limit 8) l), '{}'),
    left(trim(coalesce(p->>'about', '')), 600), left(trim(p->>'school'), 120), left(trim(coalesce(p->>'field', '')), 80),
    nullif(p->>'grad', '')::int, least(80, greatest(0, coalesce(nullif(p->>'years', '')::int, 0))), least(10000, greatest(0, coalesce(nullif(p->>'groups', '')::int, 0))),
    case when p->>'place' in ('makkah', 'madinah', 'fly') then p->>'place' else 'fly' end,
    left(trim(coalesce(p->>'city', '')), 60), left(trim(coalesce(p->>'until', '')), 20), left(trim(coalesce(p->>'free', '')), 120),
    coalesce((select jsonb_agg(jsonb_build_object('t', left(s->>'t', 60), 'price', least(100000, greatest(0, coalesce(nullif(s->>'price', '')::numeric, 0))), 'per', left(coalesce(s->>'per', ''), 20)))
      from (select jsonb_array_elements(coalesce(p->'services', '[]'::jsonb)) s limit 6) ss where coalesce(s->>'t', '') <> ''), '[]'::jsonb),
    coalesce((p->>'sisters')::boolean, false), coalesce((p->>'license')::boolean, false), left(trim(coalesce(p->>'imam', '')), 120),
    p_diploma, p_license)
  on conflict (uid) do update set name = excluded.name, langs = excluded.langs, about = excluded.about, school = excluded.school, field = excluded.field,
    grad = excluded.grad, years = excluded.years, groups = excluded.groups, place = excluded.place, city = excluded.city, until = excluded.until,
    free = excluded.free, services = excluded.services, sisters = excluded.sisters, license = excluded.license, imam = excluded.imam,
    diploma_photo = coalesce(excluded.diploma_photo, umrah_guides.diploma_photo), license_photo = coalesce(excluded.license_photo, umrah_guides.license_photo),
    status = case when recheck then 'pending' else umrah_guides.status end, updated = now();
  return 'ok';
end $$;

-- My own card and its status, with the calls to me (pending first).
create or replace function public.lm_guide_mine(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare g umrah_guides;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into g from umrah_guides where uid = p_uid;
  if g.uid is null then return null; end if;
  return (_lm_guide_card(g) || jsonb_build_object('status', g.status, 'paused', g.paused, 'note', g.note,
    'has_diploma', g.diploma_photo is not null or coalesce((g.checks->>'diploma')::boolean, false),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'uid', u.uid, 'name', u.name, 'color', u.color, 'note', c.note, 'status', c.status, 'created', c.created) order by c.status <> 'pending', c.created desc)
      from umrah_guide_calls c join users u on u.uid = c.uid where c.guide = p_uid and c.status in ('pending', 'accepted') and c.created > now() - interval '120 days'), '[]'::jsonb)))::json;
end $$;

create or replace function public.lm_guide_pause(p_uid uuid, p_token text, p_on boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update umrah_guides set paused = p_on, updated = now() where uid = p_uid;
  return found;
end $$;

-- Call a guide into my trip (the circle where my trip lives).
create or replace function public.lm_guide_call(p_uid uuid, p_token text, p_guide uuid, p_code text, p_note text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if not exists (select 1 from umrah_guides where uid = p_guide and status = 'ok' and not paused) or p_guide = p_uid or _lm_blocked(p_uid, p_guide) then return 'closed'; end if;
  if p_code is not null and not exists (select 1 from members where code = p_code and uid = p_uid) then return 'not_member'; end if;
  if exists (select 1 from umrah_guide_calls where guide = p_guide and uid = p_uid and status = 'pending') then return 'already'; end if;
  if (select count(*) from umrah_guide_calls where uid = p_uid and created > now() - interval '1 day') >= 5 then return 'limit'; end if;
  insert into umrah_guide_calls(guide, uid, code, note) values (p_guide, p_uid, p_code, left(trim(coalesce(p_note, '')), 300));
  return 'ok';
end $$;

-- The guide answers: yes sends the usual circle invite to the trip's circle, no closes the call.
create or replace function public.lm_guide_answer(p_uid uuid, p_token text, p_id uuid, p_yes boolean) returns text
language plpgsql volatile security definer set search_path = public as $$
declare c umrah_guide_calls; m members;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  select * into c from umrah_guide_calls where id = p_id and guide = p_uid and status = 'pending';
  if c.id is null then return 'gone'; end if;
  if not p_yes then update umrah_guide_calls set status = 'declined', answered = now() where id = p_id; return 'ok'; end if;
  if c.code is not null and not exists (select 1 from members where code = c.code and uid = p_uid) then
    select * into m from members where code = c.code and uid = c.uid;
    if m.uid is not null and (select count(*) from members where code = c.code) < 50 then
      insert into invites(code, from_uid, to_uid, title, kind) values (c.code, c.uid, p_uid, coalesce(m.title, ''), coalesce(m.kind, ''))
      on conflict (code, to_uid) where status = 'pending' do nothing;
    end if;
  end if;
  update umrah_guide_calls set status = 'accepted', answered = now() where id = p_id;
  return 'ok';
end $$;

-- A review: only after the guide accepted my call. One per person, can be changed.
create or replace function public.lm_guide_review(p_uid uuid, p_token text, p_guide uuid, p_stars int, p_text text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if not exists (select 1 from umrah_guide_calls where guide = p_guide and uid = p_uid and status = 'accepted') then return 'not_allowed'; end if;
  insert into umrah_guide_reviews(guide, uid, stars, text) values (p_guide, p_uid, least(5, greatest(1, p_stars)), left(trim(coalesce(p_text, '')), 500))
  on conflict (guide, uid) do update set stars = excluded.stars, text = excluded.text, created = now();
  return 'ok';
end $$;

-- For the owner: applications waiting for a check, with the document photos.
create or replace function public.lm_guide_queue() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return coalesce((select json_agg(_lm_guide_card(g) || jsonb_build_object('email', (select a.email from users u join auth.users a on a.id = u.auth_id where u.uid = g.uid), 'license', g.license,
      'diploma_photo', g.diploma_photo, 'license_photo', g.license_photo, 'created', g.created, 'updated', g.updated) order by g.updated)
    from umrah_guides g where g.status = 'pending'), '[]'::json);
end $$;

-- The owner decides. The document photos are deleted after the check; only the ticks stay.
create or replace function public.lm_guide_decide(p_guide uuid, p_ok boolean, p_checks jsonb, p_note text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return; end if;
  update umrah_guides set status = case when p_ok then 'ok' else 'no' end, checks = coalesce(p_checks, '{}'::jsonb),
    note = left(coalesce(p_note, ''), 300), decided = now(), diploma_photo = null, license_photo = null
  where uid = p_guide;
end $$;

revoke all on function public.lm_guides_list(uuid, text), public.lm_guide_get(uuid, text, uuid), public.lm_guide_apply(uuid, text, jsonb, text, text),
  public.lm_guide_mine(uuid, text), public.lm_guide_pause(uuid, text, boolean), public.lm_guide_call(uuid, text, uuid, text, text),
  public.lm_guide_answer(uuid, text, uuid, boolean), public.lm_guide_review(uuid, text, uuid, int, text) from public;
grant execute on function public.lm_guides_list(uuid, text), public.lm_guide_get(uuid, text, uuid), public.lm_guide_apply(uuid, text, jsonb, text, text),
  public.lm_guide_mine(uuid, text), public.lm_guide_pause(uuid, text, boolean), public.lm_guide_call(uuid, text, uuid, text, text),
  public.lm_guide_answer(uuid, text, uuid, boolean), public.lm_guide_review(uuid, text, uuid, int, text) to anon, authenticated;
revoke all on function public.lm_guide_queue(), public.lm_guide_decide(uuid, boolean, jsonb, text) from public;
grant execute on function public.lm_guide_queue(), public.lm_guide_decide(uuid, boolean, jsonb, text) to authenticated;
