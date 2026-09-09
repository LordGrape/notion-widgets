const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={Intl,Date};vm.createContext(context);vm.runInContext(fs.readFileSync('todo-natural-add.js','utf8'),context);const parse=(s,t=[])=>context.TodoNaturalAdd.parse(s,new Date('2026-09-09T22:00:00Z'),t);
let r=parse('Read photosynthesis tomorrow at 6pm for 45 min');assert.equal(r.text,'Read photosynthesis');assert.equal(r.dateKey,'2026-09-10');assert.equal(r.startTime,'18:00');assert.equal(r.endTime,'18:45');
r=parse('Review cells today');assert.equal(r.dateKey,'2026-09-09');assert.equal(r.startTime,null);
r=parse('Read tomorrow 3-4pm');assert.equal(r.startTime,'15:00');assert.equal(r.endTime,'16:00');
assert.throws(()=>parse('Read tomorrow 4-3'));assert.throws(()=>parse('Read February 30 at 6pm'));assert.throws(()=>parse('Read at 25:00'));
r=parse('Read pp. 1-15 tomorrow');assert.equal(r.startTime,null);assert.match(r.text,/1-15/);
r=parse('Read 2026-09-10 at 6pm');assert.equal(r.dateKey,'2026-09-10');assert.equal(r.startTime,'18:00');
r=parse('Read in 2 days at noon');assert.equal(r.dateKey,'2026-09-11');assert.equal(r.startTime,'12:00');
r=parse('Submit notes tomorrow before 6pm');assert.equal(r.startTime,null);assert.equal(r.dueTime,'18:00');
r=parse('Review for 20 min after Read cells',[{id:'prior',text:'Read cells',scheduledEnd:'2026-09-10T21:00:00Z'}]);assert.equal(r.dependency.id,'prior');assert.equal(r.startTime,'17:00');assert.equal(r.endTime,'17:20');
if(process.env.TEST_CHRONO){context.TodoChrono=require('chrono-node/en');r=parse('Read in two days at 6pm');assert.equal(r.dateKey,'2026-09-11');assert.equal(r.startTime,'18:00');}
console.log('PASS natural parser: dates, time ranges, durations, deadlines, dependencies, page numbers, invalid input and optional Chrono');
