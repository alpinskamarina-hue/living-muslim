// «Ищут людей»: an amir opens his umrah trip, a stranger sees only the public card, asks to join, the amir writes back
// and accepts, the stranger gets the circle invite and the trip call. Needs supabase/umrah-open.sql in lmtest.
// Run: npm run build, then node tests/e2e-umrah-open.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5194';
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
  await pg.locator('.cl-kinds button', { hasText: 'Братья' }).first().click();
  const t = pg.locator('input[placeholder^="Например"]'); if (await t.count()) await t.first().fill(title);
  await pg.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
}
const group = async (pg) => { await pg.goto(BASE + '/app/?umrah=group'); await wait(3500); };

(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('lm_admins', 'lm_config') loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  await L.db.query(`insert into lm_config(key, val) values ('push_secret', 'test-secret') on conflict (key) do update set val = excluded.val`);
  const srv = L.server(5194);
  const br = await L.chromium.launch();
  try {
    // A (Ильгиз) gathers «Умра с братьями» in his circle, with Дамир going.
    const A = await L.phone(br, 'A');
    await signup(A, 'Ильгиз Хасанов', 'ilgiz@test.dev');
    await newCircle(A, 'Братья');
    await group(A);
    await A.locator('button', { hasText: 'Собрать поездку на умру' }).click(); await wait(300);
    await A.locator('.join input').first().fill('Умра с братьями');
    await A.locator('.join input').nth(1).fill('декабрь 2026');
    await A.locator('.join .pri-btn').click(); await wait(2500);
    await L.q(`update users set nick = 'ilgiz_nl' where name like 'Ильгиз%'`);

    // 1. The amir opens the group: 2 places, brothers, a note.
    await group(A);
    const tripSeg = A.locator('.um-gseg button', { hasText: /Поездка/ });
    if (await tripSeg.count()) { await tripSeg.first().click(); await wait(800); }
    check(await A.locator('.uo-open').count() > 0, `amir sees «Ищем людей»: ${await txt(A, '.uo-open-h')}`);
    await A.locator('.uo-places button', { hasText: '2' }).click();
    await A.locator('.uo-who button', { hasText: 'Братья' }).click();
    await A.locator('.uo-open textarea').fill('Билеты берём вместе в начале месяца, отель рядом с Харамом');
    await A.locator('.uo-sw').click(); await wait(1500);
    await shot(A, 'uo-1-amir-open');
    const op = await L.q(`select places, who, note from umrah_open`);
    check(op.length === 1 && op[0].places === 2 && op[0].who === 'brothers', `listing stored: ${JSON.stringify(op)}`);

    // 2. A stranger (Тимур) finds it in «Ищут людей» and sees only the public card.
    const B = await L.phone(br, 'B');
    await signup(B, 'Тимур', 'timur@test.dev');
    await L.q(`update users set nick = 'timur_nl' where name = 'Тимур'`);
    await B.goto(BASE + '/app/?umrah'); await wait(3000);
    check(await B.locator('.um-card', { hasText: 'Группы на умру' }).count() > 0, 'a person without a trip sees «Группы на умру» on «Сейчас»');
    await B.locator('.um-card', { hasText: 'Группы на умру' }).click(); await wait(2500);
    const card = await txt(B, '.uo-card');
    say('   card:', card);
    check(/Умра с братьями/.test(card) && /нужно ещё 2/.test(card) && /амир Ильгиз/.test(card) && /едут 1 из 3/.test(card), 'the card: title, places, amir first name, how many go');
    check(!/Хасанов|ilgiz_nl/.test(await B.locator('main, .um-app').first().innerText()), 'no surname and no nick of the amir for strangers');
    await shot(B, 'uo-2-list');
    await B.locator('.uo-card .uo-ask').click(); await wait(500);
    await B.locator('.uo-sheet textarea').fill('Ассаляму алейкум! Первая умра, лечу из Утрехта');
    await shot(B, 'uo-3-ask-sheet');
    await B.locator('.uo-sheet .gold-btn').click(); await wait(2000);
    check(/Просьба отправлена/.test(await txt(B, '.uo')), `request sent: ${await txt(B, '.uo-msg')}`);
    const ak = await L.q(`select status, note from umrah_asks`);
    check(ak.length === 1 && ak[0].status === 'pending', `request stored: ${JSON.stringify(ak)}`);

    // push job: the amir's phone would get «Тимур просится»
    const amirUid = (await L.q(`select uid from users where name like 'Ильгиз%'`))[0].uid;
    await L.q(`insert into push_subs(endpoint, p256dh, auth, uid) values ('https://push.test/a', 'k', 'a', '${amirUid}') on conflict do nothing`);
    const pu = await L.q(`select lm_umrah_push('test-secret') j`);
    check(JSON.stringify(pu[0].j).includes('"k":"ask"') && JSON.stringify(pu[0].j).includes('Тимур'), `push for the amir: ${JSON.stringify(pu[0].j).slice(0, 160)}`);
    const pu2 = await L.q(`select lm_umrah_push('test-secret') j`);
    check(JSON.stringify(pu2[0].j) === '[]', 'the push is sent once');

    // 3. The amir sees it on Today and on the tab, writes back, then accepts.
    await A.goto(BASE + '/app/'); await wait(4000);
    check(/Тимур просится в твою поездку/.test(await A.locator('main').innerText()), 'Today line for the amir');
    check(await A.locator('nav.nav button', { hasText: 'Умра' }).locator('.nav-badge').count() > 0, 'a number on the «Умра» tab');
    await shot(A, 'uo-4-amir-today');
    await A.locator('nav.nav button', { hasText: 'Умра' }).click(); await wait(3000);
    check(await A.locator('.uo-askc').count() > 0, `request card: ${await txt(A, '.uo-askc')}`);
    await shot(A, 'uo-5-amir-request');
    await A.locator('.uo-askc .ghost-btn', { hasText: 'Написать' }).click();
    await A.locator('.uo-write textarea').fill('Ва алейкум ассалям! Когда берёшь билет?');
    await A.locator('.uo-write .pri-btn').click(); await wait(1500);
    check((await L.q(`select reply from umrah_asks`))[0].reply.startsWith('Ва алейкум'), 'reply stored');
    await group(B);
    await B.locator('.uo-seg button', { hasText: 'Ищут людей' }).click(); await wait(2000);
    check(/Когда берёшь билет/.test(await txt(B, '.uo-card')), 'the person sees the reply');
    await nav(A, 'Умра').catch(() => {});
    await A.goto(BASE + '/app/'); await wait(3000);
    await A.locator('nav.nav button', { hasText: 'Умра' }).click(); await wait(3000);
    await A.locator('.uo-askc .gold-btn', { hasText: 'Принять' }).click(); await wait(2500);
    check(/получит приглашение/.test(await txt(A, '.uo-asks')), `accepted: ${await txt(A, '.uo-asks')}`);
    check((await L.q(`select status from invites`)).some((r) => r.status === 'pending'), 'circle invite sent');
    check((await L.q(`select places from umrah_open`))[0].places === 1, 'one place taken');
    check((await L.q(`select data from docs where coll = 'reacts'`)).some((r) => Object.keys(r.data).some((k) => k.startsWith('u:'))), 'the trip call is stored');
    const pu3 = await L.q(`select lm_umrah_push('test-secret') j`);
    say('   push after answers:', JSON.stringify(pu3[0].j).slice(0, 200));

    // 4. Тимур: the card says accepted, Today has the circle invite, joining shows the trip call.
    await group(B);
    await B.locator('.uo-seg button', { hasText: 'Ищут людей' }).click(); await wait(2000);
    say('   B list after accept:', await txt(B, '.uo'));
    await B.goto(BASE + '/app/'); await wait(3000);
    check(/зовёт тебя в круг/.test(await B.locator('main').innerText()), 'Today shows the circle invite');
    await nav(B, 'Круг'); await wait(1500);
    await B.locator('button', { hasText: /^Вступить$|Вступить/ }).first().click(); await wait(4500);
    check(await B.locator('.um-call').count() > 0, `after joining the trip strip shows: ${await txt(B, '.um-call')}`);
    await shot(B, 'uo-6-joined');

    // 5. Privacy: sisters' groups are hidden from brothers; closing hides the group.
    await L.q(`update umrah_open set who = 'sisters'`);
    await L.q(`update users set gender = 'm' where name = 'Тимур'`);
    const C = await L.phone(br, 'C');
    await signup(C, 'Рамиль', 'ramil@test.dev');
    await L.q(`update users set gender = 'm' where name = 'Рамиль'`);
    const listC = await L.q(`select lm_umrah_open_list(uid, 'x') j from users where name = 'Рамиль'`);
    say('   (direct call with a wrong token):', JSON.stringify(listC[0].j));
    await group(C);
    const segC = C.locator('.uo-seg button', { hasText: 'Ищут людей' });
    if (await segC.count()) { await segC.click(); await wait(2000); }
    check(!/Умра с братьями/.test(await C.locator('.um-app').innerText()), 'a sisters group is hidden from a brother');
    await L.q(`update umrah_open set who = 'brothers'`);
    await group(C); if (await segC.count()) { await segC.click(); await wait(2000); }
    check(/Умра с братьями/.test(await C.locator('.um-app').innerText()), 'a brothers group shows to a brother');
    await group(A);
    const tripSegA = A.locator('.um-gseg button', { hasText: /Поездка/ });
    if (await tripSegA.count()) { await tripSegA.first().click(); await wait(800); }
    await A.locator('.uo-sw').click(); await wait(1500);
    check((await L.q(`select count(*)::int n from umrah_open`))[0].n === 0, 'the amir closed the group');
  } finally {
    say('errors:', L.errors.filter((e) => !/favicon/.test(e)).slice(0, 10));
    say(fails ? `FAILED: ${fails}` : 'ALL OK');
    await br.close(); srv.close(); await L.db.end();
  }
})();
