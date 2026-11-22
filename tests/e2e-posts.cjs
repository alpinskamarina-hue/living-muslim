// Posts: the team writes in the common circle (pinned, with a link button, one only for sisters); a brother opens his
// circle and writes a public pinned post and a members-only post; a newcomer sees the public one in the preview and the
// «новый пост» tag, not the members-only one; members see the chat card and the pinned bar; 3 posts a day per circle.
// Needs supabase/open-circles.sql and supabase/posts.sql in lmtest.
// Run: npm run build, then LM_DIST=$PWD/dist node tests/e2e-posts.cjs
const L = require('./e2e-lib.cjs');
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const PORT = 5198, BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(1200); };
let fails = 0;
const check = (ok, what) => { say(ok ? '  ✓' : '  ✗', what); if (!ok) fails++; };

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
  for (const t of ['Пропустить', 'Не сейчас', 'Позже']) { const b = pg.locator('button', { hasText: t }); if (await b.count()) await b.first().click().catch(() => {}); }
}
const pickGender = async (pg, t) => { const b = pg.locator('.oc-gender button', { hasText: t }); if (await b.count()) { await b.first().click(); await wait(1500); } };
async function compose(pg, text, opts = {}) {
  await pg.locator('.ps-new').click(); await wait(500);
  const s = pg.locator('.ps-sheet');
  await s.locator('textarea').fill(text);
  if (opts.link) { await s.locator('.ps-chips button', { hasText: 'Кнопка-ссылка' }).click(); await s.locator('.ps-linkf input').nth(0).fill(opts.link[0]); await s.locator('.ps-linkf input').nth(1).fill(opts.link[1]); }
  if (opts.who) await s.locator('.ps-chips button', { hasText: opts.who }).click();
  if (opts.vis) await s.locator('.ps-chips button', { hasText: opts.vis }).click();
  if (opts.pin) await s.locator('[aria-label="Закрепить сверху"]').click();
  if (opts.push) await s.locator('[aria-label="Пуш всем"]').click();
  if (opts.shot) await shot(pg, opts.shot);
  await s.locator('button', { hasText: 'Опубликовать' }).click(); await wait(2000);
}

