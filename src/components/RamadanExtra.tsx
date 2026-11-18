import { useState } from 'react';
import type { AppState } from '../types';
import { addDays, fromKey, hhmm } from '../dates';
import { prayerTimes } from '../prayer';
import { here } from '../safar';
import { type Lang, tr, _t } from '../i18n';
import { khatmProgress, patchR, ramadanDay, ramadanMonth, ramadanOf } from '../ramadan';

type Update = (fn: (s: AppState) => AppState) => void;
type Mon = ReturnType<typeof ramadanMonth>;

// ---------- 9. The month as a story picture ----------

async function storyPng(l: Lang, year: number, stats: [string, string][]): Promise<Blob | null> {
  const t = tr(l);
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const x = c.getContext('2d'); if (!x) return null;
  const g = x.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#0b1430'); g.addColorStop(.6, '#1b2d55'); g.addColorStop(1, '#2b4580');
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  // Stars, placed by a fixed pattern so every picture looks the same.
  for (let i = 0; i < 90; i++) { const sx = (i * 397) % 1080, sy = (i * 211) % 1100, r = 1 + (i % 3); x.globalAlpha = .3 + (i % 5) / 8; x.fillStyle = '#fff'; x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1;
  // Crescent: a gold disc with a night-coloured disc over it.
  x.fillStyle = '#e8c977'; x.beginPath(); x.arc(540, 560, 190, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#10193a'; x.beginPath(); x.arc(615, 500, 175, 0, Math.PI * 2); x.fill();
  x.textAlign = 'center'; x.fillStyle = '#f1f6f0';
  x.font = '600 40px Manrope, sans-serif'; x.globalAlpha = .7; x.fillText('LIVING MUSLIM', 540, 150); x.globalAlpha = 1;
  x.font = '700 120px "Cormorant Garamond", Georgia, serif'; x.fillText(t('Мой Рамадан', 'My Ramadan'), 540, 960);
  x.font = '500 46px Manrope, sans-serif'; x.globalAlpha = .8; x.fillText(`${year} ${t('г. х.', 'AH')}`, 540, 1035); x.globalAlpha = 1;
  stats.forEach(([n, lb], i) => {
    const cx = 290 + (i % 2) * 500, cy = 1230 + Math.floor(i / 2) * 230;
    x.fillStyle = '#e8c977'; x.font = '700 120px "Cormorant Garamond", Georgia, serif'; x.fillText(n, cx, cy);
    x.fillStyle = '#f1f6f0'; x.font = '500 38px Manrope, sans-serif'; x.fillText(lb, cx, cy + 58);
  });
  x.fillStyle = '#e8c977'; x.font = '62px Amiri, serif'; x.fillText('تَقَبَّلَ اللَّهُ مِنَّا وَمِنْكُمْ', 540, 1740);
  x.fillStyle = '#f1f6f0'; x.globalAlpha = .75; x.font = '500 34px Manrope, sans-serif'; x.fillText(t('Да примет Аллах от нас и от вас', 'May Allah accept from us and from you'), 540, 1810);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

/** Only totals go on the picture: no reasons for missed days, no amounts. */
export function RamadanStory({ state, mon, l }: { state: AppState; mon: Mon; l: Lang }) {
  const t = tr(l);
  const [busy, setBusy] = useState(false);
  const r = ramadanOf(state);
  const evenings = mon.days.length ? [addDays(mon.days[0], -1), ...mon.days.slice(0, -1)] : [];
  const kp = khatmProgress(state, r, 30);
  const stats: [string, string][] = [
    [String(mon.days.filter((d) => r.fasts[d] === 'fast').length), t('дней поста', 'days of fasting')],
    [String(evenings.filter((e) => r.nights[e]?.includes('tarawih')).length), t('таравихов', 'nights of tarawih')],
    [kp ? String(kp.done) : '—', t('джузов Корана', 'juz of Quran')],
    [String((r.deeds?.[String(mon.year)] ?? []).length), t('добрых дел', 'good deeds')],
  ];
  const go = async () => {
    setBusy(true);
    try {
      await document.fonts?.ready;
      const b = await storyPng(l, mon.year, stats); if (!b) return;
      const file = new File([b], `ramadan-${mon.year}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: t('Мой Рамадан', 'My Ramadan') }).catch(() => {});
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click(); }
    } finally { setBusy(false); }
  };
  return (
    <div className="h-card">
      <b>{t('Картинка «Мой Рамадан» для сторис', '"My Ramadan" picture for stories')}</b>
      <small>{t('Только итоги: посты, таравихи, джузы и добрые дела. Причины пропусков и суммы садаки на картинку не попадают.', 'Only totals: fasts, tarawih, juz and good deeds. Reasons for missed days and sadaqah amounts never appear.')}</small>
      <button type="button" className="gold-btn" onClick={go} disabled={busy}>{busy ? t('Готовлю…', 'Preparing…') : t('🌙 Сделать картинку', '🌙 Make the picture')}</button>
    </div>
  );
}

// ---------- 10. I'tikaf ----------

const ITIKAF_DAY: { id: string; at: 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | 'third'; t: [string, string] }[] = [
  { id: 'fajr', at: 'fajr', t: [_t("Фаджр, затем Коран и утренние азкары до восхода"), 'Fajr, then Quran and the morning adhkar until sunrise'] },
  { id: 'duha', at: 'sunrise', t: [_t("Намаз духа, потом отдых"), 'Duha prayer, then rest'] },
  { id: 'dhuhr', at: 'dhuhr', t: [_t("Зухр, затем знание: тафсир, хадисы, книга"), 'Dhuhr, then learning: tafsir, hadith, a book'] },
  { id: 'asr', at: 'asr', t: [_t("Аср, вечерние азкары, дуа до ифтара"), 'Asr, the evening adhkar, du‘a until iftar'] },
  { id: 'iftar', at: 'maghrib', t: [_t("Ифтар и Магриб"), 'Iftar and Maghrib'] },
  { id: 'isha', at: 'isha', t: [_t("Иша и таравих"), 'Isha and tarawih'] },
  { id: 'third', at: 'third', t: [_t("Тахаджуд и свой список дуа"), 'Tahajjud and your du‘a list'] },
];

export function Itikaf({ state, update, today, mon, l }: { state: AppState; update: Update; today: string; mon: Mon; l: Lang }) {
  const t = tr(l);
  const r = ramadanOf(state);
  const k = r.itikaf?.year === mon.year ? r.itikaf : null;
  const day = ramadanDay(today);
  const on = Boolean(k && !k.end && day);
  const n = k ? Math.max(1, Math.round((Date.parse(today) - Date.parse(k.from)) / 86400000) + 1) : 0;
  const tm = prayerTimes(here(state, today), fromKey(today));
  const tf = prayerTimes(here(state, addDays(today, 1)), fromKey(addDays(today, 1)));
  const third = new Date(tm.maghrib.getTime() + ((tf.fajr.getTime() - tm.maghrib.getTime()) * 2) / 3);
  const at = { fajr: tm.fajr, sunrise: tm.sunrise, dhuhr: tm.dhuhr, asr: tm.asr, maghrib: tm.maghrib, isha: tm.isha, third };
  const done = r.itikafLog?.[today] ?? [];
  const tick = (id: string) => update((s) => patchR(s, (x) => { const c = x.itikafLog?.[today] ?? []; return { itikafLog: { ...(x.itikafLog ?? {}), [today]: c.includes(id) ? c.filter((y) => y !== id) : [...c, id] } }; }));
  const madhab = state.settings.madhab;
  return (
    <div className="h-card rm-itikaf">
      <div className="meal-h"><b>{t('Итикаф', 'I‘tikaf')}</b>{on && <small>{t(`день ${n}`, `day ${n}`)}</small>}</div>
      {!on && (
        <>
          <small>{t('Уединение в мечети ради поклонения. Сунна в последние десять дней Рамадана: Пророк ﷺ делал итикаф каждый год (аль-Бухари, 2026). Можно и на день или одну ночь.', 'Staying in the mosque for worship. A sunnah in the last ten days of Ramadan: the Prophet ﷺ did it every year (al-Bukhari, 2026). A day or a single night is also fine.')}</small>
          <ul className="rules">
            <li>{t('В мечети, где проходят коллективные намазы', 'In a mosque where congregational prayers are held')}{madhab === 'hanafi' ? t('. Женщинам у ханафитов — в месте для намаза дома', '. For Hanafi women, in the prayer place at home') : ''}</li>
            <li>{t('Выходить только по необходимости: туалет, гусль, еда, если некому принести', 'Leave only for necessities: the toilet, ghusl, food if no one can bring it')}</li>
            <li>{t('Меньше разговоров и телефона, больше Корана, зикра и дуа', 'Less talk and phone, more Quran, dhikr and du‘a')}</li>
            <li>{t('Близость с супругом нарушает итикаф (Коран, 2:187)', 'Intimacy with one’s spouse breaks i‘tikaf (Quran 2:187)')}</li>
          </ul>
          {day ? (
            <button type="button" className="gold-btn" onClick={() => update((s) => patchR(s, () => ({ itikaf: { year: mon.year, from: today } })))}>{t('Я начинаю итикаф', 'I am starting i‘tikaf')}</button>
          ) : <small>{t('Кнопка «Я начинаю итикаф» появится в Рамадан.', 'The "Start i‘tikaf" button appears in Ramadan.')}</small>}
          {k?.end && <small>{t(`Итикаф: ${Math.round((Date.parse(k.end) - Date.parse(k.from)) / 86400000) + 1} дн. Да примет Аллах.`, `I‘tikaf: ${Math.round((Date.parse(k.end) - Date.parse(k.from)) / 86400000) + 1} days. May Allah accept it.`)}</small>}
        </>
      )}
      {on && (
        <>
          <small>{t('Распорядок дня в мечети. Отмечай, что получилось, без гонки за всем.', 'A day in the mosque. Tick what you managed; no need to do everything.')}</small>
          {ITIKAF_DAY.map((p) => (
            <button type="button" key={p.id} className={`rm-step${done.includes(p.id) ? ' on' : ''}`} onClick={() => tick(p.id)}>
              <i>{done.includes(p.id) ? '✓' : ''}</i><span>{p.t[l === 'en' ? 1 : 0]}</span><small>{hhmm(at[p.at])}</small>
            </button>
          ))}
          <button type="button" className="ghost-btn" onClick={() => update((s) => patchR(s, (x) => ({ itikaf: x.itikaf ? { ...x.itikaf, end: today } : x.itikaf })))}>{t('Завершить итикаф', 'End i‘tikaf')}</button>
        </>
      )}
    </div>
  );
}

// ---------- 11. Sleep in Ramadan and what to eat at suhoor ----------

const SUHOOR: [string, string][] = [
  [_t("Овсянка на молоке, финики, орехи, вода"), 'Oats with milk, dates, nuts, water'],
  [_t("Яйца, цельнозерновой хлеб, огурец, сыр"), 'Eggs, wholegrain bread, cucumber, cheese'],
  [_t("Йогурт или творог, банан, мёд, семена"), 'Yoghurt or cottage cheese, banana, honey, seeds'],
  [_t("Гречка или булгур, курица, овощи"), 'Buckwheat or bulgur, chicken, vegetables'],
  [_t("Фул (бобы) или хумус, лепёшка, помидоры"), 'Ful (beans) or hummus, flatbread, tomatoes'],
  [_t("Омлет с овощами, авокадо, чай без сахара"), 'Vegetable omelette, avocado, unsweetened tea'],
  [_t("Каша из пшена или риса, финики, молоко"), 'Millet or rice porridge, dates, milk'],
];

export function SleepPlan({ state, update, today, l }: { state: AppState; update: Update; today: string; l: Lang }) {
  const t = tr(l);
  const r = ramadanOf(state);
  const wake = r.wake ?? '07:30';
  const tm = prayerTimes(here(state, today), fromKey(today));
  const tf = prayerTimes(here(state, addDays(today, 1)), fromKey(addDays(today, 1)));
  const [wh, wm] = wake.split(':').map(Number);
  const nextDay = fromKey(addDays(today, 1));
  const wakeAt = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), wh, wm);
  const bed1 = new Date(tm.isha.getTime() + 75 * 60000); // after tarawih
  const up1 = new Date(tf.fajr.getTime() - 40 * 60000); // suhoor
  const bed2 = new Date(tf.fajr.getTime() + 30 * 60000); // after Fajr and adhkar
  const nap = 25;
  const h = (ms: number) => Math.max(0, ms) / 3600000;
  const s1 = h(up1.getTime() - bed1.getTime());
  const s2 = wakeAt > bed2 ? h(wakeAt.getTime() - bed2.getTime()) : 0;
  const total = s1 + s2 + nap / 60;
  const f = (x: number) => (Math.round(x * 10) / 10).toLocaleString(l === 'en' ? 'en-GB' : 'ru-RU');
  const menu = SUHOOR[(ramadanDay(today) ?? new Date(today).getDate()) % SUHOOR.length];
  return (
    <div className="h-card rm-sleep">
      <div className="meal-h"><b>{t('Сон в Рамадан', 'Sleep in Ramadan')}</b><small>{t(`≈ ${f(total)} ч`, `≈ ${f(total)} h`)}</small></div>
      <label className="field"><span>{t('Во сколько встаю на работу или учёбу', 'When I get up for work or study')}</span>
        <select value={wake} onChange={(e) => update((s) => patchR(s, () => ({ wake: e.target.value })))}>
          {['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '10:00'].map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <div className="rm-sleep-row"><b>1</b><span>{t('После таравиха', 'After tarawih')}</span><small>{hhmm(bed1)} – {hhmm(up1)}</small></div>
      <div className="rm-sleep-row"><b>2</b><span>{t('После Фаджра', 'After Fajr')}</span><small>{s2 > 0.25 ? `${hhmm(bed2)} – ${wake}` : t('не выходит', 'no time')}</small></div>
      <div className="rm-sleep-row"><b>3</b><span>{t('Дневной сон (каййуля) после Зухра', 'A daytime nap (qaylulah) after Dhuhr')}</span><small>{t(`${nap} мин`, `${nap} min`)}</small></div>
      <small>{total < 6 ? t('Меньше 6 часов: попробуй ложиться сразу после таравиха и не пропускать дневной сон.', 'Under 6 hours: try going to bed right after tarawih and keep the daytime nap.') : t('Сон частями — нормально в Рамадан. Главное, чтобы набиралось 6–7 часов.', 'Sleeping in parts is normal in Ramadan. Aim for 6–7 hours in total.')}</small>
      <div className="rm-menu"><small>{t('Сухур сегодня', 'Suhoor idea for today')}</small><b>{menu[l === 'en' ? 1 : 0]}</b><small>{t('Медленные углеводы, белок и вода держат дольше. Меньше соли и сладкого — меньше жажды.', 'Slow carbs, protein and water last longer. Less salt and sugar means less thirst.')}</small></div>
    </div>
  );
}

// ---------- 12. Mosques nearby ----------

interface Mosque { name: string; lat: number; lng: number; km: number }
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const dist = (a: number, b: number, c: number, d: number) => {
  const R = 6371, rad = Math.PI / 180;
  const x = Math.sin(((c - a) * rad) / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(((d - b) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

async function findMosques(lat: number, lng: number): Promise<Mosque[]> {
  const q = `[out:json][timeout:20];nwr["amenity"="place_of_worship"]["religion"="muslim"](around:8000,${lat.toFixed(3)},${lng.toFixed(3)});out center 60;`;
  let last: unknown = null;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }) });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      return (j.elements ?? []).map((e: any) => {
        const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
        return { name: e.tags?.name || e.tags?.['name:en'] || '', lat: la, lng: lo, km: dist(lat, lng, la, lo) };
      }).filter((m: Mosque) => typeof m.lat === 'number').sort((a: Mosque, b: Mosque) => a.km - b.km).slice(0, 12);
    } catch (e) { last = e; }
  }
  throw last;
}

export function Mosques({ state, today, l }: { state: AppState; today: string; l: Lang }) {
  const t = tr(l);
  const p = here(state, today);
  const [list, setList] = useState<Mosque[] | null>(null);
  const [st, setSt] = useState<'' | 'busy' | 'err'>('');
  const go = async () => {
    setSt('busy');
    try { setList(await findMosques(p.lat, p.lng)); setSt(''); } catch { setSt('err'); }
  };
  const km = (x: number) => (x < 1 ? t(`${Math.round(x * 1000)} м`, `${Math.round(x * 1000)} m`) : t(`${x.toFixed(1).replace('.', ',')} км`, `${x.toFixed(1)} km`));
  return (
    <div className="h-card rm-mosques">
      <div className="meal-h"><b>{t('Мечети рядом', 'Mosques nearby')}</b><small>{p.place}</small></div>
      {!list && <small>{t('Найдём мечети в радиусе 8 км по открытой карте OpenStreetMap. Туда уходят только примерные координаты города, без твоих данных.', 'We look for mosques within 8 km on the open OpenStreetMap. Only the rough coordinates of your city are sent, nothing about you.')}</small>}
      {!list && <button type="button" className="ghost-btn" onClick={go} disabled={st === 'busy'}>{st === 'busy' ? t('Ищу…', 'Searching…') : t('🕌 Найти мечети', '🕌 Find mosques')}</button>}
      {st === 'err' && <small>{t('Карта сейчас не отвечает. Попробуй чуть позже.', 'The map is not responding. Try again a bit later.')}</small>}
      {list && list.length === 0 && <small>{t('Рядом мечетей на карте не нашлось. Спроси в местной общине: часто таравих проходит в культурных центрах.', 'No mosques found nearby on the map. Ask your local community: tarawih is often held in cultural centres.')}</small>}
      {list?.map((m, i) => (
        <a key={i} className="rm-mosque" href={`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`} target="_blank" rel="noopener noreferrer">
          <span>🕌</span><b>{m.name || t('Мечеть', 'Mosque')}</b><small>{km(m.km)} ›</small>
        </a>
      ))}
      {list && list.length > 0 && <small>{t('Есть ли там таравих и для сестёр ли место, уточни в мечети: на карте этого нет.', 'Whether there is tarawih and space for sisters, check with the mosque: the map does not say.')}</small>}
    </div>
  );
}
