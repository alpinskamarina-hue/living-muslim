-- Living Muslim: text of voice messages («Расшифровка»). Run after chat.sql, chat-files.sql and circle-ai.sql.
-- Paste into Supabase → SQL Editor and press Run. Safe to run again.
-- A member taps «Расшифровать» under a voice message; the server (/api/transcribe) checks membership here, turns the
-- audio into text through Vercel AI Gateway and saves the text once into the message body, so everyone sees it and
-- nobody pays for it twice. At most 40 transcriptions per person per day.

create table if not exists public.chat_tr_use (
  uid uuid not null references public.users(uid) on delete cascade,
  day date not null default current_date,
  n int not null default 0,
  primary key (uid, day)
);
alter table public.chat_tr_use enable row level security;
revoke all on public.chat_tr_use from anon, authenticated;

-- For the server only (the secret of push.sql): the audio of a voice message, if the person is in the circle.
-- Already transcribed → only the text. Over the day limit → error 'limit'.
create or replace function public.lm_chat_tr_get(p_secret text, p_uid uuid, p_token text, p_id bigint) returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs; n int;
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  select * into m from chat_msgs where id = p_id;
  if m.id is null or m.deleted or m.kind <> 'voice' then return json_build_object('error', 'gone'); end if;
  if not _lm_ok(p_uid, p_token) or not _lm_member(p_uid, m.code) then return json_build_object('error', 'auth'); end if;
  if m.body <> '' then return json_build_object('text', m.body); end if;
  insert into chat_tr_use(uid, day, n) values (p_uid, current_date, 1)
  on conflict (uid, day) do update set n = chat_tr_use.n + 1 returning chat_tr_use.n into n;
  if n > 40 then return json_build_object('error', 'limit'); end if;
  return (select json_build_object('mime', v.mime, 'b64', translate(encode(v.data, 'base64'), E'\n', ''), 'sec', m.sec)
          from chat_voice v where v.id = p_id);
end $$;

-- For the server only: saves the text once. '…' means nothing could be made out.
create or replace function public.lm_chat_tr_save(p_secret text, p_id bigint, p_text text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare m chat_msgs; t text := left(btrim(coalesce(p_text, '')), 3000);
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  if t = '' then t := '…'; end if;
  update chat_msgs set body = t where id = p_id and kind = 'voice' and not deleted and body = '' returning * into m;
  if m.id is null then select * into m from chat_msgs where id = p_id; end if;
  return _lm_msg_json(m);
end $$;

revoke all on function public.lm_chat_tr_get(text, uuid, text, bigint), public.lm_chat_tr_save(text, bigint, text) from public;
grant execute on function public.lm_chat_tr_get(text, uuid, text, bigint), public.lm_chat_tr_save(text, bigint, text) to anon, authenticated;
