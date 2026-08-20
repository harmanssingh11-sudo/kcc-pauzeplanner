const assert = require('assert');
const E = require('./engine');
function p(name,start='08:00',end='18:00',type='KCC',active=true,pref=''){return {name,type,active,pref,week:E.emptyWeek().map((w,i)=>i===2?{work:true,start,end}:{...w})}}
const date='2026-08-19';
assert.deepStrictEqual(E.rightsFor({start:'08:00',end:'18:00'}),['mini1','big','mini2']);
assert.deepStrictEqual(E.rightsFor({start:'09:00',end:'15:00'}),['mini1','mini2']);
assert.deepStrictEqual(E.rightsFor({start:'09:00',end:'13:00'}),[]);
assert.deepStrictEqual(E.mini1Window({start:'08:00',end:'18:00'}),[600,720]);
assert.deepStrictEqual(E.mini1Window({start:'09:00',end:'18:00'}),[720,840]);
let a=p('A');let r=E.buildPlan([a],date);assert.strictEqual(r.plan.length,3);
assert.ok(r.plan.some(x=>x.kind==='mini1'&&x.t>=600&&x.t<=710));
assert.ok(r.plan.some(x=>x.kind==='big'&&x.t>=720&&x.t<=960));
assert.ok(r.plan.some(x=>x.kind==='mini2'));
let pref=p('Pref');pref.pref='12:00';let many=[pref,...Array.from({length:4},(_,i)=>p('N'+i))];r=E.buildPlan(many,date);let pb=r.plan.find(x=>x.p.name==='Pref'&&x.kind==='big');assert.strictEqual(pb.t,720);assert.strictEqual(pb.exception,false);
let filtered=E.buildPlan([p('Web','08:00','18:00','Webcare'),p('Coord','08:00','18:00','Coördinator'),p('Off','08:00','18:00','KCC',false)],date);assert.strictEqual(filtered.eligibleCount,0);
console.log('engine tests passed');