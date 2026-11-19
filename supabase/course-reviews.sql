-- Living Muslim: course ratings and reviews.
-- A person can rate a course only after finishing it: the app records the finish (lm_course_done) when the certificate is earned,
-- and lm_course_rate refuses anyone without that record. Everybody sees the average, the count of people who finished,
-- and reviews with text. The owner (emails in lm_admins, see admin.sql) sees all reviews and can hide any of them;
-- a hidden review does not count in the average.
-- Run after schema.sql, nicks.sql, admin.sql and courses.sql. Safe to run more than once.

create table if not exists public.lm_course_marks (
  course text not null check (length(course) between 1 and 80),
  uid uuid not null references public.users(uid) on delete cascade,
  done_at timestamptz not null default now(),
  stars smallint check (stars between 1 and 5),
  body text not null default '' check (length(body) <= 600),
  rated_at timestamptz,
  hidden boolean not null default false,
  primary key (course, uid)
);
create index if not exists lm_course_marks_rated on public.lm_course_marks (course, rated_at desc) where stars is not null;

alter table public.lm_course_marks enable row level security;
revoke all on public.lm_course_marks from anon, authenticated;

-- The app calls this when a person earns the certificate.
create or replace function public.lm_course_done(p_uid uuid, p_token text, p_course text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  if p_course is null or length(p_course) not between 1 and 80 then return false; end if;
  insert into lm_course_marks (course, uid) values (p_course, p_uid) on conflict (course, uid) do nothing;
  return true;
end $$;
revoke all on function public.lm_course_done(uuid, text, text) from public;
grant execute on function public.lm_course_done(uuid, text, text) to anon, authenticated;

-- Stars 1–5 and an optional text. Returns 'ok', 'not_done' (finish the course first) or 'auth'.
create or replace function public.lm_course_rate(p_uid uuid, p_token text, p_course text, p_stars int, p_body text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if p_stars is null or p_stars not between 1 and 5 then return 'bad'; end if;
  update lm_course_marks set stars = p_stars, body = left(trim(coalesce(p_body, '')), 600), rated_at = now()
  where course = p_course and uid = p_uid;
  if not found then return 'not_done'; end if;
  return 'ok';
end $$;
revoke all on function public.lm_course_rate(uuid, text, text, int, text) from public;
grant execute on function public.lm_course_rate(uuid, text, text, int, text) to anon, authenticated;

-- For the catalog: per course, how many finished, how many ratings count, and the average.
create or replace function public.lm_course_stats() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('c', course, 'done', done, 'n', n, 'avg', avg)), '[]'::json) from (
    select course, count(*) as done,
      count(stars) filter (where not hidden) as n,
      round(avg(stars) filter (where not hidden), 1) as avg
    from lm_course_marks group by course
  ) t;
$$;
revoke all on function public.lm_course_stats() from public;
grant execute on function public.lm_course_stats() to anon, authenticated;

-- Reviews with text for a course page: the newest 30 that are not hidden. Shows the nick (or the first name).
create or replace function public.lm_course_reviews(p_course text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(r), '[]'::json) from (
    select coalesce(nullif(u.nick, ''), split_part(trim(u.name), ' ', 1)) as who, (u.nick is not null and u.nick <> '') as nick,
      m.stars, m.body, to_char(m.rated_at, 'YYYY-MM-DD') as day
    from lm_course_marks m join users u on u.uid = m.uid
    where m.course = p_course and m.stars is not null and not m.hidden and m.body <> ''
    order by m.rated_at desc limit 30
  ) r;
$$;
revoke all on function public.lm_course_reviews(text) from public;
grant execute on function public.lm_course_reviews(text) to anon, authenticated;

-- Owner: every rating of a course, hidden ones too.
create or replace function public.lm_course_reviews_admin(p_course text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then raise exception 'not admin'; end if;
  return (select coalesce(json_agg(r), '[]'::json) from (
    select m.uid, coalesce(nullif(u.nick, ''), u.name) as who, m.stars, m.body, m.hidden, to_char(m.rated_at, 'YYYY-MM-DD') as day
    from lm_course_marks m join users u on u.uid = m.uid
    where m.course = p_course and m.stars is not null
    order by m.rated_at desc limit 200
  ) r);
end $$;
revoke all on function public.lm_course_reviews_admin(text) from public, anon;
grant execute on function public.lm_course_reviews_admin(text) to authenticated;

-- Owner: hide or show one review.
create or replace function public.lm_course_review_hide(p_course text, p_who uuid, p_hidden boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then raise exception 'not admin'; end if;
  update lm_course_marks set hidden = coalesce(p_hidden, true) where course = p_course and uid = p_who;
  return found;
end $$;
revoke all on function public.lm_course_review_hide(text, uuid, boolean) from public, anon;
grant execute on function public.lm_course_review_hide(text, uuid, boolean) to authenticated;

-- Check: should show 0 (or the number of finished courses so far).
select count(*) as finished from public.lm_course_marks;
