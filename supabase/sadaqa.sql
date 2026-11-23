-- Living Muslim: «Подари Pro тому, кто просит», «Поддержать Living Muslim» and «Куда отдать».
-- Paste into Supabase → SQL Editor and press Run. Needs schema.sql, nicks.sql, admin.sql and founders.sql (already run). Safe to run again.
--
-- Gift: someone pays €5/10/20/50 (once or every month) and the months of Pro go to the people who pressed
-- «Попросить Pro бесплатно», oldest first. When nobody is waiting, the months wait in a pool for the next request.
-- The person who gets it never sees who paid unless the giver chose «от моего ника».
-- Support: €5/10/20/50 for the project (a privileges package «Сторонник»: the mark and a name on the wall). Not sadaqa.
-- Payments go through Stripe Checkout (api/invest.js op=sadaqa) and the same webhook as the founders (op=paid).
-- Charities: a list the owner keeps in «Для владельца» → «Садака». Money for them goes straight to the charity.

create table if not exists public.sadaqa_pay (
  id uuid primary key default gen_random_uuid(),
  uid uuid references public.users(uid) on delete set null,
  kind text not null check (kind in ('gift', 'support')),
  eur int not null check (eur in (5, 10, 20, 50)),
  mode text not null default 'once' check (mode in ('once', 'month')),
  sign text not null default 'secret' check (sign in ('secret', 'nick')),
  wall text not null default '',           -- support: name on the wall of supporters; '' = anonymous
  lang text not null default 'ru',
  status text not null default 'pending' check (status in ('pending', 'paid', 'test', 'ended')),
  session text unique,                     -- Stripe checkout session
  sub text,                                -- Stripe subscription (mode month)
  invoices text[] not null default '{}',   -- monthly invoices already counted
  periods int not null default 0,          -- payments counted so far
  created timestamptz not null default now(),
  paid timestamptz
);
create index if not exists sadaqa_pay_uid on public.sadaqa_pay (uid, created);
create index if not exists sadaqa_pay_sub on public.sadaqa_pay (sub);

-- People who asked for Pro because they cannot pay. One open request per person.
create table if not exists public.pro_asks (
  uid uuid primary key references public.users(uid) on delete cascade,
  note text not null default '',
  status text not null default 'wait' check (status in ('wait', 'got')),
  created timestamptz not null default now(),
  got timestamptz,
  months int not null default 0,
  from_nick text                            -- the giver's nick when they chose to sign
);
create index if not exists pro_asks_wait on public.pro_asks (status, created);

-- Months already paid for that nobody has asked for yet.
create table if not exists public.pro_pool (
  id bigserial primary key,
  pay uuid not null references public.sadaqa_pay(id) on delete cascade,
  months int not null,
  created timestamptz not null default now()
);

create table if not exists public.charities (
  id bigserial primary key,
  title text not null,                      -- «Колодец в Чаде»
  org text not null default '',             -- the charity's name
  kind text not null default 'other' check (kind in ('water', 'orphans', 'food', 'mosque', 'urgent', 'other')),
  url text not null,
  region text not null default '',          -- «Европа», «Россия», «весь мир»
  note text not null default '',            -- «от €5», «€30/мес»
  jariya boolean not null default false,    -- counts as sadaqa jariyah (well, mosque, Quran)
  on_list boolean not null default true,
  sort int not null default 0,
  created timestamptz not null default now()
);

alter table public.sadaqa_pay enable row level security;
alter table public.pro_asks enable row level security;
alter table public.pro_pool enable row level security;
alter table public.charities enable row level security;
revoke all on public.sadaqa_pay, public.pro_asks, public.pro_pool, public.charities from anon, authenticated;

-- Months of Pro a gift buys, one entry per person: €50 = a year for one and 4 months for another.
create or replace function public._lm_gmonths(p_eur int) returns int[]
language sql immutable as $$
  select case p_eur when 5 then array[1] when 10 then array[2] when 20 then array[5] when 50 then array[12, 4] else array[]::int[] end;
$$;

