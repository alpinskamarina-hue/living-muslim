// The call to an umrah trip reaches the person: by nick for someone already in the circle (even with another circle open),
// by nick for someone not in the circle yet (circle invite first), and by link (the invite screen).
// Run like e2e-umrah-app.cjs: local Postgres lmtest with the supabase/*.sql, npm run build, then node tests/e2e-umrah-invite.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5193';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const txt = (pg, sel) => pg.locator(sel).first().innerText().then((x) => x.replace(/\n+/g, ' | ')).catch(() => '—');
let fails = 0;
const check = (ok, what) => { say(ok ? '  ✓' : '  ✗', what); if (!ok) fails++; };

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
async function newCircle(pg, title) {
  await nav(pg, 'Круг');
  const add = pg.locator('button', { hasText: /\+ Новый|Новый круг/ });
  if (await add.count()) { await add.first().click(); await wait(600); }
  await pg.locator('button', { hasText: 'Братья' }).first().click();
  const t = pg.locator('input[placeholder^="Например"]'); if (await t.count()) await t.fill(title);
  await pg.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
  return JSON.parse(await pg.evaluate(() => localStorage.getItem('lm.cloud'))).circle;
}
// From the umrah screen: «Позвать» → by nick → pick the person → call.
async function callByNick(A, nick, who) {
  await A.goto(BASE + '/app/?umrah'); await wait(3000);
  await A.locator('.um-av.add').click(); await wait(500);
  await A.locator('.um-nick').click(); await wait(2000);
  if (!(await A.locator('.nk-hit', { hasText: who }).count())) { await A.locator('.nk-search input').fill(nick.slice(0, 4)); await wait(1500); }
  await A.locator('.nk-hit', { hasText: who }).first().click(); await wait(600);
  await A.locator('.nk-card .pri-btn').click(); await wait(2000);
  return txt(A, '.nk-card');
}

