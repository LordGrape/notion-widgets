const fs=require('node:fs'),zlib=require('node:zlib'),vm=require('node:vm'),assert=require('node:assert/strict');
const wrapper=fs.readFileSync('todo-v2.html','utf8'),original=fs.readFileSync('todo.html','utf8');
const payload=wrapper.match(/var payload=`([\s\S]*?)`/);assert(payload,'v2 payload found');
const patches=JSON.parse(zlib.gunzipSync(Buffer.from(payload[1].replace(/\s/g,''),'base64')));
function once(source,a,b){assert.equal(source.split(a).length,2,'unique source fragment: '+a.slice(0,60));return source.replace(a,b);}
let source=original;for(const pair of patches)source=once(source,pair[0],pair[1]);
source=once(source,'function poll() {',"window.addEventListener('schedule-paste:refresh', poll);\n  function poll() {");
source=once(source,'<head>','<head><base href="https://example.invalid/">');
source=once(source,'</body>','<script src="todo-schedule-import.js"></script></body>');
for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(match[1].trim())new vm.Script(match[1]);}
new vm.Script(fs.readFileSync('todo-schedule-import.js','utf8'));
const box={Intl,Date};vm.createContext(box);vm.runInContext(fs.readFileSync('todo-schedule-import.js','utf8'),box);
const api=box.TodoSchedulePaste,row='2026-09-10 | 18:00-19:00 | must | study | BIO 101: Read photosynthesis';
assert.equal(api.parse(row+' '+row).length,2);assert.throws(()=>api.parse(row+'\nbad row'));assert.throws(()=>api.parse(row.replace('2026-09-10','2026-02-30')));assert.equal(api.iso('2026-09-10','18:00'),'2026-09-10T22:00:00.000Z');
let plan=api.build(api.parse(row),[{id:'preserve',text:'Existing task',done:true}],[{id:'course',name:'BIO 101',category:'class',color:'#1d4ed8'}]);plan.tasks[1].done=true;plan.tasks[1].notes='User notes';plan=api.build(api.parse(row),plan.tasks,plan.blocks);assert.equal(plan.tasks.length,2);assert.equal(plan.blocks.length,2);assert.equal(plan.tasks[1].done,true);assert.equal(plan.tasks[1].notes,'User notes');assert.equal(plan.blocks[1].color,'#1d4ed8');
console.log('Real v2 payload, refresh hook, script syntax, strict parser and data preservation passed.');
