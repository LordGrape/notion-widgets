import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const action=fs.readFileSync('action-blocks.js','utf8');
const timetable=fs.readFileSync('timetable.html','utf8');
const todo=fs.readFileSync('todo.html','utf8');

assert.ok(action.includes('Task creation'),'task toggle should have a plain-language heading');
assert.ok(action.includes('Add to to-do'),'task toggle should describe the action');
assert.ok(action.includes('Fresh task on every selected day.'),'enabled behaviour should be explicit');
assert.ok(action.includes('No tasks are created.'),'disabled behaviour should be explicit');
assert.ok(action.includes('Default target'),'planning field should distinguish the recurring fallback');
assert.ok(action.includes('Leave blank if it changes. Set each session under This week’s targets.'),'adaptive target terminology should be explained in place');
assert.ok(!action.includes("trackTitle.textContent=locked?'Schedule only':'Weekly to-do'"),'old toggle title should not remain visible');
assert.ok(todo.includes('Target for this task (optional)'),'to-do editor should use adaptive target terminology');
assert.ok(todo.includes('<span class="pl-k">Target</span>'),'task card should label the current target clearly');

const match=timetable.match(/function orderedDays\(\)\{[^\n]+\}\nfunction dayRank\(day\)\{[^\n]+\}/);
assert.ok(match,'shared editor day ordering should exist');
const context={prefs:{mondayFirst:true}};
vm.runInNewContext(match[0],context);
assert.deepEqual(Array.from(context.orderedDays()),[1,2,3,4,5,6,0],'Monday-first should order editor chips Monday through Sunday');
context.prefs.mondayFirst=false;
assert.deepEqual(Array.from(context.orderedDays()),[0,1,2,3,4,5,6],'Sunday-first should remain available');
assert.ok(timetable.includes('chips.innerHTML=orderedDays().map'),'repeat chips should follow the preference');
assert.ok(timetable.includes('return dayRank(a)-dayRank(b)'),'time rows should follow the preference');
assert.ok(timetable.includes('return dayRank(x.day)-dayRank(y.day)'),'saved block summaries should follow the preference');
assert.ok(timetable.includes('drawSaved();drawForm()'),'the open editor should reflow immediately');
assert.ok(timetable.includes('copy=20260903-v2'));
assert.ok(todo.includes('copy=20260903-v2'));
console.log('Clear schedule language and Monday ordering tests passed');
