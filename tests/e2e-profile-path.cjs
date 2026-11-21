// «Путь» in the profile and message requests with a topic (supabase/profile-path.sql).
// Run: local Postgres lmtest with supabase/*.sql incl. intents.sql and profile-path.sql, npm run build, then node tests/e2e-profile-path.cjs
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5192';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const ok = (c, m) => { if (!c) throw new Error(m); say('✓', m); };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE'); };

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
const idOf = async (pg) => JSON.parse(await ls(pg, 'lm.cloud'));

(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' and tablename <> 'lm_config' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5192);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Ильгиз', 'ilgiz@test.dev');
    await nav(A, 'Круг');
    await A.locator('button', { hasText: 'Братья' }).first().click();
    const t = A.locator('input[placeholder^="Например"]'); if (await t.count()) await t.fill('Братья');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = (await idOf(A)).circle;
    const B = await L.phone(br, 'B'); await signup(B, 'Рустам Галиев', 'rustam@test.dev'); await join(B, code);
    const D = await L.phone(br, 'D'); await signup(D, 'Тимур', 'timur@test.dev');
    const a = await idOf(A), b = await idOf(B), d = await idOf(D);
    await Q(`update users set gender = 'm'`);

    // B: a month of good things on the phone → the summary goes to the server
    await B.evaluate(({ days }) => {
      const s = JSON.parse(localStorage.getItem('qadam.v1'));
      s.prayers = s.prayers || {}; s.log = s.log || {};
      const h = { id: 'hq', action: 'Читать Коран 5 минут', min: '1 аят', anchor: 'fajr', sphere: 'deen', status: 'active', createdAt: days[20] };
      s.habits = [...(s.habits || []), h];
      days.forEach((dd, i) => {
        if (i < 12) s.prayers[dd] = { fajr: 'ontime', dhuhr: 'ontime', asr: i % 3 ? 'ontime' : 'late', maghrib: 'ontime', isha: 'ontime' };
        if (i < 9) s.log[dd] = { ...(s.log[dd] || {}), hq: 'done' };
      });
      s.courseAr = { ...(s.courseAr || {}), day: 6, learned: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] };
      s.sadaqa = { ...(s.sadaqa || {}), days: { [days[0]]: 1, [days[1]]: 1 } };
      localStorage.setItem('qadam.v1', JSON.stringify(s));
      localStorage.removeItem('lm.pathAt'); localStorage.removeItem('lm.pathSent');
    }, { days: [...Array(25)].map((_, i) => day(i)) });
    await B.reload(); await wait(7000);
    const pb = (await Q('select path from users where uid = $1', [b.uid]))[0].path;
    say('B path:', JSON.stringify(pb).slice(0, 300));
    ok(pb.prayer && pb.prayer.fajr >= 2 && pb.habits?.[0]?.run >= 8 && pb.study?.length && pb.deeds?.sadaqa, 'summary uploaded from the phone');

    // A (same circle) opens B's profile: prayer, habits, study, deeds
    await A.reload(); await wait(3000); await nav(A, 'Круг'); await wait(2000);
    await A.locator('.wa-status button', { hasText: 'Рустам' }).click(); await wait(2000);
    await A.locator('.pa').waitFor({ timeout: 6000 });
    const secA = await A.locator('.pa-sec .pa-t b').allInnerTexts();
    say('A sees:', secA);
    ok(secA.length === 4, 'circle-mate sees 4 blocks (goals hidden by default)');
    await A.locator('.pa').scrollIntoViewIfNeeded(); await shot(A, 'pa-1-path');
    await A.goBack(); await wait(800);

    // D (no shared circle, B findable by nick) sees only «Изучает»
    await Q(`update users set nick = 'rustam', findable = true where uid = $1`, [b.uid]);
    const pd = (await Q(`select lm_path($1, $2, $3) r`, [d.uid, d.token, b.uid]))[0].r;
    say('D sees:', Object.keys(pd.path));
    ok(Object.keys(pd.path).join() === 'study', 'stranger sees only studies by default');

    // B: «Что видят другие» → habits for nobody, ask only from circles
    await nav(B, 'Профиль');
    await B.locator('.pf-btns button', { hasText: 'Как видят другие' }).click(); await wait(2000);
    await shot(B, 'pa-2-self');
    await B.locator('.pa-h .link-btn').click(); await wait(1500);
    await B.locator('.pa-vis', { hasText: 'Привычки' }).locator('button', { hasText: 'Никто' }).click(); await wait(800);
    await B.locator('.pa-card', { hasText: 'Кто может попросить' }).locator('button', { hasText: 'Круги' }).click(); await wait(800);
    await shot(B, 'pa-3-settings', true);
    const vis = (await Q('select path_vis, ask_from from users where uid = $1', [b.uid]))[0];
    say('B vis:', vis);
    ok(vis.path_vis.habits === 'none' && vis.ask_from === 'circles', 'visibility saved');
    const pa2 = (await Q(`select lm_path($1, $2, $3) r`, [a.uid, a.token, b.uid]))[0].r;
    ok(!pa2.path.habits && pa2.path.prayer, 'habits hidden from the circle now');
    const dAsk = (await Q(`select lm_ask($1, $2, $3, 'meet', 'Ассаляму алейкум, хочу познакомиться') r`, [d.uid, d.token, b.uid]))[0].r;
    ok(dAsk === 'circles', 'stranger cannot ask when only circles may: ' + dAsk);
    await B.goBack(); await wait(600); await B.goBack(); await wait(600);

    // A: «Написать» → topic + text → request
    await A.locator('.wa-status button', { hasText: 'Рустам' }).click(); await wait(2000);
    await A.locator('.pp-btns button', { hasText: 'Написать' }).click(); await wait(500);
    const send = A.locator('.pp-topic .gold-btn');
    ok(await send.isDisabled(), 'send is off without a topic');
    await A.locator('.pp-why button', { hasText: 'Учиться вместе' }).click();
    await A.locator('.pp-topic textarea').fill('Коротко');
    ok(await send.isDisabled(), 'send is off with a short text');
    await A.locator('.pp-topic textarea').fill('Ассаляму алейкум! Видел, ты учишь арабский по дням. Давай вместе, по 15 минут после Иши?');
    await shot(A, 'pa-4-topic');
    await send.click(); await wait(1500);
    say('A msg:', await A.locator('.pp-msg').innerText().catch(() => ''));
    const asks = await Q('select kind, status from person_asks');
    ok(asks.length === 1 && asks[0].kind === 'learn', 'request saved with its topic');
    ok((await Q('select count(*)::int n from members m join members m2 on m2.code = m.code where m.uid = $1 and m2.uid = $2', [a.uid, b.uid]))[0].n === 1, 'no chat of two before B accepts');
    await Q(`insert into lm_config(key, val) values ('push_secret', 'test-secret') on conflict (key) do update set val = excluded.val`);
    const push = (await Q(`select lm_ask_push('test-secret') r`))[0].r;
    say('push rows:', push.length, '(B has no push sub in this test)');
    await A.goBack(); await wait(600);

    // B: Today line → «Просят написать» → card with the topic → «Не сейчас» → A cannot ask again for 30 days
    await nav(B, 'Сегодня'); await B.reload(); await wait(4000);
    const line = B.locator('.circle-line.support', { hasText: 'просит написать тебе' });
    ok(await line.count(), 'Today shows the request line');
    await line.dispatchEvent('click'); await wait(2500);
    await B.locator('#lm-asks').waitFor({ timeout: 6000 });
    await shot(B, 'pa-5-asks');
    ok((await B.locator('.ak-topic').innerText()).includes('Учиться вместе'), 'request card shows the topic');
    ok((await B.locator('.ak-ctx').innerText()).includes('Братья'), 'request card shows the shared circle');
    await B.locator('.ak .link-btn', { hasText: 'Не сейчас' }).click(); await wait(1500);
    const again = (await Q(`select status from person_asks`)).map((x) => x.status).join();
    const later = (await Q(`select lm_ask($1, $2, $3, 'question', 'Ещё один вопрос про арабский') r`, [a.uid, a.token, b.uid]))[0].r;
    ok(later === 'later', 'after «Не сейчас» the same person waits 30 days: ' + later + ' ' + again);

    // accept path: let A ask again (answered long ago), B accepts → chat of two
    await Q(`update person_asks set answered = now() - interval '31 days'`);
    ok((await Q(`select lm_ask($1, $2, $3, 'question', 'Брат, вопрос про умру из Казани') r`, [a.uid, a.token, b.uid]))[0].r === 'ok', 'A can ask again after 30 days');
    await nav(B, 'Сегодня'); await B.reload(); await wait(4000);
    await B.locator('.circle-line.support', { hasText: 'просит написать тебе' }).dispatchEvent('click'); await wait(2500);
    await B.locator('.ak .pri-btn', { hasText: 'Принять и ответить' }).click(); await wait(4000);
    await shot(B, 'pa-6-dm');
    const dm = await Q(`select code from person_asks where status = 'yes'`);
    ok(dm.length === 1 && dm[0].code, 'accept opens a chat of two');

    // report: D in a circle with B asks, B reports → blocked
    await Q(`update users set ask_from = 'all' where uid = $1`, [b.uid]);
    ok((await Q(`select lm_ask($1, $2, $3, 'other', 'Купи у меня курс, скидка 90 процентов') r`, [d.uid, d.token, b.uid]))[0].r === 'ok', 'stranger can ask when «Все»');
    const id = (await Q(`select id from person_asks where from_uid = $1`, [d.uid]))[0].id;
    ok((await Q(`select lm_ask_report($1, $2, $3) r`, [b.uid, b.token, id]))[0].r === true, 'report works');
    ok((await Q(`select lm_ask($1, $2, $3, 'meet', 'Ну пожалуйста, ответь мне брат') r`, [d.uid, d.token, b.uid]))[0].r === 'closed', 'reported sender is blocked');
    say('errors', L.errors.slice(0, 5));
    say('ALL OK');
  } catch (e) { console.error('FAIL', e.message.split('\n')[0], L.errors.slice(-8)); process.exitCode = 1; }
  finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})();
