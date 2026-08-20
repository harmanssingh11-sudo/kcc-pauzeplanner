(()=>{
  'use strict';

  const SB = 'https://lfyxjbcsrsmbaflhbtbx.supabase.co';
  const KEY = 'sb_publishable_VrglfWR4mfvAcrm1MLZY3Q_XH6L5st1';
  const PREF_LOCK_TIME = '09:30';

  const $ = (id) => document.getElementById(id);

  // De planningslogica zelf staat in engine.js (window.PauzeEngine), zodat dezelfde code
  // ook los met Node getest wordt (zie engine.test.js). app-v5.js is puur de UI-laag.
  const { DAYS, BIG_SLOTS, toMin, toHHMM, emptyWeek, weekdayOf, scheduleFor, isEligible, buildPlan } = window.PauzeEngine;

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

  let people = [];

  function today() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function setToday() { $('date').value = today(); }

  function preferenceClosed() {
    if ($('date').value !== today()) return false;
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes() >= toMin(PREF_LOCK_TIME);
  }

  function updateLockNote() {
    const el = $('lockNote');
    if (!el) return;
    el.textContent = preferenceClosed()
      ? `🔒 Voorkeuren voor vandaag zijn gesloten (na ${PREF_LOCK_TIME}). Wijzigingen gelden als verzoek.`
      : `Om ${PREF_LOCK_TIME} worden voorkeuren voor vandaag gesloten.`;
  }

  async function loadPeople() {
    const rows = await api('kcc_work_profiles?select=*&order=name') || [];
    const ids = rows.map((r) => r.id);
    const schedules = ids.length
      ? await api(`kcc_work_schedule?select=*&profile_id=in.(${ids.join(',')})`)
      : [];

    people = rows.map((r) => {
      const p = {
        id: r.id,
        name: r.name,
        type: r.type || 'KCC',
        active: r.active !== false,
        pref: r.big_break_preference ? String(r.big_break_preference).slice(0, 5) : '',
        week: emptyWeek(),
        open: false,
      };
      (schedules || []).filter((s) => s.profile_id === r.id).forEach((s) => {
        p.week[s.weekday - 1] = {
          work: !!s.working,
          start: s.start_time ? String(s.start_time).slice(0, 5) : '08:00',
          end: s.end_time ? String(s.end_time).slice(0, 5) : '18:00',
        };
      });
      return p;
    });
  }

  async function saveProfile(p) {
    try {
      if (!p.id) {
        const created = await api('kcc_work_profiles', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify([{ name: p.name || 'Nieuwe collega', type: p.type, active: p.active, big_break_preference: p.pref || null }]),
        });
        p.id = created?.[0]?.id;
        if (!p.id) throw new Error('Geen profiel-ID ontvangen.');
      } else {
        await api(`kcc_work_profiles?id=eq.${p.id}`, {
          method: 'PATCH', body: JSON.stringify({ name: p.name, type: p.type, active: p.active, big_break_preference: p.pref || null, updated_at: new Date().toISOString() }),
        });
      }
      await api('kcc_work_schedule?on_conflict=profile_id%2Cweekday', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(p.week.map((w, i) => ({ profile_id: p.id, weekday: i + 1, working: w.work, start_time: w.work ? w.start : null, end_time: w.work ? w.end : null }))),
      });
    } catch (e) {
      console.error(e);
      alert('Opslaan naar de centrale database is mislukt: ' + e.message);
    }
  }

  function renderPeople() {
    const body = $('peopleBody');
    const preferenceOptions = '<option value="">Geen voorkeur</option>' + BIG_SLOTS.map((x) => `<option value="${x}">${x}</option>`).join('');
    body.innerHTML = people.map((p, i) => `
      <tr>
        <td><input class="nameInput" data-i="${i}" value="${escapeHtml(p.name)}"></td>
        <td><select class="typeInput" data-i="${i}"><option ${p.type === 'KCC' ? 'selected' : ''}>KCC</option><option ${p.type === 'Webcare' ? 'selected' : ''}>Webcare</option><option ${p.type === 'Coördinator' ? 'selected' : ''}>Coördinator</option></select></td>
        <td><select class="prefInput" data-i="${i}">${preferenceOptions.replace(`value="${p.pref}"`, `value="${p.pref}" selected`)}</select></td>
        <td><input type="checkbox" class="activeInput" data-i="${i}" ${p.active ? 'checked' : ''}></td>
        <td><button class="secondary profileBtn" data-i="${i}">${p.open ? 'Sluiten' : 'Profiel'}</button></td>
      </tr>
      ${p.open ? `<tr><td colspan="5"><div class="profileBox"><b>Werkprofiel: ${escapeHtml(p.name)}</b><div class="weekGrid">
        ${DAYS.map((d, di) => { const w = p.week[di]; return `<div class="dayCard"><b>${d}</b><label><input type="checkbox" class="dayWork" data-i="${i}" data-d="${di}" ${w.work ? 'checked' : ''}> Werkt</label><input type="time" class="dayStart" data-i="${i}" data-d="${di}" value="${w.start}" ${w.work ? '' : 'disabled'}><span>tot</span><input type="time" class="dayEnd" data-i="${i}" data-d="${di}" value="${w.end}" ${w.work ? '' : 'disabled'}></div>`; }).join('')}
      </div></div></td></tr>` : ''}
    `).join('');

    body.querySelectorAll('.profileBtn').forEach((btn) => btn.onclick = () => { people[+btn.dataset.i].open = !people[+btn.dataset.i].open; renderPeople(); });
    body.querySelectorAll('input,select').forEach((input) => input.onchange = async () => {
      const p = people[+input.dataset.i];
      if (input.classList.contains('nameInput')) p.name = input.value;
      if (input.classList.contains('typeInput')) p.type = input.value;
      if (input.classList.contains('prefInput')) p.pref = input.value;
      if (input.classList.contains('activeInput')) p.active = input.checked;
      if (input.dataset.d !== undefined) {
        const d = +input.dataset.d;
        if (input.classList.contains('dayWork')) p.week[d].work = input.checked;
        if (input.classList.contains('dayStart')) p.week[d].start = input.value;
        if (input.classList.contains('dayEnd')) p.week[d].end = input.value;
      }
      await saveProfile(p);
      renderPeople();
      generate();
    });
    $('statPeople').textContent = people.filter((p) => isEligible(p, $('date').value)).length;
  }

  function renderPlan(result) {
    const groups = {};
    result.plan.forEach((b) => (groups[b.t] ||= []).push(b));
    $('schedule').innerHTML = Object.keys(groups).sort((a, b) => a - b).map((t) => `
      <div class="slot"><time>${toHHMM(+t)}</time><div class="cards">${groups[t].map((b) => `<div class="breakcard ${b.kind === 'big' ? 'bigcard' : ''} ${b.exception ? 'warningcard' : ''}"><b>${escapeHtml(b.p.name)}</b> ${b.kind === 'big' ? 'Grote pauze' : b.kind === 'mini1' ? 'Mini 1' : 'Mini 2'}${b.pref ? ' ⭐' : ''}${b.exception ? ' ⚠️' : ''}</div>`).join('')}</div></div>
    `).join('');
  }

  function generate() {
    const result = buildPlan(people, $('date').value);
    $('statPeople').textContent = result.eligibleCount;
    $('statBreaks').textContent = result.plan.length;
    $('statWarnings').textContent = result.warnings.length;
    $('score').textContent = result.score + '%';
    $('alerts').innerHTML = result.warnings.length
      ? `<div class="alert"><b>⚠️ ${result.warnings.length} aandachtspunt${result.warnings.length > 1 ? 'en' : ''}</b><br>${result.warnings.map((w) => '• ' + escapeHtml(w)).join('<br>')}</div>`
      : '<div class="alert">✓ Geen aandachtspunten.</div>';
    renderPlan(result);
  }

  async function loadRequests() {
    try {
      const rows = await api('kcc_break_requests?select=*&status=eq.new&order=work_date') || [];
      $('requests').innerHTML = rows.length
        ? rows.map((r) => `<div class="alert">${escapeHtml(r.work_date)} — ${escapeHtml(people.find((p) => p.id === r.profile_id)?.name || 'Onbekend')} — ${escapeHtml(r.request_type)} ${r.requested_time ? escapeHtml(String(r.requested_time).slice(0, 5)) : ''}${r.reason ? ' — ' + escapeHtml(r.reason) : ''}</div>`).join('')
        : '<div class="alert">Geen openstaande meldingen.</div>';
    } catch (e) {
      $('requests').innerHTML = '<div class="alert">Meldingen konden niet worden geladen.</div>';
    }
  }

  async function refresh() { await loadPeople(); renderPeople(); generate(); await loadRequests(); updateLockNote(); }

  setToday();
  $('date').onchange = () => { updateLockNote(); generate(); };
  $('generate').onclick = generate;
  $('loadDemo').onclick = () => refresh().catch((e) => $('alerts').innerHTML = '<div class="alert">Laden mislukt: ' + escapeHtml(e.message) + '</div>');
  $('addPerson').onclick = () => { people.push({ id: null, name: '', type: 'KCC', active: true, pref: '', week: emptyWeek(), open: true }); renderPeople(); };
  updateLockNote();
  setInterval(updateLockNote, 60000);
  refresh().catch((e) => $('alerts').innerHTML = '<div class="alert">Laden mislukt: ' + escapeHtml(e.message) + '</div>');
})();