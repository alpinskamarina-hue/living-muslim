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
    const B = await L.phone(br, 'B'); await signup(B, 'Рустам Галиев', 'rustam@test.dev'); await join(B, code);
    const C = await L.phone(br, 'C'); await signup(C, 'Аиша', 'aisha@test.dev'); await join(C, code);
    const uidC = JSON.parse(await ls(C, 'lm.cloud')).uid;
    const uidB = JSON.parse(await ls(B, 'lm.cloud')).uid;
    await Q(`update users set gender = 'f' where uid = $1`, [uidC]);
    await Q(`update users set gender = 'm' where uid <> $1`, [uidC]);
    say('members:', await Q('select count(*)::int n from members where code = $1', [code]));

    // B: Profile → «Что я сейчас ищу» → Работа
    await B.reload(); await wait(3000);
    await nav(B, 'Профиль');
    await B.locator('.menu-row', { hasText: 'Что я сейчас ищу' }).click(); await wait(1500);
    await B.locator('.sk-city input').fill('Казань'); await B.locator('.sk-city input').blur(); await wait(500);
    await B.locator('.sk-row', { hasText: 'Работа' }).locator('.sk-sw').click(); await wait(400);
    const ins = B.locator('.sk-ed input');
    await ins.nth(0).fill('дизайнер интерфейсов'); await ins.nth(1).fill('4 года опыта, удалённо или Казань');
    await shot(B, 'pp-1-seek-edit');
    await B.locator('.sk-ed .pri-btn').click(); await wait(1500);
    await B.locator('.sk-row', { hasText: 'Бизнес' }).locator('.sk-sw').click(); await wait(300);
    await B.locator('.sk-chips button', { hasText: 'Ищу партнёра' }).click();
    await B.locator('.sk-ed input').nth(0).fill('Халяль-кофейня в Казани');
    await B.locator('.sk-ed input').nth(1).fill('Нужен партнёр с опытом в общепите');
    await B.locator('.sk-ed .pri-btn').click(); await wait(1500);
    // Учёба: switch on with no words at all, then just close
    await B.locator('.sk-row', { hasText: 'Учёба' }).locator('.sk-sw').click(); await wait(1200);
    await B.locator('.sk-ed .link-btn').click(); await wait(800);
    const stOn = await B.locator('.sk-row', { hasText: 'Учёба' }).locator('.sk-sw').getAttribute('aria-checked');
    if (stOn !== 'true') throw new Error('study switch did not stay on: ' + stOn);
    await shot(B, 'pp-2-seek-saved');
    const st = await Q(`select mode, title from intents where kind = 'study'`);
    if (!st.length) throw new Error('study intent not saved');
    say('intents:', await Q('select kind, mode, title, vis from intents order by kind'));
    say('in events:', await Q(`select body, ref from chat_msgs where ref->>'t' = 'in'`));

    // A: chat card → profile → ask
    await A.reload(); await wait(3000); await openChat(A);
    await A.evaluate(() => window.scrollTo(0, 99999)); await wait(500);
    await shot(A, 'pp-3-chat-card');
    await A.locator('.cc-in-card button', { hasText: 'Открыть профиль' }).first().click(); await wait(1500);
    await shot(A, 'pp-4-profile');
    say('A sees tags:', await A.locator('.pp-tag').allInnerTexts());
    await A.locator('.pp-it.i-j .go').click(); await wait(400);
    await shot(A, 'pp-5-ask');
    await A.locator('.pp-ask .pri-btn').click(); await wait(1200);
    say('A msg:', await A.locator('.pp-msg').innerText().catch(() => ''));
    say('asks:', await Q('select kind, status, left(note, 40) note from person_asks'));
    await A.goBack(); await wait(800);
    say('A after back still in chat:', await A.locator('.wa-head').count());

    // A opens the sister's profile from the status rings
    await A.goBack(); await wait(1200);
    await A.locator('.wa-status button', { hasText: 'Аиша' }).click(); await wait(1500);
    say('sister: write buttons', await A.locator('.pp-btns button', { hasText: 'Написать' }).count(), 'lock:', await A.locator('.pp-lock').count());
    await shot(A, 'pp-6-sister');
    const r = await Q(`select lm_ask($1, 'x', $2, 'hi', 'test') r`, [JSON.parse(await ls(A, 'lm.cloud')).uid, uidC]);
    say('ask to sister without token:', r[0].r);
    await A.goBack(); await wait(800);

    // B answers → chat of two opens
    say('ask to B:', await Q('select to_uid = $1 ok from person_asks', [uidB]));
    await nav(B, 'Круг'); await wait(2500);
    await B.locator('.wa-asks').waitFor({ timeout: 10000 }).catch(() => {});
    if (await B.locator('.wa-asks').count()) { await B.evaluate(() => window.scrollTo(0, 0)); await shot(B, 'pp-7a-banner'); await B.locator('.wa-asks').click(); await wait(1500); }
    await shot(B, 'pp-7-asks');
    await B.locator('.ak .pri-btn').waitFor({ timeout: 10000 });
    await B.locator('.ak .pri-btn').click(); await wait(4000);
    await shot(B, 'pp-8-dm');
    say('B chat title:', await B.locator('.wa-ht b').innerText().catch(() => ''));
    const dm = await Q(`select code from person_asks where status = 'yes'`);
    say('dm members:', await Q('select uid, title, kind from members where code = $1', [dm[0].code]));
    say('dm first msg:', await Q('select body, ref from chat_msgs where code = $1', [dm[0].code]));

    // A: the chat shows up in the list
    await A.reload(); await wait(3000); await nav(A, 'Круг'); await wait(3000);
    say('A rows:', await A.locator('.wa-row b').allInnerTexts());
    await shot(A, 'pp-9-list');
    // A: «Кто что ищет»
    await A.locator('.wa-seek').click(); await wait(1500);
    await shot(A, 'pp-10-feed');
    say('feed:', await A.locator('.if-card b').allInnerTexts());
    // B's profile now shows «Чат» instead of «Написать»
    await A.locator('.if-card').first().click(); await wait(1500);
    say('A btns on B:', await A.locator('.pp-btns button').allInnerTexts());
    say('errors', L.errors.slice(0, 5));
  } catch (e) { console.error('FAIL', e.message.split('\n')[0], L.errors.slice(-8)); process.exitCode = 1; }
  finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})();
