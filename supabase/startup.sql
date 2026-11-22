-- Living Muslim: the startup circle (22.11.2026). Needs supabase/biz-work.sql (Дела, Календарь, decisions).
-- Shared for everyone in the circle: the stage of the path, the idea on one page, the 7-day idea check,
-- the log of customer talks, the team vote (Делаем / Меняем / Стоп) and the weekly pulse number.
-- No money amounts are asked for. Safe to run again.

create table if not exists public.su_state (
  code text primary key references public.circles(code) on delete cascade,
  stage smallint not null default 1 check (stage between 1 and 5),
  idea jsonb not null default '{}'::jsonb,   -- {"problem","who","solution","better","earn"}
  chk jsonb not null default '{}'::jsonb,    -- {"start":"2026-11-22","done":{"1":"<uid>"},"list":7,"pre":2}
  pulse_label text not null default '' check (length(pulse_label) <= 40),
  pulse_goal integer check (pulse_goal >= 0),
  goal_by date,
  mentors jsonb not null default '[]'::jsonb, -- ["<uid>"]
  round smallint not null default 1 check (round between 1 and 1000),
  upd timestamptz not null default now(),
  by_uid uuid references public.users(uid) on delete set null
);

create table if not exists public.su_talks (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  who text not null check (length(who) between 1 and 80),
  quote text not null default '' check (length(quote) <= 200),
  pain smallint not null default 3 check (pain between 1 and 5),
  by_uid uuid references public.users(uid) on delete set null,
  created timestamptz not null default now()
);
create index if not exists su_talks_code on public.su_talks (code, id desc);

create table if not exists public.su_votes (
  code text not null references public.circles(code) on delete cascade,
  round smallint not null,
  uid uuid not null references public.users(uid) on delete cascade,
  vote text not null check (vote in ('go', 'change', 'stop')),
  note text not null default '' check (length(note) <= 200),
  at timestamptz not null default now(),
  primary key (code, round, uid)
);

create table if not exists public.su_pulse (
  code text not null references public.circles(code) on delete cascade,
  week date not null,
  value integer not null check (value >= 0),
  primary key (code, week)
);

alter table public.su_state enable row level security;
alter table public.su_talks enable row level security;
alter table public.su_votes enable row level security;
alter table public.su_pulse enable row level security;
revoke all on public.su_state, public.su_talks, public.su_votes, public.su_pulse from anon, authenticated;

