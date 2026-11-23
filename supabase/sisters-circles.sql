-- Living Muslim: themed open circles («Мамы», «Новые мусульманки», «Хифз», «Таджвид с учительницей»…) and
-- verified teachers. Paste into Supabase → SQL Editor and press Run. Needs open-circles.sql and posts.sql
-- (already run). Safe to run again.
--
-- The owner of an open circle picks a theme; sisters see the themes as tiles in «Найти круг».
-- A teacher sends her ijazah or diploma (only the team sees it) and a reference; after the team checks it,
-- her open circles carry «✓ проверенная учительница». Members see only the mark, never the documents.

alter table public.circle_open add column if not exists topic text not null default '';
alter table public.circle_open drop constraint if exists circle_open_topic_ok;
alter table public.circle_open add constraint circle_open_topic_ok
  check (topic in ('', 'moms', 'new', 'hifz', 'tajwid', 'arabic', 'fiqh', 'sport', 'study', 'biz'));

create table if not exists public.teachers (
  uid uuid primary key references public.users(uid) on delete cascade,
  subjects text[] not null default '{}',
  proof text not null default '',            -- a photo of the ijazah or diploma (data URL); only the team sees it
  ref text not null default '',              -- a mosque or teacher who knows her; the team contacts them
  about text not null default '',
  status text not null default 'pending' check (status in ('pending', 'ok', 'no')),
  created timestamptz not null default now(),
  checked timestamptz
);
alter table public.teachers enable row level security;
revoke all on public.teachers from anon, authenticated;

create or replace function public._lm_teacher_ok(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers where uid = p_uid and status = 'ok');
$$;
revoke all on function public._lm_teacher_ok(uuid) from public, anon, authenticated;

-- The card in «Найти круг»: as in posts.sql, plus the theme and the teacher's mark.
create or replace function public._lm_open_card(o public.circle_open, p_uid uuid, p_day text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'about', o.about, 'who', o.who, 'join', o.join_mode,
    'lang', o.lang, 'city', o.city, 'max', o.max_n, 'verified', o.verified,
    'n', (select count(*) from members where code = o.code),
    'today', _lm_open_today(o.code, p_day),
    'member', exists (select 1 from members where code = o.code and uid = p_uid),
    'asked', (select status from circle_asks where code = o.code and uid = p_uid order by created desc limit 1),
    'post_at', (select max(at) from circle_posts where code = o.code and vis = 'public' and not hidden and at <= now()),
    'topic', o.topic,
    'teacher', _lm_teacher_ok(o.owner),
    'tsub', case when _lm_teacher_ok(o.owner) then (select to_jsonb(subjects) from teachers where uid = o.owner) else '[]'::jsonb end);
$$;
revoke all on function public._lm_open_card(public.circle_open, uuid, text) from public, anon, authenticated;

-- The theme of my open circle (owner or helper). '' takes it away. 'ok' | 'auth' | 'closed' | 'bad'
create or replace function public.lm_open_topic(p_uid uuid, p_token text, p_code text, p_topic text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_open_boss(p_uid, p_code) then return 'auth'; end if;
  if coalesce(p_topic, '') not in ('', 'moms', 'new', 'hifz', 'tajwid', 'arabic', 'fiqh', 'sport', 'study', 'biz') then return 'bad'; end if;
  update circle_open set topic = coalesce(p_topic, ''), updated = now() where code = p_code;
  if not found then return 'closed'; end if;
  return 'ok';
end $$;

create or replace function public.lm_open_topic_get(p_uid uuid, p_token text, p_code text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_open_boss(p_uid, p_code) then return null; end if;
  return (select topic from circle_open where code = p_code);
end $$;

-- «Я учительница»: my request and its state.
create or replace function public.lm_teacher_me(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return (select json_build_object('status', status, 'subjects', subjects, 'ref', ref, 'about', about, 'proof', proof <> '', 'created', created)
    from teachers where uid = p_uid);
end $$;

-- Send or change the request; a change sends it back to the team. p = {subjects: [...], proof, ref, about}.
-- 'ok' | 'auth' | 'empty' | 'big'
create or replace function public.lm_teacher_apply(p_uid uuid, p_token text, p jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare subs text[]; pr text := coalesce(p->>'proof', '');
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  select coalesce(array_agg(x), '{}') into subs from (
    select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p->'subjects') = 'array' then p->'subjects' else '[]'::jsonb end) x
    where x in ('tajwid', 'hifz', 'arabic', 'new', 'fiqh', 'kids') limit 6) s;
  if cardinality(subs) = 0 then return 'empty'; end if;
  if length(pr) > 600000 then return 'big'; end if;
  if pr <> '' and pr !~ '^data:image/(jpeg|png|webp);base64,' then return 'big'; end if;
  insert into teachers(uid, subjects, proof, ref, about) values (p_uid, subs, pr, left(trim(coalesce(p->>'ref', '')), 200), left(trim(coalesce(p->>'about', '')), 300))
  on conflict (uid) do update set subjects = excluded.subjects,
    proof = case when excluded.proof <> '' then excluded.proof else teachers.proof end,
    ref = excluded.ref, about = excluded.about, status = 'pending', checked = null;
  return 'ok';
end $$;

create or replace function public.lm_teacher_withdraw(p_uid uuid, p_token text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  delete from teachers where uid = p_uid;
  return found;
end $$;

-- ---------- for the owner of the app ----------
create or replace function public.lm_admin_teachers() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return coalesce((select json_agg(json_build_object('uid', t.uid, 'name', u.name, 'nick', u.nick, 'gender', u.gender, 'subjects', t.subjects,
      'proof', t.proof, 'ref', t.ref, 'about', t.about, 'status', t.status, 'created', t.created,
      'circles', (select count(*) from circle_open o where o.owner = t.uid))
    order by (t.status = 'pending') desc, t.created desc) from teachers t join users u on u.uid = t.uid), '[]'::json);
end $$;

create or replace function public.lm_admin_teacher_set(p_uid uuid, p_ok boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return false; end if;
  update teachers set status = case when p_ok then 'ok' else 'no' end, checked = now() where uid = p_uid;
  return found;
end $$;

revoke all on function public.lm_open_topic(uuid,text,text,text), public.lm_open_topic_get(uuid,text,text), public.lm_teacher_me(uuid,text),
  public.lm_teacher_apply(uuid,text,jsonb), public.lm_teacher_withdraw(uuid,text), public.lm_admin_teachers(), public.lm_admin_teacher_set(uuid,boolean) from public;
grant execute on function public.lm_open_topic(uuid,text,text,text), public.lm_open_topic_get(uuid,text,text), public.lm_teacher_me(uuid,text),
  public.lm_teacher_apply(uuid,text,jsonb), public.lm_teacher_withdraw(uuid,text) to anon, authenticated;
grant execute on function public.lm_admin_teachers(), public.lm_admin_teacher_set(uuid,boolean) to authenticated;

select 'sisters circles ready' as status;
