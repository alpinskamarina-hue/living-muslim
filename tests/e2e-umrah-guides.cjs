// «Люди → Гиды»: a guide applies in 5 steps, the owner checks it in «Для владельца», a pilgrim finds the guide,
// calls him into the trip, the guide accepts, and the pilgrim leaves a review.
// Run like e2e-chat.cjs (local Postgres lmtest with supabase/*.sql), then node tests/e2e-umrah-guides.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5194';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const flat = (x) => x.replace(/\n+/g, ' | ');
const shot = (pg, n, full = true) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(700); };
const unav = async (pg, t) => { await pg.locator('nav.um-nav button', { hasText: t }).click(); await wait(900); };
let fails = 0;
const check = (ok, what) => { if (!ok) { fails++; say('✗ FAIL', what); } else say('✓', what); };

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
async function guides(pg) {
  await pg.goto(BASE + '/app/?umrah'); await wait(2500);
  await unav(pg, 'Люди'); await wait(800);
  await pg.locator('.uo-seg button', { hasText: 'Гиды' }).click(); await wait(1500);
}

(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  await L.db.query(`insert into lm_admins(email) values ('owner@test.dev') on conflict do nothing`);
  const srv = L.server(5194);
  const br = await L.chromium.launch();
  try {
    // 1. The guide applies.
    const G = await L.phone(br, 'G');
    await signup(G, 'Абдуррахман', 'guide@test.dev');
    // entry from Profile → «Что я сейчас ищу»
    await nav(G, 'Профиль');
    await G.locator('button', { hasText: 'Что я сейчас ищу' }).first().click(); await wait(1500);
    check(await G.locator('.sk-guide').count() === 1, 'Profile «Что я ищу» has «Я гид по умре»');
    await shot(G, 'gd-0-profile-entry');
    await G.locator('.sk-guide').click(); await wait(3000);
    check(await G.locator('.ug-steps').count() === 1, '«Я гид» opens the application');
    await guides(G);
    say('empty list:', flat(await G.locator('.ug').innerText()).slice(0, 200));
    await G.locator('.ug-become').click(); await wait(600);
    check(await G.locator('.ug-steps button').count() === 5, '5 application steps');
    check(await G.locator('.ug-kc').count() === 2, 'step 1: guide on site or mentor');
    await G.locator('.ug-kc', { hasText: 'Гид на месте' }).click();
    await shot(G, 'gd-1-apply-kind');
    await G.locator('.ug-next').click(); await wait(300);
    await G.locator('.ug-f input').first().fill('Абдуррахман');
    await G.locator('.uo-chips button', { hasText: 'AR' }).click();
    await G.locator('.ug-f textarea').fill('Провожу умру с 2014 года, объясняю каждый шаг. Звоните +7 917 123-45-67 или guide@mail.ru');
    await G.locator('.ug-next').click(); await wait(300);
    await G.locator('.ug-f input').nth(0).fill('Исламский университет Медины');
    await G.locator('.ug-f input').nth(1).fill('шариат');
    await G.locator('.ug-f input').nth(2).fill('2016');
    await G.locator('.ug-f input').nth(3).fill('12');
    await G.locator('.ug-f input').nth(4).fill('140');
    await G.locator('.ug-next').click(); await wait(300);
    await G.locator('.uo-chips button', { hasText: 'Живу в Медине' }).click();
    await G.locator('.ug-f input').nth(0).fill('20 марта 2027');
    await G.locator('.ug-f input').nth(1).fill('1–10 февраля · 15–25 марта');
    await G.locator('.ug-svc input').nth(0).fill('Сопровождение обрядов умры');
    await G.locator('.ug-svc input').nth(1).fill('40');
    await G.locator('.link-btn', { hasText: 'Ещё услуга' }).click();
    await G.locator('.ug-svc input').nth(3).fill('Зиярат по Медине');
    await G.locator('.ug-svc input').nth(4).fill('30');
    await G.locator('.ug-next').click(); await wait(300);
    await G.locator('.ug-file input[type=file]').first().setInputFiles(OUT + 'mp-0-start.png'); await wait(1200);
    check(await G.locator('.ug-next').isDisabled(), 'send is off without the KSA licence and the two ticks');
    await G.locator('.ug-file input[type=file]').nth(1).setInputFiles(OUT + 'mp-1-path.png'); await wait(1200);
    await G.locator('.ug-f input:not([type=file])').nth(0).fill('03.2027');
    await G.locator('.ug-f input:not([type=file])').last().fill('имам мечети «Марджани», Казань');
    await G.locator('.ug-cb input').nth(0).check();
    check(await G.locator('.ug-next').isDisabled(), 'send is still off with one tick');
    await G.locator('.ug-cb .link-btn', { hasText: 'Условия' }).click(); await wait(200);
    check(await G.locator('ol.ug-terms li').count() === 10, 'the 10 terms open in place');
    await G.locator('.ug-cb input').nth(1).check();
    await shot(G, 'gd-2-apply-check');
    await G.locator('.ug-next').click(); await wait(2500);
    say('after send:', flat(await G.locator('.ug').innerText()).slice(0, 200));
    check(await G.locator('.ug-mine').count() === 1 && (await G.locator('.ug-mine').innerText()).includes('на проверке'), 'my guide card says «на проверке»');
    const row = (await L.db.query(`select status, kind, lic_until, terms_at is not null t, consent_at is not null c, diploma_photo is not null d, license_photo is not null l, services from umrah_guides`)).rows[0];
    say('db:', row.status, row.d, row.l, JSON.stringify(row.services));
    check(row.status === 'pending' && row.kind === 'guide' && row.lic_until === '03.2027' && row.t && row.c && row.d && row.l && row.services.length === 2, 'application saved: kind, licence date, both ticks, photos, 2 services');

    // 2. A pilgrim does not see the pending guide.
    const S = await L.phone(br, 'S');
    await signup(S, 'Саид', 'said@test.dev');
    await guides(S);
    check(await S.locator('.ug-card').count() === 0, 'pending guide is hidden');

    // 3. The owner checks it in «Для владельца» → «Гиды».
    const O = await L.phone(br, 'O');
    await signup(O, 'Насим', 'owner@test.dev');
    await nav(O, 'Профиль');
    await O.locator('.adm-entry').click(); await wait(800);
    await O.locator('button', { hasText: '🧭 Гиды' }).click(); await wait(1500);
    say('admin:', flat(await O.locator('.adm-rep').innerText()).slice(0, 300));
    check(await O.locator('.adm-ph img').count() === 2, 'owner sees diploma and licence photos');
    check(await O.locator('.adm-act .pri-btn').isDisabled(), 'approve is off until the diploma tick');
    await O.locator('label.chk', { hasText: 'Диплом' }).click();
    check(await O.locator('.adm-act .pri-btn').isDisabled(), 'a guide on site needs the licence tick too');
    await O.locator('label.chk', { hasText: 'Лицензия' }).click();
    await O.locator('label.chk', { hasText: 'Рекомендацию' }).click();
    await shot(O, 'gd-3-admin');
    await O.locator('.adm-act .pri-btn').click(); await wait(1500);
    const r2 = (await L.db.query(`select status, diploma_photo is null d, license_photo is null l, checks from umrah_guides`)).rows[0];
    say('after decide:', r2);
    check(r2.status === 'ok' && r2.d && r2.l && r2.checks.diploma, 'approved, photos deleted, ticks kept');

    // 4. The pilgrim finds and calls the guide.
    await guides(S);
    const cards = await S.locator('.ug-card').allInnerTexts();
    say('cards:', cards.map(flat));
    check(cards.length === 1 && cards[0].includes('Медине') && cards[0].includes('€40'), 'guide listed with place and price');
    await S.locator('.ug-chips button', { hasText: 'Наставник' }).click(); await wait(300);
    check(await S.locator('.ug-card').count() === 0, 'filter «Наставник» hides a guide on site');
    await S.locator('.ug-chips button', { hasText: 'Гид на месте' }).click(); await wait(300);
    check(await S.locator('.ug-card').count() === 1, 'filter «Гид на месте» shows him');
    await shot(S, 'gd-4-list');
    await S.locator('.ug-card').first().click(); await wait(1500);
    const prof = await S.locator('.ug-prof').innerText();
    say('profile:', flat(prof).slice(0, 400));
    check(prof.includes('Документы проверены') && prof.includes('Перед тем как договориться') && prof.includes('Свободен'), 'profile: badge, warning, free dates');
    await S.locator('.ug-prof .ug-vb').click(); await wait(300);
    const ver = await S.locator('.ug-ver').innerText();
    say('ver:', flat(ver));
    check(ver.includes('03.2027') && ver.includes('не гарантия') && /\d{4}/.test(ver), 'badge shows what and when was checked, licence date, «не гарантия»');
    check(await S.locator('.ug-revf').count() === 0, 'no review form before the guide accepts');
    await shot(S, 'gd-5-profile');
    await S.locator('.ug-act .pri-btn', { hasText: 'Позвать в поездку' }).click(); await wait(300);
    check(await S.locator('.ug-prof .pri-btn', { hasText: 'Понятно' }).count() === 1, 'warning before the first contact');
    await shot(S, 'gd-5b-warning');
    await S.locator('.ug-prof .pri-btn', { hasText: 'Понятно' }).click(); await wait(300);
    await S.locator('.ug-ask textarea').fill('Едем в феврале, нас 4 брата');
    await S.locator('.ug-ask .pri-btn').click(); await wait(1500);
    say('msg:', await S.locator('.uo-msg').innerText().catch(() => '-'));
    check((await S.locator('.ug-act').innerText()).includes('отправлено'), 'call sent');

    // 5. The guide accepts.
    await guides(G);
    say('guide sees:', flat(await G.locator('.ug-mine').innerText()));
    check(await G.locator('.ug-call').count() === 1, 'guide sees the call');
    await shot(G, 'gd-6-call');
    await G.locator('.ug-call .gold-btn').click(); await wait(1500);
    check((await G.locator('.ug-mine').innerText()).includes('ты принял'), 'guide accepted');

    // 6. The pilgrim leaves a review.
    await guides(S);
    await S.locator('.ug-card').first().click(); await wait(1500);
    check(await S.locator('.ug-revf').count() === 1, 'review form after accept');
    await S.locator('.ug-revf textarea').fill('Объяснил каждый шаг тавафа. Ни минуты суеты. Пишите ему wa.me/79171234567');
    await S.locator('.ug-revf .pri-btn').click(); await wait(1500);
    const p2 = await S.locator('.ug-prof').innerText();
    check(p2.includes('★ 5') && p2.includes('Объяснил'), 'review shown with stars');
    check(!/917|mail\.ru|wa\.me/.test(p2) && p2.includes('•••') && p2.includes('2014'), 'phones, email and WhatsApp links hidden, years kept');
    await shot(S, 'gd-7-review');
    await S.locator('.ug-rep').click(); await wait(200);
    await S.locator('.ug-ask textarea').last().fill('Просил прислать паспорт заранее');
    await S.locator('.ug-ask .pri-btn', { hasText: 'Отправить жалобу' }).click(); await wait(1200);
    check((await S.locator('.ug-prof').innerText()).includes('Жалоба отправлена'), 'report sent');
    await O.reload(); await wait(2500); await nav(O, 'Профиль');
    await O.locator('.adm-entry').click(); await wait(800);
    await O.locator('button', { hasText: '🧭 Гиды' }).click(); await wait(1500);
    const rp = await O.locator('.adm-rep').innerText();
    check(rp.includes('Жалобы на гидов: 1') && rp.includes('паспорт'), 'owner sees the report');
    await shot(O, 'gd-8-report');
    await O.locator('.adm-act .pri-btn', { hasText: 'Скрыть гида' }).click(); await wait(1200);
    const r3 = (await L.db.query(`select status from umrah_guides`)).rows[0];
    check(r3.status === 'no', '«Скрыть гида» takes him out of the list');

    // 7. «Найти гида» on the path step.
    await S.goto(BASE + '/app/?umrah'); await wait(2500);
    await unav(S, 'Путь');
    const st = S.locator('.mp-start button', { hasText: 'Еду один' });
    if (await st.count()) { await st.click(); await wait(800); }
    await S.locator('.mp-tl button', { hasText: 'Собраться' }).click(); await wait(1500);
    check(await S.locator('.um-card', { hasText: 'Найти гида' }).count() === 1, '«Найти гида» card in the gather step');
    await S.locator('.um-card', { hasText: 'Найти гида' }).click(); await wait(1500);
    check(await S.locator('.ug').count() === 1, 'it opens the guides');
  } finally {
    say('errors:', L.errors.slice(0, 10));
    say(fails ? `${fails} checks failed` : 'all checks passed');
    await br.close(); srv.close(); await L.db.end();
  }
})();
