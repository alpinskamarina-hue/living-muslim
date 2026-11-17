// End-to-end stand: the real built site + a fake Supabase that runs RPCs against local Postgres (db lmtest).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Client } = require('pg');
const { chromium } = require('playwright');
const ROOT = '/home/claude/habits/dist';
const db = new Client({ host: '/tmp', port: 5455, user: 'postgres', database: 'lmtest' });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (c) => `h.${b64(c)}.s`;
const uidOf = (email) => { const h = crypto.createHash('md5').update(email).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const log = []; const errors = [];
const types = {};
async function argTypes(fn) {
  if (types[fn]) return types[fn];
  const r = await db.query(`select proargnames n, (select array_agg(format_type(t, null) order by i) from unnest(proargtypes) with ordinality u(t, i)) t from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and proname = $1`, [fn]);
  if (!r.rows.length) return null;
  const m = {}; (r.rows[0].n || []).forEach((n, i) => { m[n] = r.rows[0].t[i]; });
  return (types[fn] = m);
}
let chain = Promise.resolve();
function rpc(fn, args, claims) { const p = chain.then(() => rpc0(fn, args, claims)); chain = p.catch(() => {}); return p; }
async function rpc0(fn, args, claims) {
  const t = await argTypes(fn);
  if (!t) return { status: 404, body: { code: 'PGRST202', message: `no function ${fn}` } };
  const keys = Object.keys(args || {});
  const vals = keys.map((k) => { const v = args[k]; return v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v); });
  const sql = `select to_json(public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${t[k] || 'text'}`).join(', ')})) r`;
  try {
    await db.query('begin');
    await db.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || { role: 'anon' })]);
    const r = await db.query(sql, vals);
    await db.query('commit');
    return { status: 200, body: r.rows[0].r };
  } catch (e) {
    await db.query('rollback').catch(() => {});
    errors.push(`rpc ${fn}: ${e.message}`);
    return { status: /permission denied/.test(e.message) ? 401 : 400, body: { message: e.message } };
  }
}
function server(port) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.startsWith('/api/')) { r.statusCode = 204; return r.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
    if (f.endsWith('.html')) r.setHeader('content-type', 'text/html; charset=utf-8');
    if (f.endsWith('.js')) r.setHeader('content-type', 'text/javascript');
    if (f.endsWith('.css')) r.setHeader('content-type', 'text/css');
    r.end(fs.readFileSync(f));
  }).listen(port);
}
const CODE = '12345678';
async function phone(br, label) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.label = label; pg.dialogs = []; pg.answers = [];
  pg.on('pageerror', (e) => errors.push(`[${label}] PAGEERR ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`[${label}] console ${m.text()}`); });
  pg.on('dialog', async (d) => { const ans = pg.answers.length ? pg.answers.shift() : true; pg.dialogs.push(`${d.message()} -> ${ans}`); if (ans) await d.accept(); else await d.dismiss(); });
  await ctx.route(/supabase\.co/, async (rt) => {
    const req = rt.request(); const u = new URL(req.url()); let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* */ }
    const auth = req.headers()['authorization'] || '';
    let claims = null;
    if (auth.startsWith('Bearer h.')) { try { claims = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString()); } catch { /* */ } }
    const send = (status, b) => rt.fulfill({ status, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
    if (u.pathname === '/auth/v1/otp') { log.push(`[${label}] otp ${body.email}`); return send(200, {}); }
    if (u.pathname === '/auth/v1/verify') {
      if (body.token !== CODE) return send(403, { msg: 'Token has expired or is invalid' });
      const email = body.email.toLowerCase(); const id = uidOf(email);
      await db.query(`insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, '{}') on conflict do nothing`, [id, email]);
      const c = { sub: id, email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, user_metadata: {} };
      log.push(`[${label}] verify ${email}`);
      return send(200, { access_token: jwt(c), refresh_token: 'r.' + email, expires_in: 3600, user: { id } });
    }
    if (u.pathname === '/auth/v1/token') {
      const email = (body.refresh_token || '').slice(2); const id = uidOf(email);
      return send(200, { access_token: jwt({ sub: id, email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), refresh_token: body.refresh_token, expires_in: 3600 });
    }
    if (u.pathname === '/auth/v1/logout') return rt.fulfill({ status: 204, body: '' });
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = u.pathname.split('/').pop();
      const r = await rpc(fn, body, claims && claims.sub ? claims : null);
      log.push(`[${label}] ${fn}${claims ? ' (bearer)' : ''} -> ${r.status}${r.status !== 200 ? ' ' + r.body.message : ''}`);
      return send(r.status, r.body);
    }
    return send(404, { message: 'unknown ' + u.pathname });
  });
  return pg;
}
async function q(sql, a) { return (await db.query(sql, a)).rows; }
module.exports = { db, server, phone, chromium, CODE, log, errors, q, uidOf };
