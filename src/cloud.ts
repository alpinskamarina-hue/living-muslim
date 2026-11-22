// Circle backend for the standalone site (Vercel). Inside claude.ai the page runtime provides
// window.claude; everywhere else this module installs a small stand-in with the same db/user
// surface, backed by Supabase RPC functions. Identity is an anonymous id + secret kept on the device.

import { avatarUrl, type AvatarPick } from './avatar';
import { authMe, accessToken } from './auth';
import { _t } from './i18n';

const URL_ = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const LS = 'lm.cloud';
const POLL_MS = 8000;

export type CircleKind = 'umrah' | 'family' | 'brothers' | 'sisters' | 'biz' | 'startup' | 'friends' | 'masjid' | 'study' | 'work' | 'other';
export interface CircleRef { code: string; title: string; kind?: CircleKind }
export interface CloudId { uid: string; token: string; name: string; circle?: string; circles?: CircleRef[] }

export const CIRCLE_KINDS: { id: CircleKind; ru: string; ic: string; hint: string; old?: boolean; fresh?: boolean }[] = [
  { id: 'umrah', ru: _t("Умра"), ic: '🕋', hint: _t("Поехать на умру вместе: даты, билеты, жильё, общая касса и чат группы. Друзей позовёшь по ссылке или по нику"), fresh: true },
  { id: 'family', ru: _t("Семья"), ic: '🏡', hint: _t("Намаз вместе дома, детские профили, семейный сад") },
  { id: 'brothers', ru: _t("Братья"), ic: '🤝', hint: _t("Держать друг друга в намазе и делах") },
  { id: 'sisters', ru: _t("Сёстры"), ic: '🌸', hint: _t("Закрытый круг только для своих") },
  { id: 'biz', ru: _t("Бизнес"), ic: '💼', hint: _t("Дело рядом с намазом: деловые привычки, шура по четвергам, дуа за сделки. Суммы денег не видны никогда"), fresh: true },
  { id: 'startup', ru: _t("Стартап"), ic: '🚀', hint: _t("Проверить идею и запустить своё дело командой"), fresh: true },
  { id: 'friends', ru: _t("Друзья"), ic: '👥', hint: _t("Близкие люди, которые поддержат") },
  { id: 'masjid', ru: _t("Мечеть, халака"), ic: '🕌', hint: _t("Община, уроки, общий хатм") },
  { id: 'study', ru: _t("Учёба"), ic: '📚', hint: _t("Коран, арабский, общий курс") },
  { id: 'work', ru: _t("Работа"), ic: '💼', hint: _t("Коллеги-мусульмане"), old: true },
  { id: 'other', ru: _t("Своё"), ic: '✨', hint: _t("Любая другая цель") },
];
export const kindOf = (k?: CircleKind) => CIRCLE_KINDS.find((x) => x.id === k);
/** Under each kind on «Новый круг»: a few words on the tile, and what is inside when it is picked. */
export const KIND_INFO: Record<CircleKind, { sub: string; caps: string[] }> = {
  umrah: { sub: _t("поездка вместе"), caps: [_t("🗓 Даты, билеты и жильё в одном месте"), _t("✅ Задачи группы и общая касса"), _t("💬 Чат группы, зов «Еду / Думаю»"), _t("📖 Подготовка: обряды, дуа, вещи"), _t("🧭 Найти попутчиков в «Ищут людей»")] },
  family: { sub: _t("намаз дома"), caps: [_t("🕌 Намаз вместе и итог дня семьи"), _t("🧒 Детские профили и семейный сад"), _t("📖 Общий хатм, ифтары в Рамадан"), _t("🤲 Дуа друг за друга и чат")] },
  brothers: { sub: _t("держаться вместе"), caps: [_t("👀 Видно, кто сегодня в деле: только итог дня"), _t("🎯 Цель недели и вызов на 7 дней"), _t("🤲 Просьба о дуа, амир недели"), _t("💬 Чат с голосом, фото и опросами")] },
  sisters: { sub: _t("только сёстры"), caps: [_t("🔒 Закрытый круг, только для своих"), _t("🎯 Цель недели и вызовы"), _t("🤲 Дуа друг за друга и чат"), _t("💍 Никах только через вали")] },
  biz: { sub: _t("дело и намаз"), caps: [_t("📋 Дела команды: кто, что и к какому сроку"), _t("📅 Календарь встреч вокруг намаза, без Джума"), _t("🧭 План: ниййат, цели года и квартала"), _t("🤝 Шура по четвергам и журнал решений"), _t("⏰ Деловые привычки после намазов. Суммы денег не видны")] },
  startup: { sub: _t("от идеи до запуска"), caps: [_t("🪜 Путь из 5 ступеней: от идеи до роста"), _t("📄 Идея на одной странице, помощник ищет слабые места"), _t("⏱ Проверка идеи за 7 дней и разговоры с клиентами"), _t("🤲 Истихара и голос команды перед большим решением"), _t("🎙 Демо-день по четвергам и пульс недели"), _t("📋 Дела и календарь команды вокруг намаза")] },
  friends: { sub: _t("поддержка"), caps: [_t("👀 Итог дня друг друга, без подробностей"), _t("🎯 Цель недели и вызовы"), _t("🤲 Дуа и чат")] },
  masjid: { sub: _t("община, уроки"), caps: [_t("📖 Общий хатм: каждый берёт свой джуз"), _t("🍲 Ифтары в Рамадан"), _t("💬 Чат общины и опросы"), _t("🤲 Просьбы о дуа")] },
  study: { sub: _t("Коран, арабский"), caps: [_t("🎓 Общий курс: проходить вместе, отзывы"), _t("🎯 Цель недели: страницы, уроки"), _t("💬 Чат и голосовые для чтения"), _t("📖 Общий хатм")] },
  work: { sub: _t("коллеги"), caps: [_t("👀 Итог дня, цель недели"), _t("💬 Чат")] },
  other: { sub: _t("своя цель"), caps: [_t("🎯 Итог дня, цель недели и вызовы"), _t("🤲 Дуа, чат и опросы")] },
};

