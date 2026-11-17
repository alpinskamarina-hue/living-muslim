-- Living Muslim: Circle backend. Paste into Supabase SQL Editor and press Run.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  uid uuid primary key default gen_random_uuid(),
  token_hash text not null,
  name text not null default '',
  color text not null default '#1f7a4d',
  created timestamptz not null default now()
);
create table if not exists public.circles (
  code text primary key,
  owner uuid not null references public.users(uid) on delete cascade,
  created timestamptz not null default now()
);
create table if not exists public.members (
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  joined timestamptz not null default now(),
  primary key (code, uid)
);
create index if not exists members_uid on public.members(uid);
create index if not exists circles_owner on public.circles(owner);
create table if not exists public.docs (
  code text not null references public.circles(code) on delete cascade,
  coll text not null,
  key uuid not null references public.users(uid) on delete cascade,
  data jsonb not null,
  updated timestamptz not null default now(),
  primary key (code, coll, key)
);
create index if not exists docs_key on public.docs(key);
create table if not exists public.summaries (
  book text not null,
  n int not null,
  title text not null,
  md text not null,
  date text not null default '',
  primary key (book, n)
);

alter table public.users enable row level security;
alter table public.circles enable row level security;
alter table public.members enable row level security;
alter table public.docs enable row level security;
alter table public.summaries enable row level security;
revoke all on public.users, public.circles, public.members, public.docs, public.summaries from anon, authenticated;

create or replace function public._lm_ok(p_uid uuid, p_token text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from users where uid = p_uid and token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex'));
$$;
revoke all on function public._lm_ok(uuid, text) from public, anon, authenticated;

create or replace function public.lm_register(p_name text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(24), 'hex'); u uuid; colors text[] := array['#1f7a4d','#b88a2c','#2f6f9f','#8a4f9e','#c0563b','#3f7f7a','#6b7d2a'];
begin
  insert into users(token_hash, name, color)
  values (encode(digest(t, 'sha256'), 'hex'), left(trim(coalesce(p_name,'')), 40), colors[1 + floor(random()*7)::int])
  returning uid into u;
  return json_build_object('uid', u, 'token', t);
end $$;

create or replace function public.lm_set_name(p_uid uuid, p_token text, p_name text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update users set name = left(trim(coalesce(p_name,'')), 40) where uid = p_uid;
  return true;
end $$;

create or replace function public.lm_create_circle(p_uid uuid, p_token text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare c text; abc text := 'abcdefghjkmnpqrstuvwxyz23456789'; i int;
begin
  if not _lm_ok(p_uid, p_token) then raise exception 'auth'; end if;
  loop
    c := '';
    for i in 1..8 loop c := c || substr(abc, 1 + (get_byte(gen_random_bytes(1), 0) % length(abc)), 1); end loop;
    exit when not exists (select 1 from circles where code = c);
  end loop;
  insert into circles(code, owner) values (c, p_uid);
  insert into members(code, uid) values (c, p_uid);
  return c;
end $$;

create or replace function public.lm_join(p_uid uuid, p_token text, p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  if not exists (select 1 from circles where code = lower(trim(p_code))) then return false; end if;
  if (select count(*) from members where code = lower(trim(p_code))) >= 50 then return false; end if;
  insert into members(code, uid) values (lower(trim(p_code)), p_uid) on conflict do nothing;
  return true;
end $$;

create or replace function public.lm_leave(p_uid uuid, p_token text, p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  delete from docs where code = p_code and key = p_uid;
  delete from members where code = p_code and uid = p_uid;
  return true;
end $$;

create or replace function public.lm_state(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  if not exists (select 1 from members where code = p_code and uid = p_uid) then return null; end if;
  return json_build_object(
    'owner', (select owner from circles where code = p_code),
    'members', coalesce((select json_agg(json_build_object('uid', u.uid, 'name', u.name, 'color', u.color)) from members m join users u on u.uid = m.uid where m.code = p_code), '[]'::json),
    'docs', coalesce((select json_agg(json_build_object('coll', d.coll, 'key', d.key, 'data', d.data)) from docs d where d.code = p_code), '[]'::json)
  );
end $$;

create or replace function public.lm_write(p_uid uuid, p_token text, p_code text, p_coll text, p_data jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  if not exists (select 1 from members where code = p_code and uid = p_uid) then return false; end if;
  if p_coll not in ('circle','reacts','umrahTrip','umrahRsvp','umrahDua','khatm','khatmJuz','iftar','iftarRsvp','umrahFund','umrahLoc') then return false; end if;
  if p_data is null then
    delete from docs where code = p_code and coll = p_coll and key = p_uid;
  else
    if length(p_data::text) > 20000 then return false; end if;
    insert into docs(code, coll, key, data, updated) values (p_code, p_coll, p_uid, p_data, now())
    on conflict (code, coll, key) do update set data = excluded.data, updated = now();
  end if;
  return true;
end $$;

create or replace function public.lm_summaries() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('book', book, 'n', n, 'title', title, 'md', md, 'date', date) order by book, n), '[]'::json) from summaries;
$$;

revoke all on function public.lm_register(text), public.lm_set_name(uuid,text,text), public.lm_create_circle(uuid,text), public.lm_join(uuid,text,text), public.lm_leave(uuid,text,text), public.lm_state(uuid,text,text), public.lm_write(uuid,text,text,text,jsonb), public.lm_summaries() from public;
grant execute on function public.lm_register(text), public.lm_set_name(uuid,text,text), public.lm_create_circle(uuid,text), public.lm_join(uuid,text,text), public.lm_leave(uuid,text,text), public.lm_state(uuid,text,text), public.lm_write(uuid,text,text,text,jsonb), public.lm_summaries() to anon, authenticated;
create table if not exists public.signups (
  email text primary key,
  name text not null default '',
  lang text not null default 'ru',
  source text not null default '',
  created timestamptz not null default now()
);
alter table public.signups enable row level security;
revoke all on public.signups from anon, authenticated;

create or replace function public.lm_signup(p_name text, p_email text, p_lang text, p_source text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_email is null or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(p_email) > 120 then return false; end if;
  insert into signups(email, name, lang, source)
  values (lower(trim(p_email)), left(trim(coalesce(p_name,'')), 40), left(coalesce(p_lang,'ru'), 5), left(coalesce(p_source,''), 120))
  on conflict (email) do update set name = excluded.name, lang = excluded.lang;
  return true;
end $$;
revoke all on function public.lm_signup(text,text,text,text) from public;
grant execute on function public.lm_signup(text,text,text,text) to anon, authenticated;
