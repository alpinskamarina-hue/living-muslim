import { useState } from 'react';
import type { AppState, UmrahState } from '../types';
import { uid } from '../store';
import { umrahOf } from './Umrah';
import { _t, _tj, LOC } from '../i18n';

// After the umrah: a picture to share, forty days to keep the state, and a diary that comes back in a year.

const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const dl = (d: string) => new Date(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' });
type Props = { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string };

/** Story picture, 1080×1920, drawn on a canvas so it works offline and needs no server. */
async function storyPng(u: UmrahState, from?: string, to?: string): Promise<Blob | null> {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const x = c.getContext('2d'); if (!x) return null;
  const g = x.createLinearGradient(0, 0, 1080, 1920); g.addColorStop(0, '#0f5132'); g.addColorStop(1, '#0b1510');
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  // Kaaba from above, as on the counter, with seven gold rings.
  for (let i = 6; i >= 0; i--) { x.beginPath(); x.arc(540, 700, 150 + i * 34, 0, Math.PI * 2); x.strokeStyle = `rgba(217,173,85,${0.25 + i * 0.1})`; x.lineWidth = 14; x.stroke(); }
  x.save(); x.translate(540, 700); x.rotate(Math.PI / 4); x.fillStyle = '#111'; x.fillRect(-100, -88, 200, 176); x.strokeStyle = '#c9a24a'; x.lineWidth = 10; x.strokeRect(-82, -70, 164, 140); x.restore();
  x.textAlign = 'center'; x.fillStyle = '#f1f6f0';
  x.font = '600 40px Manrope, sans-serif'; x.globalAlpha = .7; x.fillText('LIVING MUSLIM', 540, 150); x.globalAlpha = 1;
  x.font = '700 120px "Cormorant Garamond", Georgia, serif'; x.fillText(_t("Моя умра"), 540, 1170);
  const days = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : 0;
  x.font = '500 44px Manrope, sans-serif'; x.globalAlpha = .85;
  if (from) { const dm = (d: string) => new Date(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long' }); x.fillText(`${dm(from)}${to ? ' — ' + dm(to) : ''} ${new Date(to ?? from).getFullYear()}`, 540, 1250); } x.globalAlpha = 1;
  const duas = u.duas.filter((d) => d.done).length + (u.asked?.length ?? 0);
  const stats: [string, string][] = [[String(7), _t("кругов тавафа")], [String(duas), _t("дуа за близких")], [days ? String(days) : '—', _t("дней")]];
  stats.forEach(([n, l], i) => {
    const cx = 220 + i * 320;
    x.fillStyle = '#d9ad55'; x.font = '700 110px "Cormorant Garamond", Georgia, serif'; x.fillText(n, cx, 1460);
    x.fillStyle = '#f1f6f0'; x.font = '500 36px Manrope, sans-serif'; x.fillText(l, cx, 1520);
  });
  x.fillStyle = '#d9ad55'; x.font = '64px Amiri, serif'; x.fillText('لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ', 540, 1700);
  x.fillStyle = '#f1f6f0'; x.globalAlpha = .7; x.font = '500 34px Manrope, sans-serif'; x.fillText(_t("Да примет Аллах"), 540, 1780);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

export function StoryButton({ state, from, to }: { state: AppState; from?: string; to?: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await document.fonts?.ready;
      const b = await storyPng(umrahOf(state), from, to); if (!b) return;
      const file = new File([b], 'moya-umra.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: _t("Моя умра") }).catch(() => {});
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click(); }
    } finally { setBusy(false); }
  };
  return <button type="button" className="gold-btn af-story" onClick={go} disabled={busy}>{busy ? _t("Готовлю…") : _t("🕋 Картинка «Моя умра» для сторис")}</button>;
}

const KEEP = [_t("Ночной намаз, хотя бы 2 ракаата"), _t("Коран после Фаджра"), _t("Дуа перед сном за тех, кто просил"), _t("Садака каждый день, хоть немного"), _t("Намаз в мечети, где можно")];

export function FortyDays({ state, update, today }: Props) {
  const u = umrahOf(state);
  const k = u.keep;
  if (!k) return (
    <div className="pp-card">
      <div className="pp-top"><b>{_t("40 дней после умры")}</b></div>
      <small className="pp-tip">{_t("Выбери одну привычку из поездки и сохрани её 40 дней, чтобы состояние не ушло.")}</small>
      <div className="af-keep">{KEEP.map((t) => <button key={t} type="button" onClick={() => update((s) => patch(s, { keep: { what: t, start: today, days: [] } }))}>{t}</button>)}</div>
    </div>
  );
  const n = Math.min(40, Math.round((Date.parse(today) - Date.parse(k.start)) / 86400000) + 1);
  const done = k.days.includes(today);
  return (
    <div className="pp-card">
      <div className="pp-top"><b>{_tj("40 дней: {0}", k.what)}</b><small>{_tj("день {0} из 40", n)}</small></div>
      <div className="af-grid">{Array.from({ length: 40 }, (_, i) => { const d = new Date(Date.parse(k.start) + i * 86400000).toISOString().slice(0, 10); return <i key={i} data-on={k.days.includes(d)} data-today={d === today} />; })}</div>
      <small className="pp-tip">{_tj("{0} из {1} дней сделано. Пропустил день? Не пропускай второй.", k.days.length, n)}</small>
      <button type="button" className={`pp-btn${done ? ' on' : ''}`} onClick={() => update((s) => { const c = umrahOf(s).keep!; return patch(s, { keep: { ...c, days: done ? c.days.filter((x) => x !== today) : [...c.days, today] } }); })}>{done ? _t("✓ Сегодня сделано") : _t("Сегодня сделал")}</button>
      <button type="button" className="link-btn" onClick={() => update((s) => patch(s, { keep: undefined }))}>{_t("Выбрать другую")}</button>
    </div>
  );
}

export function Diary({ state, update, today, prompt }: Props & { prompt?: string }) {
  const u = umrahOf(state);
  const [text, setText] = useState('');
  const list = [...(u.diary ?? [])].reverse();
  const add = () => { if (!text.trim()) return; update((s) => patch(s, { diary: [...(umrahOf(s).diary ?? []), { id: uid(), d: today, text: text.trim() }] })); setText(''); };
  return (
    <div className="pp-card">
      <div className="pp-top"><b>{_t("Дневник паломника")}</b><small>{_tj("{0} записей", list.length)}</small></div>
      <textarea className="af-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={prompt ?? _t("Что ты почувствовал сегодня? О чём просил? Пара строк, чтобы через год вспомнить.")} />
      <button type="button" className="pp-btn" onClick={add} disabled={!text.trim()}>{_t("Записать")}</button>
      {list.slice(0, 5).map((e) => <div key={e.id} className="af-entry"><small>{dl(e.d)}</small><p>{e.text}</p></div>)}
      <small className="pp-tip">{_t("Записи только на твоём телефоне. Через год приложение напомнит о них.")}</small>
    </div>
  );
}

/** "A year ago you were at the Kaaba": shown on the anniversary week of a diary entry. */
export function YearAgo({ state, today }: { state: AppState; today: string }) {
  const hit = (umrahOf(state).diary ?? []).filter((e) => { const k = (Date.parse(today) - Date.parse(e.d)) / 86400000; return k >= 362 && k <= 369; });
  if (!hit.length) return null;
  return (
    <div className="af-year">
      <b>{_t("Год назад ты был в умре")}</b>
      {hit.slice(0, 2).map((e) => <p key={e.id}>«{e.text}» <small>{dl(e.d)}</small></p>)}
      <small>{_t("Сделай сегодня дуа, чтобы Аллах позвал тебя снова.")}</small>
    </div>
  );
}
