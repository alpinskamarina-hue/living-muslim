create table if not exists public.signups (
  email text primary key,
  name text not null default '',
  lang text not null default 'ru',
  source text not null default '',
  created timestamptz not null default now()
);
alter table public.signups enable row level security;
revoke all on public.signups from anon, authenticated;

create or replace function public.lm_signup(p_name text, p_email text, p_lang text, p_source text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_email is null or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(p_email) > 120 then return false; end if;
  insert into signups(email, name, lang, source)
  values (lower(trim(p_email)), left(trim(coalesce(p_name,'')), 40), left(coalesce(p_lang,'ru'), 5), left(coalesce(p_source,''), 120))
  on conflict (email) do update set name = excluded.name, lang = excluded.lang;
  return true;
end $$;
revoke all on function public.lm_signup(text,text,text,text) from public;
grant execute on function public.lm_signup(text,text,text,text) to anon, authenticated;
