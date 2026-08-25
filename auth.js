// KCC Pauzeplanner - gedeelde authenticatie-laag.
// Praat rechtstreeks met Supabase Auth (GoTrue) via fetch.
(() => {
  'use strict';
  const SB = 'https://lfyxjbcsrsmbaflhbtbx.supabase.co';
  const KEY = 'sb_publishable_VrglfWR4mfvAcrm1MLZY3Q_XH6L5st1';
  const AUTH = `${SB}/auth/v1`;
  const SESSION_KEY = 'kcc_auth_session';
  const REMEMBER_KEY = 'kcc_auth_remember';
  const nativeFetch = window.fetch.bind(window);
  function store(remember) { return remember ? localStorage : sessionStorage; }
  function loadSession() { try { const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function saveSession(session, remember) { try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); if (remember !== undefined) localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); const rememberNow = remember !== undefined ? remember : localStorage.getItem(REMEMBER_KEY) === '1'; if (session) store(rememberNow).setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(REMEMBER_KEY); } catch (e) {} }
  function withExpiry(session) { if (session && session.expires_in) session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in; return session; }
  async function authFetch(path, opt = {}) { const res = await nativeFetch(`${AUTH}${path}`, { ...opt, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(opt.headers || {}) } }); const text = await res.text(); const data = text.trim() ? JSON.parse(text) : null; if (!res.ok) { const msg = (data && (data.error_description || data.msg || data.error_code || data.error)) || text || String(res.status); throw new Error(msg); } return data; }
  async function signUp(email, password, redirectTo) { const path = redirectTo ? `/signup?redirect_to=${encodeURIComponent(redirectTo)}` : '/signup'; return authFetch(path, { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }); }
  async function signIn(email, password, remember) { const data = withExpiry(await authFetch('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) })); saveSession(data, remember); return data; }
  async function signOut() { const session = loadSession(); if (session && session.access_token) { try { await authFetch('/logout', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }); } catch (e) {} } clearSession(); }
  async function requestPasswordReset(email, redirectTo) { const path = redirectTo ? `/recover?redirect_to=${encodeURIComponent(redirectTo)}` : '/recover'; return authFetch(path, { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }) }); }
  async function updatePassword(accessToken, newPassword) { return authFetch('/user', { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ password: newPassword }) }); }
  async function refresh(session) { return withExpiry(await authFetch('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) })); }
  async function getSession() { let session = loadSession(); if (!session || !session.refresh_token) return null; const now = Math.floor(Date.now() / 1000); if (!session.expires_at || session.expires_at - now < 60) { try { const remember = localStorage.getItem(REMEMBER_KEY) === '1'; session = await refresh(session); saveSession(session, remember); } catch (e) { clearSession(); return null; } } return session; }
  async function getMyRole(session) { const res = await nativeFetch(`${SB}/rest/v1/kcc_user_roles?select=*&user_id=eq.${session.user.id}`, { headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` } }); const text = await res.text(); if (!res.ok) throw new Error(text || String(res.status)); const rows = text.trim() ? JSON.parse(text) : []; return rows[0] || null; }
  function roleSatisfies(actual, required) { if (!required) return true; if (actual === required) return true; return actual === 'planner_medewerker' && (required === 'planner' || required === 'medewerker'); }
  function landingFor(role) { return role === 'medewerker' ? 'mijn-pauzes.html' : 'index.html'; }
  async function requireSession(requiredRole) { const session = await getSession(); const here = location.pathname.split('/').pop() || 'index.html'; if (!session) { location.replace(`login.html?next=${encodeURIComponent(here)}`); return null; } let role; try { role = await getMyRole(session); } catch (e) { role = null; } if (!role) { document.body.insertAdjacentHTML('afterbegin', '<div class="alert error" style="margin:18px">Dit account is nog niet gekoppeld aan een rol. Vraag de planner om je e-mailadres toe te voegen onder "Toegang &amp; accounts".</div>'); return null; } if (!roleSatisfies(role.role, requiredRole)) { location.replace(landingFor(role.role)); return null; } return { session, role }; }

  // Herstel verlopen Supabase JWT's automatisch voor REST-calls vanuit de app.
  // Alleen een 401/PGRST303 wordt opnieuw geprobeerd; normale requests blijven ongemoeid.
  let refreshPromise = null;
  async function refreshOnce() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const session = loadSession();
      if (!session || !session.refresh_token) throw new Error('Sessie verlopen. Log opnieuw in.');
      const fresh = await refresh(session);
      const remember = localStorage.getItem(REMEMBER_KEY) === '1';
      saveSession(fresh, remember);
      return fresh;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const isRest = typeof url === 'string' && url.startsWith(`${SB}/rest/v1/`);
    if (!isRest) return nativeFetch(input, init);
    const res = await nativeFetch(input, init);
    if (res.status !== 401) return res;
    const clone = res.clone();
    let data = null;
    try { data = await clone.json(); } catch (e) {}
    const expired = data && (data.code === 'PGRST303' || String(data.message || '').toLowerCase().includes('jwt expired'));
    if (!expired) return res;
    try {
      const fresh = await refreshOnce();
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${fresh.access_token}`);
      headers.set('apikey', KEY);
      return nativeFetch(input, { ...init, headers });
    } catch (e) {
      return res;
    }
  };

  window.KccAuth = { signUp, signIn, signOut, requestPasswordReset, updatePassword, getSession, getMyRole, requireSession, saveSession, landingFor };
})();