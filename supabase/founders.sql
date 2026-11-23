-- Living Muslim: «Круг основателей» (founders circle, from €100). Paste into Supabase → SQL Editor and press Run.
-- Needs schema.sql, nicks.sql and admin.sql (already run). Safe to run again.
--
-- A person picks a level, pays through Stripe Checkout (api/founder-checkout.js) and the Stripe webhook
-- (api/founder-paid.js, with the service role key) marks the record paid: certificate number and code,
-- Pro for the level's time, gift codes for the higher levels. The owner (lm_admins) can make a test record
-- without paying, to walk the whole path before Stripe is connected.
--
-- Levels: f100 Основатель €100 (Pro 3 months), f250 Ансар €250 (Pro a year), f500 Мухсин €500 (Pro a year + 1 gift),
-- f1000 Партнёр €1000 (Pro forever + 3 gifts). Each payment is a service (the privileges) plus a recorded
-- contribution (amount − service), shown to the person as «ваш вклад».

create table if not exists public.founders (
  id uuid primary key default gen_random_uuid(),
  uid uuid references public.users(uid) on delete set null,
  tier text not null check (tier in ('f100', 'f250', 'f500', 'f1000')),
  amount int not null,                      -- cents paid
  service int not null,                     -- cents: the privileges (service)
  contrib int not null,                     -- cents: the recorded contribution
  name text not null default '',            -- on the certificate
  email text not null default '',
  country text not null default '',
  wall text not null default '',            -- on the wall of founders; '' = anonymous
  lang text not null default 'ru',
  status text not null default 'pending' check (status in ('pending', 'paid', 'test', 'refunded')),
  no int,                                   -- certificate number (F-0001), set when paid
  code text unique,                         -- certificate code F-0001-K7Q2ZX (the link to the PDF)
  session text unique,                      -- Stripe checkout session id
  pro_until timestamptz,
  pro_forever boolean not null default false,
  created timestamptz not null default now(),
  paid timestamptz
);
create index if not exists founders_uid on public.founders (uid, created);
create index if not exists founders_status on public.founders (status, paid);
create sequence if not exists public.founders_no;

-- Gift Pro codes (levels €500 and €1000): a year of Pro for someone else.
create table if not exists public.founder_gifts (
  code text primary key,
  founder uuid not null references public.founders(id) on delete cascade,
  used_by uuid references public.users(uid) on delete set null,
  used timestamptz,
  created timestamptz not null default now()
);
create index if not exists founder_gifts_founder on public.founder_gifts (founder);

