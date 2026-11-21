-- Investor page (/investors/): requests for the deck. Only the owner reads them (Supabase table editor or admin).
create table if not exists public.invest_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null,
  country text not null default '',
  amount text not null default '',
  about text not null default '',
  lang text not null default 'ru',
  created timestamptz not null default now()
);
alter table public.invest_leads enable row level security;
revoke all on public.invest_leads from anon, authenticated;

create or replace function public.lm_invest_lead(p_name text, p_contact text, p_country text, p_amount text, p_about text, p_lang text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_contact), '') = '' then return false; end if;
  -- simple flood guard: at most 30 requests an hour from everyone together
  if (select count(*) from invest_leads where created > now() - interval '1 hour') >= 30 then return false; end if;
  insert into invest_leads(name, contact, country, amount, about, lang)
  values (left(trim(p_name), 60), left(trim(p_contact), 120), left(trim(coalesce(p_country, '')), 60),
          left(coalesce(p_amount, ''), 40), left(trim(coalesce(p_about, '')), 1000), left(coalesce(p_lang, 'ru'), 5));
  return true;
end $$;
revoke all on function public.lm_invest_lead(text,text,text,text,text,text) from public;
grant execute on function public.lm_invest_lead(text,text,text,text,text,text) to anon, authenticated;
