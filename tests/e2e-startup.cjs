// Run: local Postgres lmtest with supabase/*.sql incl. intents.sql, npm run build, then node tests/e2e-startup.cjs
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5191';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const openChat = async (pg) => { await nav(pg, 'Круг'); await wait(1500); const r = pg.locator('.wa-row'); if (await r.count()) { await r.first().click(); await wait(1500); } };

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
async function join(pg, code) {
  await pg.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Кофейня')}&k=biz`); await wait(2500);
  await nav(pg, 'Круг');
  const j = pg.locator('button', { hasText: /Вступить|Присоединиться/ });
  if (await j.count()) { await j.first().click(); await wait(2500); }
}


const badge = async (pg) => { const b = pg.locator('nav.nav button', { hasText: 'Круг' }).locator('.nav-badge'); return (await b.count()) ? (await b.textContent()).trim() : ''; };
const rowN = async (pg, title) => { const e = pg.locator('.wa-row', { hasText: title }).locator('.wa-l2 em'); return (await e.count()) ? (await e.textContent()).trim() : ''; };



const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };
const hold = async (pg, loc) => { const b = await loc.boundingBox(); await pg.mouse.move(b.x + 20, b.y + 12); await pg.mouse.down(); await wait(800); await pg.mouse.up(); await wait(500); };
(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5191);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    await A.locator('.cl-kinds button', { hasText: 'Стартап' }).click(); await wait(300);
    ok((await A.locator('.cl-caps').textContent()).includes('Путь из 5 ступеней'), 'startup kind with «что внутри»');
    await A.locator('.cl-name input').fill('Халяль-доставка');
    await shot(A, 'su-0-new');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;
    ok(JSON.parse(await ls(A, 'lm.cloud')).circles[0].title === 'Стартап · Халяль-доставка', 'name «Стартап · Халяль-доставка»');
    const B = await L.phone(br, 'B'); await signup(B, 'Дамир', 'damir@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=x&k=startup`); await wait(2500); await nav(B, 'Круг');
    { const j = B.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } }
    await A.reload(); await wait(3000); await openChat(A); await wait(1500);
    const tabs = await A.locator('.bw-tabs button').allInnerTexts(); say('tabs', tabs);
    ok(tabs.join('|').startsWith('Чат|Путь|Дела|Календарь'), 'tabs Чат · Путь · Дела · Календарь');
    await A.locator('.bw-tabs button', { hasText: 'Путь' }).click(); await wait(1500);
    ok((await A.locator('.su-big').first().textContent()).includes('1 из 5'), 'stage 1 of 5');
    await shot(A, 'su-1-path');
    // idea
    await A.locator('.su-now .pri-btn').click(); await wait(800);
    const ta = A.locator('.bw-form textarea');
    const idea = ['Халяль-еду в Амстердаме долго искать и везут холодной', 'Семьи мусульман, которые работают до вечера', 'Доставка из проверенных халяль-кухонь за 30 минут', 'Проверка халяль, время к ифтару в Рамадан', 'Наценка на доставку, без процентов и долгов'];
    for (let i = 0; i < 5; i++) await ta.nth(i).fill(idea[i]);
    await A.locator('.bw-form .pri-btn').click(); await wait(1500);
    const st1 = (await Q('select idea, stage from su_state where code = $1', [code]))[0];
    ok(st1 && st1.idea.problem && st1.idea.earn, 'idea saved on the server');
    ok(await A.locator('.su-ai button', { hasText: 'Найти слабые места' }).count() === 1, 'assistant offer for weak spots');
    await shot(A, 'su-2-idea');
    // back to path → start the check
    await A.locator('.su-seg button', { hasText: 'Путь' }).click(); await wait(500);
    await A.locator('.su-now .pri-btn', { hasText: 'Начать проверку' }).click(); await wait(1500);
    ok((await Q('select stage, chk from su_state where code = $1', [code]))[0].stage === 2, 'stage 2 after starting the check');
    await A.locator('.su-task').first().click(); await wait(1200);
    await A.locator('.su-cnt').first().locator('button', { hasText: '+' }).click(); await wait(400);
    await A.locator('.su-cnt').first().locator('button', { hasText: '+' }).click(); await wait(1200);
    const chk = (await Q('select chk from su_state where code = $1', [code]))[0].chk;
    say('chk', chk);
    ok(chk.done['1'] && chk.list === 2, 'task ticked and waiting list counted');
    await shot(A, 'su-3-check');
    // talks
    await A.locator('.su-seg button', { hasText: 'Разговоры' }).click(); await wait(500);
    for (const [w, q, p] of [['Мама троих, Нордвейк', 'Каждую пятницу ищу, где заказать', 5], ['Студент', 'Готовлю сам', 2], ['Владелец кафе', 'Курьеры не знают про халяль', 4]]) {
      await A.locator('.su-add').click(); await wait(300);
      await A.locator('.bw-form input').first().fill(w); await A.locator('.bw-form textarea').fill(q);
      await A.locator('.su-painpick button', { hasText: String(p) }).click();
      await A.locator('.bw-form .pri-btn').click(); await wait(1200);
    }
    ok(await A.locator('.su-talk').count() === 3, '3 talks in the log');
    ok((await A.locator('.su-ai p').textContent()).includes('2 из 3'), 'summary: 2 of 3 confirmed');
    await shot(A, 'su-4-talks');
    // pulse
    await A.locator('.su-seg button', { hasText: 'Пульс' }).click(); await wait(500);
    await A.locator('.bw-form input').nth(1).fill('50');
    await A.locator('.bw-form .pri-btn').click(); await wait(1200);
    const mon = (d) => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) - d * 7); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    await Q('insert into su_pulse(code, week, value) values ($1, $2, 5), ($1, $3, 9), ($1, $4, 14) on conflict do nothing', [code, mon(3), mon(2), mon(1)]);
    await A.locator('.su-seg button', { hasText: 'Путь' }).click(); await wait(300); await A.locator('.su-seg button', { hasText: 'Пульс' }).click(); await wait(1500);
    await A.locator('.su-pin input').fill('23'); await A.locator('.su-pin .pri-btn').click(); await wait(1500);
    ok((await Q('select value from su_pulse where code = $1 and week = $2', [code, mon(0)]))[0]?.value === 23, 'pulse of this week saved');
    ok(await A.locator('.su-chart span').count() === 4, 'chart has 4 weeks');
    const fcTxt = await A.locator('.bw-card', { hasText: 'Цель ступени' }).textContent(); say('forecast:', fcTxt);
    ok(/дойдёте к/.test(fcTxt), 'forecast shown');
    await shot(A, 'su-5-pulse');
    // decision: make the check 6 days old
    await Q(`update su_state set chk = jsonb_set(chk, '{start}', to_jsonb((current_date - 5)::text)) where code = $1`, [code]);
    await A.locator('.su-seg button', { hasText: 'Проверка' }).click(); await wait(500);
    await A.reload(); await wait(3000); await openChat(A); await A.locator('.bw-tabs button', { hasText: 'Путь' }).click(); await wait(1200);
    await A.locator('.su-seg button', { hasText: 'Проверка' }).click(); await wait(1200);
    ok(await A.locator('.su-ist').count() === 1, 'istikhara card before the vote');
    await A.locator('.su-note').fill('Только для семей'); await A.locator('.su-vote button.go').click(); await wait(1500);
    await B.reload(); await wait(3000); await openChat(B); await B.locator('.bw-tabs button', { hasText: 'Путь' }).click(); await wait(1200);
    await B.locator('.su-seg button', { hasText: 'Проверка' }).click(); await wait(1200);
    await B.locator('.su-vote button.go').click(); await wait(1500);
    await shot(B, 'su-6-vote');
    await B.locator('.su-rec').click(); await wait(2000);
    ok((await Q('select stage, round from su_state where code = $1', [code]))[0].stage === 3, 'stage 3 after «Делаем»');
    const dec = await Q('select body from biz_decisions where code = $1', [code]); say('decision', dec);
    ok(dec.length === 1 && /Делаем/.test(dec[0].body) && /Только для семей/.test(dec[0].body), 'decision recorded with the note');
    // mentor
    await B.locator('.su-seg button', { hasText: 'Путь' }).click(); await wait(800);
    await B.locator('.bw-card', { hasText: 'Наставник' }).locator('button', { hasText: '+ Отметить' }).click(); await wait(300);
    await B.locator('.su-pick .chip', { hasText: 'Насим' }).click(); await wait(1500);
    ok((await Q('select mentors from su_state where code = $1', [code]))[0].mentors.length === 1, 'mentor marked');
    await shot(B, 'su-7-path3', true);
    say('errors', L.errors);
  } finally { await br.close(); srv.close(); await su.end(); await L.db.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
