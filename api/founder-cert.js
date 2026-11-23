// The certificate PDF by its code: /api/founder-cert?code=F-0001-K7Q2ZX (the link in the letter and in «Мой вклад»).
// The code is the secret: without it there is no way to list certificates.
import { rpc, certificatePdf, str } from './_founders.js';

export default async function handler(req, res) {
  const code = str(String(req.query?.code || ''), 20).toUpperCase();
  if (!/^F-\d{4}-[A-Z0-9]{4,8}$/.test(code)) return res.status(400).json({ error: 'code' });
  let f = null;
  try { f = await rpc('lm_founder_cert', { p_code: code }); } catch (e) { console.error('founder-cert: rpc', e?.message); }
  if (!f) return res.status(404).json({ error: 'notfound' });
  try {
    const pdf = await certificatePdf(f);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query?.dl ? 'attachment' : 'inline'}; filename="LivingMuslim-${code}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(pdf);
  } catch (e) {
    console.error('founder-cert: pdf', e?.message);
    return res.status(500).json({ error: 'pdf' });
  }
}
