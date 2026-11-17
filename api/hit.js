// Anonymous visit counter. The browser sends a random id, the page and where it came from;
// country and city come from Vercel's edge headers. No IP address is stored anywhere.
const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse/i;

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (BOTS.test(req.headers['user-agent'] || '')) return res.status(204).end();
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  let city = '';
  try { city = decodeURIComponent(str(req.headers['x-vercel-ip-city'], 120)); } catch { /* keep empty */ }
  try {
    await fetch(`${SB}/rest/v1/rpc/lm_hit`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_vid: str(b.vid, 40), p_page: str(b.page, 20), p_ref: str(b.ref, 80), p_utm: str(b.utm, 60),
        p_country: str(req.headers['x-vercel-ip-country'], 2), p_city: city.slice(0, 60),
        p_device: str(b.device, 10), p_lang: str(b.lang, 5),
      }),
    });
  } catch { /* counting must never break the page */ }
  res.status(204).end();
}
