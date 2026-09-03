import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(source,oldStr,newStr,label){
  const count=source.split(oldStr).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(oldStr,newStr);
}
function replaceCount(source,oldStr,newStr,expected,label){
  const count=source.split(oldStr).length-1;
  if(count!==expected)throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return source.split(oldStr).join(newStr);
}

let action=read('action-blocks.js');
if(!action.includes('ADAPTIVE WEEKLY TARGETS v1')){
  action=replaceOnce(action,'/* CLEAR SCHEDULE LANGUAGE v1','/* ADAPTIVE WEEKLY TARGETS v1 */\n/* CLEAR SCHEDULE LANGUAGE v1','Action target marker');
  action=replaceOnce(action,"if(Object.prototype.hasOwnProperty.call(value,'location'))value.location=String(value.location||'');return value","if(Object.prototype.hasOwnProperty.call(value,'location'))value.location=String(value.location||'');if(Object.prototype.hasOwnProperty.call(value,'outcomeGoal'))value.outcomeGoal=String(value.outcomeGoal||'').trim();return value",'Override target normalization');
  action=replaceOnce(action,"result.push({day:day,start:direct&&direct.start||entry.start,end:direct&&direct.end||entry.end,location:direct&&Object.prototype.hasOwnProperty.call(direct,'location')?direct.location:(entry.location||block.location||''),sourceDate:key})","result.push({day:day,start:direct&&direct.start||entry.start,end:direct&&direct.end||entry.end,location:direct&&Object.prototype.hasOwnProperty.call(direct,'location')?direct.location:(entry.location||block.location||''),outcomeGoal:direct&&Object.prototype.hasOwnProperty.call(direct,'outcomeGoal')?direct.outcomeGoal:(block.outcomeGoal||''),sourceDate:key})",'Direct occurrence target');
  action=replaceOnce(action,"result.push({day:day,start:o.start||entry.start,end:o.end||entry.end,location:Object.prototype.hasOwnProperty.call(o,'location')?o.location:(entry.location||block.location||''),sourceDate:o.sourceDate})","result.push({day:day,start:o.start||entry.start,end:o.end||entry.end,location:Object.prototype.hasOwnProperty.call(o,'location')?o.location:(entry.location||block.location||''),outcomeGoal:Object.prototype.hasOwnProperty.call(o,'outcomeGoal')?o.outcomeGoal:(block.outcomeGoal||''),sourceDate:o.sourceDate})",'Moved occurrence target');
  action=replaceCount(action,"outcomeGoal:block.outcomeGoal||''","outcomeGoal:entry.outcomeGoal||''",2,'Materialized occurrence targets');
  action=replaceOnce(action,"['startDate','endDate','outcomeGoal'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(old,k))out[k]=old[k]});","['startDate','endDate','outcomeGoal'].forEach(function(k){if(!Object.prototype.hasOwnProperty.call(block,k)&&Object.prototype.hasOwnProperty.call(old,k))out[k]=old[k]});",'Incoming metadata preservation');
  action=replaceOnce(action,"if(Array.isArray(old.overrides))out.overrides=old.overrides.slice()","if(Array.isArray(block.overrides))out.overrides=block.overrides.slice();else if(Array.isArray(old.overrides))out.overrides=old.overrides.slice()",'Incoming occurrence overrides');
  action=replaceOnce(action,'>Finish line</label><input','>Default target</label><input','Default target label');
  action=replaceOnce(action,String.raw`placeholder=\"Optional, e.g. brief cases 4–6\"`,String.raw`placeholder=\"Optional fallback\"`,'Default target placeholder');
  action=replaceOnce(action,'The specific result you want finished. It appears on the to-do.',"Leave blank if it changes. Set each session under This week's targets.",'Default target explanation');
  action=replaceOnce(action,String.raw`class=\"ab-plan-help\">Leave blank if it changes.`,String.raw`class=\"ab-plan-help\" id=\"fOutcomeHelp\">Leave blank if it changes.`,'Default target helper id');
  action=replaceOnce(action,"outcome=document.getElementById('fOutcome'),startDate=","outcome=document.getElementById('fOutcome'),outcomeHelp=document.getElementById('fOutcomeHelp'),startDate=",'Default target helper reference');
  action=replaceOnce(action,
    "function paintTrack(){var locked=cat.value==='class';if(locked)track.checked=false;track.disabled=locked;trackLabel.classList.toggle('is-disabled',locked);trackLabel.setAttribute('aria-disabled',locked?'true':'false');trackTitle.textContent=locked?'Schedule only':'Add to to-do';trackHint.textContent=locked?'Classes never create tasks.':(track.checked?'Fresh task on every selected day.':'No tasks are created.')}",
    "function paintTrack(){var locked=cat.value==='class';if(locked)track.checked=false;track.disabled=locked;trackLabel.classList.toggle('is-disabled',locked);trackLabel.setAttribute('aria-disabled',locked?'true':'false');trackTitle.textContent=locked?'Schedule only':'Add to to-do';trackHint.textContent=locked?'Classes never create tasks.':(track.checked?'Fresh task on every selected day.':'No tasks are created.');if(outcome){outcome.disabled=locked;outcome.placeholder=locked?'Not used for classes':'Optional fallback'}if(outcomeHelp)outcomeHelp.textContent=locked?'Classes stay schedule-only and do not create task targets.':\"Leave blank if it changes. Set each session under This week's targets.\"}",
    'Class-aware target copy'
  );
  action=replaceOnce(action,"t.outcomeGoal?('Finish line: '+t.outcomeGoal)","t.outcomeGoal?('Target: '+t.outcomeGoal)",'Notion target label');
}
write('action-blocks.js',action);