-- Gives m months to one waiting person (oldest first, never the giver). False when nobody waits.
create or replace function public._lm_give_one(p_pay uuid, p_m int, p_tag text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare a pro_asks; p sadaqa_pay; u timestamptz; nk text;
begin
  select * into p from sadaqa_pay where id = p_pay;
  select * into a from pro_asks where status = 'wait' and uid is distinct from p.uid order by created limit 1 for update skip locked;
  if a.uid is null then return false; end if;
  u := greatest(now(), coalesce((select max(until) from pro_grants where uid = a.uid and not forever), now())) + (p_m || ' months')::interval;
  insert into pro_grants(uid, until, forever, source) values (a.uid, u, false, 'sadaqa:' || p_pay || ':' || p_tag) on conflict (uid, source) do nothing;
  nk := case when p.sign = 'nick' then (select nick from users where uid = p.uid) else null end;
  update pro_asks set status = 'got', got = now(), months = p_m, from_nick = nk where uid = a.uid;
  return true;
end $$;
revoke all on function public._lm_give_one(uuid, int, text) from public, anon, authenticated;

-- One payment of a gift (the first or a monthly one): each share goes to a person or to the pool.
create or replace function public._lm_gift_give(p_pay uuid, p_period int) returns void
language plpgsql volatile security definer set search_path = public as $$
declare p sadaqa_pay; m int; i int := 0;
begin
  select * into p from sadaqa_pay where id = p_pay;
  if p.kind <> 'gift' then return; end if;
  foreach m in array _lm_gmonths(p.eur) loop
    i := i + 1;
    if not _lm_give_one(p_pay, m, p_period || '-' || i) then insert into pro_pool(pay, months) values (p_pay, m); end if;
  end loop;
end $$;
revoke all on function public._lm_gift_give(uuid, int) from public, anon, authenticated;

-- Step 1 (api/_sadaqa-checkout.js, before Stripe): a pending record. Returns its id, or null.
create or replace function public.lm_sadaqa_prepare(p_uid uuid, p_token text, p_kind text, p_eur int, p_mode text, p_sign text, p_wall text, p_lang text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare i uuid;
begin
  if not _lm_ok(p_uid, p_token) or p_kind not in ('gift', 'support') or p_eur not in (5, 10, 20, 50) then return null; end if;
  if (select count(*) from sadaqa_pay where uid = p_uid and status = 'pending' and created > now() - interval '1 hour') >= 6 then return null; end if;
  insert into sadaqa_pay(uid, kind, eur, mode, sign, wall, lang)
  values (p_uid, p_kind, p_eur, case when p_mode = 'month' then 'month' else 'once' end, case when p_sign = 'nick' then 'nick' else 'secret' end,
    case when p_kind = 'support' then left(trim(coalesce(p_wall, '')), 40) else '' end, case when p_lang = 'en' then 'en' else 'ru' end)
  returning id into i;
  return i;
end $$;

create or replace function public._lm_sadaqa_json(p public.sadaqa_pay) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', p.id, 'kind', p.kind, 'eur', p.eur, 'mode', p.mode, 'sign', p.sign, 'wall', p.wall, 'status', p.status,
    'periods', p.periods, 'paid', p.paid, 'lang', p.lang,
    'opened', (select count(*) from pro_grants where source like 'sadaqa:' || p.id || ':%'),
    'pooled', (select count(*) from pro_pool where pay = p.id));
$$;
revoke all on function public._lm_sadaqa_json(public.sadaqa_pay) from public, anon, authenticated;

-- Marks a payment paid (or test) and hands out the months. Idempotent per checkout.
create or replace function public._lm_sadaqa_grant(p_id uuid, p_session text, p_sub text, p_status text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare p sadaqa_pay;
begin
  select * into p from sadaqa_pay where id = p_id for update;
  if p.id is null then return null; end if;
  if p.status in ('paid', 'test') then return _lm_sadaqa_json(p); end if;
  update sadaqa_pay set status = p_status, session = coalesce(p_session, session), sub = coalesce(p_sub, sub), paid = now(), periods = 1
  where id = p_id returning * into p;
  perform _lm_gift_give(p.id, 1);
  return _lm_sadaqa_json(p);
end $$;
revoke all on function public._lm_sadaqa_grant(uuid, text, text, text) from public, anon, authenticated;

-- Step 2 (the Stripe webhook with the service role key): checkout.session.completed.
create or replace function public.lm_sadaqa_paid(p_id uuid, p_session text, p_sub text, p_amount int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare p sadaqa_pay;
begin
  select * into p from sadaqa_pay where id = p_id;
  if p.id is null then return null; end if;
  if p.status = 'pending' and p_amount is not null and p_amount < p.eur * 100 then return json_build_object('error', 'amount'); end if;
  return _lm_sadaqa_grant(p_id, p_session, p_sub, 'paid');
end $$;
revoke all on function public.lm_sadaqa_paid(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.lm_sadaqa_paid(uuid, text, text, int) to service_role;

-- Every next month of a monthly payment (invoice.paid with billing_reason subscription_cycle). Once per invoice.
create or replace function public.lm_sadaqa_renew(p_sub text, p_id uuid, p_invoice text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare p sadaqa_pay;
begin
  select * into p from sadaqa_pay where (p_sub is not null and sub = p_sub) or id = p_id order by created limit 1 for update;
  if p.id is null or p.status not in ('paid', 'test') then return json_build_object('error', 'none'); end if;
  if p_invoice = any(p.invoices) then return _lm_sadaqa_json(p); end if;
  update sadaqa_pay set periods = periods + 1, invoices = array_append(invoices, p_invoice), sub = coalesce(sub, p_sub) where id = p.id returning * into p;
  perform _lm_gift_give(p.id, p.periods);
  return _lm_sadaqa_json(p);
end $$;
revoke all on function public.lm_sadaqa_renew(text, uuid, text) from public, anon, authenticated;
grant execute on function public.lm_sadaqa_renew(text, uuid, text) to service_role;

-- The monthly payment was cancelled in Stripe (customer.subscription.deleted).
create or replace function public.lm_sadaqa_end(p_sub text) returns void
language sql volatile security definer set search_path = public as $$
  update sadaqa_pay set status = 'ended' where sub = p_sub and status = 'paid';
$$;
revoke all on function public.lm_sadaqa_end(text) from public, anon, authenticated;
grant execute on function public.lm_sadaqa_end(text) to service_role;

-- The owner's test path: the whole thing without paying (test records stay off the wall and the totals).
create or replace function public.lm_sadaqa_test(p_uid uuid, p_token text, p_kind text, p_eur int, p_mode text, p_sign text, p_wall text, p_lang text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare i uuid;
begin
  if not _lm_is_admin() then return json_build_object('error', 'admin'); end if;
  i := lm_sadaqa_prepare(p_uid, p_token, p_kind, p_eur, p_mode, p_sign, p_wall, p_lang);
  if i is null then return json_build_object('error', 'input'); end if;
  return _lm_sadaqa_grant(i, null, null, 'test');
end $$;

-- «Попросить Pro бесплатно»: one open request; months waiting in the pool are given at once.
create or replace function public.lm_pro_ask(p_uid uuid, p_token text, p_note text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare a pro_asks; q pro_pool;
begin
  if not _lm_ok(p_uid, p_token) then return json_build_object('error', 'auth'); end if;
  select * into a from pro_asks where uid = p_uid;
  if a.uid is not null and a.status = 'wait' then return json_build_object('ok', true, 'status', 'wait'); end if;
  if a.uid is not null and a.got > now() - interval '30 days' then return json_build_object('ok', true, 'status', 'got', 'soon', true); end if;
  insert into pro_asks(uid, note) values (p_uid, left(trim(coalesce(p_note, '')), 200))
  on conflict (uid) do update set status = 'wait', note = excluded.note, created = now(), got = null, months = 0, from_nick = null;
  select * into q from pro_pool order by created limit 1 for update skip locked;
  if q.id is not null and _lm_give_one(q.pay, q.months, 'pool-' || q.id) then delete from pro_pool where id = q.id; end if;
  return json_build_object('ok', true, 'status', (select status from pro_asks where uid = p_uid));
end $$;

-- What I gave, my request and whether I am a supporter.
create or replace function public.lm_sadaqa_mine(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return json_build_object(
    'list', coalesce((select json_agg(_lm_sadaqa_json(p) order by p.paid desc) from sadaqa_pay p where p.uid = p_uid and p.status in ('paid', 'test', 'ended')), '[]'::json),
    'ask', (select json_build_object('status', status, 'created', created, 'got', got, 'months', months, 'from', from_nick) from pro_asks where uid = p_uid),
    'supporter', exists (select 1 from sadaqa_pay where uid = p_uid and kind = 'support' and status in ('paid', 'test', 'ended')));
end $$;

-- Numbers for the screens (no identity needed). Test records do not count.
create or replace function public.lm_sadaqa_wall() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'waiting', (select count(*) from pro_asks where status = 'wait'),
    'helped', (select count(distinct uid) from pro_grants where source like 'sadaqa:%'),
    'pool', coalesce((select sum(months) from pro_pool), 0),
    'supporters', (select count(distinct uid) from sadaqa_pay where kind = 'support' and status in ('paid', 'ended')),
    'anon', (select count(*) from sadaqa_pay where kind = 'support' and status in ('paid', 'ended') and wall = ''),
    'names', coalesce((select json_agg(w order by paid desc) from (select wall w, max(paid) paid from sadaqa_pay where kind = 'support' and status in ('paid', 'ended') and wall <> '' group by wall order by max(paid) desc limit 60) s), '[]'::json));
$$;

-- The «Сторонник» mark next to names: supporters who put their name on the wall.
create or replace function public.lm_supporter_of(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sadaqa_pay where uid = p_other and kind = 'support' and status in ('paid', 'test', 'ended') and wall <> '');
$$;

-- «Куда отдать»: the list for everyone.
create or replace function public.lm_charities() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'title', title, 'org', org, 'kind', kind, 'url', url, 'region', region, 'note', note, 'jariya', jariya) order by sort, id), '[]'::json)
  from charities where on_list;
$$;

-- The owner: payments, requests, the list of charities.
create or replace function public.lm_admin_sadaqa() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return json_build_object(
    'sum', coalesce((select sum(eur * periods) from sadaqa_pay where status in ('paid', 'ended')), 0),
    'pays', coalesce((select json_agg(json_build_object('kind', p.kind, 'eur', p.eur, 'mode', p.mode, 'sign', p.sign, 'wall', p.wall, 'status', p.status, 'periods', p.periods,
      'paid', p.paid, 'nick', u.nick, 'name', u.name, 'opened', (select count(*) from pro_grants where source like 'sadaqa:' || p.id || ':%')) order by p.paid desc)
      from sadaqa_pay p left join users u on u.uid = p.uid where p.status <> 'pending'), '[]'::json),
    'asks', coalesce((select json_agg(json_build_object('status', a.status, 'note', a.note, 'created', a.created, 'got', a.got, 'months', a.months, 'nick', u.nick, 'name', u.name) order by a.created desc)
      from pro_asks a left join users u on u.uid = a.uid), '[]'::json),
    'pool', coalesce((select sum(months) from pro_pool), 0),
    'charities', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'org', org, 'kind', kind, 'url', url, 'region', region, 'note', note, 'jariya', jariya, 'on', on_list, 'sort', sort) order by sort, id) from charities), '[]'::json));
