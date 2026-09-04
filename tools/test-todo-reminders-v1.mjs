import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('todo-reminders.js', 'utf8');
const context = {
  console,
  Date,
  Intl,
  setTimeout() { return 1; },
  clearTimeout() {},
  requestAnimationFrame() {},
  MutationObserver: function MutationObserver() { this.observe = function observe() {}; },
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { appendChild() {} },
    head: { appendChild() {} },
  },
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(source, context);

const api = context.TodoReminders;
if (!api) throw new Error('TodoReminders API missing');
const tasks = [{ id: 'a', text: 'Read case', done: false, created: 1 }];
const future = new Date(Date.now() + 3_600_000);
const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}T${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`;
const result = api.applyReminder(tasks, 'a', local, Date.now());
if (!result.ok || !result.task.reminderAt || result.task.occurrenceId !== 'todo:a') {
  throw new Error('Reminder was not applied');
}
if (api.localInputValue(result.task.reminderAt) !== local) {
  throw new Error('Local time round-trip failed');
}
const cleared = api.applyReminder(result.tasks, 'a', '', Date.now());
if (!cleared.ok || cleared.task.reminderAt) throw new Error('Reminder was not cleared');
console.log('todo-reminders: ok');
