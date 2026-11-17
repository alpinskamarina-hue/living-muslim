-- Living Muslim: nicknames, profile photo, invites to a circle by nick, blocking, profile tied to email.
-- Run once in Supabase SQL Editor after schema.sql. Safe to run again.

alter table public.users add column if not exists nick text;
alter table public.users add column if not exists bio text not null default '';
alter table public.users add column if not exists avatar jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists photo text not null default '';
alter table public.users add column if not exists findable boolean not null default true;
alter table public.users add column if not exists invite_from text not null default 'all';
alter table public.users add column if not exists gender text not null default '';
alter table public.users add column if not exists sisters_only boolean not null default false;
alter table public.users add column if not exists show_photo boolean not null default true;
alter table public.users add column if not exists auth_id uuid;
create unique index if not exists users_nick on public.users (lower(nick)) where nick is not null;
create unique index if not exists users_auth on public.users (auth_id) where auth_id is not null;

alter table public.members add column if not exists title text not null default '';
alter table public.members add column if not exists kind text not null default '';

-- extra device tokens (a profile opened on a second phone after signing in by email)
create table if not exists public.tokens (
  token_hash text primary key,
  uid uuid not null references public.users(uid) on delete cascade,
  created timestamptz not null default now()
);
create index if not exists tokens_uid on public.tokens(uid);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.circles(code) on delete cascade,
  from_uid uuid not null references public.users(uid) on delete cascade,
  to_uid uuid not null references public.users(uid) on delete cascade,
  title text not null default '',
  kind text not null default '',
  status text not null default 'pending',
  created timestamptz not null default now()
);
create unique index if not exists invites_pending on public.invites (code, to_uid) where status = 'pending';
create index if not exists invites_to on public.invites (to_uid, status);
create index if not exists invites_from on public.invites (from_uid, created);

create table if not exists public.blocks (
  uid uuid not null references public.users(uid) on delete cascade,
  other uuid not null references public.users(uid) on delete cascade,
  created timestamptz not null default now(),
  primary key (uid, other)
);

alter table public.tokens enable row level security;
alter table public.invites enable row level security;
alter table public.blocks enable row level security;
revoke all on public.tokens, public.invites, public.blocks from anon, authenticated;

