// Run: local Postgres db lmtest with tests/e2e-pre.sql + supabase/*.sql, npm i pg, npm run build, then node tests/e2e-new-users.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5190';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);

async function signup(pg, name, email, login) {
  await pg.goto(BASE + (login ? '/?home&login' : '/'));
  const f = pg.locator('.js-signup').first();
  if (!login) await f.locator('input[name=name]').fill(name);
  await f.locator('input[name=email]').fill(email);
  await f.locator('button[type=submit]').click();
  await f.locator('input[name=code]').waitFor({ timeout: 5000 });
  await f.locator('input[name=code]').fill(L.CODE);
  await f.locator('button[type=submit]').click();
  await pg.waitForURL('**/app/**', { timeout: 8000 });
  await wait(2500);
}
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(700); };
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n) => pg.screenshot({ path: OUT + n + '.png', fullPage: true });

(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5190);
  const br = await L.chromium.launch();
  const step = process.argv[2] || 'all';
  try {
    // ── A: brand-new person on the landing ──
    const A = await L.phone(br, 'A');
    await signup(A, 'Али', 'ali@test.dev');
    const idA = JSON.parse(await ls(A, 'lm.cloud') || 'null');
    say('A cloud id:', idA && { uid: idA.uid, name: idA.name, circles: idA.circles });
    say('A signup row:', await L.q(`select email, name from signups`));
    say('A bound:', await L.q(`select u.name, a.email from users u join auth.users a on a.id = u.auth_id`));
    const setNick = async (pg, nick) => {
      await nav(pg, 'Профиль');
      await pg.locator('button', { hasText: 'Мой профиль' }).first().click(); await wait(600);
      await pg.locator('.nk-in input').fill(nick); await wait(900);
      await pg.locator('.nk-save').click(); await wait(1200);
      say(`[${pg.label}] nick msg:`, (await pg.locator('main').innerText()).match(/Сохранено[^\n]*|занят[^\n]*|ошибк[^\n]*/i)?.[0] || '(no msg)');
    };
    const createCircle = async (pg, title) => {
      await nav(pg, 'Круг');
      await pg.locator('button', { hasText: 'Братья' }).first().click();
      const t = pg.locator('input[placeholder^="Например"]'); if (await t.count()) await t.fill(title);
      await pg.locator('button', { hasText: 'Создать круг' }).click(); await wait(2500);
    };
    await setNick(A, 'ali_test');
    await createCircle(A, 'Братья теста');
    say('A circles:', JSON.parse(await ls(A, 'lm.cloud')).circles);
    await shot(A, 'a3-circle-made');
    say('A main:', (await A.locator('main').innerText()).slice(0, 300).replace(/\n+/g, ' | '));

    // ── B: second new person, another phone ──
    const B = await L.phone(br, 'B');
    await signup(B, 'Омар', 'omar@test.dev');
    await setNick(B, 'omar_t');
    say('users:', await L.q(`select u.name, u.nick, a.email from users u left join auth.users a on a.id = u.auth_id order by u.created`));

    // ── A invites B by typing the first letters ──
    await nav(A, 'Круг');
    await A.locator('button', { hasText: '+ Пригласить' }).click(); await wait(700);
    await A.locator('.nk-search input').fill('om'); await wait(1500);
    say('A search results:', await A.locator('.nk-hit').allInnerTexts());
    await A.locator('.nk-hit', { hasText: 'omar_t' }).click(); await wait(400);
    await A.locator('button', { hasText: 'Отправить приглашение' }).click(); await wait(1500);
    say('A sent:', await A.locator('.nk-done, .nk-msg').allInnerTexts());
    await shot(A, 'a4-invite-sent');

    // ── B sees the invite: badge + banner, accepts ──
    await B.reload(); await wait(2500);
    say('B badge:', await B.locator('.nav-badge').allInnerTexts(), 'banner:', await B.locator('.circle-line.invite').allInnerTexts());
    await shot(B, 'b1-today-invite');
    await nav(B, 'Круг');
    await shot(B, 'b2-circle-invite');
    await B.locator('.nk-req button', { hasText: 'Вступить' }).click(); await wait(3500);
    say('B circles after accept:', JSON.parse(await ls(B, 'lm.cloud')).circles);
    say('B main:', (await B.locator('main').innerText()).slice(0, 300).replace(/\n+/g, ' | '));
    await shot(B, 'b3-joined');
    say('members:', await L.q(`select m.title, u.name from members m join users u on u.uid = m.uid`));

    // ── B on a new phone C, signs in with the same email ──
    const C = await L.phone(br, 'C');
    await signup(C, '', 'omar@test.dev', true);
    await wait(2000);
    const idC = JSON.parse(await ls(C, 'lm.cloud') || 'null');
    const idB = JSON.parse(await ls(B, 'lm.cloud'));
    say('C same uid as B:', idC?.uid === idB.uid, 'circles:', idC?.circles);
    await nav(C, 'Профиль'); say('C header:', (await C.locator('main').innerText()).slice(0, 60).replace(/\n+/g, ' | ')); await nav(C, 'Круг'); await shot(C, 'c1-new-phone');

    // ── B signs out on phone B (keep data), then a new person Yusuf signs up there ──
    await nav(B, 'Профиль');
    await B.locator('button', { hasText: 'Аккаунт' }).first().click(); await wait(500);
    B.answers = [true, true];
    await B.locator('.acct button', { hasText: 'Выйти' }).click(); await wait(2500);
    say('B dialogs:', B.dialogs);
    say('B after sign-out: cloud', await ls(B, 'lm.cloud'), 'auth', await ls(B, 'lm.auth'), 'state', (await ls(B, 'qadam.v1'))?.slice(0, 30), 'url', B.url());
    await signup(B, 'Юсуф', 'yusuf@test.dev');
    await wait(2000);
    const idY = JSON.parse(await ls(B, 'lm.cloud') || 'null');
    say('Y uid differs from Omar:', idY && idY.uid !== idB.uid, 'name', idY?.name, 'circles', idY?.circles);
    await nav(B, 'Профиль'); await shot(B, 'y1-profile');
    say('Y profile text:', (await B.locator('main').innerText()).slice(0, 500).replace(/\n+/g, ' | '));
    await nav(B, 'Круг'); await shot(B, 'y2-circle');

    // ── E: phone C keeps its data on sign-out, then another email signs in there ──
    await nav(C, 'Профиль');
    await C.locator('button', { hasText: 'Аккаунт' }).first().click(); await wait(500);
    C.answers = [true, false];
    await C.locator('.acct button', { hasText: 'Выйти' }).click(); await wait(2500);
    await signup(C, '', 'zaid@test.dev', true);
    await wait(2500);
    const idZ = JSON.parse(await ls(C, 'lm.cloud') || 'null');
    say('Z (kept phone) uid differs from Omar:', idZ && idZ.uid !== idB.uid, 'circles', idZ?.circles);
    await nav(C, 'Профиль');
    say('Z profile text:', (await C.locator('main').innerText()).slice(0, 400).replace(/\n+/g, ' | '));
    await shot(C, 'z1-profile');

    // ── F: a new person opens the invite link, joins without email, signs in later ──
    const code = JSON.parse(await ls(A, 'lm.cloud')).circles[0].code;
    const F = await L.phone(br, 'F');
    await F.goto(BASE + '/?c=' + code + '&n=' + encodeURIComponent('Братья теста') + '&k=brothers'); await wait(2500);
    say('F url:', F.url());
    say('F screen:', (await F.locator('main').innerText()).slice(0, 300).replace(/\n+/g, ' | '));
    await shot(F, 'f1-link');
    const nameIn = F.locator('input[placeholder="Имя"]'); if (await nameIn.count()) await nameIn.fill('Билял');
    await F.locator('button', { hasText: 'Вступить в круг' }).click(); await wait(3000);
    const idF = JSON.parse(await ls(F, 'lm.cloud') || 'null');
    say('F joined:', idF?.circles, 'members now:', (await L.q(`select count(*) n from members where code = $1`, [code]))[0].n);
    await shot(F, 'f2-joined');
    await nav(F, 'Профиль');
    await F.locator('button', { hasText: 'Аккаунт' }).first().click(); await wait(500); await F.locator('a.acct').first().click(); await wait(1500);
    say('F login url:', F.url());
    const f = F.locator('.js-signup').first();
    await f.locator('input[name=email]').fill('bilal@test.dev');
    await f.locator('button[type=submit]').click();
    await f.locator('input[name=code]').fill(L.CODE); await f.locator('button[type=submit]').click();
    await F.waitForURL('**/app/**'); await wait(3000);
    const idF2 = JSON.parse(await ls(F, 'lm.cloud') || 'null');
    say('F after email: same uid', idF2?.uid === idF?.uid, 'circles', idF2?.circles?.length);
    say('F bound:', await L.q(`select u.name, a.email from users u join auth.users a on a.id = u.auth_id where a.email = 'bilal@test.dev'`));

    // ── D: someone signs in with Omar's email on a phone that already holds Ali's profile ──
    await nav(A, 'Профиль');
    say('users end:', await L.q(`select u.name, u.nick, a.email from users u left join auth.users a on a.id = u.auth_id order by u.created`));
  } finally {
    say('\nERRORS:\n' + L.errors.join('\n'));
    say('\nLOG:\n' + L.log.slice(-40).join('\n'));
    await br.close(); srv.close(); await L.db.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
