// «Круг основателей» (supabase/founders.sql): the owner's test record, «Мой вклад», a gift code on a second phone,
// the founder's mark on the person view, the block on /investors. The /api endpoints are not on the stand (204),
// so Stripe itself is not exercised here. Run: lmtest with founders.sql, npm run build, node tests/e2e-founders.cjs
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/founders/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5192';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const ok = (c, m) => { if (!c) throw new Error(m); say('✓', m); };

async function signup(pg, name, email) {
  await pg.goto(BASE + '/');
  const f = pg.locator('.js-signup').first();
  await f.locator('input[name=name]').fill(name);
  await f.locator('input[name=email]').fill(email);
  await f.locator('button[type=submit]').click();
  await f.locator('input[name=code]').waitFor({ timeout: 5000 });
  await f.locator('input[name=code]').fill(L.CODE);
  await f.locator('button[type=submit]').click();
  await pg.waitForURL('**/app/**', { timeout: 8000 });
  await wait(2500);
}

(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' and tablename <> 'lm_config' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  await Q(`insert into lm_admins values ('owner@test.dev') on conflict do nothing`); await Q(`alter sequence founders_no restart with 1`);
  const srv = L.server(5192);
  const br = await L.chromium.launch();
  const A = await L.phone(br, 'A'); // the owner
  const B = await L.phone(br, 'B'); // someone who gets a gift code
  try {
    await signup(A, 'Ильгиз', 'owner@test.dev');
    await nav(A, 'Профиль'); await wait(1500);
    await shot(A, '01-profile');
    const entry = A.locator('.fd-entry');
    ok(await entry.count() === 1, 'the entry «Круг основателей» is on the profile');
    await entry.click(); await wait(1200);
    await shot(A, '02-founders', true);
    ok(await A.locator('.fd-tier').count() === 4, 'four levels');
    ok(await A.locator('.fd-tier[aria-checked="true"] b').textContent() === 'Ансар', 'Ансар is chosen by default');
    await A.locator('.fd-tier', { hasText: 'Мухсин' }).click();
    await A.locator('.fd-form input').nth(0).fill('Ильгиз Юсупов');
    await A.locator('.fd-form input').nth(2).fill('София');
    await A.locator('.fd-agree input').nth(1).check();
    await shot(A, '03-form', true);
    // terms open and come back
    await A.locator('.fd-agree .link-btn').click(); await wait(600);
    ok(/Что вы покупаете/.test(await A.locator('.fd-terms').textContent()), 'terms open');
    await shot(A, '04-terms', true);
    await A.locator('.sub-back, button', { hasText: /← Круг основателей/ }).first().click(); await wait(800);
    ok(await A.locator('.fd-form').count() === 1, 'back to the form, state kept');
    ok(await A.locator('.fd-form input').nth(0).inputValue() === 'Ильгиз Юсупов', 'name kept');
    // the owner's test record
    await A.locator('button', { hasText: 'Тестовая запись без оплаты' }).click(); await wait(2500);
    await shot(A, '05-mine', true);
    const rows = await Q(`select tier, status, no, code, wall, pro_until, pro_forever from founders`);
    ok(rows.length === 1 && rows[0].status === 'test' && rows[0].tier === 'f500' && rows[0].no === 1, 'test record F-0001 (f500)');
    ok(rows[0].wall === 'Ильгиз, София', `wall text from name + city: ${rows[0].wall}`);
    ok(/Сертификат № F-0001/.test(await A.locator('.fd-card').first().textContent()), '«Мой вклад» shows the certificate');
    ok(await A.locator('.fd-card .fb-f500').count() === 1, 'the Мухсин badge on the card');
    const gifts = await Q(`select code, used from founder_gifts`);
    ok(gifts.length === 1 && !gifts[0].used, 'one gift code for Мухсин');
    ok((await A.locator('.fd-codes span').textContent()) === gifts[0].code, 'the gift code is on the screen');
    ok(JSON.parse(await A.evaluate(() => localStorage.getItem('lm.founder'))).tier === 'f500', 'Pro grant cached for plan.ts');
    // the wall (test records do not count)
    ok(/Первые имена появятся/.test(await A.locator('.fd-wall').textContent()), 'the wall is empty for test records');
    await Q(`update founders set status = 'paid'`);
    await A.reload(); await wait(2500); await nav(A, 'Профиль'); await wait(800); await A.locator('.fd-entry').click(); await wait(1500);
    ok(/Мой вклад · Мухсин/.test(await A.locator('.fd-entry').textContent().catch(() => '')) || true, 'entry text (checked below)');
    ok(/Ильгиз, София/.test(await A.locator('.fd-names').textContent()), 'the wall shows the name after payment');
    ok(/€500/.test(await A.locator('.fd-prog').textContent()), 'progress shows €500');
    await shot(A, '06-wall', true);
    await nav(A, 'Профиль'); await wait(800);
    ok(/Мой вклад · Мухсин/.test(await A.locator('.fd-entry').textContent()), 'the entry says «Мой вклад · Мухсин»');
    // raise the level: form opens again
    await A.locator('.fd-entry').click(); await wait(1200);
    await A.locator('.fd-more button').evaluate((b) => b.click()); await wait(500);
    ok(await A.locator('.fd-form').count() === 1, 'the form opens for a second contribution');

    // B: gift code via link
    await signup(B, 'Амина', 'amina@test.dev');
    await B.goto(`${BASE}/app/?gift=${gifts[0].code}`); await wait(3000);
    await shot(B, '07-gift-link', true);
    ok(await B.locator('.fd-gift-f input').count() === 1, 'the gift field is open from the link');
    ok((await B.locator('.fd-gift-f input').inputValue()) === gifts[0].code, 'the code is filled in');
    await B.locator('.fd-gift-f button').click(); await wait(2000);
    ok(/Pro открыт до/.test(await B.locator('.fd-gift .pro-note').textContent()), 'gift applied');
    const g2 = await Q(`select used, used_by from founder_gifts`);
    ok(g2[0].used && g2[0].used_by, 'gift marked used');
    ok(JSON.parse(await B.evaluate(() => localStorage.getItem('lm.founder'))).until, 'B has Pro until cached');
    await shot(B, '08-gift-done', true);
    // the same code again
    await B.locator('.fd-gift-f input').fill(gifts[0].code); await B.locator('.fd-gift-f button').click(); await wait(1500);
    ok(/уже использован/.test(await B.locator('.fd-gift .pro-note').textContent()), 'second use refused');
    // A sees the gift as used
    await A.reload(); await wait(2500); await nav(A, 'Профиль'); await wait(800); await A.locator('.fd-entry').click(); await wait(1500);
    ok(await A.locator('.fd-codes .used').count() === 1, 'A sees the code as used');

    // the founder's mark on A's person view (B opens A by nick)
    await Q(`update users set nick = 'ilgiz', findable = true where name = 'Ильгиз'`);
    const uidA = (await Q(`select uid from users where name = 'Ильгиз'`))[0].uid;
    await B.evaluate((u) => window.dispatchEvent(new CustomEvent('lm-person', { detail: { uid: u } })), uidA); await wait(2000);
    await shot(B, '09-person', true);
    ok(/Основатель Living Muslim · Мухсин/.test(await B.locator('.pp-tag.t-founder').textContent()), 'founder mark on the person view');
    ok(await B.locator('.pp-founder .fb-f500').count() === 2, 'the big and the small badge on the person view');
    ok(await A.locator('.fd-names .fb-f500').count() === 1, 'the badge on the wall');

    // English
    await A.evaluate(() => { const s = JSON.parse(localStorage.getItem('qadam.v1') || '{}'); s.settings = { ...(s.settings || {}), lang: 'en' }; localStorage.setItem('qadam.v1', JSON.stringify(s)); });
    await A.goto(`${BASE}/app/?founder=f1000`); await wait(3000);
    await shot(A, '10-en', true);
    ok(/Founders Circle/.test(await A.locator('.fd').textContent()), 'English');
    ok(await A.locator('.fd-tier[aria-checked="true"] b').textContent() === 'Partner', 'the link ?founder=f1000 opens the form with Partner chosen');

    // the landing block
    await A.goto(BASE + '/investors/'); await wait(2500);
    await A.locator('#founders').scrollIntoViewIfNeeded(); await wait(1200);
    ok(/€500/.test(await A.locator('#fd-prog').textContent()), 'landing progress bar filled from Supabase');
    ok(/Ильгиз, София/.test(await A.locator('#fd-wall').textContent()), 'landing wall shows the name');
    ok(await A.locator('#fd-wall svg').count() === 1, 'the badge on the landing wall');
    await A.locator('#founders').screenshot({ path: OUT + '11-landing.png' });
    const D = await br.newContext({ viewport: { width: 1280, height: 900 } });
    const dp = await D.newPage();
    await dp.route(/supabase\.co/, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sum: 435000, count: 29, goal: 2000000, anon: 4, names: [{ w: 'Ильгиз, София', t: 'f1000' }, { w: 'Амина, Алматы', t: 'f250' }, { w: 'Юсуф, Лондон', t: 'f100' }] }) }));
    await dp.goto(BASE + '/investors/'); await wait(2000);
    await dp.locator('#founders').screenshot({ path: OUT + '12-landing-desktop.png' });
    await D.close();
  } finally {
    const errs = L.errors.filter((e) => !/favicon|404|net::ERR|api\/invest/.test(e));
    say('errors:', errs.length ? errs : 'none');
    await br.close(); srv.close(); await L.db.end(); await su.end();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
