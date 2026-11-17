-- Living Muslim: search by the first letters of a nick, and people from my other circles. Run once in Supabase → SQL Editor.
-- Same privacy rules as lm_find: hidden profiles are found only by people who already share a circle,
-- blocked people and "sisters only" profiles stay out, and at most 8 results come back.

create or replace function public.lm_find_many(p_uid uuid, p_token text, p_q text) returns json
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(regexp_replace(trim(coalesce(p_q, '')), '^@', '')); out jsonb := '[]'; n text; f json;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  if length(q) < 2 or q !~ '^[a-z0-9_.]+$' then return '[]'::json; end if;
  for n in
    select u.nick from users u
    where u.nick is not null and u.uid <> p_uid
      and starts_with(lower(u.nick), q)
    order by (lower(u.nick) = q) desc, cardinality(_lm_shared(p_uid, u.uid)) desc, length(u.nick), u.nick
    limit 40
  loop
    f := lm_find(p_uid, p_token, n);
    if f is not null then out := out || jsonb_build_array(f::jsonb); end if;
    exit when jsonb_array_length(out) >= 8;
  end loop;
  return out::json;
end $$;
revoke all on function public.lm_find_many(uuid, text, text) from public;
grant execute on function public.lm_find_many(uuid, text, text) to anon, authenticated;

-- People I already share a circle with who are not yet in p_code: one tap to invite them here too.
create or replace function public.lm_circle_mates(p_uid uuid, p_token text, p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare out jsonb := '[]'; r record;
begin
  if not _lm_ok(p_uid, p_token) then return null; end if;
  for r in
    select distinct u.uid, u.name, u.nick, u.avatar, u.color, u.gender, u.invite_from, u.show_photo, u.photo
    from members m1 join members m2 on m2.code = m1.code and m2.uid <> p_uid
    join users u on u.uid = m2.uid
    where m1.uid = p_uid
      and not exists (select 1 from members x where x.code = p_code and x.uid = u.uid)
      and not _lm_blocked(p_uid, u.uid)
      and u.invite_from <> 'none'
    limit 30
  loop
    out := out || jsonb_build_array(jsonb_build_object('uid', r.uid, 'name', r.name, 'nick', r.nick, 'avatar', r.avatar, 'color', r.color,
      'gender', r.gender, 'photo', case when r.show_photo then r.photo else '' end, 'bio', '', 'shared', to_jsonb(_lm_shared(p_uid, r.uid)), 'can', 'ok'));
  end loop;
  return out::json;
end $$;
revoke all on function public.lm_circle_mates(uuid, text, text) from public;
grant execute on function public.lm_circle_mates(uuid, text, text) to anon, authenticated;
