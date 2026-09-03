import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('action-blocks.js','utf8');
const timetable=fs.readFileSync('timetable.html','utf8');
const todo=fs.readFileSync('todo.html','utf8');

const document={
  readyState:'loading',
  addEventListener(){},
  getElementById(){return null},
  querySelectorAll(){return[]},
  querySelector(){return null},
  head:{appendChild(){}},
  createElement(){return{style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){}}}
};
const context={document,console,setTimeout,clearTimeout,setInterval(){return 1},clearInterval(){},Notification:function(){}};
context.SyncEngine={get(){return null},set(){},onReady(){},subscribe(){}};
context.window=context;context.globalThis=context;
vm.runInNewContext(source,context);
const A=context.ActionBlocks;
assert.ok(A,'Action Blocks API should load');

const first=new Date(2026,8,2,12,0,0),next=new Date(2026,8,9,12,0,0);
const study=[{id:'read-law',name:'Read LAW 171 cases',category:'study',trackCompletion:true,days:[{day:first.getDay(),start:'19:00',end:'20:00'}]}];
let weekOne=A.materializeToday(study,[],first);
assert.equal(weekOne.tasks.length,1,'tracked study should create one dated task');
assert.equal(weekOne.tasks[0].occurrenceId,'tt:read-law:2026-09-02');
weekOne.tasks[0].done=true;weekOne.tasks[0].doneAt=first.getTime();
let weekTwo=A.materializeToday(study,weekOne.tasks,next);
assert.equal(weekTwo.tasks.length,2,'next week should create a fresh occurrence');
assert.equal(weekTwo.tasks.filter(t=>t.done).length,1,'last week should remain completed');
assert.equal(weekTwo.tasks.filter(t=>!t.done).length,1,'new week should remain open');
assert.ok(weekTwo.tasks.some(t=>t.occurrenceId==='tt:read-law:2026-09-09'),'new task should use the new date');
let deduped=A.materializeToday(study,weekTwo.tasks,next);
assert.equal(deduped.tasks.length,2,'reopening on the same day must not duplicate the occurrence');

const classes=[{id:'law-class',name:'LAW 171',category:'class',trackCompletion:true,days:[{day:first.getDay(),start:'09:00',end:'10:30'}]}];
assert.equal(A.materializeToday(classes,[],first).tasks.length,0,'classes must remain schedule-only');
const untracked=[{id:'optional-read',name:'Optional reading',category:'study',trackCompletion:false,days:[{day:first.getDay(),start:'18:00',end:'19:00'}]}];
assert.equal(A.materializeToday(untracked,[],first).tasks.length,0,'an explicitly untracked block must remain schedule-only');
assert.equal(A.normalizeBlock({name:'Gym',category:'training'}).trackCompletion,true,'training should default to a weekly to-do');

assert.ok(source.includes('ACTION BLOCKS EDITOR v2'),'editor marker should exist');
assert.ok(source.includes('Weekly to-do'),'clear weekly wording should exist');
assert.ok(source.includes('Fresh task every scheduled day.'),'recurrence helper should exist');
assert.ok(source.includes("document.querySelectorAll('.pill[data-id]')"),'completion selector should match timetable pills');
assert.ok(!source.includes('.week-pill'),'stale timetable selector should be gone');
assert.ok(timetable.includes("namespaces:['timetable','todo']"),'timetable should load completion state');
assert.ok(timetable.includes('action-blocks.js?v=20260902-editor-v2'),'timetable should cache-bust Action Blocks');
assert.ok(todo.includes('action-blocks.js?v=20260902-editor-v2'),'to-do should cache-bust Action Blocks');
console.log('Action Blocks editor and weekly recurrence tests passed');
