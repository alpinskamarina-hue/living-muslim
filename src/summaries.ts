import { useEffect, useState } from 'react';
import bundled from './summaries/atomic.json';
import { cloudSummaries, isCloud } from './cloud';
import { _t } from './i18n';

export interface Summary { book: string; n: number; title: string; md: string; date: string }

export const SUMMARY_BOOKS: Record<string, { title: string; author: string }> = {
  'atomic-habits': { title: _t("Атомные привычки"), author: _t("Джеймс Клир · пересказ по главам") },
};

/** Bundled chapters plus any new ones written to the artifact db collection "summaries". */
export function useSummaries(): Summary[] {
  const [list, setList] = useState<Summary[]>(bundled as Summary[]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    (async () => {
      if (isCloud) {
        const extra = await cloudSummaries();
        if (!alive || !extra.length) return;
        const byKey = new Map<string, Summary>();
        for (const s of [...(bundled as Summary[]), ...extra]) if (s && typeof s.n === 'number' && typeof s.md === 'string' && s.book) byKey.set(`${s.book}:${s.n}`, s);
        setList([...byKey.values()].sort((a, b) => a.n - b.n));
        return;
      }
      try {
        const db = window.claude ? await window.claude.use('db') : null;
        if (!db || !alive) return;
        unsub = db.collection('summaries').onSnapshot(
          (snap: any) => {
            const byKey = new Map<string, Summary>();
            for (const s of bundled as Summary[]) byKey.set(`${s.book}:${s.n}`, s);
            snap.docs.forEach((d: any) => {
              if (!d.exists) return;
              const x = d.data() as Summary;
              if (x && typeof x.n === 'number' && typeof x.md === 'string' && x.book) byKey.set(`${x.book}:${x.n}`, x);
            });
            setList([...byKey.values()].sort((a, b) => a.n - b.n));
          },
          () => {},
        );
      } catch { /* bundled chapters stay */ }
    })();
    return () => { alive = false; unsub?.(); };
  }, []);
  return list;
}
