// KCC Pauzeplanner - core scheduling engine.
// V5.2: mini's worden eerst in duo's gevuld; pas als dat niet kan wordt een 3e mini toegestaan.
const DAYS=['Ma','Di','Wo','Do','Vr','Za','Zo'];
const BIG_SLOTS=['12:00','12:35','13:10','13:45','14:20','14:55','15:30','16:00'];
const BIG_DUR=30, MINI_DUR=10, NORMAL_CAP=2, EXCEPTION_CAP=3, MINI_CAP=2, MINI_EXCEPTION_CAP=3, MINI_CUTOFF=960;
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

 // Mini's: eerst proberen we uitsluitend duo's. Een derde mini mag pas in een tweede fase.
 ['mini1','mini2'].forEach(kind=>{
   const candidates=[];
   elig.forEach(p=>{
     const s=scheduleFor(p,date),r=rightsFor(s); if(!r.includes(kind))return;
     const big=plan.find(b=>b.p===p&&b.kind==='big'),m1=plan.find(b=>b.p===p&&b.kind==='mini1');
     let lo,hi,target;
     if(kind==='mini1'){const [a,b]=mini1Window(s);lo=Math.max(a,toMin(s.start));hi=Math.min(b,toMin(s.end)-MINI_DUR,MINI_CUTOFF-MINI_DUR);target=big?big.t-120:(lo+hi)/2}
     else{lo=Math.max(toMin(s.start)+60,big?big.t+30:m1?m1.t+MINI_DUR:toMin(s.start));hi=Math.min(toMin(s.end)-MINI_DUR,MINI_CUTOFF-MINI_DUR);target=big?big.t+120:m1?m1.t+120:toMin(s.start)+240}
     hi=Math.min(hi,MINI_CUTOFF-MINI_DUR);
     if(lo<=hi){const times=[];for(let t=lo;t<=hi;t+=5)times.push(t);candidates.push({p,kind,times,target,flex:times.length})}
     else warnings.push(`${p.name}: ${kind==='mini1'?'Mini 1':'Mini 2'} past niet vóór 16:00 en wordt niet na 16:00 gepland.`);
   });

   const unscheduled=new Set(candidates.map(c=>c.p.id));
   const placed=[];
   const place=(c,t,exception)=>{plan.push({p:c.p,kind,t,pref:false,exception:!!exception});placed.push(c.p.id);unscheduled.delete(c.p.id)};

   // Fase 1: vul bestaande enkele plekken. We kiezen eerst medewerkers met de minste
   // mogelijkheden, zodat één collega niet onnodig een goede duo-plek blokkeert.
   while(unscheduled.size){
     let best=null;
     for(const c of candidates){if(!unscheduled.has(c.p.id))continue;
       const pairTimes=c.times.filter(t=>miniOcc(plan,t)===1);
       if(!pairTimes.length)continue;
       pairTimes.sort((a,b)=>Math.abs(a-c.target)-Math.abs(b-c.target));
       const optionCount=pairTimes.length;
       if(!best||optionCount<best.optionCount||(optionCount===best.optionCount&&Math.abs(pairTimes[0]-c.target)<Math.abs(best.t-best.c.target)))best={c,t:pairTimes[0],optionCount};
     }
     if(best){place(best.c,best.t,false);continue}

     // Fase 2: maak een nieuwe enkelplek. Ook hier nooit direct een 3e.
     let single=null;
     for(const c of candidates){if(!unscheduled.has(c.p.id))continue;
       const zero=c.times.filter(t=>miniOcc(plan,t)===0).sort((a,b)=>Math.abs(a-c.target)-Math.abs(b-c.target));
       if(!zero.length)continue;
       if(!single||c.flex<single.c.flex||(c.flex===single.c.flex&&Math.abs(zero[0]-c.target)<Math.abs(single.t-single.c.target)))single={c,t:zero[0]};
     }
     if(single){place(single.c,single.t,false);continue}
     break;
   }

   // Fase 3: alleen de resterende medewerkers mogen een 3e mini veroorzaken.
   for(const c of candidates){if(!unscheduled.has(c.p.id))continue;
     const three=c.times.filter(t=>miniOcc(plan,t)===2).sort((a,b)=>Math.abs(a-c.target)-Math.abs(b-c.target));
     if(three.length){place(c,three[0],true);warnings.push(`${c.p.name}: 3e mini tegelijk om ${toHHMM(three[0])}; alleen gebruikt omdat geen duo/single-plek meer beschikbaar was.`);}
     else warnings.push(`${c.p.name}: geen mini-capaciteit beschikbaar binnen de toegestane tijden.`);
   }
 });

 // Harde veiligheidsregel: geen mini mag na 16:00 eindigen.
 for(let i=plan.length-1;i>=0;i--) if(plan[i].kind!=='big' && plan[i].t+MINI_DUR>MINI_CUTOFF){warnings.push(`${plan[i].p.name}: late mini verwijderd; mini's moeten uiterlijk 16:00 eindigen.`);plan.splice(i,1)}
 plan.sort((a,b)=>a.t-b.t||a.kind.localeCompare(b.kind));
 const score=Math.max(0,100-warnings.filter(w=>w.includes('3e grote')||w.includes('3e mini')).length*4);
 return {plan,warnings,score,eligibleCount:elig.length};
}
const PauzeEngine={DAYS,BIG_SLOTS,toMin,toHHMM,emptyWeek,weekdayOf,scheduleFor,isEligible,rightsFor,mini1Window,buildPlan};
if(typeof module!=='undefined'&&module.exports)module.exports=PauzeEngine;else window.PauzeEngine=PauzeEngine;
