import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
const functionSource = fs.readFileSync(functionPath, 'utf8');
if (!functionSource.includes('PRIVATE_WIDGET_KEY_HASH')) throw new Error('Private passcode verifier missing');

const feed = JSON.parse(fs.readFileSync('action-blocks-feed.enc.json', 'utf8'));
const todoPath = 'todo-sync.html';
let todo = fs.readFileSync(todoPath, 'utf8');
if (!todo.includes('function installPagesNotionBridge(win)')) throw new Error('Pages bridge missing');
const shellMarker = '  var shell=document.getElementById("todo");\n';
const hashBridge = '  var childHash=location.hash||"";\n  if(childHash&&shell.src.indexOf("#")<0)shell.src=shell.src+childHash;\n';
if (!todo.includes(hashBridge)) {
  if (!todo.includes(shellMarker)) throw new Error('Shell marker missing');
  todo = todo.replace(shellMarker, shellMarker + hashBridge);
}
todo = todo.replace('todo-v2.html?source=20260906-stable-loader-v2', 'todo-v2.html?source=20260906-week-specific-v8');
todo = todo.replace('todo-v2.html?source=20260906-encrypted-feed-v3', 'todo-v2.html?source=20260906-week-specific-v8');

const fallbackStart = '  /* ENCRYPTED ACTION FEED START */';
const fallbackEnd = '  /* ENCRYPTED ACTION FEED END */';
const fallbackCode = `${fallbackStart}
  var ENCRYPTED_ACTION_FEED=${JSON.stringify(feed)};
  function feedBytes(value){var raw=atob(value),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
  function privateWidgetKey(){try{return new URLSearchParams((location.hash||'').slice(1)).get('key')||''}catch(error){return''}}
  function loadEncryptedFallback(win){
    var keyText=privateWidgetKey(),payload=ENCRYPTED_ACTION_FEED,encoder=new TextEncoder();
    if(!keyText)return Promise.reject(new Error('Private widget key missing'));
    return crypto.subtle.importKey('raw',encoder.encode(keyText),'PBKDF2',false,['deriveKey']).then(function(material){
      return crypto.subtle.deriveKey({name:'PBKDF2',salt:feedBytes(payload.salt),iterations:payload.iterations||100000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
    }).then(function(key){return crypto.subtle.decrypt({name:'AES-GCM',iv:feedBytes(payload.iv)},key,feedBytes(payload.ciphertext))}).then(function(clear){
      var decoded=JSON.parse(new TextDecoder().decode(clear));mergeRemote(win,decoded.items||[]);return decoded.items||[];
    });
  }
${fallbackEnd}`;
if (todo.includes(fallbackStart) && todo.includes(fallbackEnd)) {
  todo = todo.slice(0, todo.indexOf(fallbackStart)) + fallbackCode + todo.slice(todo.indexOf(fallbackEnd) + fallbackEnd.length);
} else {
  const marker = '  function syncReadings(){';
  if (!todo.includes(marker)) throw new Error('syncReadings marker missing');
  todo = todo.replace(marker, fallbackCode + '\n\n' + marker);
}
const unavailable = `      if(!result||result.configured===false){
        showStatus("Action Blocks are not connected to the Worker. Check the Worker Notion connection.");
        return;
      }`;
const privateFallback = `      if(!result||result.configured===false){
        loadEncryptedFallback(win).then(function(){showStatus("")}).catch(function(){showStatus("Private task feed could not be unlocked.")});
        return;
      }`;
if (todo.includes(unavailable)) todo = todo.replace(unavailable, privateFallback);
if (!todo.includes('loadEncryptedFallback(win).then')) throw new Error('Private fallback was not wired');
fs.writeFileSync(todoPath, todo);

const appPath = 'todo.html';
let app = fs.readFileSync(appPath, 'utf8');
const actionScript = '<script src="action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2&targets=20260903-v1&upcoming=20260903-v1"></script>';
const importerScript = '<script src="todo-action-import.js?v=20260906-encrypted-fallback-v2"></script>';
if (!app.includes(importerScript)) {
  if (!app.includes(actionScript)) throw new Error('Action Blocks script marker missing');
  app = app.replace(actionScript, actionScript + '\n' + importerScript);
}
fs.writeFileSync(appPath, app);

const timetablePath = 'timetable.html';
let timetable = fs.readFileSync(timetablePath, 'utf8');
const oldFlatFor = 'function flatFor(day){return occurrencesForDate(currentWeekDate(day))}';
const taskBridge = `/* WEEK-SPECIFIC TODO TIMEBOX BRIDGE v1 */
function todoTasks(){var value=[];try{value=SyncEngine.get('todo','tasks')||[];if(typeof value==='string')value=JSON.parse(value)}catch(e){value=[]}return Array.isArray(value)?value:[]}
function clockValue(date){return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0')}
function todoBlocksForDate(target){
  var key=scheduleDateKey(target),colours={must:'#be123c',should:'#c2410c',could:'#8b5cf6'};
  return todoTasks().filter(function(task){
    if(!task||task.done||!task.scheduledStart||!task.scheduledEnd)return false;
    var start=new Date(task.scheduledStart),end=new Date(task.scheduledEnd);
    return !isNaN(start.getTime())&&!isNaN(end.getTime())&&scheduleDateKey(start)===key&&end>start;
  }).map(function(task){
    var start=new Date(task.scheduledStart),end=new Date(task.scheduledEnd);
    return{id:'todo:'+task.id,name:task.text||'To-Do task',description:task.notes||'Timed To-Do task',location:'',color:colours[task.pri]||'#8b5cf6',category:task.category||'study',trackCompletion:true,outcomeGoal:task.outcomeGoal||'',day:start.getDay(),start:clockValue(start),end:clockValue(end),dateKey:key,sourceDate:key,todoTaskId:task.id,fromTodo:true};
  })
}
function flatFor(day){var target=currentWeekDate(day);return occurrencesForDate(target).concat(todoBlocksForDate(target)).sort(function(a,b){return mins(a.start)-mins(b.start)})}`;
if (timetable.includes(oldFlatFor)) timetable = timetable.replace(oldFlatFor, taskBridge);
if (!timetable.includes('WEEK-SPECIFIC TODO TIMEBOX BRIDGE v1')) throw new Error('Timetable task bridge missing');
const renderMarker = `  }catch(e){}
  render();drawSettings();drawWeeklyTargets();updateStorageStatus();setInterval(updateStorageStatus,12000);requestAnimationFrame(syncSeg);`;
const liveRender = `  }catch(e){}
  try{if(SyncEngine.subscribe)SyncEngine.subscribe('todo','tasks',function(){render()})}catch(e){}
  render();drawSettings();drawWeeklyTargets();updateStorageStatus();setInterval(updateStorageStatus,12000);requestAnimationFrame(syncSeg);`;
if (timetable.includes(renderMarker)) timetable = timetable.replace(renderMarker, liveRender);
if (!timetable.includes("SyncEngine.subscribe('todo','tasks'")) throw new Error('Timetable live task subscription missing');
fs.writeFileSync(timetablePath, timetable);

const v2Path = 'todo-v2.html';
const v2 = fs.readFileSync(v2Path, 'utf8');
if (v2.includes('todo-action-import.js?v=20260906-direct-v1')) throw new Error('Broken srcdoc injection remains');
