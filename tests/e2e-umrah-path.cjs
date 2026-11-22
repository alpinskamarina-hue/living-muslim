// «Моя умра»: one trip, one path. Start question, 6 steps, one readiness number (also in Goals),
// 4 keys (Путь · Люди · Документы · Знания), a group trip in the path, on site keys.
// Run like e2e-chat.cjs (local Postgres lmtest with the supabase/*.sql), then node tests/e2e-umrah-path.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5193';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const flat = (x) => x.replace(/\n+/g, ' | ');
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
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

(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5193);
  const br = await L.chromium.launch();
  try {
    // 1. Someone alone, no circle: Practice → Умра opens «Знания»; «Путь» shows the start question.
    const S = await L.phone(br, 'S');
    await signup(S, 'Саид', 'said@test.dev');
    await nav(S, 'Практика');
    const tile = S.locator('button', { hasText: 'Умра' });
    say('practice umrah tiles:', (await tile.allInnerTexts()).map((x) => x.replace(/\n/g, ' ')));
    await tile.first().click(); await wait(1500);
    say('practice opens:', await S.locator('.um-title h1').first().innerText().catch(() => '-'));
    const keys = await S.locator('nav.um-nav button').allInnerTexts();
    say('keys:', keys.map((x) => x.replace(/\n/g, ' ')));
    check(keys.join('|').includes('Путь') && keys.join('|').includes('Знания') && keys.length === 4, '4 keys Путь · Люди · Документы · Знания');
    await unav(S, 'Путь');
    const start = await S.locator('.mp-start button').allInnerTexts();
    say('start:', start.map((x) => x.replace(/\n+/g, ' ').slice(0, 30)));
    check(start.length === 4 && start.some((x) => x.includes('Еду один')), 'start screen has 4 options with «Еду один»');
    await shot(S, 'mp-0-start');
    await S.locator('.mp-start button', { hasText: 'Еду один' }).click(); await wait(1000);
    const tl = await S.locator('.mp-tl button').allInnerTexts();
    say('path:', tl.map((x) => x.split('\n')[0]));
    check(tl.length === 6, '6 path steps');
    say('ready:', flat(await S.locator('.mp-ready').innerText()));
    say('next:', flat(await S.locator('.um-next').innerText().catch(() => '-')));
    await shot(S, 'mp-1-path', true);
    // dates step
    await S.locator('.mp-tl button', { hasText: 'Даты' }).click(); await wait(700);
    check(await S.locator('.mp-step').count() === 1, 'step screen opens');
    const d0 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10), d1 = new Date(Date.now() + 70 * 864e5).toISOString().slice(0, 10);
    await S.locator('.mp-step .up-add input').nth(0).fill(d0);
    await S.locator('.mp-step .up-add input').nth(1).fill(d1); await wait(500);
    await shot(S, 'mp-2-dates', true);
    await S.locator('.mp-nextstep').click(); await wait(700);
    say('step 3:', flat((await S.locator('.mp-step .um-title').innerText())));
    await shot(S, 'mp-3-travel', true);
    await S.locator('.um-out').click(); await wait(700);
    say('path after dates:', (await S.locator('.mp-tl button').allInnerTexts()).map((x) => x.split('\n').slice(0, 2).join(' — ')));
    check((await S.locator('.mp-tl button.ok').count()) >= 2, 'gather and dates are ticked');
    // heart in Знания raises the one number, and Goals shows the same number
    await unav(S, 'Знания');
    check(await S.locator('.kn-tile').count() === 6, 'Знания: 6 tiles');
    const knH = await S.evaluate(() => document.documentElement.scrollHeight / innerHeight);
    say('know height in screens', knH.toFixed(2)); check(knH < 1.5, 'Знания fits about one screen');
    await shot(S, 'mp-4-know-tiles', true);
    check(/Урок 1/.test(await S.locator('.kn-go').innerText()), 'Продолжить → lesson 1');
    await S.locator('.kn-go').click(); await wait(500);
    check(await S.locator('.um-vid').count() === 1, 'Продолжить opens the video page');
    await S.locator('.um-out').click(); await wait(400);
    check(await S.locator('.kn-tile').count() === 6, '← Знания goes back to the tiles');
    await S.locator('.kn-tile', { hasText: 'Сердце' }).click(); await wait(400);
    await S.locator('label.chk').first().click(); await wait(300);
    await S.locator('label.chk').nth(1).click(); await wait(300);
    await shot(S, 'mp-4-know');
    await S.locator('.um-out').click(); await wait(400);
    check(/2\/7/.test(await S.locator('.kn-tile', { hasText: 'Сердце' }).innerText()), 'Сердце tile shows 2/7');
    for (const t of ['Обряды по шагам', 'Тальбия', 'Медина']) { await S.locator('.kn-tile', { hasText: t }).click(); await wait(300); check((await S.locator('.um-title h1').first().innerText()).includes(t), `tile ${t} opens`); await S.locator('.um-out').click(); await wait(300); }
    await S.locator('.um-card', { hasText: 'Запреты в ихраме' }).click(); await wait(300);
    check(await S.locator('ul.rules li').count() >= 6, 'Запреты page');
    // the assistant: round button bottom right inside umrah, opens as «· Умра»; «Спросить помощника» sends the question
    check(await S.locator('.ai-fab').isVisible(), 'assistant button is shown in umrah');
    await S.locator('.um-ask-ai').click(); await wait(800);
    check(/Умра/.test(await S.locator('.ai-head b').innerText()), 'assistant opens as «· Умра»');
    check(/нарушил запрет ихрама/.test(await S.locator('.ai-list').innerText()), 'the rules question is sent');
    await shot(S, 'mp-ai-umrah');
    await S.locator('.sess-top .icon-btn').first().click(); await wait(400);
    await S.locator('.um-out').click(); await wait(300);
    await unav(S, 'Путь');
    const ring = (await S.locator('.mp-ring').innerText()).trim();
    const stored = await S.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1') || '{}').umrah?.ready);
    say('ring', ring, 'stored', stored);
    check(ring === `${stored}%`, 'readiness stored for Goals = ring');
    // money step: savings + pass
    await S.locator('.mp-tl button', { hasText: 'Деньги' }).click(); await wait(700);
    say('money step:', flat((await S.locator('.mp-step').innerText()).slice(0, 300)));
    check(await S.locator('.up-pass').count() === 1, 'pass card in Деньги');
    await shot(S, 'mp-5-money', true);
    await S.locator('.um-out').click(); await wait(500);
    // Docs step opens the Documents key
    await S.locator('.mp-tl button', { hasText: 'Документы' }).click(); await wait(700);
    check(await S.locator('.udoc').count() === 1, 'Документы step opens the documents');
    await shot(S, 'mp-6-docs', true);

    // 2. A group: A makes a circle, gathers a trip from the banner, the path is the group's.
    const A = await L.phone(br, 'A');
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    await A.locator('button', { hasText: 'Братья' }).first().click();
    const t = A.locator('input[placeholder^="Например"]'); if (await t.count()) await t.fill('Братья');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await A.evaluate(() => localStorage.getItem('lm.cloud'))).circle;
    await A.reload(); await wait(3000); await nav(A, 'Круг');
    await A.locator('text=Братья').first().click(); await wait(2000);
    say('in circle, umrah buttons:', (await A.locator('button', { hasText: 'Умра' }).allInnerTexts()).map((x) => x.replace(/\n+/g, ' ').slice(0, 40)), 'ub', await A.locator('.ub').count());
    await shot(A, 'mp-dbg-circle2', true);
    check(await A.locator('.um-entry').count() === 0, 'Circle: no second umrah entry in «Общие дела»');
    say('banner:', flat(await A.locator('.ub').innerText().catch(() => 'none')), 'code', code);
    await shot(A, 'mp-dbg-circle', true);
    await A.locator('.ub button', { hasText: 'Собрать поездку' }).click(); await wait(1500);
    say('A opened on:', await A.locator('.um-title h1').first().innerText().catch(() => '-'));
    await A.locator('button', { hasText: 'Собрать поездку на умру' }).click(); await wait(300);
    await A.locator('.join input').nth(1).fill('декабрь 2026');
    await A.locator('.join .pri-btn').click(); await wait(2500);
    await unav(A, 'Путь');
    say('A path title:', await A.locator('.um-title h1').first().innerText());
    say('A path:', (await A.locator('.mp-tl button').allInnerTexts()).map((x) => x.split('\n').slice(0, 2).join(' — ')));
    say('A next:', flat(await A.locator('.um-next').innerText().catch(() => '-')));
    await shot(A, 'mp-7-group-path', true);
    await A.locator('.mp-tl button', { hasText: 'Даты' }).click(); await wait(700);
    check(await A.locator('.mp-step .up-date, .mp-step .up-add').count() > 0, 'group dates step shows the voting');
    await A.locator('.mp-step .up-add input').nth(0).fill(d0);
    await A.locator('.mp-step .up-add input').nth(1).fill(d1);
    await A.locator('.mp-step .up-add .pri-btn').click(); await wait(1500);
    await A.locator('.mp-step .up-pick').first().click(); await wait(1500);
    await A.locator('.um-out').click(); await wait(800);
    say('A path after dates:', (await A.locator('.mp-tl button').allInnerTexts()).map((x) => x.split('\n').slice(0, 2).join(' — ')));
    const af = await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1') || '{}').umrah?.from);
    check(af === d0, 'group dates copied to my dates (Profile reads them)');
    await A.locator('.mp-tl button', { hasText: 'Билеты' }).click(); await wait(700);
    await shot(A, 'mp-8-group-travel', true);
    await A.locator('.um-out').click(); await wait(500);

    // B joins by the link and answers
    const B = await L.phone(br, 'B');
    await signup(B, 'Юсуф', 'yusuf@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers&umrah=group`); await wait(2500);
    const jb = B.locator('button', { hasText: /Вступить|Присоединиться/ });
    if (await jb.count()) { await jb.first().click(); await wait(3000); }
    say('B in umrah:', await B.locator('.um-app').count(), 'tab:', await B.locator('.um-title h1').allInnerTexts());
    const go = B.locator('.um-ask .gold-btn');
    if (await go.count()) { await go.first().click(); await wait(2000); }
    await unav(B, 'Люди'); await wait(2000);
    say('B people:', flat((await B.locator('.um-sec').first().innerText()).slice(0, 200)));
    await B.locator('.cc-in textarea').fill('Братья, я купил билет 🙌').catch(() => {});
    await B.locator('.cc-send').click().catch(() => {}); await wait(1500);
    await shot(B, 'mp-9-people-b', true);
    await A.reload(); await wait(3500);
    await A.goto(BASE + '/app/?umrah'); await wait(3000);
    say('A gather:', flat(await A.locator('.mp-tl button').first().innerText()));
    check((await A.locator('.mp-tl button').first().getAttribute('class') || '').includes('ok'), 'gather ticked when 2 go');
    await unav(A, 'Люди'); await wait(2000);
    say('A chat:', flat(await A.locator('.cc-list').innerText().catch(() => '-')));
    await shot(A, 'mp-10-people-a', true);

    // 2b. The trip is found from another circle: A makes a second circle, the path points back to «Братья».
    const readyBefore = await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1') || '{}').umrah?.ready);
    await A.goto(BASE + '/app/'); await wait(2000); await nav(A, 'Круг');
    await A.locator('.wa-fab').first().click(); await wait(800);
    await shot(A, 'mp-dbg-new', true);
    await A.locator('button', { hasText: 'Семья' }).first().click().catch(() => {});
    const t2 = A.locator('input[placeholder^="Например"]'); if (await t2.count()) await t2.fill('Семья');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const cur2 = JSON.parse(await A.evaluate(() => localStorage.getItem('lm.cloud'))).circle;
    say('current circle now', cur2, 'trip circle', code);
    await A.goto(BASE + '/app/?umrah'); await wait(3000);
    await unav(A, 'Путь');
    const away = A.locator('.mp-away');
    say('away card:', flat(await away.innerText().catch(() => 'none')));
    check(cur2 !== code && await away.count() === 1, 'another circle: «Моя поездка в круге «Братья»» card');
    const readyAway = await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1') || '{}').umrah?.ready);
    check(readyAway === readyBefore, 'readiness kept while in another circle');
    await shot(A, 'mp-12-away', true);
    await away.click(); await wait(3500);
    const cur3 = JSON.parse(await A.evaluate(() => localStorage.getItem('lm.cloud'))).circle;
    say('after tap circle', cur3, 'title', await A.locator('.um-title h1').first().innerText().catch(() => '-'));
    check(cur3 === code && await A.locator('.um-app').count() === 1, 'tap opens the umrah in the trip circle');

    // 3. On site: 5 keys with SOS
    const C = await L.phone(br, 'C');
    await C.goto(BASE + '/app/?umrah'); await wait(2000);
    const t0 = new Date().toISOString().slice(0, 10), t1 = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    await C.evaluate(([a, b]) => { const s = JSON.parse(localStorage.getItem('qadam.v1') || '{}'); s.umrah = { ...(s.umrah || {}), prep: [], duas: [], tawaf: 2, saee: 0, from: a, to: b }; localStorage.setItem('qadam.v1', JSON.stringify(s)); }, [t0, t1]);
    await C.goto(BASE + '/app/?umrah'); await wait(2000);
    const ck = await C.locator('nav.um-nav button').allInnerTexts();
    say('C on site keys:', ck.map((x) => x.replace(/\n/g, ' ')));
    check(ck.length === 5 && ck.join('|').includes('SOS'), 'on site: 5 keys with SOS');
    await shot(C, 'mp-11-onsite');
  } finally {
    say('errors:', L.errors.slice(0, 10));
    say(fails ? `${fails} checks failed` : 'all checks passed');
    await br.close(); srv.close(); await L.db.end();
  }
})();