/** Our kinds are the root of a circle's name: «Бизнес · Мойка». Only «Своё» is named freely. */
const RU_ROOT: Partial<Record<CircleKind, string>> = { umrah: 'Умра', family: 'Семья', brothers: 'Братья', sisters: 'Сёстры', biz: 'Бизнес', startup: 'Стартап', friends: 'Друзья', masjid: 'Мечеть, халака', study: 'Учёба', work: 'Работа' };
export function rootOf(kind?: CircleKind): string { return kind && kind !== 'other' ? kindOf(kind)?.ru ?? '' : ''; }
/** The part people wrote themselves, without the root (Russian or the current language) in front. */
export function suffixOf(title: string, kind?: CircleKind): string {
  let t = (title || '').trim();
  for (const r of [rootOf(kind), RU_ROOT[kind as CircleKind] ?? ''].filter(Boolean)) {
    if (t.toLowerCase() === r.toLowerCase()) return '';
    if (t.toLowerCase().startsWith(r.toLowerCase()) && /^[\s·:|—–-]/.test(t.slice(r.length))) { t = t.slice(r.length).replace(/^[\s·:|—–-]+/, ''); break; }
  }
  return t;
}
export const SUFFIX_MAX = (kind?: CircleKind) => Math.max(10, 40 - (rootOf(kind) ? rootOf(kind).length + 3 : 0));
/** The full name of a circle: root · own part. */
export function circleTitle(kind: CircleKind | undefined, own: string): string {
  const root = rootOf(kind);
  const o = own.trim();
  return (root ? (o ? `${root} · ${o}` : root) : o || _t("Мой круг")).slice(0, 40);
}
const fixTitle = (c: CircleRef): CircleRef => (c.kind && c.kind !== 'other' && !isDm(c.code) ? { ...c, title: circleTitle(c.kind, suffixOf(c.title, c.kind)) } : c);

