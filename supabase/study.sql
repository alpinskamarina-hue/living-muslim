-- Living Muslim: the study circle «Учёба» (22.11.2026). Lessons («Занятия») use supabase/biz-work.sql (biz_events).
-- Shared for everyone in the circle: what the circle learns and at what pace, the teachers (устаз), each member's
-- place in the plan and revision (мураджаа), handed-in recitations and homework with the teacher's marks,
-- «Сажусь учить» sessions, questions to the teacher, lesson notes with cards, and the Friday quiz.
-- Safe to run again.

create table if not exists public.st_state (
  code text primary key references public.circles(code) on delete cascade,
  plan jsonb not null default '{}'::jsonb,       -- {"subj":"hifz","title":"Джуз Амма","refs":[114,113,…],"total":564,"unit":"ayah","pace":5,"start":"2026-11-23"}
  teachers jsonb not null default '[]'::jsonb,   -- ["<uid>"], at most 3
  goal_min integer not null default 0 check (goal_min between 0 and 10000), -- minutes a week for the whole circle
  upd timestamptz not null default now(),
  by_uid uuid references public.users(uid) on delete set null
);

create table if not exists public.st_prog (
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  pos integer not null default 0 check (pos >= 0),
  day date,                                       -- last day the place moved
  streak integer not null default 0 check (streak >= 0),
  rev jsonb not null default '{}'::jsonb,         -- revision: {"<surah>": {"d":"2026-11-22","l":2,"w":1}}
  cert_by uuid references public.users(uid) on delete set null,
  cert_at date,
  upd timestamptz not null default now(),
  primary key (code, uid)
);

