// Run: local Postgres db lmtest with tests/e2e-pre.sql + supabase/*.sql (chat.sql too), npm i pg, npm run build, then node tests/e2e-chat.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5191';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const tab = async (pg, t) => { const b = pg.locator('.cc-tabs button', { hasText: t }); if (await b.count()) { await b.click(); await wait(800); } else if (t === 'Круг') { await pg.locator('.wa-hbtn', { hasText: '⋮' }).click(); await wait(600); } else if (await pg.locator('.wa-info').count()) { await pg.locator('.wa-ibar button').click(); await wait(600); } };
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(700); if (t === 'Круг') { await wait(800); const r = pg.locator('.wa-row'); if (await r.count()) { await r.first().click(); await wait(1200); } } };

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
  const srv = L.server(5191);
  const br = await L.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Ильгиз', 'ilgiz@test.dev');
    await nav(A, 'Круг');
    await A.locator('button', { hasText: 'Братья' }).first().click();
    const t = A.locator('input[placeholder^="Например"]'); if (await t.count()) await t.fill('Братья');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const idA = JSON.parse(await ls(A, 'lm.cloud'));
    const code = idA.circle;
    say('circle', code);
    say('tabs while alone:', await A.locator('.cc-tabs').count());

    const B = await L.phone(br, 'B');
    await signup(B, 'Rustam', 'rustam@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers`); await wait(2500);
    await nav(B, 'Круг');
    const jb = B.locator('button', { hasText: /Вступить|Присоединиться/ });
    if (await jb.count()) { await jb.first().click(); await wait(2500); }
    say('members:', await L.q('select count(*)::int n from members where code = $1', [code]));

    await A.reload(); await wait(3000); await nav(A, 'Круг');
    say('A tabs:', await A.locator('.cc-tabs button').allInnerTexts());
    // A asks for dua (also posts an event card to the chat)
    await A.locator('.cc-plus').click(); await wait(300);
    await A.locator('.cc-acts-g button', { hasText: 'Дуа' }).click(); await wait(300);
    await A.locator('.cx-sheet textarea').fill('Давайте сделаем дуа, чтобы у нас был офис');
    await A.locator('.cx-sheet .pri-btn').click(); await wait(1500);
    // A writes in the chat
    await tab(A, 'Чат');
    await A.locator('.cc-in textarea').fill('Ассаляму алейкум, брат!');
    await A.locator('.cc-send').click(); await wait(1200);
    say('A msgs:', await A.locator('.cc-list').innerText().then((x) => x.replace(/\n+/g, ' | ')));

    // B: badge on nav and on the tab, Today banner
    await B.reload(); await wait(3500);
    await nav(B, 'Сегодня');
    say('B nav badge:', await B.locator('.nav-badge').allInnerTexts(), 'banner:', await B.locator('.circle-line.support').allInnerTexts().then((a) => a.filter((x) => x.includes('💬'))));
    await nav(B, 'Круг');
    say('B tab:', await B.locator('.cc-tabs button').allInnerTexts());
    await shot(B, 'chat-b1-circle', true);
    await tab(B, 'Чат');
    await B.locator('.cc-ev button', { hasText: 'Амин' }).click(); await wait(1200);
    await B.locator('.cc-in textarea').fill('Ва алейкум ассалям! Сделал дуа после Фаджра');
    await B.locator('.cc-send').click(); await wait(1000);
    // voice: hold the mic 2.5 s
    const mic = B.locator('.cc-mic');
    const box = await mic.boundingBox();
    await B.mouse.move(box.x + 20, box.y + 20); await B.mouse.down(); await wait(2600); await B.mouse.up(); await wait(2500);
    say('B voice rows:', await L.q(`select m.id, m.sec, length(v.data) bytes, v.mime from chat_msgs m join chat_voice v on v.id = m.id`));
    // photo and a document
    const png = await B.screenshot();
    await B.locator('.cc-in input[type=file]').setInputFiles({ name: 'office.png', mimeType: 'image/png', buffer: png });
    await wait(300);
    await B.locator('.cc-in textarea').fill('Вот вариант офиса');
    await B.locator('.cc-send').click(); await wait(2500);
    await B.locator('.cc-in input[type=file]').setInputFiles({ name: 'dogovor.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test file '.repeat(200)) });
    await wait(300); await B.locator('.cc-send').click(); await wait(2500);
    await B.locator('.cc-in input[type=file]').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ'.repeat(100)) });
    await wait(300); await B.locator('.cc-send').click(); await wait(1500);
    say('B exe note:', await B.locator('.cc-note').allInnerTexts());
    await B.locator('.cc-pick button').click().catch(() => {});
    say('files:', await L.q(`select m.kind, m.body, m.file->>'name' name, m.file->>'w' w, length(f.data) bytes, length(m.file->>'thumb') thumb from chat_msgs m join chat_files f on f.id = m.id`));
    // reaction by long press on A's message
    const am = B.locator('.cc-m', { hasText: 'Ассаляму' });
    await am.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(300);
    const ab = await am.boundingBox();
    await B.mouse.move(ab.x + 30, ab.y + 15); await B.mouse.down(); await wait(700); await B.mouse.up(); await wait(400);
    await shot(B, 'chat-b2-menu');
    await B.locator('.cc-emo button', { hasText: '❤️' }).click(); await wait(1200);
    await shot(B, 'chat-b3-chat');

    // A: sees answers, plays voice, sees reply under the dua card
    await wait(3500);
    say('A chat:', await A.locator('.cc-list').innerText().then((x) => x.replace(/\n+/g, ' | ')));
    await A.locator('.cc-play').first().click(); await wait(1500);
    say('A play state:', await A.locator('.cc-play').first().innerText());
    await A.locator('.cc-photo img').first().waitFor({ timeout: 8000 }).catch(() => {});
    say('A photo loaded:', await A.locator('.cc-photo img').count(), 'file card:', await A.locator('.cc-file').allInnerTexts());
    const dl = A.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await A.locator('.cc-file').first().click();
    const d = await dl; say('A download:', d && d.suggestedFilename());
    await A.locator('.cc-photo').first().click(); await wait(600);
    say('A lightbox:', await A.locator('.cc-view img').count());
    await shot(A, 'chat-a0-view');
    await A.locator('.cc-view-bar button').click(); await wait(300);
    await shot(A, 'chat-a1-chat');
    await tab(A, 'Круг');
    say('A dua card:', await A.locator('.da-card.mine').innerText().then((x) => x.replace(/\n+/g, ' | ')));
    await shot(A, 'chat-a2-circle', true);
    // owner: text only, then delete B's message
    await tab(A, 'Чат');
    await A.locator('.cc-dots').click(); await wait(200);
    await A.locator('.cc-opts button', { hasText: 'Голосовые' }).click(); await wait(800);
    say('voice setting:', await L.q('select chat_voice from circles where code = $1', [code]));
    const bm = A.locator('.cc-m', { hasText: 'Сделал дуа после' });
    await bm.click({ button: 'right' }); await wait(300);
    await A.locator('.cc-menu button', { hasText: 'Удалить' }).click(); await wait(1000);
    say('after delete:', await A.locator('.cc-gone').allInnerTexts());
    // B reports A's message
    await B.reload(); await wait(3000); await nav(B, 'Круг'); await tab(B, 'Чат');
    say('B mic visible with voice off:', await B.locator('.cc-mic').count());
    await B.locator('.cc-m', { hasText: 'Ассаляму' }).click({ button: 'right' }); await wait(300);
    await B.locator('.cc-menu button', { hasText: 'Пожаловаться' }).click(); await wait(1000);
    say('reports:', await L.q('select reason, body from chat_reports'));
    await shot(B, 'chat-b4-final');
  } catch (e) { console.error('FAIL', e); }
  say('errors:', L.errors.filter((e) => !/lm_hit|lm_nikah|lm_course|courses/.test(e)).slice(0, 15));
  await br.close(); srv.close(); await L.db.end();
})();
