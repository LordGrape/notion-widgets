import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../timetable.html', import.meta.url);
let source = readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Patch anchor missing: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  ".trow .arrow{font-size:10px;color:var(--text-3);text-align:center}\n.swatches",
  ".trow .arrow{font-size:10px;color:var(--text-3);text-align:center}\n.trow .day-location{grid-column:2/-1;font-family:'Inter',system-ui,sans-serif}\n.swatches",
  'day location style'
);

replaceOnce(
  '<label class="f-label">Location</label>\n          <input class="f-input" id="fLoc" placeholder="Optional">',
  '<label class="f-label">Default location</label>\n          <input class="f-input" id="fLoc" placeholder="Fallback for every day">',
  'default location field'
);

replaceOnce(
  "days:c.days.filter(function(d){return d&&d.start&&d.end}).map(function(d){return{day:+d.day||0,start:d.start,end:d.end}})",
  "days:c.days.filter(function(d){return d&&d.start&&d.end}).map(function(d){return{day:+d.day||0,start:d.start,end:d.end,location:clean(d.location||c.location)}})",
  'location migration'
);

replaceOnce(
  "if(+d.day===day)out.push({id:b.id,name:b.name,description:b.description,location:b.location,color:b.color,day:+d.day,start:d.start,end:d.end});",
  "if(+d.day===day)out.push({id:b.id,name:b.name,description:b.description,location:clean(d.location||b.location),color:b.color,day:+d.day,start:d.start,end:d.end});",
  'day location query'
);

replaceOnce(
  "schedule.forEach(function(b){b.days.forEach(function(d){out.push({id:b.id,name:b.name,description:b.description,location:b.location,color:b.color,day:+d.day,start:d.start,end:d.end})})});",
  "schedule.forEach(function(b){b.days.forEach(function(d){out.push({id:b.id,name:b.name,description:b.description,location:clean(d.location||b.location),color:b.color,day:+d.day,start:d.start,end:d.end})})});",
  'week location query'
);

replaceOnce(
  "b.days.forEach(function(d){selDays[d.day]={start:d.start,end:d.end}});",
  "b.days.forEach(function(d){selDays[d.day]={start:d.start,end:d.end,location:clean(d.location||b.location)}});",
  'edit day locations'
);

replaceOnce(
  "selDays[d]=keys.length?{start:selDays[keys[0]].start,end:selDays[keys[0]].end}:{start:'09:00',end:'10:00'};",
  "selDays[d]=keys.length?{start:selDays[keys[0]].start,end:selDays[keys[0]].end,location:selDays[keys[0]].location||''}:{start:'09:00',end:'10:00',location:''};",
  'new day defaults'
);

replaceOnce(
`      return '<div class="trow"><span class="d">'+DAY_SHORT[d]+'</span>'
        +'<input type="time" value="'+selDays[d].start+'" data-d="'+d+'" data-f="start">'
        +'<span class="arrow">\\u2192</span>'
        +'<input type="time" value="'+selDays[d].end+'" data-d="'+d+'" data-f="end"></div>';`,
`      return '<div class="trow"><span class="d">'+DAY_SHORT[d]+'</span>'
        +'<input type="time" value="'+selDays[d].start+'" data-d="'+d+'" data-f="start">'
        +'<span class="arrow">\\u2192</span>'
        +'<input type="time" value="'+selDays[d].end+'" data-d="'+d+'" data-f="end">'
        +'<input class="day-location" type="text" value="'+esc(selDays[d].location||'')+'" data-d="'+d+'" data-f="location" aria-label="'+DAY_NAMES[d]+' location" placeholder="'+DAY_NAMES[d]+' location"></div>';`,
  'day location inputs'
);

replaceOnce(
  "var days=keys.map(function(k){return{day:+k,start:selDays[k].start,end:selDays[k].end}});",
  "var days=keys.map(function(k){return{day:+k,start:selDays[k].start,end:selDays[k].end,location:clean(selDays[k].location)||loc}});",
  'save day locations'
);

writeFileSync(file, source);
console.log('Added day-specific timetable locations without changing the main widget UI.');