-- Pro given by the server (a founder's own level, a used gift code). The app reads it in lm_founder_mine.
create table if not exists public.pro_grants (
  id bigserial primary key,
  uid uuid not null references public.users(uid) on delete cascade,
  until timestamptz,                        -- null with forever
  forever boolean not null default false,
  source text not null,                     -- founder:<id> or gift:<code>
  created timestamptz not null default now(),
  unique (uid, source)
);

alter table public.founders enable row level security;
alter table public.founder_gifts enable row level security;
alter table public.pro_grants enable row level security;
revoke all on public.founders, public.founder_gifts, public.pro_grants from anon, authenticated;

-- The levels. amount/service in cents, days of Pro (null = forever), number of gift codes.
create or replace function public._lm_ftier(p_tier text) returns jsonb
language sql immutable as $$
  select case p_tier
    when 'f100' then '{"amount":10000,"service":1500,"days":90,"forever":false,"gifts":0}'::jsonb
    when 'f250' then '{"amount":25000,"service":3000,"days":365,"forever":false,"gifts":0}'::jsonb
    when 'f500' then '{"amount":50000,"service":6000,"days":365,"forever":false,"gifts":1}'::jsonb
    when 'f1000' then '{"amount":100000,"service":10000,"days":null,"forever":true,"gifts":3}'::jsonb
    else null end;
$$;

-- Short codes without look-alike letters.
create or replace function public._lm_fcode(n int) returns text
language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text := ''; i int;
begin
  for i in 1..n loop s := s || substr(a, 1 + floor(random() * 32)::int, 1); end loop;
  return s;
end $$;
revoke all on function public._lm_fcode(int) from public, anon, authenticated;

-- Step 1 (from api/founder-checkout.js, before Stripe): a pending record. Returns its id, or null.
create or replace function public.lm_founder_prepare(p_uid uuid, p_token text, p_tier text, p_name text, p_email text, p_country text, p_wall text, p_lang text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare t jsonb := _lm_ftier(p_tier); i uuid;
begin
  if not _lm_ok(p_uid, p_token) or t is null then return null; end if;
  if coalesce(trim(p_name), '') = '' or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return null; end if;
  -- flood guard: at most 5 unpaid attempts an hour per person
  if (select count(*) from founders where uid = p_uid and status = 'pending' and created > now() - interval '1 hour') >= 5 then return null; end if;
  insert into founders(uid, tier, amount, service, contrib, name, email, country, wall, lang)
  values (p_uid, p_tier, (t->>'amount')::int, (t->>'service')::int, (t->>'amount')::int - (t->>'service')::int,
    left(trim(p_name), 60), left(lower(trim(p_email)), 120), left(trim(coalesce(p_country, '')), 60), left(trim(coalesce(p_wall, '')), 40), case when p_lang = 'en' then 'en' else 'ru' end)
  returning id into i;
  return i;
end $$;

-- Everything a letter and the PDF need about one record.
create or replace function public._lm_founder_json(f public.founders) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', f.id, 'uid', f.uid, 'tier', f.tier, 'amount', f.amount, 'service', f.service, 'contrib', f.contrib,
    'name', f.name, 'email', f.email, 'country', f.country, 'wall', f.wall, 'lang', f.lang, 'status', f.status,
    'no', f.no, 'code', f.code, 'pro_until', f.pro_until, 'pro_forever', f.pro_forever, 'paid', f.paid,
    'gifts', coalesce((select json_agg(json_build_object('code', g.code, 'used', g.used is not null) order by g.created) from founder_gifts g where g.founder = f.id), '[]'::json));
$$;
revoke all on function public._lm_founder_json(public.founders) from public, anon, authenticated;

-- Marks a record paid (or test): number, code, Pro, gift codes. Idempotent: a paid record is returned as it is.
create or replace function public._lm_founder_grant(p_id uuid, p_session text, p_status text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare f founders; t jsonb; n int; c text; k int;
begin
  select * into f from founders where id = p_id;
  if f.id is null then return null; end if;
  if f.status in ('paid', 'test') then return _lm_founder_json(f); end if;
  t := _lm_ftier(f.tier);
  n := nextval('founders_no');
  loop
    c := 'F-' || lpad(n::text, 4, '0') || '-' || _lm_fcode(6);
    exit when not exists (select 1 from founders where code = c);
  end loop;
  update founders set status = p_status, no = n, code = c, session = coalesce(p_session, session), paid = now(),
    pro_forever = (t->>'forever')::boolean,
    pro_until = case when (t->>'forever')::boolean then null else now() + ((t->>'days')::int || ' days')::interval end
  where id = p_id returning * into f;
  if f.uid is not null then
    insert into pro_grants(uid, until, forever, source) values (f.uid, f.pro_until, f.pro_forever, 'founder:' || f.id)
    on conflict (uid, source) do nothing;
  end if;
  for k in 1..coalesce((t->>'gifts')::int, 0) loop
    loop
      c := 'LM-GIFT-' || _lm_fcode(5);
      exit when not exists (select 1 from founder_gifts where code = c);
    end loop;
    insert into founder_gifts(code, founder) values (c, f.id);
  end loop;
  return _lm_founder_json(f);
end $$;
revoke all on function public._lm_founder_grant(uuid, text, text) from public, anon, authenticated;

-- Step 2 (api/founder-paid.js, Stripe webhook, called with the service role key only).
create or replace function public.lm_founder_paid(p_id uuid, p_session text, p_amount int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare f founders;
begin
  select * into f from founders where id = p_id;
  if f.id is null then return null; end if;
  if f.status = 'pending' and p_amount is not null and p_amount < f.amount then return json_build_object('error', 'amount'); end if;
  return _lm_founder_grant(p_id, p_session, 'paid');
end $$;
revoke all on function public.lm_founder_paid(uuid, text, int) from public, anon, authenticated;
grant execute on function public.lm_founder_paid(uuid, text, int) to service_role;

-- The owner's test path (lm_admins, signed in by email): the whole record without a payment.
create or replace function public.lm_founder_test(p_uid uuid, p_token text, p_tier text, p_name text, p_email text, p_country text, p_wall text, p_lang text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare i uuid;
begin
  if not _lm_is_admin() then return json_build_object('error', 'admin'); end if;
  i := lm_founder_prepare(p_uid, p_token, p_tier, p_name, p_email, p_country, p_wall, p_lang);
  if i is null then return json_build_object('error', 'input'); end if;
  return _lm_founder_grant(i, null, 'test');
end $$;

-- The record behind a certificate code (the PDF endpoint and the «Мой вклад» link).
create or replace function public.lm_founder_cert(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select _lm_founder_json(f) from founders f where f.code = upper(trim(coalesce(p_code, ''))) and f.status in ('paid', 'test');
$$;

-- My records, gift codes and all Pro the server gave me.
create or replace function public.lm_founder_mine(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return json_build_object(
    'list', coalesce((select json_agg(_lm_founder_json(f) order by f.paid) from founders f where f.uid = p_uid and f.status in ('paid', 'test')), '[]'::json),
    'forever', exists (select 1 from pro_grants where uid = p_uid and forever),
    'until', (select max(until) from pro_grants where uid = p_uid and not forever and until > now()));
end $$;

-- A gift code: a year of Pro for the person who enters it (not the giver).
create or replace function public.lm_founder_gift_use(p_uid uuid, p_token text, p_code text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare g founder_gifts; f founders; u timestamptz;
begin
  if not _lm_ok(p_uid, p_token) then return json_build_object('error', 'auth'); end if;
  select * into g from founder_gifts where code = upper(trim(coalesce(p_code, '')));
  if g.code is null then return json_build_object('error', 'nocode'); end if;
  if g.used is not null then return json_build_object('error', 'used'); end if;
  select * into f from founders where id = g.founder;
  if f.uid = p_uid then return json_build_object('error', 'own'); end if;
  u := greatest(now(), coalesce((select max(until) from pro_grants where uid = p_uid and not forever), now())) + interval '365 days';
  update founder_gifts set used_by = p_uid, used = now() where code = g.code;
  insert into pro_grants(uid, until, forever, source) values (p_uid, u, false, 'gift:' || g.code) on conflict (uid, source) do nothing;
  return json_build_object('ok', true, 'until', u);
end $$;

-- The wall and the progress bar (no identity needed). Test records do not count.
create or replace function public.lm_founders_wall() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'sum', coalesce((select sum(amount) from founders where status = 'paid'), 0),
    'count', (select count(*) from founders where status = 'paid'),
    'goal', 2000000,
    'anon', (select count(*) from founders where status = 'paid' and wall = ''),
    'names', coalesce((select json_agg(json_build_object('w', wall, 't', tier) order by paid desc) from (select wall, tier, paid from founders where status = 'paid' and wall <> '' order by paid desc limit 80) s), '[]'::json));
$$;

-- The founder's mark next to someone's name: the level, or null when not a founder or anonymous.
create or replace function public.lm_founder_of(p_other uuid) returns text
language sql stable security definer set search_path = public as $$
  select tier from founders where uid = p_other and status in ('paid', 'test') and wall <> '' order by amount desc limit 1;
$$;

-- The owner's list.
create or replace function public.lm_admin_founders() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return json_build_object(
    'sum', coalesce((select sum(amount) from founders where status = 'paid'), 0),
    'list', coalesce((select json_agg(json_build_object('no', no, 'code', code, 'tier', tier, 'amount', amount, 'name', name, 'email', email, 'country', country,
      'wall', wall, 'status', status, 'paid', paid, 'created', created, 'session', session) order by created desc) from founders where status <> 'pending'), '[]'::json),
    'pending', (select count(*) from founders where status = 'pending' and created > now() - interval '1 day'));
end $$;

revoke all on function public.lm_founder_prepare(uuid,text,text,text,text,text,text,text), public.lm_founder_test(uuid,text,text,text,text,text,text,text),
  public.lm_founder_cert(text), public.lm_founder_mine(uuid,text), public.lm_founder_gift_use(uuid,text,text), public.lm_founders_wall(),
  public.lm_founder_of(uuid), public.lm_admin_founders() from public;
grant execute on function public.lm_founder_prepare(uuid,text,text,text,text,text,text,text), public.lm_founder_test(uuid,text,text,text,text,text,text,text),
  public.lm_founder_cert(text), public.lm_founder_mine(uuid,text), public.lm_founder_gift_use(uuid,text,text), public.lm_founders_wall(),
  public.lm_founder_of(uuid), public.lm_admin_founders() to anon, authenticated;
