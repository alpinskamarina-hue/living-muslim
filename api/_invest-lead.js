// /investors form: saves the request (Supabase lm_invest_lead, see supabase/invest.sql) and, when Brevo is
// configured, emails the investor deck to the person and a copy of the request to the owner.
// Env: BREVO_API_KEY (Brevo → SMTP & API → API keys), BREVO_SENDER (a sender address verified in Brevo),
// INVEST_NOTIFY (where the copy of each request goes, several addresses comma-separated; default BREVO_SENDER).
// Telegram: TG_BOT_TOKEN (from @BotFather) and TG_CHAT_ID (the owner's chat id, several comma-separated): each request
// also comes as a Telegram message, with or without Brevo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const SITE = 'https://living-muslim.vercel.app';
const DECK_PATH = '/investors/LivingMuslim-deck-q7m4x2.pdf';
let pdf = null; // the PDF goes with the function (vercel.json includeFiles) and is attached as a file
const deckFile = () => (pdf ??= readFileSync(join(process.cwd(), 'landing/investors-deck.pdf')).toString('base64'));
/** The PDF as an attachment; if the file is not with the function, the letter still goes out with the link. */
const attachment = () => { try { return { attachment: [{ content: deckFile(), name: 'LivingMuslim-investors.pdf' }] }; } catch (e) { console.error('invest-lead: deck file missing', e?.message); return {}; } };

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isEmail = (s) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s);

const TEXT = {
  ru: {
    subject: 'Living Muslim — презентация для инвесторов',
    hi: (n) => `Ассаляму алейкум, ${n}!`,
    body: 'Спасибо за интерес к Living Muslim. Презентация во вложении: рынок, экономика на 3 года, условия раунда и что получает партнёр.',
    link: 'Открыть презентацию',
    next: 'Основатель свяжется с вами в ближайшие дни, иншаАллах. Если есть вопросы, просто ответьте на это письмо.',
    disc: 'Не является публичной офертой, предложением ценных бумаг или инвестиционной рекомендацией. Вложения в ранний проект связаны с высоким риском, вплоть до полной потери. Цифры — оценки, не прогноз доходности.'
  },
  en: {
    subject: 'Living Muslim — investor presentation',
    hi: (n) => `Assalamu alaikum, ${n}!`,
    body: 'Thank you for your interest in Living Muslim. The presentation is attached (in Russian): market, 3-year economics, round terms and what a partner receives.',
    link: 'Open the presentation',
    next: 'The founder will contact you within a few days, insha’Allah. If you have questions, simply reply to this email.',
    disc: 'This is not a public offer, an offer of securities or investment advice. Investing in an early-stage project carries high risk, up to total loss. Figures are estimates, not a forecast of returns.'
  }
};

/** Who gets the copy of a request: INVEST_NOTIFY (comma-separated), else the sender address itself. */
const notifyTo = (sender) => {
  const list = String(process.env.INVEST_NOTIFY || '').split(',').map((x) => x.trim()).filter(isEmail);
  return (list.length ? list : [sender]).map((e) => ({ email: e }));
};

/** The request as a Telegram message to the owner (TG_BOT_TOKEN + TG_CHAT_ID). */
async function telegram(rows) {
  const token = process.env.TG_BOT_TOKEN;
  const chats = String(process.env.TG_CHAT_ID || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!token || !chats.length) return false;
  const text = ['<b>Новая заявка инвестора</b> (/investors)', ...rows.filter((r) => r[1]).map((r) => `<b>${r[0]}:</b> ${esc(r[1])}`), '', 'Все заявки: Supabase → Table Editor → invest_leads'].join('\n');
  const res = await Promise.all(chats.map((chat_id) => fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true })
  }).then((r) => r.ok).catch(() => false)));
  if (!res.every(Boolean)) console.error('invest-lead: telegram send failed');
  return res.some(Boolean);
}

