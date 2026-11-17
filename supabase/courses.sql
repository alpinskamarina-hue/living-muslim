-- Living Muslim: video courses the owner manages from the app (Profile → Аналитика → Видеокурсы).
-- Everyone can read the list; only emails in lm_admins (see admin.sql) can add, change, hide or delete.
-- A row whose yt matches a built-in course overrides it (new title, category) or hides it (hidden = true).
-- Safe to run more than once.

create table if not exists public.lm_courses (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'list' check (kind in ('list', 'video')),
  yt text not null unique,
  cat text not null check (cat in ('faith', 'biz', 'mind', 'body', 'food', 'family', 'lang')),
  title text not null check (length(title) between 1 and 120),
  channel text check (length(channel) <= 80),
  lang text not null default 'ru' check (lang in ('ru', 'en')),
  note text check (length(note) <= 300),
  pos int not null default 0,
  hidden boolean not null default false,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

alter table public.lm_courses enable row level security;
drop policy if exists lm_courses_read on public.lm_courses;
create policy lm_courses_read on public.lm_courses for select to anon, authenticated using (true);
revoke insert, update, delete on public.lm_courses from anon, authenticated;
grant select on public.lm_courses to anon, authenticated;

-- Add or change a course. p: {kind, yt, cat, title, channel, lang, note, pos, hidden}. Returns the row.
create or replace function public.lm_course_save(p jsonb) returns public.lm_courses
language plpgsql volatile security definer set search_path = public as $$
declare r public.lm_courses;
begin
  if not _lm_is_admin() then raise exception 'not admin'; end if;
  insert into lm_courses (kind, yt, cat, title, channel, lang, note, pos, hidden)
  values (coalesce(p->>'kind', 'list'), p->>'yt', p->>'cat', trim(p->>'title'), nullif(trim(coalesce(p->>'channel', '')), ''),
          coalesce(p->>'lang', 'ru'), nullif(trim(coalesce(p->>'note', '')), ''), coalesce((p->>'pos')::int, 0), coalesce((p->>'hidden')::boolean, false))
  on conflict (yt) do update set kind = excluded.kind, cat = excluded.cat, title = excluded.title, channel = excluded.channel,
    lang = excluded.lang, note = excluded.note, pos = excluded.pos, hidden = excluded.hidden, updated = now()
  returning * into r;
  return r;
end $$;
revoke all on function public.lm_course_save(jsonb) from public, anon;
grant execute on function public.lm_course_save(jsonb) to authenticated;

-- Remove a course added from the app (a built-in course comes back as it was).
create or replace function public.lm_course_delete(p_yt text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then raise exception 'not admin'; end if;
  delete from lm_courses where yt = p_yt;
  return found;
end $$;
revoke all on function public.lm_course_delete(text) from public, anon;
grant execute on function public.lm_course_delete(text) to authenticated;

-- Check: should show the table with 0 rows (or your courses).
select count(*) as courses from public.lm_courses;
