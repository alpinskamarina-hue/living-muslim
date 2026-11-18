-- Living Muslim: the circle owner can remove a member. Paste into Supabase → SQL Editor and press Run. Safe to run again.
-- A removed person cannot come back by the old link or an invite until the owner lets them back.

create table if not exists public.circle_bans (
  code text not null references public.circles(code) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  created timestamptz not null default now(),
  primary key (code, uid)
);
alter table public.circle_bans enable row level security;
revoke all on public.circle_bans from anon, authenticated;

-- Whatever path tries to add a removed person (link, invite), it is skipped.
create or replace function public._lm_no_banned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from circle_bans where code = new.code and uid = new.uid) then return null; end if;
  return new;
end $$;
drop trigger if exists lm_no_banned on public.members;
create trigger lm_no_banned before insert on public.members for each row execute function public._lm_no_banned();
drop trigger if exists lm_no_banned_invite on public.invites;
create or replace function public._lm_no_banned_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from circle_bans where code = new.code and uid = new.to_uid) then return null; end if;
  return new;
end $$;
create trigger lm_no_banned_invite before insert on public.invites for each row execute function public._lm_no_banned_invite();

-- Joining by link: a removed person gets "no" instead of a silent nothing.
create or replace function public.lm_join(p_uid uuid, p_token text, p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  if not exists (select 1 from circles where code = lower(trim(p_code))) then return false; end if;
  if exists (select 1 from circle_bans where code = lower(trim(p_code)) and uid = p_uid) then return false; end if;
  if (select count(*) from members where code = lower(trim(p_code))) >= 50 then return false; end if;
  insert into members(code, uid) values (lower(trim(p_code)), p_uid) on conflict do nothing;
  return true;
end $$;

-- 'ok' | 'not_owner' | 'self' | 'auth'. With p_uid null: a probe from the app, returns 'auth'.
create or replace function public.lm_kick(p_uid uuid, p_token text, p_code text, p_other uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_uid is null or not _lm_ok(p_uid, p_token) then return 'auth'; end if;
  if (select owner from circles where code = p_code) is distinct from p_uid then return 'not_owner'; end if;
  if p_other = p_uid then return 'self'; end if;
  insert into circle_bans(code, uid) values (p_code, p_other) on conflict do nothing;
  delete from docs where code = p_code and key = p_other;
  delete from members where code = p_code and uid = p_other; -- the chat trigger removes their messages
  update invites set status = 'declined' where code = p_code and to_uid = p_other and status = 'pending';
  return 'ok';
end $$;

-- The owner lets a removed person back (they can then join by link or invite again).
create or replace function public.lm_unkick(p_uid uuid, p_token text, p_code text, p_other uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) or (select owner from circles where code = p_code) is distinct from p_uid then return false; end if;
  delete from circle_bans where code = p_code and uid = p_other;
  return found;
end $$;

-- For the owner: who was removed. For a removed person: true when I was removed from this circle.
create or replace function public.lm_kicked(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  if (select owner from circles where code = p_code) = p_uid then
    return coalesce((select json_agg(json_build_object('uid', b.uid, 'name', u.name) order by b.created desc) from circle_bans b join users u on u.uid = b.uid where b.code = p_code), '[]'::json);
  end if;
  return to_json(exists (select 1 from circle_bans where code = p_code and uid = p_uid));
end $$;

grant execute on function public.lm_kick(uuid, text, text, uuid), public.lm_unkick(uuid, text, text, uuid), public.lm_kicked(uuid, text, text) to anon, authenticated;

select 'circle kick ready' as status;
