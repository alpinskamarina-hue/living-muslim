// Shared pieces of «Круг основателей»: the levels, Supabase calls, the certificate PDF and the letters.
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Stripe → Developers), SUPABASE_SERVICE_KEY (Supabase → Settings → API,
// service_role: only the webhook uses it), BREVO_API_KEY + BREVO_SENDER (as for /investors), TG_BOT_TOKEN + TG_CHAT_ID.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
export const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
export const SITE = 'https://living-muslim.vercel.app';

/** The levels; amounts in cents. Mirrors _lm_ftier in supabase/founders.sql and src/founders.ts. */
export const TIERS = {
  f100: { amount: 10000, service: 1500, ru: 'Основатель', en: 'Founder', pro: { ru: 'Pro на 3 месяца', en: 'Pro for 3 months' } },
  f250: { amount: 25000, service: 3000, ru: 'Ансар', en: 'Ansar', pro: { ru: 'Pro на год', en: 'Pro for a year' } },
  f500: { amount: 50000, service: 6000, ru: 'Мухсин', en: 'Muhsin', pro: { ru: 'Pro на год + 1 подарочный Pro', en: 'Pro for a year + 1 gift Pro' } },
  f1000: { amount: 100000, service: 10000, ru: 'Партнёр', en: 'Partner', pro: { ru: 'Pro навсегда + 3 подарочных Pro', en: 'Pro forever + 3 gift Pro' } },
};
export const eur = (cents, lang = 'ru') => (lang === 'en' ? `€${(cents / 100).toLocaleString('en-GB')}` : `€${(cents / 100).toLocaleString('ru-RU')}`);

export const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isEmail = (s) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s);

/** A Supabase RPC with the public key (what the app itself may call) or the service key (the webhook). */
export async function rpc(fn, args, service = false) {
  const key = service ? process.env.SUPABASE_SERVICE_KEY : KEY;
  if (!key) throw new Error('no key');
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return r.json();
}

/** The site this request came from (preview or production), for links in letters and Stripe return pages. */
export function siteOf(req) {
  const host = String(req.headers?.host || '');
  return /^living-muslim[\w.-]*\.vercel\.app$/.test(host) ? `https://${host}` : SITE;
}

const dateOf = (iso, lang) => new Date(iso || Date.now()).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const fonts = {};
const font = (name) => (fonts[name] ??= readFileSync(join(process.cwd(), 'api/_fonts', name)));

