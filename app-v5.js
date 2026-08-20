(() => {
  'use strict';

  const SB = 'https://lfyxjbcsrsmbaflhbtbx.supabase.co';
  const KEY = 'sb_publishable_VrglfWR4mfvAcrm1MLZY3Q_XH6L5st1';
  const PREF_LOCK_TIME = '09:30';
  const $ = (id) => document.getElementById(id);
  const { DAYS, BIG_SLOTS, toMin, toHHMM, emptyWeek, isEligible, buildPlan } = window.PauzeEngine;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function formatNL(dateStr) {
    if (!dateStr) return '';
    const [y,m,d] = String(dateStr).split('-');
    return `${d}-${m}-${y}`;
  }
  async function api(path, opt = {}) {
    const res = await fetch(`${SB}/rest/v1/${path}`, {
      ...opt,
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opt.headers || {}) }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || String(res.status));
    return text.trim() ? JSON.parse(text) : null;
  }

  let people = [];
  let searchTerm = '';

  function today() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }
  function setToday() { $('date').value = today(); }
  function updateLockNote() {
    const el = $('lockNote');
    if (!el) return;
    const n = new Date();
    const closed = $('date').value === today() && n.getHours()*60+n.getMinutes() >= toMin(PREF_LOCK_TIME);
    el.textContent = closed
      ? `🔒 Voorkeuren voor vandaag zijn gesloten (na ${PREF_LOCK_TIME}). Wijzigingen gelden als verzoek.`
      : `Om ${PREF_LOCK_TIME} worden voorkeuren voor vandaag gesloten.`;
  }

  async function loadPeople() {
    const rows = await api('kcc_work_profiles?select=*&order=name') || [];
    const ids = rows.map(r => r.id);
    const schedules = ids.length ? await api(`kcc_work_schedule?select=*&profile_id=in.(${ids.join(',')})`) : [];
    people = rows.map(r => {
      const p = {
        id:r.id, _key:r.id, name:r.name || '', type:r.type || 'KCC', active:r.active !== false,
        pref:r.big_break_preference ? String(r.big_break_preference).slice(0,5) : '', week:emptyWeek(), open:false
      };
      (schedules || []).filter(s => s.profile_id === r.id).forEach(s => {
        p.week[s.weekday-1] = { work:!!s.working, start:s.start_time ? String(s.start_time).slice(0,5) : '08:00', end:s.end_time ? String(s.end_time).slice(0,5) : '18:00' };
      });
      return p;
    });
  }

  async function saveProfile(p) {
    try {
      if (!p.id) {
        const created = await api('kcc_work_profiles', { method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify([{name:p.name || 'Nieuwe collega',type:p.type,active:p.active,big_break_preference:p.pref || null}]) });
        p.id = created?.[0]?.id;
        if (!p.id) throw new Error('Geen profiel-ID ontvangen.');
        p._key = p.id;
      } else {
        await api(`kcc_work_profiles?id=eq.${p.id}`, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({name:p.name,type:p.type,active:p.active,big_break_preference:p.pref || null,updated_at:new Date().toISOString()}) });
      }
      await api('kcc_work_schedule?on_conflict=profile_id%2Cweekday', { method:'POST', headers:{Prefer:'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify(p.week.map((w,i)=>({profile_id:p.id,weekday:i+1,working:w.work,start_time:w.work?w.start:null,end_time:w.work?w.end:null}))) });
    } catch(e) { console.error(e); alert('Opslaan naar de centrale database is mislukt: ' + e.message); }
  }

  function filteredPeople() {
    const term = searchTerm.trim().toLowerCase();
    return term ? people.filter(p => p.name.toLowerCase().includes(term)) : people;
  }

  function renderPeople() {
    const body = $('peopleBody');
    const preferenceOptions = '<option value="">Geen voorkeur</option>' + BIG_SLOTS.map(x => `<option value="${x}">${x}</option>`).join('');
    const list = filteredPeople();
    body.innerHTML = list.map(p => {
      let html = `<tr><td><button type="button" class="linklike nameBtn" data-key="${p._key}">${escapeHtml(p.name) || '(naamloos)'}</button></td><td>${escapeHtml(p.type)}</td><td><input type="checkbox" class="activeInput" data-key="${p._key}" ${p.active ? 'checked' : ''}></td><td><button type="button" class="secondary removeBtn" data-key="${p._key}">Verwijderen</button></td></tr>`;
      if (p.open) {
        const days = DAYS.map((d,di) => { const w=p.week[di]; return `<div class="dayCard"><b>${d}</b><label><input type="checkbox" class="dayWork" data-key="${p._key}" data-d="${di}" ${w.work?'checked':''}> Werkt</label><input type="time" class="dayStart" data-key="${p._key}" data-d="${di}" value="${w.start}" ${w.work?'':'disabled'}><span>tot</span><input type="time" class="dayEnd" data-key="${p._key}" data-d="${di}" value="${w.end}" ${w.work?'':'disabled'}></div>`; }).join('');
        html += `<tr><td colspan="4"><div class="profileBox"><div class="profileTitle"><b>Rooster: ${escapeHtml(p.name) || '(naamloos)'}</b><span>${p.id ? 'Opslag: centrale database' : 'Nog niet opgeslagen'}</span></div><div class="portalForm" style="padding:0 0 16px"><label>Naam<input class="nameInput" data-key="${p._key}" value="${escapeHtml(p.name)}"></label><label>Type<select class="typeInput" data-key="${p._key}"><option ${p.type==='KCC'?'selected':''}>KCC</option><option ${p.type==='Webcare'?'selected':''}>Webcare</option><option ${p.type==='Coördinator'?'selected':''}>Coördinator</option></select></label><label>Voorkeur grote pauze<select class="prefInput" data-key="${p._key}">${preferenceOptions.replace(`value="${p.pref}"`,`value="${p.pref}" selected`)}</select></label></div><div class="weekGrid">${days}</div></div></td></tr>`;
      }
      return html;
    }).join('') || `<tr><td colspan="4"><span class="agendaMuted">Geen profielen gevonden${searchTerm ? ' voor "'+escapeHtml(searchTerm)+'"' : ''}.</span></td></tr>`;

    body.querySelectorAll('.nameBtn').forEach(btn => btn.onclick = () => { const p=people.find(x=>x._key===btn.dataset.key); if(p)p.open=!p.open; renderPeople(); });
    body.querySelectorAll('.removeBtn').forEach(btn => btn.onclick = async () => {
      const p=people.find(x=>x._key===btn.dataset.key); if(!p || !confirm(`${p.name || 'Dit profiel'} verwijderen?`)) return;
      try { if(p.id) await api(`kcc_work_profiles?id=eq.${p.id}`,{method:'DELETE'}); people=people.filter(x=>x._key!==p._key); renderPeople(); generate(); }
      catch(e){ alert('Verwijderen mislukt: '+e.message); }
    });
    body.querySelectorAll('input,select').forEach(input => input.onchange = async () => {
      const p=people.find(x=>x._key===input.dataset.key); if(!p)return;
      if(input.classList.contains('nameInput'))p.name=input.value;
      if(input.classList.contains('typeInput'))p.type=input.value;
      if(input.classList.contains('prefInput'))p.pref=input.value;
      if(input.classList.contains('activeInput'))p.active=input.checked;
      if(input.dataset.d!==undefined){const d=+input.dataset.d;if(input.classList.contains('dayWork'))p.week[d].work=input.checked;if(input.classList.contains('dayStart'))p.week[d].start=input.value;if(input.classList.contains('dayEnd'))p.week[d].end=input.value;}
      await saveProfile(p); renderPeople(); generate();
    });
    $('statPeople').textContent=people.filter(p=>isEligible(p,$('date').value)).length;
  }

  function renderPlan(result) {
    const groups = {};
    result.plan.forEach(b => (groups[b.t] = groups[b.t] || []).push(b));
    $('schedule').innerHTML = Object.keys(groups).sort((a,b)=>a-b).map(t => `<div class="slot"><time>${toHHMM(+t)}</time><div class="cards">${groups[t].map(b=>`<div class="breakcard ${b.kind==='big'?'bigcard':''} ${b.exception?'warningcard':''}"><b>${escapeHtml(b.p.name)}</b> ${b.kind==='big'?'Grote pauze':b.kind==='mini1'?'Mini 1':'Mini 2'}${b.pref?' ⭐':''}${b.exception?' ⚠️':''}</div>`).join('')}</div></div>`).join('');
  }

  function generate() {
    const result=buildPlan(people,$('date').value);
    $('statPeople').textContent=result.eligibleCount; $('statBreaks').textContent=result.plan.length; $('statWarnings').textContent=result.warnings.length; $('score').textContent=result.score+'%';
    $('alerts').innerHTML=result.warnings.length ? `<div class="alert"><b>⚠️ ${result.warnings.length} aandachtspunt${result.warnings.length>1?'en':''}</b><br>${result.warnings.map(w=>'• '+escapeHtml(w)).join('<br>')}</div>` : '<div class="alert">✓ Geen aandachtspunten.</div>';
    renderPlan(result);
  }

  function exportExcel() {
    const dateStr=$('date').value, result=buildPlan(people,dateStr), rows=[['Collega','Mini 1','Grote pauze','Mini 2']], byPerson={};
    result.plan.forEach(b=>{byPerson[b.p.name]=byPerson[b.p.name]||{};byPerson[b.p.name][b.kind]=toHHMM(b.t);});
    Object.keys(byPerson).sort((a,b)=>a.localeCompare(b)).forEach(name=>{const b=byPerson[name];rows.push([name,b.mini1||'-',b.big||'-',b.mini2||'-']);});
    if(rows.length===1)rows.push(["(geen planbare collega's deze dag)",'','','']);
    if(!window.PauzeXlsx){alert('De Excel-module kon niet geladen worden. Herlaad de pagina en probeer het opnieuw.');return;}
    window.PauzeXlsx.downloadXlsx(rows,`Pauzeplanning-${dateStr}.xlsx`);
  }

  async function loadRequests() {
    const el=$('requests'); if(!el)return;
    try {
      const rows=await api('kcc_break_requests?select=*&status=eq.new&order=work_date')||[];
      if(!rows.length){el.innerHTML='<div class="alert">Geen openstaande meldingen.</div>';return;}
      el.innerHTML=`<div class="tablewrap"><table><thead><tr><th>Datum</th><th>Medewerker</th><th>Gewenste tijd</th><th>Toelichting</th><th>Actie</th></tr></thead><tbody>${rows.map(r=>{const time=r.requested_time?String(r.requested_time).slice(0,5):'';return `<tr><td>${escapeHtml(formatNL(r.work_date))}</td><td>${escapeHtml(people.find(p=>p.id===r.profile_id)?.name||'Onbekend')}</td><td>${time?escapeHtml(time):'—'}</td><td>${r.reason?escapeHtml(r.reason):'—'}</td><td class="reqActions"><button type="button" class="primary acceptReq" data-id="${r.id}" data-profile="${r.profile_id}" data-time="${time}">Accepteren</button><button type="button" class="secondary rejectReq" data-id="${r.id}">Afwijzen</button></td></tr>`;}).join('')}</tbody></table></div>`;
      el.querySelectorAll('.acceptReq').forEach(btn=>btn.onclick=()=>handleRequest(btn.dataset.id,'approved',btn.dataset.profile,btn.dataset.time));
      el.querySelectorAll('.rejectReq').forEach(btn=>btn.onclick=()=>handleRequest(btn.dataset.id,'rejected'));
    } catch(e) { el.innerHTML='<div class="alert">Meldingen konden niet worden geladen: '+escapeHtml(e.message)+'</div>'; }
  }
  async function handleRequest(requestId,newStatus,profileId,requestedTime) {
    try {
      await api(`kcc_break_requests?id=eq.${requestId}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:newStatus})});
      if(newStatus==='approved'&&profileId&&requestedTime){await api(`kcc_work_profiles?id=eq.${profileId}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({big_break_preference:requestedTime,updated_at:new Date().toISOString()})});const p=people.find(x=>x.id===profileId);if(p)p.pref=requestedTime;}
      renderPeople(); generate(); await loadRequests();
    } catch(e){alert('Verwerken van het verzoek is mislukt: '+e.message);}
  }

  async function refresh(){await loadPeople();renderPeople();generate();await loadRequests();updateLockNote();}
  setToday(); $('date').onchange=()=>{updateLockNote();generate();}; $('generate').onclick=generate; $('loadDemo').onclick=()=>refresh().catch(e=>$('alerts').innerHTML='<div class="alert">Laden mislukt: '+escapeHtml(e.message)+'</div>');
  $('addPerson').onclick=()=>{const key='new-'+Date.now()+'-'+Math.random().toString(36).slice(2);people.push({id:null,_key:key,name:'',type:'KCC',active:true,pref:'',week:emptyWeek(),open:true});renderPeople();};
  if($('peopleSearch'))$('peopleSearch').oninput=()=>{searchTerm=$('peopleSearch').value;renderPeople();}; if($('downloadExcel'))$('downloadExcel').onclick=exportExcel;
  updateLockNote();setInterval(updateLockNote,60000);refresh().catch(e=>$('alerts').innerHTML='<div class="alert">Laden mislukt: '+escapeHtml(e.message)+'</div>');
})();