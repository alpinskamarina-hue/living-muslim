// Run: local Postgres lmtest with supabase/*.sql, npm run build, then node tests/e2e-translate.cjs
// /api/translate is replaced by a stub (the real one calls the model): Turkish → a fixed Russian text, an ayah → 2:201.
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
const BASE = 'http://localhost:5193';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const openChat = async (pg) => { await nav(pg, 'Круг'); await wait(1500); const r = pg.locator('.wa-row'); if (await r.count()) { await r.first().click(); await wait(1500); } };
async function signup(pg, name, email) {
  await pg.goto(BASE + '/');
  const f = pg.locator('.js-signup').first();
  await f.locator('input[name=name]').fill(name); await f.locator('input[name=email]').fill(email);
  await f.locator('button[type=submit]').click();
  await f.locator('input[name=code]').waitFor({ timeout: 5000 }); await f.locator('input[name=code]').fill(L.CODE);
  await f.locator('button[type=submit]').click(); await pg.waitForURL('**/app/**', { timeout: 8000 }); await wait(2500);
}
const TR = {
  'Kardeşler, cuma namazından sonra camide buluşalım mı?': { kind: 'text', lang: 'tr', text: 'Братья, встретимся в мечети после джума-намаза?' },
  'Annem için dua edin, hastanede. İnşallah iyi olacak.': { kind: 'text', lang: 'tr', text: 'Сделайте дуа за мою маму, она в больнице. ИншаАллах, всё будет хорошо.' },
  'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً': { kind: 'quran', lang: 'ar', text: '', s: 2, a: 201 },
};
(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('lm_admins', 'lm_config') loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5193);
  const br = await L.chromium.launch();
  let calls = 0, sent = 0;
  try {
    const A = await L.phone(br, 'A');
    await A.route('**/api/translate', async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      calls++; sent += b.items.length;
      const items = b.items.map((x) => ({ id: x.id, ...(TR[x.text] || { kind: 'same', lang: 'ru', text: '' }) }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
    });
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    await A.locator('.cl-name input').fill('Друзья'); await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;
    const B = await L.phone(br, 'B'); await signup(B, 'Emre', 'emre@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=x`); await wait(2500); await nav(B, 'Круг');
    { const j = B.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } }
    const put = (who, body) => L.q(`insert into chat_msgs(code, uid, kind, body) select $1, uid, 'text', $3 from users where name = $2 returning id`, [code, who, body]);
    await put('Emre', 'Kardeşler, cuma namazından sonra camide buluşalım mı?');
    await put('Emre', 'MashaAllah');
    await put('Emre', 'Annem için dua edin, hastanede. İnşallah iyi olacak.');
    await put('Emre', 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً');
    await put('Emre', 'Я немного говорю по-русски');
    await put('Насим', 'Амин! Пусть Аллах дарует ей исцеление.');
    await A.reload(); await wait(3000); await openChat(A); await wait(2500);

    const btns = A.locator('.tr-btn');
    ok(await btns.count() === 3, '«Перевести» only under the Turkish and Arabic messages (not MashaAllah, Russian or mine)');
    ok((await btns.first().textContent()).includes('Перевести с турецкого'), 'button names the language');
    await A.screenshot({ path: OUT + 'trn-1-chat.png' });
    await btns.first().click(); await wait(1200);
    ok(calls === 1, 'one request for one tap');
    ok(await A.locator('.cc-t', { hasText: 'встретимся в мечети' }).count() === 1, 'translation replaces the text');
    ok((await A.locator('.tr-note').first().textContent()).includes('Автоперевод с турецкого'), 'marked as auto-translated');
    await A.locator('.tr-link', { hasText: 'Оригинал' }).first().click(); await wait(300);
    ok(await A.locator('.cc-t', { hasText: 'Kardeşler' }).count() === 1, '«Оригинал» shows the original again');
    await A.locator('.tr-btn').first().click(); await wait(500);
    ok(calls === 1 && await A.locator('.cc-t', { hasText: 'встретимся в мечети' }).count() === 1, 'second time comes from the phone, no new request');
    // the ayah: the checked translation, never a machine one
    await A.locator('.tr-btn', { hasText: 'арабского' }).click(); await wait(4000);
    const ay = await A.locator('.tr-ayah').textContent();
    ok(/Господь наш/.test(ay), 'ayah shows Kuliev\'s translation from quran-ru.json');
    ok((await A.locator('.tr-note', { hasText: 'Коран 2:201' }).textContent()).includes('Кулиева'), 'source of the ayah named');
    await A.screenshot({ path: OUT + 'trn-2-done.png' });

    // settings: auto-translation for this chat
    await A.locator('[aria-label="Данные круга"]').first().click(); await wait(1500);
    const set = A.locator('.tr-set');
    ok(await set.count() === 1, '«Перевод» section on the circle page');
    await set.scrollIntoViewIfNeeded();
    await set.locator('.tr-sw').check(); await wait(200);
    ok(JSON.parse(await ls(A, 'lm.tr.auto'))[code] === true, 'auto-translation saved for this circle');
    await set.locator('.tr-chips button', { hasText: 'Türkçe' }).click(); await wait(200);
    ok(JSON.parse(await ls(A, 'lm.tr.know')).includes('tr'), '«Я понимаю ещё» saved');
    await set.screenshot({ path: OUT + 'trn-3-settings.png' });
    await set.locator('.tr-chips button', { hasText: 'Türkçe' }).click(); await wait(200);
    ok(!JSON.parse(await ls(A, 'lm.tr.know')).includes('tr'), 'and removed again');
    await A.locator('.wa-ibar button').first().click(); await wait(1500);
    // a new Turkish message is translated by itself
    await A.evaluate(() => { const c = JSON.parse(localStorage.getItem('lm.tr.cache') || '{}'); for (const k of Object.keys(c)) delete c[k]; localStorage.setItem('lm.tr.cache', JSON.stringify(c)); });
    const before = calls;
    await A.reload(); await wait(3000); await openChat(A); await wait(3500);
    ok(calls === before + 1, 'auto mode: one batched request for all visible foreign messages');
    ok(await A.locator('.cc-t', { hasText: 'Сделайте дуа за мою маму' }).count() === 1, 'auto mode shows the translation without a tap');
    await A.screenshot({ path: OUT + 'trn-4-auto.png' });
    ok(!L.errors.length, 'no page errors: ' + L.errors.join(' | '));
    say('ALL OK', { calls, sent });
  } finally { await br.close(); srv.close(); await L.db.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