function mail(t, name, deck) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#2B2219;line-height:1.5">
<div style="background:#11553A;color:#F1E8D8;padding:24px 28px;border-radius:16px 16px 0 0"><b style="font-size:20px">Living Muslim</b></div>
<div style="background:#FFFBF4;border:1px solid #E3D5BC;border-top:0;padding:24px 28px;border-radius:0 0 16px 16px">
<p>${esc(t.hi(name))}</p><p>${t.body}</p>
<p style="margin:24px 0"><a href="${deck}" style="background:#11553A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${t.link}</a></p>
<p>${t.next}</p>
<p style="font-size:12px;color:#9C9482;margin-top:24px">${t.disc}</p></div></div>`;
}

async function brevo(payload) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  // Brevo answers 201 with a messageId; anything else is logged so the owner can see why a letter did not go out
  if (!r.ok) console.error('invest-lead: brevo', r.status, (await r.text().catch(() => '')).slice(0, 300), 'to', payload.to?.map((x) => x.email).join(','));
  else console.log('invest-lead: brevo sent to', payload.to?.map((x) => x.email).join(','));
  return r.ok;
}

import { rawBody } from './_founders.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  let b = req.body;
  if (b === undefined) b = await rawBody(req); // api/invest.js leaves the body raw
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (str(b.website, 100)) return res.status(200).json({ ok: true }); // honeypot
  const lang = b.lang === 'en' ? 'en' : 'ru';
  const name = str(b.name, 60), email = str(b.email, 120).toLowerCase(), phone = str(b.phone, 40);
  if (!name || !isEmail(email)) return res.status(400).json({ error: 'input' });
  const contact = phone ? `${email} · ${phone}` : email;

  const saved = await fetch(`${SB}/rest/v1/rpc/lm_invest_lead`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_name: name, p_contact: contact, p_country: str(b.country, 60), p_amount: str(b.amount, 40), p_about: str(b.about, 1000), p_lang: lang })
  }).then((r) => r.ok).catch(() => false);
  if (!saved) return res.status(502).json({ error: 'save' });

  const rowsBase = [['Имя', name], ['Почта', email], ['Телефон', phone], ['Страна', str(b.country, 60)], ['Сумма', str(b.amount, 40)], ['О себе', str(b.about, 1000)], ['Язык', lang]];
  await telegram(rowsBase).catch(() => false);

  const sender = process.env.BREVO_SENDER;
  if (!process.env.BREVO_API_KEY || !sender) { console.log('invest-lead: no BREVO env, mail skipped'); return res.status(200).json({ ok: true, mailed: false }); }
  const t = TEXT[lang];
  const host = String(req.headers?.host || '');
  const deck = (/^living-muslim[\w.-]*\.vercel\.app$/.test(host) ? `https://${host}` : SITE) + DECK_PATH;
  const mailed = await brevo({
    sender: { name: 'Living Muslim', email: sender },
    replyTo: { email: sender, name: 'Living Muslim' },
    to: [{ email, name }],
    subject: t.subject,
    htmlContent: mail(t, name, deck),
    ...attachment()
  }).catch((e) => { console.error('invest-lead: mail to investor failed', e?.message); return false; });
  const rows = [...rowsBase, ['Презентация отправлена', mailed ? 'да' : 'нет']];
  await brevo({
    sender: { name: 'Living Muslim', email: sender },
    to: notifyTo(sender),
    replyTo: { email, name },
    subject: `Новая заявка инвестора: ${name}`,
    htmlContent: `<div style="font-family:Arial,sans-serif"><h3>Новая заявка с /investors</h3><table cellpadding="6">${rows.filter((r) => r[1]).map((r) => `<tr><td style="color:#6E5E49">${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table><p>Все заявки: Supabase → Table Editor → invest_leads.</p></div>`
  }).catch((e) => { console.error('invest-lead: owner copy failed', e?.message); return false; });
  return res.status(200).json({ ok: true, mailed });
}
