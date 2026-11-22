-- Living Muslim: the business circle as a workspace (22.11.2026).
-- Shared for everyone in the circle: tasks («Дела»), meetings and deadlines («Календарь»),
-- the plan (niyyah, goal of the year, goals of the quarter) and the journal of shura decisions.
-- No money amounts are stored. Safe to run again.

create table if not exists public.biz_tasks (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  title text not null check (length(title) between 1 and 140),
  owner uuid references public.users(uid) on delete set null,
  due date,
  due_p text check (due_p in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  msg bigint,
  by_uid uuid references public.users(uid) on delete set null,
  created timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists biz_tasks_code on public.biz_tasks (code, status);

create table if not exists public.biz_events (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  day date not null,
  at text check (at ~ '^[0-2][0-9]:[0-5][0-9]$'),
  after_p text check (after_p in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  kind text not null default 'meet' check (kind in ('meet', 'due')),
  msg bigint,
  by_uid uuid references public.users(uid) on delete set null,
  created timestamptz not null default now()
);
create index if not exists biz_events_code on public.biz_events (code, day);

create table if not exists public.biz_plan (
  code text primary key references public.circles(code) on delete cascade,
  niyya text not null default '' check (length(niyya) <= 300),
  goal text not null default '' check (length(goal) <= 140),
  goals jsonb not null default '[]'::jsonb, -- [{"t": "Найти помещение", "o": "<uid>", "p": 80}], up to 5
  upd timestamptz not null default now(),
  by_uid uuid references public.users(uid) on delete set null
);

create table if not exists public.biz_decisions (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  body text not null check (length(body) between 1 and 300),
  day date not null default current_date,
  msg bigint,
  by_uid uuid references public.users(uid) on delete set null,
  created timestamptz not null default now()
);
create index if not exists biz_decisions_code on public.biz_decisions (code, day desc);

alter table public.biz_tasks enable row level security;
alter table public.biz_events enable row level security;
alter table public.biz_plan enable row level security;
alter table public.biz_decisions enable row level security;
revoke all on public.biz_tasks, public.biz_events, public.biz_plan, public.biz_decisions from anon, authenticated;

-- everything of one circle: open tasks and the last 30 done, meetings from a week ago on, plan, last 50 decisions
create or replace function public.lm_biz_get(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return null; end if; -- probe from the app: the function exists
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return null; end if;
  return json_build_object(
    'tasks', coalesce((select json_agg(t order by t.id) from (
        select id, title, owner, due, due_p, status, msg, by_uid as by, created, done_at from biz_tasks where code = p_code and status <> 'done'
        union all
        select * from (select id, title, owner, due, due_p, status, msg, by_uid, created, done_at from biz_tasks where code = p_code and status = 'done' order by done_at desc nulls last limit 30) d
      ) t), '[]'::json),
    'events', coalesce((select json_agg(e order by e.day, e.at nulls first, e.id) from (
        select id, title, day, at, after_p, kind, msg, by_uid as by from biz_events where code = p_code and day >= current_date - 7 and day <= current_date + 120
      ) e), '[]'::json),
    'plan', (select json_build_object('niyya', niyya, 'goal', goal, 'goals', goals, 'upd', upd, 'by', by_uid) from biz_plan where code = p_code),
    'decisions', coalesce((select json_agg(d order by d.day desc, d.id desc) from (
        select id, body, day, msg, by_uid as by from biz_decisions where code = p_code order by day desc, id desc limit 50
      ) d), '[]'::json)
  );
end $$;

-- p_id 0 = new; p null = delete. Returns the id, or 0 when refused.
create or replace function public.lm_biz_task_set(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint; v_owner uuid; v_status text;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  if p is null then delete from biz_tasks where id = p_id and code = p_code; return p_id; end if;
  v_owner := nullif(p->>'owner', '')::uuid;
  if v_owner is not null and not _lm_member(v_owner, p_code) then v_owner := null; end if;
  v_status := coalesce(nullif(p->>'status', ''), 'todo');
  if v_status not in ('todo', 'doing', 'done') then v_status := 'todo'; end if;
  if p_id = 0 then
    if (select count(*) from biz_tasks where code = p_code and status <> 'done') >= 300 then return 0; end if;
    insert into biz_tasks(code, title, owner, due, due_p, status, msg, by_uid, done_at)
    values (p_code, left(trim(p->>'title'), 140), v_owner, nullif(p->>'due', '')::date, nullif(p->>'due_p', ''), v_status,
      nullif(p->>'msg', '')::bigint, p_uid, case when v_status = 'done' then now() end)
    returning id into v_id;
    return v_id;
  end if;
  update biz_tasks set title = left(trim(coalesce(p->>'title', title)), 140), owner = v_owner, due = nullif(p->>'due', '')::date,
    due_p = nullif(p->>'due_p', ''), done_at = case when v_status = 'done' and status <> 'done' then now() when v_status <> 'done' then null else done_at end,
    status = v_status
  where id = p_id and code = p_code returning id into v_id;
  return coalesce(v_id, 0);
end $$;

create or replace function public.lm_biz_event_set(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  if p is null then delete from biz_events where id = p_id and code = p_code; return p_id; end if;
  if p_id = 0 then
    if (select count(*) from biz_events where code = p_code and day >= current_date) >= 300 then return 0; end if;
    insert into biz_events(code, title, day, at, after_p, kind, msg, by_uid)
    values (p_code, left(trim(p->>'title'), 120), (p->>'day')::date, nullif(p->>'at', ''), nullif(p->>'after_p', ''),
      coalesce(nullif(p->>'kind', ''), 'meet'), nullif(p->>'msg', '')::bigint, p_uid)
    returning id into v_id;
    return v_id;
  end if;
  update biz_events set title = left(trim(coalesce(p->>'title', title)), 120), day = coalesce((p->>'day')::date, day), at = nullif(p->>'at', ''),
    after_p = nullif(p->>'after_p', ''), kind = coalesce(nullif(p->>'kind', ''), kind)
  where id = p_id and code = p_code returning id into v_id;
  return coalesce(v_id, 0);
end $$;

create or replace function public.lm_biz_plan_set(p_uid uuid, p_token text, p_code text, p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare g jsonb := coalesce(p->'goals', '[]'::jsonb);
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  if jsonb_typeof(g) <> 'array' or jsonb_array_length(g) > 5 or length(g::text) > 2000 then return false; end if;
  insert into biz_plan(code, niyya, goal, goals, upd, by_uid)
  values (p_code, left(trim(coalesce(p->>'niyya', '')), 300), left(trim(coalesce(p->>'goal', '')), 140), g, now(), p_uid)
  on conflict (code) do update set niyya = excluded.niyya, goal = excluded.goal, goals = excluded.goals, upd = now(), by_uid = p_uid;
  return true;
end $$;

create or replace function public.lm_biz_decision_set(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  if p is null then delete from biz_decisions where id = p_id and code = p_code; return p_id; end if;
  if p_id = 0 then
    if (select count(*) from biz_decisions where code = p_code and created > now() - interval '1 day') >= 100 then return 0; end if;
    insert into biz_decisions(code, body, day, msg, by_uid)
    values (p_code, left(trim(p->>'body'), 300), coalesce(nullif(p->>'day', '')::date, current_date), nullif(p->>'msg', '')::bigint, p_uid)
    returning id into v_id;
    return v_id;
  end if;
  update biz_decisions set body = left(trim(coalesce(p->>'body', body)), 300) where id = p_id and code = p_code returning id into v_id;
  return coalesce(v_id, 0);
end $$;

revoke all on function public.lm_biz_get(uuid, text, text), public.lm_biz_task_set(uuid, text, text, bigint, jsonb),
  public.lm_biz_event_set(uuid, text, text, bigint, jsonb), public.lm_biz_plan_set(uuid, text, text, jsonb),
  public.lm_biz_decision_set(uuid, text, text, bigint, jsonb) from public;
grant execute on function public.lm_biz_get(uuid, text, text), public.lm_biz_task_set(uuid, text, text, bigint, jsonb),
  public.lm_biz_event_set(uuid, text, text, bigint, jsonb), public.lm_biz_plan_set(uuid, text, text, jsonb),
  public.lm_biz_decision_set(uuid, text, text, bigint, jsonb) to anon, authenticated;