/** The certificate: A5 landscape, dark emerald, the parchment frame, brass accents. Same look as the mockup. */
export async function certificatePdf(f) {
  const lang = f.lang === 'en' ? 'en' : 'ru';
  const t = TIERS[f.tier] || TIERS.f100;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const serif = await doc.embedFont(font('PTSerif-Bold.woff'), { subset: true });
  const serifR = await doc.embedFont(font('PTSerif-Regular.woff'), { subset: true });
  const sans = await doc.embedFont(font('PTSans-Regular.woff'), { subset: true });
  const sansB = await doc.embedFont(font('PTSans-Bold.woff'), { subset: true });
  const W = 595.28, H = 419.53; // A5 landscape in points
  const p = doc.addPage([W, H]);
  const night = rgb(0.075, 0.25, 0.175), night2 = rgb(0.043, 0.133, 0.098), brass = rgb(0.878, 0.706, 0.361), warm = rgb(0.945, 0.91, 0.847), soft = rgb(0.784, 0.753, 0.682), white = rgb(1, 1, 1);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: night2 });
  p.drawRectangle({ x: 0, y: H * 0.35, width: W, height: H * 0.65, color: night, opacity: 0.55 });
  p.drawRectangle({ x: 14, y: 14, width: W - 28, height: H - 28, borderColor: brass, borderWidth: 0.8, borderOpacity: 0.55 });
  p.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: brass, borderWidth: 0.5, borderOpacity: 0.25 });
  // small diamonds in the corners
  for (const [x, y] of [[34, H - 34], [W - 34, H - 34], [34, 34], [W - 34, 34]]) p.drawSquare({ x: x - 3, y: y - 3, size: 6, color: brass, rotate: { type: 'degrees', angle: 45 }, opacity: 0.9 });

  const T = lang === 'en'
    ? { k: 'LIVING MUSLIM · FOUNDERS CIRCLE', title: 'Founder’s certificate', lead: 'This certifies that', level: 'Level', amount: 'Amount', date: 'Date', gift: 'The privileges of the level are kept in the app: Profile · My contribution.', sig: 'Navo Motors Bulgaria EOOD', who: 'Ilgiz Yusupov, founder', site: 'living-muslim.vercel.app' }
    : { k: 'LIVING MUSLIM · КРУГ ОСНОВАТЕЛЕЙ', title: 'Сертификат основателя', lead: 'Этот сертификат подтверждает, что', level: 'Уровень', amount: 'Сумма', date: 'Дата', gift: 'Привилегии уровня хранятся в приложении: Профиль · Мой вклад.', sig: 'Наво Мотърс България ЕООД', who: 'Ильгиз Юсупов, основатель', site: 'living-muslim.vercel.app' };

  const left = 44;
  p.drawText(T.k, { x: left, y: H - 58, size: 8.5, font: sansB, color: brass, characterSpacing: 2 });
  p.drawText(T.title, { x: left, y: H - 96, size: 30, font: serif, color: warm });
  p.drawText(`№ ${f.no ? `F-${String(f.no).padStart(4, '0')}` : '—'}`, { x: left, y: H - 116, size: 10, font: sans, color: soft, characterSpacing: 1.5 });

  p.drawText(T.lead, { x: left, y: H - 164, size: 11, font: serifR, color: soft });
  let name = f.name || '';
  let size = 28;
  while (size > 14 && serif.widthOfTextAtSize(name, size) > W - left * 2) size -= 1;
  p.drawText(name, { x: left, y: H - 198, size, font: serif, color: white });
  const line = lang === 'en' ? `joined the Founders Circle of Living Muslim at the level «${t.en}» and helped build the app that gathers Muslims around prayer, knowledge and good deeds.`
    : `вошёл в Круг основателей Living Muslim на уровне «${t.ru}» и помог собрать приложение, которое объединяет мусульман вокруг намаза, знания и благих дел.`;
  wrap(p, line, { x: left, y: H - 222, size: 10.5, font: serifR, color: soft, width: W - left * 2, lineHeight: 15 });

  // three facts
  const cols = [[T.level, lang === 'en' ? t.en : t.ru], [T.amount, `${eur(f.amount, lang)} · ${lang === 'en' ? 'recorded' : 'запись'} ${eur(f.contrib, lang)}`], [T.date, dateOf(f.paid, lang)]];
  cols.forEach(([k, v], i) => {
    const x = left + i * ((W - left * 2) / 3);
    p.drawText(k.toUpperCase(), { x, y: 118, size: 7.5, font: sansB, color: brass, characterSpacing: 1.5 });
    p.drawText(v, { x, y: 102, size: 11, font: sansB, color: white });
  });
  wrap(p, T.gift, { x: left, y: 80, size: 8.5, font: sans, color: soft, width: W - left * 2 - 150, lineHeight: 12 });

  // signature
  p.drawText(T.sig, { x: left, y: 44, size: 8.5, font: sans, color: soft });
  p.drawText(T.who, { x: left, y: 31, size: 12, font: serif, color: white });
  p.drawText(`${T.site} · ${f.code || ''}`, { x: W - 44 - sans.widthOfTextAtSize(`${T.site} · ${f.code || ''}`, 8), y: 31, size: 8, font: sans, color: soft });
  // the seal: a brass ring with the crescent-like mark
  p.drawCircle({ x: W - 78, y: 86, size: 26, borderColor: brass, borderWidth: 1.2, borderOpacity: 0.9 });
  p.drawCircle({ x: W - 78, y: 86, size: 21, borderColor: brass, borderWidth: 0.5, borderOpacity: 0.5 });
  p.drawText('Living', { x: W - 78 - serif.widthOfTextAtSize('Living', 9) / 2, y: 88, size: 9, font: serif, color: brass });
  p.drawText('Muslim', { x: W - 78 - serif.widthOfTextAtSize('Muslim', 9) / 2, y: 77, size: 9, font: serif, color: brass });
  return Buffer.from(await doc.save());
}

function wrap(page, text, o) {
  const words = text.split(' ');
  let line = '', y = o.y;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (o.font.widthOfTextAtSize(next, o.size) > o.width && line) { page.drawText(line, { x: o.x, y, size: o.size, font: o.font, color: o.color }); line = w; y -= o.lineHeight; }
    else line = next;
  }
  if (line) page.drawText(line, { x: o.x, y, size: o.size, font: o.font, color: o.color });
}

export async function brevo(payload, tag = 'founders') {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) console.error(`${tag}: brevo`, r.status, (await r.text().catch(() => '')).slice(0, 300), 'to', payload.to?.map((x) => x.email).join(','));
  else console.log(`${tag}: brevo sent to`, payload.to?.map((x) => x.email).join(','));
  return r.ok;
}

