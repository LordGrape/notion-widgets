import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const action=fs.readFileSync('action-blocks.js','utf8');
const timetable=fs.readFileSync('timetable.html','utf8');
const todo=fs.readFileSync('todo.html','utf8');
const document={readyState:'loading',addEventListener(){},getElementById(){return null},querySelectorAll(){return[]},querySelector(){return null},head:{appendChild(){}},createElement(){return{}}};
const context={document,console,setTimeout,clearTimeout,setInterval(){return 1},clearInterval(){},Notification:function(){}};
context.SyncEngine={get(){return null},set(){},onReady(){},subscribe(){}};context.window=context;context.globalThis=context;
vm.runInNewContext(action,context);
const A=context.ActionBlocks;
assert.ok(A&&A.materializeRange&&A.occurrenceEntries,'planning API should load');

const wed=new Date(2026,8,2,12),thu=new Date(2026,8,3,12),oct=new Date(2026,9,7,12);
const base={id:'study',name:'Case briefing',category:'study',trackCompletion:true,startDate:'2026-09-01',endDate:'2026-09-30',outcomeGoal:'Brief cases 4–6',days:[{day:3,start:'19:00',end:'20:00',location:'Library'}]};
assert.equal(A.materializeToday([base],[],wed).tasks.length,1,'active term should materialize');
assert.equal(A.materializeToday([base],[],oct).tasks.length,0,'ended term should not materialize');
const skipped={...base,overrides:[{sourceDate:'2026-09-02',date:'2026-09-02',skipped:true}]};
assert.equal(A.materializeToday([skipped],[],wed).tasks.length,0,'skipped occurrence should not materialize');
const moved={...base,overrides:[{sourceDate:'2026-09-02',date:'2026-09-03',start:'18:00',end:'19:15',location:'Home',skipped:false}]};
assert.equal(A.materializeToday([moved],[],wed).tasks.length,0,'moved source date should be empty');
const movedTask=A.materializeToday([moved],[],thu).tasks[0];
assert.ok(movedTask,'moved target date should materialize');
assert.equal(movedTask.occurrenceId,'tt:study:2026-09-03');
assert.equal(movedTask.plannedMinutes,75);
assert.equal(movedTask.outcomeGoal,'Brief cases 4–6');

const thursday={id:'training',name:'Zone 2 run',category:'training',trackCompletion:true,days:[{day:4,start:'07:00',end:'07:45'}]};
const range=A.materializeRange([base,thursday],[],wed,2);
assert.equal(range.tasks.length,2,'today and tomorrow should be prepared');
assert.ok(range.tasks.some(t=>t.due==='tomorrow'&&t.text==='Zone 2 run'),'tomorrow task should be previewable without a notification');

assert.ok(timetable.includes('SEAMLESS TIMETABLE PLANNING v1'));
assert.ok(timetable.includes('Transition buffer'));
assert.ok(timetable.includes('Change only this occurrence'));
assert.ok(timetable.includes('Restore previous'));
assert.ok(timetable.includes('data-occ-skip'));
assert.ok(todo.includes('SEAMLESS TODO PLANNING v1'));
assert.ok(todo.includes('scheduled')&&todo.includes('flexible')&&todo.includes('unestimated'));
assert.ok(todo.includes('Tomorrow ·'));
assert.ok(todo.includes('How did the block go?'));
assert.ok(todo.includes('This week only'));
assert.ok(todo.includes('Weekly repetition is always explicit.'));
assert.ok(action.includes('planning=20260903-v1')===false,'versioning belongs in HTML only');
assert.ok(timetable.includes('action-blocks.js?v=20260902-editor-v2&planning=20260903-v1'));
assert.ok(todo.includes('action-blocks.js?v=20260902-editor-v2&planning=20260903-v1'));
console.log('Seamless planning system tests passed');
