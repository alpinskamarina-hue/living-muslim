// Run: local Postgres lmtest with supabase/*.sql incl. stories.sql, npm run build, then node tests/e2e-stories.cjs
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
const shot = (pg, n) => pg.screenshot({ path: OUT + n + '.png' });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };

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
// back to the list of circles (the circle may open its chat)
async function toList(pg) {
  await nav(pg, 'Круг'); await wait(1500);
  for (let i = 0; i < 6 && !(await pg.locator('.st-strip').count()); i++) {
    const b = pg.locator('.wa-back');
    if (await b.count()) await b.first().click();
    await wait(1500);
  }
}
process.on('unhandledRejection', (e) => console.error('UNH', e));
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
    const B = await L.phone(br, 'B'); await signup(B, 'Рустам', 'rustam@test.dev'); await join(B, code);

    // A: the strip is there, «Моя» with a plus
    await toList(A); await A.locator('.st-strip').waitFor({ timeout: 8000 }).catch(async () => { await shot(A, 'st-0-fail'); });
    ok(await A.locator('.st-strip .st-p').count() >= 2, 'strip shows me and the brother');
    await shot(A, 'st-1-strip');
    // A: a text story
    await A.locator('.st-plus').click(); await wait(800);
    ok(await A.locator('.st-new').count() === 1, 'create screen opens');
    await A.locator('.st-types button', { hasText: 'Текст' }).click();
    await A.locator('textarea.st-input').fill('Братья, кто завтра на Фаджр в мечеть?');
    await A.locator('.st-bgs .bg-night').click();
    await shot(A, 'st-2-create-text');
    await A.locator('.st-go').click(); await wait(2500);
    ok(await A.locator('.st-new').count() === 0, 'story shared, create screen closed');
    ok((await Q(`select count(*)::int n from stories`))[0].n === 1, 'story saved');
    // A: an ayah story too
    await A.locator('.st-plus').click(); await wait(800);
    await A.locator('.st-types button', { hasText: 'Аят' }).click(); await wait(300);
    await A.locator('.st-input').fill('Аят дня');
    await shot(A, 'st-3-create-ayah');
    await A.locator('.st-go').click(); await wait(2500);
    // A: a photo story
    const png = Buffer.from(await A.evaluate(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 800); gr.addColorStop(0, '#e8b46a'); gr.addColorStop(1, '#3c2414'); g.fillStyle = gr; g.fillRect(0, 0, 600, 800); g.fillStyle = '#2b1a10'; g.beginPath(); g.arc(300, 800, 200, Math.PI, 0); g.fill(); g.fillRect(90, 420, 30, 380); g.fillRect(480, 420, 30, 380); g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(300, 260, 70, 0, 7); g.fill(); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    await A.locator('.st-plus').click(); await wait(800);
    await A.locator('.st-new input[type=file]').setInputFiles({ name: 'maghrib.png', mimeType: 'image/png', buffer: png });
    await A.locator('.st-types button', { hasText: 'Фото' }).click(); await wait(800);
    await A.locator('.st-input').fill('Магриб в Аль-Фатх 🕌');
    await shot(A, 'st-4-create-photo');
    await A.locator('.st-go').click(); await wait(2500);
    ok((await Q(`select count(*)::int n from story_photos`))[0].n === 1, 'photo saved');

    // B: sees a gold ring for A, opens it
    await toList(B); await wait(1500);
    await B.reload(); await wait(3000); await toList(B); await wait(2500);
    ok(await B.locator('.st-ring.new').count() >= 1, 'brother sees a new story ring');
    await shot(B, 'st-5-strip-new');
    await B.locator('.st-p', { has: B.locator('.st-ring.new') }).first().click(); await wait(1200);
    ok(await B.locator('.st-view').count() === 1, 'viewer opens');
    await shot(B, 'st-6-view-text');
    await B.locator('.st-reac button', { hasText: 'Амин' }).click(); await wait(1500);
    const m = await Q(`select body, ref from chat_msgs order by id desc limit 1`);
    say('chat:', m[0]);
    ok(m[0] && m[0].ref && m[0].ref.t === 'st' && /Амин/.test(m[0].body), 'answer went to the circle chat');
    ok((await Q(`select react from story_views where react is not null`)).length === 1, 'answer saved on the story');
    await B.locator('.st-stage').click({ position: { x: 300, y: 200 } }); await wait(1200);
    await shot(B, 'st-7-view-ayah');
    await B.locator('.st-stage').click({ position: { x: 300, y: 200 } }); await wait(2500);
    await shot(B, 'st-8-view-photo');
    ok(await B.locator('.st-card.photo').count() === 1, 'photo story shows');
    await B.locator('.st-rep input').fill('МашаАллах, красиво!');
    await B.locator('.st-rep button').click(); await wait(1500);
    ok((await Q(`select count(*)::int n from chat_msgs where ref->>'t' = 'st'`))[0].n === 2, 'text answer went to chat');
    await B.locator('.st-who button[aria-label="Закрыть"]').click(); await wait(1000);
    ok(await B.locator('.st-view').count() === 0, 'viewer closes');
    ok(await B.locator('.st-ring.seen').count() >= 1, 'ring turns seen');
    // B: the answer quote in the chat
    await B.locator('.wa-row').first().click(); await wait(2500);
    ok(await B.locator('.cc-st').count() >= 1, 'chat shows the story quote');
    await shot(B, 'st-9-chat');

    // A: own story, who saw it
    await A.reload(); await wait(3000); await toList(A); await wait(2000);
    await A.locator('.st-p').first().click(); await wait(1000);
    await A.locator('.st-views', { hasText: 'Посмотрели' }).click(); await wait(1500);
    const vt = await A.locator('.st-vlist').textContent();
    say('viewers:', vt);
    ok(/Рустам/.test(vt) && /Амин/.test(vt), 'author sees who watched and answered');
    await shot(A, 'st-10-viewers');
    A.answers.push(true);
    await A.locator('.st-acts button', { hasText: 'Удалить' }).click(); await wait(1500);
    ok((await Q(`select count(*)::int n from stories`))[0].n === 2, 'author deleted a story');
    say('errors', L.errors);
    ok(!L.errors.filter((e) => !/lm_chat_ai|lm_guides|net::/.test(e)).length, 'no page errors');
  } finally { await br.close(); srv.close(); await su.end(); await L.db.end(); }
})().catch((e) => { console.error('FAIL', e.stack); console.error(L.log.slice(-15).join('\n')); process.exit(1); });
