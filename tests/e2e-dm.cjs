// «Личные» in Circles (supabase/dm.sql): the tab, «✎ Написать» from a circle, rules, mute, report, block,
// a brother's practical request to a sister, settings, and the list on a second phone.
// Run: local Postgres lmtest with supabase/*.sql incl. profile-path.sql, open-circles.sql and dm.sql, npm run build, then node tests/e2e-dm.cjs
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5193';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n) => pg.screenshot({ path: OUT + n + '.png' });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(1200); };
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
async function join(pg, code) {
  await pg.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers`); await wait(2500);
  await nav(pg, 'Круг');
  const j = pg.locator('button', { hasText: /Вступить|Присоединиться/ });
  if (await j.count()) { await j.first().click(); await wait(2500); }
}
const idOf = async (pg) => JSON.parse(await ls(pg, 'lm.cloud'));
const toList = async (pg) => { await nav(pg, 'Круг'); const b = pg.locator('.wa-back'); if (await b.count()) { await b.first().click(); await wait(1200); } else { const l = pg.locator('button', { hasText: '← Круги' }); if (await l.count()) { await l.first().click(); await wait(1200); } } };
const tabDm = async (pg) => { await toList(pg); await pg.locator('.oc-seg button', { hasText: 'Личные' }).click(); await wait(1500); };

(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' and tablename <> 'lm_config' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5193);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Ильгиз', 'ilgiz@test.dev');
    await nav(A, 'Круг');
    const own = A.locator('.oc-seg button', { hasText: 'Создать свой' }); if (await own.count()) { await own.click(); await wait(500); }
    await A.locator('.cl-kinds button', { hasText: 'Братья' }).first().click();
    const t = A.locator('.cl-name input'); if (await t.count()) await t.fill('Фаджр');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = (await idOf(A)).circle;
    const B = await L.phone(br, 'B'); await signup(B, 'Рустам', 'rustam@test.dev'); await join(B, code);
    const S = await L.phone(br, 'S'); await signup(S, 'Зайнаб', 'zaynab@test.dev');
    const a = await idOf(A), b = await idOf(B), s = await idOf(S);
    await Q(`update users set gender = 'm', created = now() - interval '3 days'`);
    await Q(`update users set gender = 'f' where uid = $1`, [s.uid]);
    // the sister is in another (mixed) circle with A
    await Q(`insert into circles(code, owner) values ('mixed001', $1)`, [a.uid]);
    await Q(`insert into members(code, uid, title, kind) values ('mixed001', $1, 'Умра в марте', 'other'), ('mixed001', $2, 'Умра в марте', 'other')`, [a.uid, s.uid]);

    // A: the «Личные» tab, empty, then «✎ Написать»
    await A.reload(); await wait(3000);
    await tabDm(A);
    ok(await A.locator('.dm-empty').count() === 1, 'empty «Личные» explains what to do');
    await shot(A, 'dm-1-empty');
    await A.locator('.dm-fab').click(); await wait(2500);
    const rowB = A.locator('.dm-new .dm-row', { hasText: 'Рустам' });
    ok((await rowB.innerText()).includes('Написать'), 'brother of my circle: «Написать» at once');
    ok((await A.locator('.dm-new .dm-row', { hasText: 'Зайнаб' }).innerText()).includes('Просьба'), 'sister: only a request');
    await shot(A, 'dm-2-new');
    await rowB.click(); await wait(4000);
    ok(await A.locator('.dm-head').count() === 1, 'the chat opens with the DM header');
    ok((await A.locator('.dm-head small').innerText()).includes('Круг «'), 'header says where we know each other from');
    ok(await A.locator('.oc-chatnote').count() === 1, 'note: private, links after the reply');
    const dm = (await Q('select * from dms'))[0];
    ok(dm && dm.a === a.uid && dm.b === b.uid && dm.src.startsWith('c:'), 'server marks the chat of two');
    const box = A.locator('.cc-compose textarea, .cc-compose input[type=text]').first();
    await box.fill('Ассаляму алейкум, брат! Завтра на Фаджр в мечеть?'); await box.press('Enter'); await wait(2500);
    await box.fill('Смотри https://spam.example.com'); await box.press('Enter'); await wait(2500);
    ok((await A.locator('.cc-note').innerText().catch(() => '')).includes('после первого ответа'), 'a link before the first reply is refused with a clear note');
    ok((await Q(`select count(*)::int n from chat_msgs where code = $1`, [dm.code]))[0].n === 1, 'only the first message is on the server');
    await shot(A, 'dm-3-chat');

    // B: sees it in «Личные» with an unread number; the chat is not among the circles
    await B.reload(); await wait(3000);
    await toList(B);
    ok(await B.locator('.wa-rows .wa-row', { hasText: 'Ильгиз' }).count() === 0, '«Мои» has no chats of two');
    const seg = await B.locator('.oc-seg button', { hasText: 'Личные' }).innerText();
    ok(/1/.test(seg), '«Личные» shows the unread number');
    await tabDm(B);
    await shot(B, 'dm-4-list');
    await B.locator('.dm-row', { hasText: 'Ильгиз' }).click(); await wait(3500);
    const boxB = B.locator('.cc-compose textarea, .cc-compose input[type=text]').first();
    await boxB.fill('Ва алейкум ассалям! ИншаАллах, иду'); await boxB.press('Enter'); await wait(2500);
    // now A may send a link
    await A.reload(); await wait(3500);
    await tabDm(A); await A.locator('.dm-row', { hasText: 'Рустам' }).click(); await wait(3500);
    const boxA = A.locator('.cc-compose textarea, .cc-compose input[type=text]').first();
    await boxA.fill('Расписание: https://masjid.example.org'); await boxA.press('Enter'); await wait(2500);
    ok((await Q(`select count(*)::int n from chat_msgs where code = $1 and uid = $2`, [dm.code, a.uid]))[0].n === 2, 'after the reply a link goes through');

    // B: mute, then report and block
    await B.locator('.dm-head .wa-hbtn').click(); await wait(500);
    await shot(B, 'dm-5-menu');
    await B.locator('.dm-menu button', { hasText: 'Без звука' }).click(); await wait(1500);
    ok((await Q(`select muted from dm_prefs where uid = $1`, [b.uid]))[0]?.muted === true, 'mute is saved');
    // two earlier reports from other people: B's makes three
    const third = (await Q(`insert into users(token_hash, name) values ('x', 'Третий') returning uid`))[0].uid;
    await Q(`insert into dm_reports(code, by_uid, who) values ($1, $2, $3), ($1, $4, $3)`, [dm.code, s.uid, a.uid, third]);
    await B.locator('.dm-head .wa-hbtn').click(); await wait(500);
    await B.locator('.dm-menu button', { hasText: 'Пожаловаться' }).click(); await wait(500);
    await B.locator('.dm-ck', { hasText: 'Спам' }).click();
    await shot(B, 'dm-6-report');
    await B.locator('.dm-red').click(); await wait(2500);
    const rep = (await Q('select * from dm_reports where by_uid = $1', [b.uid]))[0];
    ok(rep && rep.by_uid === b.uid && rep.who === a.uid && rep.msgs.length === 3 && rep.reason.includes('Спам'), 'report has the reason and the last messages');
    ok((await Q(`select count(*)::int n from blocks where uid = $1 and other = $2`, [b.uid, a.uid]))[0].n === 1, 'report with «И заблокировать» blocks');
    await boxA.fill('Брат?'); await boxA.press('Enter'); await wait(2500);
    const nA = await A.locator('.cc-note').innerText().catch(() => 'none'); say('A note:', nA);
    ok(/заблокировал|закрыты/.test(nA), 'blocked: A cannot write');

    ok((await Q(`select dm_locked from users where uid = $1`, [a.uid]))[0].dm_locked === true, '3 reports from different people close the DMs');
    await Q(`update users set dm_locked = false where uid = $1`, [a.uid]);

    // A → the sister: only «Написать по делу», topics without «Познакомиться»
    await A.evaluate((uid) => window.dispatchEvent(new CustomEvent('lm-person', { detail: { uid } })), s.uid); await wait(3000);
    const btn = A.locator('.pp-btns button', { hasText: 'Написать по делу' });
    ok(await btn.count() === 1, 'a brother sees «Написать по делу» for a sister');
    await btn.click(); await wait(800);
    const topics = await A.locator('.pp-why button').allInnerTexts();
    ok(!topics.some((x) => x.includes('Познакомиться')) && topics.some((x) => x.includes('Умра')), 'only practical topics');
    await shot(A, 'dm-7-sister');
    await A.locator('.pp-why button', { hasText: 'Умра' }).click();
    await A.locator('.pp-topic textarea').fill('Ассаляму алейкум, сестра. Мы с женой тоже едем в марте, можем вместе взять гида?');
    await A.locator('.pp-topic .gold-btn').click(); await wait(2000);
    ok((await Q(`select count(*)::int n from person_asks where from_uid = $1 and to_uid = $2 and kind = 'umrah'`, [a.uid, s.uid]))[0].n === 1, 'the request reaches the sister');
    // S accepts in «Личные» (she is in the mixed circle on her phone too)
    await S.goto(`${BASE}/app/?c=mixed001&n=${encodeURIComponent('Умра в марте')}&k=other`); await wait(3000);
    await nav(S, 'Круг'); { const j = S.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } }
    await toList(S); await shot(S, 'dm-8-before'); say('S circles:', (await idOf(S)).circles?.length);
    await tabDm(S);
    await shot(S, 'dm-8-asks');
    await S.locator('.ak .pri-btn', { hasText: 'Принять' }).click(); await wait(4500);
    ok(await S.locator('.dm-head').count() === 1, 'accepting opens the private chat');
    ok((await S.locator('.dm-head small').innerText()).includes('Просьба'), 'header: from a request');
    ok((await Q(`select count(*)::int n from dms where src = 'a:umrah'`))[0].n === 1, 'the accepted chat is marked as «Личные»');
    // the sister turns off practical requests from brothers: now nothing
    await Q(`update users set dm_bro = false where uid = $1`, [s.uid]);
    ok((await Q(`select public._lm_can_ask($1, $2, 'question') r`, [b.uid, s.uid]))[0].r === 'sister', 'sister can turn off requests from brothers');

    // settings page
    await nav(B, 'Профиль'); await wait(1000);
    await B.locator('.menu-row', { hasText: 'Личные сообщения' }).click(); await wait(2000);
    await B.locator('.dm-opt', { hasText: 'Сначала просьба' }).click(); await wait(1500);
    ok((await Q(`select dm_circles from users where uid = $1`, [b.uid]))[0].dm_circles === 'ask', '«Кто может мне писать» saves');
    await B.locator('.dm-blk').click(); await wait(1500);
    ok(await B.locator('.dm-bl', { hasText: 'Ильгиз' }).count() === 1, 'blocked list shows A');
    await shot(B, 'dm-9-settings');
    await B.locator('.dm-bl button').click(); await wait(1500);
    ok((await Q(`select count(*)::int n from blocks where uid = $1`, [b.uid]))[0].n === 0, 'unblock works');

    // a newcomer can't open DMs during the first day
    await Q(`update users set created = now() where uid = $1`, [a.uid]);
    ok((await Q(`select public._lm_dm_mode($1, $2) r`, [a.uid, b.uid]))[0].r !== 'direct', 'newcomer: no direct DM in the first day');
    await Q(`update users set created = now() - interval '3 days' where uid = $1`, [a.uid]);

    // A on a second phone: the chats are in «Личные», not among circles
    const A2 = await L.phone(br, 'A2');
    await signup(A2, 'Ильгиз', 'ilgiz@test.dev');
    await tabDm(A2);
    const names = await A2.locator('.dm-row').allInnerTexts();
    say('A2 «Личные»:', names.map((x) => x.split('\n')[0]));
    ok(names.some((x) => x.includes('Рустам')) && names.some((x) => x.includes('Зайнаб')), 'a second phone shows both chats in «Личные»');
    await A2.locator('.oc-seg button', { hasText: 'Мои' }).click(); await wait(1000);
    ok(await A2.locator('.wa-rows .wa-row', { hasText: 'Рустам' }).count() === 0, 'second phone: not mixed into «Мои»');
    await shot(A2, 'dm-10-phone2');

    const bad = L.errors.filter((e) => !/rpc lm_chat_send: dm_|rpc lm_chat_send: .*dm_/.test(e) && !/status of 400/.test(e));
    if (bad.length) { say('ERRORS:\n' + bad.join('\n')); throw new Error('errors in the run'); }
    say('ALL OK');
  } catch (e) {
    say('FAIL', e.message); say(L.log.slice(-25).join('\n')); say(L.errors.slice(-10).join('\n'));
    process.exitCode = 1;
  } finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})();
