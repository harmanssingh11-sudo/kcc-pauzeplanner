// KCC Pauzeplanner V5 planning engine
'use strict';
const DAYS=['Ma','Di','Wo','Do','Vr','Za','Zo'];
const BIG_SLOTS=['12:00','12:35','13:10','13:45','14:20','14:55','15:30','16:00'];
const BIG_DUR=30,NORMAL_CAP=2,EXCEPTION_CAP=3;
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
function totalLoad(plan,t){return plan.filter(b=>overlaps(t,10,b.t,b.kind==='big'?30:10)).length}
function buildPlan(people,date){
 const elig=people.filter(p=>isEligible(p,date)).sort((a,b)=>toMin(scheduleFor(a,date).start)-toMin(scheduleFor(b,date).start)||a.name.localeCompare(b.name));
 const plan=[],warnings=[]; const wants=elig.filter(p=>rightsFor(scheduleFor(p,date)).includes('big')); const pref=wants.filter(p=>p.pref),normal=wants.filter(p=>!p.pref);
 const addBig=(p,isPref)=>{const s=scheduleFor(p,date),allowed=FIXED_SLOTS.filter(t=>t>=Math.max(720,toMin(s.start))&&t+30<=toMin(s.end));if(!allowed.length){warnings.push(`${p.name}: geen grote pauze binnen dienstvenster.`);return}const wanted=isPref?toMin(p.pref):toMin(s.start)+240;const ordered=[...allowed].sort((a,b)=>Math.abs(a-wanted)-Math.abs(b-wanted));let t=isPref?ordered[0]:ordered.find(x=>bigOcc(plan,x)<2),exception=false;if(t===undefined)t=ordered.find(x=>bigOcc(plan,x)<3),exception=t!==undefined;if(t===undefined){t=ordered[0];exception=true;warnings.push(`${p.name}: geen normale capaciteit beschikbaar; handmatig controleren.`)}if(exception&&!isPref)warnings.push(`${p.name}: 3e grote pauze tegelijk om ${toHHMM(t)}.`);if(isPref&&t!==wanted)warnings.push(`${p.name}: voorkeur kon niet exact binnen dienst worden geplaatst.`);plan.push({p,kind:'big',t,pref:isPref,exception})};
 pref.forEach(p=>addBig(p,true));normal.forEach(p=>addBig(p,false));
 ['mini1','mini2'].forEach(kind=>elig.forEach(p=>{const s=scheduleFor(p,date),r=rightsFor(s);if(!r.includes(kind))return;const big=plan.find(b=>b.p===p&&b.kind==='big'),m1=plan.find(b=>b.p===p&&b.kind==='mini1');let lo,hi,target;if(kind==='mini1'){const [a,b]=mini1Window(s);lo=Math.max(a,toMin(s.start));hi=Math.min(b,toMin(s.end)-10);target=big?big.t-120:(lo+hi)/2}else{lo=Math.max(toMin(s.start)+60,big?big.t+30:m1?m1.t+10:toMin(s.start));hi=toMin(s.end)-10;target=big?big.t+120:m1?m1.t+120:toMin(s.start)+240}if(lo>hi){warnings.push(`${p.name}: ${kind==='mini1'?'Mini 1':'Mini 2'} past niet binnen dienst.`);return}const c=[];for(let t=lo;t<=hi;t+=5)c.push(t);c.sort((a,b)=>totalLoad(plan,a)-totalLoad(plan,b)||Math.abs(a-target)-Math.abs(b-target));const t=c[0];plan.push({p,kind,t,pref:false,exception:false})}));
 plan.sort((a,b)=>a.t-b.t||a.kind.localeCompare(b.kind));const score=Math.max(0,100-warnings.filter(w=>w.includes('3e grote')||w.includes('normale capaciteit')).length*4);return{plan,warnings,score,eligibleCount:elig.length}}
const PauzeEngine={DAYS,BIG_SLOTS,toMin,toHHMM,emptyWeek,weekdayOf,scheduleFor,isEligible,rightsFor,mini1Window,buildPlan};if(typeof module!=='undefined'&&module.exports)module.exports=PauzeEngine;else window.PauzeEngine=PauzeEngine;