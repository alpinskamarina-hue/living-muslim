// Run: local Postgres lmtest with supabase/*.sql incl. intents.sql, npm run build, then node tests/e2e-person.cjs
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
    await A.locator('button', { hasText: 'Бизнес' }).first().click();
    const t = A.locator('.cl-name input'); if (await t.count()) await t.fill('Кофейня');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;
    const uidA = JSON.parse(await ls(A, 'lm.cloud')).uid;
    const B = await L.phone(br, 'B'); await signup(B, 'Дамир', 'damir@test.dev'); await join(B, code);
    const uidB = JSON.parse(await ls(B, 'lm.cloud')).uid;
    await Q(`insert into chat_msgs(code, uid, body) values ($1, $2, 'Надо до среды подписать договор аренды, иначе помещение уйдёт'), ($1, $2, 'Встречаемся в пятницу после Зухра с инвестором, всем быть')`, [code, uidB]);
    await A.reload(); await wait(3000); await openChat(A); await wait(3000);
    ok(await A.locator('.bw-tabs').count() === 1, 'business tabs shown');
    await shot(A, 'bw-0-chat');
    // message → task
    await hold(A, A.locator('.cc-m', { hasText: 'договор аренды' }).first());
    await shot(A, 'bw-1-menu');
    await A.locator('.cc-bzm', { hasText: 'Сделать делом' }).click(); await wait(600);
    await shot(A, 'bw-2-task-sheet');
    await A.locator('.bw-sheet .pri-btn').click(); await wait(2500);
    const tasks = await Q('select title, owner, due, status, msg from biz_tasks');
    say('tasks:', tasks);
    ok(tasks.length === 1 && tasks[0].owner === uidB && tasks[0].due && new Date(tasks[0].due).getDay() === 3, 'task from chat: owner Дамир, due Wednesday');
    ok(await A.locator('.cc-bz').count() >= 1, 'task card in chat');
    // message → meeting on Friday after Zuhr: Jumu'ah warning
    await hold(A, A.locator('.cc-m', { hasText: 'после Зухра' }).first());
    await A.locator('.cc-bzm', { hasText: 'Поставить в календарь' }).click(); await wait(600);
    const warn = await A.locator('.bw-warn').count(); say('jumuah warning:', warn);
    await shot(A, 'bw-3-event-sheet');
    ok(warn === 1, 'Jumuah warning on Friday after Zuhr');
    ok(await A.locator('.bw-sheet .pri-btn').isDisabled(), 'cannot save at Jumuah');
    await A.locator('.bw-warn button').click(); await wait(300);
    await A.locator('.bw-sheet .pri-btn').click(); await wait(2500);
    const evs = await Q('select title, day, at, after_p from biz_events'); say('events:', evs);
    ok(evs.length === 1 && evs[0].at && !evs[0].after_p, 'meeting saved at a time after Jumuah');
    await wait(1500);
    const plans = await A.evaluate(() => (JSON.parse(localStorage.getItem('qadam.v1') || '{}').plans || []).filter((p) => p.id.startsWith('bz-')));
    say('my plans:', plans.map((p) => [p.text, p.date, p.time, p.remind]));
    ok(plans.length === 1, 'meeting went into my Plans');
    // tasks tab: add my own for today, tick it
    await A.locator('.bw-tabs button', { hasText: 'Дела' }).click(); await wait(1200);
    await A.locator('.bw-fab').click(); await wait(400);
    await A.locator('.bw-sheet input').first().fill('Отправить презентацию инвестору');
    await A.locator('.bw-sheet .bw-chips button', { hasText: 'Сегодня' }).first().click();
    await A.locator('.bw-sheet .pri-btn').click(); await wait(2000);
    ok(await A.locator('.bw-today .bw-li', { hasText: 'презентацию' }).count() === 1, 'my task in «Сегодня у тебя»');
    await shot(A, 'bw-4-tasks');
    await A.locator('.bw-today .bw-li', { hasText: 'презентацию' }).locator('.bw-chk').click(); await wait(1800);
    ok((await Q(`select status from biz_tasks where title like 'Отправить%'`))[0].status === 'done', 'tick marks it done');
    await shot(A, 'bw-5-tasks-done');
    // plan
    await A.locator('.bw-tabs button', { hasText: 'План' }).click(); await wait(1000);
    await A.locator('.bw-start .pri-btn').click(); await wait(300);
    await A.locator('.bw-form textarea').fill('Халяль-кофейня в Казани, где честно платят поставщикам и 5% прибыли идут в садака.');
    await A.locator('.bw-form label input').fill('Открыть 2 точки и выйти в плюс');
    await A.locator('.bw-g input').first().fill('Найти помещение');
    await A.locator('.bw-g select').first().selectOption(uidB);
    await A.locator('.bw-g input[type=range]').first().fill('80');
    await A.locator('.bw-form .pri-btn').click(); await wait(2000);
    say('plan:', await Q('select niyya, goal, goals from biz_plan'));
    ok((await Q('select count(*)::int n from biz_plan'))[0].n === 1, 'plan saved');
    // decision from chat
    await A.locator('.bw-tabs button', { hasText: 'Чат' }).click(); await wait(1500);
    await Q(`insert into chat_msgs(code, uid, body) values ($1, $2, 'Кредит не берём, ищем партнёра-инвестора')`, [code, uidB]);
    await wait(4000);
    await hold(A, A.locator('.cc-m', { hasText: 'Кредит не берём' }).first());
    await A.locator('.cc-bzm', { hasText: 'Записать как решение' }).click(); await wait(500);
    await A.locator('.bw-sheet .pri-btn').click(); await wait(2000);
    await A.locator('.bw-tabs button', { hasText: 'План' }).click(); await wait(1200);
    ok(await A.locator('.bw-dec', { hasText: 'Кредит не берём' }).count() === 1, 'decision in the plan');
    await shot(A, 'bw-6-plan', true);
    await A.locator('.bw-tabs button', { hasText: 'Календарь' }).click(); await wait(1200);
    await shot(A, 'bw-7-cal', true);
    // B sees the same
    await B.reload(); await wait(3000); await openChat(B); await wait(2500);
    await B.locator('.bw-tabs button', { hasText: 'Дела' }).click(); await wait(1500);
    const bt = await B.locator('.bw-task').allInnerTexts(); say('B board:', bt);
    ok(bt.some((x) => /договор/i.test(x)), 'Дамир sees the task on the board');
    await shot(B, 'bw-8-B-tasks');
    say('errors', L.errors);
  } finally { await br.close(); srv.close(); await su.end(); await L.db.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
