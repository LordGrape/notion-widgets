/* Schedule paste v4. No credentials, direct network calls, or Notion writes. */
(function (root) {
  'use strict';
  if (root.TodoSchedulePaste && root.TodoSchedulePaste.version === 4) return;
  const doc = root.document;
  const zone = 'America/Toronto';
  let ready = false, busy = false, pending = null, sync = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  function list(value) {
    if (value == null) return [];
    const result = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(result)) throw new Error('Existing widget data could not be read. Nothing was replaced.');
    return copy(result);
  }
  function token(value) {
    let hash = 2166136261;
    for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function parts(date) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p => [p.type,p.value]));
  }
  function iso(date, time) {
    const desired = Date.parse(date + 'T' + time + ':00Z');
    let result = desired;
    for (let i=0;i<3;i++) {
      const p=parts(new Date(result));
      const wall=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
      result += desired-wall;
    }
    const p=parts(new Date(result));
    if (`${p.year}-${p.month}-${p.day}` !== date || `${p.hour}:${p.minute}` !== time) throw new Error('Time does not exist in Toronto on this date.');
    return new Date(result).toISOString();
  }
  function courseCode(text) { const m=String(text||'').toUpperCase().match(/\b([A-Z]{2,6})\s*(\d{3,4})\b/); return m ? m[1]+' '+m[2] : ''; }
  function kindOf(text) { return /review|recall|retrieval/i.test(text)?'review':/read/i.test(text)?'reading':/assign|draft|memo|essay/i.test(text)?'assignment':'study'; }
  function validate(raw, index) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid item '+(index+1));
    const item = Object.assign({},raw);
    for (const name of ['date','start','end','title']) if(typeof item[name] !== 'string') throw new Error('Item '+(index+1)+' needs '+name+'.');
    const date=new Date(item.date+'T12:00:00Z');
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(item.date)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==item.date) throw new Error('Invalid date in item '+(index+1));
    if (![item.start,item.end].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||item.end<=item.start) throw new Error('Invalid time range in item '+(index+1));
    item.title=item.title.trim();
    if (!item.title || item.title.length>500) throw new Error('Invalid title in item '+(index+1));
    item.priority=item.priority||'should'; item.category=item.category||'study';
    if (!['must','should','could','none'].includes(item.priority)||!['class','study','training','personal'].includes(item.category)) throw new Error('Invalid priority or category in item '+(index+1));
    if (item.id!==undefined && (typeof item.id!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(item.id))) throw new Error('Invalid stable ID.');
    item.course=courseCode(item.course||item.title);
    item.kind=item.kind|| (item.category==='class'?'class':kindOf(item.title));
    if (!['class','reading','review','assignment','study','training','personal','break'].includes(item.kind)) throw new Error('Invalid work type.');
    if (item.notes!==undefined && (typeof item.notes!=='string'||item.notes.length>5000)) throw new Error('Notes must be short text.');
    if(item.sourceUrl!==undefined && (typeof item.sourceUrl!=='string'||!/^https:\/\//.test(item.sourceUrl))) throw new Error('Source link must use HTTPS.');
    if(item.steps!==undefined && (!Array.isArray(item.steps)||item.steps.length>20||item.steps.some(s=>typeof s!=='string'||!s.trim()||s.length>500))) throw new Error('Steps must be an array of short text.');
    item.startIso=iso(item.date,item.start); item.endIso=iso(item.date,item.end);
    item.minutes=(Date.parse(item.endIso)-Date.parse(item.startIso))/60000;
    return item;
  }
  function parse(text) {
    let source=String(text).trim().replace(/^```(?:text|json)?\s*\n?/i,'').replace(/\n?```\s*$/,'').replace(/\*\*/g,'').trim();
    let items;
    if(source.startsWith('{')) {
      const data=JSON.parse(source);
      if(data.version!==1||!Array.isArray(data.items)) throw new Error('Expected schedule version 1 and an items array.');
      items=data.items;
    } else {
      source=source.replace(/[\t\r\n ]+(?=20\d{2}-\d{2}-\d{2}\s*\|)/g,'\n');
      items=source.split('\n').filter(s=>s.trim()).map((line,i)=>{
        const m=line.trim().replace(/^[-*+]\s+/,'').match(/^(20\d{2}-\d{2}-\d{2})\s*\|\s*(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})\s*\|\s*(must|should|could|none)\s*\|\s*(class|study|training|personal)\s*\|\s*(.+)$/i);
        if(!m) throw new Error('Schedule item '+(i+1)+' is invalid. Nothing was added.');
        return {date:m[1],start:m[2],end:m[3],priority:m[4].toLowerCase(),category:m[5].toLowerCase(),title:m[6]};
      });
    }
    if(!items.length||items.length>100) throw new Error('Use 1 to 100 schedule items.');
    const result=items.map(validate), ids=new Set();
    result.forEach(item=>{if(item.id&&ids.has(item.id))throw new Error('Duplicate stable ID.');if(item.id)ids.add(item.id);});
    return result;
  }
  function colour(course, blocks) {
    const match=blocks.find(b=>b&&!b.todoTaskId&&(b.category==='class'||!b.category)&&courseCode(b.name)===course&&/^#[0-9a-f]{6}$/i.test(b.color||''));
    return match?match.color:'#8b5cf6';
  }
  function blockFor(task, previous, blocks) {
    const p=parts(new Date(task.scheduledStart)),q=parts(new Date(task.scheduledEnd));
    const date=`${p.year}-${p.month}-${p.day}`, code=task.courseCode||courseCode(task.text);
    return Object.assign({},previous||{}, {id:previous?previous.id:'todo_action_'+token(task.occurrenceId||task.id),name:task.text,description:task.notes||'',location:previous?previous.location||'':'',color:colour(code,blocks),days:[{day:new Date(date+'T12:00:00Z').getUTCDay(),start:p.hour+':'+p.minute,end:q.hour+':'+q.minute,location:''}],category:task.category||'study',trackCompletion:false,startDate:date,endDate:date,source:'todo-action-block',todoTaskId:task.id,occurrenceId:task.occurrenceId||task.id,courseCode:code,workType:task.workType||kindOf(task.text),todoDone:!!task.done,todoDoneAt:task.doneAt||null});
  }
  function build(items, oldTasks, oldBlocks) {
    const tasks=list(oldTasks),blocks=list(oldBlocks),now=Date.now();
    for(const item of items) {
      const hash=token([item.date,item.start,item.end,item.category,item.title].join('|'));
      const occurrence=item.id?'ai-schedule:'+item.id:'schedule-import:'+hash;
      const id=item.id?'ai_task_'+item.id:'import_task_'+hash;
      const index=tasks.findIndex(t=>t.id===id||t.occurrenceId===occurrence);
      const old=index>=0?tasks[index]:null;
      const metadata=[item.course? 'Course: '+item.course:'', 'Type: '+item.kind, item.notes||'', item.sourceUrl?'Source: '+item.sourceUrl:''].filter(Boolean).join('\n');
      if(item.category==='class') {
        const blockId=item.id?'ai_class_'+item.id:'import_block_'+hash;
        const idx=blocks.findIndex(b=>b.id===blockId);
        const block=Object.assign({},idx>=0?blocks[idx]:{}, {id:blockId,name:item.title,description:metadata,color:colour(item.course,blocks),days:[{day:new Date(item.date+'T12:00:00Z').getUTCDay(),start:item.start,end:item.end}],startDate:item.date,endDate:item.date,category:'class',source:'schedule-import',occurrenceId:occurrence});
        if(idx>=0)blocks[idx]=block;else blocks.push(block);
        continue;
      }
      const task=Object.assign({done:false,doneAt:null,created:now,subs:[]},old||{}, {id,text:item.title,pri:item.priority==='none'?null:item.priority,time:item.minutes<=20?'quick':item.minutes<=45?'m30':item.minutes<=90?'m60':'deep',due:null,dueKey:item.date,setKey:item.date,order:Date.parse(item.startIso),plannedMinutes:item.minutes,scheduledStart:item.startIso,scheduledEnd:item.endIso,timeboxed:true,allDay:false,category:item.category,source:'schedule-import',occurrenceId:occurrence,courseCode:item.course,workType:item.kind,updatedAt:now});
      // Do not erase user notes, completion, or edited substeps on re-paste.
      if(!old || item.notes!==undefined)task.notes=metadata;
      if(item.steps && !old) task.subs=item.steps.map((text,i)=>({id:id+'_step_'+i,text,done:false}));
      if(index>=0)tasks[index]=task;else tasks.push(task);
      const bi=blocks.findIndex(b=>b.todoTaskId===task.id||b.occurrenceId===occurrence);
      const block=blockFor(task,bi>=0?blocks[bi]:null,blocks);
      if(bi>=0)blocks[bi]=block;else blocks.push(block);
    }
    return {tasks,blocks};
  }
  function engine(){try{return typeof SyncEngine!=='undefined'?SyncEngine:root.SyncEngine;}catch(e){return null;}}
  function status(text) {
    if(!doc)return;
    let el=doc.getElementById('schedulePasteStatus');
    if(!el){el=doc.createElement('div');el.id='schedulePasteStatus';el.setAttribute('role','status');el.style.cssText='font:inherit;font-size:.75rem;line-height:1.4;margin-top:8px;color:var(--text-secondary);white-space:pre-wrap';const add=doc.querySelector('.add');if(add)add.insertAdjacentElement('afterend',el);}
    el.textContent=text;
  }
  function looksLike(text){return /20\d{2}-\d{2}-\d{2}\s*\|/.test(text)||/^\s*(?:```json\s*)?\{[\s\S]*"(?:version|items)"/.test(text);}
  function stop(e){e.preventDefault();e.stopImmediatePropagation();}
  async function commit(){
    if(busy||!pending)return;
    if(!ready){status('Widget is still connecting. Your schedule is kept here. Press + after connecting.');return;}
    if(pending.error){status(pending.error);return;}
    busy=true;
    try {
      const plan=build(pending.items,sync.get('todo','tasks'),sync.get('timetable','courses'));
      sync.set('todo','schedulePasteBackup',{savedAt:Date.now(),tasks:sync.get('todo','tasks'),courses:sync.get('timetable','courses')});
      sync.set('todo','tasks',JSON.stringify(plan.tasks));
      sync.set('timetable','courses',plan.blocks);
      // Read-back checks local persistence only. Core push catches remote failures.
      if(list(sync.get('todo','tasks')).length!==plan.tasks.length)throw new Error('Local save could not be verified.');
      doc.getElementById('inp').value='';pending=null;
      root.dispatchEvent(new Event('schedule-paste:refresh'));
      status('Saved on this device; cloud delivery is not yet verified.');
      if(sync.flush)await sync.flush();
      status(sync.isOnline&&sync.isOnline()?'Saved. Cloud sync requested. Check Timetable before re-pasting.':'Saved locally. Reconnect widget sync to deliver the timetable to other devices.');
      paint();
    }catch(e){status('Could not finish: '+e.message+' Your schedule is kept for retry.');}
    finally{busy=false;}
  }
  function paint(){
    if(!sync||!doc)return;
    let tasks;try{tasks=list(sync.get('todo','tasks'));}catch(e){return;}
    const blocks=list(sync.get('timetable','courses'));
    doc.querySelectorAll('.item[data-id]').forEach(el=>{
      const task=tasks.find(t=>t.id===el.dataset.id);if(!task||!task.courseCode)return;
      el.style.borderLeft='3px solid '+colour(task.courseCode,blocks);
    });
  }
  function boot(){
    ['todoSettingsButton','scheduleImportButton','scheduleSettingsOverlay'].forEach(id=>{const el=doc.getElementById(id);if(el)el.remove();});
    sync=engine();
    if(!sync){status('Schedule connection unavailable. Ordinary tasks still work.');return;}
    sync.onReady(()=>{ready=true;if(pending)status('Schedule ready. Press Enter or + to add it.');});
    // Keep course accents when existing completion bridges rewrite a timetable block.
    const rawSet=sync.set;
    sync.set=function(ns,key,value){
      if(ns==='timetable'&&key==='courses'){
        const incoming=list(value),tasks=list(sync.get('todo','tasks'));
        value=incoming.map(b=>{const t=tasks.find(t=>b&&b.todoTaskId===t.id&&t.source==='schedule-import');return t?Object.assign({},b,{color:colour(t.courseCode,incoming),description:t.notes||b.description||'',courseCode:t.courseCode,workType:t.workType}):b;});
      }
      const result=rawSet.call(sync,ns,key,value);
      if(ns==='todo'&&key==='tasks'){
        const tasks=list(value),blocks=list(sync.get('timetable','courses'));
        const next=blocks.map(b=>{const task=tasks.find(t=>b&&b.todoTaskId===t.id&&t.source==='schedule-import');return task?blockFor(task,b,blocks):b;});
        if(JSON.stringify(next)!==JSON.stringify(blocks))sync.set('timetable','courses',next);
      }
      return result;
    };
    new MutationObserver(paint).observe(doc.getElementById('list')||doc.body,{childList:true,subtree:true});
  }
  if(doc){
    // Window capture precedes every document/target Smart Add handler.
    root.addEventListener('paste',e=>{
      if(!e.target||e.target.id!=='inp')return;
      const text=e.clipboardData&&e.clipboardData.getData('text/plain');if(!text||!looksLike(text)){pending=null;return;}
      stop(e);
      try{pending={items:parse(text)};e.target.value=text.replace(/\s+/g,' ');status(pending.items.length+' schedule items recognized. Press Enter or +.');}
      catch(error){pending={error:error.message};e.target.value=text.replace(/\s+/g,' ');status(error.message);}
    },true);
    root.addEventListener('input',e=>{if(e.target&&e.target.id==='inp')pending=null;},true);
    function submit(e){const target=e.target;if(!target)return;const isAdd=e.type==='keydown'?target.id==='inp'&&e.key==='Enter':target.closest&&target.closest('#addbtn');if(!isAdd)return;const inp=doc.getElementById('inp');if(!pending&&looksLike(inp.value)){try{pending={items:parse(inp.value)};}catch(error){pending={error:error.message};}}if(pending){stop(e);commit();}}
    root.addEventListener('keydown',submit,true);root.addEventListener('click',submit,true);
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target&&e.target.id==='inp'){pending=null;e.target.value='';status('Schedule paste cancelled.');}},true);
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot);else boot();
  }
  root.TodoSchedulePaste={version:4,parse,build,iso};
})(typeof window!=='undefined'?window:globalThis);
