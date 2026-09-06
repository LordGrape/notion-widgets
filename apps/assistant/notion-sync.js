(()=>{
const WORKER='https://widget-sync.lordgrape-widgets.workers.dev',KEY='command-centre-access-v1',HORIZON_DAYS=21;
let running=false;
const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=v=>{if(Array.isArray(v))return v;if(typeof v==='string')try{const out=JSON.parse(v);return Array.isArray(out)?out:[]}catch(_){}return[]};
const unwrap=v=>v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,e])=>[k,e&&typeof e==='object'&&Object.prototype.hasOwnProperty.call(e,'value')?e.value:e])):{};
function occurrenceEntries(block,when){
 const key=dateKey(when),day=when.getDay(),overrides=Array.isArray(block.overrides)?block.overrides:[],result=[];
 if((block.startDate&&key<block.startDate)||(block.endDate&&key>block.endDate))return result;
 const direct=overrides.find(o=>o&&o.sourceDate===key);
 parse(block.days).filter(e=>Number(e.day)===day).forEach(e=>{if(direct&&(direct.skipped||direct.date!==key))return;result.push({start:direct?.start||e.start,end:direct?.end||e.end,location:Object.prototype.hasOwnProperty.call(direct||{},'location')?direct.location:(e.location||block.location||''),sourceDate:key})});
 overrides.forEach(o=>{if(!o||o.skipped||o.date!==key||o.sourceDate===key)return;const p=String(o.sourceDate||'').split('-').map(Number),source=new Date(p[0],(p[1]||1)-1,p[2]||1,12),entry=parse(block.days).find(e=>Number(e.day)===source.getDay());if(entry)result.push({start:o.start||entry.start,end:o.end||entry.end,location:Object.prototype.hasOwnProperty.call(o,'location')?o.location:(entry.location||block.location||''),sourceDate:o.sourceDate})});
 return result;
}
function localIso(key,time){const d=key.split('-').map(Number),t=String(time||'00:00').split(':').map(Number);return new Date(d[0],d[1]-1,d[2],t[0]||0,t[1]||0).toISOString()}
function expand(courses){const items=[],now=new Date();for(let offset=0;offset<HORIZON_DAYS;offset++){const day=new Date(now);day.setDate(day.getDate()+offset);const key=dateKey(day);parse(courses).forEach(block=>occurrenceEntries(block,day).forEach((entry,index)=>items.push({occurrenceId:`timetable:${block.id}:${key}:${index}`,scheduleId:block.id,activity:block.name||'Scheduled block',category:['class','study','training','personal'].includes(block.category)?block.category[0].toUpperCase()+block.category.slice(1):'Personal',scheduledStart:localIso(key,entry.start),scheduledEnd:entry.end?localIso(key,entry.end):null,location:entry.location||'',notes:block.description||''}))) }return items.slice(0,100)}
async function sync(){if(running||document.hidden)return;let key='';try{key=localStorage.getItem(KEY)||sessionStorage.getItem(KEY)||''}catch(_){}if(!key)return;running=true;try{const state=await fetch(`${WORKER}/state/timetable`,{headers:{'X-Widget-Key':key},cache:'no-store'});if(!state.ok)return;const payload=await state.json(),courses=unwrap(payload.value).courses,items=expand(courses);await fetch(`${WORKER}/notion/action-blocks?target=timetable`,{method:'POST',headers:{'X-Widget-Key':key,'Content-Type':'application/json'},body:JSON.stringify({items})})}catch(_){}finally{running=false}}
window.addEventListener('DOMContentLoaded',()=>{setTimeout(sync,1200);setInterval(sync,300000)});window.addEventListener('focus',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
})();
