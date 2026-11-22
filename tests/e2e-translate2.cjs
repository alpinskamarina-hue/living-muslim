// Run: local Postgres lmtest with supabase/*.sql, npm run build, then node tests/e2e-translate2.cjs
// Steps 3–4 of chat translation: voice messages transcribed and translated, and «ответ на их языке».
// /api/transcribe and /api/translate are stubs (the real ones call the model).
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
// own connection: the stand's one switches roles inside its RPC transactions
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/';
const BASE = 'http://localhost:5194';
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
const VOICE1 = 'Kardeşim, şubatta umre için iyi bir grup buldum. İstersen birlikte gidelim.';
const VOICE2 = 'Cumadan sonra görüşürüz inşallah.';
const TR = {
  'Kardeşler, cuma namazından sonra camide buluşalım mı?': 'Братья, встретимся в мечети после джума-намаза?',
  [VOICE1]: 'Брат, я нашёл хорошую группу на умру в феврале. Если хочешь, поедем вместе.',
  [VOICE2]: 'Увидимся после джума, ИншаАллах.',
};
const MINE = 'ИншаАллах, я тоже приду. Давайте после джума у входа.';
const MINE_TR = 'İnşallah, ben de geleceğim. Cumadan sonra kapının yanında buluşalım.';
(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('lm_admins', 'lm_config') loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5194);
  const br = await L.chromium.launch();
  const st = { tr: 0, out: 0, outTo: '', scribe: 0 };
  const voices = {};
  const stub = async (pg) => {
    await pg.route('**/api/translate', async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      if (b.mode === 'out') {
        st.out++; st.outTo = b.to;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: b.text === MINE ? MINE_TR : `[${b.to}] ${b.text}` }) });
      }
      st.tr++;
      const items = b.items.map((x) => (TR[x.text] ? { id: x.id, kind: 'text', lang: 'tr', text: TR[x.text] } : { id: x.id, kind: 'same', lang: 'ru', text: '' }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
    });
    await pg.route('**/api/transcribe', async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      st.scribe++;
      const text = voices[b.id] || '…';
      await Q(`update chat_msgs set body = $2 where id = $1 and body = ''`, [b.id, text]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text }) });
    });
  };
  try {
    const A = await L.phone(br, 'A'); await stub(A);
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    await A.locator('.cl-name input').fill('Друзья'); await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;
    const B = await L.phone(br, 'B'); await stub(B);
    await signup(B, 'Emre', 'emre@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=x`); await wait(2500); await nav(B, 'Круг');
    { const j = B.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } }
    const put = (who, body) => Q(`insert into chat_msgs(code, uid, kind, body) select $1, uid, 'text', $3 from users where name = $2 returning id`, [code, who, body]);
    const voice = async (who, text) => {
      const r = await Q(`insert into chat_msgs(code, uid, kind, body, sec, bars) select $1, uid, 'voice', '', 9, '[3,5,7,4,6,8,5,3]'::jsonb from users where name = $2 returning id`, [code, who]);
      const id = r.rows ? r.rows[0].id : r[0].id;
      await Q(`insert into chat_voice(id, mime, data) values ($1, 'audio/webm', '\\x00'::bytea)`, [id]);
      voices[id] = text; return id;
    };
    await put('Emre', 'Kardeşler, cuma namazından sonra camide buluşalım mı?');
    await voice('Emre', VOICE1);

    // 3. voice: one tap «Расшифровать» transcribes and translates
    await A.reload(); await wait(3000); await openChat(A); await wait(2500);
    const scribeBtn = A.locator('.cc-tr-btn', { hasText: 'Расшифровать' });
    ok(await scribeBtn.count() === 1, '«Расшифровать» under the voice message');
    await scribeBtn.click(); await wait(2500);
    ok(st.scribe === 1, 'one transcription');
    ok(await A.locator('.cc-tr-in', { hasText: 'группу на умру' }).count() === 1, 'one tap: the transcript is shown translated');
    ok((await A.locator('.cc-tr .tr-note').first().textContent()).includes('Автоперевод с турецкого'), 'marked as auto-translated, original one tap away');
    await A.screenshot({ path: OUT + 'trn-5-voice.png' });

    // «Голосовые в текст» on: a new voice message arrives as text in my language without any tap
    await A.locator('[aria-label="Данные круга"]').first().click(); await wait(1500);
    const set = A.locator('.tr-set'); await set.scrollIntoViewIfNeeded();
    await set.locator('.tr-sw-voice').check(); await wait(200);
    ok(JSON.parse(await ls(A, 'lm.tr.voice'))[code] === true, '«Голосовые в текст» saved for this circle');
    ok(await set.locator('.tr-sw-offer').isChecked(), '«Предлагать ответ на их языке» is on by default');
    await set.screenshot({ path: OUT + 'trn-6-settings.png' });
    await A.locator('.wa-ibar button').first().click(); await wait(1200);
    await voice('Emre', VOICE2);
    await A.reload(); await wait(3000); await openChat(A); await wait(4500);
    ok(st.scribe === 2, 'the new voice message was transcribed by itself');
    await A.locator('.cc-tr-in', { hasText: 'Увидимся после джума' }).waitFor({ timeout: 8000 }).catch(() => null);
    ok(await A.locator('.cc-tr-in', { hasText: 'Увидимся после джума' }).count() === 1, 'and translated by itself');

    // 4. reply in their language
    const gbtn = A.locator('.tr-out-btn');
    ok(await gbtn.count() === 1, 'language button next to «Отправить» (others write in Turkish)');
    await gbtn.click(); await wait(300);
    const panel = A.locator('.tr-out');
    ok(await panel.locator('.tr-chips button', { hasText: 'Türkçe' }).count() === 1, 'Turkish offered as their language');
    await panel.locator('.tr-chips button', { hasText: 'Türkçe' }).click(); await wait(200);
    ok(JSON.parse(await ls(A, 'lm.tr.out'))[code] === 'tr', 'choice remembered for this chat');
    await A.locator('.cc-in textarea').fill(MINE); await wait(1600);
    ok((await A.locator('.tr-out-t').textContent()).includes('ben de geleceğim'), '«Уйдёт так» shows the Turkish text before sending');
    ok((await panel.locator('small').textContent()).includes('Emre увидит пометку «переведено с русского»'), 'says what Emre will see');
    ok((await gbtn.textContent()).includes('TR'), 'button shows TR');
    await A.screenshot({ path: OUT + 'trn-7-send.png' });
    const outsBefore = st.out;
    await A.locator('.cc-send').click(); await wait(2000);
    ok(st.out === outsBefore, 'sending used the preview, no second request');
    const row = (await Q(`select body, ref from chat_msgs where code = $1 order by id desc limit 1`, [code]));
    const last = row.rows ? row.rows[0] : row[0];
    ok(last.body === MINE_TR && last.ref.tl === 'ru' && last.ref.tt === 'tr', 'sent in Turkish with the mark ru → tr');
    const mineNote = A.locator('.cc-m.mine .tr-note').last();
    ok((await mineNote.textContent()).includes('Ушло на турецком'), 'my message: «Ушло на турецком»');
    await mineNote.locator('.tr-link', { hasText: 'Мой текст' }).click(); await wait(200);
    ok(await A.locator('.cc-m.mine .cc-t', { hasText: 'я тоже приду' }).count() === 1, '«Мой текст» shows what I wrote');
    await A.screenshot({ path: OUT + 'trn-8-sent.png' });
    // «Как есть» switches it off
    await gbtn.click(); await wait(200);
    await A.locator('.tr-out .tr-chips button', { hasText: 'Как есть' }).click(); await wait(200);
    ok(!JSON.parse(await ls(A, 'lm.tr.out'))[code], '«Как есть» turns it off');
    await A.locator('.cc-in textarea').fill('Салам'); await A.locator('.cc-send').click(); await wait(1500);
    ok(st.out === outsBefore, 'as is: no translation');

    // Emre, who reads Turkish, sees the mark and no «Перевести»
    await B.evaluate(() => localStorage.setItem('lm.tr.know', JSON.stringify(['tr'])));
    await B.reload(); await wait(3000); await openChat(B); await wait(2500);
    const theirs = B.locator('.cc-m', { hasText: 'ben de geleceğim' });
    ok((await theirs.locator('.tr-note').textContent()).includes('Переведено с русского'), 'Emre sees «Переведено с русского»');
    ok(await theirs.locator('.tr-btn').count() === 0, 'and no «Перевести» under it');
    await B.screenshot({ path: OUT + 'trn-9-emre.png' });
    ok(!L.errors.length, 'no page errors: ' + L.errors.join(' | '));
    say('ALL OK', st);
  } finally { await br.close(); srv.close(); await L.db.end(); await su.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