function load(): CloudId | null {
  try {
    const x: CloudId | null = JSON.parse(localStorage.getItem(LS) || 'null');
    if (!x?.uid || !x?.token) return null;
    const list = (x.circles ?? []).filter((c) => c?.code);
    if (x.circle && !list.some((c) => c.code === x.circle)) list.unshift({ code: x.circle, title: _t("Мой круг") });
    return { ...x, circles: list.map(fixTitle) };
  } catch { return null; }
}
function save(x: CloudId | null) {
  try { if (x) localStorage.setItem(LS, JSON.stringify(x)); else localStorage.removeItem(LS); } catch { /* private mode */ }
}

async function rpc<T>(fn: string, args: Record<string, unknown>, bearer?: string): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(args),
  });
  if (!r.ok) { let m = ''; try { m = String((await r.json())?.message || ''); } catch { /* */ } throw new Error(`rpc ${fn} ${r.status}${m ? ` ${m}` : ''}`); }
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
/** Makes another of my circles the current one; `to` opens that page instead of the Circle tab (e.g. the umrah). */
export function switchCircle(code: string, to?: string) {
  const me = load();
  if (!me || !me.circles?.some((c) => c.code === code)) return;
  save({ ...me, circle: code });
  if (to) { location.assign(to); return; }
  try { sessionStorage.setItem('lm.tab', 'circle'); } catch { /* */ }
  location.reload();
}

const DM = 'lm.dm';
/** Chats of two opened by an ask: joined without the «Присоединиться» card. */
export function isDm(code?: string): boolean { try { return Boolean(code) && (JSON.parse(localStorage.getItem(DM) || '[]') as string[]).includes(code!); } catch { return false; } }
function markDm(code: string) { markDms([code]); }
/** Marks chats of two (from the server list, supabase/dm.sql). */
export function markDms(codes: string[]) { try { const l = JSON.parse(localStorage.getItem(DM) || '[]') as string[]; const add = codes.filter((c) => !l.includes(c)); if (add.length) localStorage.setItem(DM, JSON.stringify([...l, ...add].slice(-500))); } catch { /* */ } }
/** Adds a circle to my list without opening it (a chat of two that someone accepted). */
export function addCircleQuiet(ref: CircleRef) {
  const me = load();
  if (!me) return;
  markDm(ref.code);
  if (me.circles?.some((c) => c.code === ref.code)) return;
  save({ ...me, circle: me.circle ?? ref.code, circles: [...(me.circles ?? []), ref] });
}
/** Adds a circle and opens its chat (the page reloads). */
export function openCircleChat(ref: CircleRef) {
  const me = load();
  if (!me) return;
  markDm(ref.code);
  if (!me.circles?.some((c) => c.code === ref.code)) save({ ...me, circles: [...(me.circles ?? []), ref] });
  try { sessionStorage.setItem('lm.chat', ref.code); } catch { /* */ }
  switchCircle(ref.code);
}

/** Renames a circle for me (the name travels with new invite links). */
export function renameCircle(code: string, title: string, kind?: CircleKind) {
  const me = load();
  if (!me) return;
  const circles = (me.circles ?? []).map((c) => (c.code === code ? { ...c, title: title.trim().slice(0, 40) || c.title, kind: kind ?? c.kind } : c));
  save({ ...me, circles });
  const c = circles.find((x) => x.code === code);
  if (c) pushMeta(me, c);
}

