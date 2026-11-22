-- Living Muslim: «Страна» in the nikah profile. Paste into Supabase → SQL Editor and press Run.
-- Only lets the profile keep one more field (country); nothing else changes, no data is touched.
create or replace function public._lm_nk_data(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, left(trim(p->>k), 40)) filter (where p ? k and coalesce(p->>k, '') <> ''), '{}'::jsonb)
  from unnest(array['age', 'country', 'city', 'prayer', 'madhab', 'kids', 'move', 'work']) k;
$$;

-- Check: should show {"country": "nl"}
select public._lm_nk_data('{"country": "nl", "x": "y"}'::jsonb) as check_country;
