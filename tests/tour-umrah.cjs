// Screenshot tour of the umrah section as it is (for the analysis): solo user, then an umrah circle with a trip.
const L = require('./e2e-lib.cjs');
const OUT = '/home/claude/tour/'; require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5193';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const shot = (pg, n) => pg.screenshot({ path: OUT + n + '.png', fullPage: true });
const nav = async (pg, t) => { await pg.locator('nav.nav button', { hasText: t }).first().click(); await wait(900); };
const unav = async (pg, t) => { await pg.locator('nav.um-nav button', { hasText: t }).click(); await wait(1000); };
const txt = (pg, s) => pg.locator(s).first().innerText().then((x) => x.replace(/\n+/g, ' | ')).catch(() => '-');
async function signup(pg, name, email) {
  await pg.goto(BASE + '/'); const f = pg.locator('.js-signup').first();
  await f.locator('input[name=name]').fill(name); await f.locator('input[name=email]').fill(email);
  await f.locator('button[type=submit]').click(); await f.locator('input[name=code]').waitFor({ timeout: 5000 });
  await f.locator('input[name=code]').fill(L.CODE); await f.locator('button[type=submit]').click();
  await pg.waitForURL('**/app/**', { timeout: 8000 }); await wait(2500);
}
(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5193); const br = await L.chromium.launch();
  try {
    const A = await L.phone(br, 'A');
    await signup(A, 'Насим', 'nasim@test.dev');
    await shot(A, '01-today-new');
    say('tabs:', (await A.locator('nav.nav button small').allInnerTexts()).join(' · '));
    await nav(A, 'Практика'); await shot(A, '02-practice');
    say('practice umrah entries:', await A.locator('button', { hasText: 'Умра' }).allInnerTexts().then((a) => a.map((x) => x.replace(/\n+/g, ' '))));
    const ex = A.locator('button', { hasText: 'Особые случаи' }); if (await ex.count()) { await ex.first().click(); await wait(500); }
    await A.locator('button', { hasText: 'Умра' }).last().click(); await wait(2500);
    for (const t of ['Сейчас', 'Подготовка', 'Группа', 'Документы', 'Копилка']) { await unav(A, t); await shot(A, `03-solo-${t}`); say(`solo ${t}:`, (await A.locator('.um-app').innerText()).replace(/\n+/g, ' | ').slice(0, 900)); }
    await A.locator('.um-out').click(); await wait(1000);
    await nav(A, 'Цели'); await shot(A, '04-goals');
    await nav(A, 'Профиль'); await shot(A, '05-profile');
    say('profile umrah:', (await A.locator('main').innerText()).split('\n').filter((l) => /умр|Умр|Umrah/.test(l)).join(' | '));
    // umrah circle
    await nav(A, 'Круг'); await shot(A, '06-circle-kinds');
    await A.locator('.cl-kinds button', { hasText: 'Умра' }).click(); await wait(300);
    await A.locator('input[placeholder^="Например: Умра"]').fill('Умра с братьями');
    const m = A.locator('input[placeholder^="Например: март"]'); if (await m.count()) await m.fill('март 2027');
    await A.locator('button', { hasText: 'Собрать поездку' }).click(); await wait(6000);
    await shot(A, '07-after-create');
    const close = A.locator('.um-sheet-h button'); if (await close.count()) { await close.click(); await wait(500); }
    for (const t of ['Сейчас', 'Подготовка', 'Группа', 'Документы', 'Копилка']) { await unav(A, t); await shot(A, `08-trip-${t}`); say(`trip ${t}:`, (await A.locator('.um-app').innerText()).replace(/\n+/g, ' | ').slice(0, 1200)); }
    const ts = A.locator('.um-gseg button', { hasText: 'Поездка' }); await unav(A, 'Группа'); if (await ts.count()) { await ts.click(); await wait(800); await shot(A, '09-trip-tasks'); say('trip tasks:', (await A.locator('.um-app').innerText()).replace(/\n+/g, ' | ').slice(0, 2500)); }
    await A.locator('.um-out').click(); await wait(1200);
    say('tabs after:', (await A.locator('nav.nav button small').allInnerTexts()).join(' · '));
    await shot(A, '10-today-with-trip');
    await nav(A, 'Круг'); await wait(1500); await shot(A, '11-circle');
    say('circle text:', (await A.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 600));
    await nav(A, 'Практика'); await shot(A, '12-practice-after');
  } finally { say('errors:', L.errors.slice(0, 10)); await br.close(); srv.close(); await L.db.end(); }
})();