let timetable=read('timetable.html');
if(!timetable.includes('ADAPTIVE WEEKLY TARGETS v1')){
  timetable=replaceOnce(timetable,'/* MONDAY-FIRST EDITOR ORDER v1 */','/* MONDAY-FIRST EDITOR ORDER v1 */\n/* ADAPTIVE WEEKLY TARGETS v1 */','Timetable target marker');
  timetable=replaceOnce(timetable,'@media (max-width:400px){',`.occ-target{margin-top:8px}.occ-help{margin-top:4px;font-size:8px;line-height:1.35;color:var(--text-3)}
.week-target-body{display:flex;flex-direction:column;gap:7px;padding:0 10px 10px;border-top:1px solid var(--line)}.week-target-intro{padding:9px 2px 1px;font-size:8.5px;line-height:1.45;color:var(--text-3)}.week-target-row{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:11px;background:color-mix(in srgb,var(--bg) 45%,transparent)}.week-target-copy{min-width:0}.week-target-copy b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.week-target-copy small{display:block;margin-top:2px;font-size:7.8px;color:var(--text-3)}.week-target-row input{padding:8px 9px;font-size:10px}.week-target-empty{padding:11px 2px 2px;font-size:8.5px;color:var(--text-3)}
@media(max-width:370px){.week-target-row{grid-template-columns:1fr}}

@media (max-width:400px){`,'Weekly target styles');
  timetable=replaceOnce(timetable,'    </details>\n    <div class="saved" id="saved"></div>','    </details>\n    <details class="preferences week-targets" id="weekTargets">\n      <summary>This week\'s targets</summary>\n      <div class="week-target-body" id="weekTargetList"></div>\n    </details>\n    <div class="saved" id="saved"></div>','Weekly target panel');
  timetable=replaceOnce(timetable,
    "  if(Array.isArray(source&&source.overrides))block.overrides=source.overrides.filter(function(o){return o&&/^\\d{4}-\\d{2}-\\d{2}$/.test(String(o.sourceDate||''))}).map(function(o){return{sourceDate:String(o.sourceDate),date:/^\\d{4}-\\d{2}-\\d{2}$/.test(String(o.date||''))?String(o.date):String(o.sourceDate),start:o.start||'',end:o.end||'',location:hasOwn(o,'location')?clean(o.location):'',skipped:!!o.skipped}});",
    "  if(Array.isArray(source&&source.overrides))block.overrides=source.overrides.filter(function(o){return o&&/^\\d{4}-\\d{2}-\\d{2}$/.test(String(o.sourceDate||''))}).map(function(o){var item={sourceDate:String(o.sourceDate),date:/^\\d{4}-\\d{2}-\\d{2}$/.test(String(o.date||''))?String(o.date):String(o.sourceDate),skipped:!!o.skipped};if(o.start)item.start=String(o.start);if(o.end)item.end=String(o.end);if(hasOwn(o,'location'))item.location=clean(o.location);if(hasOwn(o,'outcomeGoal'))item.outcomeGoal=String(o.outcomeGoal||'').trim();return item});",
    'Partial occurrence target persistence'
  );
  timetable=replaceOnce(timetable,
    "function makeOccurrence(block,entry,key,sourceKey,override){return{id:block.id,name:block.name,description:block.description,location:override&&hasOwn(override,'location')?clean(override.location):clean(entry.location||block.location),color:block.color,day:parseScheduleDate(key).getDay(),start:override&&override.start||entry.start,end:override&&override.end||entry.end,dateKey:key,sourceDate:sourceKey}}",
    "function makeOccurrence(block,entry,key,sourceKey,override){var target=override&&hasOwn(override,'outcomeGoal')?String(override.outcomeGoal||''):String(block.outcomeGoal||'');return{id:block.id,name:block.name,description:block.description,location:override&&hasOwn(override,'location')?clean(override.location):clean(entry.location||block.location),color:block.color,category:block.category||'',trackCompletion:!!block.trackCompletion,outcomeGoal:target,day:parseScheduleDate(key).getDay(),start:override&&override.start||entry.start,end:override&&override.end||entry.end,dateKey:key,sourceDate:sourceKey}}",
    'Occurrence target view model'
  );
  timetable=replaceOnce(timetable,String.raw`+(item.location?'<div class=\"tip-detail\">'+esc(item.location)+'</div>':'')+(item.description?'<div class=\"tip-detail\">'+esc(item.description)+'</div>':'');`,String.raw`+(item.location?'<div class=\"tip-detail\">'+esc(item.location)+'</div>':'')+(item.outcomeGoal?'<div class=\"tip-detail\"><b>Target</b> · '+esc(item.outcomeGoal)+'</div>':'')+(item.description?'<div class=\"tip-detail\">'+esc(item.description)+'</div>':'');`,'Week tooltip target');
  timetable=replaceOnce(timetable,String.raw`+(c.description?'<span class=\"d-item\">'+esc(c.description)+'</span>':'')`,String.raw`+(c.outcomeGoal?'<span class=\"d-item\">Target <b>'+esc(c.outcomeGoal)+'</b></span>':'')
      +(c.description?'<span class=\"d-item\">'+esc(c.description)+'</span>':'')`,'Day card target');
  timetable=replaceOnce(timetable,'  drawSaved();drawForm();drawSettings();','  drawSaved();drawForm();drawSettings();drawWeeklyTargets();','Panel target rendering');
  timetable=replaceCount(timetable,"if($('overlay')&&$('overlay').classList.contains('show')){drawSaved();drawForm()}","if($('overlay')&&$('overlay').classList.contains('show')){drawSaved();drawForm();drawWeeklyTargets()}",2,'Preference target redraws');
  timetable=replaceOnce(timetable,"function writeOccurrenceOverride(block,sourceDate,value){block.overrides=(Array.isArray(block.overrides)?block.overrides:[]).filter(function(o){return o.sourceDate!==sourceDate});if(value)block.overrides.push(value);saveBlocks(schedule.slice());render();drawSaved()}","function writeOccurrenceOverride(block,sourceDate,value){block.overrides=(Array.isArray(block.overrides)?block.overrides:[]).filter(function(o){return o.sourceDate!==sourceDate});if(value)block.overrides.push(value);saveBlocks(schedule.slice());render();drawSaved();drawWeeklyTargets()}",'Occurrence target redraw');
  timetable=replaceOnce(timetable,'function openOccurrence(id,sourceDate){',`function actionableOccurrence(item){return !!(item&&item.trackCompletion&&item.category!=='class')}
function setOccurrenceTarget(id,sourceDate,value){var block=schedule.find(function(x){return x.id===id});if(!block)return;var current=(block.overrides||[]).find(function(o){return o.sourceDate===sourceDate}),next=current?Object.assign({},current):{sourceDate:sourceDate,date:sourceDate,skipped:false};next.sourceDate=sourceDate;if(!next.date)next.date=sourceDate;next.skipped=false;next.outcomeGoal=String(value||'').trim();writeOccurrenceOverride(block,sourceDate,next)}
function drawWeeklyTargets(){
  var host=$('weekTargetList');if(!host)return;var items=allFlat().filter(actionableOccurrence);
  if(!items.length){host.innerHTML='<div class="week-target-empty">No study or training tasks are scheduled this week.</div>';return}
  host.innerHTML='<div class="week-target-intro">The activity repeats. Only the target for each dated session changes.</div>'+items.map(function(item){var label=parseScheduleDate(item.dateKey).toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'});return'<label class="week-target-row"><span class="week-target-copy"><b>'+esc(item.name)+'</b><small>'+esc(label)+' · '+fmt(item.start)+'</small></span><input class="f-input" data-target-id="'+esc(item.id)+'" data-target-source="'+esc(item.sourceDate)+'" value="'+esc(item.outcomeGoal||'')+'" placeholder="What should be finished?" aria-label="Target for '+esc(item.name)+' on '+esc(label)+'"></label>'}).join('');
  host.querySelectorAll('[data-target-id]').forEach(function(input){input.addEventListener('change',function(){setOccurrenceTarget(input.dataset.targetId,input.dataset.targetSource,input.value)})})
}
function openOccurrence(id,sourceDate){`,'Weekly target logic');
  timetable=replaceOnce(timetable,
    "  var current=(block.overrides||[]).find(function(o){return o.sourceDate===sourceDate}),date=current&&!current.skipped?current.date:sourceDate,start=current&&!current.skipped&&current.start||entry.start,end=current&&!current.skipped&&current.end||entry.end,location=current&&!current.skipped&&hasOwn(current,'location')?current.location:clean(entry.location||block.location);",
    "  var current=(block.overrides||[]).find(function(o){return o.sourceDate===sourceDate}),date=current&&!current.skipped?current.date:sourceDate,start=current&&!current.skipped&&current.start||entry.start,end=current&&!current.skipped&&current.end||entry.end,location=current&&!current.skipped&&hasOwn(current,'location')?current.location:clean(entry.location||block.location),target=current&&hasOwn(current,'outcomeGoal')?current.outcomeGoal:String(block.outcomeGoal||''),actionable=!!(block.trackCompletion&&block.category!=='class');",
    'Session target state'
  );
  timetable=replaceOnce(timetable,String.raw`placeholder=\"Optional\"></div><div class=\"occ-warning\" id=\"occWarning\">`,String.raw`placeholder=\"Optional\"></div>'+(actionable?'<div class=\"occ-target\"><label class=\"f-label\">Session target</label><input class=\"f-input\" id=\"occTarget\" value=\"'+esc(target)+'\" placeholder=\"e.g. Brief cases 4–6\"><div class=\"occ-help\">Only this dated task changes. The weekly activity stays the same.</div></div>':'')+'<div class=\"occ-warning\" id=\"occWarning\">`,'Session target field');
  timetable=replaceOnce(timetable,"locI=overlay.querySelector('#occLocation'),warning=overlay.querySelector('#occWarning');","locI=overlay.querySelector('#occLocation'),targetI=overlay.querySelector('#occTarget'),warning=overlay.querySelector('#occWarning');",'Session target input reference');
  timetable=replaceOnce(timetable,'[dateI,startI,endI,locI].forEach(function(input){input.addEventListener(\'input\',check)});','[dateI,startI,endI,locI,targetI].filter(Boolean).forEach(function(input){input.addEventListener(\'input\',check)});','Session target listener');
  timetable=replaceOnce(timetable,"writeOccurrenceOverride(block,sourceDate,{sourceDate:sourceDate,date:dateI.value,start:startI.value,end:endI.value,location:locI.value.trim(),skipped:false});close()","var next={sourceDate:sourceDate,date:dateI.value,start:startI.value,end:endI.value,location:locI.value.trim(),skipped:false};if(targetI)next.outcomeGoal=targetI.value.trim();else if(current&&hasOwn(current,'outcomeGoal'))next.outcomeGoal=current.outcomeGoal;writeOccurrenceOverride(block,sourceDate,next);close()",'Session target save');
  timetable=replaceOnce(timetable,'saveBlocks(copy);render();drawSaved();sfx(\'start\')','saveBlocks(copy);render();drawSaved();drawWeeklyTargets();sfx(\'start\')','Restored targets');
  timetable=replaceOnce(timetable,'    drawSaved();render();','    drawSaved();drawWeeklyTargets();render();','Deleted target redraw');
  timetable=replaceOnce(timetable,'  drawSaved();drawForm();render();','  drawSaved();drawForm();drawWeeklyTargets();render();','Saved target redraw');
  timetable=replaceOnce(timetable,'schedule=writeLocalSnapshot(next,false);render();drawSaved()','schedule=writeLocalSnapshot(next,false);render();drawSaved();drawWeeklyTargets()','Synced target redraw');
  timetable=replaceOnce(timetable,'  render();drawSettings();updateStorageStatus();','  render();drawSettings();drawWeeklyTargets();updateStorageStatus();','Initial target rendering');
}
timetable=timetable.replaceAll('action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2','action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2&targets=20260903-v1');
write('timetable.html',timetable);

