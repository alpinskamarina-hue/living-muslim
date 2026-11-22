-- Living Muslim: posts in circles. Paste into Supabase → SQL Editor and press Run. Safe to run again.
-- Needs chat.sql, chat-files.sql, admin.sql and open-circles.sql (already run).
--
-- A post is an announcement from whoever leads a circle. It does not scroll away like a chat message, it can be
-- pinned, and in an open circle it can be shown to people who have not joined yet.
--   · The common circle «Общий круг Living Muslim» (code is null): only the team (lm_admins) writes posts.
--   · Any other circle: the owner and his helpers write posts. Members react; the talk stays in the chat.
-- No comments. Up to 3 posts a day per circle. Links in public posts only for verified circles.
-- Three reports hide a post until the admin looks at it.

-- ---------- tables ----------
create table if not exists public.circle_posts (
  id bigserial primary key,
  code text references public.circles(code) on delete cascade,   -- null: the common circle
  uid uuid references public.users(uid) on delete set null,      -- null: the team
  body text not null default '',
  link jsonb,                                                    -- {"l": "button label", "u": "/app/?course=… or https://…"}
  photo boolean not null default false,
  vis text not null default 'members' check (vis in ('public', 'members')),
  who text not null default 'all' check (who in ('all', 'brothers', 'sisters')),
  pinned boolean not null default false,
  push boolean not null default false,
  pushed boolean not null default false,
  at timestamptz not null default now(),                         -- shown from this time (the team may schedule)
  reacts jsonb not null default '{}'::jsonb,                     -- {"<uid>": "🤲"}
  reports int not null default 0,
  hidden boolean not null default false,
  created timestamptz not null default now(),
  edited timestamptz
);
create index if not exists circle_posts_code on public.circle_posts (code, at desc);
create index if not exists circle_posts_common on public.circle_posts (at desc) where code is null;

create table if not exists public.circle_post_photo (
  id bigint primary key references public.circle_posts(id) on delete cascade,
  mime text not null,
  data bytea not null
);
create table if not exists public.circle_post_reports (
  post_id bigint not null references public.circle_posts(id) on delete cascade,
  uid uuid not null references public.users(uid) on delete cascade,
  created timestamptz not null default now(),
  primary key (post_id, uid)
);

alter table public.circle_posts enable row level security;
alter table public.circle_post_photo enable row level security;
alter table public.circle_post_reports enable row level security;
revoke all on public.circle_posts, public.circle_post_photo, public.circle_post_reports from anon, authenticated;

