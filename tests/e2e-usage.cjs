// Section analytics (supabase/usage.sql): a phone counts opened sections and main actions anonymously, «Мой цикл»
// is never sent, the owner sees «Для владельца» → «📈 Разделы» (overview, all sections, one section, study, insights).
// Run: lmtest with admin.sql + usage.sql, npm run build, node tests/e2e-usage.cjs
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/usage/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5194';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ok = (c, m) => { if (!c) throw new Error(m); say('✓', m); };
const shot = (pg, n, full = true) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };

const seed = (name, me) => ({
  version: 1, habits: [], log: {}, hard: {}, notes: {}, prayers: {},
  settings: { place: 'Амстердам', lat: 52.3676, lng: 4.9041, method: 'MuslimWorldLeague', madhab: 'hanafi', name, me, path: 'steady' },
});

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
  await L.db.connect(); await su.connect();
  await Q('delete from usage'); await Q('delete from visits');
  await Q(`insert into lm_admins values ('owner@test.dev') on conflict do nothing`);
  const srv = L.server(5194);
  const br = await L.chromium.launch();
  const B = await L.phone(br, 'B');
  const A = await L.phone(br, 'A');
  try {
    // ---- a sister uses the app without signing in ----
    await B.goto(BASE + '/app/');
    await B.evaluate((s) => localStorage.setItem('qadam.v1', JSON.stringify(s)), seed('Амина', 'f'));
    await B.goto(BASE + '/app/'); await wait(2000);
    const vid = await B.evaluate(() => localStorage.getItem('lm.vid'));
    ok(/^[a-z0-9]{8,40}$/.test(vid || ''), 'the phone has a random id');
    await nav(B, 'Практика');
    await B.locator('button', { hasText: /^Коран/ }).first().click(); await wait(2500);
    await B.locator('button', { hasText: 'Yusuf' }).first().click(); await wait(2000);
    await B.mouse.wheel(0, 900); await wait(1500);
    for (let i = 0; i < 3 && await B.locator('button.tasbih, button:has-text("Тасбих")').count() === 0; i++) { await B.locator('.icon-btn').first().click(); await wait(800); }
    await B.locator('button', { hasText: /^Тасбих/ }).first().click(); await wait(800);
    for (let i = 0; i < 5; i++) await B.locator('button.tasbih').click();
    await shot(B, '00-tasbih', false); say('tasbih btns', await B.locator('button.tasbih').count(), await B.evaluate(() => localStorage.getItem('lm.use.q')));
    await B.goto(BASE + '/app/?go=cycle'); await wait(2500);
    ok(await B.locator('.cy-cal, .cy-main, .cy-head, .cy').count() > 0, '«Мой цикл» opened');
    await wait(6500); // the counter sends every few seconds
    const rows = await Q('select sec, act, n from usage where vid = $1 order by sec, act', [vid]);
    const has = (s, a) => rows.find((r) => r.sec === s && r.act === a);
    say(rows.map((r) => `${r.sec}/${r.act}=${r.n}`).join(' '));
    ok(has('today', 'open'), '«Сегодня» counted');
    ok(has('practice', 'open'), 'Практика counted');
    ok(has('quran', 'open') && has('quran', 'surah'), 'Коран opened, a surah counted');
    ok((has('quran', 'ayah')?.n ?? 0) > 0, `ayahs read counted (${has('quran', 'ayah')?.n})`);
    ok(has('quran', 'via:practice'), 'Коран: came from Практика');
    ok(has('tasbih', 'count')?.n === 5, 'tasbih taps counted');
    ok(!rows.some((r) => r.sec === 'cycle' || r.sec === 'period' || /cycle/.test(r.act)), '«Мой цикл» is not counted');
    ok(L.errors.length === 0, 'no rpc errors');

    // ---- history for the owner's screen: 40 phones over 60 days ----
    await Q(`insert into usage(day, vid, sec, act, n)
      select (now() at time zone 'utc')::date - (g % 60), 'h' || lpad((g % 40)::text, 9, '0'),
        (array['quran','quran','quran','azkar','azkar','videos','books','food','circle','today','today','goals','tests','safar'])[1 + g % 14],
        (array['open','open','ayah','surah','via:today'])[1 + (g / 14) % 5], 1 + g % 5
      from generate_series(1, 2500) g on conflict do nothing`);
    await Q(`insert into usage(day, vid, sec, act, n)
      select (now() at time zone 'utc')::date - (g % 25), 'h' || lpad((g % 40)::text, 9, '0'), 'videos',
        (array['start','start','start','half','half','done'])[1 + g % 6] || ':PLrBn3EWZCJ2oyw1RBXRj3U0Wxh9IcSgYQ', 1
      from generate_series(1, 120) g on conflict do nothing`);
    await Q(`insert into usage(day, vid, sec, act, n) select (now() at time zone 'utc')::date - (g % 20), 'h' || lpad((g % 40)::text, 9, '0'), 'books', 'chapter', 1 + g % 3 from generate_series(1, 60) g on conflict do nothing`);
    await Q(`insert into usage(day, vid, sec, act, n) select (now() at time zone 'utc')::date - (g % 20), 'h' || lpad((g % 40)::text, 9, '0'), 'tests', 'test_done', 1 from generate_series(1, 18) g on conflict do nothing`);
    await Q(`insert into visits(day, vid, page, lang, device) select (now() at time zone 'utc')::date - (g % 60), 'h' || lpad((g % 40)::text, 9, '0'), (array['app','landing'])[1 + g % 2], (array['ru','ru','ru','en'])[1 + g % 4], (array['mobile','mobile','desktop'])[1 + g % 3] from generate_series(1, 400) g on conflict do nothing`);

    // ---- the owner ----
    await signup(A, 'Ильгиз', 'owner@test.dev');
    await nav(A, 'Профиль'); await wait(1500);
    await A.locator('.adm-entry').click(); await wait(1200);
    await A.locator('.adm-tabs button', { hasText: 'Разделы' }).click(); await wait(2500);
    ok(await A.locator('.as-kpi b').count() >= 4, 'overview numbers');
    ok(await A.locator('.as-ret').count() === 1, 'come back after the first day');
    ok(await A.locator('.as-fun').count() === 5, 'path of a person: 5 steps');
    await shot(A, '01-overview');
    await A.locator('.as-views button', { hasText: 'Все разделы' }).click(); await wait(500);
    const names = await A.locator('.as-sec b').allTextContents();
    ok(names.includes('Коран') && names.includes('Азкары'), 'sections listed by name');
    ok(await A.locator('.adm-box h3', { hasText: 'Вера' }).count() === 1, 'grouped (Вера)');
    ok(await A.locator('.adm-box h3', { hasText: 'На сервере' }).count() === 1, 'server sections with history');
    await shot(A, '02-all');
    await A.locator('.as-sec', { hasText: 'Коран' }).first().click(); await wait(1500);
    ok(await A.locator('.as-h', { hasText: 'Коран' }).count() === 1, 'Коран in detail');
    ok(await A.locator('.as-act', { hasText: 'Аятов прочитано' }).count() === 1, 'ayahs read inside');
    ok(await A.locator('.as-act', { hasText: 'Сегодня' }).count() >= 1, 'came from «Сегодня»');
    ok(await A.locator('.as-act', { hasText: 'Русский' }).count() === 1, 'language');
    await shot(A, '03-quran');
    await A.locator('button', { hasText: '← Разделы' }).click(); await wait(800);
    await A.locator('.as-views button', { hasText: 'Учёба' }).click(); await wait(500);
    ok(await A.locator('.as-course').count() >= 1, 'a course funnel');
    ok(await A.locator('.as-act', { hasText: 'Глав отмечено' }).count() === 1, 'books: chapters');
    await shot(A, '04-study');
    await A.locator('.as-views button', { hasText: 'Что развивать' }).click(); await wait(500);
    ok(await A.locator('.as-ins').count() >= 1, `insights shown (${await A.locator('.as-ins b').allTextContents()})`);
    await shot(A, '05-insights');
    await A.setViewportSize({ width: 390, height: 844 });
    await A.emulateMedia({ colorScheme: 'dark' });
    await A.evaluate(() => { localStorage.setItem('lm.theme', 'dark'); document.documentElement.dataset.theme = 'dark'; });
    await wait(400); await shot(A, '06-insights-dark');
    ok(L.errors.length === 0, `no rpc errors ${L.errors.join('; ')}`);
    say('ALL OK');
  } catch (e) {
    console.error('FAIL', e.message); console.error(L.log.slice(-25).join('\n')); console.error(L.errors.join('\n'));
    await shot(A, 'fail-A').catch(() => {}); await shot(B, 'fail-B').catch(() => {});
    process.exitCode = 1;
  } finally {
    await br.close(); srv.close(); await L.db.end(); await su.end();
  }
})();
