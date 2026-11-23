// Profile → «Я учительница»: what she teaches, a photo of her ijazah or diploma (only the team sees it) and a
// reference. After the team checks it, her open circles carry «✓ проверенная учительница».
import { useEffect, useRef, useState } from 'react';
import { _t } from '../i18n';
import { ensureMe, signupName } from '../cloud';
import { shrink } from '../foodphoto';
import { SUBJECTS, teacherApply, teacherMe, teacherWithdraw, useSisCirclesReady, type TeacherMe } from '../sisCircles';

const ERR: Record<string, string> = {
  empty: _t("Отметь хотя бы один предмет."),
  big: _t("Фото слишком большое. Попробуй другое."),
  auth: _t("Нужен вход в аккаунт. Открой Профиль → Аккаунт."),
};

export function TeacherPage() {
  const ready = useSisCirclesReady();
  const [me, setMe] = useState<TeacherMe | null | undefined>(undefined);
  const [subs, setSubs] = useState<string[]>([]);
  const [proof, setProof] = useState('');
  const [prev, setPrev] = useState('');
  const [ref, setRef] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = () => teacherMe().then((r) => {
    setMe(r);
    if (r) { setSubs(r.subjects); setRef(r.ref); setAbout(r.about); }
  });
  useEffect(() => { if (ready) load(); }, [ready]);
  if (!ready) return <p className="tiny sc-pad">{_t("Скоро здесь можно будет стать проверенной учительницей.")}</p>;
  if (me === undefined) return <p className="tiny sc-pad">{_t("Загружаю…")}</p>;

  const photo = async (f?: File) => {
    if (!f) return;
    try {
      const r = await shrink(f, 1100);
      setProof('data:image/jpeg;base64,' + r.data); setPrev(r.url);
    } catch { setMsg(_t("Не получилось открыть фото.")); }
  };
  const send = async () => {
    setBusy(true); setMsg('');
    const who = await ensureMe(signupName()).catch(() => null);
    if (!who) { setBusy(false); setMsg(_t("Нет связи с сервером. Проверь интернет.")); return; }
    const r = await teacherApply({ subjects: subs, proof, ref, about });
    setBusy(false);
    if (r === 'ok') { setEdit(false); setProof(''); setPrev(''); setMsg(_t("✓ Отправлено. Команда посмотрит и свяжется с тем, кто тебя рекомендовал.")); load(); }
    else setMsg(ERR[r] ?? _t("Не получилось отправить. Проверь интернет."));
  };
  const drop = async () => {
    if (!confirm(_t("Убрать заявку и значок? Фото документа удалится."))) return;
    setBusy(true); await teacherWithdraw(); setBusy(false); setMsg(''); setEdit(false); setSubs([]); setRef(''); setAbout(''); load();
  };

  const form = !me || edit;
  return (
    <div className="sc-teacher">
      {me && !edit && (
        <div className={`sc-st ${me.status}`}>
          <b>{me.status === 'ok' ? _t("✓ Ты проверенная учительница") : me.status === 'pending' ? _t("Заявка на проверке") : _t("Проверка не пройдена")}</b>
          <small>{me.status === 'ok' ? _t("Значок стоит на твоих открытых кругах в «Найти круг».") : me.status === 'pending' ? _t("Обычно проверка занимает 2–3 дня. Пока можно вести круг, но без значка.") : _t("Команда не смогла подтвердить документы. Можно отправить заново.")}</small>
          <small>{SUBJECTS.filter((x) => me.subjects.includes(x.k)).map((x) => x.l()).join(', ')}</small>
          <div className="sc-row">
            <button type="button" className="ghost-btn" onClick={() => setEdit(true)}>{_t("Изменить")}</button>
            <button type="button" className="link-btn" disabled={busy} onClick={drop}>{_t("Убрать заявку")}</button>
          </div>
        </div>
      )}
      {form && (
        <>
          <p className="sc-lead">{_t("Учишь сестёр Корану, таджвиду или основам? Пройди проверку, и на твоих открытых кругах появится значок «✓ проверенная учительница».")}</p>
          <div className="nk-sec">{_t("Чему учу")}</div>
          <div className="sc-chips">
            {SUBJECTS.map((x) => {
              const on = subs.includes(x.k);
              return <button key={x.k} type="button" aria-pressed={on} onClick={() => setSubs(on ? subs.filter((y) => y !== x.k) : [...subs, x.k])}>{x.l()}</button>;
            })}
          </div>
          <div className="nk-sec">{_t("Подтверждение")}</div>
          <div className="sc-proof">
            <span><b>{_t("Иджаза или диплом")}</b><small>{_t("Фото видит только команда")}</small></span>
            {prev && <img src={prev} alt="" />}
            {!prev && me?.proof && <small className="sc-ok">{_t("✓ уже отправлено")}</small>}
            <button type="button" className="ghost-btn" onClick={() => file.current?.click()}>{prev || me?.proof ? _t("Другое фото") : _t("+ фото")}</button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => photo(e.target.files?.[0])} />
          </div>
          <label className="cl-f"><span>{_t("Рекомендация мечети или учителя")}</span>
            <input value={ref} maxLength={200} placeholder={_t("Имя и контакт, мы свяжемся сами")} onChange={(e) => setRef(e.target.value)} />
          </label>
          <label className="cl-f"><span>{_t("Коротко о себе (необязательно)")}</span>
            <textarea rows={2} maxLength={300} value={about} placeholder={_t("Например: иджаза по чтению Хафса, учу 5 лет")} onChange={(e) => setAbout(e.target.value)} />
          </label>
          <p className="tiny">{_t("Пока проверка идёт, можно вести круг, но без значка. Обычно проверка занимает 2–3 дня. Участницам виден только значок, документы никто кроме команды не видит.")}</p>
          <button type="button" className="pri-btn big-btn" disabled={busy || !subs.length || (!proof && !me?.proof)} onClick={send}>{_t("Отправить на проверку")}</button>
          {edit && <button type="button" className="link-btn" onClick={() => setEdit(false)}>{_t("Отмена")}</button>}
        </>
      )}
      {msg && <p className="uo-msg" role="status">{msg}</p>}
    </div>
  );
}
