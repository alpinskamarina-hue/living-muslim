// Open circles and the common circle: a brother opens his circle, a newcomer finds it in «Найти круг», asks,
// the owner accepts, the newcomer joins and sees the 24-hour note; a sister does not see the brothers' circle;
// the common circle: a juz of the month, an anonymous dua request with «Амин». Needs supabase/open-circles.sql in lmtest.
// Run: npm run build, then LM_DIST=$PWD/dist node tests/e2e-open-circles.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const PORT = 5197, BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(1200); };
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
  for (const t of ['Пропустить', 'Не сейчас', 'Позже']) { const b = pg.locator('button', { hasText: t }); if (await b.count()) await b.first().click().catch(() => {}); }
}

(async () => {
  await L.db.connect();
  const srv = L.server(PORT);
  const br = await L.chromium.launch();
  try {
    // 1. Brother A creates a circle and opens it
    const A = await L.phone(br, 'A');
    await signup(A, 'Абдулла', 'a-open@test.lm');
    await nav(A, 'Круг');
    await shot(A, 'oc-01-newcomer-find');
    check(await A.locator('.oc-common').count() === 1, 'newcomer sees the common circle card');
    check(await A.locator('.oc-gender').count() === 1, 'newcomer is asked brother or sister');
    await A.locator('.oc-seg button', { hasText: 'Создать свой' }).click(); await wait(500);
    await A.locator('.cl-kinds button', { hasText: 'Братья' }).first().click();
    await A.locator('.cl-name input').fill('Фаджр в мечети');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(3500);
    if (!(await A.locator('#oc-own').count())) { await A.locator('[aria-label="Данные круга"]').first().click(); await wait(1500); }
    check(await A.locator('#oc-own').count() === 1, 'owner sees «Открытый круг» in circle info');
    await A.locator('#oc-own .uo-sw').click(); await wait(400);
    if (await A.locator('#oc-own .oc-gender button', { hasText: 'Я брат' }).count()) { await A.locator('#oc-own .oc-gender button', { hasText: 'Я брат' }).click(); await wait(1500); }
    await A.locator('#oc-own textarea').fill('Держимся вместе, чтобы вставать на Фаджр в мечеть.');
    await A.locator('#oc-own input[placeholder^="Например"]').fill('Без споров о мазхабах и политики');
    await A.locator('#oc-own input[placeholder^="пусто"]').fill('Роттердам');
    await shot(A, 'oc-02-owner-settings', true);
    await A.locator('#oc-own button', { hasText: 'Открыть круг' }).click(); await wait(1500);
    const st = await A.locator('#oc-own .uo-msg').innerText().catch(() => '');
    check(/Круг открыт/.test(st), 'circle opened: ' + st);
    check(await A.locator('.ps-solo, .ps-ctabs').count() === 0, 'no posts in a «Братья» circle');

    // 2. Newcomer brother B finds it
    const B = await L.phone(br, 'B');
    await signup(B, 'Юсуф', 'b-open@test.lm');
    await nav(B, 'Круг');
    await B.locator('.oc-gender button', { hasText: 'Я брат' }).click(); await wait(1500);
    await shot(B, 'oc-03-catalog-brother');
    check(await B.locator('.oc-item', { hasText: 'Фаджр в мечети' }).count() === 1, 'brother sees the open circle');
    await B.locator('.oc-item', { hasText: 'Фаджр в мечети' }).click(); await wait(1500);
    await shot(B, 'oc-04-preview', true);
    check(/Без споров/.test(await B.locator('.oc-page').innerText()), 'preview shows rules');
    await B.locator('.oc-cta textarea').fill('Хочу вставать на Фаджр с братьями');
    await B.locator('.oc-cta button', { hasText: 'Попроситься' }).click(); await wait(1500);
    check(/Просьба отправлена/.test(await B.locator('.oc-page').innerText()), 'request sent');

    // 3. A sister does not see the brothers' circle
    const S = await L.phone(br, 'S');
    await signup(S, 'Амина', 's-open@test.lm');
    await nav(S, 'Круг');
    await S.locator('.oc-gender button', { hasText: 'Я сестра' }).click(); await wait(1500);
    await shot(S, 'oc-05-catalog-sister');
    check(await S.locator('.oc-item', { hasText: 'Фаджр в мечети' }).count() === 0, 'sister does not see the brothers circle');

    // 4. Owner accepts
    await A.reload(); await wait(3000);
    await nav(A, 'Круг');
    check(await A.locator('.oc-pend').count() === 1, 'owner sees «просится» on the list');
    await A.locator('.oc-pend').click(); await wait(3500);
    await shot(A, 'oc-06-owner-asks', true);
    check(await A.locator('.oc-req').count() === 1, 'owner sees the request');
    await A.locator('.oc-req button.y').click(); await wait(1500);

    // 5. B gets the invite, joins, sees the newcomer note
    await B.goto(BASE + '/app/'); await wait(3000);
    await nav(B, 'Круг'); await wait(1500);
    const acc = B.locator('button', { hasText: /Вступить|Принять/ });
    check(await acc.count() > 0, 'invite shows for the newcomer');
    await acc.first().click(); await wait(4000);
    const note = await B.locator('.oc-chatnote').innerText().catch(() => '');
    check(/новичок/.test(note), 'newcomer note in chat: ' + note);
    await shot(B, 'oc-07-newcomer-chat');

    // 6. Common circle: juz, dua (too new), then allowed after a day; sister says Амин
    await nav(B, 'Круг');
    const back = B.locator('.wa-back'); if (await back.count()) { await back.click(); await wait(1200); }
    await B.locator('.oc-pinrow').click(); await wait(1500);
    await B.locator('.oc-pin button', { hasText: 'Взять джуз' }).click(); await wait(1200);
    check(/Джуз 1 твой/.test(await B.locator('.oc-page').innerText()), 'juz taken');
    await B.locator('.oc-foot button', { hasText: 'Попросить дуа' }).click();
    await B.locator('.oc-ask textarea').fill('Помолитесь за маму, у неё операция в среду');
    await B.locator('.oc-ask button', { hasText: 'Отправить' }).click(); await wait(1200);
    check(/через сутки/.test(await B.locator('.oc-page').innerText()), 'new account cannot ask yet');
    await L.q("update users set created = now() - interval '2 days'");
    await B.locator('.oc-ask button', { hasText: 'Отправить' }).click(); await wait(1500);
    check(/анонимно/.test(await B.locator('.oc-page').innerText()), 'dua request sent');
    await L.q("insert into common_marks(day, uid) select to_char(now(), 'YYYY-MM-DD'), uid from users on conflict do nothing");
    await S.locator('.oc-common').click(); await wait(2000);
    await S.locator('.oc-amin').first().click(); await wait(1200);
    check(/Амин · 1/.test(await S.locator('.oc-dua').first().innerText()), 'sister said Амин');
    await shot(S, 'oc-08-common', true);

    // 7. Narrow phone: nothing sticks out on the catalog, the common circle and the owner's box
    const over = (pg) => pg.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('.oc-common, .oc-item, .oc-pin, .oc-own *, .oc-seg, .oc-foot, .oc-stats, .oc-two')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).map((e) => e.className).slice(0, 5); });
    for (const pg of [S, A]) await pg.setViewportSize({ width: 320, height: 700 });
    check(!(await over(S)).length, 'common circle fits 320 px ' + (await over(S)).join(','));
    await S.goBack(); await wait(1000);
    check(!(await over(S)).length, 'catalog fits 320 px ' + (await over(S)).join(','));
    await shot(S, 'oc-09-narrow');
    await nav(A, 'Круг'); await wait(1500);
    const row = A.locator('.wa-row', { hasText: 'Фаджр' }); if (await row.count()) { await row.first().click(); await wait(3000); }
    const inf = A.locator('[aria-label="Данные круга"]'); if (await inf.count()) { await inf.first().click(); await wait(2000); }
    check(await A.locator('#oc-own').count() === 1 && !(await over(A)).length, 'owner box fits 320 px ' + (await over(A)).join(','));
    await shot(A, 'oc-10-owner-narrow', true);
  } catch (e) {
    fails++; say('ERROR', e.message);
  } finally {
    const errs = L.errors.filter((x) => !/open_wait|favicon/.test(x));
    if (errs.length) { say('errors:'); errs.slice(0, 15).forEach((x) => say('  ', x)); }
    await br.close(); srv.close(); await L.db.end();
    say(fails ? `FAILED ${fails}` : 'ALL OK');
    process.exit(fails ? 1 : 0);
  }
})();
