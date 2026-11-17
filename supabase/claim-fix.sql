-- Living Muslim: a second email must not take over a profile that is already tied to another email.
-- Before: signing in with email B on a phone that held the profile of email A kept A's profile (name, nick, circles).
-- Now: B gets its own new profile; A's profile stays with A. Run once in Supabase → SQL Editor.

create or replace function public.lm_claim(p_uid uuid, p_token text, p_name text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a uuid := auth.uid(); u uuid; t text; owner_auth uuid;
begin
  if a is null then return null; end if;
  -- This email already has a profile: hand it to this device.
  select uid into u from users where auth_id = a;
  if u is not null then
    if u = p_uid and _lm_ok(p_uid, p_token) then return json_build_object('uid', u, 'token', p_token, 'same', true); end if;
    t := encode(gen_random_bytes(24), 'hex');
    insert into tokens(token_hash, uid) values (encode(digest(t, 'sha256'), 'hex'), u);
    return json_build_object('uid', u, 'token', t, 'name', (select name from users where uid = u), 'same', false);
  end if;
  -- First sign-in: tie this device's profile to the email, but only if no other email owns it.
  if p_uid is not null and _lm_ok(p_uid, p_token) then
    select auth_id into owner_auth from users where uid = p_uid;
    if owner_auth is null then
      update users set auth_id = a where uid = p_uid and auth_id is null;
      return json_build_object('uid', p_uid, 'token', p_token, 'same', true);
    end if;
  end if;
  -- Otherwise a fresh profile for this email.
  t := encode(gen_random_bytes(24), 'hex');
  insert into users(token_hash, name, auth_id) values (encode(digest(t, 'sha256'), 'hex'), left(trim(coalesce(p_name,'')), 40), a) returning uid into u;
  return json_build_object('uid', u, 'token', t, 'same', false);
end $$;
revoke all on function public.lm_claim(uuid,text,text) from public;
grant execute on function public.lm_claim(uuid,text,text) to anon, authenticated;

-- Check: which email each profile with a nick belongs to (only you see this, in the SQL Editor).
select u.nick, u.name, a.email as signed_in_email, u.created
from public.users u left join auth.users a on a.id = u.auth_id
where u.nick is not null
order by u.created;
