-- Living Muslim: photos and documents in circle chats. Run after chat.sql. Paste into Supabase → SQL Editor and press Run.
-- Safe to run again. Files up to 5 MB, photos are shrunk on the phone first. Kept 90 days, then removed.

alter table public.chat_msgs drop constraint if exists chat_msgs_kind_check;
alter table public.chat_msgs add constraint chat_msgs_kind_check check (kind in ('text', 'voice', 'event', 'photo', 'file'));
alter table public.chat_msgs add column if not exists file jsonb; -- {"name": "...", "size": 12345, "mime": "...", "thumb": "data:image/jpeg;base64,...", "w": 1200, "h": 900}

create table if not exists public.chat_files (
  id bigint primary key references public.chat_msgs(id) on delete cascade,
  mime text not null,
  data bytea not null,
  created timestamptz not null default now()
);
alter table public.chat_files enable row level security;
revoke all on public.chat_files from anon, authenticated;

create or replace function public._lm_msg_json(m public.chat_msgs) returns json
language sql stable as $$
  select json_build_object('id', m.id, 'uid', m.uid, 'kind', m.kind,
    'body', case when m.deleted then '' else m.body end, 'ref', m.ref, 'sec', m.sec, 'bars', m.bars,
    'reacts', m.reacts, 'deleted', m.deleted, 'at', m.created,
    'voice', (m.kind = 'voice' and not m.deleted and exists (select 1 from public.chat_voice v where v.id = m.id)),
    'file', case when m.deleted or m.kind not in ('photo', 'file') then null
      else (coalesce(m.file, '{}'::jsonb) || jsonb_build_object('ok', exists (select 1 from public.chat_files f where f.id = m.id)))::json end);
$$;
revoke all on function public._lm_msg_json(public.chat_msgs) from public, anon;

-- A photo or a document. p_meta: name, size, mime, and for photos a small preview (thumb) and w/h.
create or replace function public.lm_chat_file_send(p_uid uuid, p_token text, p_code text, p_kind text, p_meta jsonb, p_b64 text, p_body text default '', p_ref jsonb default null) returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs; raw bytea; mime text := left(coalesce(p_meta->>'mime', ''), 100); nm text := left(coalesce(p_meta->>'name', ''), 120);
begin
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, p_code) then return json_build_object('error', 'auth'); end if;
  if p_kind not in ('photo', 'file') then return json_build_object('error', 'kind'); end if;
  if length(coalesce(p_b64, '')) > 7000000 then return json_build_object('error', 'big'); end if;
  if length(coalesce(p_meta->>'thumb', '')) > 30000 then p_meta := p_meta - 'thumb'; end if;
  if p_kind = 'photo' and mime !~ '^image/(jpeg|png|webp|gif)$' then return json_build_object('error', 'mime'); end if;
  if lower(nm) ~ '\.(exe|bat|cmd|com|scr|msi|apk|app|dmg|js|vbs|jar|sh|ps1|html?|svg)$' then return json_build_object('error', 'type'); end if;
  if (select count(*) from chat_msgs where uid = p_uid and created > now() - interval '1 minute') >= 20 then return json_build_object('error', 'slow'); end if;
  if (select coalesce(sum(length(f.data)), 0) from chat_files f join chat_msgs x on x.id = f.id where x.uid = p_uid and f.created > now() - interval '1 day') > 50000000 then return json_build_object('error', 'day'); end if;
  raw := decode(p_b64, 'base64');
  if length(raw) < 10 then return json_build_object('error', 'empty'); end if;
  if p_ref is not null and length(p_ref::text) > 300 then p_ref := null; end if;
  insert into chat_msgs(code, uid, kind, body, ref, file)
  values (p_code, p_uid, p_kind, left(trim(coalesce(p_body, '')), 1000), p_ref,
    jsonb_strip_nulls(jsonb_build_object('name', nm, 'size', length(raw), 'mime', mime, 'thumb', p_meta->>'thumb',
      'w', case when (p_meta->>'w') ~ '^\d{1,5}$' then (p_meta->>'w')::int end, 'h', case when (p_meta->>'h') ~ '^\d{1,5}$' then (p_meta->>'h')::int end)))
  returning * into m;
  insert into chat_files(id, mime, data) values (m.id, mime, raw);
  insert into chat_seen(code, uid, last_id) values (p_code, p_uid, m.id)
  on conflict (code, uid) do update set last_id = greatest(chat_seen.last_id, excluded.last_id);
  return _lm_msg_json(m);
