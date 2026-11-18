// Run: like e2e-chat.cjs, plus supabase/circle-kick.sql. Then node tests/e2e-kick.cjs, npm i pg, npm run build, then node tests/e2e-chat.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5191';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(700); };

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
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5191);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Ильгиз', 'ilgiz@test.dev');
    await nav(A, 'Круг');
    await A.locator('button', { hasText: 'Братья' }).first().click();
    const t = A.locator('input[placeholder^="Например"]'); if (await t.count()) await t.fill('Братья');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;

    const B = await L.phone(br, 'B');
    await signup(B, 'Rustam', 'rustam@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers`); await wait(2500);
    await nav(B, 'Круг');
    const jb = B.locator('button', { hasText: /Вступить|Присоединиться/ });
    if (await jb.count()) { await jb.first().click(); await wait(2500); }
    say('members before:', (await L.q('select count(*)::int n from members where code = $1', [code]))[0]?.n ?? await L.q('select count(*)::int n from members where code = $1', [code]));

    // B does not see the kick button (not owner)
    say('B kick buttons:', await B.locator('.ch-acts .kick').count());

    await A.reload(); await wait(3000); await nav(A, 'Круг');
    say('A kick buttons:', await A.locator('.ch-acts .kick').count());
    await A.locator('.ch-acts .kick').first().scrollIntoViewIfNeeded();
    await shot(A, 'kick-1-owner');
    await A.locator('.ch-acts .kick').first().click(); await wait(1500);
    say('dialogs:', A.dialogs);
    say('members after:', await L.q('select count(*)::int n from members where code = $1', [code]));
    say('A removed list:', await A.locator('.ch-removed').innerText().catch(() => 'none'));
    await A.locator('.ch-removed').scrollIntoViewIfNeeded();
    await shot(A, 'kick-2-removed');

    // B: next refresh shows the "removed" card
    await B.reload(); await wait(3500); await nav(B, 'Круг'); await wait(1500);
    say('B card:', await B.locator('.warn.kicked').innerText().catch(() => 'none'));
    await shot(B, 'kick-3-removed-person');
    await B.locator('.warn.kicked .pri-btn').click(); await wait(3000);
    say('B circles after:', JSON.parse(await ls(B, 'lm.cloud')).circles?.length ?? 0);
    // B tries the old link again: refused
    await B.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers`); await wait(2500);
    await nav(B, 'Круг');
    const jb2 = B.locator('button', { hasText: /Вступить|Присоединиться/ });
    if (await jb2.count()) { await jb2.first().click(); await wait(2500); }
    say('B rejoin members:', await L.q('select count(*)::int n from members where code = $1', [code]));

    // A lets B back
    await A.locator('.ch-removed .link-btn').first().click(); await wait(1500);
    say('bans left:', await L.q('select count(*)::int n from circle_bans'));
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; }
  finally { await br.close(); srv.close(); await L.db.end(); }
})();
