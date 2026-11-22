// Run: local Postgres lmtest with supabase/*.sql incl. startup.sql and chat-transcribe.sql, npm run build, then node tests/e2e-transcribe.cjs
// /api/transcribe is replaced by a stub that saves a fixed text through lm_chat_tr_save (the real one calls AI Gateway).
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
const openChat = async (pg) => { await nav(pg, 'Круг'); await wait(1500); const r = pg.locator('.wa-row'); if (await r.count()) { await r.first().click(); await wait(1500); } };
async function signup(pg, name, email) {
  await pg.goto(BASE + '/');
  const f = pg.locator('.js-signup').first();
  await f.locator('input[name=name]').fill(name); await f.locator('input[name=email]').fill(email);
  await f.locator('button[type=submit]').click();
  await f.locator('input[name=code]').waitFor({ timeout: 5000 }); await f.locator('input[name=code]').fill(L.CODE);
  await f.locator('button[type=submit]').click(); await pg.waitForURL('**/app/**', { timeout: 8000 }); await wait(2500);
}
const TEXT = { 'Насим': 'Ассаламу алейкум. На этой неделе сделал лендинг и поговорил с пятью семьями. Застрял на курьерах: никто не знает про халяль. Нужен контакт владельца кафе в Роттердаме, если у кого есть, напишите. Это длинный текст, чтобы проверить сворачивание расшифровки под голосовым сообщением.', 'Дамир': 'Сделал меню из трёх кухонь. Нужна помощь с ценами доставки.' };
async function stub(pg) {
  let sums = 0;
  await pg.route('**/api/transcribe', async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.mode === 'sum') { sums++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Насим: сделал лендинг · застрял на курьерах · нужен контакт кафе\nДамир: сделал меню · нужно помочь с ценами\nКоманде: Дамир, посмотри цены вместе с Насимом в субботу.' }) }); }
    const who = (await Q('select u.name from chat_msgs m join users u on u.uid = m.uid where m.id = $1', [b.id]))[0]?.name;
    const msg = (await Q(`select lm_chat_tr_save((select val from lm_config where key = 'push_secret'), $1, $2) j`, [b.id, TEXT[who] || '']))[0].j;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: msg.body, msg }) });
  });
  return () => sums;
}
(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('lm_admins', 'lm_config') loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  await Q(`insert into lm_config(key, val) values ('push_secret', 's3') on conflict (key) do update set val = 's3'`);
  const srv = L.server(5191);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A'); await stub(A);
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    await A.locator('.cl-kinds button', { hasText: 'Стартап' }).click(); await wait(300);
    await A.locator('.cl-name input').fill('Доставка');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;
    const B = await L.phone(br, 'B'); await signup(B, 'Дамир', 'damir@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=x&k=startup`); await wait(2500); await nav(B, 'Круг');
    { const j = B.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } }
    // two voice minutes last Thursday
    const ids = {};
    for (const nm of ['Насим', 'Дамир']) {
      const r = await Q(`with u as (select uid from users where name = $2), m as (insert into chat_msgs(code, uid, kind, sec, bars, created)
        select $1, uid, 'voice', 42, '[3,5,7,4,6,8,5,3,6,7,4,5,6,3,5,7,8,6,4,5]'::jsonb, (date_trunc('week', now() - interval '1 day') + interval '3 days 14 hours') from u returning id)
        insert into chat_voice(id, mime, data) select id, 'audio/webm', decode(repeat('AA', 400), 'hex') from m returning id`, [code, nm]);
      ids[nm] = r[0].id;
    }
    await A.reload(); await wait(3000); await openChat(A); await wait(2000);
    const btn = A.locator('.cc-tr-btn');
    ok(await btn.count() === 2, '«Расшифровать» under both voice messages');
    await A.screenshot({ path: OUT + 'tr-1-chat.png' });
    await btn.first().click(); await wait(2000);
    ok(await A.locator('.cc-tr').count() === 1, 'transcript shown under the voice message');
    ok(await A.locator('.cc-tr.cut').count() === 0 && (await A.locator('.cc-tr-more').textContent()) === 'свернуть', 'fresh transcript opened in full');
    await A.locator('.cc-tr-more').click(); await wait(300);
    ok(await A.locator('.cc-tr.cut').count() === 1 && (await A.locator('.cc-tr-more').textContent()) === 'читать дальше', 'long transcript folds to 3 lines');
    const saved = (await Q('select body from chat_msgs where id = $1', [ids['Насим']]))[0].body;
    ok(saved.startsWith('Ассаламу'), 'text saved into the message');
    await A.screenshot({ path: OUT + 'tr-2-text.png' });
    // B sees the text without transcribing again
    await B.reload(); await wait(3000); await openChat(B); await wait(2000);
    ok((await B.locator('.cc-tr').first().textContent()).startsWith('Ассаламу'), 'other member sees the saved text');
    ok(await B.locator('.cc-tr-btn').count() === 1, 'only the untranscribed one still has the button');
    // demo day summary
    await A.locator('.bw-tabs button', { hasText: 'Путь' }).click(); await wait(1500);
    const demo = A.locator('.su-demo');
    ok((await demo.textContent()).includes('записали минуту'), 'demo-day card counts the voices');
    await demo.locator('.link-btn', { hasText: 'Итог демо-дня' }).click(); await wait(3000);
    ok((await demo.locator('.su-sum').textContent()).includes('Команде'), 'summary shown on the card');
    ok((await Q('select body from chat_msgs where id = $1', [ids['Дамир']]))[0].body.startsWith('Сделал меню'), 'the remaining voice got transcribed for the summary');
    await demo.screenshot({ path: OUT + 'tr-3-demo.png' });
    ok((await Q('select n from chat_tr_use'))[0] === undefined || true, 'usage table reachable');
    say('ALL OK');
  } finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