let todo=read('todo.html');
if(!todo.includes('ADAPTIVE WEEKLY TARGETS v1')){
  todo=replaceOnce(todo,'/* CLEAR FINISH LINE LANGUAGE v1 */','/* CLEAR FINISH LINE LANGUAGE v1 */\n/* ADAPTIVE WEEKLY TARGETS v1 */','To-do target marker');
  todo=replaceOnce(todo,'Finish line (optional)','Target for this task (optional)','Task target placeholder');
  const aria=/aria-label=\\?"Finish line\\?"/g;
  const ariaMatches=todo.match(aria)||[];
  if(ariaMatches.length!==1)throw new Error(`Task target aria label: expected one match, found ${ariaMatches.length}`);
  todo=todo.replace(aria,'aria-label=\\"Task target\\"');
  todo=replaceOnce(todo,'>Finish</span>','>Target</span>','Task target card label');
  todo=replaceOnce(todo,'  /* Timebox bridge defaults to one occurrence. Weekly repetition must be explicit. */',`  function syncTargetToSchedule(t,value){
    if(!t||t.source!=='timetable'||!t.scheduleId)return;var source=t.sourceDate||t.dueKey;if(!source)return;var courses=[];
    try{courses=SyncEngine.get('timetable','courses')||[];if(typeof courses==='string')courses=JSON.parse(courses);if(!Array.isArray(courses))return}catch(e){return}
    var block=courses.find(function(x){return x&&x.id===t.scheduleId});if(!block)return;block.overrides=Array.isArray(block.overrides)?block.overrides:[];var current=block.overrides.find(function(o){return o&&o.sourceDate===source}),next=current?Object.assign({},current):{sourceDate:source,date:t.dueKey||source,skipped:false};next.sourceDate=source;if(!next.date)next.date=t.dueKey||source;next.outcomeGoal=String(value||'').trim();block.overrides=block.overrides.filter(function(o){return !o||o.sourceDate!==source});block.overrides.push(next);try{SyncEngine.set('timetable','courses',courses)}catch(e){}
  }

  /* Timebox bridge defaults to one occurrence. Weekly repetition must be explicit. */`,'To-do target sync helper');
  todo=replaceOnce(todo,'trackCompletion:false,outcomeGoal:t.outcomeGoal||""};if(repeat!=="weekly"){','trackCompletion:false,outcomeGoal:repeat==="weekly"?"":(t.outcomeGoal||"")};if(repeat==="weekly"&&t.outcomeGoal){block.overrides=[{sourceDate:dateKeyValue,date:dateKeyValue,start:start,end:end,location:"",skipped:false,outcomeGoal:t.outcomeGoal}]}if(repeat!=="weekly"){','Adaptive timebox target');
  todo=replaceOnce(todo,'outcomeI.addEventListener("blur", function () { t.outcomeGoal = this.value.trim(); save(); });','outcomeI.addEventListener("blur", function () { var value=this.value.trim();t.outcomeGoal=value;save();syncTargetToSchedule(t,value); });','To-do occurrence target sync');
}
todo=todo.replaceAll('action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2','action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2&targets=20260903-v1');
write('todo.html',todo);

