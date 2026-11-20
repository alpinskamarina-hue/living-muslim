-- Living Muslim: shared base for the «Халяль-сканер» (step 2). Run after admin.sql. Paste into Supabase → SQL Editor and press Run.
-- Safe to run again.
--   lm_halal_products: ingredient lists people read from a photo, for products the open database does not know.
--   lm_halal_signs:    «на упаковке знак халяль» with a small photo of the sign, one per person and product.
--   lm_halal_review:   the owner's decision. A sign becomes green for everyone only after the owner approves it.
-- Reading works without sign-in (the scanner works in a shop without an account); adding needs the email sign-in.

create table if not exists public.lm_halal_products (
  code text primary key check (code ~ '^[0-9]{8,14}$'),
  name text not null default '',
  ingredients text not null default '',
  by uuid,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
alter table public.lm_halal_products enable row level security;
revoke all on public.lm_halal_products from anon, authenticated;

create table if not exists public.lm_halal_signs (
  code text not null check (code ~ '^[0-9]{8,14}$'),
  user_id uuid not null,
  name text not null default '',
  photo bytea,
  created timestamptz not null default now(),
  primary key (code, user_id)
);
alter table public.lm_halal_signs enable row level security;
revoke all on public.lm_halal_signs from anon, authenticated;

create table if not exists public.lm_halal_review (
  code text primary key,
  ok boolean not null,
  by text not null default '',
  at timestamptz not null default now()
);
alter table public.lm_halal_review enable row level security;
revoke all on public.lm_halal_review from anon, authenticated;

-- What the shared base knows about one barcode.
create or replace function public.lm_halal_get(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', coalesce((select name from lm_halal_products where code = p_code), (select name from lm_halal_signs where code = p_code and name <> '' order by created limit 1), ''),
    'ingredients', coalesce((select ingredients from lm_halal_products where code = p_code), ''),
    'signs', (select count(*) from lm_halal_signs where code = p_code),
    'ok', (select ok from lm_halal_review where code = p_code),
    'mine', exists (select 1 from lm_halal_signs where code = p_code and user_id = auth.uid()));
$$;
revoke all on function public.lm_halal_get(text) from public;
grant execute on function public.lm_halal_get(text) to anon, authenticated;

-- Save an ingredient list read from a photo. The first one stays; its author may correct it.
create or replace function public.lm_halal_save(p_code text, p_name text, p_ing text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then return json_build_object('error', 'signin'); end if;
  if p_code !~ '^[0-9]{8,14}$' or length(coalesce(p_ing, '')) < 3 then return json_build_object('error', 'bad'); end if;
  if (select count(*) from lm_halal_products where by = u and updated > now() - interval '1 day') >= 40 then return json_build_object('error', 'day'); end if;
  insert into lm_halal_products (code, name, ingredients, by) values (p_code, left(coalesce(p_name, ''), 80), left(p_ing, 2000), u)
    on conflict (code) do update set name = excluded.name, ingredients = excluded.ingredients, updated = now()
    where lm_halal_products.by = u;
  return json_build_object('ok', true);
end $$;
revoke all on function public.lm_halal_save(text, text, text) from public;
grant execute on function public.lm_halal_save(text, text, text) to authenticated;

-- «На упаковке знак халяль» with a photo of the sign (JPEG, base64, shrunk on the phone).
create or replace function public.lm_halal_sign(p_code text, p_name text, p_b64 text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare u uuid := auth.uid(); raw bytea;
begin
  if u is null then return json_build_object('error', 'signin'); end if;
  if p_code !~ '^[0-9]{8,14}$' then return json_build_object('error', 'bad'); end if;
  if length(coalesce(p_b64, '')) > 600000 then return json_build_object('error', 'big'); end if;
  if (select count(*) from lm_halal_signs where user_id = u and created > now() - interval '1 day') >= 30 then return json_build_object('error', 'day'); end if;
  begin raw := decode(coalesce(p_b64, ''), 'base64'); exception when others then return json_build_object('error', 'bad'); end;
  if length(raw) > 0 and substring(raw from 1 for 3) <> '\xffd8ff'::bytea then return json_build_object('error', 'mime'); end if;
  insert into lm_halal_signs (code, user_id, name, photo) values (p_code, u, left(coalesce(p_name, ''), 80), nullif(raw, ''::bytea))
    on conflict (code, user_id) do update set name = excluded.name, photo = coalesce(excluded.photo, lm_halal_signs.photo), created = now();
  return json_build_object('ok', true, 'signs', (select count(*) from lm_halal_signs where code = p_code));
end $$;
revoke all on function public.lm_halal_sign(text, text, text) from public;
grant execute on function public.lm_halal_sign(text, text, text) to authenticated;

create or replace function public.lm_halal_unsign(p_code text) returns void
language sql volatile security definer set search_path = public as $$
  delete from lm_halal_signs where code = p_code and user_id = auth.uid();
$$;
revoke all on function public.lm_halal_unsign(text) from public;
grant execute on function public.lm_halal_unsign(text) to authenticated;

-- For the owner: products with signs that are not decided yet, most confirmed first, with up to 3 photos each.
create or replace function public.lm_halal_queue() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return null; end if;
  return coalesce((
    select json_agg(x order by x.signs desc, x.last desc) from (
      select s.code,
        coalesce((select p.name from lm_halal_products p where p.code = s.code), max(s.name)) as name,
        coalesce((select p.ingredients from lm_halal_products p where p.code = s.code), '') as ingredients,
        count(*) as signs, max(s.created) as last,
        (select json_agg(encode(t.photo, 'base64')) from (select photo from lm_halal_signs where code = s.code and photo is not null order by created desc limit 3) t) as photos
      from lm_halal_signs s
      where not exists (select 1 from lm_halal_review r where r.code = s.code)
      group by s.code
      limit 50) x), '[]'::json);
end $$;
revoke all on function public.lm_halal_queue() from public;
grant execute on function public.lm_halal_queue() to authenticated;

create or replace function public.lm_halal_decide(p_code text, p_ok boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_is_admin() then return; end if;
  insert into lm_halal_review (code, ok, by) values (p_code, p_ok, lower(coalesce(auth.jwt() ->> 'email', '')))
    on conflict (code) do update set ok = excluded.ok, by = excluded.by, at = now();
end $$;
revoke all on function public.lm_halal_decide(text, boolean) from public;
grant execute on function public.lm_halal_decide(text, boolean) to authenticated;
