// Run: local Postgres lmtest with supabase/*.sql incl. intents.sql, npm run build, then node tests/e2e-person.cjs
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5191';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const openChat = async (pg) => { await nav(pg, 'Круг'); await wait(1500); const r = pg.locator('.wa-row'); if (await r.count()) { await r.first().click(); await wait(1500); } };

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
async function join(pg, code) {
  await pg.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers`); await wait(2500);
  await nav(pg, 'Круг');
  const j = pg.locator('button', { hasText: /Вступить|Присоединиться/ });
  if (await j.count()) { await j.first().click(); await wait(2500); }
}


const badge = async (pg) => { const b = pg.locator('nav.nav button', { hasText: 'Круг' }).locator('.nav-badge'); return (await b.count()) ? (await b.textContent()).trim() : ''; };
const rowN = async (pg, title) => { const e = pg.locator('.wa-row', { hasText: title }).locator('.wa-l2 em'); return (await e.count()) ? (await e.textContent()).trim() : ''; };
const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };

(async () => {
  await L.db.connect(); await su.connect();
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
    const uidA = JSON.parse(await ls(A, 'lm.cloud')).uid;
    // B: own circle «Своё» first, then joins «Братья» (so «Братья» is B's current circle)
    const B = await L.phone(br, 'B'); await signup(B, 'Рустам', 'rustam@test.dev');
    await nav(B, 'Круг');
    await B.locator('button', { hasText: 'Своё' }).first().click();
    const t2 = B.locator('input[placeholder^="Например"]'); if (await t2.count()) await t2.fill('Своё');
    await B.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const own = JSON.parse(await ls(B, 'lm.cloud')).circle;
    await join(B, code);
    const uidB = JSON.parse(await ls(B, 'lm.cloud')).uid;
    say('B circles:', await Q('select code from members where uid = $1', [uidB]), 'current', JSON.parse(await ls(B, 'lm.cloud')).circle === code ? 'Братья' : 'other');
    // B reads everything, then goes to Today
    await nav(B, 'Круг'); await wait(1500);
    const r0 = B.locator('.wa-row', { hasText: 'Братья' }); if (await r0.count()) { await r0.click(); await wait(2500); }
    await nav(B, 'Сегодня'); await wait(1000);
    // A writes 2 messages in «Братья», 1 in nothing else; C-less: also one event from A into B's own? no: A is not in it
    await Q(`insert into chat_msgs(code, uid, body) values ($1, $2, 'Ассаляму алейкум'), ($1, $2, 'Кто завтра на фаджр?')`, [code, uidA]);
    await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(2500);
    const b1 = await badge(B); say('bottom badge on Today:', b1);
    ok(b1 === '2', 'bottom shows 2');
    await nav(B, 'Круг'); await wait(4500); // longer than the 3 s chat poll that used to mark them read
    await shot(B, 'un-1-list');
    const n1 = await rowN(B, 'Братья'); say('row «Братья»:', n1, 'bottom:', await badge(B));
    ok(n1 === '2', 'circle row keeps 2 on the list');
    ok((await badge(B)) === '2', 'bottom still 2 while the list is open');
    ok((await rowN(B, 'Своё')) === '', 'other circle has no number');
    // open the circle: divider + numbers clear
    await B.locator('.wa-row', { hasText: 'Братья' }).click(); await wait(3000);
    await shot(B, 'un-2-chat');
    const div = await B.locator('text=/непрочитанн/i').count(); say('unread divider in chat:', div);
    await B.evaluate(() => history.back()); await wait(2500);
    await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(2000);
    ok((await rowN(B, 'Братья')) === '', 'row cleared after reading');
    ok((await badge(B)) === '', 'bottom cleared after reading');
    // a message in the NON-current circle while B sits on the list
    await Q(`insert into members(code, uid) values ($1, $2) on conflict do nothing`, [own, uidA]).catch((e) => say('member insert', e.message));
    await Q(`insert into chat_msgs(code, uid, body) values ($1, $2, 'Салам в «Своё»')`, [own, uidA]);
    await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(2500);
    ok((await rowN(B, 'Своё')) === '1', 'other circle row shows 1');
    ok((await badge(B)) === '1', 'bottom shows 1');
    // invite: bottom number = invites + messages, and the invite is on the list
    say('errors', L.errors);
  } finally { await br.close(); srv.close(); await su.end(); await L.db.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
