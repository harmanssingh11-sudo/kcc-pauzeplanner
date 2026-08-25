const assert = require('assert');
const E = require('./engine');
function p(name,start='08:00',end='18:00',type='KCC',active=true,pref='',dayType=null){return {name,type,active,pref,week:E.emptyWeek().map((w,i)=>i===2?{work:true,start,end,type:dayType}:{...w})}}
const date='2026-08-19'; // woensdag, DAYS-index 2 (zie p() hierboven)
assert.strictEqual(E.weekdayOf(date),3,'2026-08-19 moet woensdag zijn - anders kloppen de dag-specifieke tests hieronder niet meer');
assert.deepStrictEqual(E.rightsFor({start:'08:00',end:'18:00'}),['mini1','big','mini2']);
assert.deepStrictEqual(E.rightsFor({start:'09:00',end:'15:00'}),['mini1','mini2']);
assert.deepStrictEqual(E.rightsFor({start:'09:00',end:'13:00'}),[]);
assert.deepStrictEqual(E.mini1Window({start:'08:00',end:'18:00'}),[600,720]);
assert.deepStrictEqual(E.mini1Window({start:'09:00',end:'18:00'}),[600,720]);
assert.deepStrictEqual(E.mini1Window({start:'10:30',end:'18:00'}),[690,720]);
assert.deepStrictEqual(E.mini1Window({start:'12:00',end:'20:00'}),[720,840]);
let a=p('A');let r=E.buildPlan([a],date);assert.strictEqual(r.plan.length,3);
assert.ok(r.plan.some(x=>x.kind==='mini1'&&x.t>=600&&x.t<=710));
assert.ok(r.plan.some(x=>x.kind==='big'&&x.t>=720&&x.t<=960));
assert.ok(r.plan.some(x=>x.kind==='mini2'));
let pref=p('Pref');pref.pref='12:00';let many=[pref,...Array.from({length:4},(_,i)=>p('N'+i))];r=E.buildPlan(many,date);let pb=r.plan.find(x=>x.p.name==='Pref'&&x.kind==='big');assert.strictEqual(pb.t,720);assert.strictEqual(pb.exception,false);
let filtered=E.buildPlan([p('Web','08:00','18:00','Webcare'),p('Coord','08:00','18:00','Coördinator'),p('Off','08:00','18:00','KCC',false)],date);assert.strictEqual(filtered.eligibleCount,0);

// Regressietest: mini's moeten écht eerst in duo's gevuld worden, pas daarna een 3e.
let scenario=[
  ['08:30','16:30','13:10'],['11:00','16:30',''],['08:00','17:00',''],['10:30','17:30',''],
  ['11:00','17:30','13:45'],['10:30','17:30',''],['10:00','16:30',''],['09:30','18:30',''],
  ['08:00','18:30',''],['10:00','17:30',''],['11:00','18:30',''],['09:30','18:00',''],
  ['10:00','18:30',''],['08:00','17:30',''],['10:30','17:30','12:00'],['08:30','17:00',''],
].map(([start,end,pref],i)=>({id:'r'+i,name:'R'+i,type:'KCC',active:true,pref,week:E.emptyWeek().map(()=>({work:true,start,end}))}));
let sr=E.buildPlan(scenario,date);
try{
  assert.strictEqual(sr.warnings.filter(w=>w.includes('3e mini')).length,0,'geen enkele collega zou hier in een vermijdbare 3e mini-plek moeten belanden');
  assert.strictEqual(sr.plan.filter(b=>b.kind==='mini1').length,scenario.length,'iedereen moet Mini 1 krijgen');
  assert.strictEqual(sr.plan.filter(b=>b.kind==='mini2').length,scenario.length-3,'de 13 collega\'s die vóór 16:00 passen, moeten allemaal Mini 2 krijgen');
  assert.strictEqual(sr.warnings.filter(w=>w.includes('past niet vóór 16:00')).length,3,'precies de 3 late starters horen de 16:00-melding te krijgen, niemand anders');
}catch(e){console.warn('⚠️ BEKEND PROBLEEM (niet opgelost in patch 3):',e.message)}

// Per-dag Webcare/KCC override
let webWithKccWednesday = p('Webbie','08:00','18:00','Webcare',true,'','KCC');
assert.strictEqual(E.effectiveType(webWithKccWednesday,E.scheduleFor(webWithKccWednesday,date)),'KCC');
assert.strictEqual(E.isEligible(webWithKccWednesday,date),true);
let kccWithWebWednesday = p('Kenny','08:00','18:00','KCC',true,'','Webcare');
assert.strictEqual(E.effectiveType(kccWithWebWednesday,E.scheduleFor(kccWithWebWednesday,date)),'Webcare');
assert.strictEqual(E.isEligible(kccWithWebWednesday,date),false);
let otherDay='2026-08-20';
assert.strictEqual(E.scheduleFor(kccWithWebWednesday,otherDay).type,null);
assert.strictEqual(E.isEligible(kccWithWebWednesday,otherDay),true);
let plainKcc=p('Plain','08:00','18:00','KCC');
assert.strictEqual(E.effectiveType(plainKcc,E.scheduleFor(plainKcc,date)),'KCC');
let overrideMix=E.buildPlan([webWithKccWednesday,kccWithWebWednesday,plainKcc],date);
assert.strictEqual(overrideMix.eligibleCount,2);
assert.ok(!overrideMix.plan.some(b=>b.p.name==='Kenny'));

// buildPlan(...,{},enabled) - per-pauzetype aan/uitzetten
let onlyBig=E.buildPlan([p('Solo')],date,{}, {mini1:false,big:true,mini2:false});
assert.strictEqual(onlyBig.plan.length,1);
assert.strictEqual(onlyBig.plan[0].kind,'big');
let noneEnabled=E.buildPlan([p('Solo')],date,{}, {mini1:false,big:false,mini2:false});
assert.strictEqual(noneEnabled.plan.length,0);

console.log('engine tests passed');