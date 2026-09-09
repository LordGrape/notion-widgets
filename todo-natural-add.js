/* Natural task entry. Optional Chrono (MIT) enrichment; deterministic offline fallback.
   https://github.com/wanasit/chrono . Task text never leaves the browser for parsing. */
(function(root){
'use strict';if(root.TodoNaturalAdd)return;
const doc=root.document,zone='America/Toronto';let sync,ready=false,rawPaste=null;
const pad=n=>String(n).padStart(2,'0');
function wall(instant){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));}
function day(instant){const p=wall(instant);return `${p.year}-${p.month}-${p.day}`;}
function shift(key,n){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function valid(key){const d=new Date(key+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===key;}
function array(v){const a=typeof v==='string'?JSON.parse(v):v||[];if(!Array.isArray(a))throw Error('Existing widget data could not be read.');return JSON.parse(JSON.stringify(a));}
function clock(h,m,s){h=Number(h);m=Number(m||0);if(m>59||h>23||(s&&(h<1||h>12)))throw Error('Use a valid time, such as 6pm or 18:00.');if(s){h%=12;if(s.toLowerCase()==='pm')h+=12;}return pad(h)+':'+pad(m);}
function clean(s){return s.replace(/\s+/g,' ').replace(/^(?:start|begin|schedule|on|at|from)\s+/i,'').replace(/\s+(?:on|at|from|for|by)$/i,'').replace(/^[,;: -]+|[,;: -]+$/g,'').trim();}
function parse(text,now=new Date(),tasks=[]){
 const raw=String(text).trim(),today=day(now);let work=raw;
 const r={text:raw,dateKey:null,startTime:null,endTime:null,duration:null,priority:null,dependency:null,dueTime:null,recognized:false,labels:[]};
 function take(m){work=work.slice(0,m.index)+' '+work.slice(m.index+m[0].length);r.recognized=true;}
 let m=work.match(/\b(must|urgent|important|should|could)\b/i);if(m){r.priority=/must|urgent|important/i.test(m[1])?'must':m[1].toLowerCase();take(m);}
 m=work.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m|hours?|hrs?|hr|h)\b/i);if(m){r.duration=Math.round(Number(m[1])*(/^h/i.test(m[2])?60:1));if(r.duration<1||r.duration>720)throw Error('Use a duration from 1 to 720 minutes.');take(m);}
 // Explicit dates first, preventing ISO dates or page ranges from becoming clock ranges.
 m=work.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);if(m){r.dateKey=m[1]+'-'+pad(m[2])+'-'+pad(m[3]);if(!valid(r.dateKey))throw Error('That calendar date does not exist.');take(m);}
 if(!r.dateKey){m=work.match(/\b(today|tonight|tomorrow|tmrw|tmr)\b/i);if(m){r.dateKey=/tomorrow|tmrw|tmr/i.test(m[1])?shift(today,1):today;take(m);}}
 if(!r.dateKey){m=work.match(/\bin\s+(\d+)\s+(days?|weeks?)\b/i);if(m){r.dateKey=shift(today,Number(m[1])*(/^week/i.test(m[2])?7:1));take(m);}}
 if(!r.dateKey){m=work.match(/\b(?:(next|this)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i);if(m){const target=['sun','mon','tue','wed','thu','fri','sat'].indexOf(m[2].slice(0,3).toLowerCase());let delta=(target-new Date(today+'T12:00Z').getUTCDay()+7)%7;if(m[1]&&m[1].toLowerCase()==='next')delta+=7;else if(delta===0&&m[1]!=='this')delta=7;r.dateKey=shift(today,delta);take(m);}}
 if(!r.dateKey){m=work.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);if(m){const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].slice(0,3).toLowerCase())+1;let year=m[3]||today.slice(0,4);r.dateKey=year+'-'+pad(month)+'-'+pad(m[2]);if(!valid(r.dateKey))throw Error('That calendar date does not exist.');if(!m[3]&&r.dateKey<today)r.dateKey=(Number(year)+1)+r.dateKey.slice(4);take(m);}}
 r.explicitDate=!!r.dateKey;
 const range=/(?<![\d-])(?:\b(?:from|at|between)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until|through|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
 m=work.match(range);
 if(m&&!/\b(?:pp?\.?|pages?|chapters?|sections?)\s*$/i.test(work.slice(0,m.index))){
 let a=m[3],b=m[6];if(!a&&b)a=Number(m[1])>Number(m[4])?(b.toLowerCase()==='pm'?'am':'pm'):b;if(!b&&a)b=a;
 r.startTime=clock(m[1],m[2],a);r.endTime=clock(m[4],m[5],b);
 if(r.endTime<=r.startTime)throw Error('The end is earlier than the start. Clarify the range with AM/PM; overnight blocks need separate day entries.');
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));r.duration=minutes(r.endTime)-minutes(r.startTime);if(r.duration>720)throw Error('That range exceeds 12 hours. Please clarify AM/PM.');take(m);
 }
 if(!r.startTime){m=work.match(/\b(?:before|by)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);if(m){r.dueTime=clock(m[1],m[2],m[3]);take(m);}}
 if(!r.startTime){m=work.match(/(?:@|\bat\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)||work.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);if(m){r.startTime=clock(m[1],m[2],m[3]);take(m);}}
 if(!r.startTime){m=work.match(/\b(noon|midnight)\b/i);if(m){r.startTime=m[1].toLowerCase()==='noon'?'12:00':'00:00';take(m);}}
 // Chrono adds broader expressions (e.g. "in two days") when its pinned module is available.
 if(!r.dateKey&&root.TodoChrono&&typeof root.TodoChrono.parse==='function'){
 const p=wall(now),offset=Math.round((Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(+now/60000)*60000)/60000);
 const results=root.TodoChrono.parse(work,{instant:now,timezone:offset},{forwardDate:true});
 if(results.length===1){const c=results[0],k=c.start.get('year')+'-'+pad(c.start.get('month'))+'-'+pad(c.start.get('day'));if(valid(k)){r.dateKey=k;r.explicitDate=true;if(c.start.isCertain('hour'))r.startTime=clock(c.start.get('hour'),c.start.get('minute'));take({index:c.index,0:c.text});}}
 }
 m=work.match(/\s+after\s+(.+?)\s*$/i);if(m){const name=clean(m[1]);const matches=tasks.filter(t=>!t.done&&String(t.text).toLowerCase()===name.toLowerCase());if(matches.length>1)throw Error('More than one task matches that dependency. Use a unique task title.');r.dependency={text:name,id:matches[0]?.id||null};const linked=matches[0];if(!r.startTime&&linked&&linked.scheduledEnd){const p=wall(new Date(linked.scheduledEnd));r.dateKey=`${p.year}-${p.month}-${p.day}`;r.startTime=p.hour+':'+p.minute;}take(m);}
 if(r.startTime||r.dueTime){if(!r.dateKey)r.dateKey=today;}
 if(r.startTime&&!r.endTime){r.duration=r.duration||60;const end=Number(r.startTime.slice(0,2))*60+Number(r.startTime.slice(3))+r.duration;if(end>=1440)throw Error('This block crosses midnight. Use separate day entries.');r.endTime=pad(Math.floor(end/60))+':'+pad(end%60);}
 r.text=clean(work)||'Scheduled task';
 if(r.dateKey)r.labels.push(r.dateKey);if(r.startTime)r.labels.push(r.startTime+'–'+r.endTime+' ET',r.duration+' min','Timetable');else if(r.dateKey)r.labels.push(r.dueTime?'Due by '+r.dueTime:'Date only');
 if(r.duration&&!r.startTime)r.labels.push(r.duration+' min estimate');if(r.priority)r.labels.push(r.priority);if(r.dependency)r.labels.push('After '+r.dependency.text+(r.dependency.id?'':' (not linked)'));
 return r;
}
function isSchedule(s){return /20\d{2}-\d{2}-\d{2}\s*\||^\s*(?:```json\s*)?\{/.test(s);}
function entries(text){return String(text).split(/\n+|\s*;\s*/).map(x=>x.replace(/^\s*[-*•]\s+/,'').trim()).filter(Boolean);}
function plan(text){const tasks=array(sync.get('todo','tasks'));let carry=null;return entries(text).map(s=>{let r=parse(s,new Date(),tasks);if(carry&&!r.explicitDate)r=parse(carry+' '+s,new Date(),tasks);if(r.dateKey)carry=r.dateKey;return r;});}
function preview(){const input=doc.getElementById('inp'),row=doc.getElementById('smartPreview');if(!input||!row||!sync)return;const text=rawPaste||input.value;if(!text.trim()||isSchedule(text)){row.textContent='';row.hidden=true;return}try{const parsed=plan(text);row.textContent=parsed.map(r=>r.labels.join(' · ')).filter(Boolean).join(' | ');row.hidden=!row.textContent;}catch(e){row.hidden=false;row.textContent=e.message;}}
function status(message){const row=doc.getElementById('smartPreview');row.hidden=false;row.textContent=message;}
function submit(event){const target=event.target;if(!(event.type==='keydown'?target.id==='inp'&&event.key==='Enter':target.closest&&target.closest('#addbtn')))return;
 const input=doc.getElementById('inp'),text=rawPaste||input.value;if(!text.trim()||isSchedule(text))return;
 let parsed;try{parsed=plan(text);}catch(e){event.preventDefault();event.stopImmediatePropagation();status(e.message);return;}
 if(parsed.length===1&&!parsed[0].recognized)return;
 event.preventDefault();event.stopImmediatePropagation();if(!ready){status('Still connecting. Your task is kept here.');return;}
 try{
 let tasks=array(sync.get('todo','tasks')),blocks=array(sync.get('timetable','courses'));const now=Date.now();
 parsed.forEach((r,i)=>{const id='smart_'+now.toString(36)+'_'+i+'_'+Math.random().toString(36).slice(2,7);let task;
 if(r.startTime){const built=root.TodoSchedulePaste.build([{id,date:r.dateKey,start:r.startTime,end:r.endTime,startIso:root.TodoSchedulePaste.iso(r.dateKey,r.startTime),endIso:root.TodoSchedulePaste.iso(r.dateKey,r.endTime),minutes:r.duration,title:r.text,priority:r.priority||'none',category:'study',course:(r.text.toUpperCase().match(/\b[A-Z]{2,6}\s*\d{3,4}\b/)||[''])[0],kind:/review|recall/i.test(r.text)?'review':'study'}],tasks,blocks);tasks=built.tasks;blocks=built.blocks;task=tasks[tasks.length-1];}
 else{task={id,text:r.text,done:false,doneAt:null,created:now+i,order:now+i,pri:r.priority,dueKey:r.dateKey,due:null,setKey:day(new Date()),allDay:!!r.dateKey,subs:[],notes:'',smartParsed:true};if(r.duration){task.plannedMinutes=r.duration;task.time=r.duration<=20?'quick':r.duration<=45?'m30':r.duration<=90?'m60':'deep';}tasks.push(task);}
 task.smartParsed=true;if(r.dependency){task.dependsOn=r.dependency.id;task.dependencyText=r.dependency.text;task.plan='After '+r.dependency.text;}if(r.dueTime)task.reminderAt=root.TodoSchedulePaste.iso(r.dateKey,r.dueTime);
 });
 sync.set('todo','tasks',JSON.stringify(tasks));sync.set('timetable','courses',blocks);root.dispatchEvent(new Event('schedule-paste:refresh'));input.value='';rawPaste=null;status('Added '+parsed.length+' task'+(parsed.length===1?'':'s')+'. '+parsed.filter(r=>r.startTime).length+' timed block(s); cloud sync requested.');if(sync.flush)Promise.resolve(sync.flush()).catch(()=>status('Saved locally. Check cloud sync.'));
 }catch(e){status('Could not finish: '+e.message);}
}
function boot(){sync=typeof SyncEngine!=='undefined'?SyncEngine:root.SyncEngine;if(!sync)return;sync.onReady(()=>{ready=true;preview();});let row=doc.getElementById('smartPreview');if(!row){row=doc.createElement('div');row.id='smartPreview';row.setAttribute('role','status');row.style.cssText='font:inherit;font-size:.75rem;line-height:1.5;color:var(--text-secondary);margin-top:8px;overflow-wrap:anywhere';row.hidden=true;(doc.querySelector('.composer')||doc.querySelector('.add')).insertAdjacentElement('afterend',row);}
 root.addEventListener('input',e=>{if(e.target.id==='inp'){rawPaste=null;preview();}},true);
 root.addEventListener('paste',e=>{if(e.target.id!=='inp')return;const s=e.clipboardData?.getData('text/plain');if(!s||isSchedule(s))return;if(entries(s).length>1){e.preventDefault();e.stopImmediatePropagation();rawPaste=s;e.target.value=s.replace(/\s+/g,' ');preview();}},true);
 root.addEventListener('keydown',submit,true);root.addEventListener('click',submit,true);
 if(!root.TodoChrono)import('https://esm.sh/chrono-node@2.8.0/en?bundle').then(c=>{if(typeof c.parse==='function'){root.TodoChrono=c;preview();}}).catch(()=>{});
}
root.TodoNaturalAdd={parse,version:1};if(doc){if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot);else boot();}
})(typeof window!=='undefined'?window:globalThis);
