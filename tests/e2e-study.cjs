// Run: local Postgres lmtest with supabase/*.sql incl. biz-work.sql and study.sql, npm run build, then LM_DIST=dist node tests/e2e-study.cjs
const L = require('./e2e-lib.cjs');
const { Client } = require('pg');
const su = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const Q = async (sql, a) => (await su.query(sql, a)).rows;
const OUT = __dirname + '/shots/';
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5192';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const shot = (pg, n, full = false) => pg.screenshot({ path: OUT + n + '.png', fullPage: full });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).click(); await wait(900); };
const openChat = async (pg) => { await nav(pg, 'Круг'); await wait(1500); const r = pg.locator('.wa-row', { hasText: 'Джуз Амма' }); if (await r.count()) { await r.first().click(); await wait(1500); } };
const tab = async (pg, t) => { await pg.locator('.bw-tabs button', { hasText: t }).click(); await wait(1200); };
const seg = async (pg, t) => { await pg.locator('.sy-seg button', { hasText: t }).click(); await wait(900); };
const PAGES = [];
const tap = async (loc) => { await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(150); await loc.click(); };
const still = (pg) => pg.context().addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.appendChild(st); }); });
const ok = (c, m) => { if (!c) throw new Error(m); say('OK', m); };

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
  await pg.goto(`${BASE}/app/?c=${code}&n=x&k=study`); await wait(2500); await nav(pg, 'Круг');
  const j = pg.locator('button', { hasText: /Вступить|Присоединиться/ });
  if (await j.count()) { await j.first().click(); await wait(2500); }
}

