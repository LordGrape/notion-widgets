import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(source,oldStr,newStr,label){
  const count=source.split(oldStr).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(oldStr,newStr);
}
function replaceSection(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  if(start<0||end<0||end<=start)throw new Error(`${label}: section markers not found`);
  return source.slice(0,start)+replacement+source.slice(end);
}

let action=read('action-blocks.js');
const marker='ACTION BLOCKS EDITOR v2';
if(!action.includes(marker)){
  action=replaceOnce(
    action,
    "'use strict';\nvar CATEGORIES=",
    "'use strict';\n/* ACTION BLOCKS EDITOR v2 */\ntry{if(!root.SyncEngine&&typeof SyncEngine!=='undefined')root.SyncEngine=SyncEngine}catch(e){}\nvar CATEGORIES=",
    'SyncEngine global bridge'
  );

  const injectStyles=`function injectStyles(){
 if(document.getElementById('action-block-styles'))return;
 var s=document.createElement('style');s.id='action-block-styles';
 s.textContent='.ab-editor-row{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.25fr);gap:8px}.ab-field{min-width:0}.ab-select-wrap{position:relative}.ab-select{height:46px;margin:0;padding-right:34px!important;appearance:none;-webkit-appearance:none;cursor:pointer}.ab-select-wrap:after{content:"";position:absolute;right:13px;top:50%;width:7px;height:7px;border-right:1.5px solid var(--text-2);border-bottom:1.5px solid var(--text-2);transform:translateY(-70%) rotate(45deg);pointer-events:none}.ab-toggle{position:relative;min-height:46px;padding:7px 10px 7px 11px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--bg) 70%,transparent);display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;box-shadow:inset 0 1px 0 var(--highlight);transition:border-color .25s var(--ease),box-shadow .25s var(--ease),background .25s var(--ease)}.ab-toggle:hover{border-color:var(--line-strong)}.ab-toggle-copy{display:flex;flex-direction:column;min-width:0}.ab-toggle-copy strong{font-size:10.5px;font-weight:700;color:var(--text);line-height:1.2}.ab-toggle-copy small{margin-top:2px;font-size:7.8px;font-weight:600;color:var(--text-3);line-height:1.25;white-space:nowrap}.ab-check{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}.ab-switch{position:relative;width:36px;height:21px;flex:0 0 auto;border-radius:999px;background:var(--line-strong);border:1px solid var(--line);box-shadow:inset 0 1px 3px rgba(36,26,51,.12);transition:background .25s var(--ease),border-color .25s var(--ease),box-shadow .25s var(--ease)}.ab-switch i{position:absolute;top:3px;left:3px;width:13px;height:13px;border-radius:50%;background:var(--surface);box-shadow:0 2px 5px rgba(36,26,51,.22);transition:transform .3s var(--spring),background .25s}.ab-check:checked+.ab-switch{background:linear-gradient(135deg,var(--accent),var(--accent-2));border-color:transparent;box-shadow:0 5px 14px color-mix(in srgb,var(--accent) 28%,transparent)}.ab-check:checked+.ab-switch i{transform:translateX(15px);background:#fff}.ab-check:focus-visible+.ab-switch{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}.ab-toggle.is-disabled{cursor:default;background:var(--surface-3)}.ab-toggle.is-disabled .ab-switch{opacity:.42}.ab-toggle.is-disabled .ab-toggle-copy strong{color:var(--text-2)}@media(max-width:370px){.ab-editor-row{grid-template-columns:1fr}.ab-toggle-copy small{white-space:normal}}.ab-toast{position:fixed;left:50%;bottom:16px;z-index:10020;transform:translateX(-50%);max-width:min(360px,calc(100vw - 24px));padding:10px 14px;border:1px solid rgba(139,92,246,.24);border-radius:12px;background:rgba(24,20,38,.96);color:#f4f0ff;font:500 12px/1.4 "Inter",system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.32);backdrop-filter:blur(18px)}.ab-modal{position:fixed;inset:0;z-index:10030;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,4,10,.38);backdrop-filter:blur(8px)}.ab-card{width:min(380px,100%);padding:18px;border:1px solid rgba(139,92,246,.22);border-radius:18px;background:rgba(22,18,35,.98);color:#f5f2ff;box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:"Inter",system-ui,sans-serif}.ab-card b{display:block;font-size:14px;margin-bottom:6px}.ab-card p{margin:0 0 14px;color:rgba(245,242,255,.66);font-size:12px;line-height:1.5}.ab-actions{display:flex;gap:7px}.ab-actions button{flex:1;border:1px solid rgba(139,92,246,.22);border-radius:10px;padding:8px 6px;background:rgba(139,92,246,.1);color:#ddd6fe;font:600 10px/1 "Inter",system-ui,sans-serif;cursor:pointer}.ab-actions button:first-child{background:#7c3aed;color:white}.pill.action-done{opacity:.58;filter:saturate(.65)}.pill.action-done:after{content:"✓";margin-left:4px;font-weight:800}';
 document.head.appendChild(s)
}
`;
  action=replaceSection(action,'function injectStyles(){','\nfunction installTimetableEditor(){',injectStyles,'Action Blocks styles');

  const editor=`function installTimetableEditor(){
 var loc=document.getElementById('fLoc'),save=document.getElementById('fSave');
 if(!loc||!save||document.getElementById('fCategory'))return;
 var host=loc.parentElement&&loc.parentElement.parentElement;if(!host)return;
 var row=document.createElement('div');row.className='ab-editor-row';
 row.innerHTML='<div class="ab-field"><label class="f-label">Category</label><div class="ab-select-wrap"><select class="f-input ab-select" id="fCategory" aria-label="Schedule category"><option value="class">Class</option><option value="study">Study</option><option value="training">Training</option><option value="personal">Personal</option></select></div></div><div class="ab-field"><label class="f-label">To-do</label><label class="ab-toggle" id="fTrackLabel" for="fTrack"><span class="ab-toggle-copy"><strong id="fTrackTitle">Weekly to-do</strong><small id="fTrackHint">Fresh task every scheduled day.</small></span><input class="ab-check" id="fTrack" type="checkbox"><span class="ab-switch" aria-hidden="true"><i></i></span></label></div>';
 host.insertAdjacentElement('afterend',row);
 var cat=document.getElementById('fCategory'),track=document.getElementById('fTrack'),trackLabel=document.getElementById('fTrackLabel'),trackTitle=document.getElementById('fTrackTitle'),trackHint=document.getElementById('fTrackHint'),name=document.getElementById('fName'),desc=document.getElementById('fDesc'),overlay=document.getElementById('overlay');
 var touched=false,activeBlockId=null,wasOpen=false,lastMode='';
 function paintTrack(){
  var locked=cat.value==='class';if(locked)track.checked=false;track.disabled=locked;
  trackLabel.classList.toggle('is-disabled',locked);trackLabel.setAttribute('aria-disabled',locked?'true':'false');
  trackTitle.textContent=locked?'Schedule only':'Weekly to-do';
  trackHint.textContent=locked?'Classes never create to-dos.':(track.checked?'Fresh task every scheduled day.':'Keep this on the schedule only.');
 }
 function defaults(value){if(CATEGORIES.indexOf(value)<0)value='personal';cat.value=value;track.checked=value==='study'||value==='training';paintTrack()}
 function findMatch(){var list=parseList(root.SyncEngine&&root.SyncEngine.get('timetable','courses'));return list.find(function(b){return b&&b.name===(name&&name.value)&&String(b.location||'')===String(loc.value||'')})}
 function hydrate(match){touched=false;if(match){match=normalizeBlock(match);activeBlockId=match.id||null;cat.value=match.category;track.checked=!!match.trackCompletion;paintTrack()}else{activeBlockId=null;defaults(inferCategory({name:name&&name.value,description:desc&&desc.value}))}}
 function syncEditor(){
  var open=!overlay||overlay.classList.contains('show');if(!open){wasOpen=false;return}
  var mode=String(save.textContent),match=findMatch(),blank=!String(name&&name.value||'').trim()&&!String(loc.value||'').trim()&&!String(desc&&desc.value||'').trim();
  if(!wasOpen)hydrate(match);
  else if(mode==='Save changes'&&match&&match.id!==activeBlockId)hydrate(match);
  else if(mode==='Save block'&&blank&&(activeBlockId!==null||lastMode!=='Save block')){activeBlockId=null;touched=false;defaults('class')}
  wasOpen=true;lastMode=mode;
 }
 cat.addEventListener('change',function(){touched=true;track.checked=cat.value==='study'||cat.value==='training';paintTrack()});
 track.addEventListener('change',function(){touched=true;paintTrack()});
 function inferNew(){if(!touched&&activeBlockId===null)defaults(inferCategory({name:name&&name.value,description:desc&&desc.value}))}
 if(name)name.addEventListener('input',inferNew);if(desc)desc.addEventListener('input',inferNew);
 save.addEventListener('click',function(){paintTrack();pendingEditor={category:cat.value,trackCompletion:!!track.checked};if(track.checked&&'Notification'in root&&Notification.permission==='default')try{Notification.requestPermission()}catch(e){}setTimeout(syncEditor,0)},true);
 var clear=document.getElementById('fClear');if(clear)clear.addEventListener('click',function(){activeBlockId=null;touched=false;lastMode='';defaults('class')});
 setInterval(syncEditor,250);syncEditor();
}
`;
  action=replaceSection(action,'function installTimetableEditor(){','\nfunction normalizeSchedule(){',editor,'Timetable editor');
  action=replaceOnce(action,"document.querySelectorAll('.week-pill[data-id]')","document.querySelectorAll('.pill[data-id]')",'Timetable completion selector');

  const oldRun="function run(){if(!root.SyncEngine)return;normalizeSchedule();if(isTodoWidget){var tasks=materialize()||parseList(root.SyncEngine.get('todo','tasks'));checkPrompts(tasks);syncNotion(tasks)}lastDay=dateKey()}";
  const newRun="function run(){if(!root.SyncEngine)return;normalizeSchedule();var tasks=parseList(root.SyncEngine.get('todo','tasks'));if(isTodoWidget){tasks=materialize()||tasks;checkPrompts(tasks);syncNotion(tasks)}applyCompletionMarks(tasks);lastDay=dateKey()}";
  action=replaceOnce(action,oldRun,newRun,'Action Blocks run loop');

  const bootStart='function boot(){';
  const bootEnd='\nroot.ActionBlocks=';
  const boot=`function boot(){
 isTodoWidget=!!document.getElementById('inp')&&!!document.getElementById('list');
 installSetBridge();injectStyles();installTimetableEditor();
 if(isTodoWidget)document.addEventListener('click',function(e){var btn=e.target&&e.target.closest&&e.target.closest('.item .del');if(!btn)return;var item=btn.closest('.item'),id=item&&item.getAttribute('data-id'),tasks=parseList(root.SyncEngine&&root.SyncEngine.get('todo','tasks')),task=tasks.find(function(t){return t&&t.id===id});if(!task||!task.occurrenceId)return;e.preventDefault();e.stopImmediatePropagation();task.done=true;task.doneAt=Date.now();task.outcome='skipped';task.updatedAt=Date.now();writeTasks(tasks);showToast('Scheduled action skipped.')},true);
 if(root.SyncEngine&&root.SyncEngine.onReady)root.SyncEngine.onReady(function(){
  run();
  if(root.SyncEngine.subscribe){
   root.SyncEngine.subscribe('timetable','courses',run);
   root.SyncEngine.subscribe('todo','tasks',function(v){var tasks=parseList(v);applyCompletionMarks(tasks);if(isTodoWidget)syncNotion(tasks)});
  }
 });
 setInterval(function(){
  var tasks=parseList(root.SyncEngine&&root.SyncEngine.get('todo','tasks'));
  if(lastDay!==dateKey())run();
  else{if(isTodoWidget)checkPrompts(tasks);applyCompletionMarks(tasks)}
 },30000)
}
`;
  action=replaceSection(action,bootStart,bootEnd,boot,'Action Blocks boot');
}
if(!action.includes(marker))throw new Error('Action Blocks v2 marker missing');
if(action.includes('.week-pill'))throw new Error('Stale timetable pill selector remains');
write('action-blocks.js',action);

for(const path of ['timetable.html','todo.html']){
  let html=read(path);
  const plain='<script src="action-blocks.js"></script>';
  const versioned='<script src="action-blocks.js?v=20260902-editor-v2"></script>';
  if(html.includes(plain))html=html.replace(plain,versioned);
  if(!html.includes(versioned))throw new Error(`Versioned Action Blocks client missing from ${path}`);
  if(path==='timetable.html'){
    const oldNs="namespaces:['timetable']";
    const newNs="namespaces:['timetable','todo']";
    if(html.includes(oldNs))html=html.replace(oldNs,newNs);
    if(!html.includes(newNs))throw new Error('Timetable must load the to-do namespace for completion state');
  }
  write(path,html);
}

console.log('Applied integrated Action Blocks editor and weekly recurrence verification.');
