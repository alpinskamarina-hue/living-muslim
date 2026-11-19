-- Living Muslim: course content (modules, lesson summaries, practice, tests) for the courses in lm_courses.
-- Run once after courses.sql. Safe to run more than once. Adds one column; nothing is deleted.

alter table public.lm_courses add column if not exists plan jsonb;
alter table public.lm_courses drop constraint if exists lm_courses_plan_size;
alter table public.lm_courses add constraint lm_courses_plan_size check (plan is null or (jsonb_typeof(plan) = 'object' and length(plan::text) <= 300000));

-- Same as in courses.sql, plus p.plan. A save without a plan key keeps the content that is there.
create or replace function public.lm_course_save(p jsonb) returns public.lm_courses
language plpgsql volatile security definer set search_path = public as $$
declare r public.lm_courses;
begin
  if not _lm_is_admin() then raise exception 'not admin'; end if;
  insert into lm_courses (kind, yt, cat, title, channel, lang, note, pos, hidden, plan)
  values (coalesce(p->>'kind', 'list'), p->>'yt', p->>'cat', trim(p->>'title'), nullif(trim(coalesce(p->>'channel', '')), ''),
          coalesce(p->>'lang', 'ru'), nullif(trim(coalesce(p->>'note', '')), ''), coalesce((p->>'pos')::int, 0), coalesce((p->>'hidden')::boolean, false),
          case when jsonb_typeof(p->'plan') = 'object' then p->'plan' else null end)
  on conflict (yt) do update set kind = excluded.kind, cat = excluded.cat, title = excluded.title, channel = excluded.channel,
    lang = excluded.lang, note = excluded.note, pos = excluded.pos, hidden = excluded.hidden,
    plan = case when p ? 'plan' then excluded.plan else lm_courses.plan end, updated = now()
  returning * into r;
  return r;
end $$;
revoke all on function public.lm_course_save(jsonb) from public, anon;
grant execute on function public.lm_course_save(jsonb) to authenticated;

-- Check: should list the column plan.
select column_name, data_type from information_schema.columns where table_name = 'lm_courses' and column_name = 'plan';
