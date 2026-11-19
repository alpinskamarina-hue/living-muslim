import { useState } from 'react';
import type { AppState } from '../types';
import { currentTheme, themeMode, type ThemeMode } from '../theme';
import { hhmm } from '../dates';
import type { DayTimes } from '../prayer';
import { _t } from '../i18n';

// Moon/sun in the Today header: pick light, dark, dark after Maghrib (default) or like the phone.

const Sun = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const Moon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>);

export const themeLabel = (m: ThemeMode) => (m === 'light' ? _t("Светлая") : m === 'dark' ? _t("Тёмная") : m === 'auto' ? _t("Как в телефоне") : _t("Тёмная после Магриба"));

export function ThemeSwitch({ state, update, times }: { state: AppState; update: (f: (s: AppState) => AppState) => void; times: DayTimes }) {
  const [open, setOpen] = useState(false);
  const mode = themeMode(state.settings);
  const dark = currentTheme() === 'dark';
  const pick = (m: ThemeMode) => { update((s) => ({ ...s, settings: { ...s.settings, theme: m } })); setOpen(false); };
  const opts: [ThemeMode, string, string][] = [
    ['prayer', _t("Сама по намазам"), `${_t("Тёмная с Магриба")} ${hhmm(times.maghrib)}, ${_t("светлая с Фаджра")} ${hhmm(times.fajr)}`],
    ['light', _t("Светлая"), _t("Всегда светлая")],
    ['dark', _t("Тёмная"), _t("Всегда тёмная")],
    ['auto', _t("Как в телефоне"), _t("Следует настройке телефона")],
  ];
  return (
    <>
      <button type="button" className="theme-chip" onClick={() => setOpen(true)} aria-label={_t("Тема: {0}", themeLabel(mode))}>
        {dark ? <Moon /> : <Sun />}{mode === 'prayer' && <i>{_t("авто")}</i>}
      </button>
      {open && (
        <>
          <div className="dim" onClick={() => setOpen(false)} />
          <div className="sheet theme-sheet" role="dialog" aria-label={_t("Тема")}>
            <div className="grab" />
            <h3>{_t("Тема")}</h3>
            <div className="theme-opts" role="radiogroup">
              {opts.map(([m, t, sub]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pick(m)}>
                  <span className={`theme-ic t-${m}`} aria-hidden="true">{m === 'light' ? <Sun /> : <Moon />}</span>
                  <span><b>{t}</b><small>{sub}</small></span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
