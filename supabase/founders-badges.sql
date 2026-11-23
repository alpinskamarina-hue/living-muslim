-- Living Muslim: the founder's badge next to names in chats and lists (23.11). Paste into Supabase → SQL Editor.
-- Needs founders.sql (already run). Safe to run again.
--
-- The levels of several people at once: [{"u": uid, "t": tier}], only paid or test records that are not anonymous.
create or replace function public.lm_founder_tiers(p_uids uuid[]) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('u', uid, 't', tier)), '[]'::json)
  from (
    select distinct on (uid) uid, tier
    from founders
    where uid = any (p_uids[1:200]) and status in ('paid', 'test') and wall <> ''
    order by uid, amount desc
  ) s;
$$;
revoke all on function public.lm_founder_tiers(uuid[]) from public;
grant execute on function public.lm_founder_tiers(uuid[]) to anon, authenticated;
