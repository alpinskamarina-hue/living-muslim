import { useState } from 'react';
import { _t } from '../i18n';

/**
 * Clear share buttons: WhatsApp, Telegram, copy, and the phone's own share sheet.
 * Messenger links open the app on a phone (or the web version on a computer) with the text ready to send.
 */
export function ShareRow({ text, url, compact }: { text: string; url: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const full = text.includes(url) ? text : `${text} ${url}`;
  const bare = text.replace(url, '').trim();
  const wa = `https://wa.me/?text=${encodeURIComponent(full)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(bare)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(full); } catch {
      const t = document.createElement('textarea'); t.value = full; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* */ } t.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const more = () => { navigator.share?.({ title: 'Living Muslim', text: bare, url }).catch(() => {}); };
  return (
    <div className={`share-row${compact ? ' compact' : ''}`}>
      <a className="sh-btn wa" href={wa} target="_blank" rel="noopener noreferrer">
        <span className="sh-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z" /><path d="M9 8.6c0 3.4 2.9 6.4 6.3 6.4l1.2-1.4-1.9-1-.9.8c-1-.4-2.2-1.6-2.6-2.6l.8-.9-1-1.9z" fill="currentColor" stroke="none" /></svg>
        </span>
        <span>WhatsApp</span>
      </a>
      <a className="sh-btn tg" href={tg} target="_blank" rel="noopener noreferrer">
        <span className="sh-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20.7 4.3 2.9 11.2c-.9.4-.9 1.6.1 1.9l4.4 1.4 1.7 5.3c.2.7 1.1.9 1.6.3l2.5-2.6 4.6 3.4c.6.4 1.4.1 1.6-.6l3-14.4c.2-.8-.6-1.4-1.3-1.1zM9.6 14.2l8.2-7.3-6.7 8.5-.3 2.7z" /></svg>
        </span>
        <span>Telegram</span>
      </a>
      <button type="button" className="sh-btn cp" onClick={copy}>
        <span className="sh-ic" aria-hidden="true">
          {copied
            ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
            : <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>}
        </span>
        <span>{copied ? _t("Готово") : _t("Ссылка")}</span>
      </button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button type="button" className="sh-btn mo" onClick={more}>
          <span className="sh-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
          </span>
          <span>{_t("Ещё")}</span>
        </button>
      )}
    </div>
  );
}