end $$;

create or replace function public.lm_chat_file(p_uid uuid, p_token text, p_id bigint) returns json
language plpgsql stable security definer set search_path = public as $$
declare c text;
begin
  select code into c from chat_msgs where id = p_id and not deleted;
  if c is null or not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, c) then return null; end if;
  return (select json_build_object('mime', mime, 'b64', translate(encode(data, 'base64'), E'\n', '')) from chat_files where id = p_id);
end $$;

-- Deleting a message also removes its file; a complaint keeps the file name.
create or replace function public.lm_chat_delete(p_uid uuid, p_token text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs;
begin
  select * into m from chat_msgs where id = p_id;
  if m.id is null or not _lm_ok(p_uid, p_token) then return false; end if;
  if m.uid <> p_uid and (select owner from circles where code = m.code) <> p_uid then return false; end if;
  update chat_msgs set deleted = true, body = '', bars = null, file = null, reacts = '{}'::jsonb where id = p_id;
  delete from chat_voice where id = p_id;
  delete from chat_files where id = p_id;
  return true;
end $$;

create or replace function public.lm_chat_admin_delete(p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from lm_admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))) then return false; end if;
  update chat_msgs set deleted = true, body = '', bars = null, file = null, reacts = '{}'::jsonb where id = p_id;
  delete from chat_voice where id = p_id;
  delete from chat_files where id = p_id;
  return found;
end $$;

create or replace function public.lm_chat_report(p_uid uuid, p_token text, p_id bigint, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs;
begin
  select * into m from chat_msgs where id = p_id;
  if m.id is null or not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, m.code) or m.uid = p_uid then return false; end if;
  insert into chat_reports(msg_id, by_uid, reason, body) values (p_id, p_uid, left(coalesce(p_reason, ''), 200),
    case when m.kind = 'voice' then '[голосовое]' when m.kind = 'photo' then '[фото] ' || m.body when m.kind = 'file' then '[файл ' || coalesce(m.file->>'name', '') || '] ' || m.body else m.body end)
  on conflict do nothing;
  return true;
end $$;

-- Push text for photos and files.
create or replace function public.lm_chat_push(p_secret text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  return coalesce((
    select json_agg(json_build_object('endpoint', s.endpoint, 'code', x.code, 'title', x.title, 'n', x.n, 'last', x.last_id,
      'from', x.from_name, 'body', x.body, 'kind', x.kind))
    from push_subs s
    join lateral (
      select me.code, me.title,
        count(m.id) n, max(m.id) last_id,
        (array_agg(u.name order by m.id desc))[1] from_name,
        (array_agg(case when m.kind = 'file' then coalesce(m.file->>'name', '') else m.body end order by m.id desc))[1] body,
        (array_agg(m.kind order by m.id desc))[1] kind
      from members me
      join chat_msgs m on m.code = me.code and m.uid <> s.uid and not m.deleted
        and m.created > now() - interval '6 hours'
        and m.id > greatest(coalesce((select last_id from chat_seen c where c.code = me.code and c.uid = s.uid), 0), coalesce((s.chat_sent->>me.code)::bigint, 0))
        and not exists (select 1 from blocks b where b.uid = s.uid and b.other = m.uid)
      join users u on u.uid = m.uid
      where me.uid = s.uid
      group by me.code, me.title
    ) x on true
    where s.uid is not null and coalesce((s.prefs->>'chat')::boolean, true)
  ), '[]'::json);
end $$;

grant execute on function public.lm_chat_file_send(uuid, text, text, text, jsonb, text, text, jsonb), public.lm_chat_file(uuid, text, bigint) to anon, authenticated;

select cron.unschedule('lm-chat-files-clean') where exists (select 1 from cron.job where jobname = 'lm-chat-files-clean');
select cron.schedule('lm-chat-files-clean', '27 3 * * *', $$
  delete from public.chat_files where created < now() - interval '90 days';
$$);

select 'chat files ready' as status;
