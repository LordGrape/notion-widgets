import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('timetable.html', 'utf8');
const start = html.indexOf('/* ── Storage ── */');
const end = html.indexOf('/* ── Queries ── */', start);
assert.ok(start >= 0 && end > start, 'storage section should exist');
const code = html.slice(start, end);

const store = new Map();
const remote = { courses: null };
const localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); }
};
const SyncEngine = {
  get(ns, key) { return ns === 'timetable' && key === 'courses' ? remote.courses : null; },
  set(ns, key, value) { if (ns === 'timetable' && key === 'courses') remote.courses = JSON.parse(JSON.stringify(value)); }
};
const context = {
  localStorage,
  SyncEngine,
  navigator: { storage: { persist: () => Promise.resolve(true) } },
  COLORS: ['#8b5cf6'],
  genId: () => 'generated',
  schedule: [],
  prefs: {},
  $: () => null,
  render: () => {},
  console
};
vm.runInNewContext(code, context);

const classes = [{
  id: 'law-171',
  name: 'LAW 171',
  description: 'Class',
  location: 'Room 100',
  color: '#8b5cf6',
  category: 'class',
  trackCompletion: false,
  days: [{ day: 3, start: '09:00', end: '10:30', location: 'Room 100' }]
}];

context.saveBlocks(classes);
assert.equal(remote.courses.length, 1, 'save should reach SyncEngine');
assert.equal(remote.courses[0].id, 'law-171', 'saved block identity should reach SyncEngine');
assert.equal(remote.courses[0].days[0].location, 'Room 100', 'per-day location should reach SyncEngine');
assert.ok(store.get('timetable_courses_vault_v1'), 'save should create a recovery vault');
let reloaded = context.loadBlocks();
assert.equal(reloaded.length, 1, 'saved class should survive reload');
assert.equal(reloaded[0].category, 'class', 'category should survive reload');
assert.equal(reloaded[0].trackCompletion, false, 'completion setting should survive reload');

remote.courses = [];
reloaded = context.loadBlocks();
assert.equal(reloaded.length, 1, 'an unexpected empty remote value must not erase a populated local schedule');
context.schedule = reloaded;
context.protectRemoteSchedule();
assert.equal(remote.courses.length, 1, 'local schedule should repair an unexpected empty remote value');

store.delete('timetable_courses');
remote.courses = null;
reloaded = context.loadBlocks();
assert.equal(reloaded.length, 1, 'vault should recover a missing primary local value');

context.saveBlocks([]);
assert.equal(context.loadBlocks().length, 0, 'an intentional user deletion should remain empty');
assert.equal(store.get('timetable_courses_intentionally_empty_v1'), '1', 'intentional empty state should be recorded');

assert.ok(!html.includes('  saveBlocks(schedule);'), 'boot must not write an empty schedule');
assert.ok(html.includes("if(typeof SyncEngine!=='undefined'&&typeof SyncEngine.init==='function')"), 'SyncEngine init should support lexical globals');
console.log('Timetable persistence regression tests passed');