(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5193);
  const br = await L.chromium.launch();
  try {
    // A (Насим) gathers a trip in the circle «Братья».
    const A = await L.phone(br, 'A');
    await signup(A, 'Насим', 'nasim@test.dev');
    const code = await newCircle(A, 'Братья');
    await A.goto(BASE + '/app/?umrah'); await wait(2500);
    await A.locator('.um-nav button', { hasText: 'Группа' }).click(); await wait(900);
    await A.locator('button', { hasText: 'Собрать поездку на умру' }).click(); await wait(300);
    await A.locator('.join input').first().fill('Умра с братьями');
    await A.locator('.join input').nth(1).fill('декабрь 2026');
    await A.locator('.join .pri-btn').click(); await wait(2500);
    say('trip saved:', (await L.q(`select data->>'title' t from docs where coll = 'umrahTrip'`)).map((r) => r.t));

    // 1. Дамир: in «Братья» (joined by a plain circle link), but his own circle «Семья» is the open one.
    const B = await L.phone(br, 'B');
    await signup(B, 'Дамир', 'damir@test.dev');
    const fam = await newCircle(B, 'Семья');
    await B.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers`); await wait(2500);
    const jb = B.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await jb.count()) { await jb.first().click(); await wait(3000); }
    // his own circle is the open one again
    await B.evaluate((f) => { const c = JSON.parse(localStorage.getItem('lm.cloud')); c.circle = f; localStorage.setItem('lm.cloud', JSON.stringify(c)); }, fam);
    say('B circles:', await B.evaluate(() => JSON.parse(localStorage.getItem('lm.cloud')).circles.map((c) => c.title).join(', ')));
    await L.q(`update users set nick = 'damir' where name = 'Дамир'`);
    say('1) member with another circle open');
    say('   A after call:', await callByNick(A, 'damir', 'Дамир'));
    const calls = await L.q(`select data from docs where coll = 'reacts'`);
    check(calls.some((r) => Object.keys(r.data).some((k) => k.startsWith('u:'))), 'the personal call is stored');
    const ev = await L.q(`select body, ref from chat_msgs where ref ? 'um'`);
    check(ev.length === 1, `one invitation line in the circle chat: ${ev.map((x) => x.body).join(' / ')}`);
    // a second tap the same day keeps the call (it used to toggle it off)
    await A.locator('.nk-card .pri-btn').click().catch(() => {}); await wait(1200);
    check((await L.q(`select data from docs where coll = 'reacts'`)).some((r) => Object.keys(r.data).some((k) => k.startsWith('u:'))), 'still called after a second tap');

    await B.goto(BASE + '/app/'); await wait(3000);
    await nav(B, 'Круг'); await wait(1200);
    say('   B circles list:', await txt(B, '.wa-list, .cl-list, main'));
    await shot(B, 'ui-1-list');
    await B.locator('.wa-row', { hasText: 'Братья' }).first().click(); await wait(3500);
    check(await B.locator('.um-call').count() > 0, `strip on top of the chat: ${await txt(B, '.um-call')}`);
    check(await B.locator('.cc-um').count() > 0, `card in the chat: ${await txt(B, '.cc-um')}`);
    await shot(B, 'ui-2-chat');
    await nav(B, 'Сегодня'); await wait(1000);
    const todayTxt = await B.locator('main').innerText();
    check(/зовёт тебя на умру/.test(todayTxt), 'a line on Today');
    await shot(B, 'ui-3-today');
    await nav(B, 'Круг'); await wait(1500);
    if (await B.locator('.wa-row').count()) { await B.locator('.wa-row', { hasText: 'Братья' }).first().click(); await wait(3000); }
    await B.locator('.um-call').click(); await wait(2000);
    check(await B.locator('.um-app').count() > 0, `the trip opens: ${await txt(B, '.um-app h1')}`);
    await shot(B, 'ui-4-trip');
    const go = B.locator('.um-app button', { hasText: /^Еду$|Еду/ });
    say('   B buttons:', (await B.locator('.um-app button').allInnerTexts()).slice(0, 25).join(' · ').replace(/\n/g, ' '));
    if (await go.count()) { await go.first().click(); await wait(2500); }
    const rs = await L.q(`select d.data from docs d join users u on u.uid = d.key where d.coll = 'umrahRsvp' and u.name = 'Дамир'`);
    check(rs.some((r) => Object.values(r.data).some((x) => x.s === 'go')), 'Дамир answered «Еду»');
    await B.goto(BASE + '/app/'); await wait(3000);
    check(!/зовёт тебя на умру/.test(await B.locator('main').innerText()), 'the Today line is gone after the answer');
    await A.goto(BASE + '/app/?umrah'); await wait(3000);
    check((await A.locator('.um-av small').allInnerTexts()).some((x) => /Дамир/.test(x)), `A sees him in the group: ${(await A.locator('.um-av small').allInnerTexts()).join(', ')}`);

    // 2. Ильдар: not in the circle. A calls by nick: circle invite first, then the trip.
    const C = await L.phone(br, 'C');
    await signup(C, 'Ильдар', 'ildar@test.dev');
    await L.q(`update users set nick = 'ildar' where name = 'Ильдар'`);
    say('2) not in the circle yet');
    say('   A after call:', await callByNick(A, 'ildar', 'Ильдар'));
    check((await L.q(`select status from invites`)).some((r) => r.status === 'pending'), 'circle invite sent');
    await C.goto(BASE + '/app/'); await wait(3000);
    check(/зовёт тебя в круг/.test(await C.locator('main').innerText()), 'Today shows the circle invite');
    await nav(C, 'Круг'); await wait(1500);
    await shot(C, 'ui-5-inbox');
    await C.locator('button', { hasText: /^Вступить$|Вступить/ }).first().click(); await wait(4500);
    check(await C.locator('.um-call').count() > 0, `after joining the strip shows: ${await txt(C, '.um-call')}`);
    await shot(C, 'ui-6-joined');

    // 3. By link, a phone with no account: the invite screen says it is umrah and offers to sign in first.
    const D = await L.phone(br, 'D');
    await D.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers&umrah=group`); await wait(3000);
    const dTxt = await D.locator('main').innerText().catch(() => D.locator('body').innerText());
    say('3) link without account:', dTxt.slice(0, 300).replace(/\n+/g, ' | '));
    check(/зовут на умру/.test(dTxt) && /Войти по почте/.test(dTxt), 'invite screen names the umrah and offers email sign-in');
    await shot(D, 'ui-7-link');
    // 4. A new user makes an umrah circle: «Умра» is a circle kind, the trip is made and «Позвать» opens at once.
    const E = await L.phone(br, 'E');
    await signup(E, 'Рустам', 'rustam@test.dev');
    await nav(E, 'Круг');
    const kinds = await E.locator('.cl-kinds button').allInnerTexts();
    check(/Умра/.test(kinds[0] || ''), `«Умра» is the first circle kind: ${kinds.map((x) => x.replace(/\n/g, ' ')).join(' · ')}`);
    await E.locator('.cl-kinds button', { hasText: 'Умра' }).click(); await wait(300);
    await shot(E, 'ui-8-kind');
    await E.locator('input[placeholder^="Например: Умра"]').fill('Умра весной');
    await E.locator('input[placeholder^="Например: март"]').fill('март 2027');
    await E.locator('button', { hasText: 'Собрать поездку' }).click(); await wait(6000);
    const tr = await L.q(`select d.data->>'title' t, d.data->>'month' m from docs d join users u on u.uid = d.key where d.coll = 'umrahTrip' and u.name = 'Рустам'`);
    check(tr.length === 1 && tr[0].t === 'Умра весной' && tr[0].m === 'март 2027', `trip made: ${JSON.stringify(tr)}`);
    check(await E.locator('.um-app').count() > 0 && await E.locator('.um-sheet').count() > 0, `umrah screen with «Позвать в поездку»: ${await txt(E, '.um-sheet')}`);
    await shot(E, 'ui-9-new-umrah');
  } finally {
    say('errors:', L.errors.filter((e) => !/favicon/.test(e)).slice(0, 10));
    say(fails ? `FAILED: ${fails}` : 'ALL OK');
    await br.close(); srv.close(); await L.db.end();
  }
})();