/** Keeps my title and kind of a circle on the server, so another phone gets the same list. Best effort. */
function pushMeta(me: CloudId, c: CircleRef) {
  rpc('lm_circle_meta', { p_uid: me.uid, p_token: me.token, p_code: c.code, p_title: c.title, p_kind: c.kind ?? '' }).catch(() => { /* older server */ });
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

export async function createCircle(name: string, title = _t("Мой круг"), kind?: CircleKind): Promise<string> {
  const me = await ensureId(name);
  const code = await rpc<string>('lm_create_circle', { p_uid: me.uid, p_token: me.token });
  const ref = { code, title: title.trim().slice(0, 40) || _t("Мой круг"), kind };
  save(addCircle(me, ref));
  pushMeta(me, ref);
  return code;
}

export async function joinCircle(name: string, code: string, title = '', kind?: CircleKind): Promise<boolean> {
  const me = await ensureId(name);
  const c = code.toLowerCase().trim();
  const ok = await rpc<boolean>('lm_join', { p_uid: me.uid, p_token: me.token, p_code: c });
  if (ok) {
    const old = me.circles?.find((x) => x.code === c);
    const ref = { code: c, title: title.trim().slice(0, 40) || old?.title || _t("Круг друзей"), kind: kind ?? old?.kind };
    save(addCircle(me, ref));
    pushMeta(me, ref);
    try { sessionStorage.removeItem('lm.invite'); sessionStorage.removeItem('lm.inviteMeta'); } catch { /* */ }
  }
  return ok;
}

export async function setName(name: string) { await ensureId(name); }

/** Makes sure I have an identity (open circles, the common circle). */
export async function ensureMe(name: string): Promise<CloudId> { return ensureId(name || load()?.name || signupName() || _t("Участник")); }
/** A circle the server already let me into (an open circle): add it, open its chat. The page reloads. */
export function enterCircle(ref: CircleRef) {
  const me = load();
  if (!me) return;
  save(addCircle(me, ref));
  pushMeta(me, ref);
  try { sessionStorage.setItem('lm.chat', ref.code); sessionStorage.setItem('lm.autojoin', '1'); sessionStorage.setItem('lm.tab', 'circle'); } catch { /* */ }
  location.reload();
}

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

// ---- profile: nick, picture, privacy; invites by nick ----

export interface Profile {
  name: string; nick: string | null; bio: string; avatar: AvatarPick; photo: string; color: string;
  findable: boolean; invite_from: 'all' | 'circles' | 'none'; gender: '' | 'm' | 'f'; sisters_only: boolean; show_photo: boolean; email: boolean;
}
export interface Found {
  uid: string; name: string; nick: string; bio: string; avatar: AvatarPick; color: string; gender: string; photo: string;
  shared: string[]; can: 'ok' | 'closed' | 'circles_only';
}
export interface Invite {
  id: string; code: string; title: string; kind: string; count: number; created: string;
  from: { uid: string; name: string; nick: string | null; color: string; avatar: AvatarPick; photo: string };
}

/** True once the nick SQL is on the server; until then nick screens stay hidden. Cached per session. */
let nicksP: Promise<boolean> | null = null;
export function nicksReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.nicks') === '1') return Promise.resolve(true); } catch { /* */ }
  nicksP ??= rpc<string>('lm_nick_free', { p_uid: null, p_nick: 'zz_probe' }).then(() => { try { sessionStorage.setItem('lm.nicks', '1'); } catch { /* */ } return true; }, () => false);
  return nicksP;
}

export const NICK_RE = /^[a-z0-9_.]{3,20}$/;
export const cleanNick = (s: string) => s.trim().replace(/^@/, '').toLowerCase();

/** My profile from the server; null when I have no circle identity yet or the server is older. */
export async function getProfile(): Promise<Profile | null> {
  const me = load();
  if (!me) return null;
  try { return await rpc<Profile | null>('lm_profile', { p_uid: me.uid, p_token: me.token }); } catch { return null; }
}

/** 'ok' | 'bad' | 'taken' | 'error' */
export async function nickFree(nick: string): Promise<string> {
  try { return await rpc<string>('lm_nick_free', { p_uid: load()?.uid ?? null, p_nick: cleanNick(nick) }); } catch { return 'error'; }
}

