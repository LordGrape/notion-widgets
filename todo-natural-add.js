/* Natural task entry. Optional Chrono (MIT) enrichment; deterministic offline fallback.
   https://github.com/wanasit/chrono . Task text never leaves the browser for parsing. */
(function(root){
'use strict';if(root.TodoNaturalAdd)return;
const doc=root.document,zone='America/Toronto';let sync,ready=false,rawPaste=null,scheduleSuggestions=false,splitReadingSessions=false;
const pad=n=>String(n).padStart(2,'0');
function wall(instant){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));}
function day(instant){const p=wall(instant);return `${p.year}-${p.month}-${p.day}`;}
function shift(key,n){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function valid(key){const d=new Date(key+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===key;}
function array(v){const a=typeof v==='string'?JSON.parse(v):v||[];if(!Array.isArray(a))throw Error('Existing widget data could not be read.');return JSON.parse(JSON.stringify(a));}
function clock(h,m,s){h=Number(h);m=Number(m||0);if(m>59||h>23||(s&&(h<1||h>12)))throw Error('Use a valid time, such as 6pm or 18:00.');if(s){h%=12;if(s.toLowerCase()==='pm')h+=12;}return pad(h)+':'+pad(m);}
function clean(s){return s.replace(/\s+/g,' ').replace(/^(?:start|begin|schedule|on|at|from)\s+/i,'').replace(/\s+(?:on|at|from|for|by)$/i,'').replace(/^[,;: -]+|[,;: -]+$/g,'').trim();}
const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
function classAliases(block){
 const name=String(block.name||''),parts=name.split(/\s*[:|–—]\s*/).map(clean).filter(Boolean),code=String(block.courseCode||'').match(/\b[A-Z]{2,6}\s*\d{3,4}\b/i)?.[0];
 return [...new Set([name,...parts,code].filter(x=>x&&x.length>2))].sort((a,b)=>b.length-a.length);
}
function extractClassAnchor(work,courses){
 let m=work.match(/\b(after|before)\s+(?:the\s+)?class\b/i);
 if(m)return {index:m.index,length:m[0].length,0:m[0],query:'class',generic:true,relation:m[1].toLowerCase()};
 const found=[];
 (courses||[]).filter(b=>b&&b.category==='class'&&b.eventType!=='break').forEach(block=>classAliases(block).forEach(alias=>{
  const code=alias.match(/^([A-Z]{2,6})\s+(\d{3,4})$/i),escaped=code?code[1]+'\\s*'+code[2]:alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),rx=new RegExp('\\b(after|before)\\s+(?:the\\s+)?('+escaped+')(?=$|[\\s,;.!?])','i'),hit=rx.exec(work);
  if(hit)found.push({index:hit.index,length:hit[0].length,0:hit[0],query:hit[2],blockId:block.id,alias,relation:hit[1].toLowerCase()});
 }));
 if(!found.length){const code=work.match(/\b(after|before)\s+(?:the\s+)?([A-Z]{2,6}\s*\d{3,4})(?=$|[\s,;.!?])/i);return code?{index:code.index,length:code[0].length,0:code[0],query:code[2],blockId:null,alias:code[2],relation:code[1].toLowerCase()}:null;}
 found.sort((a,b)=>b.alias.length-a.alias.length);
 const longest=found[0].alias.length,top=found.filter(x=>x.alias.length===longest),blocks=[...new Set(top.map(x=>x.blockId))];
 return blocks.length===1?top[0]:{...top[0],ambiguous:true};
}
function activeOn(block,key){return(!block.startDate||key>=block.startDate)&&(!block.endDate||key<=block.endDate)}
function occurrencesOn(blocks,key){
 const weekday=new Date(key+'T12:00:00Z').getUTCDay(),out=[];
 (blocks||[]).forEach(block=>{
  if(!block||!Array.isArray(block.days))return;
  const overrides=Array.isArray(block.overrides)?block.overrides:[],direct=overrides.find(o=>o.sourceDate===key);
  if(direct){
   if(!direct.skipped&&direct.date===key&&activeOn(block,key)){const entry=block.days.find(d=>+d.day===weekday);if(entry)out.push({id:block.id,name:block.name,category:block.category,eventType:block.eventType,start:direct.start||entry.start,end:direct.end||entry.end,sourceDate:key});}
  }else if(activeOn(block,key)){
   const entry=block.days.find(d=>+d.day===weekday);if(entry)out.push({id:block.id,name:block.name,category:block.category,eventType:block.eventType,start:entry.start,end:entry.end,sourceDate:key});
  }
  overrides.filter(o=>o.date===key&&o.sourceDate!==key&&!o.skipped&&activeOn(block,o.sourceDate)).forEach(o=>{
   const sourceDay=new Date(o.sourceDate+'T12:00:00Z').getUTCDay(),entry=block.days.find(d=>+d.day===sourceDay);if(entry)out.push({id:block.id,name:block.name,category:block.category,eventType:block.eventType,start:o.start||entry.start,end:o.end||entry.end,sourceDate:o.sourceDate});
  });
 });
 return out;
}
function resolveClassAnchor(anchor,key,now,courses){
 if(anchor.ambiguous)throw Error('More than one class matches “'+anchor.query+'”. Use its course code or full title.');
 let choices=occurrencesOn(courses,key).filter(e=>e.category==='class'&&e.eventType!=='break');
 if(!anchor.generic)choices=choices.filter(e=>anchor.blockId&&e.id===anchor.blockId);
 if(key===day(now)){const current=wall(now),currentMinute=Number(current.hour)*60+Number(current.minute);choices=choices.filter(e=>minute(e.end)>currentMinute);}
 if(!choices.length)throw Error(anchor.generic?'No upcoming class was found for '+key+'.':'No upcoming “'+anchor.query+'” class was found for '+key+'.');
 if(choices.length>1)throw Error(anchor.generic?'More than one class is upcoming. Add its course code or title.':'More than one “'+anchor.query+'” class is scheduled. Add the date or more of its title.');
 return choices[0];
}
function findConflict(key,start,end,courses,tasks,anchor){
 const sm=minute(start),em=minute(end);
 for(const event of occurrencesOn(courses,key)){
  if(anchor&&event.id===anchor.id&&event.sourceDate===anchor.sourceDate)continue;
  if(sm<minute(event.end)&&em>minute(event.start))return event.name||'another calendar block';
 }
 for(const task of tasks||[]){
  if(!task.scheduledStart||!task.scheduledEnd)continue;
  const a=wall(new Date(task.scheduledStart)),b=wall(new Date(task.scheduledEnd));
  if(a.year+'-'+a.month+'-'+a.day!==key||b.year+'-'+b.month+'-'+b.day!==key)continue;
  if(sm<Number(b.hour)*60+Number(b.minute)&&em>Number(a.hour)*60+Number(a.minute))return task.text||'another task';
 }
 return '';
}
function nextRepeatKey(rule,afterKey){
 const step=new Date(afterKey+'T12:00:00Z'),base=new Date((rule.anchorDate||afterKey)+'T12:00:00Z');step.setUTCDate(step.getUTCDate()+1);
 for(let i=0;i<370;i++,step.setUTCDate(step.getUTCDate()+1)){
  const key=step.toISOString().slice(0,10),weekday=step.getUTCDay();if(rule.days&&!rule.days.includes(weekday))continue;
  if(rule.frequency==='weekly'&&rule.interval>1){const dayDiff=Math.floor((Date.UTC(step.getUTCFullYear(),step.getUTCMonth(),step.getUTCDate())-Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate()))/86400000),week=Math.floor(dayDiff/7);if(week%rule.interval!==0)continue;}else if(rule.frequency==='daily'&&rule.interval>1){const diff=Math.floor((Date.UTC(step.getUTCFullYear(),step.getUTCMonth(),step.getUTCDate())-Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate()))/86400000);if(diff%rule.interval!==0)continue;}
  return key;
 }
 return null;
}
function firstRepeatKey(rule,fromKey){
 const date=new Date(fromKey+'T12:00:00Z'),base=new Date((rule.anchorDate||fromKey)+'T12:00:00Z');
 for(let i=0;i<370;i++,date.setUTCDate(date.getUTCDate()+1)){
  const key=date.toISOString().slice(0,10),weekday=date.getUTCDay();if(rule.days&&!rule.days.includes(weekday))continue;
  if(rule.frequency==='weekly'&&rule.interval>1){const diff=Math.floor((Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate()))/86400000);if(Math.floor(diff/7)%rule.interval!==0)continue;}else if(rule.frequency==='daily'&&rule.interval>1){const diff=Math.floor((Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate()))/86400000);if(diff%rule.interval!==0)continue;}
  return key;
 }
 return fromKey;
}
function freeSlot(key,duration,courses,tasks,event,relation,now=new Date(),latest){
 if(!duration||duration>720)return null;const busy=occurrencesOn(courses,key).map(e=>({start:minute(e.start),end:minute(e.end)}));
 (tasks||[]).forEach(t=>{if(!t.scheduledStart||!t.scheduledEnd)return;const a=wall(new Date(t.scheduledStart)),b=wall(new Date(t.scheduledEnd));if(a.year+'-'+a.month+'-'+a.day===key&&b.year+'-'+b.month+'-'+b.day===key)busy.push({start:Number(a.hour)*60+Number(a.minute),end:Number(b.hour)*60+Number(b.minute)});});
 const nowParts=wall(now),today=nowParts.year+'-'+nowParts.month+'-'+nowParts.day;let low=key===today?Math.max(480,Math.ceil((Number(nowParts.hour)*60+Number(nowParts.minute))/15)*15):480,high=Math.min(1260,Number(latest)||1260);
 if(event&&relation==='before')high=Math.min(high,minute(event.start));if(event&&relation==='after')low=Math.max(low,minute(event.end));
 if(relation==='before'){for(let start=Math.floor((high-duration)/15)*15;start>=low;start-=15)if(!busy.some(e=>start<e.end&&start+duration>e.start))return pad(Math.floor(start/60))+':'+pad(start%60);}
 else{for(let start=low;start+duration<=high;start+=15)if(!busy.some(e=>start<e.end&&start+duration>e.start))return pad(Math.floor(start/60))+':'+pad(start%60);}
 return null;
}
function learnedPace(tasks){
 try{return root.ReadingEstimates?.learn(tasks,sync&&sync.get('clock','focus_sessions'))||null;}catch(e){return null;}
}
function parse(text,now=new Date(),tasks=[],courses=[]){
 const raw=String(text).trim(),today=day(now);let work=raw;
 const r={text:raw,dateKey:null,startTime:null,endTime:null,duration:null,priority:null,dependency:null,dueTime:null,classAnchor:null,durationDefault:false,conflict:null,recognized:false,labels:[]};
 function take(m){work=work.slice(0,m.index)+' '+work.slice(m.index+m[0].length);r.recognized=true;}
 let m=work.match(/\b(must|urgent|important|should|could)\b(?:\s+do\b)?/i);if(m){r.priority=/must|urgent|important/i.test(m[1])?'must':m[1].toLowerCase();take(m);}
 m=work.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m|hours?|hrs?|hr|h)\b/i);if(m){r.duration=Math.round(Number(m[1])*(/^h/i.test(m[2])?60:1));if(r.duration<1||r.duration>720)throw Error('Use a duration from 1 to 720 minutes.');r.durationSource='explicit';take(m);}
 m=work.match(/\bevery\s+(weekday|weekdays|day|daily|other\s+(?:day|week|weeks|weekday|weekdays|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:s)?(?:\s+and\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))?\b/i);
 if(m){const names={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6},word=m[1].toLowerCase(),other=word.startsWith('other '),baseWord=other?word.slice(6):word,days=/^weekday/.test(baseWord)?[1,2,3,4,5]:/^(?:day|daily)$/.test(baseWord)?[0,1,2,3,4,5,6]:baseWord==='week'&&other?[new Date(today+'T12:00:00Z').getUTCDay()]:[names[baseWord],...(m[2]?[names[m[2].toLowerCase()]]:[])];
  r.recurrence={frequency:other&&baseWord==='day'?'daily':days.length===7?'daily':'weekly',interval:other?2:1,days:[...new Set(days)].sort(),anchorDate:today};r.repeatPhrase=m[0];work=work.slice(0,m.index)+' '+work.slice(m.index+m[0].length);r.recognized=true;}
 const anchor=extractClassAnchor(work,courses);if(anchor){take(anchor);r.classAnchor=anchor;}
 // Explicit dates first, preventing ISO dates or page ranges from becoming clock ranges.
 m=work.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);if(m){r.dateKey=m[1]+'-'+pad(m[2])+'-'+pad(m[3]);if(!valid(r.dateKey))throw Error('That calendar date does not exist.');r.deadlineOnly=/\b(?:by|before|due)\s*$/i.test(work.slice(0,m.index));take(m);}
 if(!r.dateKey){m=work.match(/\b(today|tonight|tomorrow|tmrw|tmr)\b/i);if(m){r.dateKey=/tomorrow|tmrw|tmr/i.test(m[1])?shift(today,1):today;r.deadlineOnly=/\b(?:by|before|due)\s*$/i.test(work.slice(0,m.index));take(m);}}
 if(!r.dateKey){m=work.match(/\bin\s+(\d+)\s+(days?|weeks?)\b/i);if(m){r.dateKey=shift(today,Number(m[1])*(/^week/i.test(m[2])?7:1));take(m);}}
 if(!r.dateKey){m=work.match(/\b(?:(next|this)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i);if(m){const target=['sun','mon','tue','wed','thu','fri','sat'].indexOf(m[2].slice(0,3).toLowerCase());let delta=(target-new Date(today+'T12:00Z').getUTCDay()+7)%7;if(m[1]&&m[1].toLowerCase()==='next')delta+=7;else if(delta===0&&m[1]!=='this')delta=7;r.dateKey=shift(today,delta);r.deadlineOnly=/\b(?:by|before|due)\s*$/i.test(work.slice(0,m.index));take(m);}}
 if(!r.dateKey){m=work.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);if(m){const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].slice(0,3).toLowerCase())+1;let year=m[3]||today.slice(0,4);r.dateKey=year+'-'+pad(month)+'-'+pad(m[2]);if(!valid(r.dateKey))throw Error('That calendar date does not exist.');if(!m[3]&&r.dateKey<today)r.dateKey=(Number(year)+1)+r.dateKey.slice(4);r.deadlineOnly=/\b(?:by|before|due)\s*$/i.test(work.slice(0,m.index));take(m);}}
 r.explicitDate=!!r.dateKey;
 const range=/(?<![\d-])(?:\b(?:from|at|between)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until|through|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
 m=work.match(range);
 if(m&&!/\b(?:pp?\.?|pages?|chapters?|sections?)\s*$/i.test(work.slice(0,m.index))){
 let a=m[3],b=m[6];if(!a&&b)a=Number(m[1])>Number(m[4])?(b.toLowerCase()==='pm'?'am':'pm'):b;if(!b&&a)b=a;
 r.startTime=clock(m[1],m[2],a);r.endTime=clock(m[4],m[5],b);
 if(r.endTime<=r.startTime)throw Error('The end is earlier than the start. Clarify the range with AM/PM; overnight blocks need separate day entries.');
 r.duration=minute(r.endTime)-minute(r.startTime);r.durationSource='explicit';if(r.duration>720)throw Error('That range exceeds 12 hours. Please clarify AM/PM.');take(m);
 }
 if(!r.startTime){m=work.match(/\b(?:before|by)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);if(m){r.dueTime=clock(m[1],m[2],m[3]);take(m);}}
 if(!r.startTime){m=work.match(/(?:@|\bat\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)||work.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);if(m){if(r.deadlineOnly)r.dueTime=clock(m[1],m[2],m[3]);else r.startTime=clock(m[1],m[2],m[3]);take(m);}}
 if(!r.startTime){m=work.match(/\b(noon|midnight)\b/i);if(m){r.startTime=m[1].toLowerCase()==='noon'?'12:00':'00:00';take(m);}}
 // Chrono adds broader expressions (e.g. "in two days") when its pinned module is available.
 if(!r.dateKey&&root.TodoChrono&&typeof root.TodoChrono.parse==='function'){
 const p=wall(now),offset=Math.round((Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(+now/60000)*60000)/60000);
 const results=root.TodoChrono.parse(work,{instant:now,timezone:offset},{forwardDate:true});
 if(results.length===1){const c=results[0],k=c.start.get('year')+'-'+pad(c.start.get('month'))+'-'+pad(c.start.get('day'));if(valid(k)){r.dateKey=k;r.explicitDate=true;if(c.start.isCertain('hour'))r.startTime=clock(c.start.get('hour'),c.start.get('minute'));take({index:c.index,0:c.text});}}
 }
 if(r.classAnchor){if(!r.dateKey)r.dateKey=today;const event=resolveClassAnchor(r.classAnchor,r.dateKey,now,courses);r.classAnchor={id:event.id,name:event.name,sourceDate:event.sourceDate,start:event.start,end:event.end,relation:r.classAnchor.relation||'after'};if(r.classAnchor.relation==='after'&&!r.startTime)r.startTime=event.end;if(!r.duration&&!r.endTime){const learned=learnedPace(tasks),estimate=root.ReadingEstimates?.estimate(clean(work),learned?{pace:learned.pace}:{});if(estimate?.minutes){r.duration=estimate.minutes;r.durationSource='reading';r.splitSuggestions=estimate.splits;if(learned)r.learnedPace=learned;}else{r.duration=60;r.durationDefault=true;}}}
 m=work.match(/\s+after\s+(.+?)\s*$/i)||work.match(/@([A-Za-z][\w' .-]{1,60})\s*$/);if(m){const name=clean(m[1]);const matches=tasks.filter(t=>!t.done&&String(t.text).toLowerCase()===name.toLowerCase());if(matches.length>1)throw Error('More than one task matches that dependency. Use a unique task title.');r.dependency={text:name,id:matches[0]?.id||null};const linked=matches[0];if(!r.startTime&&linked&&linked.scheduledEnd){const p=wall(new Date(linked.scheduledEnd));r.dateKey=`${p.year}-${p.month}-${p.day}`;r.startTime=p.hour+':'+p.minute;}take(m);}
 if(!r.dateKey&&r.recurrence)r.dateKey=firstRepeatKey(r.recurrence,today);
 if(r.recurrence&&r.dateKey){r.recurrence.anchorDate=r.dateKey;r.dateKey=firstRepeatKey(r.recurrence,r.dateKey);}
 if(!r.duration){const learned=learnedPace(tasks),estimate=root.ReadingEstimates?.estimate(clean(work),learned?{pace:learned.pace}:{});if(estimate?.minutes){r.duration=estimate.minutes;r.durationSource='reading';r.splitSuggestions=estimate.splits;if(learned)r.learnedPace=learned;}}
 if(r.startTime||r.dueTime){if(!r.dateKey)r.dateKey=today;}
 if(r.startTime&&!r.endTime){if(!r.duration){r.duration=60;r.durationDefault=!!r.classAnchor;}const end=minute(r.startTime)+r.duration;if(end>=1440)throw Error('This block crosses midnight. Use separate day entries.');r.endTime=pad(Math.floor(end/60))+':'+pad(end%60);}
 if(r.dateKey&&r.duration&&!r.startTime){let slotDate=r.dateKey;if(r.deadlineOnly&&!r.classAnchor){for(let key=today;key<=r.dateKey;key=shift(key,1)){const candidate=freeSlot(key,r.duration,courses,tasks,null,null,now,key===r.dateKey&&r.dueTime?minute(r.dueTime):null);if(candidate){slotDate=key;r.suggestedStart=candidate;break;}}}else r.suggestedStart=freeSlot(slotDate,r.duration,courses,tasks,r.classAnchor&&r.classAnchor.relation==='before'?r.classAnchor:null,r.classAnchor?.relation,now);if(r.suggestedStart){r.suggestedDate=slotDate;r.suggestedEnd=pad(Math.floor((minute(r.suggestedStart)+r.duration)/60))+':'+pad((minute(r.suggestedStart)+r.duration)%60);}}
 r.emptyText=!clean(work);r.text=clean(work)||'Scheduled task';
 if(r.classAnchor&&r.startTime&&r.endTime){r.conflict=findConflict(r.dateKey,r.startTime,r.endTime,courses,tasks,r.classAnchor)||null;if(r.conflict)r.labels.push('Conflicts with '+r.conflict);}
 if(r.dateKey)r.labels.push(r.dateKey);if(r.startTime)r.labels.push(r.startTime+'–'+r.endTime+' ET',r.duration+' min'+(r.durationDefault?' default':''),'Timetable');else if(r.dateKey)r.labels.push(r.dueTime?'Due by '+r.dueTime:r.classAnchor?.relation==='before'?'Before '+r.classAnchor.name:'Date only');
 if(r.classAnchor&&r.classAnchor.relation==='after')r.labels.unshift('After '+r.classAnchor.name);else if(r.classAnchor)r.labels.unshift('Before '+r.classAnchor.name);if(r.duration&&!r.startTime)r.labels.push(r.duration+' min estimate');if(r.learnedPace)r.labels.push('Based on '+r.learnedPace.sampleCount+' completed readings · '+r.learnedPace.pace+' min/page');if(r.suggestedStart)r.labels.push('Suggested '+r.suggestedStart+'–'+r.suggestedEnd);if(r.recurrence)r.labels.push('Repeats '+(r.recurrence.days.length===5&&[1,2,3,4,5].every(d=>r.recurrence.days.includes(d))?'weekdays':r.recurrence.days.map(d=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d]).join(', '))+(r.recurrence.interval===2?' every other week':''));if(r.priority)r.labels.push(r.priority);if(r.dependency)r.labels.push('After '+r.dependency.text+(r.dependency.id?'':' (not linked)'));
 return r;
}
function isSchedule(s){return /20\d{2}-\d{2}-\d{2}\s*\||^\s*(?:```json\s*)?\{/.test(s);}
function entries(text){return String(text).split(/\n+|\s*;\s*/).map(x=>x.replace(/^\s*[-*•]\s+/,'').trim()).filter(Boolean);}
function plan(text){const tasks=array(sync.get('todo','tasks')),courses=array(sync.get('timetable','courses'));let carry=null;return entries(text).map(s=>{let r=parse(s,new Date(),tasks,courses);if(carry&&!r.explicitDate)r=parse(carry+' '+s,new Date(),tasks,courses);if(r.dateKey)carry=r.dateKey;return r;});}
function preview(){const input=doc.getElementById('inp'),row=doc.getElementById('smartPreview');if(!input||!row||!sync)return;const text=rawPaste||input.value;if(!text.trim()||isSchedule(text)){row.textContent='';row.hidden=true;return}try{const parsed=plan(text);row.textContent=parsed.map(r=>r.labels.join(' · ')).filter(Boolean).join(' | ');const suggestions=parsed.filter(r=>r.suggestedStart&&!r.startTime),splittable=parsed.filter(r=>r.splitSuggestions?.length);if(suggestions.length){const button=doc.createElement('button');button.type='button';button.className='smart-action capture-schedule';button.textContent=suggestions.length===1?'Schedule at '+suggestions[0].suggestedStart+' on '+suggestions[0].suggestedDate:'Schedule at suggested times';button.addEventListener('click',()=>{try{capture(text,{scheduleSuggestions:true});}catch(e){status(e.message);}});row.append(' ',button);}if(splittable.length===1&&parsed.length===1){const button=doc.createElement('button');button.type='button';button.className='smart-action capture-schedule';button.textContent='Create '+splittable[0].splitSuggestions.length+' page-based study sessions';button.addEventListener('click',()=>{try{capture(text,{splitReadingSessions:true});}catch(e){status(e.message);}});row.append(' ',button);}row.hidden=!row.textContent;}catch(e){row.hidden=false;row.textContent=e.message;}}
function status(message){const row=doc.getElementById('smartPreview');row.hidden=false;row.textContent=message;}
function submit(event){const target=event.target;if(!(event.type==='keydown'?target.id==='inp'&&event.key==='Enter':target.closest&&target.closest('#addbtn')))return;
 const input=doc.getElementById('inp'),text=rawPaste||input.value;if(!text.trim()||isSchedule(text))return;
 let parsed;try{parsed=plan(text);if(splitReadingSessions)parsed=parsed.flatMap(r=>r.splitSuggestions?.length?r.splitSuggestions.map((s,index)=>({...r,text:s.text,duration:s.minutes,durationSource:'reading',splitSession:index+1,splitParent:r.text,startTime:null,endTime:null,suggestedStart:null})):r);if(scheduleSuggestions)parsed.forEach(r=>{if(r.suggestedStart&&!r.startTime){r.scheduleDate=r.suggestedDate||r.dateKey;r.startTime=r.suggestedStart;r.endTime=r.suggestedEnd;r.acceptedSuggestion=true;}});if(parsed.some(r=>r.emptyText))throw Error('Add a task after the priority or date.');if(parsed.some(r=>r.conflict))throw Error('This time conflicts with '+parsed.find(r=>r.conflict).conflict+'. Choose another time.');}catch(e){event.preventDefault();event.stopImmediatePropagation();status(e.message);scheduleSuggestions=false;splitReadingSessions=false;return;}
 if(parsed.length===1&&!parsed[0].recognized)return;
 event.preventDefault();event.stopImmediatePropagation();if(!ready){status('Still connecting. Your task is kept here.');return;}
 try{
 let tasks=array(sync.get('todo','tasks')),blocks=array(sync.get('timetable','courses'));const now=Date.now();
 parsed.forEach((r,i)=>{const id='smart_'+now.toString(36)+'_'+i+'_'+Math.random().toString(36).slice(2,7);let task;
 if(r.startTime){const scheduleDate=r.scheduleDate||r.dateKey,built=root.TodoSchedulePaste.build([{id,date:scheduleDate,start:r.startTime,end:r.endTime,startIso:root.TodoSchedulePaste.iso(scheduleDate,r.startTime),endIso:root.TodoSchedulePaste.iso(scheduleDate,r.endTime),minutes:r.duration,title:r.text,priority:r.priority||'none',category:'study',course:(r.text.toUpperCase().match(/\b[A-Z]{2,6}\s*\d{3,4}\b/)||[''])[0],kind:/review|recall/i.test(r.text)?'review':'study'}],tasks,blocks);tasks=built.tasks;blocks=built.blocks;task=tasks[tasks.length-1];if(r.deadlineOnly){task.dueKey=r.dateKey;task.due=r.dateKey===day(new Date())?'today':null;}}
 else{task={id,text:r.text,done:false,doneAt:null,created:now+i,order:now+i,pri:r.priority,dueKey:r.dateKey,due:null,setKey:day(new Date()),allDay:!!r.dateKey,subs:[],notes:'',smartParsed:true};if(r.duration){task.plannedMinutes=r.duration;task.time=r.durationSource==='reading'?null:r.duration<=20?'quick':r.duration<=45?'m30':r.duration<=90?'m60':'deep';}if(r.recurrence)task.repeatRule=r.recurrence;if(r.splitSession){task.sessionParentText=r.splitParent;task.sessionNumber=r.splitSession;task.sessionCount=parsed.filter(x=>x.splitParent===r.splitParent).length;}tasks.push(task);}
 if(r.durationSource==='reading'){task.time=null;task.reading={...(task.reading||{}),autoMinutes:r.duration,manual:false};}else if(r.durationSource==='explicit')task.reading={...(task.reading||{}),manual:true};if(root.ReadingEstimates)root.ReadingEstimates.apply(task);task.smartParsed=true;if(r.recurrence)task.repeatRule=r.recurrence;if(r.dependency){task.dependsOn=r.dependency.id;task.dependencyText=r.dependency.text;}if(r.dueTime)task.reminderAt=root.TodoSchedulePaste.iso(r.dateKey,r.dueTime);
 });
 sync.set('todo','tasks',JSON.stringify(tasks));sync.set('timetable','courses',blocks);root.dispatchEvent(new Event('schedule-paste:refresh'));input.value='';rawPaste=null;scheduleSuggestions=false;splitReadingSessions=false;status('Added '+parsed.length+' task'+(parsed.length===1?'':'s')+'. '+parsed.filter(r=>r.startTime).length+' timed block(s); cloud sync requested.');if(sync.flush)Promise.resolve(sync.flush()).catch(()=>status('Saved locally. Check cloud sync.'));
 }catch(e){status('Could not finish: '+e.message);}
}
function boot(){sync=typeof SyncEngine!=='undefined'?SyncEngine:root.SyncEngine;if(!sync)return;sync.onReady(()=>{ready=true;preview();});let row=doc.getElementById('smartPreview');if(!row){row=doc.createElement('div');row.id='smartPreview';row.setAttribute('role','status');row.style.cssText='font:inherit;font-size:.75rem;line-height:1.5;color:var(--text-secondary);margin-top:8px;overflow-wrap:anywhere';row.hidden=true;(doc.querySelector('.composer')||doc.querySelector('.add')).insertAdjacentElement('afterend',row);}
 root.addEventListener('input',e=>{if(e.target.id==='inp'){rawPaste=null;preview();}},true);
 root.addEventListener('paste',e=>{if(e.target.id!=='inp')return;const s=e.clipboardData?.getData('text/plain');if(!s||isSchedule(s))return;if(entries(s).length>1){e.preventDefault();e.stopImmediatePropagation();rawPaste=s;e.target.value=s.replace(/\s+/g,' ');preview();}},true);
 root.addEventListener('keydown',submit,true);root.addEventListener('click',submit,true);
 if(!root.TodoChrono)import('https://esm.sh/chrono-node@2.8.0/en?bundle').then(c=>{if(typeof c.parse==='function'){root.TodoChrono=c;preview();}}).catch(()=>{});
}
// Command Centre submits through this same composer and its existing handlers.
function capture(text,options={}){
 if(!ready)throw Error('Still connecting. Your task is kept here.');
 const existing=new Set(array(sync.get('todo','tasks')).map(t=>t.id));
 const input=doc.getElementById('inp');
 rawPaste=null;scheduleSuggestions=!!options.scheduleSuggestions;splitReadingSessions=!!options.splitReadingSessions;input.value=String(text);input.dispatchEvent(new root.Event('input',{bubbles:true}));
 if(entries(text).length>1&&!isSchedule(text))rawPaste=String(text);
 doc.getElementById('addbtn').click();
 if(input.value.trim())throw Error(doc.getElementById('smartPreview')?.textContent||'Task could not be added.');
 scheduleSuggestions=false;splitReadingSessions=false;return array(sync.get('todo','tasks')).filter(t=>!existing.has(t.id)).map(t=>t.id);
}
root.TodoNaturalAdd={parse,plan,capture,nextRepeatKey,version:2};if(doc){if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot);else boot();}
})(typeof window!=='undefined'?window:globalThis);
