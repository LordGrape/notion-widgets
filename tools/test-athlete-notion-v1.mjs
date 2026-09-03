import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('athlete-notion.js','utf8');
const synced=[];
const removed=[];
let writes=0;
const context={
 console,
 Promise,
 Date,
 setTimeout,
 clearTimeout,
 state:{v:1,bw:77.1,entries:[
  {id:'e-one',t:'run2400',d:'2026-06-26',v:551,load:null,dist:null,raw:'9:11',ts:1},
  {id:'e-two',t:'pushups',d:'2026-06-22',v:26,load:null,dist:null,raw:'26 reps',ts:2}
 ],ruck:{}},
 save(){writes+=1},
 loadState(){},
 testById(id){return {id}},
 levelOf(_test,value){return value>=50?2:0},
 scoreOf(_test,value){return Math.max(10,Math.min(99,Math.round(value)))},
 renderAll(){},
 setSync(){},
 document:{hidden:false,addEventListener(){}},
 SyncEngine:{
  onReady(cb){this.readyCallback=cb},
  isOnline(){return false},
  syncFitnessTests(items){synced.push(...items);return Promise.resolve({configured:true,items})},
  removeFitnessTests(ids){removed.push(...ids);return Promise.resolve({configured:true,removed:ids})},
  fetchFitnessTests(){return Promise.resolve({configured:true,items:[]})}
 }
};
context.window=context;
vm.createContext(context);
new vm.Script(source,{filename:'athlete-notion.js'}).runInContext(context);
const bridge=context.AthleteNotionBridge;
assert.equal(bridge.ready,true);
assert.deepEqual(JSON.parse(JSON.stringify(bridge.payload(context.state.entries[0]))),{
 id:'e-one',t:'run2400',d:'2026-06-26',v:551,load:null,dist:null,raw:'9:11',ts:1,score:99,level:'L2'
});

const merged=bridge.mergeEntries(
 context.state.entries,
 [
  {id:'e-one',t:'run2400',d:'2026-06-26',v:550,load:null,dist:null,raw:'9:10',ts:10},
  {id:'notion:manual',t:'pushups',d:'2026-06-22',v:26,load:null,dist:null,raw:'26 reps',ts:11},
  {id:'notion:new',t:'vjump',d:'2026-08-01',v:55,load:null,dist:null,raw:'55 cm',ts:12}
 ],
 []
);
assert.equal(merged.entries.length,3,'matching manual rows should not duplicate local assessments');
assert.equal(merged.entries.find(entry=>entry.id==='e-one').v,550,'Notion edits should refresh the matching widget assessment');
assert.ok(merged.entries.some(entry=>entry.id==='notion:new'),'new compatible Notion rows should be imported');
assert.deepEqual(JSON.parse(JSON.stringify(merged.backfill.map(entry=>entry.id).sort())),['e-two'],'manual duplicates should be adopted using the stable local ID');

context.state.entries.push({id:'e-three',t:'vjump',d:'2026-09-03',v:60,load:null,dist:null,raw:'60 cm',ts:3});
context.save();
await new Promise(resolve=>setTimeout(resolve,0));
assert.ok(synced.some(item=>item.id==='e-three'),'new assessments should be mirrored');
context.state.entries=context.state.entries.filter(entry=>entry.id!=='e-three');
context.save();
await new Promise(resolve=>setTimeout(resolve,0));
assert.ok(removed.includes('e-three'),'deleted assessments should be archived in Notion');
assert.ok(writes>=2,'bridge metadata should persist through the established SyncEngine save path');
console.log('Athlete Notion bridge regression passed.');
