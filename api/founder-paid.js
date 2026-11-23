// «Круг основателей», step 2: the Stripe webhook (checkout.session.completed). Stripe → Developers → Webhooks →
// endpoint https://living-muslim.vercel.app/api/founder-paid, event checkout.session.completed; its signing secret
// goes to STRIPE_WEBHOOK_SECRET. We check the signature, mark the record paid in Supabase with the service role key
// (lm_founder_paid), make the certificate PDF, send it by Brevo and tell the owner in Telegram.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TIERS, eur, esc, rpc, siteOf, certificatePdf, brevo, telegram, founderMail } from './_founders.js';

export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === 'string') return resolve(req.body);
    if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Stripe-Signature: t=<unix>,v1=<hmac sha256 of "<t>.<body>">; 5 minutes of tolerance. */
export function verify(sig, body, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(sig || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > 300) return false;
  const want = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(want), b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_KEY) { console.error('founder-paid: no STRIPE_WEBHOOK_SECRET or SUPABASE_SERVICE_KEY'); return res.status(503).json({ error: 'noenv' }); }
  const body = await rawBody(req);
  if (!verify(req.headers['stripe-signature'], body, secret)) return res.status(400).json({ error: 'signature' });
  let ev = {};
  try { ev = JSON.parse(body); } catch { return res.status(400).json({ error: 'json' }); }
  if (ev.type !== 'checkout.session.completed') return res.status(200).json({ ok: true, skipped: ev.type });
  const s = ev.data?.object || {};
  const id = s.metadata?.founder || s.client_reference_id;
  if (!id || s.payment_status !== 'paid') return res.status(200).json({ ok: true, skipped: 'unpaid' });

  let f = null;
  try { f = await rpc('lm_founder_paid', { p_id: id, p_session: s.id, p_amount: s.amount_total ?? null }, true); }
  catch (e) { console.error('founder-paid: rpc', e?.message); return res.status(500).json({ error: 'save' }); }
  if (!f || f.error) { console.error('founder-paid: not granted', JSON.stringify(f)); return res.status(200).json({ ok: false, error: f?.error || 'none' }); }
  console.log('founder-paid: granted', f.code, f.tier, f.amount);

  const site = siteOf(req);
  const t = TIERS[f.tier] || TIERS.f100;
  await telegram(['<b>Новый основатель</b> 🎉', `<b>Уровень:</b> ${t.ru} · ${eur(f.amount)}`, `<b>Имя:</b> ${esc(f.name)}`, `<b>Почта:</b> ${esc(f.email)}`, f.country ? `<b>Страна:</b> ${esc(f.country)}` : '', `<b>На стене:</b> ${f.wall ? esc(f.wall) : 'анонимно'}`, `<b>Сертификат:</b> ${f.code}`, '', 'Все: Профиль → Для владельца → Основатели'].filter((x) => x !== '').join('\n')).catch(() => false);

  const sender = process.env.BREVO_SENDER;
  if (!process.env.BREVO_API_KEY || !sender) { console.log('founder-paid: no BREVO env, mail skipped'); return res.status(200).json({ ok: true, mailed: false }); }
  let attachment = {};
  try { attachment = { attachment: [{ content: (await certificatePdf(f)).toString('base64'), name: `LivingMuslim-${f.code}.pdf` }] }; }
  catch (e) { console.error('founder-paid: pdf failed', e?.message); }
  const m = founderMail(f, site);
  const mailed = await brevo({
    sender: { name: 'Living Muslim', email: sender },
    replyTo: { email: sender, name: 'Living Muslim' },
    to: [{ email: f.email, name: f.name }],
    subject: m.subject,
    htmlContent: m.html,
    ...attachment,
  }).catch((e) => { console.error('founder-paid: mail failed', e?.message); return false; });
  return res.status(200).json({ ok: true, mailed });
}
