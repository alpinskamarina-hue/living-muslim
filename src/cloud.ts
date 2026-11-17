// Circle backend for the standalone site (Vercel). Inside claude.ai the page runtime provides
// window.claude; everywhere else this module installs a small stand-in with the same db/user
// surface, backed by Supabase RPC functions. Identity is an anonymous id + secret kept on the device.

const URL_ = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const LS = 'lm.cloud';
const POLL_MS = 8000;

export type CircleKind = 'family' | 'brothers' | 'sisters' | 'friends' | 'masjid' | 'study' | 'work' | 'other';
export interface CircleRef { code: string; title: string; kind?: CircleKind }
export interface CloudId { uid: string; token: string; name: string; circle?: string; circles?: CircleRef[] }

export const CIRCLE_KINDS: { id: CircleKind; ru: string; ic: string; hint: string }[] = [
  { id: 'family', ru: 'Семья', ic: '🏡', hint: 'Намаз вместе дома, детские профили, семейный сад' },
  { id: 'brothers', ru: 'Братья', ic: '🤝', hint: 'Держать друг друга в намазе и делах' },
  { id: 'sisters', ru: 'Сёстры', ic: '🌸', hint: 'Закрытый круг только для своих' },
  { id: 'friends', ru: 'Друзья', ic: '👥', hint: 'Близкие люди, которые поддержат' },
  { id: 'masjid', ru: 'Мечеть, халака', ic: '🕌', hint: 'Община, уроки, общий хатм' },
  { id: 'study', ru: 'Учёба', ic: '📚', hint: 'Коран, арабский, общий курс' },
  { id: 'work', ru: 'Работа', ic: '💼', hint: 'Коллеги-мусульмане' },
  { id: 'other', ru: 'Своё', ic: '✨', hint: 'Любая другая цель' },
];
export const kindOf = (k?: CircleKind) => CIRCLE_KINDS.find((x) => x.id === k);

function load(): CloudId | null {
  try {
    const x: CloudId | null = JSON.parse(localStorage.getItem(LS) || 'null');
    if (!x?.uid || !x?.token) return null;
    const list = (x.circles ?? []).filter((c) => c?.code);
    if (x.circle && !list.some((c) => c.code === x.circle)) list.unshift({ code: x.circle, title: 'Мой круг' });
    return { ...x, circles: list };
  } catch { return null; }
}
function save(x: CloudId | null) {
  try { if (x) localStorage.setItem(LS, JSON.stringify(x)); else localStorage.removeItem(LS); } catch { /* private mode */ }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
  return (await r.json()) as T;
}

/** True on the standalone site, false inside claude.ai (which has its own runtime). */
export const isCloud = typeof window !== 'undefined' && !window.claude && !/claude|anthropic/.test(location.hostname);

/** Invite code from ?c=… in the address, remembered until used. */
export function pendingInvite(): string {
  try {
    const c = new URLSearchParams(location.search).get('c');
    if (c) sessionStorage.setItem('lm.invite', c.toLowerCase());
    return sessionStorage.getItem('lm.invite') || '';
  } catch { return ''; }
}

export function cloudMe(): CloudId | null { return load(); }

export function inviteLink(code: string) {
  const c = load()?.circles?.find((x) => x.code === code);
  const q = new URLSearchParams({ c: code });
  if (c?.title) q.set('n', c.title);
  if (c?.kind) q.set('k', c.kind);
  return `${location.origin}/app/?${q}`;
}

/** Title and kind that came with the invite link (?n=…&k=…). */
export function pendingInviteMeta(): { title: string; kind?: CircleKind } {
  try {
    const u = new URLSearchParams(location.search);
    if (u.get('c')) sessionStorage.setItem('lm.inviteMeta', JSON.stringify({ title: u.get('n') || '', kind: u.get('k') || undefined }));
    const m = JSON.parse(sessionStorage.getItem('lm.inviteMeta') || 'null');
    return { title: String(m?.title || '').slice(0, 40), kind: CIRCLE_KINDS.some((k) => k.id === m?.kind) ? m.kind : undefined };
  } catch { return { title: '' }; }
}

export function myCircles(): CircleRef[] { return load()?.circles ?? []; }
export function currentCircle(): CircleRef | null { const me = load(); return me?.circles?.find((c) => c.code === me.circle) ?? null; }

/** Makes another of my circles the open one. The page reloads to reconnect. */
export function switchCircle(code: string) {
  const me = load();
  if (!me || !me.circles?.some((c) => c.code === code)) return;
  save({ ...me, circle: code });
  try { sessionStorage.setItem('lm.tab', 'circle'); } catch { /* */ }
  location.reload();
}

/** Renames a circle for me (the name travels with new invite links). */
export function renameCircle(code: string, title: string, kind?: CircleKind) {
  const me = load();
  if (!me) return;
  save({ ...me, circles: (me.circles ?? []).map((c) => (c.code === code ? { ...c, title: title.trim().slice(0, 40) || c.title, kind: kind ?? c.kind } : c)) });
}

async function ensureId(name: string): Promise<CloudId> {
  let me = load();
  if (!me) {
    const r = await rpc<{ uid: string; token: string }>('lm_register', { p_name: name });
    me = { uid: r.uid, token: r.token, name };
  } else if (name && name !== me.name) {
    await rpc('lm_set_name', { p_uid: me.uid, p_token: me.token, p_name: name });
    me = { ...me, name };
  }
  save(me);
  return me;
}

const addCircle = (me: CloudId, ref: CircleRef): CloudId => ({ ...me, circle: ref.code, circles: [...(me.circles ?? []).filter((c) => c.code !== ref.code), ref] });

