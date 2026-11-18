import { useEffect, useRef, useState } from 'react';
import type { AppState, UmrahState } from '../types';
import type { UmrahApi, URsvp } from '../umrahCircle';
import { umrahOf } from './Umrah';
import { deleteFile, getFile, putFile } from '../idb';
import { uid } from '../store';
import { _t, _tj } from '../i18n';

// «Документы»: passport, visa, tickets, hotel, insurance as photos or PDFs. The files stay on this phone
// (IndexedDB) and work without internet; the group only sees checkmarks in each person's trip answer.

type Doc = NonNullable<UmrahState['docs']>[number];
const KINDS: { k: string; ic: string; t: string; sub: string; until?: string }[] = [
  { k: 'passport', ic: '🛂', t: _t("Загранпаспорт"), sub: _t("разворот с фото"), until: _t("Действует до") },
  { k: 'visa', ic: '📄', t: _t("Виза"), sub: _t("eVisa или виза на умру") },
  { k: 'nusuk', ic: '🕋', t: _t("Разрешение Nusuk"), sub: _t("слот на умру, по желанию Равда") },
  { k: 'ticket', ic: '✈', t: _t("Билеты"), sub: _t("туда и обратно") },
  { k: 'hotel', ic: '🏨', t: _t("Бронь отеля"), sub: _t("Мекка и Медина") },
  { k: 'insurance', ic: '🩺', t: _t("Страховка"), sub: _t("на все дни поездки"), until: _t("Покрывает до") },
  { k: 'vaccine', ic: '💉', t: _t("Прививки"), sub: _t("менингит ACYW, если просят") },
  { k: 'other', ic: '📎', t: _t("Другое"), sub: _t("доверенность, справки, копии") },
];
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const addMonths = (d: string, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Photos are shrunk to keep the phone light: longest side 1800px, JPEG. */
async function shrink(f: File): Promise<Blob> {
  if (!f.type.startsWith('image/') || f.size < 400_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return b && b.size < f.size ? b : f;
  } catch { return f; }
}

interface Props {
  state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string;
  api: UmrahApi; hosts: string[]; host: string | null; going: string[]; canSee: boolean; nameOf: (id: string) => string; to?: string;
}

export function UmrahDocs({ state, update, today, api, hosts, host, going, canSee, nameOf, to }: Props) {
  const u = umrahOf(state);
  const docs = u.docs ?? [];
  const [kind, setKind] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<{ url: string; d: Doc } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (view) URL.revokeObjectURL(view.url); }, [view]);
  const end = to ?? today;
  const of = (k: string) => docs.filter((d) => d.kind === k);

  // Uploading marks the trip checklist for the group: visa, passport, ticket bought, hotel.
  const mark = (kinds: string[]) => {
    for (const h of hosts) {
      const cur: URsvp | undefined = api.me ? api.rsvp[api.me]?.[h] : undefined;
      const ids = new Set(cur?.docs ?? []);
      for (const k of kinds) if (['passport', 'visa', 'insurance', 'nusuk'].includes(k)) ids.add(k);
      if (ids.has('passport') && ids.has('visa')) ids.add('copies');
      const p: Partial<URsvp> = {};
      if ([...ids].sort().join() !== [...(cur?.docs ?? [])].sort().join()) p.docs = [...ids];
      if (kinds.includes('ticket') && !cur?.bought) p.bought = true;
      if (kinds.includes('hotel') && !cur?.hotel) p.hotel = true;
      if (Object.keys(p).length) api.respond(h, p);
    }
  };

  const pickFor = (k: string) => { setKind(k); setErr(''); file.current?.click(); };
  const onFile = async (fl: FileList | null) => {
    const k = kind; if (!fl?.length || !k) return;
    const added: Doc[] = [];
    for (const f of Array.from(fl)) {
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') { setErr(_t("Можно фото или PDF")); continue; }
      if (f.size > 10 * 1048576) { setErr(_t("Файл больше 10 MB, сожми его или сфотографируй")); continue; }
      const b = await shrink(f);
      const id = uid();
      try { await putFile(`um:${id}`, b); } catch { setErr(_t("Не получилось сохранить на телефоне")); continue; }
      added.push({ id, kind: k, name: f.name, type: b.type || f.type, size: b.size, added: today });
    }
    if (file.current) file.current.value = '';
    if (!added.length) return;
    update((s) => patch(s, { docs: [...(umrahOf(s).docs ?? []), ...added] }));
    mark([...new Set(added.map((d) => d.kind)), ...docs.map((d) => d.kind)]);
  };
  const open = async (d: Doc) => {
    const b = await getFile(`um:${d.id}`).catch(() => undefined);
    if (!b) { setErr(_t("Файла нет на этом телефоне")); return; }
    const url = URL.createObjectURL(b);
    if (d.type === 'application/pdf') { window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    else setView({ url, d });
  };
  const del = async (d: Doc) => {
    await deleteFile(`um:${d.id}`);
    update((s) => patch(s, { docs: (umrahOf(s).docs ?? []).filter((x) => x.id !== d.id) }));
    setView(null);
  };
  const setUntil = (k: string, v: string) => update((s) => patch(s, { docs: (umrahOf(s).docs ?? []).map((x) => (x.kind === k ? { ...x, until: v || undefined } : x)) }));

  // Checks: passport valid 6 months after return, insurance covers the last day.
  const warn = (k: string) => {
    const until = of(k).find((d) => d.until)?.until;
    if (!until) return '';
    if (k === 'passport' && until < addMonths(end, 6)) return _t("Паспорт должен действовать ещё 6 месяцев после возвращения");
    if (k === 'insurance' && until < end) return _t("Страховка кончается раньше возвращения");
    return '';
  };
  const have = KINDS.filter((x) => of(x.k).length).length;

  const r = (id: string) => (host ? api.rsvp[id]?.[host] : undefined);
  const COLS: { t: string; ok: (id: string) => boolean }[] = [
    { t: _t("Паспорт"), ok: (id) => Boolean(r(id)?.docs?.includes('passport')) },
    { t: _t("Виза"), ok: (id) => Boolean(r(id)?.docs?.includes('visa')) },
    { t: 'Nusuk', ok: (id) => Boolean(r(id)?.docs?.includes('nusuk')) },
    { t: _t("Билет"), ok: (id) => Boolean(r(id)?.bought) },
    { t: _t("Отель"), ok: (id) => Boolean(r(id)?.hotel) },
    { t: _t("Страх."), ok: (id) => Boolean(r(id)?.docs?.includes('insurance')) },
  ];

  return (
    <div className="um-sec udoc">
      <div className="um-title"><h1>{_t("Документы")}</h1><small>{_tj("Собрано {0} из {1} · хранятся только на этом телефоне", have, KINDS.length - 2)}</small></div>
      <input ref={file} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onFile(e.target.files)} />
      {err && <p className="pro-note">{err}</p>}
      <div className="udoc-list">
        {KINDS.map((x) => {
          const l = of(x.k);
          const w = warn(x.k);
          return (
            <div key={x.k} className={`udoc-k${l.length ? ' has' : ''}${w ? ' warn' : ''}`}>
              <div className="udoc-h">
                <i aria-hidden="true">{l.length ? '✓' : x.ic}</i>
                <span><b>{x.t}</b><small>{l.length ? `${l.length} ${_t("файл.")}` : x.sub}</small></span>
                <button type="button" onClick={() => pickFor(x.k)}>{l.length ? '+' : _t("Добавить")}</button>
              </div>
              {l.length > 0 && (
                <div className="udoc-files">
                  {l.map((d) => (
                    <span key={d.id} className="udoc-f">
                      <button type="button" onClick={() => open(d)}>{d.type === 'application/pdf' ? '📄' : '🖼'} <span>{d.name}</span><small>{kb(d.size)}</small></button>
                      <button type="button" className="udoc-x" onClick={() => del(d)} aria-label={_t("Удалить")}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              {l.length > 0 && x.until && (
                <label className="udoc-until">{x.until}<input type="date" value={l.find((d) => d.until)?.until ?? ''} onChange={(e) => setUntil(x.k, e.target.value)} /></label>
              )}
              {w && <small className="udoc-warn">⚠ {w}</small>}
            </div>
          );
        })}
      </div>
      <p className="tiny">{_t("Файлы не уходят в интернет и открываются без сети, даже в самолёте. Группа видит только галочки: есть виза, куплен билет. Сменишь телефон, добавь файлы заново.")}</p>

      {canSee && host && going.length > 0 && (
        <>
          <h3>{_t("Документы группы")}</h3>
          <div className="udoc-tbl" role="table">
            <div role="row" className="udoc-tr hd"><span role="columnheader" />{COLS.map((c) => <em key={c.t} role="columnheader">{c.t}</em>)}</div>
            {going.map((id) => (
              <div key={id} role="row" className="udoc-tr">
                <span role="cell">{(nameOf(id) || _t("Участник")).split(' ')[0]}</span>
                {COLS.map((c) => <em key={c.t} role="cell" className={c.ok(id) ? 'ok' : ''}>{c.ok(id) ? '✓' : '·'}</em>)}
              </div>
            ))}
          </div>
          <p className="tiny">{_t("Видишь только галочки. Сами документы у каждого в телефоне.")}</p>
        </>
      )}

      {view && (
        <div className="udoc-view" onClick={() => setView(null)}>
          <img src={view.url} alt={view.d.name} />
          <div className="udoc-view-b" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setView(null)}>{_t("Закрыть")}</button>
            <button type="button" className="danger" onClick={() => del(view.d)}>{_t("Удалить")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
