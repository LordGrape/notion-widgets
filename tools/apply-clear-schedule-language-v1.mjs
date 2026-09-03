import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(source,oldStr,newStr,label){
  const count=source.split(oldStr).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(oldStr,newStr);
}

let action=read('action-blocks.js');
if(!action.includes('CLEAR SCHEDULE LANGUAGE v1')){
  action=replaceOnce(action,'/* SEAMLESS PLANNING SYSTEM v1 */','/* SEAMLESS PLANNING SYSTEM v1 */\n/* CLEAR SCHEDULE LANGUAGE v1\n   Behaviour retained: Weekly to-do; Fresh task every scheduled day. */','Action copy marker');
  action=replaceOnce(action,'white-space:nowrap}.ab-toggle.is-disabled','white-space:normal}.ab-toggle.is-disabled','Toggle helper wrapping');
  action=replaceOnce(
    action,
    '<div class="ab-field"><label class="f-label">To-do</label><label class="ab-toggle" id="fTrackLabel" for="fTrack"><span class="ab-toggle-copy"><strong id="fTrackTitle">Weekly to-do</strong><small id="fTrackHint">Fresh task every scheduled day.</small></span>',
    '<div class="ab-field"><label class="f-label">Task creation</label><label class="ab-toggle" id="fTrackLabel" for="fTrack"><span class="ab-toggle-copy"><strong id="fTrackTitle">Add to to-do</strong><small id="fTrackHint">Fresh task on every selected day.</small></span>',
    'Task creation copy'
  );
  action=replaceOnce(
    action,
    '<label class="f-label">Outcome</label><input class="f-input" id="fOutcome" placeholder="Optional, e.g. brief cases 4–6"><div class="ab-plan-help">Shown on generated study or training tasks.</div>',
    '<label class="f-label">Finish line</label><input class="f-input" id="fOutcome" placeholder="Optional, e.g. brief cases 4–6"><div class="ab-plan-help">The specific result you want finished. It appears on the to-do.</div>',
    'Finish line explanation'
  );
  action=replaceOnce(
    action,
    "function paintTrack(){var locked=cat.value==='class';if(locked)track.checked=false;track.disabled=locked;trackLabel.classList.toggle('is-disabled',locked);trackLabel.setAttribute('aria-disabled',locked?'true':'false');trackTitle.textContent=locked?'Schedule only':'Weekly to-do';trackHint.textContent=locked?'Classes never create to-dos.':(track.checked?'Fresh task every scheduled day.':'Keep this on the schedule only.')}",
    "function paintTrack(){var locked=cat.value==='class';if(locked)track.checked=false;track.disabled=locked;trackLabel.classList.toggle('is-disabled',locked);trackLabel.setAttribute('aria-disabled',locked?'true':'false');trackTitle.textContent=locked?'Schedule only':'Add to to-do';trackHint.textContent=locked?'Classes never create tasks.':(track.checked?'Fresh task on every selected day.':'No tasks are created.')}",
    'Task state explanation'
  );
  action=replaceOnce(action,"t.outcomeGoal?('Outcome: '+t.outcomeGoal)","t.outcomeGoal?('Finish line: '+t.outcomeGoal)",'Notion finish-line label');
}
write('action-blocks.js',action);

let timetable=read('timetable.html');
if(!timetable.includes('MONDAY-FIRST EDITOR ORDER v1')){
  timetable=replaceOnce(timetable,'/* SEAMLESS TIMETABLE PLANNING v1 */','/* SEAMLESS TIMETABLE PLANNING v1 */\n/* MONDAY-FIRST EDITOR ORDER v1 */','Day-order marker');
  timetable=replaceOnce(
    timetable,
    "function nextAvailableColor(){var use=COLORS.map(function(){return 0});schedule.forEach(function(block){var i=COLORS.indexOf(block&&block.color);if(i>=0)use[i]++});var least=Math.min.apply(null,use);return COLORS[use.indexOf(least)]}",
    "function nextAvailableColor(){var use=COLORS.map(function(){return 0});schedule.forEach(function(block){var i=COLORS.indexOf(block&&block.color);if(i>=0)use[i]++});var least=Math.min.apply(null,use);return COLORS[use.indexOf(least)]}\nfunction orderedDays(){return prefs.mondayFirst?[1,2,3,4,5,6,0]:[0,1,2,3,4,5,6]}\nfunction dayRank(day){return orderedDays().indexOf(+day)}",
    'Shared day ordering'
  );
  timetable=replaceOnce(
    timetable,
    "  drawSettings();render();\n}",
    "  drawSettings();render();if($('overlay')&&$('overlay').classList.contains('show')){drawSaved();drawForm()}\n}",
    'Live editor preference refresh'
  );
  timetable=replaceOnce(
    timetable,
    "var ds=b.days.slice().sort(function(x,y){return(x.day||7)-(y.day||7)}).map",
    "var ds=b.days.slice().sort(function(x,y){return dayRank(x.day)-dayRank(y.day)}).map",
    'Saved block day order'
  );
  timetable=replaceOnce(
    timetable,
    "chips.innerHTML=DAY_SHORT.map(function(d,i){return '<button type=\"button\" class=\"dchip'+(selDays[i]?' on':'')+'\" data-d=\"'+i+'\">'+d.slice(0,2)+'</button>'}).join('');",
    "chips.innerHTML=orderedDays().map(function(i){var d=DAY_SHORT[i];return '<button type=\"button\" class=\"dchip'+(selDays[i]?' on':'')+'\" data-d=\"'+i+'\">'+d.slice(0,2)+'</button>'}).join('');",
    'Repeat chip day order'
  );
  timetable=replaceOnce(
    timetable,
    "var keys=Object.keys(selDays).map(Number).sort(function(a,b){return(a||7)-(b||7)});",
    "var keys=Object.keys(selDays).map(Number).sort(function(a,b){return dayRank(a)-dayRank(b)});",
    'Day time row order'
  );
  timetable=replaceOnce(
    timetable,
    "drawSettings();render()}});",
    "drawSettings();render();if($('overlay')&&$('overlay').classList.contains('show')){drawSaved();drawForm()}}});",
    'Synced preference editor refresh'
  );
}
timetable=timetable.replaceAll('action-blocks.js?v=20260902-editor-v2&planning=20260903-v1','action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2');
write('timetable.html',timetable);

let todo=read('todo.html');
if(!todo.includes('CLEAR FINISH LINE LANGUAGE v1')){
  todo=replaceOnce(todo,'/* SEAMLESS TODO PLANNING v1 */','/* SEAMLESS TODO PLANNING v1 */\n/* CLEAR FINISH LINE LANGUAGE v1 */','To-do copy marker');
  todo=replaceOnce(todo,'aria-label="Outcome" placeholder="Outcome (optional)"','aria-label="Finish line" placeholder="Finish line (optional)"','To-do finish-line field');
  todo=replaceOnce(todo,'<span class="pl-k">Outcome</span>','<span class="pl-k">Finish</span>','To-do finish-line display');
}
todo=todo.replaceAll('action-blocks.js?v=20260902-editor-v2&planning=20260903-v1','action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2');
write('todo.html',todo);

if(!action.includes('Add to to-do')||!action.includes('Finish line'))throw new Error('Clear action copy missing');
if(!timetable.includes('MONDAY-FIRST EDITOR ORDER v1'))throw new Error('Monday-first editor order missing');
if(!todo.includes('Finish line (optional)'))throw new Error('Clear to-do copy missing');
console.log('Applied clear schedule language and Monday-first editor ordering');
