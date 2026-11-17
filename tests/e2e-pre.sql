do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role authenticated; exception when others then null; end $$;
create schema extensions; create schema auth;
create extension pgcrypto with schema extensions;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated;
grant execute on all functions in schema extensions to anon, authenticated;