(async () => {
  await L.db.connect();
  await L.q('truncate users cascade');
  await L.q("delete from circle_posts");
  await L.q("insert into lm_admins(email) values ('team-post@test.lm') on conflict do nothing");
  const srv = L.server(PORT);
  const br = await L.chromium.launch();
  try {
    // 1. The team writes in the common circle
    const T = await L.phone(br, 'T');
    await signup(T, 'Команда', 'team-post@test.lm');
    await nav(T, 'Круг');
    await pickGender(T, 'Я брат');
    await T.locator('.oc-common').first().click(); await wait(2000);
    check(await T.locator('.ps-tabs button', { hasText: 'Посты' }).count() === 1, 'common circle has «Посты · Вместе»');
    check(await T.locator('.ps-new').count() === 1, 'the team sees «Новый пост»');
    await compose(T, 'Ассаляму алейкум! Начинаем «10 дней Зуль-хиджи». Каждый день одно маленькое дело.', { link: ['Открыть курс', '/app/?course=x'], pin: true, push: true, shot: 'ps-01-admin-compose' });
    check(await T.locator('.ps-card.pin', { hasText: '10 дней' }).count() === 1, 'team post is out and pinned');
    check(await T.locator('.ps-card .ps-link', { hasText: 'Открыть курс' }).count() === 1, 'link button shows');
    await compose(T, 'Сёстры, в субботу онлайн-урок по фикху для женщин.', { who: 'Только сёстрам' });
    await shot(T, 'ps-02-common-posts', true);
    const pp = await L.q("select push, pushed, who from circle_posts where code is null order by id");
    check(pp.length === 2 && pp[0].push === true && pp[1].who === 'sisters', 'db: push on first, second for sisters');

    // 2. Brother A creates a circle, opens it, writes posts
    const A = await L.phone(br, 'A');
    await signup(A, 'Абдулла', 'a-post@test.lm');
    await nav(A, 'Круг');
    await A.locator('.oc-seg button', { hasText: 'Создать свой' }).click(); await wait(500);
    await A.locator('.cl-kinds button', { hasText: 'Братья' }).first().click();
    await A.locator('.cl-name input').fill('Фаджр в мечети');
    await A.locator('button', { hasText: 'Создать круг' }).click(); await wait(3500);
    if (!(await A.locator('#oc-own').count())) { await A.locator('[aria-label="Данные круга"]').first().click(); await wait(1500); }
    await A.locator('#oc-own .uo-sw').click(); await wait(400);
    await pickGender(A, 'Я брат');
    await A.locator('#oc-own textarea').fill('Держимся вместе, чтобы вставать на Фаджр в мечеть.');
    await A.locator('#oc-own button', { hasText: 'Открыть круг' }).click(); await wait(1500);
    await A.reload(); await wait(3000);
    await nav(A, 'Круг');
    const row = A.locator('.wa-row', { hasText: 'Фаджр' }); if (await row.count()) { await row.first().click(); await wait(3000); }
    const back = A.locator('.wa-ibar button[aria-label="Назад"]'); if (await back.count()) { await back.first().click(); await wait(800); }
    check(await A.locator('.ps-solo .ps-new').count() === 1, 'owner alone sees «Новый пост» under the invite');
    await compose(A, 'Сбор в субботу: после Фаджра остаёмся на тафсир суры «Аль-Кахф», потом завтрак.', { pin: true, shot: 'ps-03-owner-compose' });
    await compose(A, 'Братья, на этой неделе 11 из 14 были на Фаджре. Цель недели: все.', { vis: 'Только участники' });
    check(await A.locator('.ps-card').count() === 2, 'owner sees both posts');
    check(/видят все/.test(await A.locator('.ps-card.pin').innerText()), 'pinned one is public');
    await shot(A, 'ps-04-owner-posts', true);
    await compose(A, 'Третий пост за день: напоминание про дуа после Фаджра.');
    await compose(A, 'Четвёртый пост, его быть не должно.');
    check(/уже 3 поста/.test(await A.locator('.ps-sheet').innerText().catch(() => '')), 'fourth post today is refused');
    await A.locator('.ps-sheet .link-btn', { hasText: '✕' }).click().catch(() => {});
    await L.q("update circle_open set join_mode = 'open'");

    // 3. Newcomer brother B: catalog tag, preview with the public post only, common circle
    const B = await L.phone(br, 'B');
    await signup(B, 'Юсуф', 'b-post@test.lm');
    await nav(B, 'Круг');
    await pickGender(B, 'Я брат');
    check(/Новый пост:/.test(await B.locator('.oc-common').first().innerText()), 'common card shows the new post');
    const item = B.locator('.oc-item', { hasText: 'Фаджр в мечети' });
    check(/новый пост/.test(await item.innerText()), 'catalog shows «новый пост»');
    await item.click(); await wait(2000);
    const pv = await B.locator('.oc-page').innerText();
    check(/посты круга/i.test(pv) && /тафсир/.test(pv), 'preview shows the public post');
    check(!/11 из 14/.test(pv), 'preview hides the members-only post');
    await shot(B, 'ps-06-preview', true);
    await B.locator('.oc-cta button', { hasText: 'Войти в круг' }).click(); await wait(5000);
    check(await B.locator('.ps-ctabs button', { hasText: 'Посты' }).count() === 1, 'member sees «Чат · Посты»');
    check(await B.locator('.ps-pinbar').count() === 1, 'pinned bar over the chat');
    check(await B.locator('.cc-post').count() === 3, 'three «Новый пост» cards in the chat: ' + await B.locator('.cc-post').count());
    await shot(B, 'ps-05-chat-pin');
    await B.locator('.ps-pinbar').click(); await wait(1500);
    check(await B.locator('.ps-card').count() === 3 && await B.locator('.ps-new').count() === 0, 'member sees all 3 posts and cannot write');
    await B.locator('.ps-card.pin .ps-rx button', { hasText: '👍' }).click(); await wait(1200);
    check(/Буду · 1/.test(await B.locator('.ps-card.pin .ps-rx').innerText()), 'member said «Буду»');
    await nav(B, 'Круг');
    const bk = B.locator('.wa-back'); if (await bk.count()) { await bk.click(); await wait(1200); }
    await B.locator('.oc-pinrow').click(); await wait(2000);
    const cb = await B.locator('.oc-page').innerText();
    check(/10 дней/.test(cb) && !/фикху для женщин/.test(cb), 'brother sees the team post, not the sisters one');
    await B.locator('.ps-card', { hasText: '10 дней' }).locator('.ps-rx button', { hasText: '🤲' }).click(); await wait(1200);
    check(/Амин · 1/.test(await B.locator('.ps-card', { hasText: '10 дней' }).locator('.ps-rx').innerText()), 'brother said Амин');
    check(await B.locator('.ps-new').count() === 0, 'a member cannot write in the common circle');

    // 4. Sister sees her post
    const S = await L.phone(br, 'S');
    await signup(S, 'Амина', 's-post@test.lm');
    await nav(S, 'Круг');
    await pickGender(S, 'Я сестра');
    await S.locator('.oc-common').first().click(); await wait(2000);
    const cs = await S.locator('.oc-page').innerText();
    check(/фикху для женщин/.test(cs) && /10 дней/.test(cs), 'sister sees both team posts');
    check(/🤲 1/.test(cs), 'reaction count is shared');
    await shot(S, 'ps-07-sister-common', true);

    // 5. Push list for the team post (one sub of B)
    await L.q("insert into push_subs(endpoint, p256dh, auth, prefs, uid) select 'https://push.test/b', 'k', 'a', '{}'::jsonb, uid from users where name = 'Юсуф' on conflict do nothing").catch((e) => say('  (push_subs)', e.message));
    await L.q("update circle_posts set pushed = false where code is null");
    const sec = (await L.q("select val from lm_config where key = 'push_secret'"))[0]?.val;
    const pl = (await L.q('select lm_post_push($1) j', [sec]))[0].j;
    check(Array.isArray(pl) && pl.length === 1 && /10 дней/.test(pl[0].body), 'push goes once to the subscriber: ' + (pl || []).length);
    const pl2 = (await L.q('select lm_post_push($1) j', [sec]))[0].j;
    check(Array.isArray(pl2) && pl2.length === 0, 'push is not repeated');

    // 6. Narrow phone
    const over = (pg) => pg.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('.ps-card, .ps-card *, .ps-tabs, .ps-pinbar, .cc-post, .ps-sheet *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).map((e) => e.className).slice(0, 5); });
    await S.setViewportSize({ width: 320, height: 700 });
    check(!(await over(S)).length, 'common posts fit 320 px ' + (await over(S)).join(','));
    await A.setViewportSize({ width: 320, height: 700 });
    await A.reload(); await wait(3500);
    await nav(A, 'Круг');
    const r2 = A.locator('.wa-row', { hasText: 'Фаджр' }); if (await r2.count()) { await r2.first().click(); await wait(3000); }
    check(await A.locator('.ps-pinbar').count() === 1 && !(await over(A)).length, 'owner chat with pin fits 320 px ' + (await over(A)).join(','));
    await shot(A, 'ps-08-narrow-chat');
  } catch (e) {
    fails++; say('ERROR', e.message);
  } finally {
    const errs = L.errors.filter((x) => !/open_wait|favicon/.test(x));
    if (errs.length) { say('errors:'); errs.slice(0, 15).forEach((x) => say('  ', x)); }
    await br.close(); srv.close(); await L.db.end();
    say(fails ? `FAILED ${fails}` : 'ALL OK');
    process.exit(fails ? 1 : 0);
  }
})();
