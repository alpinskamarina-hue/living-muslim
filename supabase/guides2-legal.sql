-- Living Muslim: «Гиды», legal changes (21.11). Paste into Supabase → SQL Editor and press Run, after guides.sql. Safe to run again.
-- Two kinds: «Гид на месте» (a valid KSA guide licence is required) and «Наставник» (online, no licence).
-- The application needs two separate ticks: the terms and the explicit consent to check the document photos.
-- Pilgrims can report a guide. Document photos of an application without a decision are deleted after 30 days.

alter table public.umrah_guides add column if not exists kind text not null default 'guide';
alter table public.umrah_guides add column if not exists lic_until text not null default '';
alter table public.umrah_guides add column if not exists terms_at timestamptz;
alter table public.umrah_guides add column if not exists consent_at timestamptz;
do $$ begin
  alter table public.umrah_guides add constraint umrah_guides_kind check (kind in ('guide', 'mentor'));
exception when duplicate_object then null; end $$;

create table if not exists public.umrah_guide_reports (
  id uuid primary key default gen_random_uuid(),
  guide uuid not null references public.users(uid) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  text text not null default '',
  done boolean not null default false,
  created timestamptz not null default now()
);
create index if not exists umrah_guide_reports_open on public.umrah_guide_reports(done, created);
alter table public.umrah_guide_reports enable row level security;
revoke all on public.umrah_guide_reports from anon, authenticated;

-- Photos of an application that waits longer than 30 days are deleted (decided ones are deleted at once).
create or replace function public._lm_guide_clean() returns void
language sql volatile security definer set search_path = public as $$
  update umrah_guides set diploma_photo = null, license_photo = null
  where (diploma_photo is not null or license_photo is not null) and updated < now() - interval '30 days';
$$;
revoke all on function public._lm_guide_clean() from public, anon, authenticated;

-- The public card: what was checked and when, the kind and the licence date. No document photos.
create or replace function public._lm_guide_card(g umrah_guides) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('uid', g.uid, 'name', coalesce(nullif(g.name, ''), u.name), 'color', u.color, 'avatar', u.avatar,
    'kind', g.kind, 'langs', g.langs, 'about', g.about, 'school', g.school, 'field', g.field, 'grad', g.grad, 'years', g.years, 'groups', g.groups,
    'place', g.place, 'city', g.city, 'until', g.until, 'free', g.free, 'services', g.services, 'sisters', g.sisters,
    'license', g.license and coalesce((g.checks->>'license')::boolean, false), 'lic_until', g.lic_until,
    'checks', g.checks, 'imam', g.imam, 'decided', g.decided,
    'stars', (select round(avg(r.stars)::numeric, 1) from umrah_guide_reviews r where r.guide = g.uid),
    'reviews', (select count(*) from umrah_guide_reviews r where r.guide = g.uid))
  from users u where u.uid = g.uid;
$$;
revoke all on function public._lm_guide_card(umrah_guides) from public, anon, authenticated;

