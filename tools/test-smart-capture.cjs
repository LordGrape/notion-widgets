/* Synthetic data: exercise Command Centre's capture API through the existing writer. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const stored = { 'todo/tasks': JSON.stringify([{ id: 'prior', text: 'Prepare sample', notes: 'Keep me', done: false }]), 'timetable/courses': [] };
const listeners = {};
const input = { id: 'inp', value: '', dispatchEvent(event) { event.target = this; context.dispatchEvent(event); } };
const preview = { textContent: '', hidden: true };
const button = { closest(selector) { return selector === '#addbtn' ? this : null; }, click() { const e = new context.Event('click'); e.target = this; context.dispatchEvent(e); } };
const context = {
 Intl, Date, console,
 Event: class { constructor(type) { this.type = type; } preventDefault() { this.defaultPrevented = true; } stopImmediatePropagation() { this.stopped = true; } },
 SyncEngine: { get(ns, key) { return stored[ns + '/' + key]; }, set(ns, key, value) { stored[ns + '/' + key] = value; }, onReady(fn) { fn(); } },
 addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
 dispatchEvent(e) { for (const fn of listeners[e.type] || []) { fn(e); if (e.stopped) break; } },
 TodoChrono: {}, // deterministic offline path
};
vm.createContext(context);
for (const file of ['reading-estimates.js', 'todo-schedule-import.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
context.document = { readyState: 'complete', getElementById(id) { return { inp: input, addbtn: button, smartPreview: preview }[id]; } };
vm.runInContext(fs.readFileSync('todo-natural-add.js', 'utf8'), context);
const tasks = () => JSON.parse(stored['todo/tasks']);
context.TodoNaturalAdd.capture('should Read sample pp. 3-9 & 12 tomorrow');
let task = tasks().find(t => t.text === 'Read sample pp. 3-9 & 12');
assert.equal(task.pri, 'should');
assert.equal(task.plannedMinutes, 48);
assert.equal(task.scheduledStart, undefined);
assert.equal(input.value, '');
assert.equal(tasks()[0].notes, 'Keep me');
context.TodoNaturalAdd.capture('could Review sample for 20 min after Prepare sample');
task = tasks().find(t => t.text === 'Review sample');
assert.equal(task.pri, 'could');
assert.equal(task.plannedMinutes, 20);
assert.equal(task.dependsOn, 'prior');
context.TodoNaturalAdd.capture('must Read sample pp. 66-80 2026-11-02 at 6pm for 45 min');
task = tasks().find(t => t.text === 'Read sample pp. 66-80');
assert.equal(task.pri, 'must');
assert.equal(task.plannedMinutes, 45);
assert(task.scheduledStart);
assert(stored['timetable/courses'].some(b => b.todoTaskId === task.id));
context.TodoNaturalAdd.capture('should Review sample A 2026-11-03\ncould Review sample B');
assert.equal(tasks().find(t => t.text === 'Review sample A').dueKey, '2026-11-03');
assert.equal(tasks().find(t => t.text === 'Review sample B').dueKey, '2026-11-03');
const before = stored['todo/tasks'];
assert.throws(() => context.TodoNaturalAdd.capture('Read sample February 30 at 6pm'), /does not exist/);
assert.equal(stored['todo/tasks'], before);
assert.equal(input.value, 'Read sample February 30 at 6pm');
console.log('PASS shared capture: priorities, mixed pages, manual durations, timed blocks, dependencies, multiline date carry, preserved state and invalid-input retention');
