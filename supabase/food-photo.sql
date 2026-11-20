-- Фото еды: how many food photos each person sent for recognition per day (10 a day, the owner without a limit).
-- Only counts, never the photos. Run once in Supabase → SQL Editor. Safe to run again. Needs admin.sql (_lm_is_admin).

create table if not exists public.lm_photo_usage (
  user_id uuid not null,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.lm_photo_usage enable row level security;
-- No policies: read and written only through the functions below.

-- Called by the server before each photo with the person's own sign-in token: adds one and says whether it is allowed.
create or replace function public.lm_photo_take(p_limit int default 10) returns json
language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  d date := (now() at time zone 'utc')::date;
  c int;
begin
  if u is null then return json_build_object('ok', false, 'reason', 'signin'); end if;
  if _lm_is_admin() then return json_build_object('ok', true, 'n', 0, 'limit', 0, 'owner', true); end if;
  insert into lm_photo_usage (user_id, day, n) values (u, d, 1)
    on conflict (user_id, day) do update set n = lm_photo_usage.n + 1
    returning n into c;
  if c > greatest(p_limit, 1) then
    update lm_photo_usage set n = n - 1 where user_id = u and day = d;
    return json_build_object('ok', false, 'reason', 'limit', 'n', c - 1, 'limit', p_limit);
  end if;
  return json_build_object('ok', true, 'n', c, 'limit', p_limit);
end $$;
revoke all on function public.lm_photo_take(int) from public;
grant execute on function public.lm_photo_take(int) to authenticated;

-- A photo that was not recognised (not food, too dark, error) is given back.
create or replace function public.lm_photo_give() returns void
language plpgsql security definer set search_path = public as $$
begin
  update lm_photo_usage set n = greatest(0, n - 1)
   where user_id = auth.uid() and day = (now() at time zone 'utc')::date;
end $$;
revoke all on function public.lm_photo_give() from public;
grant execute on function public.lm_photo_give() to authenticated;
