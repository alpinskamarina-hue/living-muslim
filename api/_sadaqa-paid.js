// Stripe events for «Подари Pro» and «Поддержать» (called from api/_founder-paid.js, the one webhook):
//   checkout.session.completed with metadata.sadaqa → lm_sadaqa_paid (first payment; months go to people who asked)
//   invoice.paid (billing_reason subscription_cycle) → lm_sadaqa_renew (every next month)
//   customer.subscription.deleted → lm_sadaqa_end
// In Stripe → Webhooks the endpoint needs these three events next to checkout.session.completed.
import { rpc, telegram } from './_founders.js';

const subOfInvoice = (inv) => inv.subscription || inv.parent?.subscription_details?.subscription || null;
const metaOfInvoice = (inv) => inv.subscription_details?.metadata || inv.parent?.subscription_details?.metadata || inv.lines?.data?.[0]?.metadata || {};

export async function sadaqaEvent(ev, res) {
  const o = ev.data?.object || {};
  try {
    if (ev.type === 'checkout.session.completed') {
      const id = o.metadata?.sadaqa;
      if (o.payment_status !== 'paid') return res.status(200).json({ ok: true, skipped: 'unpaid' });
      const p = await rpc('lm_sadaqa_paid', { p_id: id, p_session: o.id, p_sub: o.subscription || null, p_amount: o.amount_total ?? null }, true);
      if (!p || p.error) { console.error('sadaqa-paid: not granted', JSON.stringify(p)); return res.status(200).json({ ok: false }); }
      console.log('sadaqa-paid', p.kind, p.eur, p.mode);
      await telegram([p.kind === 'gift' ? '<b>Подарили Pro</b> 🤲' : '<b>Новый сторонник</b> 💚', `€${p.eur}${p.mode === 'month' ? ' каждый месяц' : ''}`,
        p.kind === 'gift' ? `Открыто людям: ${p.opened}, ждёт в запасе: ${p.pooled}` : `На стене: ${p.wall || 'анонимно'}`, '', 'Все: Профиль → Для владельца → Садака'].join('\n')).catch(() => false);
      return res.status(200).json({ ok: true });
    }
    if (ev.type === 'invoice.paid') {
      if (o.billing_reason !== 'subscription_cycle') return res.status(200).json({ ok: true, skipped: o.billing_reason });
      const p = await rpc('lm_sadaqa_renew', { p_sub: subOfInvoice(o), p_id: metaOfInvoice(o).sadaqa || null, p_invoice: o.id }, true);
      return res.status(200).json({ ok: !p?.error });
    }
    if (ev.type === 'customer.subscription.deleted') {
      await rpc('lm_sadaqa_end', { p_sub: o.id }, true);
      return res.status(200).json({ ok: true });
    }
  } catch (e) { console.error('sadaqa-paid', ev.type, e?.message); return res.status(500).json({ error: 'save' }); }
  return res.status(200).json({ ok: true, skipped: ev.type });
}

/** True when this event belongs to «Подари Pro» / «Поддержать», not to the founders. */
export function isSadaqaEvent(ev) {
  const o = ev.data?.object || {};
  if (ev.type === 'checkout.session.completed') return Boolean(o.metadata?.sadaqa);
  return ev.type === 'invoice.paid' || ev.type === 'customer.subscription.deleted';
}