create table if not exists public.st_tasks (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  title text not null check (length(title) between 1 and 140),
  body text not null default '' check (length(body) <= 600),
  due date,
  due_p text check (due_p in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  by_uid uuid references public.users(uid) on delete set null,
  created timestamptz not null default now()
);
create index if not exists st_tasks_code on public.st_tasks (code, id desc);

-- a recitation or a handed-in homework; the teacher (or, without one, another member) marks it
create table if not exists public.st_subs (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  label text not null check (length(label) between 1 and 120),
  ref jsonb,                                      -- {"s":78,"a1":11,"a2":15}
  msg bigint,                                     -- the voice message in the circle chat
  task bigint references public.st_tasks(id) on delete cascade,
  body text not null default '' check (length(body) <= 600),
  status text not null default 'wait' check (status in ('wait', 'ok', 'redo')),
  marks jsonb not null default '[]'::jsonb,       -- ayah numbers with a mistake
  note text not null default '' check (length(note) <= 300),
  checker uuid references public.users(uid) on delete set null,
  created timestamptz not null default now(),
  checked timestamptz
);
create index if not exists st_subs_code on public.st_subs (code, id desc);

create table if not exists public.st_focus (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  what text not null default '' check (length(what) <= 80),
  mins smallint not null check (mins between 5 and 120),
  started timestamptz not null default now(),
  ended timestamptz
);
create index if not exists st_focus_code on public.st_focus (code, started desc);

create table if not exists public.st_qs (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  uid uuid references public.users(uid) on delete set null,
  anon boolean not null default false,
  priv boolean not null default false,            -- only the teachers see it
  body text not null check (length(body) between 1 and 400),
  tag text not null default '' check (length(tag) <= 30),
  too jsonb not null default '[]'::jsonb,         -- uids who pressed «у меня тоже»
  answer text not null default '' check (length(answer) <= 1500),
  ans_msg bigint,
  ans_by uuid references public.users(uid) on delete set null,
  ans_at timestamptz,
  pinned boolean not null default false,
  created timestamptz not null default now()
);
create index if not exists st_qs_code on public.st_qs (code, id desc);

create table if not exists public.st_notes (
  id bigserial primary key,
  code text not null references public.circles(code) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  day date not null default current_date,
  body text not null default '' check (length(body) <= 20000),
  points jsonb not null default '[]'::jsonb,      -- ["…", "…", "…"]
  cards jsonb not null default '[]'::jsonb,       -- [{"a":"مِنْ بَعْدِ","t":"иклаб"}]
  checked boolean not null default false,
  by_uid uuid references public.users(uid) on delete set null,
  created timestamptz not null default now()
);
create index if not exists st_notes_code on public.st_notes (code, day desc, id desc);

create table if not exists public.st_quiz (
  code text not null references public.circles(code) on delete cascade,
  week date not null,                             -- the Friday
  qs jsonb not null,                              -- [{"q":"…","o":["…","…"],"ok":1,"src":"…"}]
  by_uid uuid references public.users(uid) on delete set null,
  created timestamptz not null default now(),
  primary key (code, week)
);
create table if not exists public.st_quiz_ans (
  code text not null,
  week date not null,
  uid uuid not null references public.users(uid) on delete cascade,
  ans jsonb not null,                             -- [1,0,2,…]
  at timestamptz not null default now(),
  primary key (code, week, uid),
  foreign key (code, week) references public.st_quiz(code, week) on delete cascade
);

alter table public.st_state enable row level security;
alter table public.st_prog enable row level security;
alter table public.st_tasks enable row level security;
alter table public.st_subs enable row level security;
alter table public.st_focus enable row level security;
alter table public.st_qs enable row level security;
alter table public.st_notes enable row level security;
alter table public.st_quiz enable row level security;
alter table public.st_quiz_ans enable row level security;
revoke all on public.st_state, public.st_prog, public.st_tasks, public.st_subs, public.st_focus, public.st_qs, public.st_notes, public.st_quiz, public.st_quiz_ans from anon, authenticated;

-- the circle has teachers / this person is one of them / may lead (owner or teacher)
create or replace function public._st_has_teachers(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_array_length((select teachers from st_state where code = p_code)), 0) > 0 $$;
create or replace function public._st_teacher(p_uid uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select teachers ? p_uid::text from st_state where code = p_code), false) $$;
create or replace function public._st_lead(p_uid uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select _st_teacher(p_uid, p_code) or exists (select 1 from circles where code = p_code and owner = p_uid) $$;
-- who may mark recitations, answer questions, give homework and make the quiz:
-- the teachers; in a circle without a teacher, any member
create or replace function public._st_can_teach(p_uid uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select _st_teacher(p_uid, p_code) or not _st_has_teachers(p_code) $$;

create or replace function public.lm_st_get(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_teach boolean; v_has boolean; v_week date; v_lead boolean;
begin
  if p_uid is null then return null; end if; -- probe from the app: the function exists
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return null; end if;
  v_teach := _st_teacher(p_uid, p_code);
  v_has := _st_has_teachers(p_code);
  v_lead := _st_lead(p_uid, p_code);
  v_week := (select max(week) from st_quiz where code = p_code and week >= current_date - 6);
  return json_build_object(
    'me', json_build_object('teacher', v_teach, 'lead', v_lead, 'owner', exists (select 1 from circles where code = p_code and owner = p_uid)),
    'state', (select json_build_object('plan', plan, 'teachers', teachers, 'goal_min', goal_min, 'upd', upd) from st_state where code = p_code),
    'prog', coalesce((select json_agg(json_build_object('uid', p.uid, 'pos', p.pos, 'day', p.day, 'streak', p.streak,
        'rev', case when p.uid = p_uid then p.rev else '{}'::jsonb end, 'cert_by', p.cert_by, 'cert_at', p.cert_at))
      from st_prog p where p.code = p_code and _lm_member(p.uid, p_code)), '[]'::json),
    'tasks', coalesce((select json_agg(t order by t.id desc) from (
        select id, title, body, due, due_p, by_uid as by, created from st_tasks where code = p_code order by id desc limit 30) t), '[]'::json),
    'subs', coalesce((select json_agg(s order by s.id desc) from (
        select id, uid, label, ref, msg, task, body, status, marks, note, checker, created, checked from st_subs
        where code = p_code and created > now() - interval '60 days' order by id desc limit 120) s), '[]'::json),
    'live', coalesce((select json_agg(json_build_object('uid', uid, 'what', what, 'mins', mins, 'started', started, 'id', id))
        from st_focus where code = p_code and ended is null and started + make_interval(mins => mins) > now()), '[]'::json),
    'days', coalesce((select json_agg(json_build_object('day', d, 'min', m) order by d) from (
        select (started at time zone 'UTC')::date as d,
          sum(greatest(0, extract(epoch from (least(coalesce(ended, started + make_interval(mins => mins)), started + make_interval(mins => mins), now()) - started)) / 60))::int as m
        from st_focus where code = p_code and started > now() - interval '8 days' group by 1) x), '[]'::json),
    'mine_min', coalesce((select sum(greatest(0, extract(epoch from (least(coalesce(ended, started + make_interval(mins => mins)), started + make_interval(mins => mins), now()) - started)) / 60))::int
        from st_focus where code = p_code and uid = p_uid), 0),
    'qs', coalesce((select json_agg(q order by q.pinned desc, q.id desc) from (
        select id, case when anon and uid <> p_uid then null else uid end as uid, anon, priv, uid = p_uid as mine, body, tag,
          jsonb_array_length(too) as too, too ? p_uid::text as too_me, answer, ans_msg, ans_by, ans_at, pinned, created
        from st_qs where code = p_code and (not priv or uid = p_uid or v_teach or not v_has) order by id desc limit 150) q), '[]'::json),
    'notes', coalesce((select json_agg(n order by n.day desc, n.id desc) from (
        select id, title, day, left(body, 8000) as body, checked, by_uid as by, created,
          case when checked or not v_has or v_teach then points else '[]'::jsonb end as points,
          case when checked or not v_has or v_teach then cards else '[]'::jsonb end as cards,
          (jsonb_array_length(points) > 0) as has_ai
        from st_notes where code = p_code order by day desc, id desc limit 30) n), '[]'::json),
    'quiz', case when v_week is null then null else (
      select json_build_object('week', z.week, 'by', z.by_uid,
        'qs', case when exists (select 1 from st_quiz_ans a where a.code = p_code and a.week = z.week and a.uid = p_uid) or z.by_uid = p_uid or v_teach then z.qs
          else (select jsonb_agg(q - 'ok' - 'src') from jsonb_array_elements(z.qs) q) end,
        'mine', (select ans from st_quiz_ans a where a.code = p_code and a.week = z.week and a.uid = p_uid),
        'n', (select count(*) from st_quiz_ans a where a.code = p_code and a.week = z.week),
        'right', case when exists (select 1 from st_quiz_ans a where a.code = p_code and a.week = z.week and a.uid = p_uid) or z.by_uid = p_uid or v_teach then
          (select json_agg((select count(*) from st_quiz_ans a where a.code = p_code and a.week = z.week and (a.ans->>(i::int - 1)) = (q->>'ok')) order by i)
           from jsonb_array_elements(z.qs) with ordinality as e(q, i)) else null end)
      from st_quiz z where z.code = p_code and z.week = v_week) end
  );
end $$;

-- merges the given keys: plan (owner or teacher; any member while there is no plan yet), teachers (owner only), goal_min (owner or teacher)
create or replace function public.lm_st_set(p_uid uuid, p_token text, p_code text, p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_lead boolean; v_empty boolean;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  if p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 4000 then return false; end if;
  v_lead := _st_lead(p_uid, p_code);
  v_empty := coalesce((select plan = '{}'::jsonb from st_state where code = p_code), true);
  if p ? 'plan' and (jsonb_typeof(p->'plan') <> 'object' or not (v_lead or v_empty)) then return false; end if;
  if p ? 'teachers' then
    if jsonb_typeof(p->'teachers') <> 'array' or jsonb_array_length(p->'teachers') > 3 then return false; end if;
    if not exists (select 1 from circles where code = p_code and owner = p_uid) then return false; end if;
    if exists (select 1 from jsonb_array_elements_text(p->'teachers') t where not _lm_member(t::uuid, p_code)) then return false; end if;
  end if;
  if p ? 'goal_min' and not v_lead and not v_empty then return false; end if;
  insert into st_state(code, by_uid) values (p_code, p_uid) on conflict (code) do nothing;
  update st_state set
    plan = case when p ? 'plan' then p->'plan' else plan end,
    teachers = case when p ? 'teachers' then p->'teachers' else teachers end,
    goal_min = case when p ? 'goal_min' then greatest(0, least(10000, coalesce((p->>'goal_min')::int, 0))) else goal_min end,
    upd = now(), by_uid = p_uid
  where code = p_code;
  return true;
end $$;

-- my own place in the plan and my revision
create or replace function public.lm_st_prog(p_uid uuid, p_token text, p_code text, p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if p ? 'rev' and (jsonb_typeof(p->'rev') <> 'object' or length((p->'rev')::text) > 8000) then return false; end if;
  insert into st_prog(code, uid) values (p_code, p_uid) on conflict (code, uid) do nothing;
  update st_prog set
    pos = case when p ? 'pos' then greatest(0, least(100000, (p->>'pos')::int)) else pos end,
    day = case when p ? 'day' then nullif(p->>'day', '')::date else day end,
    streak = case when p ? 'streak' then greatest(0, least(10000, (p->>'streak')::int)) else streak end,
    rev = case when p ? 'rev' then p->'rev' else rev end,
    -- moving back below the end takes the certificate away
    cert_by = case when p ? 'pos' and (p->>'pos')::int < pos then null else cert_by end,
    cert_at = case when p ? 'pos' and (p->>'pos')::int < pos then null else cert_at end,
    upd = now()
  where code = p_code and uid = p_uid;
  return true;
end $$;

-- the teacher confirms that a member finished the plan (in a circle without a teacher, members confirm each other or themselves)
create or replace function public.lm_st_cert(p_uid uuid, p_token text, p_code text, p_target uuid, p_on boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) or not _lm_member(p_target, p_code) then return false; end if;
  if _st_has_teachers(p_code) and not _st_teacher(p_uid, p_code) then return false; end if;
  if _st_teacher(p_uid, p_code) and p_target = p_uid and not exists (select 1 from circles where code = p_code and owner = p_uid) then return false; end if;
  insert into st_prog(code, uid) values (p_code, p_target) on conflict (code, uid) do nothing;
  update st_prog set cert_by = case when p_on then p_uid else null end, cert_at = case when p_on then current_date else null end
  where code = p_code and uid = p_target;
  return true;
end $$;

-- homework: p_id 0 = new; p null = delete. Returns the id, or 0 when refused.
create or replace function public.lm_st_task_set(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) or not _st_can_teach(p_uid, p_code) then return 0; end if;
  if p is null then delete from st_tasks where id = p_id and code = p_code; return p_id; end if;
  if coalesce(trim(p->>'title'), '') = '' then return 0; end if;
  if p_id = 0 then
    if (select count(*) from st_tasks where code = p_code and created > now() - interval '1 day') >= 10 then return 0; end if;
    insert into st_tasks(code, title, body, due, due_p, by_uid)
    values (p_code, left(trim(p->>'title'), 140), left(trim(coalesce(p->>'body', '')), 600), nullif(p->>'due', '')::date, nullif(p->>'due_p', ''), p_uid)
    returning id into v_id;
    return v_id;
  end if;
  update st_tasks set title = left(trim(p->>'title'), 140), body = left(trim(coalesce(p->>'body', '')), 600),
    due = nullif(p->>'due', '')::date, due_p = nullif(p->>'due_p', '')
  where id = p_id and code = p_code returning id into v_id;
  return coalesce(v_id, 0);
end $$;

-- hand in a recitation or homework: p_id 0 = new; p null = take back my own (while not checked)
create or replace function public.lm_st_sub(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint; v_task bigint; v_msg bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  if p is null then delete from st_subs where id = p_id and code = p_code and uid = p_uid and status = 'wait'; return p_id; end if;
  if coalesce(trim(p->>'label'), '') = '' then return 0; end if;
  if (select count(*) from st_subs where code = p_code and uid = p_uid and created > now() - interval '1 day') >= 20 then return 0; end if;
  v_task := nullif(p->>'task', '')::bigint;
  if v_task is not null and not exists (select 1 from st_tasks where id = v_task and code = p_code) then v_task := null; end if;
  v_msg := nullif(p->>'msg', '')::bigint;
  if v_msg is not null and not exists (select 1 from chat_msgs where id = v_msg and code = p_code and uid = p_uid) then v_msg := null; end if;
  insert into st_subs(code, uid, label, ref, msg, task, body)
  values (p_code, p_uid, left(trim(p->>'label'), 120), case when jsonb_typeof(p->'ref') = 'object' then p->'ref' else null end, v_msg, v_task, left(trim(coalesce(p->>'body', '')), 600))
  returning id into v_id;
  return v_id;
end $$;

-- the teacher marks a hand-in: ok / redo, the ayahs with mistakes, a short note
create or replace function public.lm_st_check(p_uid uuid, p_token text, p_code text, p_id bigint, p_status text, p_marks jsonb, p_note text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) or not _st_can_teach(p_uid, p_code) then return false; end if;
  if p_status not in ('wait', 'ok', 'redo') then return false; end if;
  if p_marks is not null and (jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) > 60) then return false; end if;
  -- without a teacher nobody checks themselves
  if not _st_teacher(p_uid, p_code) and exists (select 1 from st_subs where id = p_id and uid = p_uid) then return false; end if;
  update st_subs set status = p_status, marks = coalesce(p_marks, '[]'::jsonb), note = left(trim(coalesce(p_note, '')), 300),
    checker = case when p_status = 'wait' then null else p_uid end, checked = case when p_status = 'wait' then null else now() end
  where id = p_id and code = p_code;
  return found;
end $$;

-- «Сажусь учить»: start a session (ends any open one of mine) or stop it. Returns the session id (start) or 1 (stop).
create or replace function public.lm_st_focus(p_uid uuid, p_token text, p_code text, p_act text, p_mins integer, p_what text) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  update st_focus set ended = least(now(), started + make_interval(mins => mins)) where code = p_code and uid = p_uid and ended is null;
  if p_act = 'stop' then return 1; end if;
  if p_act <> 'start' then return 0; end if;
  if (select count(*) from st_focus where code = p_code and uid = p_uid and started > now() - interval '1 day') >= 30 then return 0; end if;
  insert into st_focus(code, uid, what, mins) values (p_code, p_uid, left(trim(coalesce(p_what, '')), 80), greatest(5, least(120, coalesce(p_mins, 25))))
  returning id into v_id;
  return v_id;
end $$;

-- a question to the teacher: p_id 0 = new; p null = delete my own
create or replace function public.lm_st_q(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  if p is null then delete from st_qs where id = p_id and code = p_code and (uid = p_uid or _st_lead(p_uid, p_code)); return p_id; end if;
  if coalesce(trim(p->>'body'), '') = '' then return 0; end if;
  if (select count(*) from st_qs where code = p_code and uid = p_uid and created > now() - interval '1 day') >= 10 then return 0; end if;
  insert into st_qs(code, uid, anon, priv, body, tag)
  values (p_code, p_uid, coalesce((p->>'anon')::boolean, false), coalesce((p->>'priv')::boolean, false) and _st_has_teachers(p_code),
    left(trim(p->>'body'), 400), left(trim(coalesce(p->>'tag', '')), 30))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.lm_st_q_too(p_uid uuid, p_token text, p_code text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  update st_qs set too = case when too ? p_uid::text then too - p_uid::text else too || to_jsonb(p_uid::text) end
  where id = p_id and code = p_code and uid is distinct from p_uid;
  return found;
end $$;

-- the answer: text and/or a voice message of the circle chat; pin it to the plan
create or replace function public.lm_st_q_answer(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_msg bigint;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) or not _st_can_teach(p_uid, p_code) then return false; end if;
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  v_msg := nullif(p->>'msg', '')::bigint;
  if v_msg is not null and not exists (select 1 from chat_msgs where id = v_msg and code = p_code) then v_msg := null; end if;
  update st_qs set
    answer = case when p ? 'answer' then left(trim(coalesce(p->>'answer', '')), 1500) else answer end,
    ans_msg = case when p ? 'msg' then v_msg else ans_msg end,
    tag = case when p ? 'tag' then left(trim(coalesce(p->>'tag', '')), 30) else tag end,
    pinned = case when p ? 'pin' then coalesce((p->>'pin')::boolean, false) else pinned end,
    ans_by = case when p ? 'answer' or p ? 'msg' then p_uid else ans_by end,
    ans_at = case when p ? 'answer' or p ? 'msg' then now() else ans_at end
  where id = p_id and code = p_code and (uid is distinct from p_uid or _st_teacher(p_uid, p_code));
  return found;
end $$;

-- lesson notes: p_id 0 = new; p null = delete. Only a teacher sets «checked».
create or replace function public.lm_st_note_set(p_uid uuid, p_token text, p_code text, p_id bigint, p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint; v_teach boolean;
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return 0; end if;
  v_teach := _st_teacher(p_uid, p_code) or not _st_has_teachers(p_code);
  if p is null then delete from st_notes where id = p_id and code = p_code and (by_uid = p_uid or _st_lead(p_uid, p_code)); return p_id; end if;
  if p ? 'points' and (jsonb_typeof(p->'points') <> 'array' or jsonb_array_length(p->'points') > 5 or length((p->'points')::text) > 2000) then return 0; end if;
  if p ? 'cards' and (jsonb_typeof(p->'cards') <> 'array' or jsonb_array_length(p->'cards') > 12 or length((p->'cards')::text) > 3000) then return 0; end if;
  if p_id = 0 then
    if coalesce(trim(p->>'title'), '') = '' then return 0; end if;
    if (select count(*) from st_notes where code = p_code and created > now() - interval '1 day') >= 10 then return 0; end if;
    insert into st_notes(code, title, day, body, points, cards, checked, by_uid)
    values (p_code, left(trim(p->>'title'), 120), coalesce(nullif(p->>'day', '')::date, current_date), left(coalesce(p->>'body', ''), 20000),
      coalesce(p->'points', '[]'::jsonb), coalesce(p->'cards', '[]'::jsonb), v_teach and _st_has_teachers(p_code) and coalesce((p->>'checked')::boolean, false), p_uid)
    returning id into v_id;
    return v_id;
  end if;
  update st_notes set
    title = case when p ? 'title' and trim(p->>'title') <> '' then left(trim(p->>'title'), 120) else title end,
    day = case when p ? 'day' then coalesce(nullif(p->>'day', '')::date, day) else day end,
    body = case when p ? 'body' then left(coalesce(p->>'body', ''), 20000) else body end,
    points = case when p ? 'points' then p->'points' else points end,
    cards = case when p ? 'cards' then p->'cards' else cards end,
    -- a change of the content by someone who is not a teacher takes the check away
    checked = case when p ? 'checked' and _st_teacher(p_uid, p_code) then coalesce((p->>'checked')::boolean, false)
      when (p ? 'body' or p ? 'points' or p ? 'cards') and not _st_teacher(p_uid, p_code) then false else checked end
  where id = p_id and code = p_code and (by_uid = p_uid or v_teach) returning id into v_id;
  return coalesce(v_id, 0);
end $$;

-- the Friday quiz: up to 5 questions, made by the teacher (or any member without one); not changed once answered
create or replace function public.lm_st_quiz_set(p_uid uuid, p_token text, p_code text, p_week date, p_qs jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) or not _st_can_teach(p_uid, p_code) then return false; end if;
  if p_week is null or p_week < current_date - 1 or p_week > current_date + 7 or extract(isodow from p_week) <> 5 then return false; end if;
  if exists (select 1 from st_quiz_ans where code = p_code and week = p_week) then return false; end if;
  if p_qs is null then delete from st_quiz where code = p_code and week = p_week; return true; end if;
  if jsonb_typeof(p_qs) <> 'array' or jsonb_array_length(p_qs) not between 1 and 5 or length(p_qs::text) > 5000 then return false; end if;
  insert into st_quiz(code, week, qs, by_uid) values (p_code, p_week, p_qs, p_uid)
  on conflict (code, week) do update set qs = excluded.qs, by_uid = excluded.by_uid, created = now();
  return true;
end $$;

create or replace function public.lm_st_quiz_ans(p_uid uuid, p_token text, p_code text, p_week date, p_ans jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return false; end if;
  if p_ans is null or jsonb_typeof(p_ans) <> 'array' or jsonb_array_length(p_ans) > 5 then return false; end if;
  if not exists (select 1 from st_quiz where code = p_code and week = p_week) then return false; end if;
  insert into st_quiz_ans(code, week, uid, ans) values (p_code, p_week, p_uid, p_ans) on conflict (code, week, uid) do nothing;
  return found;
end $$;

revoke all on function public._st_has_teachers(text), public._st_teacher(uuid, text), public._st_lead(uuid, text), public._st_can_teach(uuid, text) from public, anon, authenticated;
revoke all on function public.lm_st_get(uuid, text, text), public.lm_st_set(uuid, text, text, jsonb), public.lm_st_prog(uuid, text, text, jsonb),
  public.lm_st_cert(uuid, text, text, uuid, boolean), public.lm_st_task_set(uuid, text, text, bigint, jsonb), public.lm_st_sub(uuid, text, text, bigint, jsonb),
  public.lm_st_check(uuid, text, text, bigint, text, jsonb, text), public.lm_st_focus(uuid, text, text, text, integer, text),
  public.lm_st_q(uuid, text, text, bigint, jsonb), public.lm_st_q_too(uuid, text, text, bigint), public.lm_st_q_answer(uuid, text, text, bigint, jsonb),
  public.lm_st_note_set(uuid, text, text, bigint, jsonb), public.lm_st_quiz_set(uuid, text, text, date, jsonb), public.lm_st_quiz_ans(uuid, text, text, date, jsonb) from public;
grant execute on function public.lm_st_get(uuid, text, text), public.lm_st_set(uuid, text, text, jsonb), public.lm_st_prog(uuid, text, text, jsonb),
  public.lm_st_cert(uuid, text, text, uuid, boolean), public.lm_st_task_set(uuid, text, text, bigint, jsonb), public.lm_st_sub(uuid, text, text, bigint, jsonb),
  public.lm_st_check(uuid, text, text, bigint, text, jsonb, text), public.lm_st_focus(uuid, text, text, text, integer, text),
  public.lm_st_q(uuid, text, text, bigint, jsonb), public.lm_st_q_too(uuid, text, text, bigint), public.lm_st_q_answer(uuid, text, text, bigint, jsonb),
  public.lm_st_note_set(uuid, text, text, bigint, jsonb), public.lm_st_quiz_set(uuid, text, text, date, jsonb), public.lm_st_quiz_ans(uuid, text, text, date, jsonb) to anon, authenticated;