export async function createCircle(name: string, title = 'Мой круг', kind?: CircleKind): Promise<string> {
  const me = await ensureId(name);
  const code = await rpc<string>('lm_create_circle', { p_uid: me.uid, p_token: me.token });
  save(addCircle(me, { code, title: title.trim().slice(0, 40) || 'Мой круг', kind }));
  return code;
}

export async function joinCircle(name: string, code: string, title = '', kind?: CircleKind): Promise<boolean> {
  const me = await ensureId(name);
  const c = code.toLowerCase().trim();
  const ok = await rpc<boolean>('lm_join', { p_uid: me.uid, p_token: me.token, p_code: c });
  if (ok) {
    const old = me.circles?.find((x) => x.code === c);
    save(addCircle(me, { code: c, title: title.trim().slice(0, 40) || old?.title || 'Круг друзей', kind: kind ?? old?.kind }));
    try { sessionStorage.removeItem('lm.invite'); sessionStorage.removeItem('lm.inviteMeta'); } catch { /* */ }
  }
  return ok;
}

export async function setName(name: string) { await ensureId(name); }

/** Leaves the circle on the server and forgets it here. */
export async function leaveCircle() {
  const me = load();
  if (!me?.circle) return;
  try { await rpc('lm_leave', { p_uid: me.uid, p_token: me.token, p_code: me.circle }); } catch { /* still forget locally */ }
  const rest = (me.circles ?? []).filter((c) => c.code !== me.circle);
  save({ ...me, circle: rest[0]?.code, circles: rest });
}

export async function cloudSummaries(): Promise<any[]> {
  try { return await rpc<any[]>('lm_summaries', {}); } catch { return []; }
}

// ---- stand-in for window.claude ----

interface State { owner: string; members: { uid: string; name: string; color: string }[]; docs: { coll: string; key: string; data: any }[] }
type Listener = { coll: string; next: (snap: any) => void; err: (e: any) => void };

function makeRuntime(me: CloudId & { circle: string }) {
  let state: State | null = null;
  const listeners = new Set<Listener>();
  let timer: number | undefined;
  let failing = false;

  const snapOf = (coll: string) => ({
    metadata: { fromCache: false },
    docs: (state?.docs ?? []).filter((d) => d.coll === coll).map((d) => ({ id: d.key, exists: true, data: () => d.data })),
  });
  const emit = () => listeners.forEach((l) => l.next(snapOf(l.coll)));

  async function refresh() {
    try {
      const s = await rpc<State | null>('lm_state', { p_uid: me.uid, p_token: me.token, p_code: me.circle });
      if (!s) throw new Error('not a member');
      state = s; failing = false; emit();
    } catch (e) {
      if (!failing) { failing = true; listeners.forEach((l) => l.err(e)); }
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(async () => { if (document.visibilityState === 'visible') await refresh(); schedule(); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  const first = refresh().then(schedule);

  async function write(path: string, data: any) {
    const [coll, key] = path.split('/');
    if (key !== me.uid) throw Object.assign(new Error('only own doc'), { code: 'invalid_argument' });
    const ok = await rpc<boolean>('lm_write', { p_uid: me.uid, p_token: me.token, p_code: me.circle, p_coll: coll, p_data: data });
    if (!ok) throw Object.assign(new Error('write refused'), { code: 'invalid_argument' });
    // apply locally right away, then confirm from the server
    if (state) {
      state.docs = state.docs.filter((d) => !(d.coll === coll && d.key === key));
      if (data !== null) state.docs.push({ coll, key, data });
      emit();
    }
    refresh();
  }

  const db = {
    collection(coll: string) {
      return {
        onSnapshot(next: (s: any) => void, err: (e: any) => void = () => {}) {
          const l = { coll, next, err };
          listeners.add(l);
          if (state) next(snapOf(coll));
          return () => listeners.delete(l);
        },
      };
    },
    doc(path: string) {
      return {
        set: (data: any) => write(path, JSON.parse(JSON.stringify(data))),
        delete: () => write(path, null),
      };
    },
  };

  const user = {
    id: async () => me.uid,
    isOwner: async () => { await first; return state?.owner === me.uid; },
    canEdit: async () => false,
    profiles: async (ids: string[]) => {
      await first;
      const out: Record<string, { name: string; avatarUrl: string; color: string }> = {};
      for (const id of ids) {
        const m = state?.members.find((x) => x.uid === id);
        out[id] = { name: m?.name || '', avatarUrl: '', color: m?.color || '#1f7a4d' };
      }
      return out;
    },
  };
  return { db, user };
}

/** Sign-up from the landing page: retry sending it if the first attempt failed. */
function flushSignup() {
  try {
    const rec = JSON.parse(localStorage.getItem('lm.signup') || 'null');
    if (!rec?.pending || !rec.email) return;
    rpc('lm_signup', { p_name: rec.name, p_email: rec.email, p_lang: rec.lang, p_source: rec.source || '' })
      .then(() => localStorage.setItem('lm.signup', JSON.stringify({ ...rec, pending: false })))
      .catch(() => { /* try again next time */ });
  } catch { /* */ }
}

/** Name typed on the landing page, used to greet the user in the app. */
export function signupName(): string {
  try { return JSON.parse(localStorage.getItem('lm.signup') || 'null')?.name || ''; } catch { return ''; }
}

if (isCloud) {
  flushSignup();
  const me = load();
  const rt = me?.circle ? makeRuntime(me as CloudId & { circle: string }) : null;
  window.claude = {
    use: async (name: string) => (name === 'db' ? rt?.db ?? null : name === 'user' ? rt?.user ?? null : null),
  };
}
