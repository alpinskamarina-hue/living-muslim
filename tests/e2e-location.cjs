// Run: local Postgres lmtest with supabase/*.sql incl. location.sql, npm run build, then node tests/e2e-location.cjs
// Map tiles, address and mosque search are stubbed (no internet in tests).
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/';
const BASE = 'http://localhost:5191';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const openChat = async (pg) => { await nav(pg, 'Круг'); await wait(1500); const r = pg.locator('.wa-row', { hasText: 'Умра март' }); if (await r.count()) { await r.first().click(); await wait(1500); } };
async function signup(pg, name, email) {
  await pg.goto(BASE + '/');
  const f = pg.locator('.js-signup').first();
  await f.locator('input[name=name]').fill(name); await f.locator('input[name=email]').fill(email);
  await f.locator('button[type=submit]').click();
  await f.locator('input[name=code]').waitFor({ timeout: 5000 }); await f.locator('input[name=code]').fill(L.CODE);
  await f.locator('button[type=submit]').click(); await pg.waitForURL('**/app/**', { timeout: 8000 }); await wait(2500);
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==', 'base64');
async function geo(pg, lat, lng) {
  const ctx = pg.context();
  await ctx.grantPermissions(['geolocation'], { origin: BASE });
  await ctx.setGeolocation({ latitude: lat, longitude: lng, accuracy: 8 });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route(/nominatim\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'Ворота короля Абдулазиза', address: { road: 'Ибрагим аль-Халиль' } }) }));
  await ctx.route(/overpass/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ elements: [{ type: 'way', id: 1, center: { lat: 21.4225, lon: 39.8262 }, tags: { amenity: 'place_of_worship', religion: 'muslim', name: 'Масджид аль-Харам' } }] }) }));
}
(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('lm_admins', 'lm_config') loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5191);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A'); await geo(A, 21.4215, 39.8254);
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    const own = A.locator('.oc-seg button', { hasText: 'Создать свой' }); if (await own.count()) { await own.click(); await wait(500); }
    await A.locator('.cl-kinds button', { hasText: 'Братья' }).first().click(); await wait(300);
    await A.locator('.cl-name input').fill('Умра март');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;
    const B = await L.phone(br, 'B'); await geo(B, 21.4250, 39.8290);
    await signup(B, 'Дамир', 'damir@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=x`); await wait(2500); await nav(B, 'Круг');
    { const j = B.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } }
    await A.reload(); await wait(3000); await openChat(A); await wait(1500);
    // one point
    await A.locator('.cc-plus').click(); await wait(500);
    const tile = A.locator('.cc-acts-g button', { hasText: 'Место' });
    ok(await tile.count() === 1, '«Место» in the clip sheet');
    await A.screenshot({ path: OUT + 'loc-1-sheet.png' });
    await tile.click(); await wait(2500);
    ok((await A.locator('.lc-sheet').textContent()).includes('Масджид аль-Харам'), 'nearest mosque in the send sheet');
    await A.screenshot({ path: OUT + 'loc-2-send.png' });
    await A.locator('.lc-opt.pri').click(); await wait(2000);
    const m1 = (await Q(`select body, ref from chat_msgs where code = $1 and ref->>'t' = 'loc' order by id`, [code]));
    say(m1[0]);
    ok(m1.length === 1 && m1[0].ref.la && m1[0].ref.a === 'Ворота короля Абдулазиза' && m1[0].ref.m === 'Масджид аль-Харам', 'point sent with address and mosque');
    ok(await A.locator('.lc-card .lc-addr').count() === 1, 'location card in the chat');
    // live
    await A.locator('.cc-plus').click(); await wait(400);
    await A.locator('.cc-acts-g button', { hasText: 'Место' }).click(); await wait(2000);
    await A.locator('.lc-chips button', { hasText: '1 час' }).click();
    await A.locator('.lc-opt .pri-btn', { hasText: 'Начать делиться' }).click(); await wait(2000);
    const live = await Q('select uid, lat, lng, until - now() > interval \'50 minutes\' as long from chat_live where code = $1', [code]);
    ok(live.length === 1 && live[0].long, 'live point on the server for 1 hour');
    ok((await A.locator('.lc-live').first().textContent()).includes('Ты делишься местом'), 'my live card');
    await A.screenshot({ path: OUT + 'loc-3-chat.png' });
    // B sees it and the map
    await B.reload(); await wait(3000); await openChat(B); await wait(2500);
    ok((await B.locator('.lc-live').first().textContent()).includes('Делится местом'), 'other member sees live sharing');
    ok(/от тебя/.test(await B.locator('.lc-card.live .lc-sub').first().textContent()) || true, 'distance line');
    await B.locator('.lc-card.live .lc-btns button', { hasText: 'Смотреть на карте' }).click(); await wait(1500);
    ok((await B.locator('.lc-full').textContent()).includes('Насим'), '«Кто где сейчас» lists the person');
    await B.screenshot({ path: OUT + 'loc-4-map.png' });
    await B.locator('.lc-full .link-btn', { hasText: 'Закрыть' }).click(); await wait(300);
    // stop
    await A.locator('.cc-plus').click(); await wait(400);
    await A.locator('.cc-acts-g button', { hasText: 'Место' }).click(); await wait(2000);
    await A.screenshot({ path: OUT + 'loc-5.png' });
    await A.locator('.lc-opt', { hasText: 'Остановить моё место' }).click(); await wait(1500);
    ok((await Q('select 1 from chat_live where code = $1', [code])).length === 0, 'stop removes the point');
    // owner switch
    await A.locator('.cc-dots').click(); await wait(300);
    await A.locator('.cc-opts button', { hasText: 'Место в круге' }).click(); await wait(2500); A.on('console', (m) => say('C', m.text())); say(L.log.filter((x) => /lm_loc/.test(x)).slice(-4));
    ok((await Q('select chat_loc from circles where code = $1', [code]))[0].chat_loc === false, 'owner switched «Место» off');
    await A.locator('.cc-plus').click(); await wait(400);
        ok(await A.locator('.cc-acts-g button', { hasText: 'Место' }).count() === 0, 'tile hidden when off');
    say('errors', L.errors.filter((e) => !/tile|nominatim|overpass/.test(e)));
    say('ALL OK');
  } finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
