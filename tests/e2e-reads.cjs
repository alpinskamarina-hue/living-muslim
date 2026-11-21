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
    const B = await L.phone(br, 'B'); await signup(B, 'Рустам', 'rustam@test.dev'); await join(B, code);
    const C = await L.phone(br, 'C'); await signup(C, 'Тимур', 'timur@test.dev'); await join(C, code);
    await nav(B, 'Сегодня'); await nav(C, 'Сегодня');
    await Q(`insert into chat_msgs(code, uid, body) values ($1, $2, 'Кто завтра на фаджр?')`, [code, uidA]);
    const id = (await Q(`select max(id)::int id from chat_msgs`))[0].id;
    await Q(`insert into chat_seen(code, uid, last_id) values ($1, $2, $3) on conflict (code, uid) do update set last_id = excluded.last_id`, [code, uidA, id]);
    // A in the chat
    await A.reload(); await wait(3000); await openChat(A); await wait(4000);
    const tick = async () => (await A.locator('.cc-m.mine .cc-tick').last().getAttribute('class')) || '';
    let k = await tick(); say('A tick, nobody read:', k); ok(k.includes('t-sent'), 'one tick while nobody has read');
    await shot(A, 'rd-1-sent');
    await openChat(B); await wait(4000);
    await A.waitForTimeout(4000);
    k = await tick(); say('A tick, B read:', k); ok(k.includes('t-some'), 'two grey ticks when B read');
    await shot(A, 'rd-2-some');
    await openChat(C); await wait(4000);
    await A.waitForTimeout(4000);
    k = await tick(); say('A tick, all read:', k); ok(k.includes('t-all'), 'two blue ticks when everyone read');
    await shot(A, 'rd-3-all');
    // who read: long press menu
    const b = await A.locator('.cc-m.mine').last().boundingBox();
    await A.mouse.move(b.x + 20, b.y + 10); await A.mouse.down(); await wait(900); await A.mouse.up(); await wait(500);
    const rt = await A.locator('.cc-read').textContent().catch(() => ''); say('menu:', rt);
    ok(/Рустам/.test(rt) && /Тимур/.test(rt), 'menu lists who read');
    await shot(A, 'rd-4-menu');
    await A.locator('.cc-menu .link-btn').click().catch(() => {});
    // the list of circles
    await A.evaluate(() => history.back()); await wait(2500);
    await shot(A, 'rd-5-list');
    const lk = (await A.locator('.wa-row .wa-l2 .cc-tick').first().getAttribute('class')) || '';
    say('list tick:', lk); ok(lk.includes('t-all'), 'list shows two blue ticks');
    say('errors', L.errors);
  } finally { await br.close(); srv.close(); await su.end(); await L.db.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