end $$;

create or replace function public.lm_admin_charity_save(p jsonb) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare i bigint := nullif(p->>'id', '')::bigint; k text := coalesce(p->>'kind', 'other');
begin
  if not _lm_is_admin() then return null; end if;
  if coalesce(trim(p->>'title'), '') = '' or coalesce(p->>'url', '') !~ '^https?://' then return null; end if;
  if k not in ('water', 'orphans', 'food', 'mosque', 'urgent', 'other') then k := 'other'; end if;
  if i is null then
    insert into charities(title, org, kind, url, region, note, jariya, on_list, sort)
    values (left(trim(p->>'title'), 80), left(trim(coalesce(p->>'org', '')), 80), k, left(trim(p->>'url'), 300), left(trim(coalesce(p->>'region', '')), 40),
      left(trim(coalesce(p->>'note', '')), 40), coalesce((p->>'jariya')::boolean, false), coalesce((p->>'on')::boolean, true), coalesce((p->>'sort')::int, 0))
    returning id into i;
  else
    update charities set title = left(trim(p->>'title'), 80), org = left(trim(coalesce(p->>'org', '')), 80), kind = k, url = left(trim(p->>'url'), 300),
      region = left(trim(coalesce(p->>'region', '')), 40), note = left(trim(coalesce(p->>'note', '')), 40), jariya = coalesce((p->>'jariya')::boolean, false),
      on_list = coalesce((p->>'on')::boolean, true), sort = coalesce((p->>'sort')::int, 0)
    where id = i;
  end if;
  return i;
end $$;

create or replace function public.lm_admin_charity_del(p_id bigint) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return; end if;
  delete from charities where id = p_id;
end $$;

revoke all on function public.lm_sadaqa_prepare(uuid,text,text,int,text,text,text,text), public.lm_sadaqa_test(uuid,text,text,int,text,text,text,text),
  public.lm_pro_ask(uuid,text,text), public.lm_sadaqa_mine(uuid,text), public.lm_sadaqa_wall(), public.lm_supporter_of(uuid), public.lm_charities(),
  public.lm_admin_sadaqa(), public.lm_admin_charity_save(jsonb), public.lm_admin_charity_del(bigint) from public;
grant execute on function public.lm_sadaqa_prepare(uuid,text,text,int,text,text,text,text), public.lm_sadaqa_test(uuid,text,text,int,text,text,text,text),
  public.lm_pro_ask(uuid,text,text), public.lm_sadaqa_mine(uuid,text), public.lm_sadaqa_wall(), public.lm_supporter_of(uuid), public.lm_charities(),
  public.lm_admin_sadaqa(), public.lm_admin_charity_save(jsonb), public.lm_admin_charity_del(bigint) to anon, authenticated;
