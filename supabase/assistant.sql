-- AI assistant (Помощник): the owner's instructions and knowledge, and a daily message limit per person.
-- Run once in Supabase → SQL Editor. Safe to run again. Needs admin.sql (for _lm_is_admin) to be run before.

-- One row: what the owner taught the assistant in Profile → Помощник → Обучение.
create table if not exists public.lm_ai_config (
  id int primary key default 1 check (id = 1),
  instructions text not null default '',
  knowledge text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.lm_ai_config (id) values (1) on conflict (id) do nothing;
alter table public.lm_ai_config enable row level security;
-- No policies: the table is read and written only through the functions below.

-- The server (/api/ask) reads it with the public key; the owner's screen reads it too.
create or replace function public.lm_ai_config_get() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('instructions', instructions, 'knowledge', knowledge, 'updated_at', updated_at) from lm_ai_config where id = 1;
$$;
revoke all on function public.lm_ai_config_get() from public;
grant execute on function public.lm_ai_config_get() to anon, authenticated;

-- Only the owner can change it.
create or replace function public.lm_ai_config_set(p_instructions text, p_knowledge text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not _lm_is_admin() then raise exception 'not allowed'; end if;
  update lm_ai_config set instructions = left(coalesce(p_instructions, ''), 20000), knowledge = left(coalesce(p_knowledge, ''), 60000), updated_at = now() where id = 1;
  return lm_ai_config_get();
end $$;
revoke all on function public.lm_ai_config_set(text, text) from public;
grant execute on function public.lm_ai_config_set(text, text) to authenticated;

-- How many messages each person sent to the assistant per day. Only counts, never the text.
create table if not exists public.lm_ai_usage (
  user_id uuid not null,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.lm_ai_usage enable row level security;

-- Called by the server before each answer with the person's own sign-in token: adds one and says whether it is allowed.
-- The owner has no limit.
create or replace function public.lm_ai_take(p_limit int default 30) returns json
language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  d date := (now() at time zone 'utc')::date;
  c int;
begin
  if u is null then return json_build_object('ok', false, 'reason', 'signin'); end if;
  if _lm_is_admin() then return json_build_object('ok', true, 'n', 0, 'limit', 0, 'owner', true); end if;
  insert into lm_ai_usage (user_id, day, n) values (u, d, 1)
    on conflict (user_id, day) do update set n = lm_ai_usage.n + 1
    returning n into c;
  if c > greatest(p_limit, 1) then
    update lm_ai_usage set n = n - 1 where user_id = u and day = d;
    return json_build_object('ok', false, 'reason', 'limit', 'n', c - 1, 'limit', p_limit);
  end if;
  return json_build_object('ok', true, 'n', c, 'limit', p_limit);
end $$;
revoke all on function public.lm_ai_take(int) from public;
grant execute on function public.lm_ai_take(int) to authenticated;
