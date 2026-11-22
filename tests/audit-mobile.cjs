// Mobile layout audit: finds elements that stick out of the screen on narrow phones.
const L = require('./e2e-lib.cjs');
const BASE = 'http://localhost:5192';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT || __dirname + '/shots/aud/';
require('fs').mkdirSync(OUT, { recursive: true });
const WIDTHS = (process.env.W || '320,360,375,412').split(',').map(Number);
const SCALE = Number(process.env.SCALE || 1);
async function signup(pg, name, email) {
  await pg.goto(BASE + '/');
  const f = pg.locator('.js-signup').first();
  await f.locator('input[name=name]').fill(name); await f.locator('input[name=email]').fill(email);
  await f.locator('button[type=submit]').click();
  await f.locator('input[name=code]').waitFor({ timeout: 5000 }); await f.locator('input[name=code]').fill(L.CODE);
  await f.locator('button[type=submit]').click(); await pg.waitForURL('**/app/**', { timeout: 8000 }); await wait(2500);
}
const scan = (pg) => pg.evaluate(() => {
  const W = document.documentElement.clientWidth; const out = [];
  const scrollable = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const s = getComputedStyle(el); if (s.position === 'fixed' && r.right > W + 1) { out.push({ c: el.className?.toString?.().slice(0, 50) || el.tagName, r: Math.round(r.right), fixed: 1 }); continue; }
    if (r.right > W + 1 || r.left < -1) { if (scrollable(el)) continue; out.push({ c: (el.tagName + '.' + (el.className?.toString?.() || '')).slice(0, 60), r: Math.round(r.right), l: Math.round(r.left), t: (el.textContent || '').trim().slice(0, 30) }); }
  }
  // text that is cut (ellipsis or clipped) inside buttons
  return { W, docW: document.documentElement.scrollWidth, out: out.slice(0, 15) };
});
const nav = async (pg, t) => { const b = pg.locator('nav.nav button', { hasText: t }); if (await b.count()) { await b.first().click(); await wait(1200); } };
(async () => {
  await L.db.connect();
  await L.db.query(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'lm_admins' loop execute format('truncate public.%I cascade', r.tablename); end loop; end $$; truncate auth.users cascade;`);
  const srv = L.server(5192);
  const br = await L.chromium.launch();
  const pg = await L.phone(br, 'A');
  await signup(pg, 'Ильгиз', 'ilgiz@test.dev');
  if (SCALE !== 1) await pg.addStyleTag({ content: `html{zoom:${SCALE}}` });
  const screens = [
    ['today', async () => nav(pg, 'Сегодня')],
    ['practice', async () => nav(pg, 'Практика')],
    ['circle-new', async () => nav(pg, 'Круг')],
    ['circle-biz', async () => { if (!(await pg.locator('.wa-row, .wa-head, .bw-tabs').count())) { await nav(pg, 'Круг'); const k = pg.locator('.cl-kinds button', { hasText: 'Бизнес' }); if (await k.count()) { await k.click(); await pg.locator('.cl-name input').fill('Мойка на Ленина'); await pg.locator('button', { hasText: 'Создать круг' }).click(); await wait(3000); const code = await pg.evaluate(() => JSON.parse(localStorage.getItem('lm.cloud')).circle); const B = await L.phone(br, 'B'); await signup(B, 'Дамир', 'damir@test.dev'); await B.goto(`${BASE}/app/?c=${code}&n=x&k=biz`); await wait(2500); await B.locator('nav.nav button', { hasText: 'Круг' }).click(); await wait(1200); const j = B.locator('button', { hasText: /Вступить|Присоединиться/ }); if (await j.count()) { await j.first().click(); await wait(2500); } await B.close(); await pg.reload(); await wait(3000); } } await nav(pg, 'Круг'); const r = pg.locator('.wa-row'); if (await r.count()) { await r.first().click(); await wait(1500); } }],
    ['biz-tasks', async () => { const b = pg.locator('.bw-tabs button', { hasText: 'Дела' }); if (await b.count()) { await b.click(); await wait(1200); } }],
    ['biz-cal', async () => { const b = pg.locator('.bw-tabs button', { hasText: 'Календарь' }); if (await b.count()) { await b.click(); await wait(1200); } }],
    ['biz-plan', async () => { const b = pg.locator('.bw-tabs button', { hasText: 'План' }); if (await b.count()) { await b.click(); await wait(1200); } }],
    ['circle-info', async () => { const b = pg.locator('.bw-tabs button', { hasText: 'Чат' }); if (await b.count()) { await b.click(); await wait(800); } const m = pg.locator('.wa-hbtn', { hasText: '⋮' }); if (await m.count()) { await m.click(); await wait(1000); } }],
    ['circle-list', async () => { const b = pg.locator('.wa-ibar button'); if (await b.count()) { await b.click(); await wait(600); } const x = pg.locator('.wa-back'); if (await x.count()) { await x.click(); await wait(1000); } }],
    ['goals', async () => nav(pg, 'Цели')],
    ['profile', async () => nav(pg, 'Профиль')],
  ];
  const extra = (process.env.URLS || '').split(',').filter(Boolean);
  for (const w of WIDTHS) {
    await pg.setViewportSize({ width: w, height: 800 });
    for (const [n, go] of screens) {
      await go(); if (SCALE !== 1) await pg.addStyleTag({ content: `html{zoom:${SCALE}}` });
      for (let y = 0; y < 6; y++) { const s = await scan(pg); if (s.out.length || s.docW > s.W || process.env.SHOTS) { if (s.out.length || s.docW > s.W)  console.log(w, n, 'y' + y, JSON.stringify(s)); await pg.screenshot({ path: `${OUT}${n}-${w}-${y}.png` }); } const more = await pg.evaluate(() => { const b = window.scrollY; window.scrollBy(0, 700); return window.scrollY > b; }); if (!more) break; await wait(250); }
      await pg.evaluate(() => window.scrollTo(0, 0));
    }
  }
  await br.close(); srv.close(); await L.db.end();
})().catch((e) => { console.error(e); process.exit(1); });
