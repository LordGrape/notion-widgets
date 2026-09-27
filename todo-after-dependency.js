/* "After X" task chaining.
   Type a task like "Case brief @Public Law Assignment for 30 min" (or
   "Case brief after Public Law Assignment"). That links the new task to the
   existing "Public Law Assignment" task instead of giving it a fixed clock
   time. As soon as "Public Law Assignment" is checked off, this task's
   countdown starts automatically and runs for whatever estimate it has
   (the "for 30 min" duration, or its Quick/~30m/~60m/Deep chip) -- exactly
   for tasks you can only estimate, not schedule to the minute.
   Everything here only touches the existing 'todo' SyncEngine namespace;
   nothing leaves the browser beyond the widget's normal sync. */
(function(root){
'use strict';
if(root.TodoAfterDependency)return;
var doc=root.document;
var TIMEM={quick:15,m30:30,m60:60,deep:120};
var UNDO_GRACE_MS=20000; // covers the app's brief "Task completed" Undo toast

function engine(){try{return typeof SyncEngine!=='undefined'?SyncEngine:root.SyncEngine}catch(e){return root.SyncEngine}}
function list(v){if(Array.isArray(v))return v;try{var p=JSON.parse(v||'[]');return Array.isArray(p)?p:[]}catch(e){return[]}}
function estimateMinutes(t){return t.plannedMinutes||TIMEM[t.time]||null}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

/* ---------- 1. Completion trigger: set/clear startedAt as parent tasks complete ---------- */
function applyDependencyStarts(tasks){
  var changed=false,byId={};
  tasks.forEach(function(t){if(t&&t.id)byId[t.id]=t});
  tasks.forEach(function(t){
    if(!t||!t.dependsOn)return;
    var parent=byId[t.dependsOn];
    if(!parent){
      /* Linked task no longer exists (deleted) -- drop the dead link rather
         than showing a "waiting on a ghost task" badge forever. */
      delete t.dependsOn;delete t.startedAt;changed=true;return;
    }
    if(parent.done&&!t.startedAt&&!t.done){t.startedAt=Date.now();changed=true;}
    else if(!parent.done&&t.startedAt&&!t.done&&(Date.now()-t.startedAt)<UNDO_GRACE_MS){delete t.startedAt;changed=true;}
  });
  return changed;
}

var installed=false;
function install(){
  var sync=engine();
  if(installed||!sync||typeof sync.set!=='function'){if(!installed)setTimeout(install,120);return}
  installed=true;
  var rawSet=sync.set;
  sync.set=function(namespace,key,value){
    if(namespace==='todo'&&key==='tasks'){
      var tasks=list(value);
      if(applyDependencyStarts(tasks))value=JSON.stringify(tasks);
    }
    var result=rawSet.call(sync,namespace,key,value);
    if(namespace==='todo'&&key==='tasks')setTimeout(refreshBadges,30);
    return result;
  };
  sync.__todoAfterDependencyBridge=true;
  function sweep(){
    var s=engine();if(!s)return;
    var tasks=list(s.get('todo','tasks'));
    if(applyDependencyStarts(tasks))s.set('todo','tasks',JSON.stringify(tasks));
  }
  if(sync.onReady)sync.onReady(function(){sweep();});
  /* Backstop poll, not just the local write hook above: catches a parent
     task being completed on another device/tab and pulled in via sync,
     which never calls sync.set locally and so would otherwise never
     trigger the check. */
  setInterval(sweep,6000);
}

/* ---------- 2. Live badge on dependent tasks ---------- */
function fmtMin(ms){return Math.max(0,Math.round(ms/60000))}
function badgeFor(t,byId){
  if(!t.dependsOn)return null;
  var parent=byId[t.dependsOn];
  var label=parent?parent.text:(t.dependencyText||'a task');
  if(!t.startedAt)return{cls:'waiting',html:'\u23F3 Waiting on <b>'+esc(label)+'</b>'};
  var elapsed=fmtMin(Date.now()-t.startedAt),est=estimateMinutes(t);
  if(!est)return{cls:'active',html:'\u25B6 Started '+elapsed+'m ago'};
  var remaining=est-elapsed;
  if(remaining>0)return{cls:'active',html:'\u25B6 Started '+elapsed+'m ago \u00B7 ~'+remaining+'m left (est.)'};
  return{cls:'over',html:'\u26A0 '+elapsed+'m in \u00B7 estimate exceeded by '+Math.abs(remaining)+'m'};
}
function refreshBadges(){
  var sync=engine();if(!sync)return;
  var tasks=list(sync.get('todo','tasks')),byId={};
  tasks.forEach(function(t){if(t&&t.id)byId[t.id]=t});
  var listEl=doc.getElementById('list');if(!listEl)return;
  [].forEach.call(listEl.querySelectorAll('.item[data-id]'),function(el){
    var id=el.getAttribute('data-id'),t=byId[id];
    var existing=el.querySelector('.dep-badge');
    if(!t||t.done||!t.dependsOn){if(existing)existing.remove();return}
    var info=badgeFor(t,byId);
    if(!info){if(existing)existing.remove();return}
    var body=el.querySelector('.body');if(!body)return;
    var node=existing;
    if(!node){node=doc.createElement('div');node.className='dep-badge';body.appendChild(node)}
    node.className='dep-badge '+info.cls;
    node.innerHTML=info.html;
  });
}
function watchList(){
  var listEl=doc.getElementById('list');
  if(!listEl){setTimeout(watchList,200);return}
  var mo=new MutationObserver(function(){refreshBadges()});
  mo.observe(listEl,{childList:true});
  setInterval(refreshBadges,20000);
  refreshBadges();
}

/* ---------- 3. "@Task" autocomplete while typing ---------- */
var ddEl=null,ddItems=[],ddIndex=-1,ddSuppressValue=null;
function closeDropdown(){if(ddEl){ddEl.remove();ddEl=null}ddItems=[];ddIndex=-1}
function currentMentionQuery(input){
  var v=input.value,at=v.lastIndexOf('@');
  if(at===-1)return null;
  var frag=v.slice(at+1);
  if(/[\n]/.test(frag))return null;
  if(/^\d/.test(frag))return null; /* "@4pm" is a time, not a task mention */
  return{at:at,frag:frag};
}
function matchTasks(frag){
  var sync=engine();if(!sync)return[];
  var tasks=list(sync.get('todo','tasks')).filter(function(t){return t&&!t.done&&t.text});
  var f=frag.trim().toLowerCase(),starts=[],contains=[];
  tasks.forEach(function(t){
    var low=t.text.toLowerCase();
    if(!f){starts.push(t);return}
    if(low.indexOf(f)===0)starts.push(t);else if(low.indexOf(f)!==-1)contains.push(t);
  });
  return starts.concat(contains).slice(0,6);
}
function positionDropdown(input){
  var r=input.getBoundingClientRect();
  ddEl.style.left=r.left+'px';ddEl.style.top=(r.bottom+4)+'px';ddEl.style.width=Math.max(200,r.width)+'px';
}
function highlight(i){
  if(!ddEl)return;
  [].forEach.call(ddEl.querySelectorAll('.dep-mention-opt'),function(node,idx){node.classList.toggle('hi',idx===i)});
}
function openDropdown(input,items){
  closeDropdown();
  if(!items.length)return;
  ddItems=items;ddIndex=0;
  ddEl=doc.createElement('div');ddEl.className='dep-mention-dd';
  ddEl.innerHTML=items.map(function(t,i){return '<div class="dep-mention-opt'+(i===0?' hi':'')+'" data-i="'+i+'">'+esc(t.text)+'</div>';}).join('');
  doc.body.appendChild(ddEl);
  positionDropdown(input);
  [].forEach.call(ddEl.querySelectorAll('.dep-mention-opt'),function(node){
    node.addEventListener('mousedown',function(e){e.preventDefault();applyMention(input,items[+node.getAttribute('data-i')]);});
  });
}
function applyMention(input,task){
  var q=currentMentionQuery(input);
  if(!q){closeDropdown();return}
  var before=input.value.slice(0,q.at);
  var next=before+'@'+task.text+' ';
  input.value=next;
  ddSuppressValue=next; /* prevent the mention we just inserted from re-matching and reopening the dropdown */
  closeDropdown();
  input.focus();
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function onInput(e){
  var input=e.target;if(!input||input.id!=='inp')return;
  if(ddSuppressValue!==null){
    var suppressed=ddSuppressValue;ddSuppressValue=null;
    if(input.value===suppressed){closeDropdown();return}
  }
  var q=currentMentionQuery(input);
  if(!q){closeDropdown();return}
  var items=matchTasks(q.frag);
  if(!items.length){closeDropdown();return}
  openDropdown(input,items);
}
function onKeydown(e){
  if(!e.target||e.target.id!=='inp'||!ddEl)return;
  if(e.key==='ArrowDown'){e.preventDefault();e.stopImmediatePropagation();ddIndex=(ddIndex+1)%ddItems.length;highlight(ddIndex);return}
  if(e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();ddIndex=(ddIndex-1+ddItems.length)%ddItems.length;highlight(ddIndex);return}
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeDropdown();return}
  if(e.key==='Enter'||e.key==='Tab'){
    if(ddIndex>=0&&ddItems[ddIndex]){e.preventDefault();e.stopImmediatePropagation();applyMention(e.target,ddItems[ddIndex]);}
    return;
  }
}
function onBlur(e){if(e.target&&e.target.id==='inp')setTimeout(closeDropdown,150);}

/* ---------- styles ---------- */
var CSS='.dep-badge{margin-top:5px;font-size:.72rem;line-height:1.4;font-style:normal}'+
'.dep-badge.waiting{color:var(--text-tertiary,rgba(120,110,140,.65))}'+
'.dep-badge.active{color:var(--accent-primary,#7c3aed)}'+
'.dep-badge.over{color:var(--danger,#e5484d);font-weight:600}'+
'.dep-mention-dd{position:fixed;z-index:10070;max-height:180px;overflow-y:auto;background:var(--surface-1,#fff);border:1px solid var(--border-default,rgba(124,58,237,.18));border-radius:10px;box-shadow:0 12px 32px rgba(30,20,50,.18);padding:4px}'+
'.dep-mention-opt{padding:7px 10px;border-radius:7px;font-size:.82rem;color:var(--text-primary,#241a33);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.dep-mention-opt.hi{background:var(--accent-primary,#7c3aed);color:#fff}';

function boot(){
  var style=doc.createElement('style');style.textContent=CSS;doc.head.appendChild(style);
  install();
  watchList();
  root.addEventListener('input',onInput,true);
  root.addEventListener('keydown',onKeydown,true);
  root.addEventListener('blur',onBlur,true);
}
root.TodoAfterDependency={version:1};
if(doc){if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot);else boot();}
})(typeof window!=='undefined'?window:globalThis);