export async function telegram(text, tag = 'founders') {
  const token = process.env.TG_BOT_TOKEN;
  const chats = String(process.env.TG_CHAT_ID || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!token || !chats.length) return false;
  const res = await Promise.all(chats.map((chat_id) => fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  }).then((r) => r.ok).catch(() => false)));
  if (!res.every(Boolean)) console.error(`${tag}: telegram send failed`);
  return res.some(Boolean);
}

/** The letter to a new founder: certificate attached, gift codes, where to find everything in the app. */
export function founderMail(f, site) {
  const lang = f.lang === 'en' ? 'en' : 'ru';
  const t = TIERS[f.tier] || TIERS.f100;
  const gifts = (f.gifts || []).map((g) => g.code);
  const T = lang === 'en' ? {
    subject: `Living Muslim: welcome to the Founders Circle, certificate ${f.code}`,
    hi: `Assalamu alaikum, ${f.name}!`,
    body: `JazakAllahu khairan. You are now in the Founders Circle of Living Muslim at the level «${t.en}» (${eur(f.amount, 'en')}). Your certificate № F-${String(f.no).padStart(4, '0')} is attached and is always in the app: Profile → My contribution.`,
    pro: `What is open for you: ${t.pro.en}, your name on the wall of founders${f.wall ? ` («${f.wall}»)` : ' (you chose to stay anonymous)'}, the founder’s mark next to your nick.`,
    gifts: gifts.length ? `Gift Pro codes for people close to you (a year of Pro each): ${gifts.join(', ')}. The person enters the code in the app: Profile → My contribution → I have a gift code.` : '',
    btn: 'Open My contribution', cert: 'Download the certificate (PDF)',
    disc: 'The Founders Circle is a purchase of a founder’s package (privileges), not a share in the company and not a promise of income. Receipt: a separate email from Stripe.',
  } : {
    subject: `Living Muslim: добро пожаловать в Круг основателей, сертификат ${f.code}`,
    hi: `Ассаляму алейкум, ${f.name}!`,
    body: `ДжазакаЛлаху хайран. Теперь вы в Круге основателей Living Muslim на уровне «${t.ru}» (${eur(f.amount)}). Ваш сертификат № F-${String(f.no).padStart(4, '0')} во вложении, он всегда лежит в приложении: Профиль → Мой вклад.`,
    pro: `Что открыто: ${t.pro.ru}, имя на стене основателей${f.wall ? ` («${f.wall}»)` : ' (вы выбрали остаться анонимно)'}, значок основателя рядом с ником.`,
    gifts: gifts.length ? `Подарочные коды Pro для близких (по году Pro каждый): ${gifts.join(', ')}. Человек вводит код в приложении: Профиль → Мой вклад → У меня есть подарочный код.` : '',
    btn: 'Открыть «Мой вклад»', cert: 'Скачать сертификат (PDF)',
    disc: 'Круг основателей это покупка пакета основателя (привилегий), не доля в компании и не обещание дохода. Чек придёт отдельным письмом от Stripe.',
  };
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#2B2219;line-height:1.5">
<div style="background:#11553A;color:#F1E8D8;padding:24px 28px;border-radius:16px 16px 0 0"><b style="font-size:20px">Living Muslim</b><div style="font-size:12px;letter-spacing:2px;color:#E0B45C;margin-top:4px">${lang === 'en' ? 'FOUNDERS CIRCLE' : 'КРУГ ОСНОВАТЕЛЕЙ'}</div></div>
<div style="background:#FFFBF4;border:1px solid #E3D5BC;border-top:0;padding:24px 28px;border-radius:0 0 16px 16px">
<p>${esc(T.hi)}</p><p>${esc(T.body)}</p><p>${esc(T.pro)}</p>${T.gifts ? `<p style="background:#F6EFE3;border-radius:12px;padding:12px 14px"><b>${esc(T.gifts)}</b></p>` : ''}
<p style="margin:24px 0"><a href="${site}/app/?founder=mine" style="background:#11553A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${T.btn}</a>
&nbsp; <a href="${site}/api/founder-cert?code=${encodeURIComponent(f.code)}" style="color:#11553A;font-weight:bold">${T.cert}</a></p>
<p style="font-size:12px;color:#9C9482;margin-top:24px">${T.disc}</p></div></div>`;
  return { subject: T.subject, html };
}