create or replace function public.lm_su_get(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_round smallint;
begin
  if p_uid is null then return null; end if; -- probe from the app: the function exists
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return null; end if;
  v_round := coalesce((select round from su_state where code = p_code), 1);
  return json_build_object(
    'state', (select json_build_object('stage', stage, 'idea', idea, 'chk', chk, 'pulse_label', pulse_label, 'pulse_goal', pulse_goal,
        'goal_by', goal_by, 'mentors', mentors, 'round', round, 'upd', upd, 'by', by_uid) from su_state where code = p_code),
    'talks', coalesce((select json_agg(t order by t.id desc) from (
        select id, who, quote, pain, by_uid as by, created from su_talks where code = p_code order by id desc limit 100) t), '[]'::json),
    'votes', coalesce((select json_agg(json_build_object('uid', uid, 'vote', vote, 'note', note, 'at', at)) from su_votes where code = p_code and round = v_round), '[]'::json),
    'pulse', coalesce((select json_agg(p order by p.week) from (
        select week, value from su_pulse where code = p_code order by week desc limit 12) p), '[]'::json)
  );
end $$;

-- merges the given keys only: stage, idea, chk, pulse_label, pulse_goal, goal_by, mentors, round
create or replace function public.lm_su_set(p_uid uuid, p_token text, p_code text, p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  if p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 6000 then return false; end if;
  if p ? 'idea' and (jsonb_typeof(p->'idea') <> 'object' or length((p->'idea')::text) > 2000) then return false; end if;
  if p ? 'chk' and (jsonb_typeof(p->'chk') <> 'object' or length((p->'chk')::text) > 2000) then return false; end if;
  if p ? 'mentors' and (jsonb_typeof(p->'mentors') <> 'array' or jsonb_array_length(p->'mentors') > 5) then return false; end if;
  insert into su_state(code, by_uid) values (p_code, p_uid) on conflict (code) do nothing;
  update su_state set
    stage = case when p ? 'stage' then greatest(1, least(5, (p->>'stage')::smallint)) else stage end,
    idea = case when p ? 'idea' then p->'idea' else idea end,
    chk = case when p ? 'chk' then p->'chk' else chk end,
    pulse_label = case when p ? 'pulse_label' then left(trim(coalesce(p->>'pulse_label', '')), 40) else pulse_label end,
    pulse_goal = case when p ? 'pulse_goal' then nullif(p->>'pulse_goal', '')::integer else pulse_goal end,
    goal_by = case when p ? 'goal_by' then nullif(p->>'goal_by', '')::date else goal_by end,
    mentors = case when p ? 'mentors' then p->'mentors' else mentors end,
    round = case when p ? 'round' then greatest(1, least(1000, (p->>'round')::smallint)) else round end,
    upd = now(), by_uid = p_uid
  where code = p_code;
  return true;
end $$;

-- p_id 0 = new; p null = delete. Returns the id, or 0 when refused.
create or replace function public.lm_su_talk_set(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  if p is null then delete from su_talks where id = p_id and code = p_code; return p_id; end if;
  if p_id = 0 then
    if (select count(*) from su_talks where code = p_code) >= 500 then return 0; end if;
    insert into su_talks(code, who, quote, pain, by_uid)
    values (p_code, left(trim(p->>'who'), 80), left(trim(coalesce(p->>'quote', '')), 200), greatest(1, least(5, coalesce((p->>'pain')::smallint, 3))), p_uid)
    returning id into v_id;
    return v_id;
  end if;
  update su_talks set who = left(trim(coalesce(p->>'who', who)), 80), quote = left(trim(coalesce(p->>'quote', quote)), 200),
    pain = greatest(1, least(5, coalesce((p->>'pain')::smallint, pain)))
  where id = p_id and code = p_code returning id into v_id;
  return coalesce(v_id, 0);
end $$;

-- my vote in the current round; p_vote null takes it back
create or replace function public.lm_su_vote(p_uid uuid, p_token text, p_code text, p_vote text, p_note text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_round smallint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  v_round := coalesce((select round from su_state where code = p_code), 1);
  if p_vote is null then delete from su_votes where code = p_code and round = v_round and uid = p_uid; return true; end if;
  if p_vote not in ('go', 'change', 'stop') then return false; end if;
  insert into su_votes(code, round, uid, vote, note) values (p_code, v_round, p_uid, p_vote, left(trim(coalesce(p_note, '')), 200))
  on conflict (code, round, uid) do update set vote = excluded.vote, note = excluded.note, at = now();
  return true;
end $$;

-- the pulse number of one week (Monday); p_value null removes it
create or replace function public.lm_su_pulse_set(p_uid uuid, p_token text, p_code text, p_week date, p_value integer) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  if p_week is null or p_week > current_date + 7 then return false; end if;
  if p_value is null then delete from su_pulse where code = p_code and week = p_week; return true; end if;
  if p_value < 0 or p_value > 100000000 then return false; end if;
  insert into su_pulse(code, week, value) values (p_code, p_week, p_value)
  on conflict (code, week) do update set value = excluded.value;
  return true;
end $$;

revoke all on function public.lm_su_get(uuid, text, text), public.lm_su_set(uuid, text, text, jsonb),
  public.lm_su_talk_set(uuid, text, text, bigint, jsonb), public.lm_su_vote(uuid, text, text, text, text),
  public.lm_su_pulse_set(uuid, text, text, date, integer) from public;
grant execute on function public.lm_su_get(uuid, text, text), public.lm_su_set(uuid, text, text, jsonb),
  public.lm_su_talk_set(uuid, text, text, bigint, jsonb), public.lm_su_vote(uuid, text, text, text, text),
  public.lm_su_pulse_set(uuid, text, text, date, integer) to anon, authenticated;
