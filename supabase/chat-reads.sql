-- Living Muslim: read ticks in circle chats, like WhatsApp (21.11.2026).
-- ✓ nobody has read my message yet, ✓✓ read (blue when everyone has read it).
-- Uses the existing chat_seen table (the last message each person has read). Safe to run again.

-- In one circle: for each other member, the last message they read and when they joined
-- (a message counts only for people who were in the circle when it was sent).
-- Without p_code: for each of my circles whose last message is mine, [read by, sent to].
create or replace function public.lm_chat_reads(p_uid uuid, p_token text, p_code text default null) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return null; end if; -- probe from the app: the function exists
  if not _lm_ok(p_uid, p_token) then return null; end if;
  if p_code is not null then
    if not _lm_member(p_uid, p_code) then return null; end if;
    return coalesce((
      select json_object_agg(mb.uid, json_build_array(
        coalesce((select s.last_id from chat_seen s where s.code = p_code and s.uid = mb.uid), 0),
        (extract(epoch from mb.joined) * 1000)::bigint))
      from members mb where mb.code = p_code and mb.uid <> p_uid
    ), '{}'::json);
  end if;
  return coalesce((
    select json_object_agg(x.code, json_build_array(x.rd, x.tot)) from (
      select me.code,
        (select count(*) from members mb where mb.code = me.code and mb.uid <> p_uid and mb.joined <= lm.created
           and coalesce((select s.last_id from chat_seen s where s.code = me.code and s.uid = mb.uid), 0) >= lm.id) rd,
        (select count(*) from members mb where mb.code = me.code and mb.uid <> p_uid and mb.joined <= lm.created) tot
      from members me
      cross join lateral (
        select m.id, m.uid, m.created from chat_msgs m where m.code = me.code and not m.deleted
        order by m.id desc limit 1
      ) lm
      where me.uid = p_uid and lm.uid = p_uid
    ) x
  ), '{}'::json);
end $$;

revoke all on function public.lm_chat_reads(uuid, text, text) from public;
grant execute on function public.lm_chat_reads(uuid, text, text) to anon, authenticated;
