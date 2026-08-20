(() => {
  'use strict';

  // Medewerker-facing pagina: alleen naam kiezen, eigen agenda bekijken, eventueel een
  // voorkeur doorgeven. Geen toegang tot andermans profielen of de planner-tools -
  // dat blijft voorbehouden aan index.html.

  const SB = 'https://lfyxjbcsrsmbaflhbtbx.supabase.co';
  const KEY = 'sb_publishable_VrglfWR4mfvAcrm1MLZY3Q_XH6L5st1';
  const PREF_LOCK_TIME = '09:30';
  const STORAGE_KEY = 'kcc_mijn_naam_id';

  const $ = (id) => document.getElementById(id);
  const { DAYS, BIG_SLOTS, toMin, toHHMM, emptyWeek, buildPlan, rightsFor } = window.PauzeEngine;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(path, opt = {}) {
    const res = await fetch(`${SB}/rest/v1/${path}`, {
      ...opt,
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opt.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || String(res.status));
    return text.trim() ? JSON.parse(text) : null;
  }

  function today() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function startOfWeek(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const dow = d.getDay() || 7;
    return addDays(dateStr, 1 - dow);
  }

  let people = [];
  let selectedId = '';
  let weekStart = startOfWeek(today());

  async function loadPeople() {
    const rows = (await api('kcc_work_profiles?select=*&order=name')) || [];
    const ids = rows.map((r) => r.id);
    const schedules = ids.length ? await api(`kcc_work_schedule?select=*&profile_id=in.(${ids.join(',')})`) : [];
    people = rows.map((r) => {
      const p = { id: r.id, name: r.name, type: r.type || 'KCC', active: r.active !== false, pref: r.big_break_preference ? String(r.big_break_preference).slice(0, 5) : '', week: emptyWeek() };
      (schedules || []).filter((s) => s.profile_id === r.id).forEach((s) => {
        p.week[s.weekday - 1] = { work: !!s.working, start: s.start_time ? String(s.start_time).slice(0, 5) : '08:00', end: s.end_time ? String(s.end_time).slice(0, 5) : '18:00' };
      });
      return p;
    });
  }

  function populateNameSelect() {
    const sel = $('whoName');
    const activeKcc = people.filter((p) => p.active && p.type === 'KCC').sort((a, b) => a.name.localeCompare(b.name));
    sel.innerHTML = '<option value="">Kies je naam…</option>' + activeKcc.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    let remembered = '';
    try { remembered = localStorage.getItem(STORAGE_KEY) || ''; } catch (e) {}
    if (remembered && activeKcc.some((p) => p.id === remembered)) { sel.value = remembered; selectedId = remembered; }
  }

  function populatePrefSelect() {
    $('reqPref').innerHTML = '<option value="">Geen specifieke tijd</option>' + BIG_SLOTS.map((s) => `<option value="${s}">${s}</option>`).join('');
  }

  const WEEKDAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
  function formatNL(dateStr) { const [y, m, d] = dateStr.split('-'); return `${d}-${m}-${y}`; }

  function renderAgenda() {
    const person = people.find((p) => p.id === selectedId);
    if (!person) { $('agendaPanel').style.display = 'none'; $('requestPanel').style.display = 'none'; return; }
    $('agendaPanel').style.display = ''; $('requestPanel').style.display = '';
    const weekEnd = addDays(weekStart, 6);
    $('agendaTitle').textContent = `Mijn week (${formatNL(weekStart)} t/m ${formatNL(weekEnd)})`;
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    $('agendaDays').innerHTML = days.map((dateStr, i) => {
      const s = person.week[i];
      const label = `${WEEKDAY_LABELS[i]}<br><span class="agendaMuted">${formatNL(dateStr)}</span>`;
      if (!s || !s.work) return `<div class="dayCard agendaCard"><b>${label}</b><span class="agendaMuted">Vrije dag</span></div>`;
      const rights = rightsFor(s);
      if (!rights.length) return `<div class="dayCard agendaCard"><b>${label}</b><span class="agendaMuted">${s.start}–${s.end}</span><span class="agendaMuted">Geen pauzerecht (≤ 4 uur)</span></div>`;
      const { plan } = buildPlan(people, dateStr);
      const mine = plan.filter((b) => b.p.id === selectedId).sort((a, b) => a.t - b.t);
      const rows = mine.length ? mine.map((b) => `<div class="agendaBreak ${b.kind === 'big' ? 'agendaBig' : ''}">${b.kind === 'big' ? 'Grote pauze' : b.kind === 'mini1' ? 'Mini 1' : 'Mini 2'}: <b>${toHHMM(b.t)}</b>${b.pref ? ' ⭐' : ''}</div>`).join('') : '<span class="agendaMuted">Nog niet gepland door de planner.</span>';
      return `<div class="dayCard agendaCard"><b>${label}</b><span class="agendaMuted">${s.start}–${s.end}</span>${rows}</div>`;
    }).join('');
  }

  function preferenceClosed(dateStr) {
    if (dateStr !== today()) return false;
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes() >= toMin(PREF_LOCK_TIME);
  }

  function reqMessage(text, kind) { $('reqMsg').innerHTML = `<div class="alert ${kind}">${escapeHtml(text)}</div>`; }

  async function submitRequest(ev) {
    ev.preventDefault();
    if (!selectedId) return reqMessage('Kies eerst je naam.', 'error');
    const workDate = $('reqDate').value, requestedTime = $('reqPref').value, reason = $('reqReason').value.trim();
    if (!workDate) return reqMessage('Kies een datum.', 'error');
    if (!requestedTime && !reason) return reqMessage('Kies een gewenste tijd of geef een toelichting - een leeg verzoek heeft niets om aan te werken.', 'error');
    if (preferenceClosed(workDate)) return reqMessage(`Voorkeuren voor vandaag zijn na ${PREF_LOCK_TIME} gesloten. Neem voor last-minute wijzigingen rechtstreeks contact op met de planner.`, 'error');
    const btn = ev.target.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
    try {
      await api('kcc_break_requests', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify([{ profile_id: selectedId, work_date: workDate, requested_time: requestedTime || null, request_type: 'grote pauze voorkeur', reason: reason || null, status: 'new' }]) });
      reqMessage(`Bedankt! Je verzoek voor ${formatNL(workDate)} is verstuurd naar de planner.`, 'ok');
      $('reqReason').value = ''; $('reqPref').value = '';
    } catch (e) { reqMessage('Versturen is mislukt: ' + e.message, 'error'); }
    finally { if (btn) btn.disabled = false; }
  }

  async function init() {
    populatePrefSelect(); $('reqDate').min = today(); $('reqDate').value = today();
    $('whoName').onchange = () => { selectedId = $('whoName').value; try { if (selectedId) localStorage.setItem(STORAGE_KEY, selectedId); } catch (e) {} weekStart = startOfWeek(today()); renderAgenda(); };
    $('prevWeek').onclick = () => { weekStart = addDays(weekStart, -7); renderAgenda(); };
    $('nextWeek').onclick = () => { weekStart = addDays(weekStart, 7); renderAgenda(); };
    $('thisWeek').onclick = () => { weekStart = startOfWeek(today()); renderAgenda(); };
    $('requestForm').addEventListener('submit', submitRequest);
    try { await loadPeople(); populateNameSelect(); if (selectedId) renderAgenda(); }
    catch (e) { document.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="alert error">Laden mislukt: ${escapeHtml(e.message)}</div>`); }
  }
  init();
})();