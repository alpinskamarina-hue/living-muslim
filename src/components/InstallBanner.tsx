import { useEffect, useState } from 'react';
import { isCloud } from '../cloud';
import { canPrompt, isIOS, isStandalone, onInstallChange, promptInstall } from '../push';
import { _t } from '../i18n';

// «Поставь на главный экран» at the bottom of Today (Nasim, 19.11): only on the standalone site, only while
// the app is not installed. Android/desktop Chrome: the system install window. iPhone: three steps in Safari.

const HIDE = 'lm.installHide';
const HIDE_DAYS = 14;
const hiddenNow = () => { try { const t = Number(localStorage.getItem(HIDE) || 0); return t > 0 && Date.now() - t < HIDE_DAYS * 86400000; } catch { return false; } };
const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const isSafari = () => /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios|yabrowser|gsa\//i.test(navigator.userAgent);

/** Opened from the landing on an iPhone (/app/?install=1): show the steps right away. */
const askedFromLanding = () => { try { return new URLSearchParams(location.search).has('install'); } catch { return false; } };

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M3 19h6l2-5 3 9 3-13 3 9h9" stroke="#0f5132" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 9a3 3 0 1 0 4-3 2.4 2.4 0 1 1-4 3z" fill="#b88a2c" />
    </svg>
  );
}

export function InstallBanner() {
  const [, bump] = useState(0);
  const [hidden, setHidden] = useState(hiddenNow);
  const [sheet, setSheet] = useState(() => isCloud && askedFromLanding() && !isStandalone() && isIOS());
  useEffect(() => onInstallChange(() => bump((n) => n + 1)), []);
  if (!isCloud || isStandalone()) return null;
  const can = canPrompt();
  const show = !hidden && (can || isIOS() || isPhone());
  const install = async () => {
    if (can) { await promptInstall(); bump((n) => n + 1); return; }
    setSheet(true);
  };
  const hide = () => { try { localStorage.setItem(HIDE, String(Date.now())); } catch { /* */ } setHidden(true); };
  return (
    <>
      {show && (
        <div className="ib">
          <span className="ib-ic"><Logo /></span>
          <div className="ib-t">
            <b>{_t("Поставь на главный экран")}</b>
            <span>{_t("Напомним о привычках и Коране, сообщим о новом курсе и о том, кто написал в круге")}</span>
          </div>
          <button type="button" className="ib-go" onClick={install}>{_t("Установить")}</button>
          <button type="button" className="ib-x" onClick={hide} aria-label={_t("Скрыть")}>✕</button>
        </div>
      )}
      {sheet && <InstallSheet onClose={() => setSheet(false)} />}
    </>
  );
}

/** Steps for browsers without a one-tap install: iPhone Safari, or the browser menu elsewhere. */
export function InstallSheet({ onClose }: { onClose: () => void }) {
  const ios = isIOS();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(`${location.origin}/app/`); setCopied(true); } catch { /* */ } };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet ib-sheet" role="dialog" aria-label={_t("Установить на телефон")}>
        <div className="grab" />
        <div className="ib-head">
          <h3>{ios ? _t("Установить на iPhone") : _t("Установить на телефон")}</h3>
          <button type="button" className="ib-close" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        </div>
        {ios ? (
          <>
            <p className="ib-p">{_t("Apple не даёт сайтам ставить себя одной кнопкой, поэтому два шага в Safari. Это займёт 10 секунд.")}</p>
            <div className="ib-step"><i>1</i><span>{_t("Нажми ")}<b>{_t("«Поделиться»")}</b>{_t(" внизу экрана Safari")}</span>
              <em aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11H5v10h14V11h-1" /></svg></em></div>
            <div className="ib-step"><i>2</i><span>{_t("Выбери ")}<b>{_t("«На экран „Домой“»")}</b>{_t(" и нажми «Добавить»")}</span>
              <em aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg></em></div>
            <div className="ib-step gold"><i>3</i><span>{_t("Открой Living Muslim с иконки и включи уведомления: привычки, новые курсы и сообщения круга")}</span></div>
            {!isSafari() && (
              <p className="ib-note">{_t("Сейчас открыто не в Safari. Скопируй ссылку и открой её в Safari.")} <button type="button" className="link-btn" onClick={copy}>{copied ? _t("Ссылка скопирована") : _t("Скопировать ссылку")}</button></p>
            )}
          </>
        ) : (
          <>
            <p className="ib-p">{_t("Этот браузер не показывает кнопку установки сам. Два шага в его меню:")}</p>
            <div className="ib-step"><i>1</i><span>{_t("Открой меню браузера ")}<b>⋮</b>{_t(" (вверху или внизу справа)")}</span></div>
            <div className="ib-step"><i>2</i><span>{_t("Выбери ")}<b>{_t("«Установить приложение»")}</b>{_t(" или «Добавить на главный экран»")}</span></div>
            <p className="ib-note">{_t("Проще всего в Chrome: там появится кнопка «Установить».")}</p>
          </>
        )}
        <button type="button" className="pri-btn big-btn" onClick={onClose}>{_t("Понятно")}</button>
        {ios && isSafari() && <div className="ib-arrow" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg><small>{_t("кнопка «Поделиться» здесь")}</small></div>}
      </div>
    </>
  );
}
