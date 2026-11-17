-- Умра: общая копилка (umrahFund) и группа на карте (umrahLoc). Добавляет две коллекции в белый список записи.
create or replace function public.lm_write(p_uid uuid, p_token text, p_code text, p_coll text, p_data jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not _lm_ok(p_uid, p_token) then return false; end if;
  if not exists (select 1 from members where code = p_code and uid = p_uid) then return false; end if;
  if p_coll not in ('circle','reacts','umrahTrip','umrahRsvp','umrahDua','khatm','khatmJuz','iftar','iftarRsvp','umrahFund','umrahLoc') then return false; end if;
  if p_data is null then
    delete from docs where code = p_code and coll = p_coll and key = p_uid;
  else
    if length(p_data::text) > 20000 then return false; end if;
    insert into docs(code, coll, key, data, updated) values (p_code, p_coll, p_uid, p_data, now())
    on conflict (code, coll, key) do update set data = excluded.data, updated = now();
  end if;
  return true;
end $$;
