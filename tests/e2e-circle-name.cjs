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
  await pg.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Кофейня')}&k=biz`); await wait(2500);
  await nav(pg, 'Круг');
  const j = pg.locator('button', { hasText: /Вступить|Присоединиться/ });
  if (await j.count()) { await j.first().click(); await wait(2500); }
}


const badge = async (pg) => { const b = pg.locator('nav.nav button', { hasText: 'Круг' }).locator('.nav-badge'); return (await b.count()) ? (await b.textContent()).trim() : ''; };
const rowN = async (pg, title) => { const e = pg.locator('.wa-row', { hasText: title }).locator('.wa-l2 em'); return (await e.count()) ? (await e.textContent()).trim() : ''; };



const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };
const hold = async (pg, loc) => { const b = await loc.boundingBox(); await pg.mouse.move(b.x + 20, b.y + 12); await pg.mouse.down(); await wait(800); await pg.mouse.up(); await wait(500); };
(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5191);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    await A.locator('.cl-kinds button', { hasText: 'Бизнес' }).click(); await wait(300);
    ok((await A.locator('.cl-root').textContent()).includes('Бизнес'), 'root «Бизнес» shown before the input');
    await A.locator('.cl-name input').fill('Мойка');
    await A.locator('.cl-name').scrollIntoViewIfNeeded(); await A.evaluate(() => window.scrollBy(0, 120)); await shot(A, 'cn-1-create');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const cl = () => ls(A, 'lm.cloud').then((x) => JSON.parse(x));
    ok((await cl()).circles[0].title === 'Бизнес · Мойка', 'saved as «Бизнес · Мойка»');
    const code = (await cl()).circle;
    const srvT = await Q('select title from circle_meta where code = $1', [code]).catch(() => []);
    say('server meta:', srvT);
    const C = await L.phone(br, 'C'); await signup(C, 'Ахмад', 'ahmad@test.dev');
    await C.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Бизнес · Мойка')}&k=biz`); await wait(2500);
    await nav(C, 'Круг'); await shot(C, 'cn-4-invite');
    { const j = C.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } }
    ok(JSON.parse(await ls(C, 'lm.cloud')).circles.find((c) => c.code === code).title === 'Бизнес · Мойка', 'joiner gets «Бизнес · Мойка», no double root');
    await A.reload(); await wait(3000); await openChat(A); await wait(1500); await shot(A, 'cn-1b-chat');
    ok((await A.locator('.wa-ht b').textContent()) === 'Бизнес · Мойка', 'chat header shows root · own');
    await A.locator('.wa-hbtn', { hasText: '⋮' }).click(); await wait(700);
    await A.locator('.wa-ren').click(); await wait(300);
    ok(await A.locator('.wa-renf input').inputValue() === 'Мойка', 'rename edits only the own part');
    await A.locator('.wa-renf input').fill('Кафе на углу');
    await shot(A, 'cn-2-rename');
    await A.locator('.wa-renf .pri-btn').click(); await wait(600);
    ok((await A.locator('.wa-iname').textContent()).startsWith('Бизнес · Кафе на углу'), 'renamed, root kept');
    ok((await cl()).circles[0].title === 'Бизнес · Кафе на углу', 'stored');
    // empty own part leaves just the root
    await A.locator('.wa-ren').click(); await A.locator('.wa-renf input').fill(''); await A.locator('.wa-renf .pri-btn').click(); await wait(400);
    ok((await cl()).circles[0].title === 'Бизнес', 'empty own part → just «Бизнес»');
    // old circle without root gets it in front
    await A.evaluate(() => { const x = JSON.parse(localStorage.getItem('lm.cloud')); x.circles[0].title = 'Партнёры'; localStorage.setItem('lm.cloud', JSON.stringify(x)); });
    await A.reload(); await wait(2500); await nav(A, 'Круг'); await wait(1500);
    await shot(A, 'cn-3-list');
    ok(await A.locator('.wa-row', { hasText: 'Бизнес · Партнёры' }).count() === 1, 'old circle shows «Бизнес · Партнёры»');
    // «Своё» is named freely
    const B = await L.phone(br, 'B'); await signup(B, 'Дамир', 'damir@test.dev');
    await nav(B, 'Круг');
    await B.locator('.cl-kinds button', { hasText: 'Своё' }).click(); await wait(300);
    ok(await B.locator('.cl-root').count() === 0, 'no root for «Своё»');
    await B.locator('.cl-name input').fill('Бег по утрам');
    await B.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    ok(JSON.parse(await ls(B, 'lm.cloud')).circles[0].title === 'Бег по утрам', '«Своё» keeps its free name');
    say('errors', L.errors || []);
  } finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})().catch((e) => { console.error(e); process.exit(1); });
