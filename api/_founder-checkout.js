// «Круг основателей», step 1: the app sends the level and the person's details; we write a pending record in
// Supabase (lm_founder_prepare) and open a Stripe Checkout session for the amount. The person pays on Stripe's page
// and comes back to /app/?founder=ok. Without STRIPE_SECRET_KEY the answer is {error:'nostripe'} and the app
// says payments are not connected yet (the owner still has the test path, lm_founder_test).
import { TIERS, eur, str, isEmail, rpc, siteOf, rawBody } from './_founders.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  let b = req.body;
  if (b === undefined) b = await rawBody(req); // api/invest.js leaves the body raw
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const tier = TIERS[b.tier] ? b.tier : '';
  const name = str(b.name, 60), email = str(b.email, 120).toLowerCase(), country = str(b.country, 60), wall = str(b.wall, 40);
  const lang = b.lang === 'en' ? 'en' : 'ru';
  const uid = str(b.uid, 40), token = str(b.token, 80);
  if (!tier || !name || !isEmail(email) || !uid || !token) return res.status(400).json({ error: 'input' });

  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return res.status(503).json({ error: 'nostripe' });

  let id = null;
  try { id = await rpc('lm_founder_prepare', { p_uid: uid, p_token: token, p_tier: tier, p_name: name, p_email: email, p_country: country, p_wall: wall, p_lang: lang }); }
  catch (e) { console.error('founder-checkout: prepare', e?.message); }
  if (!id) return res.status(400).json({ error: 'prepare' });

  const t = TIERS[tier];
  const site = siteOf(req);
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(t.amount),
    // Stripe sees a privileges package only: no «вклад», shares or percentages in the product name, description or receipt (the legal thread's note, 23.11).
    'line_items[0][price_data][product_data][name]': lang === 'en' ? `Living Muslim · Founder’s package «${t.en}»` : `Living Muslim · Пакет основателя «${t.ru}»`,
    'line_items[0][price_data][product_data][description]': lang === 'en' ? `${t.pro.en}, name on the wall of founders, founder’s mark, certificate.` : `${t.pro.ru}, имя на стене основателей, значок, сертификат.`,
    customer_email: email,
    'metadata[founder]': id,
    'metadata[tier]': tier,
    'payment_intent_data[description]': `Living Muslim founders ${tier} ${id}`,
    'payment_intent_data[metadata][founder]': id,
    locale: lang === 'en' ? 'en' : 'ru',
    success_url: `${site}/app/?founder=ok&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/app/?founder=cancel`,
    client_reference_id: id,
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }).catch((e) => { console.error('founder-checkout: stripe', e?.message); return null; });
  if (!r) return res.status(502).json({ error: 'stripe' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) { console.error('founder-checkout: stripe', r.status, JSON.stringify(j?.error || j).slice(0, 300)); return res.status(502).json({ error: 'stripe' }); }
  return res.status(200).json({ ok: true, url: j.url, id });
}