-- Order: guides with a checked KSA licence first, then by reviews and groups.
create or replace function public.lm_guides_list(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  return coalesce((select json_agg(x.c || jsonb_build_object('mine', x.mine) order by x.lic desc, x.sort desc, x.groups desc) from (
    select _lm_guide_card(g) c, g.groups,
      (g.kind = 'guide' and g.license and coalesce((g.checks->>'license')::boolean, false)) as lic,
      (select count(*) from umrah_guide_reviews r where r.guide = g.uid) as sort,
      (select jsonb_build_object('id', c.id, 'status', c.status) from umrah_guide_calls c where c.guide = g.uid and c.uid = p_uid order by c.created desc limit 1) as mine
    from umrah_guides g
    where g.status = 'ok' and not g.paused and g.uid <> p_uid and not _lm_blocked(p_uid, g.uid)
  ) x), '[]'::json);
end $$;

-- Apply: the kind, the licence for a guide on site, and the two ticks are required.
create or replace function public.lm_guide_apply(p_uid uuid, p_token text, p jsonb, p_diploma text default null, p_license text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
declare old umrah_guides; recheck boolean; k text;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  perform _lm_guide_clean();
  if length(coalesce(p_diploma, '')) > 600000 or length(coalesce(p_license, '')) > 600000 then return 'big'; end if;
  if length(trim(coalesce(p->>'school', ''))) < 3 then return 'school'; end if;
  if not coalesce((p->>'terms')::boolean, false) or not coalesce((p->>'consent')::boolean, false) then return 'consent'; end if;
  k := case when p->>'kind' = 'mentor' then 'mentor' else 'guide' end;
  select * into old from umrah_guides where uid = p_uid;
  if k = 'guide' and (not coalesce((p->>'license')::boolean, false)
      or (p_license is null and old.license_photo is null and not coalesce((old.checks->>'license')::boolean, false))) then return 'license'; end if;
  recheck := old.uid is null or old.status = 'no' or old.kind is distinct from k
    or old.school is distinct from left(trim(p->>'school'), 120) or old.field is distinct from left(trim(coalesce(p->>'field', '')), 80)
    or old.license is distinct from (k = 'guide') or old.lic_until is distinct from left(trim(coalesce(p->>'lic_until', '')), 20)
    or p_diploma is not null or p_license is not null;
  insert into umrah_guides(uid, kind, name, langs, about, school, field, grad, years, groups, place, city, until, free, services, sisters, license, lic_until, imam, diploma_photo, license_photo, terms_at, consent_at)
  values (p_uid, k, left(trim(coalesce(p->>'name', '')), 60),
    coalesce((select array_agg(left(x, 8)) from (select jsonb_array_elements_text(coalesce(p->'langs', '[]'::jsonb)) x limit 8) l), '{}'),
    left(trim(coalesce(p->>'about', '')), 600), left(trim(p->>'school'), 120), left(trim(coalesce(p->>'field', '')), 80),
    nullif(p->>'grad', '')::int, least(80, greatest(0, coalesce(nullif(p->>'years', '')::int, 0))), least(10000, greatest(0, coalesce(nullif(p->>'groups', '')::int, 0))),
    case when k = 'mentor' then 'fly' when p->>'place' in ('makkah', 'madinah', 'fly') then p->>'place' else 'fly' end,
    left(trim(coalesce(p->>'city', '')), 60), left(trim(coalesce(p->>'until', '')), 20), left(trim(coalesce(p->>'free', '')), 120),
    coalesce((select jsonb_agg(jsonb_build_object('t', left(s->>'t', 60), 'price', least(100000, greatest(0, coalesce(nullif(s->>'price', '')::numeric, 0))), 'per', left(coalesce(s->>'per', ''), 20)))
      from (select jsonb_array_elements(coalesce(p->'services', '[]'::jsonb)) s limit 6) ss where coalesce(s->>'t', '') <> ''), '[]'::jsonb),
    coalesce((p->>'sisters')::boolean, false), k = 'guide', left(trim(coalesce(p->>'lic_until', '')), 20), left(trim(coalesce(p->>'imam', '')), 120),
    p_diploma, case when k = 'guide' then p_license end, now(), now())
  on conflict (uid) do update set kind = excluded.kind, name = excluded.name, langs = excluded.langs, about = excluded.about, school = excluded.school, field = excluded.field,
    grad = excluded.grad, years = excluded.years, groups = excluded.groups, place = excluded.place, city = excluded.city, until = excluded.until,
    free = excluded.free, services = excluded.services, sisters = excluded.sisters, license = excluded.license, lic_until = excluded.lic_until, imam = excluded.imam,
    diploma_photo = coalesce(excluded.diploma_photo, umrah_guides.diploma_photo),
    license_photo = case when excluded.kind = 'guide' then coalesce(excluded.license_photo, umrah_guides.license_photo) end,
    terms_at = now(), consent_at = now(),
    status = case when recheck then 'pending' else umrah_guides.status end, updated = now();
  return 'ok';
end $$;

-- A pilgrim reports a guide: at most 3 a day.
create or replace function public.lm_guide_report(p_uid uuid, p_token text, p_guide uuid, p_text text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if not exists (select 1 from umrah_guides where uid = p_guide) or p_guide = p_uid then return 'gone'; end if;
  if (select count(*) from umrah_guide_reports where uid = p_uid and created > now() - interval '1 day') >= 3 then return 'limit'; end if;
  insert into umrah_guide_reports(guide, uid, text) values (p_guide, p_uid, left(trim(coalesce(p_text, '')), 600));
  return 'ok';
end $$;

-- For the owner: applications (with the kind and the licence date) and cleaning old photos on the way.
create or replace function public.lm_guide_queue() returns json
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  perform _lm_guide_clean();
  return coalesce((select json_agg(_lm_guide_card(g) || jsonb_build_object('email', (select a.email from users u join auth.users a on a.id = u.auth_id where u.uid = g.uid), 'license', g.license,
      'diploma_photo', g.diploma_photo, 'license_photo', g.license_photo, 'created', g.created, 'updated', g.updated) order by g.updated)
    from umrah_guides g where g.status = 'pending'), '[]'::json);
end $$;

create or replace function public.lm_guide_reports() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return coalesce((select json_agg(jsonb_build_object('id', r.id, 'guide', r.guide, 'gname', coalesce(nullif(g.name, ''), gu.name), 'from', split_part(u.name, ' ', 1),
      'text', r.text, 'created', r.created, 'status', g.status, 'paused', g.paused) order by r.created desc)
    from umrah_guide_reports r join users u on u.uid = r.uid join users gu on gu.uid = r.guide left join umrah_guides g on g.uid = r.guide
    where not r.done), '[]'::json);
end $$;

-- The owner closes a report; with p_hide the guide is taken out of the list (status «no», with the note as the reason).
create or replace function public.lm_guide_report_done(p_id uuid, p_hide boolean, p_note text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare g uuid;
begin
  if not _lm_is_admin() then return; end if;
  update umrah_guide_reports set done = true where id = p_id returning guide into g;
  if p_hide and g is not null then update umrah_guides set status = 'no', note = left(coalesce(p_note, ''), 300), decided = now() where uid = g; end if;
end $$;

revoke all on function public.lm_guide_report(uuid, text, uuid, text) from public;
grant execute on function public.lm_guide_report(uuid, text, uuid, text) to anon, authenticated;
revoke all on function public.lm_guide_reports(), public.lm_guide_report_done(uuid, boolean, text) from public;
grant execute on function public.lm_guide_reports(), public.lm_guide_report_done(uuid, boolean, text) to authenticated;
grant execute on function public.lm_guides_list(uuid, text), public.lm_guide_apply(uuid, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.lm_guide_queue() to authenticated;