-- ---------- helpers ----------
-- Can this person (or a guest with gender g) see this post?
create or replace function public._lm_post_sees(p public.circle_posts, me uuid, g text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare o circle_open;
begin
  if p.hidden or p.at > now() then return false; end if;
  if p.code is null then
    return p.who = 'all' or (p.who = 'brothers' and g = 'm') or (p.who = 'sisters' and g = 'f');
  end if;
  if me is not null and exists (select 1 from members where code = p.code and uid = me) then return true; end if;
  if p.vis <> 'public' then return false; end if;
  select * into o from circle_open where code = p.code;
  if o.code is null or not _lm_open_fits(o, g) then return false; end if;
  if me is not null and (_lm_blocked(me, o.owner) or exists (select 1 from circle_bans b where b.code = o.code and b.uid = me)) then return false; end if;
  return true;
end $$;

create or replace function public._lm_post_json(p public.circle_posts, me uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'code', p.code, 'body', p.body, 'link', p.link, 'photo', p.photo, 'vis', p.vis, 'who', p.who,
    'pinned', p.pinned, 'at', p.at, 'edited', p.edited is not null, 'hidden', p.hidden, 'later', p.at > now(), 'push', p.push,
    'uid', p.uid,
    'by', case when p.code is null then null else (select coalesce(nullif(u.name, ''), u.nick, '') from users u where u.uid = p.uid) end,
    'role', case when p.code is null then 'team' when p.uid = (select owner from circles where code = p.code) then 'owner' else 'helper' end,
    'rx', coalesce((select jsonb_object_agg(e, n) from (select value e, count(*) n from jsonb_each_text(p.reacts) group by value) x), '{}'::jsonb),
    'my', case when me is null then null else p.reacts ->> me::text end,
    'mine', me is not null and p.uid = me);
$$;

-- Who writes posts in this circle: the team in the common one, the owner and helpers elsewhere.
create or replace function public._lm_post_boss(me uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_code is null then _lm_is_admin() else me is not null and _lm_open_boss(me, p_code) end;
$$;
revoke all on function public._lm_post_sees(public.circle_posts, uuid, text), public._lm_post_json(public.circle_posts, uuid),
  public._lm_post_boss(uuid, text) from public, anon, authenticated;

-- ---------- reading ----------
-- Posts of the common circle (p_code and p_open null), of my circle (p_code), or the public posts of an open
-- circle I look at before joining (p_open, its public id). {can, posts: [...]}, pinned first.
create or replace function public.lm_posts(p_uid uuid, p_token text, p_code text, p_open uuid, p_gender text, p_limit int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid := case when _lm_ok(p_uid, p_token) then p_uid else null end;
  g text := _lm_gender(p_uid, p_token, p_gender); c text := p_code; boss boolean; n int := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  if p_open is not null then
    select code into c from circle_open where id = p_open;
    if c is null then return json_build_object('can', false, 'posts', '[]'::json); end if;
    if me is not null and exists (select 1 from members where code = c and uid = me) then null; else
      return json_build_object('can', false, 'posts', coalesce((
        select json_agg(_lm_post_json(p, me) order by p.pinned desc, p.at desc) from (
          select * from circle_posts p where p.code = c and p.vis = 'public' and _lm_post_sees(p, me, g) order by p.pinned desc, p.at desc limit least(n, 3)) p
      ), '[]'::json));
    end if;
  elsif c is not null and (me is null or not exists (select 1 from members where code = c and uid = me)) then
    return null;
  end if;
  boss := _lm_post_boss(me, c);
  return json_build_object('can', boss, 'posts', coalesce((
    select json_agg(_lm_post_json(p, me) order by p.pinned desc, p.at desc) from (
      select * from circle_posts p
      where p.code is not distinct from c
        and (_lm_post_sees(p, me, g) or (boss and c is null))   -- the team also sees scheduled and hidden ones
        and (me is null or p.uid is null or not _lm_blocked(me, p.uid))
      order by p.pinned desc, p.at desc limit n) p
  ), '[]'::json));
end $$;

-- The photo of a post, base64.
create or replace function public.lm_post_photo(p_uid uuid, p_token text, p_id bigint, p_gender text) returns json
language plpgsql stable security definer set search_path = public as $$
declare p circle_posts; me uuid := case when _lm_ok(p_uid, p_token) then p_uid else null end;
begin
  select * into p from circle_posts where id = p_id;
  if p.id is null or not (_lm_post_sees(p, me, _lm_gender(p_uid, p_token, p_gender)) or _lm_post_boss(me, p.code)) then return null; end if;
  return (select json_build_object('mime', mime, 'b64', encode(data, 'base64')) from circle_post_photo where id = p_id);
end $$;

-- ---------- writing ----------
-- A new post. p_code null = the common circle (team only, with p_who, p_push and p_at).
-- {r: 'ok', id, push} | {r: 'auth' | 'empty' | 'often' | 'link' | 'text' | 'photo' | 'later'}
create or replace function public.lm_post_add(p_uid uuid, p_token text, p_code text, p_body text, p_link jsonb, p_vis text, p_who text,
  p_pin boolean, p_push boolean, p_at timestamptz, p_mime text, p_b64 text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := case when _lm_ok(p_uid, p_token) then p_uid else null end; b text := left(trim(coalesce(p_body, '')), 2000);
  o circle_open; v text := 'members'; ph bytea; lk jsonb; u text; pid bigint; v_at timestamptz := now(); pu boolean := false;
begin
  if not _lm_post_boss(me, p_code) then return json_build_object('r', 'auth'); end if;
  if length(b) < 2 then return json_build_object('r', 'empty'); end if;
  if p_link is not null and coalesce(trim(p_link->>'u'), '') <> '' then
    u := left(trim(p_link->>'u'), 300);
    if u !~ '^(/app/|https://)' then return json_build_object('r', 'link'); end if;
    lk := jsonb_build_object('l', left(coalesce(nullif(trim(p_link->>'l'), ''), case when u like '/app/%' then 'Открыть' else 'Перейти' end), 40), 'u', u);
  end if;
  if p_b64 is not null and p_b64 <> '' then
    if coalesce(p_mime, '') !~ '^image/(jpeg|png|webp)$' then return json_build_object('r', 'photo'); end if;
    ph := decode(p_b64, 'base64');
    if length(ph) > 600000 then return json_build_object('r', 'photo'); end if;
  end if;
  if p_code is not null then
    if (select count(*) from circle_posts where code = p_code and created > now() - interval '1 day') >= 3 then return json_build_object('r', 'often'); end if;
    select * into o from circle_open where code = p_code;
    if p_vis = 'public' and o.code is not null then v := 'public'; end if;
    if v = 'public' and not coalesce(o.verified, false) and (b ~* '(https?://|www\.|t\.me/|wa\.me/)' or u like 'https://%') then return json_build_object('r', 'link'); end if;
    if ph is not null and o.code is not null and o.who = 'all' and o.verified then return json_build_object('r', 'text'); end if;
  else
    v := 'public';
    if p_at is not null and p_at > now() then
      if p_at > now() + interval '30 days' then return json_build_object('r', 'later'); end if;
      v_at := p_at;
    end if;
    -- one push to everyone a day, so people do not switch the app off
    pu := coalesce(p_push, false) and not exists (select 1 from circle_posts x where x.code is null and x.push and x.at > v_at - interval '20 hours' and x.at < v_at + interval '20 hours');
  end if;
  if coalesce(p_pin, false) then update circle_posts set pinned = false where code is not distinct from p_code and pinned; end if;
  insert into circle_posts(code, uid, body, link, photo, vis, who, pinned, push, at)
  values (p_code, case when p_code is null then null else me end, b, lk, ph is not null, v,
    case when p_code is null and p_who in ('brothers', 'sisters') then p_who else 'all' end, coalesce(p_pin, false), pu, v_at)
  returning id into pid;
  if ph is not null then insert into circle_post_photo(id, mime, data) values (pid, p_mime, ph); end if;
  -- members see a small «📣 Новый пост» card in the chat (it also brings the usual chat push)
  if p_code is not null then
    insert into chat_msgs(code, uid, kind, body, ref) values (p_code, me, 'event', left(b, 140), jsonb_build_object('t', 'post', 'p', pid));
  end if;
  return json_build_object('r', 'ok', 'id', pid, 'push', pu);
end $$;

-- Change a post: 'pin', 'unpin', 'edit' (new p_body), 'del'. By its author's side: the team or the circle's owner and helpers.
create or replace function public.lm_post_set(p_uid uuid, p_token text, p_id bigint, p_act text, p_body text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := case when _lm_ok(p_uid, p_token) then p_uid else null end; p circle_posts; b text := left(trim(coalesce(p_body, '')), 2000);
begin
  select * into p from circle_posts where id = p_id;
  if p.id is null or not _lm_post_boss(me, p.code) then return false; end if;
  if p_act = 'del' then
    delete from chat_msgs where code = p.code and kind = 'event' and ref->>'t' = 'post' and ref->>'p' = p.id::text;
    delete from circle_posts where id = p.id;
  elsif p_act = 'pin' then
    update circle_posts set pinned = false where code is not distinct from p.code and pinned;
    update circle_posts set pinned = true where id = p.id;
  elsif p_act = 'unpin' then update circle_posts set pinned = false where id = p.id;
  elsif p_act = 'edit' and length(b) >= 2 then
    if p.code is not null and p.vis = 'public' and not coalesce((select verified from circle_open where code = p.code), false)
      and b ~* '(https?://|www\.|t\.me/|wa\.me/)' then return false; end if;
    update circle_posts set body = b, edited = now() where id = p.id;
  else return false; end if;
  return true;
end $$;

-- 🤲 ❤ 👍 on a post: the same again takes it back. Returns the post.
create or replace function public.lm_post_react(p_uid uuid, p_token text, p_id bigint, p_emoji text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare p circle_posts;
begin
  if not _lm_ok(p_uid, p_token) or p_emoji not in ('🤲', '❤', '👍') then return null; end if;
  select * into p from circle_posts where id = p_id;
  if p.id is null or not _lm_post_sees(p, p_uid, _lm_gender(p_uid, p_token, '')) then return null; end if;
  if p.code is not null and not exists (select 1 from members where code = p.code and uid = p_uid) then return null; end if;
  update circle_posts set reacts = case when reacts ->> p_uid::text = p_emoji then reacts - p_uid::text else reacts || jsonb_build_object(p_uid::text, p_emoji) end
  where id = p_id returning * into p;
  return _lm_post_json(p, p_uid);
end $$;

-- ⚑ A report. Three hide the post until the admin looks («Открытые круги» in the admin screen).
create or replace function public.lm_post_report(p_uid uuid, p_token text, p_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare p circle_posts;
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  select * into p from circle_posts where id = p_id;
  if p.id is null or p.uid = p_uid or not _lm_post_sees(p, p_uid, _lm_gender(p_uid, p_token, '')) then return false; end if;
  insert into circle_post_reports(post_id, uid) values (p_id, p_uid) on conflict do nothing;
  if found then update circle_posts set reports = reports + 1, hidden = hidden or reports + 1 >= 3 where id = p_id; end if;
  return true;
end $$;

-- ---------- the open-circle card says when the last public post came ----------
create or replace function public._lm_open_card(o public.circle_open, p_uid uuid, p_day text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'about', o.about, 'who', o.who, 'join', o.join_mode,
    'lang', o.lang, 'city', o.city, 'max', o.max_n, 'verified', o.verified,
    'n', (select count(*) from members where code = o.code),
    'today', _lm_open_today(o.code, p_day),
    'member', exists (select 1 from members where code = o.code and uid = p_uid),
    'asked', (select status from circle_asks where code = o.code and uid = p_uid order by created desc limit 1),
    'post_at', (select max(at) from circle_posts where code = o.code and vis = 'public' and not hidden and at <= now()));
$$;
revoke all on function public._lm_open_card(public.circle_open, uuid, text) from public, anon, authenticated;

-- ---------- admin ----------
-- Reported or hidden posts from all circles.
create or replace function public.lm_admin_posts() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return coalesce((select json_agg(json_build_object('id', p.id, 'body', p.body, 'reports', p.reports, 'hidden', p.hidden, 'created', p.created,
      'circle', coalesce((select title from circle_open where code = p.code), (select title from members where code = p.code and uid = p.uid limit 1), 'Общий круг'),
      'by', (select coalesce(nullif(u.name, ''), u.nick, '') from users u where u.uid = p.uid)) order by p.created desc)
    from circle_posts p where p.reports > 0 or p.hidden), '[]'::json);
end $$;

-- Hide (true), show again (false) or delete (null) a post.
create or replace function public.lm_admin_post(p_id bigint, p_hide boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare p circle_posts;
begin
  if not _lm_is_admin() then return false; end if;
  select * into p from circle_posts where id = p_id;
  if p.id is null then return false; end if;
  if p_hide is null then
    delete from chat_msgs where code = p.code and kind = 'event' and ref->>'t' = 'post' and ref->>'p' = p.id::text;
    delete from circle_posts where id = p_id; return true;
  end if;
  update circle_posts set hidden = p_hide, reports = case when p_hide then reports else 0 end where id = p_id;
  if not p_hide then delete from circle_post_reports where post_id = p_id; end if;
  return true;
end $$;

-- ---------- push for the team's posts (api/push-tick.js, once a minute) ----------
-- Due posts with «Пуш» on: one notice per subscription whose person may see it. Marks them sent.
create or replace function public.lm_post_push(p_secret text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare out json;
begin
  if p_secret is distinct from (select val from lm_config where key = 'push_secret') then return null; end if;
  select coalesce(json_agg(json_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'prefs', s.prefs, 'id', p.id, 'body', p.body)), '[]'::json)
  into out
  from circle_posts p
  join push_subs s on s.uid is not null
  left join users u on u.uid = s.uid
  where p.code is null and p.push and not p.pushed and not p.hidden and p.at <= now() and p.at > now() - interval '1 day'
    and (p.who = 'all' or (p.who = 'brothers' and u.gender = 'm') or (p.who = 'sisters' and u.gender = 'f'));
  update circle_posts set pushed = true where code is null and push and not pushed and at <= now();
  return out;
end $$;

-- ---------- access ----------
revoke all on function public.lm_posts(uuid,text,text,uuid,text,int), public.lm_post_photo(uuid,text,bigint,text),
  public.lm_post_add(uuid,text,text,text,jsonb,text,text,boolean,boolean,timestamptz,text,text), public.lm_post_set(uuid,text,bigint,text,text),
  public.lm_post_react(uuid,text,bigint,text), public.lm_post_report(uuid,text,bigint),
  public.lm_admin_posts(), public.lm_admin_post(bigint,boolean), public.lm_post_push(text) from public;
grant execute on function public.lm_posts(uuid,text,text,uuid,text,int), public.lm_post_photo(uuid,text,bigint,text),
  public.lm_post_add(uuid,text,text,text,jsonb,text,text,boolean,boolean,timestamptz,text,text), public.lm_post_set(uuid,text,bigint,text,text),
  public.lm_post_react(uuid,text,bigint,text), public.lm_post_report(uuid,text,bigint), public.lm_post_push(text) to anon, authenticated;
grant execute on function public.lm_admin_posts(), public.lm_admin_post(bigint,boolean) to authenticated;

select 'posts ready' as status;
