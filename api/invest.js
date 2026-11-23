// Investors and «Круг основателей», one function for four calls (the Hobby plan allows 12 functions per deployment):
//   POST /api/invest?op=lead        a deck request from /investors       (api/_invest-lead.js)
//   POST /api/invest?op=checkout    the app opens Stripe Checkout        (api/_founder-checkout.js)
//   POST /api/invest?op=paid        the Stripe webhook                   (api/_founder-paid.js)
//   GET  /api/invest?op=cert&code=  the certificate PDF by its code      (api/_founder-cert.js)
// The body is left raw (the webhook checks Stripe's signature over it); the others parse their JSON themselves.
import lead from './_invest-lead.js';
import checkout from './_founder-checkout.js';
import paid from './_founder-paid.js';
import cert from './_founder-cert.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const op = String(req.query?.op || '');
  if (op === 'paid') return paid(req, res);
  if (op === 'cert') return cert(req, res);
  if (op === 'checkout') return checkout(req, res);
  if (op === 'lead') return lead(req, res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({ error: 'op' });
}
