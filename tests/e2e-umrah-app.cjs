// Umrah as its own app: bottom keys, the trip people, the trip chat (a branch of the circle chat) and auto events.
// Run like e2e-chat.cjs (local Postgres lmtest with the supabase/*.sql), then node tests/e2e-umrah-app.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5192';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(700); };
const unav = async (pg, t) => { await pg.locator('nav.um-nav button', { hasText: t }).click(); await wait(900); };

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
  const srv = L.server(5192);
  const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    await A.locator('button', { hasText: 'Братья' }).first().click();
    const t = A.locator('input[placeholder^="Например"]'); if (await t.count()) await t.fill('Братья');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    const code = JSON.parse(await A.evaluate(() => localStorage.getItem('lm.cloud'))).circle;
    say('circle', code);

    // Circle: the umrah banner, no trip yet
    await A.reload(); await wait(3000); await nav(A, 'Круг');
    say('banner 1:', await A.locator('.ub').innerText().then((x) => x.replace(/\n+/g, ' | ')));
    await A.locator('.ub').scrollIntoViewIfNeeded(); await shot(A, 'um-0-banner1');
    await A.locator('.ub button', { hasText: 'Собрать поездку' }).click(); await wait(1500);
    say('main nav hidden:', !(await A.locator('nav.nav').isVisible()), 'um-nav:', await A.locator('nav.um-nav button').allInnerTexts().then((a) => a.map((x) => x.replace(/\n/g, ' '))));
    await A.locator('button', { hasText: 'Собрать поездку на умру' }).click(); await wait(300);
    await A.locator('.join input').nth(1).fill('декабрь 2026');
    await A.locator('.join .pri-btn').click(); await wait(2500);
    say('A group seg:', await A.locator('.um-gseg button').allInnerTexts(), 'people:', await A.locator('.um-av small').allInnerTexts());
    await unav(A, 'Сейчас');
    say('A now:', await A.locator('.um-now').innerText().then((x) => x.replace(/\n+/g, ' | ')), 'next:', await A.locator('.um-next').innerText().catch(() => '-'));
    await shot(A, 'um-1-now');
    await A.locator('.um-steps button').first().click(); await wait(800);
    say('sheet:', await A.locator('.um-sheet').innerText().then((x) => x.replace(/\n+/g, ' | ')), 'wa:', await A.locator('.um-sgrid a.wa').getAttribute('href').then((h) => h.slice(0, 60)));
    await shot(A, 'um-1b-sheet');
    await A.locator('.um-nick').click(); await wait(1200);
    say('nick screen:', (await A.locator('.um-app').innerText()).slice(0, 80).replace(/\n+/g, ' | '));
    await A.locator('.um-app button', { hasText: /Назад|←/ }).first().click(); await wait(800);
    // theme switch
    const th0 = await A.locator('.um-app').getAttribute('class');
    await A.locator('.um-theme').click(); await wait(500);
    say('theme:', th0, '->', await A.locator('.um-app').getAttribute('class'));
    await shot(A, 'um-1c-other-theme');
    await A.locator('.um-theme').click(); await wait(300);

    // B joins by «Позвать в поездку» link
    const B = await L.phone(br, 'B');
    await signup(B, 'Юсуф', 'yusuf@test.dev');
    await B.goto(`${BASE}/app/?c=${code}&n=${encodeURIComponent('Братья')}&k=brothers&umrah=group`); await wait(2500);
    const jb = B.locator('button', { hasText: /Вступить|Присоединиться/ });
    if (await jb.count()) { await jb.first().click(); await wait(3000); }
    say('B opened umrah app:', await B.locator('.um-app').count(), 'title:', await B.locator('.um-title h1').allInnerTexts());
    // B leaves and sees the banner «Насим собирает умру», answers «Еду» from it
    await B.locator('.um-out').click(); await wait(1200);
    say('banner 2:', await B.locator('.ub').innerText().then((x) => x.replace(/\n+/g, ' | ')));
    await B.locator('.ub').scrollIntoViewIfNeeded(); await shot(B, 'um-2-banner2');
    await B.locator('.ub-btns button', { hasText: 'Еду' }).click(); await wait(2000);
    say('B after Еду in app:', await B.locator('.um-app').count());
    await B.locator('.um-gseg button', { hasText: 'Чат' }).click(); await wait(800);
    await B.locator('.cc-in textarea').fill('Братья, я купил билет. Рейс SV 226 🙌');
    await B.locator('.cc-send').click(); await wait(1500);
    await shot(B, 'um-3-group-chat');
    await B.locator('.um-out').click(); await wait(1200);
    say('banner 3:', await B.locator('.ub').innerText().then((x) => x.replace(/\n+/g, ' | ')));

    // A: sees B, the event and the message; the general circle chat does not show them
    await A.reload(); await wait(3500);
    await A.goto(BASE + '/app/?umrah'); await wait(3000);
    say('A now people:', await A.locator('.um-av small').allInnerTexts(), 'unread card:', await A.locator('.um-unread').allInnerTexts());
    await shot(A, 'um-4-now-people');
    await unav(A, 'Группа'); await wait(2500);
    say('A trip chat:', await A.locator('.cc-list').innerText().then((x) => x.replace(/\n+/g, ' | ')));
    await A.locator('.cc-in textarea').fill('Отлично! Встречаемся у часов после фаджра');
    await A.locator('.cc-send').click(); await wait(1200);
    // A names the amir → event
    await A.locator('.um-gseg button', { hasText: 'Поездка' }).click(); await wait(500);
    const amirSel = A.locator('.trip-body label.field', { hasText: 'Амир' }).locator('select');
    const uidB = L.uidOf('yusuf@test.dev');
    if (await amirSel.count()) { await amirSel.selectOption({ index: 1 }); await wait(1500); }
    await A.locator('.um-gseg button', { hasText: 'Чат' }).click(); await wait(1500);
    await shot(A, 'um-5-group-chat-a');
    say('db msgs:', await L.q(`select kind, body, ref from chat_msgs order by id`));

    await A.locator('.um-out').click(); await wait(800);
    await nav(A, 'Круг');
    const tab = A.locator('.cc-tabs button', { hasText: 'Чат' });
    if (await tab.count()) { await tab.click(); await wait(1500); say('general chat:', await A.locator('.cc-list').innerText().then((x) => x.replace(/\n+/g, ' | '))); }
    await nav(A, 'Сегодня'); say('today tile:', await A.locator('.um-tile').allInnerTexts());
    await shot(A, 'um-6-today');

    // On site: set dates to today for A (solo dates) and look at the rite screen
    const C = await L.phone(br, 'C');
    await C.goto(BASE + '/app/?umrah'); await wait(2000);
    const d0 = new Date().toISOString().slice(0, 10), d1 = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    await C.evaluate(([a, b]) => { const s = JSON.parse(localStorage.getItem('qadam.v1') || '{}'); s.umrah = { ...(s.umrah || { prep: [], tawaf: 0, saee: 0 }), prep: s.umrah?.prep || [], tawaf: 2, saee: 0, from: a, to: b }; localStorage.setItem('qadam.v1', JSON.stringify(s)); }, [d0, d1]);
    await C.goto(BASE + '/app/?umrah'); await wait(2000);
    say('C on site nav:', await C.locator('nav.um-nav button').allInnerTexts());
    await C.locator('.um-rite-go').click(); await wait(300);
    say('ring:', await C.locator('.um-ring').innerText());
    await shot(C, 'um-7-rite');
  } finally {
    say('errors:', L.errors.slice(0, 10));
    await br.close(); srv.close(); await L.db.end();
  }
})();
