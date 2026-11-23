// «Подари Pro тому, кто просит» and «Поддержать Living Muslim» (served by api/invest.js op=sadaqa): the app sends the
// choice, we write a pending record (lm_sadaqa_prepare) and open Stripe Checkout, once or every month.
// The webhook is the founders' one (op=paid, api/_founder-paid.js): it sees metadata.sadaqa and calls api/_sadaqa-paid.js.
// Without STRIPE_SECRET_KEY the answer is {error:'nostripe'}.
import { str, rpc, siteOf, rawBody } from './_founders.js';

const MONTHS = { 5: 1, 10: 2, 20: 5, 50: 16 };

export function productOf(kind, eur, lang) {
  const en = lang === 'en';
  if (kind === 'gift') {
    const m = MONTHS[eur];
    const what = eur === 50 ? (en ? 'a year of Pro for one person and 4 months for another' : 'год Pro одному человеку и 4 месяца другому')
      : en ? `${m} month${m > 1 ? 's' : ''} of Pro for a person who asked` : `${m} ${m === 1 ? 'месяц' : m < 5 ? 'месяца' : 'месяцев'} Pro для того, кто попросил`;
    return { name: en ? 'Living Muslim · Pro as a gift' : 'Living Muslim · Pro в подарок', description: en ? `${what[0].toUpperCase()}${what.slice(1)}.` : `${what[0].toUpperCase()}${what.slice(1)}.` };
  }
  // A privileges package, like the founders (the legal thread's note, 23.11): no «пожертвование», «вклад» or shares.
  return { name: en ? 'Living Muslim · Supporter package' : 'Living Muslim · Пакет «Сторонник»', description: en ? 'The «Supporter» mark in the profile and a name on the wall of supporters.' : 'Значок «Сторонник» в профиле и имя на стене сторонников.' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  let b = req.body;
  if (b === undefined) b = await rawBody(req);
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const kind = b.kind === 'support' ? 'support' : b.kind === 'gift' ? 'gift' : '';
  const eur = Number(b.eur);
  const mode = b.mode === 'month' ? 'month' : 'once';
  const sign = b.sign === 'nick' ? 'nick' : 'secret';
  const wall = str(b.wall, 40), lang = b.lang === 'en' ? 'en' : 'ru';
  const uid = str(b.uid, 40), token = str(b.token, 80);
  if (!kind || !MONTHS[eur] || !uid || !token) return res.status(400).json({ error: 'input' });

  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return res.status(503).json({ error: 'nostripe' });

  let id = null;
  try { id = await rpc('lm_sadaqa_prepare', { p_uid: uid, p_token: token, p_kind: kind, p_eur: eur, p_mode: mode, p_sign: sign, p_wall: wall, p_lang: lang }); }
  catch (e) { console.error('sadaqa-checkout: prepare', e?.message); }
  if (!id) return res.status(400).json({ error: 'prepare' });

  const p = productOf(kind, eur, lang);
  const site = siteOf(req);
  const form = new URLSearchParams({
    mode: mode === 'month' ? 'subscription' : 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(eur * 100),
    'line_items[0][price_data][product_data][name]': p.name,
    'line_items[0][price_data][product_data][description]': p.description,
    'metadata[sadaqa]': id,
    'metadata[kind]': kind,
    locale: lang === 'en' ? 'en' : 'ru',
    success_url: `${site}/app/?sadaqa=ok&k=${kind}`,
    cancel_url: `${site}/app/?sadaqa=cancel&k=${kind}`,
    client_reference_id: id,
  });
  if (mode === 'month') {
    form.set('line_items[0][price_data][recurring][interval]', 'month');
    form.set('subscription_data[metadata][sadaqa]', id);
  } else {
    form.set('payment_intent_data[description]', `Living Muslim ${kind} ${id}`);
    form.set('payment_intent_data[metadata][sadaqa]', id);
  }
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }).catch((e) => { console.error('sadaqa-checkout: stripe', e?.message); return null; });
  if (!r) return res.status(502).json({ error: 'stripe' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) { console.error('sadaqa-checkout: stripe', r.status, JSON.stringify(j?.error || j).slice(0, 300)); return res.status(502).json({ error: 'stripe' }); }
  return res.status(200).json({ ok: true, url: j.url, id });
}
