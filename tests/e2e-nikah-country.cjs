// Run: local Postgres lmtest with supabase/nikah.sql + nikah-country.sql, npm run build, then node tests/e2e-nikah-country.cjs
// «Страна» in the nikah profile: chosen from the list or typed, saved, shown as «Город, Страна».
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const OUT = __dirname + '/shots/';
const BASE = 'http://localhost:5195';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };
(async () => {
  await L.db.connect(); await su.connect();
  await su.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('lm_admins', 'lm_config') loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5195);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await A.goto(BASE + '/');
    const f = A.locator('.js-signup').first();
    await f.locator('input[name=name]').fill('Насим'); await f.locator('input[name=email]').fill('nasim@test.dev');
    await f.locator('button[type=submit]').click();
    await f.locator('input[name=code]').waitFor({ timeout: 5000 }); await f.locator('input[name=code]').fill(L.CODE);
    await f.locator('button[type=submit]').click(); await A.waitForURL('**/app/**', { timeout: 8000 }); await wait(2500);
    await A.locator('nav.nav button', { hasText: 'Профиль' }).click(); await wait(1200);
    await A.locator('button, [role=button]', { hasText: 'Никах' }).first().click(); await wait(1500);
    await A.locator('button', { hasText: 'Заполнить анкету' }).click(); await wait(600);
    await A.locator('button', { hasText: 'Брат, ищу жену' }).click();
    const sel = A.locator('select.nk-country').first();
    ok(await sel.count() === 1, '«Страна» is a list in the form');
    const n = await sel.locator('option').count();
    ok(n > 50, `the list has ${n} countries and «Другая страна…»`);
    await A.locator('.nk-f', { hasText: 'Возраст' }).first().locator('input').fill('27');
    await A.locator('.nk-f', { hasText: 'Город' }).first().locator('input').fill('Амстердам');
    ok(await A.locator('button', { hasText: 'Сохранить анкету' }).isDisabled(), 'without a country the profile cannot be saved yet');
    await sel.selectOption('nl');
    await A.locator('.nk-f', { hasText: 'Страна' }).first().screenshot({ path: OUT + 'nk-country-1.png' });
    await A.locator('button', { hasText: 'Сохранить анкету' }).click(); await wait(2000);
    const row = (await su.query(`select data from nikah_profiles`)).rows[0];
    ok(row && row.data.country === 'nl' && row.data.city === 'Амстердам', 'saved: country nl, city Амстердам');
    const body = await A.locator('.nk').first().textContent();
    ok(body.includes('Нидерланды'), 'my profile shows Нидерланды');
    await A.screenshot({ path: OUT + 'nk-country-2.png' });
    // a country that is not in the list
    await A.locator('button', { hasText: 'Изменить' }).click(); await wait(600);
    await A.locator('select.nk-country').first().selectOption('_other');
    await A.locator('.nk-f', { hasText: 'Страна' }).first().locator('input').fill('Мальдивы');
    await A.locator('button', { hasText: 'Сохранить анкету' }).click(); await wait(2000);
    const row2 = (await su.query(`select data from nikah_profiles`)).rows[0];
    ok(row2.data.country === 'Мальдивы', '«Другая страна…» saves the typed name');
    ok((await A.locator('.nk').first().textContent()).includes('Мальдивы'), 'and shows it');
    ok(!L.errors.filter((e) => !/lm_hit|lm_course|courses/.test(e)).length, 'no page errors: ' + L.errors.join(' | '));
    say('ALL OK');
  } finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
