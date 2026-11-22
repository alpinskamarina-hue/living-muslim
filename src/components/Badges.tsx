import { useState } from 'react';
import type { AppState } from '../types';
import { badgesOf, shownBadge } from '../courseSocial';
import { emptyVideos } from '../videos';
import { _t } from '../i18n';

/** Profile shelf: a badge for each finished course plus milestones. Tap one to show it next to my name in the circle. */
export function BadgeShelf({ state, update, onOpen }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; onOpen?: () => void }) {
  const vs = state.videos;
  // finished study plans (circle «Учёба»), confirmed by the teacher or the circle
  const study = (state.studyDone ?? []).map((b) => ({ k: b.k, ic: b.ic || '📚', t: b.t, got: true, hint: undefined as string | undefined }));
  const list = [...study, ...badgesOf(vs)];
  const [pick, setPick] = useState(false);
  if (!list.some((b) => b.got)) return null;
  const shown = shownBadge(vs);
  const setBadge = (k: string) => update((s) => ({ ...s, videos: { ...(s.videos ?? emptyVideos()), badge: k } }));
  const got = list.filter((b) => b.got).length;
  return (
    <div className="cs-box bdg-box">
      <small>{_t("Мои значки · {0}", got)}</small>
      <div className="bdg-shelf">
        {list.map((b) => (
          <button key={b.k} type="button" className={`bdg${/^n\d/.test(b.k) ? ' n' : ''}${b.got ? '' : ' off'}`} disabled={!b.got || !pick || b.k.startsWith('st:')}
            aria-pressed={pick && b.got ? vs?.badge === b.k : undefined} onClick={() => { setBadge(b.k); setPick(false); }}>
            <i aria-hidden="true">{b.ic}</i><b>{b.t}</b>{b.hint && <small>{b.hint}</small>}
          </button>
        ))}
      </div>
      <p className="tiny">{vs?.badge === 'off' ? _t("В кругу значок не показывается.") : shown ? _t("В кругу рядом с ником: {0} {1}", shown.ic, shown.t) : ''}</p>
      <div className="cs-row">
        <button type="button" className="ghost-btn" onClick={() => setPick(!pick)}>{pick ? _t("Готово") : _t("Выбрать значок для круга")}</button>
        {vs?.badge !== 'off' ? <button type="button" className="ghost-btn" onClick={() => setBadge('off')}>{_t("Не показывать")}</button>
          : <button type="button" className="ghost-btn" onClick={() => setBadge('')}>{_t("Показывать")}</button>}
      </div>
      {pick && <p className="tiny">{_t("Нажми на значок, который увидит круг.")}</p>}
      {onOpen && <button type="button" className="link-btn" onClick={onOpen}>{_t("Все курсы ›")}</button>}
    </div>
  );
}