/** Saves profile fields; creates my identity on first use. Returns 'ok' or a reason (nick_taken, nick_bad, photo_big, error). */
export async function saveProfile(p: Partial<Profile>, name: string): Promise<string> {
  try {
    const me = await ensureId(p.name ?? name);
    const r = await rpc<string>('lm_profile_set', { p_uid: me.uid, p_token: me.token, p });
    if (r === 'ok' && p.name) save({ ...me, name: p.name });
    return r;
  } catch { return 'error'; }
}

export async function findNick(nick: string): Promise<Found | null | 'error'> {
  const me = load();
  if (!me) return 'error';
  try { return await rpc<Found | null>('lm_find', { p_uid: me.uid, p_token: me.token, p_nick: cleanNick(nick) }); } catch { return 'error'; }
}

/** Nicks that start with q (2+ characters), privacy rules applied on the server. 'old' when the server lacks lm_find_many. */
export async function findNicks(q: string): Promise<Found[] | 'old' | 'error'> {
  const me = load();
  if (!me) return 'error';
  try { return (await rpc<Found[] | null>('lm_find_many', { p_uid: me.uid, p_token: me.token, p_q: cleanNick(q) })) ?? []; }
  catch (e) { return / 404$/.test(String((e as Error)?.message ?? e)) ? 'old' : 'error'; }
}

/** People from my other circles who are not yet in this one and accept invites. */
export async function circleMates(code: string): Promise<Found[]> {
  const me = load();
  if (!me) return [];
  try { return (await rpc<Found[] | null>('lm_circle_mates', { p_uid: me.uid, p_token: me.token, p_code: code })) ?? []; } catch { return []; }
}

/** 'ok' | 'closed' | 'already_in' | 'wrong_kind' | 'limit' | 'full' | 'not_member' | 'error' */
export async function sendInvite(code: string, to: string): Promise<string> {
  const me = load();
  const c = me?.circles?.find((x) => x.code === code);
  if (!me || !c) return 'error';
  try { return await rpc<string>('lm_invite', { p_uid: me.uid, p_token: me.token, p_code: code, p_to: to, p_title: c.title, p_kind: c.kind ?? '' }); } catch { return 'error'; }
}

export async function inbox(): Promise<Invite[]> {
  const me = load();
  if (!me) return [];
  try { return (await rpc<Invite[]>('lm_inbox', { p_uid: me.uid, p_token: me.token })) ?? []; } catch { return []; }
}

/** Accepting adds the circle here and opens it (the page reloads). */
export async function answerInvite(inv: Invite, accept: boolean): Promise<boolean> {
  const me = load();
  if (!me) return false;
  try {
    const r = await rpc<{ ok: boolean; code?: string; title?: string; kind?: string } | null>('lm_answer', { p_uid: me.uid, p_token: me.token, p_id: inv.id, p_accept: accept });
    if (!r?.ok) return false;
    if (accept && r.code) {
      const kind = CIRCLE_KINDS.some((k) => k.id === r.kind) ? (r.kind as CircleKind) : undefined;
      save(addCircle(me, { code: r.code, title: r.title || _t("Круг"), kind }));
      try { sessionStorage.setItem('lm.tab', 'circle'); sessionStorage.setItem('lm.autojoin', '1'); } catch { /* */ }
      location.reload();
    }
    return true;
  } catch { return false; }
}

export async function blockUser(uid: string): Promise<boolean> {
  const me = load();
  if (!me) return false;
  try { return await rpc<boolean>('lm_block', { p_uid: me.uid, p_token: me.token, p_other: uid }); } catch { return false; }
}

/**
 * Signed in by email: ties this device's profile to the email, or, on a new phone, takes over the profile
 * already tied to it (with its circles). Runs once per sign-in; reloads if the identity changed.
 */
