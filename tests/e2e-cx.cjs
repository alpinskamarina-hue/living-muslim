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

    const C = await L.phone(br, 'C');
    await signup(C, 'Амир', 'amir@test.dev');
    await C.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers`); await wait(2500);
    await nav(C, 'Круг');
    const jc = C.locator('button', { hasText: /Вступить|Присоединиться/ });
    if (await jc.count()) { await jc.first().click(); await wait(2500); }
    await A.reload(); await wait(3500); await nav(A, 'Круг'); await wait(2000);
    await A.screenshot({ path: OUT + 'cx-1-empty.png' });
    // B writes, A writes
    await B.reload(); await wait(3000); await nav(B, 'Круг'); await wait(2000);
    await B.locator('.cc-in textarea').fill('Братья, кто сегодня на джуму?'); await B.locator('.cc-send').click(); await wait(800);
    await B.locator('.cc-quick button').first().click(); await wait(800);
    say('B quick:', await B.locator('.cc-quick button').allInnerTexts());
    // A: plus -> poll
    await A.reload(); await wait(3500); await nav(A, 'Круг'); await wait(1500);
    await A.locator('.cc-plus').click(); await wait(400);
    await A.screenshot({ path: OUT + 'cx-2-plus.png' });
    await A.locator('.cc-acts-g button', { hasText: '📊' }).click(); await wait(300);
    const ins = A.locator('.cx-sheet input');
    await ins.nth(0).fill('Где читаем Коран в субботу?'); await ins.nth(1).fill('У Rustam'); await ins.nth(2).fill('В мечети');
    await A.locator('.cx-sheet .pri-btn').click(); await wait(1200);
    await A.locator('.cc-poll button').first().click(); await wait(800);
    // A: dua
    await A.locator('.cc-plus').click(); await wait(300);
    await A.locator('.cc-acts-g button', { hasText: 'Попросить дуа' }).click(); await wait(300);
    await A.locator('.cx-sheet textarea').fill('За маму, завтра операция');
    await A.locator('.cx-sheet .pri-btn').click(); await wait(1500);
    await A.locator('.cc-quick button').first().click(); await wait(1200);
    await A.screenshot({ path: OUT + 'cx-3-chat.png' });
    await A.evaluate(() => window.scrollTo(0, 0)); await wait(300);
    await A.screenshot({ path: OUT + 'cx-3b-top.png' });
    await A.evaluate(() => window.scrollTo(0, 99999));
    await A.screenshot({ path: OUT + 'cx-3-chat-full.png', fullPage: true });
    // panel
    await A.locator('.cx-menu').click(); await wait(600);
    await A.screenshot({ path: OUT + 'cx-4-panel.png' });
    await A.locator('.cx-panel').evaluate((e) => e.scrollTo(0, 99999)); await wait(300);
    await A.screenshot({ path: OUT + 'cx-5-panel-end.png' });
    say('dialogs', A.dialogs, B.dialogs);
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; }
  finally { await br.close(); srv.close(); await L.db.end(); }
})();