let clearTest=read('tools/test-clear-schedule-language-v1.mjs');
if(!clearTest.includes('adaptive target terminology')){
  clearTest=replaceOnce(clearTest,"assert.ok(action.includes('Finish line'),'planning field should use concrete language');","assert.ok(action.includes('Default target'),'planning field should distinguish the recurring fallback');",'Clear test default target');
  clearTest=replaceOnce(clearTest,"assert.ok(action.includes('The specific result you want finished. It appears on the to-do.'),'finish line should be explained in place');","assert.ok(action.includes(\"Leave blank if it changes. Set each session under This week's targets.\"),'adaptive target terminology should be explained in place');",'Clear test target explanation');
  clearTest=replaceOnce(clearTest,"assert.ok(todo.includes('Finish line (optional)'),'to-do editor should use the same language');","assert.ok(todo.includes('Target for this task (optional)'),'to-do editor should use adaptive target terminology');",'Clear test task target');
  clearTest=replaceOnce(clearTest,"assert.ok(todo.includes('<span class=\"pl-k\">Finish</span>'),'task card should label the result clearly');","assert.ok(todo.includes('<span class=\"pl-k\">Target</span>'),'task card should label the current target clearly');",'Clear test target card');
}
write('tools/test-clear-schedule-language-v1.mjs',clearTest);

