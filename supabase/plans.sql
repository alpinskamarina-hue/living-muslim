-- «Планы» in the cloud: one row per person with their plans (only when they choose «В облаке Living Muslim»),
-- and a secret link for the calendar subscription (Google, Apple, Outlook read /api/plans-ics?t=…).
-- Run once in Supabase → SQL Editor. Safe to run again.

create table if not exists public.lm_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plans jsonb not null default '[]'::jsonb,
  -- What the calendar feed needs for prayer times and names: place, method, offsets, time zone, language.
  place jsonb not null default '{}'::jsonb,
  ics text unique,
  updated_at timestamptz not null default now()
);
alter table public.lm_plans enable row level security;
-- No policies: read and written only through the functions below.

-- The person's own copy.
create or replace function public.lm_plans_get() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('plans', plans, 'ics', ics, 'updated_at', updated_at) from lm_plans where user_id = auth.uid();
$$;
revoke all on function public.lm_plans_get() from public;
grant execute on function public.lm_plans_get() to authenticated;

-- Save the merged list (the phone merges first). Up to 2000 plans, 1 MB.
create or replace function public.lm_plans_put(p_plans jsonb, p_place jsonb) returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_plans) <> 'array' or jsonb_array_length(p_plans) > 2000 or length(p_plans::text) > 1000000 then raise exception 'too big'; end if;
  insert into lm_plans (user_id, plans, place, updated_at) values (auth.uid(), p_plans, coalesce(p_place, '{}'::jsonb), now())
  on conflict (user_id) do update set plans = excluded.plans, place = excluded.place, updated_at = now();
  return lm_plans_get();
end $$;
revoke all on function public.lm_plans_put(jsonb, jsonb) from public;
grant execute on function public.lm_plans_put(jsonb, jsonb) to authenticated;

-- Make (or, with p_new, replace) the secret link for the calendar subscription.
create or replace function public.lm_plans_ics_key(p_new boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into lm_plans (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select ics into k from lm_plans where user_id = auth.uid();
  if k is null or p_new then
    k := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update lm_plans set ics = k where user_id = auth.uid();
  end if;
  return k;
end $$;
revoke all on function public.lm_plans_ics_key(boolean) from public;
grant execute on function public.lm_plans_ics_key(boolean) to authenticated;

-- Stop the subscription.
create or replace function public.lm_plans_ics_off() returns void
language sql security definer set search_path = public as $$
  update lm_plans set ics = null where user_id = auth.uid();
$$;
revoke all on function public.lm_plans_ics_off() from public;
grant execute on function public.lm_plans_ics_off() to authenticated;

-- The calendar feed (server, public key): plans and place for one secret link.
create or replace function public.lm_plans_feed(p_key text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('plans', plans, 'place', place) from lm_plans where ics = p_key and length(p_key) >= 20;
$$;
revoke all on function public.lm_plans_feed(text) from public;
grant execute on function public.lm_plans_feed(text) to anon, authenticated;
