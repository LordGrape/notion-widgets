/* TODO TRIGGER NUDGE v1
   Optional, dismissible prompt for tasks that look like they'd benefit
   from a concrete trigger (an if-then "Plan", or a reminder time) but
   don't have one yet. Read-only against the shared todo.tasks data —
   this script never writes a task, only reads it. All of its own state
   (the on/off toggle and per-task dismissals) lives in its own local
   storage keys, separate from the synced widget data.

   Heuristics (structured fields only, no text/NLP guessing):
   1) Must-priority, open, no Plan, no reminder set.
   2) Deep/60-min task, open, no due date, no Plan, no reminder set.
   Either way, the task already has real fields built for exactly this
   (the existing "Plan: after ___, at ___" field, and the reminder date
   picker already shipped in todo-reminders.js) — this just points at
   them when a task looks like it could use one. */
(function(root){
  'use strict';
  if(root.TodoTriggerNudge)return;
  root.TodoTriggerNudge={version:1};
  var NS='todo',KEY='tasks';
  var TOGGLE_KEY='todo_nudge_enabled_v1',DISMISS_KEY='todo_nudge_dismissed_v1';
  var current=null,scanQueued=false;

  function engine(){try{return typeof SyncEngine!=='undefined'?SyncEngine:root.SyncEngine}catch(e){return root.SyncEngine}}
  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

  function isEnabled(){
    try{var v=localStorage.getItem(TOGGLE_KEY);return v===null?true:v==='1'}catch(e){return true}
  }
  function setEnabled(on){try{localStorage.setItem(TOGGLE_KEY,on?'1':'0')}catch(e){}}
  function dismissedIds(){
    try{var raw=localStorage.getItem(DISMISS_KEY),arr=raw?JSON.parse(raw):[];return Array.isArray(arr)?arr:[]}catch(e){return[]}
  }
  function dismiss(id){
    var ids=dismissedIds();
    if(ids.indexOf(id)===-1){ids.push(id);try{localStorage.setItem(DISMISS_KEY,JSON.stringify(ids.slice(-500)))}catch(e){}}
  }

  function parseTasks(){
    var se=engine();if(!se)return[];
    var raw=null;try{raw=se.get(NS,KEY)}catch(e){}
    if(Array.isArray(raw))return raw.slice();
    if(typeof raw==='string'){try{var p=JSON.parse(raw);return Array.isArray(p)?p:[]}catch(e){}}
    return[];
  }
  function hasPlan(t){return!!(t.plan&&String(t.plan).trim())}
  function candidates(){
    var tasks=parseTasks(),dismissed=dismissedIds();
    return tasks.filter(function(t){
      if(!t||!t.id||t.done||dismissed.indexOf(t.id)!==-1)return false;
      if(t.reminderAt||hasPlan(t))return false;
      if(t.pri==='must')return true;
      if((t.time==='deep'||t.time==='m60')&&!t.due&&!t.dueKey)return true;
      return false;
    }).sort(function(a,b){return(a.created||0)-(b.created||0)});
  }

  function injectStyles(){
    if($('todoNudgeStyles'))return;
    var style=document.createElement('style');style.id='todoNudgeStyles';
    style.textContent='#todoNudgeToggle{position:fixed;top:10px;right:12px;z-index:10050;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid var(--border-default);background:var(--surface-3);color:var(--text-secondary);font:700 .64rem var(--font);letter-spacing:.02em;cursor:pointer;opacity:.7;transition:opacity .15s ease,border-color .15s ease}'
      +'#todoNudgeToggle:hover{opacity:1;border-color:var(--border-accent)}'
      +'#todoNudgeToggle[aria-pressed="false"]{opacity:.38}'
      +'#todoNudgeToggle .tn-dot{width:6px;height:6px;border-radius:50%;background:var(--accent-primary)}'
      +'#todoNudgeToggle[aria-pressed="false"] .tn-dot{background:var(--text-tertiary)}'
      +'#todoNudgeBanner{position:fixed;top:48px;left:50%;transform:translateX(-50%) translateY(-6px);width:min(360px,calc(100vw - 24px));padding:12px 14px;border-radius:12px;border:1px solid var(--border-default);background:var(--surface-3);box-shadow:var(--shadow-md);color:var(--text-primary);font:600 .76rem var(--font);z-index:10055;opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease}'
      +'#todoNudgeBanner.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}'
      +'#todoNudgeBanner .tn-msg{line-height:1.45}'
      +'#todoNudgeBanner .tn-msg b{font-weight:800}'
      +'#todoNudgeBanner .tn-acts{display:flex;gap:8px;margin-top:9px}'
      +'#todoNudgeBanner button{flex:1;height:32px;border-radius:8px;border:1px solid var(--border-default);background:var(--surface-0);color:var(--text-secondary);font:700 .68rem var(--font);cursor:pointer}'
      +'#todoNudgeBanner .tn-go{background:var(--accent-primary);border-color:transparent;color:#fff}'
      +'#todoNudgeBanner .tn-go:hover{filter:brightness(1.06)}'
      +'#todoNudgeBanner .tn-dismiss:hover{border-color:var(--border-accent);color:var(--danger)}'
      +'@media(max-width:390px){#todoNudgeBanner{top:auto;bottom:130px}}'
      +'@media(prefers-reduced-motion:reduce){#todoNudgeBanner,#todoNudgeToggle{transition:none}}';
    document.head.appendChild(style);
  }
  function syncToggle(){
    var btn=$('todoNudgeToggle');if(!btn)return;
    var on=isEnabled();
    btn.setAttribute('aria-pressed',on?'true':'false');
    btn.title=on?'Trigger nudges are on. Click to turn off.':'Trigger nudges are off. Click to turn on.';
    var label=btn.querySelector('.tn-label');if(label)label.textContent=on?'Nudges on':'Nudges off';
  }
  function ensureToggle(){
    if($('todoNudgeToggle'))return syncToggle();
    var btn=document.createElement('button');btn.id='todoNudgeToggle';btn.type='button';
    btn.innerHTML='<span class="tn-dot" aria-hidden="true"></span><span class="tn-label"></span>';
    document.body.appendChild(btn);
    btn.addEventListener('click',function(){setEnabled(!isEnabled());syncToggle();scan()});
    syncToggle();
  }
  function ensureBanner(){
    var el=$('todoNudgeBanner');
    if(el)return el;
    el=document.createElement('div');el.id='todoNudgeBanner';el.setAttribute('role','status');
    el.innerHTML='<div class="tn-msg"></div><div class="tn-acts"><button class="tn-dismiss" type="button">Not now</button><button class="tn-go" type="button">Open task</button></div>';
    document.body.appendChild(el);
    el.querySelector('.tn-dismiss').addEventListener('click',function(){
      if(current)dismiss(current);
      hideBanner();
      setTimeout(scan,200);
    });
    el.querySelector('.tn-go').addEventListener('click',function(){
      var id=current;hideBanner();
      if(!id)return;
      var row=document.querySelector('.item[data-id="'+id+'"]');
      if(!row)return;
      row.scrollIntoView({behavior:'smooth',block:'center'});
      var manage=row.querySelector('.manage');
      if(manage&&!row.classList.contains('editing'))manage.click();
      setTimeout(function(){
        var again=document.querySelector('.item[data-id="'+id+'"] .e-plan');
        if(again)again.focus();
      },260);
    });
    return el;
  }
  function hideBanner(){var el=$('todoNudgeBanner');if(el)el.classList.remove('show');current=null}
  function showBanner(t){
    var el=ensureBanner();current=t.id;
    var msg=t.pri==='must'
      ?'This one\u2019s marked <b>Must</b> with no plan yet \u2014 '+esc(t.text)
      :'This one\u2019s a big task with no target date \u2014 '+esc(t.text);
    el.querySelector('.tn-msg').innerHTML=msg;
    requestAnimationFrame(function(){el.classList.add('show')});
  }
  function scan(){
    injectStyles();ensureToggle();
    if(!isEnabled()){hideBanner();return}
    var list=candidates();
    if(current){
      if(!list.some(function(t){return t.id===current}))hideBanner();
      else return;
    }
    if(list.length)showBanner(list[0]);
  }
  function scheduleScan(){
    if(scanQueued)return;scanQueued=true;
    setTimeout(function(){scanQueued=false;scan()},400);
  }
  function boot(){
    injectStyles();ensureToggle();
    var se=engine();
    if(se&&se.subscribe)try{se.subscribe(NS,KEY,scheduleScan)}catch(e){}
    if(se&&se.onReady)try{se.onReady(scheduleScan)}catch(e){}
    setInterval(scheduleScan,15000);
    scheduleScan();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})(typeof window!=='undefined'?window:globalThis);