(async () => {
  await L.db.connect(); await su.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('lm_admins', 'lm_config') loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5192);
  const br = await L.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const A = await L.phone(br, 'A'); PAGES.push(A); await still(A);
    await signup(A, 'Насим', 'nasim@test.dev');
    await nav(A, 'Круг');
    { const sg = A.locator('.oc-seg button', { hasText: 'Создать свой' }); if (await sg.count()) { await sg.click(); await wait(500); } }
    await tap(A.locator('.cl-kinds button', { hasText: 'Учёба' })); await wait(300);
    ok((await A.locator('.cl-caps').textContent()).includes('Сажусь учить'), 'study kind with «что внутри»');
    await A.locator('.cl-name input').fill('Джуз Амма');
    await tap(A.locator('button', { hasText: 'Создать круг' })); await wait(2500);
    const code = JSON.parse(await ls(A, 'lm.cloud')).circle;
    const B = await L.phone(br, 'B'); PAGES.push(B); await still(B); await signup(B, 'Абдуллах', 'abdullah@test.dev'); await join(B, code);
    const C = await L.phone(br, 'C'); PAGES.push(C); await still(C); await signup(C, 'Юсуф', 'yusuf@test.dev'); await join(C, code);
    await A.reload(); await wait(3000); await openChat(A); await wait(1500);
    const tabs = await A.locator('.bw-tabs button').allInnerTexts(); say('tabs', tabs);
    if (!tabs.length) { await shot(A, 'st-debug', true); say(L.log.filter((x) => /\[A\]/.test(x)).slice(-25)); say(L.errors); }
    ok(tabs.join('|').startsWith('Чат|Учёба|Занятия'), 'tabs Чат · Учёба · Занятия');
    if (!(await A.locator('.sy-setup').count())) await tab(A, 'Учёба');
    ok(await A.locator('.sy-setup').count() === 1, '«Что учим» while there is no plan');
    await tap(A.locator('.sy-setup .bw-chips button', { hasText: 'Джуз Амма' }));
    await tap(A.locator('.sy-setup .bw-chips button', { hasText: '5 аятов в день' }));
    ok((await A.locator('.sy-ready').textContent()).includes('План готов'), 'plan summary shown');
    await shot(A, 'st-0-setup');
    await tap(A.locator('.sy-setup .pri-btn')); await wait(1500);
    const plan = (await Q('select plan from st_state where code = $1', [code]))[0].plan;
    ok(plan.subj === 'hifz' && plan.total === 564 && plan.refs[0] === 114, 'plan saved: Juz Amma from An-Nas, 564 ayahs');
    // teacher
    await tap(A.locator('.bw-card', { hasText: 'Устаз' }).locator('button', { hasText: '+ Отметить' })); await wait(300);
    await tap(A.locator('.su-pick .chip', { hasText: 'Абдуллах' })); await wait(1500);
    ok((await Q('select teachers from st_state where code = $1', [code]))[0].teachers.length === 1, 'teacher marked');
    await shot(A, 'st-1-plan', true);

    // C: today's step, a hand-in with a real recording
    await C.reload(); await wait(3000); await openChat(C); await tab(C, 'Учёба');
    await shot(C, 'st-dbg-c', true);
    say('today', await C.locator('.sy-today').textContent().catch(() => 'none'));
    ok((await C.locator('.sy-today').textContent()).includes('Нас'), 'first step is An-Nas');
    await tap(C.locator('.sy-today .bw-chk').first()); await wait(1500);
    let pr = (await Q('select pos, streak from st_prog where code = $1', [code]))[0];
    ok(pr.pos === 5 && pr.streak === 1, 'step marked: pos 5, streak 1');
    // pretend he already knows the first two surahs (An-Nas 6 + Al-Falaq 5) and two of Al-Ikhlas
    await Q('update st_prog set pos = 13 where code = $1', [code]);
    await C.reload(); await wait(3000); await openChat(C); await tab(C, 'Учёба'); await seg(C, 'Хифз');
    await tap(C.locator('.sy-fab', { hasText: 'Сдать' })); await wait(800);
    const recBtn = C.locator('.sy-vp button', { hasText: 'Записать' });
    if (await recBtn.count()) {
      const b = await recBtn.boundingBox(); await C.mouse.move(b.x + 20, b.y + 10); await C.mouse.down(); await wait(2300); await C.mouse.up(); await wait(2500);
    }
    const voiced = await C.locator('.sy-vrow.on').count();
    say('voice picked', voiced);
    if (!voiced) await C.locator('.sy-sheet textarea').fill('Читал Аль-Фаляк');
    await shot(C, 'st-2-handin');
    await tap(C.locator('.sy-sheet .pri-btn', { hasText: 'Сдать' })); await wait(1500);
    const sub = (await Q('select id, label, ref, msg from st_subs where code = $1', [code]))[0];
    say('sub', sub);
    ok(sub && sub.ref && sub.ref.s, 'recitation handed in with its ayahs');

    // B (teacher): check with marks
    await B.reload(); await wait(3000); await openChat(B); await tab(B, 'Учёба');
    ok((await B.locator('.bw-tabs button', { hasText: 'Учёба' }).textContent()).match(/\d/), 'teacher sees a count on «Учёба»');
    await seg(B, 'Хифз');
    await tap(B.locator('.sy-wait .pri-btn', { hasText: 'Проверить' })); await wait(600);
    await tap(B.locator('.sy-sheet .sy-ay button').nth(1));
    await B.locator('.sy-sheet input').last().fill('Аят 2: мадд 4 счёта');
    await shot(B, 'st-3-check');
    await tap(B.locator('.sy-sheet button', { hasText: 'Пересдать' })); await wait(1500);
    const chk = (await Q('select status, marks, note from st_subs where id = $1', [sub.id]))[0];
    ok(chk.status === 'redo' && chk.marks.length === 1, 'teacher marked a mistake, redo');
    // C sees it and the surah becomes weak in revision
    await C.reload(); await wait(3500); await openChat(C); await tab(C, 'Учёба'); await seg(C, 'Хифз'); await wait(1500);
    const rev = (await Q('select rev from st_prog where code = $1', [code]))[0].rev;
    say('rev', rev);
    ok(rev[String(sub.ref.s)]?.w === 1, 'the surah with the mistake is weak in revision');
    ok((await C.locator('.sy-sub .sy-ay.ro span.x').count()) >= 1, 'C sees the marked ayah');
    await shot(C, 'st-4-hifz', true);

    // homework
    await seg(B, 'Домашка');
    await tap(B.locator('.sy-fab', { hasText: 'Задание' })); await wait(500);
    await B.locator('.sy-sheet input').first().fill('Выучить Аль-Ихлас и правило ихфа');
    await tap(B.locator('.sy-sheet .pri-btn')); await wait(1500);
    ok((await Q('select count(*)::int n from st_tasks where code = $1', [code]))[0].n === 1, 'homework given');
    await C.reload(); await wait(3500);
    const plans = JSON.parse(await ls(C, 'qadam.v1') || '{}').plans || [];
    say('C plans', plans.map((p) => p.text)); ok(plans.some((p) => p.text.includes('Ихлас и правило ихфа')), 'homework is in the student\'s «Планы»');
    await openChat(C); await tab(C, 'Учёба'); await seg(C, 'Домашка');
    await tap(C.locator('.sy-hw .pri-btn', { hasText: 'Сдать' })); await wait(500);
    await C.locator('.sy-sheet textarea').fill('Выучил, прочитаю на уроке');
    await tap(C.locator('.sy-sheet .pri-btn', { hasText: 'Сдать' })); await wait(1500);
    ok((await Q('select count(*)::int n from st_subs where code = $1 and task is not null', [code]))[0].n === 1, 'homework handed in');
    await shot(C, 'st-5-hw', true);

    // focus
    await seg(C, 'План');
    await tap(C.locator('.sy-focus-btn').first()); await wait(600);
    await tap(C.locator('.sy-focus .pri-btn', { hasText: 'Начать' })); await wait(1500);
    ok((await Q('select count(*)::int n from st_focus where code = $1 and ended is null', [code]))[0].n === 1, 'focus session started');
    await A.reload(); await wait(3000); await openChat(A); await tab(A, 'Учёба');
    ok((await A.locator('.sy-focus-btn').textContent()).includes('Сейчас учатся: 1'), 'circle sees who studies now');
    await shot(C, 'st-6-focus');
    await tap(C.locator('.sy-focus .sy-x')); await wait(300);

    // questions
    await seg(C, 'Вопросы');
    await tap(C.locator('.sy-fab', { hasText: 'Вопрос' })); await wait(400);
    await C.locator('.sy-sheet textarea').fill('Как отличить ихфа от изхара на слух?');
    await tap(C.locator('.sy-sheet .bw-chips button', { hasText: 'таджвид' }));
    await tap(C.locator('.sy-sheet .pri-btn')); await wait(1500);
    await seg(A, 'Вопросы'); await A.reload(); await wait(3000); await openChat(A); await tab(A, 'Учёба'); await seg(A, 'Вопросы');
    await tap(A.locator('.sy-too').first()); await wait(1200);
    await seg(B, 'Вопросы'); await B.reload(); await wait(3000); await openChat(B); await tab(B, 'Учёба'); await seg(B, 'Вопросы');
    await tap(B.locator('.sy-q .pri-btn', { hasText: 'Ответить' })); await wait(400);
    await B.locator('.sy-sheet textarea').first().fill('Ихфа — нун скрывается, звучит в нос. Изхар — нун читается ясно, перед горловыми буквами.');
    await B.locator('.sy-sheet .sy-chk input').check();
    await tap(B.locator('.sy-sheet .pri-btn', { hasText: 'Ответить' })); await wait(1500);
    const q = (await Q('select too, answer, pinned from st_qs where code = $1', [code]))[0];
    ok(q.too.length === 1 && q.answer && q.pinned, 'question: «у меня тоже», answer, pinned');
    await shot(B, 'st-7-qs', true);

    // lessons: a weekly lesson and a note
    await tab(B, 'Занятия');
    await tap(B.locator('.bw-fab', { hasText: 'Занятие' })); await wait(400);
    await B.locator('.bw-sheet input').first().fill('Урок 7 · Ихфа и иклаб');
    await tap(B.locator('.bw-sheet .bw-chips.small button', { hasText: 'после Иши' }));
    await B.locator('.bw-sheet .sy-chk input').check();
    await tap(B.locator('.bw-sheet .pri-btn')); await wait(4000);
    ok((await Q('select count(*)::int n from biz_events where code = $1', [code]))[0].n === 8, 'weekly lesson: 8 lessons');
    await shot(B, 'st-8-lessons');
    await tap(B.locator('.sy-lseg button', { hasText: 'Конспекты' })); await wait(500);
    await tap(B.locator('.sy-fab', { hasText: 'Конспект' })); await wait(400);
    await B.locator('.sy-sheet input').first().fill('Урок 6 · Нун с сукуном');
    await B.locator('.sy-sheet textarea').first().fill('У нун с сукуном и танвина четыре правила: изхар, идгам, иклаб и ихфа. Изхар перед шестью горловыми буквами. Иклаб только перед ба.');
    await tap(B.locator('.sy-sheet .pri-btn', { hasText: 'Сохранить' })); await wait(1500);
    const nid = (await Q('select id from st_notes where code = $1', [code]))[0].id;
    // the assistant is not reachable here: put its result as the server would, unchecked
    await Q(`update st_notes set points = '["4 правила","изхар перед горловыми","иклаб перед ба"]', cards = '[{"a":"مِنْ بَعْدِ","t":"иклаб"},{"a":"مَنْ آمَنَ","t":"изхар"},{"a":"مِنْ شَرِّ","t":"ихфа"}]' where id = $1`, [nid]);
    await C.reload(); await wait(3000); await openChat(C); await tab(C, 'Занятия'); await tap(C.locator('.sy-lseg button', { hasText: 'Конспекты' })); await wait(800);
    ok((await C.locator('.sy-nt').textContent()).includes('появятся, когда устаз проверит'), 'student does not see unchecked AI notes');
    await B.reload(); await wait(3000); await openChat(B); await tab(B, 'Занятия'); await tap(B.locator('.sy-lseg button', { hasText: 'Конспекты' })); await wait(800);
    await tap(B.locator('.sy-nt .pri-btn', { hasText: 'Проверено' })); await wait(1500);
    await C.reload(); await wait(3000); await openChat(C); await tab(C, 'Занятия'); await tap(C.locator('.sy-lseg button', { hasText: 'Конспекты' })); await wait(800);
    ok(await C.locator('.sy-nt .sy-fc span').count() === 3, 'after the check the student sees 3 cards');
    await shot(C, 'st-9-notes', true);

    // quiz from the cards
    await tab(B, 'Учёба'); await seg(B, 'Квиз');
    await tap(B.locator('button', { hasText: 'Собрать из карточек' })); await wait(500);
    await tap(B.locator('.sy-qe .pri-btn')); await wait(1500);
    ok((await Q('select jsonb_array_length(qs) n from st_quiz where code = $1', [code]))[0].n === 3, 'quiz of 3 questions');
    await C.reload(); await wait(3000); await openChat(C); await tab(C, 'Учёба'); await seg(C, 'Квиз');
    const qz = C.locator('.sy-qz');
    for (let i = 0; i < await qz.count(); i++) await qz.nth(i).locator('.sy-opt').first().click();
    await tap(C.locator('button', { hasText: 'Отправить ответы' })); await wait(1500);
    ok((await Q('select count(*)::int n from st_quiz_ans where code = $1', [code]))[0].n === 1, 'quiz answered');
    await shot(C, 'st-10-quiz', true);

    // certificate: C finishes the plan, the teacher confirms
    await Q('update st_prog set pos = 564 where code = $1', [code]);
    await B.reload(); await wait(3000); await openChat(B); await tab(B, 'Учёба');
    await tap(B.locator('.sy-certask .pri-btn')); await wait(1500);
    ok((await Q('select cert_by from st_prog where code = $1', [code]))[0].cert_by, 'teacher confirmed the plan');
    await C.reload(); await wait(3500); await openChat(C); await tab(C, 'Учёба'); await wait(1500);
    ok((await C.locator('.sy-cert').textContent()).includes('Проверил устаз'), 'certificate with the teacher name');
    const sd = JSON.parse(await ls(C, 'qadam.v1') || '{}').studyDone || [];
    ok(sd.length === 1, 'badge saved for the profile');
    await shot(C, 'st-11-cert', true);
    // narrow phones: nothing sticks out at 320 px
    const scan = (pg) => pg.evaluate(() => {
      const W = document.documentElement.clientWidth; const out = [];
      const scrollable = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
      for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if ((r.right > W + 1 || r.left < -1) && !scrollable(el)) out.push((el.tagName + '.' + (el.className?.toString?.() || '')).slice(0, 50) + ' ' + (el.textContent || '').trim().slice(0, 25)); }
      return out.slice(0, 6);
    });
    for (const pg of [B, C]) {
      await pg.setViewportSize({ width: 320, height: 640 }); await wait(500);
      await tab(pg, 'Учёба');
      for (const s of await pg.locator('.sy-seg button').allInnerTexts()) {
        const n = s.split('\n')[0].trim(); await tap(pg.locator('.sy-seg button', { hasText: n }).first()); await wait(700);
        const bad = await scan(pg); say('320', pg.label, n, bad); await shot(pg, `sy320-${pg.label}-${n}`, true);
      }
      await tab(pg, 'Занятия');
      for (const n of ['Расписание', 'Конспекты']) { await tap(pg.locator('.sy-lseg button', { hasText: n }).first()); await wait(700); say('320', pg.label, n, await scan(pg)); await shot(pg, `sy320-${pg.label}-${n}`, true); }
    }
    // chat events
    const ev = await Q(`select body from chat_msgs where code = $1 and kind = 'event' order by id`, [code]);
    say('chat events', ev.map((e) => e.body));
    say('errors', L.errors.filter((e) => !/api\//.test(e)));
  } catch (e) { for (const [i, pg] of PAGES.entries()) await pg.screenshot({ path: OUT + `st-fail-${i}.png` }).catch(() => {}); say(L.errors); throw e; } finally { await br.close(); srv.close(); await su.end(); await L.db.end(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
