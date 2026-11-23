// «Мой цикл» (Profile → Для сестёр): calendar with past days and the guess, a note on a day, past days added
// from the calendar, make-up fasts, madhab limit, PIN lock, file copy and wipe. Everything is on the phone,
// so the stand only serves the app. Run: npm run build, node tests/e2e-cycle.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/cycle/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5193';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ok = (c, m) => { if (!c) throw new Error(m); say('✓', m); };
const shot = (pg, n, full = true) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return key(d); };
const today = day(0);

function seed(extra = {}) {
  return {
    version: 1, habits: [], log: {}, hard: {}, notes: {}, prayers: {},
    settings: { place: 'Амстердам', lat: 52.3676, lng: 4.9041, method: 'MuslimWorldLeague', madhab: 'hanafi', name: 'Амина', me: 'f', path: 'steady' },
    sis: { priv: 'own', guess: true, past: [{ from: day(-21), to: day(-16) }, { from: day(-49), to: day(-44) }, { from: day(-77), to: day(-72) }], notes: { [day(-20)]: { t: ['pain'] } } },
    ramadan: { fasts: { '2026-02-20': 'period', '2026-02-21': 'period', '2026-02-22': 'period', '2026-02-23': 'period', '2026-02-24': 'period', '2026-02-25': 'period' }, qada: ['2026-10-12', '2026-10-26'], khatm: null, nights: {}, fitr: [], keep: {} },
    ...extra,
  };
}

async function open(pg, state, lang) {
  await pg.goto(BASE + '/app/');
  await pg.evaluate(([s, l]) => { localStorage.setItem('qadam.v1', JSON.stringify(s)); if (l) localStorage.setItem('lm.theme', l); }, [state, null]);
  await pg.goto(BASE + '/app/?go=cycle');
  await wait(2500);
}

