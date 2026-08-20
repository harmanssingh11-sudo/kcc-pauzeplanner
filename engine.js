// KCC Pauzeplanner - core scheduling engine.
// V5 FIX: mini pauses may never start after 15:50; every mini must finish by 16:00.
const DAYS=['Ma','Di','Wo','Do','Vr','Za','Zo'];
const BIG_SLOTS=['12:00','12:35','13:10','13:45','14:20','14:55','15:30','16:00'];
const BIG_DUR=30, MINI_DUR=10, NORMAL_CAP=2, EXCEPTION_CAP=3, MINI_CAP=2, MINI_CUTOFF=960;
const toMin=t=>{const [h,m]=String(t).slice(0,5).split(':').map(Number);return h*60+m};
const toHHMM=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(Math.round(m)%60).padStart(2,'0')}`;
const FIXED_SLOTS=BIG_SLOTS.map(toMin);
function emptyWeek(){return DAYS.map((_,i)=>({work:i<5,start:'08:00',end:'18:00'}))}
function weekdayOf(date){const d=new Date(date+'T12:00:00');return d.getDay()||7}
function scheduleFor(p,date){return p.week[weekdayOf(date)-1]}
function isEligible(p,date){if(!p.active||p.type!=='KCC')return false;const s=scheduleFor(p,date);return !!s?.work&&toMin(s.end)-toMin(s.start)>240}
function rightsFor(s){const h=(toMin(s.end)-toMin(s.start))/60;return h>6?['mini1','big','mini2']:h>4?['mini1','mini2']:[]}
function mini1Window(s){return toMin(s.start)<=510?[600,720]:[720,840]}
function overlaps(a,ad,b,bd){return a<b+bd&&b<a+ad}
function bigOcc(plan,t){return plan.filter(b=>b.kind==='big'&&b.t===t).length}
function miniOcc(plan,t){return plan.filter(b=>b.kind!=='big'&&overlaps(t,MINI_DUR,b.t,MINI_DUR)).length}
function totalLoad(plan,t,dur=MINI_DUR){return plan.filter(b=>overlaps(t,dur,b.t,b.kind==='big'?BIG_DUR:MINI_DUR)).length}
function buildPlan(people,date){
 const elig=people.filter(p=>isEligible(p,date)).sort((a,b)=>toMin(scheduleFor(a,date).start)-toMin(scheduleFor(b,date).start)||a.name.localeCompare(b.name));
 const plan=[],warnings=[];
 const wants=elig.filter(p=>rightsFor(scheduleFor(p,date)).includes('big'));
 const pref=wants.filter(p=>p.pref),normal=wants.filter(p=>!p.pref);
 const addBig=(p,isPref)=>{const s=scheduleFor(p,date),allowed=FIXED_SLOTS.filter(t=>t>=Math.max(720,toMin(s.start))&&t+BIG_DUR<=toMin(s.end));if(!allowed.length){warnings.push(`${p.name}: geen grote pauze binnen dienstvenster.`);return}
  const wanted=isPref?toMin(p.pref):toMin(s.start)+240;
  const ordered=[...allowed].sort((a,b)=>Math.abs(a-wanted)-Math.abs(b-wanted));
  let t=isPref?ordered[0]:ordered.find(x=>bigOcc(plan,x)<NORMAL_CAP),exception=false;
  if(t===undefined)t=ordered.find(x=>bigOcc(plan,x)<EXCEPTION_CAP),exception=true;
  if(t===undefined){t=ordered[0];exception=true;warnings.push(`${p.name}: geen normale capaciteit beschikbaar; handmatig controleren.`)}
  if(exception&&!isPref)warnings.push(`${p.name}: 3e grote pauze tegelijk om ${toHHMM(t)}.`);
  if(isPref&&t!==wanted)warnings.push(`${p.name}: voorkeur kon niet exact binnen dienst worden geplaatst.`);
  plan.push({p,kind:'big',t,pref:isPref,exception});
 };
 pref.forEach(p=>addBig(p,true));normal.forEach(p=>addBig(p,false));
 ['mini1','mini2'].forEach(kind=>elig.forEach(p=>{const s=scheduleFor(p,date),r=rightsFor(s);if(!r.includes(kind))return;const big=plan.find(b=>b.p===p&&b.kind==='big'),m1=plan.find(b=>b.p===p&&b.kind==='mini1');let lo,hi,target;
  if(kind==='mini1'){const [a,b]=mini1Window(s);lo=Math.max(a,toMin(s.start));hi=Math.min(b,toMin(s.end)-MINI_DUR,MINI_CUTOFF-MINI_DUR);target=big?big.t-120:(lo+hi)/2}
  else{lo=Math.max(toMin(s.start)+60,big?big.t+30:m1?m1.t+MINI_DUR:toMin(s.start));hi=Math.min(toMin(s.end)-MINI_DUR,MINI_CUTOFF-MINI_DUR);target=big?big.t+120:m1?m1.t+120:toMin(s.start)+240}
  hi=Math.min(hi,MINI_CUTOFF-MINI_DUR);
  if(lo>hi){warnings.push(`${p.name}: ${kind==='mini1'?'Mini 1':'Mini 2'} past niet vóór 16:00 en wordt niet na 16:00 gepland.`);return}
  const c=[];for(let t=lo;t<=hi;t+=5)c.push(t);
  // Pack mini's into existing 10-minute capacity first. Never allow more than 2 overlapping mini's.
  c.sort((a,b)=>miniOcc(plan,b)-miniOcc(plan,a)||Math.abs(a-target)-Math.abs(b-target));
  const t=c.find(x=>miniOcc(plan,x)<MINI_CAP);
  if(t===undefined){warnings.push(`${p.name}: geen mini-capaciteit (maximaal 2 tegelijk) beschikbaar binnen het toegestane venster.`);return}
  if(t+MINI_DUR>MINI_CUTOFF){warnings.push(`${p.name}: mini zou na 16:00 eindigen en is daarom niet ingepland.`);return}
  plan.push({p,kind,t,pref:false,exception:false})
 }));
 // Final safety filter: no late mini can reach the UI.
 for(let i=plan.length-1;i>=0;i--) if(plan[i].kind!=='big' && plan[i].t+MINI_DUR>MINI_CUTOFF){warnings.push(`${plan[i].p.name}: late mini verwijderd; mini's moeten uiterlijk 16:00 eindigen.`);plan.splice(i,1)}
 plan.sort((a,b)=>a.t-b.t||a.kind.localeCompare(b.kind));
 const score=Math.max(0,100-warnings.filter(w=>w.includes('3e grote')||w.includes('normale capaciteit')).length*4);
 return {plan,warnings,score,eligibleCount:elig.length};
}
const PauzeEngine={DAYS,BIG_SLOTS,toMin,toHHMM,emptyWeek,weekdayOf,scheduleFor,isEligible,rightsFor,mini1Window,buildPlan};
if(typeof module!=='undefined'&&module.exports)module.exports=PauzeEngine;else window.PauzeEngine=PauzeEngine;
