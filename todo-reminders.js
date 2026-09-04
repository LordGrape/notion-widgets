/* TODO NOTION APP REMINDERS v1
   Optional exact reminders for the to-do widget. Reminder state stays inside
   the existing SyncEngine task payload; the Worker delivers a Notion mention. */
(function(root){
'use strict';
var NS='todo',KEY='tasks',scanQueued=false,observer=null;
function $(id){return document.getElementById(id)}
function parseTasks(value){
 if(value==null&&root.SyncEngine)value=root.SyncEngine.get(NS,KEY);
 if(Array.isArray(value))return value.slice();
 if(typeof value==='string')try{var parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}catch(e){}
 return[]
}
function pad(n){return String(n).padStart(2,'0')}
function localKey(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())}
function todayKey(){return localKey(new Date())}
function tomorrowKey(){var date=new Date();date.setDate(date.getDate()+1);return localKey(date)}
function localInputValue(iso){
 if(!iso)return'';var date=new Date(iso);if(!isFinite(date.getTime()))return'';
 return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())
}
function futureInputMin(){var date=new Date(Date.now()+60000);date.setSeconds(0,0);return localInputValue(date.toISOString())}
function timezone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Toronto'}catch(e){return'America/Toronto'}}
function relativeDay(date){var key=localKey(date);if(key===todayKey())return'Today';if(key===tomorrowKey())return'Tomorrow';try{return date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}catch(e){return key}}
function reminderLabel(task){
 if(!task||!task.reminderAt)return'';var date=new Date(task.reminderAt);if(!isFinite(date.getTime()))return'';
 var time;try{time=date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}catch(e){time=pad(date.getHours())+':'+pad(date.getMinutes())}
 var prefix=task.reminderSentFor===task.reminderAt?'Reminded':(task.reminderState==='error'?'Retrying':'Remind');return prefix+' '+relativeDay(date)+' '+time
}
function toast(message){
 var host=$('toast'),text=$('toastMsg'),undo=$('undoBtn');
 if(host&&text){if(undo)undo.style.display='none';text.textContent=message;host.classList.add('show');setTimeout(function(){host.classList.remove('show')},4800);return}
 var old=document.querySelector('.todo-reminder-toast');if(old)old.remove();var node=document.createElement('div');node.className='todo-reminder-toast';node.textContent=message;document.body.appendChild(node);setTimeout(function(){if(node.parentNode)node.remove()},4800)
}
function applyReminder(tasks,id,value,nowMs){
 tasks=parseTasks(tasks);var task=tasks.find(function(item){return item&&item.id===id});if(!task)return{ok:false,error:'Task not found',tasks:tasks};
 value=String(value||'').trim();
 if(!value){
  delete task.reminderAt;delete task.reminderTimezone;delete task.reminderState;delete task.reminderSentAt;delete task.reminderSentFor;delete task.reminderLastAttemptAt;delete task.reminderLastError;delete task.reminderVersion;if(task.reminderOwnsDue){task.due=null;task.dueKey=null;delete task.reminderOwnsDue}task.updatedAt=Date.now();return{ok:true,cleared:true,task:task,tasks:tasks}
 }
 var date=new Date(value);if(!isFinite(date.getTime()))return{ok:false,error:'Choose a valid reminder time.',tasks:tasks};
 nowMs=typeof nowMs==='number'?nowMs:Date.now();if(date.getTime()<nowMs+30000)return{ok:false,error:'Choose a reminder time in the future.',tasks:tasks};
 var iso=date.toISOString(),day=localKey(date);task.reminderAt=iso;task.reminderTimezone=timezone();task.reminderState='scheduled';task.reminderVersion=Date.now();
 delete task.reminderSentAt;delete task.reminderSentFor;delete task.reminderLastAttemptAt;delete task.reminderLastError;
 if(!task.occurrenceId)task.occurrenceId='todo:'+task.id;
 if(!task.due&&!task.dueKey||task.reminderOwnsDue){task.dueKey=day;task.due=day===todayKey()?'today':(day===tomorrowKey()?'tomorrow':null);task.setKey=todayKey();task.reminderOwnsDue=true}
 task.updatedAt=Date.now();return{ok:true,task:task,tasks:tasks}
}
function saveReminder(id,value){
 if(!root.SyncEngine)return;var result=applyReminder(parseTasks(),id,value,Date.now());if(!result.ok){toast(result.error);scheduleScan();return}
 root.SyncEngine.set(NS,KEY,JSON.stringify(result.tasks));
 var online=root.SyncEngine.isOnline&&root.SyncEngine.isOnline();
 if(result.cleared)toast('Exact reminder removed.');
 else toast(online?'Notion app reminder scheduled.':'Saved locally. It will schedule when sync reconnects.');
 scheduleScan()
}
function injectStyles(){
 if($('todoReminderStyles'))return;var style=document.createElement('style');style.id='todoReminderStyles';style.textContent='\
.todo-reminder-editor{display:grid;gap:7px;padding:10px 0 2px;border-top:1px dashed var(--border-default)}.todo-reminder-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.todo-reminder-head label{font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;font-weight:750;color:var(--text-tertiary)}.todo-reminder-head span{font-size:.62rem;color:var(--text-tertiary)}.todo-reminder-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.todo-reminder-input{min-width:0;height:44px;color-scheme:light dark;font:600 .78rem var(--font);color:var(--text-primary);background:var(--surface-0);border:1px solid var(--border-default);border-radius:var(--radius-sm);padding:8px 10px;outline:none}.todo-reminder-input:focus{border-color:var(--accent-primary);box-shadow:0 0 0 3px var(--accent-glow)}.todo-reminder-clear{min-width:60px;height:44px;padding:0 12px;border:1px solid var(--border-default);border-radius:var(--radius-sm);background:var(--surface-0);color:var(--text-secondary);font:700 .72rem var(--font);cursor:pointer}.todo-reminder-clear:hover{border-color:var(--border-accent);color:var(--danger)}.todo-reminder-clear:disabled{opacity:.45;cursor:default}.todo-reminder-hint{font-size:.66rem;line-height:1.4;color:var(--text-tertiary)}.tag.todo-reminder-tag{display:inline-flex;align-items:center;gap:4px;color:var(--accent-primary);border-color:var(--border-accent)}.tag.todo-reminder-tag:before{content:"";width:6px;height:6px;border:1.5px solid currentColor;border-radius:50%}.tag.todo-reminder-tag.sent{color:var(--success)}.tag.todo-reminder-tag.error{color:var(--danger)}.todo-reminder-toast{position:fixed;z-index:10060;left:50%;bottom:18px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);padding:10px 14px;border:1px solid var(--border-default);border-radius:10px;background:var(--surface-3);box-shadow:var(--shadow-md);color:var(--text-primary);font:600 .76rem var(--font)}@media(max-width:390px){.todo-reminder-controls{grid-template-columns:1fr}.todo-reminder-clear{width:100%}}@media(prefers-reduced-motion:reduce){.todo-reminder-input,.todo-reminder-clear{transition:none}}';document.head.appendChild(style)
}
function updateBadge(item,task){
 var old=item.querySelector('.todo-reminder-tag');if(!task||!task.reminderAt||task.done){if(old)old.remove();return}
 var meta=item.querySelector('.meta');if(!meta)return;var label=reminderLabel(task);if(!label){if(old)old.remove();return}
 if(!old){old=document.createElement('span');old.className='tag todo-reminder-tag';meta.appendChild(old)}
 old.textContent=label;old.classList.toggle('sent',task.reminderSentFor===task.reminderAt);old.classList.toggle('error',task.reminderState==='error');old.title=task.reminderSentFor===task.reminderAt?'Notion app reminder sent':(task.reminderState==='error'?'Notion delivery will retry automatically':'Notion app reminder scheduled')
}
function updateEditor(item,task){
 var editor=item.querySelector('.editor');if(!editor||!task)return;var panel=editor.querySelector('.todo-reminder-editor');
 if(!panel){
  panel=document.createElement('div');panel.className='todo-reminder-editor';panel.innerHTML='<div class="todo-reminder-head"><label>Exact reminder</label><span>Notion app</span></div><div class="todo-reminder-controls"><input class="todo-reminder-input" type="datetime-local" step="60" aria-label="Exact reminder date and time"><button class="todo-reminder-clear" type="button">Clear</button></div><div class="todo-reminder-hint">Delivered as a Notion mention. Mobile push can arrive within about five minutes.</div>';
  var actions=editor.querySelector('.eactions');if(actions)editor.insertBefore(panel,actions);else editor.appendChild(panel);
  var input=panel.querySelector('.todo-reminder-input'),clear=panel.querySelector('.todo-reminder-clear');
  input.addEventListener('change',function(){saveReminder(item.getAttribute('data-id'),input.value)});
  clear.addEventListener('click',function(){input.value='';saveReminder(item.getAttribute('data-id'),'')})
 }
 var field=panel.querySelector('.todo-reminder-input'),clearButton=panel.querySelector('.todo-reminder-clear'),next=localInputValue(task.reminderAt);field.min=futureInputMin();if(document.activeElement!==field&&field.value!==next)field.value=next;clearButton.disabled=!task.reminderAt
}
function scan(){
 scanQueued=false;if(!root.SyncEngine)return;injectStyles();var tasks=parseTasks(),lookup=Object.create(null);tasks.forEach(function(task){if(task&&task.id)lookup[task.id]=task});
 document.querySelectorAll('.item[data-id]').forEach(function(item){var task=lookup[item.getAttribute('data-id')];updateBadge(item,task);updateEditor(item,task)})
}
function scheduleScan(){if(scanQueued)return;scanQueued=true;(root.requestAnimationFrame||setTimeout)(scan)}
function install(){
 if(observer)return;injectStyles();var host=$('card')||document.body;observer=new MutationObserver(scheduleScan);observer.observe(host,{childList:true,subtree:true});
 if(root.SyncEngine&&root.SyncEngine.subscribe)root.SyncEngine.subscribe(NS,KEY,scheduleScan);scan()
}
function boot(){
 if(!root.SyncEngine||!root.SyncEngine.onReady){setTimeout(boot,100);return}
 root.SyncEngine.onReady(install)
}
root.TodoReminders={parseTasks:parseTasks,localInputValue:localInputValue,reminderLabel:reminderLabel,applyReminder:applyReminder,scan:scan,install:install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()
})(typeof window!=='undefined'?window:globalThis);
