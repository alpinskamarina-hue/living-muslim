// Email sign-in (Supabase Auth). The landing page signs people in with a one-time code; a click on the
// link in the same email lands here with the session in the address hash. Both end up in localStorage 'lm.auth'.

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const LS = 'lm.auth';

export interface AuthSession { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string; name?: string } }

function load(): AuthSession | null {
  try { const x = JSON.parse(localStorage.getItem(LS) || 'null'); return x?.access_token && x?.user?.email ? x : null; } catch { return null; }
}
function save(x: AuthSession | null) {
  try { if (x) localStorage.setItem(LS, JSON.stringify(x)); else localStorage.removeItem(LS); } catch { /* private mode */ }
}

function decodeJwt(t: string): any {
  try {
    const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4)))));
  } catch { return null; }
}

/** Builds a session from tokens; user details come from the token itself, so no network call is needed. */
function fromTokens(access_token: string, refresh_token: string, expires_in?: number): AuthSession | null {
  const c = decodeJwt(access_token);
  if (!c?.sub || !c?.email) return null;
  return {
    access_token, refresh_token,
    expires_at: c.exp ? c.exp * 1000 : Date.now() + (expires_in || 3600) * 1000,
    user: { id: c.sub, email: c.email, name: c.user_metadata?.name || undefined },
  };
}

/** Name from sign-up, so the app can greet the person. Keeps the landing's record if there is one. */
function rememberName(s: AuthSession) {
  try {
    const rec = JSON.parse(localStorage.getItem('lm.signup') || 'null');
    if (!rec?.name && s.user.name) localStorage.setItem('lm.signup', JSON.stringify({ name: s.user.name, email: s.user.email, pending: false }));
  } catch { /* */ }
}

/** Magic-link return: #access_token=…&refresh_token=… in the address. Runs once at start-up. */
export let authError = '';
(function readHash() {
  if (typeof location === 'undefined' || !location.hash) return;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('error_description')) authError = h.get('error_description') || '';
  const at = h.get('access_token'), rt = h.get('refresh_token');
  if (at && rt) {
    const s = fromTokens(at, rt, Number(h.get('expires_in')) || undefined);
    if (s) { save(s); rememberName(s); }
  }
  if (at || authError) history.replaceState(null, '', location.pathname + location.search);
})();

export function authMe(): AuthSession['user'] | null { return load()?.user ?? null; }

/** A valid access token, refreshed if it is about to expire. Null when signed out or the refresh failed. */
export async function accessToken(): Promise<string | null> {
  const s = load();
  if (!s) return null;
  if (s.expires_at - Date.now() > 60_000) return s.access_token;
  try {
    const r = await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!r.ok) { if (r.status === 400 || r.status === 401) save(null); return null; }
    const j = await r.json();
    const n = fromTokens(j.access_token, j.refresh_token, j.expires_in);
    if (n) save(n);
    return n?.access_token ?? null;
  } catch { return null; }
}

export async function signOut() {
  const s = load();
  save(null);
  if (!s) return;
  try { await fetch(`${SB}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` } }); } catch { /* signed out locally anyway */ }
}

/** Where "Sign in" goes: the landing's form in sign-in mode. */
export const signInUrl = '/?home&login#join';