(async () => {
  await L.db.connect();
  const srv = L.server(5193);
  const br = await L.chromium.launch();
  const A = await L.phone(br, 'A');
  try {
    await open(A, seed());
    await A.locator('.cy').first().waitFor({ timeout: 8000 });
    await shot(A, '01-calendar');
    ok(await A.locator('.cy-next', { hasText: 'Через 7 дней' }).count() === 1, 'guess: in 7 days');
    ok((await A.locator('.cy-stats b').first().textContent()) === '28', 'average cycle 28');
    ok((await A.locator('.cy-stats b').nth(1).textContent()) === '6', 'average days 6');
    ok((await A.locator('.cy-stats b').nth(2).textContent()) === '4', 'fasts to make up: 4');
    const inMonth = (d) => d.slice(0, 7) === today.slice(0, 7);
    if (inMonth(day(-20))) ok(await A.locator('.cy-cal .k-past').count() >= 6, 'past days painted');
    ok(await A.locator('.cy-cal .td').count() === 1, 'today outlined');

    // A note on today
    await A.locator('.cy-cal .td').click(); await wait(400);
    await shot(A, '02-day', false);
    await A.locator('.cy-tags button', { hasText: 'Слабость' }).click();
    await A.locator('.cy-txt').fill('Пила воду');
    await A.locator('.cy-sheet .pri-btn').click(); await wait(400);
    const st1 = await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1')).sis.notes);
    ok(st1[key(new Date())]?.t?.includes('weak') && st1[key(new Date())]?.x === 'Пила воду', 'note saved on the phone');

    // Start the days today, then end
    await A.locator('.cy-cal .td').click(); await wait(300);
    await A.locator('.cy-sheet .sis-opt.moon', { hasText: 'Начались сегодня' }).click(); await wait(400);
    ok(await A.locator('.cy-next.now').count() === 1, 'days started today');
    await A.locator('.cy-cal .td').click(); await wait(300);
    await A.locator('.cy-sheet .sis-opt', { hasText: 'Закончились в этот день' }).click(); await wait(400);
    ok(await A.locator('.sis-sheet', { hasText: 'Гусль' }).count() === 1, 'ghusl steps after the end');
    await A.locator('.sis-sheet .pri-btn').click(); await wait(300);
    const past = await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1')).sis.past);
    ok(past[0].from === today && past[0].to === today, 'ended today, in history');
    // Remove it again from history
    await A.locator('.cy-cal .td').click(); await wait(300);
    await A.locator('.cy-sheet .sis-opt.off').click(); await wait(300);
    ok((await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1')).sis.past)).length === 3, 'removed from history');

    // Qada
    await A.locator('.cy-stats button').click(); await wait(400);
    await shot(A, '03-qada');
    ok((await A.locator('.cy-big b').textContent()) === '4', 'qada: 4 left');
    ok(await A.locator('.cy-dots i.ok').count() === 2, 'two made up');
    await A.locator('.cy .gold-btn').click(); await wait(300);
    ok((await A.locator('.cy-big b').textContent()) === '3', 'made one up today');
    await A.locator('.cy-wk button', { hasText: 'Пн' }).click(); await A.locator('.cy-wk button', { hasText: 'Чт' }).click(); await wait(300);
    ok(JSON.stringify(await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1')).sis.qd)) === '[0,3]', 'reminder days Mon, Thu');
    const flag = await A.evaluate(async () => { const c = await caches.open('lm-local'); const r = await c.match('/__lm-cyc'); return r ? r.json() : null; });
    ok(flag && JSON.stringify(flag.qd) === '[0,3]' && flag.modest === true && flag.rem === day(5), 'phone flag for reminders: 2 days before the guess, Mon+Thu (no server)');
    await A.locator('.pro-back').first().click(); await wait(400);

    // Madhab
    await A.locator('.nk-r', { hasText: 'Мазхаб и граница' }).click(); await wait(400);
    ok(await A.locator('.sis-chips button[aria-pressed="true"]', { hasText: 'Ханафи' }).count() === 1, 'Hanafi from app settings');
    await shot(A, '04-madhab');
    await A.locator('.sis-chips button', { hasText: 'Шафии' }).click(); await wait(200);
    ok(await A.locator('.cy-rule b', { hasText: '15 дней' }).count() >= 1, 'Shafii limit 15');
    await A.locator('.sis-chips button', { hasText: 'Ханафи' }).click();
    await A.locator('.pro-back').first().click(); await wait(400);

    // Over the limit: started 11 days ago
    await open(A, seed({ sis: { ...seed().sis, cur: day(-10) } }));
    ok(await A.locator('.cy-note', { hasText: '11-й день' }).count() === 1, 'over-limit hint on day 11 (Hanafi)');
    await shot(A, '05-over', false);

    // Privacy: PIN
    await A.locator('.nk-r', { hasText: 'Приватность и замок' }).click(); await wait(400);
    await A.locator('.nk-r', { hasText: 'Закрыть по PIN' }).locator('input').click({ force: true }); await wait(400);
    for (const k of '1234') await A.locator('.cy-keys button', { hasText: k }).click();
    await wait(200);
    await shot(A, '06-setpin', false);
    for (const k of '1234') await A.locator('.cy-keys button', { hasText: k }).click();
    await wait(600);
    ok(await A.locator('.nk-r', { hasText: 'Закрыть по PIN' }).locator('input:checked').count() === 1, 'PIN set');
    await shot(A, '07-privacy');
    const dl = A.waitForEvent('download');
    await A.locator('.cy-btn', { hasText: 'Сохранить в файл' }).click();
    const file = await dl;
    const txt = require('fs').readFileSync(await file.path(), 'utf8');
    ok(/"kind": "cycle"/.test(txt) && !/"lock"/.test(txt), 'file copy without the PIN');
    // Reload: locked
    await A.goto(BASE + '/app/?go=cycle'); await wait(2200);
    ok(await A.locator('.cy-pin', { hasText: 'Введи PIN' }).count() === 1, 'locked after reload');
    await shot(A, '08-locked', false);
    for (const k of '1111') await A.locator('.cy-keys button', { hasText: k }).click();
    await wait(300);
    ok(await A.locator('.cy-err', { hasText: 'Неверный PIN' }).count() === 1, 'wrong PIN refused');
    for (const k of '1234') await A.locator('.cy-keys button', { hasText: k }).click();
    await wait(500);
    ok(await A.locator('.cy-cal').count() === 1, 'opened with the right PIN');
    // Wipe
    await A.locator('.nk-r', { hasText: 'Приватность и замок' }).click(); await wait(300);
    await A.locator('.cy-btn.danger').click(); await A.locator('.cy-del').click(); await wait(400);
    const w = await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1')));
    ok(!w.sis.lock && w.sis.past.length === 0 && !Object.keys(w.sis.notes).length && Object.keys(w.ramadan.fasts).length === 6, 'wiped: days, notes, PIN; Ramadan record kept');
    // Bring the file back
    await A.locator('.cy input[type=file]').setInputFiles({ name: 'cycle.json', mimeType: 'application/json', buffer: Buffer.from(txt) });
    await wait(500);
    ok((await A.evaluate(() => JSON.parse(localStorage.getItem('qadam.v1')).sis.past)).length === 3, 'restored from the file');

    // Sisters page row, English, dark
    await open(A, seed());
    await A.goto(BASE + '/app/'); await wait(1500);
    await A.locator('nav.nav button', { hasText: 'Профиль' }).click(); await wait(800);
    await A.locator('button, .row', { hasText: 'Для сестёр' }).first().click(); await wait(600);
    ok(await A.locator('.nk-r', { hasText: 'Календарь, прогноз' }).count() === 1, 'row on «Для сестёр»');
    await shot(A, '09-sisters');
    await A.evaluate(() => { const s = JSON.parse(localStorage.getItem('qadam.v1')); s.settings.lang = 'en'; localStorage.setItem('qadam.v1', JSON.stringify(s)); localStorage.setItem('lm.theme', 'dark'); });
    await A.goto(BASE + '/app/?go=cycle'); await wait(2200);
    ok(await A.locator('.cy-next', { hasText: 'In 7 days' }).count() === 1, 'English');
    await shot(A, '10-en-dark');
  } catch (e) {
    console.error('FAIL', e.message);
    await shot(A, 'zz-fail').catch(() => {});
    process.exitCode = 1;
  } finally {
    const errs = L.errors.filter((e) => !/favicon|404|net::ERR|api\//.test(e));
    say('errors:', errs.length ? errs.join('\n') : 'none');
    await br.close(); srv.close(); await L.db.end();
  }
})();
