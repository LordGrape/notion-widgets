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
assert.ok(A&&A.materializeToday,'Action Blocks should expose materialization');

const routine={
  id:'study-torts',name:'Study Torts',category:'study',trackCompletion:true,outcomeGoal:'',
  days:[{day:3,start:'19:00',end:'20:00',location:'Library'}],
  overrides:[
    {sourceDate:'2026-09-02',date:'2026-09-02',outcomeGoal:'Brief cases 4–6',skipped:false},
    {sourceDate:'2026-09-09',date:'2026-09-09',outcomeGoal:'Draft negligence outline',skipped:false}
  ]
};
const first=A.materializeToday([routine],[],new Date(2026,8,2,12)).tasks[0];
const second=A.materializeToday([routine],[],new Date(2026,8,9,12)).tasks[0];
const third=A.materializeToday([routine],[],new Date(2026,8,16,12)).tasks[0];
assert.equal(first.text,'Study Torts');
assert.equal(second.text,'Study Torts','the recurring activity title should persist');
assert.equal(first.outcomeGoal,'Brief cases 4–6');
assert.equal(second.outcomeGoal,'Draft negligence outline','each dated occurrence should carry its own target');
assert.equal(third.outcomeGoal,'','a future week should not inherit a dated target');
assert.notEqual(first.occurrenceId,second.occurrenceId,'weekly tasks should remain independent occurrences');

const defaulted={...routine,outcomeGoal:'Review the lecture',overrides:[{sourceDate:'2026-09-02',date:'2026-09-02',outcomeGoal:'',skipped:false}]};
assert.equal(A.materializeToday([defaulted],[],new Date(2026,8,2,12)).tasks[0].outcomeGoal,'','an explicitly blank session target should suppress the default');
const normalized=A.normalizeBlock({...routine,overrides:[{sourceDate:'2026-09-02',date:'2026-09-02',outcomeGoal:'  Brief cases 4–6  '}]});
assert.equal(normalized.overrides[0].outcomeGoal,'Brief cases 4–6','target overrides should normalize safely');

assert.ok(action.includes('ADAPTIVE WEEKLY TARGETS v1'));
assert.ok(action.includes('outcomeGoal:entry.outcomeGoal'));
assert.ok(action.includes('Array.isArray(block.overrides)'),'incoming dated overrides should survive the SyncEngine bridge');
assert.ok(timetable.includes("This week's targets"));
assert.ok(timetable.includes('The activity repeats. Only the target for each dated session changes.'));
assert.ok(timetable.includes('Session target'));
assert.ok(timetable.includes('drawWeeklyTargets'));
assert.ok(todo.includes('Target for this task (optional)'));
assert.ok(todo.includes('syncTargetToSchedule'));
assert.ok(todo.includes('repeat==="weekly"?"":(t.outcomeGoal||"")'),'weekly timeboxes should not make the first target permanent');
assert.ok(!action.includes('>Finish line</label>'));
assert.ok(!todo.includes('Finish line (optional)'));
assert.ok(timetable.includes('targets=20260903-v1'));
assert.ok(todo.includes('targets=20260903-v1'));
console.log('Adaptive weekly target tests passed');