// v2: re-run once everywhere after the fix that stopped a second email from taking over a profile tied to another email.
export const CLAIMED = 'lm.claimed2';
export async function claimByEmail(accessToken: string, authId: string, name: string) {
  try {
    if (localStorage.getItem(CLAIMED) === authId) return;
    const me = load();
    const r = await rpc<{ uid: string; token: string; name?: string; same: boolean } | null>('lm_claim', { p_uid: me?.uid ?? null, p_token: me?.token ?? null, p_name: name }, accessToken);
    if (!r?.uid) return;
    localStorage.setItem(CLAIMED, authId);
    const list = await rpc<{ code: string; title: string; kind: string }[]>('lm_circles', { p_uid: r.uid, p_token: r.token }).catch(() => []);
    const local = r.same ? me?.circles ?? [] : [];
    const merged: CircleRef[] = [...local];
    for (const c of list ?? []) {
      const kind = CIRCLE_KINDS.some((k) => k.id === c.kind) ? (c.kind as CircleKind) : undefined;
      const i = merged.findIndex((x) => x.code === c.code);
      if (i < 0) merged.push({ code: c.code, title: c.title || _t("Круг"), kind });
      else if (!c.title) pushMeta({ uid: r.uid, token: r.token, name }, merged[i]);
    }
    const next: CloudId = { uid: r.uid, token: r.token, name: r.name || (r.same ? me?.name : '') || name, circles: merged, circle: (r.same && me?.circle) || merged[0]?.code };
    save(next);
    if (!r.same) {
      try {
        localStorage.removeItem('lm.profile');
        // A returning person on a new phone: greet them by the name their profile already has.
        const rec = JSON.parse(localStorage.getItem('lm.signup') || 'null');
        if (r.name && !rec?.name) localStorage.setItem('lm.signup', JSON.stringify({ ...(rec ?? {}), name: r.name, pending: false }));
      } catch { /* */ }
      location.reload();
    }
  } catch { /* server not updated yet: try again next start */ }
}

// ---- stand-in for window.claude ----

interface State { owner: string; members: { uid: string; name: string; color: string; nick?: string; avatar?: AvatarPick; photo?: string; gender?: string }[]; docs: { coll: string; key: string; data: any }[] }
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
      const out: Record<string, { name: string; avatarUrl: string; color: string; gender?: string }> = {};
      for (const id of ids) {
        const m = state?.members.find((x) => x.uid === id);
        out[id] = { name: m?.name || '', avatarUrl: m ? avatarUrl(m.avatar, m.avatar?.c || m.color, m.photo) : '', color: m?.avatar?.c || m?.color || '#1f7a4d', gender: m?.gender || '' };
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
  const a = authMe();
  if (a && localStorage.getItem(CLAIMED) !== a.id) accessToken().then((t) => { if (t) void claimByEmail(t, a.id, signupName() || a.name || ''); });
  const me = load();
  const rt = me?.circle ? makeRuntime(me as CloudId & { circle: string }) : null;
  window.claude = {
    use: async (name: string) => (name === 'db' ? rt?.db ?? null : name === 'user' ? rt?.user ?? null : null),
  };
}

/** Sign-out: forget this device's circle identity so the next email does not inherit it. Signing in again brings it back. */
export function forgetIdentity() {
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k === LS || k === 'lm.claimed' || k === CLAIMED || k === 'lm.profile' || k === 'lm.signup' || /^lm\.(cg|ask|ch|acc|amir)\./.test(k)) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem('lm.admin');
    localStorage.removeItem('lm.owner');
  } catch { /* */ }
}

/** Any RPC, as anyone or with a bearer token. */
export const cloudRpc = <T,>(fn: string, args: Record<string, unknown>, bearer?: string) => rpc<T>(fn, args, bearer);

/** Calls an RPC as me (uid + token added). Throws when there is no identity or the call fails. */
export async function meRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const me = load();
  if (!me) throw new Error('no identity');
  return rpc<T>(fn, { p_uid: me.uid, p_token: me.token, ...args });
}
/** Probes for a server function without an identity: true when it exists. */
export async function serverHas(fn: string, args: Record<string, unknown>): Promise<boolean> {
  try { await rpc(fn, args); return true; } catch { return false; }
}
