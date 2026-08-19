const people = [];
const $ = id => document.getElementById(id);
let nextId = 1;

function minOf(t) { const parts = t.split(':').map(Number); return parts[0] * 60 + parts[1]; }
function timeOf(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
const starts = ['08:00','08:30','09:00','09:30'];
const allSlots = [];
for (let m = 600; m <= 1080; m += 5) allSlots.push(timeOf(m));
const bigStarts = ['12:00','12:35','13:10','13:45','14:20','14:55','15:30','16:00'];

function makePerson(name,start,end,type='KCC',pref='') {
  return { id: nextId++, name, start, end, type, pref };
}

function demo() {
  people.length = 0; nextId = 1;
  const rows = [
    ['Collega 01','08:00','18:00','KCC'],['Collega 02','08:00','18:00','KCC'],['Collega 03','08:00','18:00','KCC'],['Collega 04','08:00','18:00','KCC'],
    ['Collega 05','08:00','18:00','Webcare'],['Collega 06','08:30','18:00','KCC'],['Collega 07','08:30','18:00','Coördinator'],['Collega 08','08:30','15:00','KCC'],
    ['Collega 09','08:30','18:00','Webcare'],['Collega 10','09:00','18:00','KCC'],['Collega 11','09:00','18:00','KCC'],['Collega 12','09:00','18:00','Coördinator'],
    ['Collega 13','09:00','18:00','KCC'],['Collega 14','09:00','13:00','KCC'],['Collega 15','09:30','18:00','KCC'],['Collega 16','09:30','18:00','KCC'],
    ['Collega 17','09:30','18:00','Coördinator'],['Collega 18','09:30','18:00','Webcare'],['Collega 19','09:30','15:00','KCC']
  ];
  rows.forEach(r => people.push(makePerson(r[0],r[1],r[2],r[3])));
  renderPeople(); generate();
}

function rights(p) {
  const hours = (minOf(p.end) - minOf(p.start)) / 60;
  if (hours > 6) return ['mini1','big','mini2'];
  if (hours > 4) return ['mini1','mini2'];
  return [];
}

function renderPeople() {
  const body = $('peopleBody'); body.innerHTML = '';
  people.forEach((p,i) => {
    const row = document.createElement('tr');
    row.innerHTML = '<td><input class="name" data-i="'+i+'" type="text" value="'+p.name+'"></td>' +
      '<td><select class="start" data-i="'+i+'">'+starts.map(x=>'<option '+(x===p.start?'selected':'')+'>'+x+'</option>').join('')+'</select></td>' +
      '<td><input class="end" data-i="'+i+'" type="time" value="'+p.end+'"></td>' +
      '<td><select class="type" data-i="'+i+'"><option '+(p.type==='KCC'?'selected':'')+'>KCC</option><option '+(p.type==='Webcare'?'selected':'')+'>Webcare</option><option '+(p.type==='Coördinator'?'selected':'')+'>Coördinator</option></select></td>' +
      '<td><select class="pref" data-i="'+i+'"><option value="">Geen voorkeur</option>'+bigStarts.map(x=>'<option '+(x===p.pref?'selected':'')+'>'+x+'</option>').join('')+'</select></td>' +
      '<td><button class="remove" data-i="'+i+'">Verwijder</button></td>';
    body.appendChild(row);
  });
  body.querySelectorAll('input,select').forEach(el => el.addEventListener('change', e => {
    const i = Number(e.target.dataset.i);
    if (e.target.classList.contains('name')) people[i].name = e.target.value;
    if (e.target.classList.contains('start')) people[i].start = e.target.value;
    if (e.target.classList.contains('end')) people[i].end = e.target.value;
    if (e.target.classList.contains('type')) people[i].type = e.target.value;
    if (e.target.classList.contains('pref')) people[i].pref = e.target.value;
    generate();
  }));
  body.querySelectorAll('.remove').forEach(btn => btn.addEventListener('click', () => {
    people.splice(Number(btn.dataset.i),1); renderPeople(); generate();
  }));
  $('statPeople').textContent = people.filter(p=>p.type==='KCC').length;
}

function overlaps(aStart,aDuration,bStart,bDuration) {
  return minOf(aStart) < minOf(bStart)+bDuration && minOf(bStart) < minOf(aStart)+aDuration;
}
function capacityOK(plan,t,kind) {
  const dur = kind==='big' ? 30 : 10;
  for (let m=minOf(t); m<minOf(t)+dur; m+=5) {
    const big = plan.filter(b=>b.kind==='big' && m>=minOf(b.t) && m<minOf(b.t)+30).length;
    const mini = plan.filter(b=>b.kind!=='big' && m>=minOf(b.t) && m<minOf(b.t)+10).length;
    if (kind==='big' && big>=2) return false;
    if (kind!=='big' && ((big>=2 && mini>=1) || (big<2 && big+mini>=2))) return false;
  }
  return true;
}
function tooClose(plan,p,t) {
  return plan.filter(b=>b.p===p).some(b=>Math.abs(minOf(b.t)-minOf(t))<90);
}
function add(plan,p,kind,t) { if (t) plan.push({p,kind,t}); }

function chooseBigTime(plan,p) {
  const allowed = bigStarts.filter(t=>minOf(t)+30<=minOf(p.end) && minOf(t)>=minOf(p.start)+60);
  const ordered = allowed.slice().sort((a,b)=>{
    const ap=p.pref ? Math.abs(minOf(a)-minOf(p.pref)) : 0;
    const bp=p.pref ? Math.abs(minOf(b)-minOf(p.pref)) : 0;
    if (p.pref && ap!==bp) return ap-bp;
    return minOf(a)-minOf(b);
  });
  const early = p.start<='08:30';
  ordered.sort((a,b)=>{
    const ap=p.pref?Math.abs(minOf(a)-minOf(p.pref)):0;
    const bp=p.pref?Math.abs(minOf(b)-minOf(p.pref)):0;
    if (p.pref && ap!==bp) return ap-bp;
    if (!p.pref && early && minOf(a)!==minOf(b)) return minOf(a)-minOf(b);
    return minOf(a)-minOf(b);
  });
  return ordered.find(t=>capacityOK(plan,t,'big')) || ordered[0];
}

function generate() {
  const active = people.filter(p=>p.type==='KCC');
  const plan = [];
  const bigPeople = active.filter(p=>rights(p).includes('big')).sort((a,b)=>{
    if (a.pref && !b.pref) return -1; if (!a.pref && b.pref) return 1;
    if (a.pref && b.pref) return minOf(a.pref)-minOf(b.pref);
    if (a.start!==b.start) return a.start.localeCompare(b.start);
    return a.name.localeCompare(b.name);
  });
  bigPeople.forEach(p=>add(plan,p,'big',chooseBigTime(plan,p)));

  active.slice().sort((a,b)=>a.start.localeCompare(b.start)).forEach(p=>{
    const r=rights(p); if (!r.includes('mini1')) return;
    const big=plan.find(b=>b.p===p&&b.kind==='big');
    const target=big?minOf(big.t)-120:minOf(p.start)+120;
    const [lo,hi]=p.start<='08:30'?[600,720]:[720,840];
    const opts=allSlots.filter(t=>minOf(t)>=lo&&minOf(t)<=hi&&minOf(t)+10<=minOf(p.end)).sort((a,b)=>Math.abs(minOf(a)-target)-Math.abs(minOf(b)-target));
    add(plan,p,'mini1',opts.find(t=>!tooClose(plan,p,t)&&capacityOK(plan,t,'mini1'))||opts[0]);
  });
  active.slice().sort((a,b)=>a.start.localeCompare(b.start)).forEach(p=>{
    const r=rights(p); if (!r.includes('mini2')) return;
    const big=plan.find(b=>b.p===p&&b.kind==='big'); const first=plan.find(b=>b.p===p&&b.kind==='mini1');
    const target=big?minOf(big.t)+120:(first?minOf(first.t)+120:minOf(p.start)+240);
    const opts=allSlots.filter(t=>minOf(t)>=720&&minOf(t)<=1020&&minOf(t)+10<=minOf(p.end)).sort((a,b)=>Math.abs(minOf(a)-target)-Math.abs(minOf(b)-target));
    add(plan,p,'mini2',opts.find(t=>!tooClose(plan,p,t)&&capacityOK(plan,t,'mini2'))||opts[0]);
  });
  renderSchedule(plan); updateScore(plan,active);
}

function updateScore(plan,active) {
  let hard=0, gapPenalty=0, windowPenalty=0, priorityPenalty=0, prefPenalty=0;
  active.forEach(p=>{
    const mine=plan.filter(b=>b.p===p).sort((a,b)=>minOf(a.t)-minOf(b.t));
    if(mine.length!==rights(p).length) hard++;
    for(let i=1;i<mine.length;i++){const gap=minOf(mine[i].t)-minOf(mine[i-1].t); if(gap<90) hard++; gapPenalty+=Math.min(100,Math.abs(gap-120)/2);}
    const first=mine.find(b=>b.kind==='mini1'); const big=mine.find(b=>b.kind==='big');
    if(first){const ideal=p.start<='08:30'?600:720; windowPenalty+=Math.min(100,Math.abs(minOf(first.t)-ideal)/2);}
    if(big && p.start<='08:30') priorityPenalty+=Math.min(100,Math.max(0,minOf(big.t)-780)/2);
    if(big && p.start>'08:30') priorityPenalty+=Math.min(100,Math.max(0,780-minOf(big.t))/2);
    if(p.pref && big) prefPenalty+=Math.min(100,Math.abs(minOf(big.t)-minOf(p.pref))*1.5);
  });
  for(let m=720;m<990;m+=5){const big=plan.filter(b=>b.kind==='big'&&m>=minOf(b.t)&&m<minOf(b.t)+30).length;const mini=plan.filter(b=>b.kind!=='big'&&m>=minOf(b.t)&&m<minOf(b.t)+10).length;if(big>2||(big===2&&mini>1))hard++;}
  const n=Math.max(1,active.length); const spacing=Math.max(0,100-gapPenalty/n); const windows=Math.max(0,100-windowPenalty/n); const priority=Math.max(0,100-priorityPenalty/n); const pref=Math.max(0,100-prefPenalty/n); const occupancy=hard===0?100:Math.max(0,100-hard*20); const spread=spacing;
  const total=Math.round(occupancy*.35+spacing*.20+windows*.15+priority*.10+pref*.10+spread*.10);
  $('score').textContent=total+'%'; $('statWarnings').textContent=hard; $('statBreaks').textContent=plan.length;
  $('alerts').innerHTML=hard?'<div class="alert">⚠️ '+hard+' harde aandachtspunt(en). De planner toont de best mogelijke verdeling.</div>':'<div class="alert" style="background:#ecfdf3;color:#166534">✓ Geen harde overtredingen.</div>';
}

function renderSchedule(plan) {
  const s=$('schedule'); s.innerHTML=''; const by={}; plan.forEach(b=>{if(!by[b.t])by[b.t]=[];by[b.t].push(b);});
  Object.keys(by).sort((a,b)=>minOf(a)-minOf(b)).forEach(t=>{
    const slot=document.createElement('div'); slot.className='slot'; slot.innerHTML='<time>'+t+'</time><div class="cards"></div>'; const cards=slot.querySelector('.cards');
    by[t].forEach(b=>{const c=document.createElement('div');c.className='breakcard '+(b.kind==='big'?'bigcard':'');c.innerHTML='<b>'+b.p.name+'</b>'+(b.kind==='big'?'Grote pauze':'Mini')+' <input type="time" value="'+b.t+'">';c.querySelector('input').addEventListener('change',e=>{b.t=e.target.value;renderSchedule(plan);updateScore(plan,people.filter(p=>p.type==='KCC'));});cards.appendChild(c);});s.appendChild(slot);
  });
}

$('loadDemo').addEventListener('click',demo);
$('generate').addEventListener('click',generate);
$('addPerson').addEventListener('click',()=>{people.push(makePerson('Nieuwe collega','08:00','16:30'));renderPeople();generate();});
$('date').valueAsDate=new Date();
demo();