let timetableReadme=read('apps/timetable/README.md');
if(!timetableReadme.includes('## Recurring targets'))timetableReadme+='\n## Recurring targets\n- A schedule block is the stable weekly activity.\n- `outcomeGoal` on the block is an optional default target.\n- `overrides[].outcomeGoal` is the dated session target and takes precedence.\n- Classes remain schedule-only. Study and training targets create dated to-do occurrences when task creation is enabled.\n';
write('apps/timetable/README.md',timetableReadme);

let todoReadme=read('apps/todo/README.md');
if(!todoReadme.includes('## Scheduled targets'))todoReadme+='\n## Scheduled targets\nGenerated timetable tasks keep a stable task title while `outcomeGoal` stores the target for that dated occurrence. Editing a generated target writes it back to the matching timetable override, so future weeks remain independent.\n';
write('apps/todo/README.md',todoReadme);

if(!action.includes('entry.outcomeGoal')||!action.includes('Default target'))throw new Error('Adaptive action targets missing');
if(!timetable.includes("This week's targets")||!timetable.includes('Session target'))throw new Error('Adaptive timetable targets missing');
if(!todo.includes('syncTargetToSchedule')||!todo.includes('Target for this task'))throw new Error('Adaptive to-do targets missing');
console.log('Applied adaptive weekly targets');