create or replace function public._lm_ok(p_uid uuid, p_token text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from users where uid = p_uid and token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex'))
      or exists (select 1 from tokens where uid = p_uid and token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex'));
$$;
revoke all on function public._lm_ok(uuid, text) from public, anon, authenticated;

create or replace function public._lm_nick_ok(p text) returns boolean
language sql immutable as $$
  select p ~ '^[a-z0-9_.]{3,20}$' and p !~ '^[._]|[._]$' and p not in ('admin','support','livingmuslim','living_muslim','moderator','help','allah','rasul','prophet');
$$;

create or replace function public._lm_shared(a uuid, b uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m1.code), '{}') from members m1 join members m2 on m2.code = m1.code and m2.uid = b where m1.uid = a;
$$;
revoke all on function public._lm_shared(uuid, uuid) from public, anon, authenticated;

create or replace function public._lm_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (uid = a and other = b) or (uid = b and other = a));
$$;
revoke all on function public._lm_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function public.lm_profile(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  return (select json_build_object('name', name, 'nick', nick, 'bio', bio, 'avatar', avatar, 'photo', photo, 'color', color,
    'findable', findable, 'invite_from', invite_from, 'gender', gender, 'sisters_only', sisters_only, 'show_photo', show_photo,
    'email', auth_id is not null) from users where uid = p_uid);
end $$;

create or replace function public.lm_nick_free(p_uid uuid, p_nick text) returns text
language plpgsql stable security definer set search_path = public as $$
declare n text := lower(trim(coalesce(p_nick,'')));
begin
  if not _lm_nick_ok(n) then return 'bad'; end if;
  if exists (select 1 from users where lower(nick) = n and uid <> coalesce(p_uid, '00000000-0000-0000-0000-000000000000'::uuid)) then return 'taken'; end if;
  return 'ok';
end $$;

-- p: any of name, nick, bio, avatar, photo, findable, invite_from, gender, sisters_only, show_photo
create or replace function public.lm_profile_set(p_uid uuid, p_token text, p jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare n text;
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if p ? 'nick' then
    n := nullif(lower(trim(coalesce(p->>'nick',''))), '');
    if n is not null then
      if not _lm_nick_ok(n) then return 'nick_bad'; end if;
      if exists (select 1 from users where lower(nick) = n and uid <> p_uid) then return 'nick_taken'; end if;
    end if;
    update users set nick = n where uid = p_uid;
  end if;
  if p ? 'photo' and length(coalesce(p->>'photo','')) > 120000 then return 'photo_big'; end if;
  if p ? 'photo' and coalesce(p->>'photo','') <> '' and p->>'photo' !~ '^data:image/(jpeg|png|webp);base64,' then return 'photo_bad'; end if;
  update users set
    name = case when p ? 'name' then left(trim(coalesce(p->>'name','')), 40) else name end,
    bio = case when p ? 'bio' then left(trim(coalesce(p->>'bio','')), 80) else bio end,
    avatar = case when p ? 'avatar' and jsonb_typeof(p->'avatar') = 'object' and length((p->'avatar')::text) < 200 then p->'avatar' else avatar end,
    photo = case when p ? 'photo' then coalesce(p->>'photo','') else photo end,
    findable = case when p ? 'findable' then coalesce((p->>'findable')::boolean, findable) else findable end,
    invite_from = case when p->>'invite_from' in ('all','circles','none') then p->>'invite_from' else invite_from end,
    gender = case when p->>'gender' in ('m','f','') then p->>'gender' else gender end,
    sisters_only = case when p ? 'sisters_only' then coalesce((p->>'sisters_only')::boolean, sisters_only) else sisters_only end,
    show_photo = case when p ? 'show_photo' then coalesce((p->>'show_photo')::boolean, show_photo) else show_photo end
  where uid = p_uid;
  return 'ok';
end $$;

-- exact nick only; no lists, no search by name
create or replace function public.lm_find(p_uid uuid, p_token text, p_nick text) returns json
language plpgsql stable security definer set search_path = public as $$
declare u users; me users; sh text[]; can text := 'ok';
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into me from users where uid = p_uid;
  select * into u from users where lower(nick) = lower(trim(coalesce(p_nick,''))) and nick is not null;
  if u.uid is null or u.uid = p_uid then return null; end if;
  if _lm_blocked(p_uid, u.uid) then return null; end if;
  sh := _lm_shared(p_uid, u.uid);
  if not u.findable and cardinality(sh) = 0 then return null; end if;
  if u.sisters_only and me.gender <> 'f' then return null; end if;
  if u.invite_from = 'none' then can := 'closed';
  elsif u.invite_from = 'circles' and cardinality(sh) = 0 then can := 'circles_only'; end if;
  return json_build_object('uid', u.uid, 'name', u.name, 'nick', u.nick, 'bio', u.bio, 'avatar', u.avatar, 'color', u.color,
    'gender', u.gender, 'photo', case when u.show_photo and cardinality(sh) > 0 then u.photo else '' end,
    'shared', to_json(sh), 'can', can);
end $$;

create or replace function public.lm_invite(p_uid uuid, p_token text, p_code text, p_to uuid, p_title text, p_kind text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare u users; me users; sh text[];
begin
  if not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if not exists (select 1 from members where code = p_code and uid = p_uid) then return 'not_member'; end if;
  select * into u from users where uid = p_to;
  select * into me from users where uid = p_uid;
  if u.uid is null or u.uid = p_uid then return 'no_user'; end if;
  if _lm_blocked(p_uid, p_to) then return 'closed'; end if;
  if exists (select 1 from members where code = p_code and uid = p_to) then return 'already_in'; end if;
  sh := _lm_shared(p_uid, p_to);
  if u.invite_from = 'none' then return 'closed'; end if;
  if u.invite_from = 'circles' and cardinality(sh) = 0 then return 'closed'; end if;
  if u.sisters_only and me.gender <> 'f' then return 'closed'; end if;
  if p_kind = 'sisters' and u.gender = 'm' then return 'wrong_kind'; end if;
  if p_kind = 'brothers' and u.gender = 'f' then return 'wrong_kind'; end if;
  if (select count(*) from invites where from_uid = p_uid and created > now() - interval '1 day') >= 30 then return 'limit'; end if;
  if (select count(*) from members where code = p_code) >= 50 then return 'full'; end if;
  insert into invites(code, from_uid, to_uid, title, kind) values (p_code, p_uid, p_to, left(trim(coalesce(p_title,'')), 40), left(coalesce(p_kind,''), 12))
  on conflict (code, to_uid) where status = 'pending' do nothing;
  return 'ok';
end $$;

create or replace function public.lm_inbox(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  return coalesce((select json_agg(json_build_object(
      'id', i.id, 'code', i.code, 'title', i.title, 'kind', i.kind, 'created', i.created,
      'count', (select count(*) from members m where m.code = i.code),
      'from', json_build_object('uid', f.uid, 'name', f.name, 'nick', f.nick, 'color', f.color, 'avatar', f.avatar,
        'photo', case when f.show_photo and cardinality(_lm_shared(p_uid, f.uid)) > 0 then f.photo else '' end)
    ) order by i.created desc)
    from invites i join users f on f.uid = i.from_uid
    where i.to_uid = p_uid and i.status = 'pending' and not _lm_blocked(p_uid, i.from_uid)), '[]'::json);
end $$;

create or replace function public.lm_answer(p_uid uuid, p_token text, p_id uuid, p_accept boolean) returns json
language plpgsql volatile security definer set search_path = public as $$
declare i invites;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  select * into i from invites where id = p_id and to_uid = p_uid and status = 'pending';
  if i.id is null then return null; end if;
  if not p_accept then
    update invites set status = 'declined' where id = p_id;
    return json_build_object('ok', true);
  end if;
  if (select count(*) from members where code = i.code) >= 50 then return json_build_object('ok', false, 'err', 'full'); end if;
  insert into members(code, uid, title, kind) values (i.code, p_uid, i.title, i.kind) on conflict do nothing;
  update invites set status = 'accepted' where id = p_id;
  return json_build_object('ok', true, 'code', i.code, 'title', i.title, 'kind', i.kind);
end $$;

create or replace function public.lm_block(p_uid uuid, p_token text, p_other uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or p_other = p_uid then return false; end if;
  insert into blocks(uid, other) values (p_uid, p_other) on conflict do nothing;
  update invites set status = 'declined' where to_uid = p_uid and from_uid = p_other and status = 'pending';
  return true;
end $$;

-- my circles with my own title and kind, so a second phone gets the same list
create or replace function public.lm_circles(p_uid uuid, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return '[]'::json; end if;
  return coalesce((select json_agg(json_build_object('code', code, 'title', title, 'kind', kind) order by joined) from members where uid = p_uid), '[]'::json);
end $$;

create or replace function public.lm_circle_meta(p_uid uuid, p_token text, p_code text, p_title text, p_kind text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  update members set title = left(trim(coalesce(p_title,'')), 40), kind = left(coalesce(p_kind,''), 12) where code = p_code and uid = p_uid;
  return found;
end $$;

-- Called with the email session (Authorization: Bearer <access token>). Ties this device's profile to the email,
-- or, if the email already has a profile, hands this device a token for it.
create or replace function public.lm_claim(p_uid uuid, p_token text, p_name text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a uuid := auth.uid(); u uuid; t text;
begin
  if a is null then return null; end if;
  select uid into u from users where auth_id = a;
  if u is not null then
    if u = p_uid and _lm_ok(p_uid, p_token) then return json_build_object('uid', u, 'token', p_token, 'same', true); end if;
    t := encode(gen_random_bytes(24), 'hex');
    insert into tokens(token_hash, uid) values (encode(digest(t, 'sha256'), 'hex'), u);
    return json_build_object('uid', u, 'token', t, 'name', (select name from users where uid = u), 'same', false);
  end if;
  if p_uid is not null and _lm_ok(p_uid, p_token) then
    update users set auth_id = a where uid = p_uid and auth_id is null;
    return json_build_object('uid', p_uid, 'token', p_token, 'same', true);
  end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into users(token_hash, name, auth_id) values (encode(digest(t, 'sha256'), 'hex'), left(trim(coalesce(p_name,'')), 40), a) returning uid into u;
  return json_build_object('uid', u, 'token', t, 'same', false);
end $$;

-- circle state now also carries each member's nick, avatar and photo
create or replace function public.lm_state(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  if not exists (select 1 from members where code = p_code and uid = p_uid) then return null; end if;
  return json_build_object(
    'owner', (select owner from circles where code = p_code),
    'members', coalesce((select json_agg(json_build_object('uid', u.uid, 'name', u.name, 'color', u.color, 'nick', u.nick, 'avatar', u.avatar,
        'gender', u.gender, 'photo', case when u.show_photo then u.photo else '' end))
      from members m join users u on u.uid = m.uid where m.code = p_code and not _lm_blocked(p_uid, u.uid)), '[]'::json),
    'docs', coalesce((select json_agg(json_build_object('coll', d.coll, 'key', d.key, 'data', d.data)) from docs d where d.code = p_code), '[]'::json)
  );
end $$;

revoke all on function public.lm_profile(uuid,text), public.lm_nick_free(uuid,text), public.lm_profile_set(uuid,text,jsonb),
  public.lm_find(uuid,text,text), public.lm_invite(uuid,text,text,uuid,text,text), public.lm_inbox(uuid,text),
  public.lm_answer(uuid,text,uuid,boolean), public.lm_block(uuid,text,uuid), public.lm_circles(uuid,text),
  public.lm_circle_meta(uuid,text,text,text,text), public.lm_claim(uuid,text,text) from public;
grant execute on function public.lm_profile(uuid,text), public.lm_nick_free(uuid,text), public.lm_profile_set(uuid,text,jsonb),
  public.lm_find(uuid,text,text), public.lm_invite(uuid,text,text,uuid,text,text), public.lm_inbox(uuid,text),
  public.lm_answer(uuid,text,uuid,boolean), public.lm_block(uuid,text,uuid), public.lm_circles(uuid,text),
  public.lm_circle_meta(uuid,text,text,text,text), public.lm_claim(uuid,text,text) to anon, authenticated;
