(function(root){
  'use strict';
  if(root.TimetableTaskActions)return;
  root.TimetableTaskActions={version:4};
  var blocks={},busy={},pullingTodo=false,lastTodoPull=0,ready=false;
  var selector='.card[data-id],.pill[data-id],.cal-event[data-id]';
  var icon='<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="4"/><path d="m6 10 2.5 2.5L14 7"/></svg>';
  function engine(){try{return typeof SyncEngine!=='undefined'?SyncEngine:root.SyncEngine}catch(error){return root.SyncEngine}}
  function list(value){if(value==null)return[];var parsed=typeof value==='string'?JSON.parse(value):value;if(!Array.isArray(parsed))throw new Error('Widget data unavailable');return JSON.parse(JSON.stringify(parsed))}
  function isTodo(block){return !!(block&&(block.source==='todo-action-block'||block.todoTaskId))}
  function read(value){blocks={};list(value).forEach(function(block){if(block&&block.id)blocks[block.id]=block})}
  function taskFor(block,tasks){return tasks.find(function(task){return task&&((block.todoTaskId&&task.id===block.todoTaskId)||(block.occurrenceId&&task.occurrenceId===block.occurrenceId)||(block.todoTaskId&&task.occurrenceId===block.todoTaskId))})}
  function styles(){var style=document.createElement('style');style.id='todoCompletionStyles';style.textContent=`
.todo-task-done{opacity:.65!important;filter:grayscale(.6) saturate(.3)!important;box-shadow:none!important}
.card.todo-task-done .name,.cal-event.todo-task-done b,.pill.todo-task-done{text-decoration:line-through;text-decoration-thickness:1.5px}
.todo-task-done::after{content:none!important}
.todo-manual-task:not(.todo-task-done){opacity:1!important;filter:none!important}
.card.todo-manual-task,.cal-event.todo-manual-task{padding-right:34px!important}
.todo-task-action{position:absolute;right:5px;top:5px;z-index:7;display:inline-grid;place-items:center;width:24px;height:24px;padding:3px;border:1px solid var(--line,rgba(139,92,246,.25));border-radius:7px;background:var(--surface-2,transparent);color:inherit;cursor:pointer;flex-shrink:0;transition:background .12s ease,opacity .12s ease}
.todo-task-action svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.todo-task-action:not([aria-pressed="true"]) svg path{opacity:.4}
.todo-task-action[aria-pressed="true"]{background:color-mix(in srgb,currentColor 12%,transparent)}
.todo-task-action:hover{background:color-mix(in srgb,currentColor 18%,transparent)}
.todo-task-action:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.todo-task-action:disabled{cursor:wait;opacity:.45}
.pill .todo-task-action{position:relative;inset:auto;vertical-align:middle;margin-left:5px;width:20px;height:20px;padding:2px}
.cal-event .todo-task-action{width:22px;height:22px;right:3px;top:3px}
#timetableTaskStatus{position:fixed;left:12px;right:12px;bottom:12px;z-index:30000;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface,#21182f);color:var(--text,#fff);font:12px/1.4 Inter,system-ui;box-shadow:0 4px 16px #0002;pointer-events:none}
#timetableTaskStatus:empty{display:none}
@media(hover:none){.todo-task-action{width:28px;height:28px}.card.todo-manual-task,.cal-event.todo-manual-task{padding-right:38px!important}}
@media(prefers-reduced-motion:reduce){.todo-task-action{transition:none}}
`;document.head.appendChild(style)}
  var statusTimer;
  function status(message){var el=document.getElementById('timetableTaskStatus');if(!el){el=document.createElement('div');el.id='timetableTaskStatus';el.setAttribute('role','status');document.body.appendChild(el)}if(el.textContent!==message)el.textContent=message;clearTimeout(statusTimer);statusTimer=setTimeout(function(){el.textContent=''},6000)}
  function scan(){
    document.querySelectorAll(selector).forEach(function(element){
      var block=blocks[element.dataset.id],todo=isTodo(block),done=!!(block&&block.todoDone),button=element.querySelector('.todo-task-action');
      element.classList.toggle('todo-manual-task',todo);element.classList.toggle('todo-task-done',todo&&done);
      if(!todo){if(button)button.remove();return}
      if(!done){element.classList.remove('past','polish-finished');var mark=element.querySelector('.completion-mark');if(mark)mark.remove()}
      if(!button){button=document.createElement('button');button.type='button';button.className='todo-task-action';button.innerHTML=icon;element.appendChild(button)}
      var label=done?'Task complete. Reopen in To-Do':'Task. Mark complete in To-Do';
      if(button.getAttribute('aria-label')!==label){button.setAttribute('aria-label',label);button.title=label+' (or right-click this entry)'}
      button.setAttribute('aria-pressed',done?'true':'false');button.disabled=!ready||!!busy[block.id];
    });
  }
  function pullTodo(force){var sync=engine();if(document.hidden||pullingTodo||!sync||typeof sync.pull!=='function')return Promise.resolve();if(!force&&Date.now()-lastTodoPull<2500)return Promise.resolve();pullingTodo=true;lastTodoPull=Date.now();return Promise.resolve(sync.pull('todo')).catch(function(){}).then(function(){pullingTodo=false})}
  function announce(){try{root.top.postMessage({type:'command-centre:todo-updated',sentAt:Date.now()},'*')}catch(error){}}
  async function toggle(id){
    var sync=engine();if(!ready||!sync){status('Widget is still connecting. No task changed.');return}if(busy[id])return;
    busy[id]=true;scan();
    try{
      var block=list(sync.get('timetable','courses')).find(function(b){return b&&b.id===id});if(!isTodo(block))return;
      var tasks=list(sync.get('todo','tasks')),task=taskFor(block,tasks);
      if(!task){await pullTodo(true);tasks=list(sync.get('todo','tasks'));task=taskFor(block,tasks)}
      if(!task){status('Linked To-Do task is unavailable. Reconnect sync and retry. Nothing changed.');return}
      var done=!task.done,now=Date.now();task.done=done;task.doneAt=done?now:null;task.outcome=done?task.outcome||null:null;task.updatedAt=now;
      sync.set('todo','tasks',JSON.stringify(tasks));
      var courses=list(sync.get('timetable','courses')).map(function(item){return item&&(item.id===id||(item.todoTaskId&&item.todoTaskId===task.id))?Object.assign({},item,{todoDone:done,todoDoneAt:done?now:null}):item});
      sync.set('timetable','courses',courses);read(courses);scan();
      status(done?'Task marked complete locally. Updating To-Do.':'Task reopened locally. Updating To-Do.');
      var pushes=[];if(sync.push){pushes.push(Promise.resolve(sync.push('todo')));pushes.push(Promise.resolve(sync.push('timetable')))}else if(sync.flush)pushes.push(Promise.resolve(sync.flush()));
      await Promise.all(pushes);announce();
      if(sync.isOnline&&!sync.isOnline())status('Saved locally. Reconnect sync for the other widget to update.');
    }catch(error){status('Could not finish updating the linked task. Check sync before retrying.')}
    finally{delete busy[id];scan()}
  }
  function action(event){
    var target=event.target,element=target&&target.closest&&target.closest(selector);if(!element||!isTodo(blocks[element.dataset.id]))return;
    var button=target.closest('.todo-task-action');if(event.type!=='contextmenu'&&!button)return;
    event.preventDefault();event.stopImmediatePropagation();toggle(element.dataset.id);
  }
  function boot(){var sync=engine();if(!sync){setTimeout(boot,150);return}styles();
    sync.onReady(function(){ready=true;try{read(sync.get('timetable','courses'));scan();pullTodo(true)}catch(error){status('Task controls unavailable until widget data can be read.')}});
    if(sync.subscribe)sync.subscribe('timetable','courses',function(value){try{read(value);scan()}catch(error){}});
    // Window capture precedes timetable document/card context and click handlers.
    root.addEventListener('contextmenu',action,true);root.addEventListener('click',action,true);
    root.addEventListener('pointerdown',function(e){if(e.target.closest&&e.target.closest('.todo-task-action'))e.stopImmediatePropagation()},true);
    root.addEventListener('keydown',function(e){if(e.target.closest&&e.target.closest('.todo-task-action')&&(e.key==='Enter'||e.key===' '))e.stopPropagation()},true);
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
    setInterval(function(){if(!ready)return;try{read(sync.get('timetable','courses'));scan();pullTodo(false)}catch(error){}},1800);
  }
  boot();
})(window);
