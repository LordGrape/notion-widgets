import fs from 'node:fs';

const file = 'timetable.html';
let source = fs.readFileSync(file, 'utf8');

const startMarker = '/* ── Storage ── */';
const endMarker = '/* ── Queries ── */';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Timetable storage section markers were not found');
}

const storageSection = String.raw`/* ── Storage ── */
/* TIMETABLE DURABLE PERSISTENCE v1
   Stable local snapshot, rolling recovery copies, and guarded cloud seeding. */
var TT_LOCAL_KEY='timetable_courses';
var TT_PREFS_KEY='timetable_preferences';
var TT_VAULT_KEY='timetable_courses_vault_v1';
var TT_EMPTY_KEY='timetable_courses_intentionally_empty_v1';
var TT_MAX_BACKUPS=6;
var ttPersistenceRequested=false;

function readStoredJson(key,fallback){
  try{var raw=localStorage.getItem(key);return raw==null?fallback:JSON.parse(raw)}catch(e){return fallback}
}
function hasOwn(obj,key){return !!obj&&Object.prototype.hasOwnProperty.call(obj,key)}
function clean(v){return (v&&v!=='TBA')?v:''}
function decorateBlock(block,source){
  var category=String(source&&source.category||'').toLowerCase();
  if(/^(class|study|training|personal)$/.test(category))block.category=category;
  if(hasOwn(source,'trackCompletion'))block.trackCompletion=!!source.trackCompletion;
  if(hasOwn(source,'actionable'))block.actionable=!!source.actionable;
  return block;
}
function normaliseBlocks(raw){
  if(!Array.isArray(raw))return[];
  return raw.map(function(c){
    if(c&&Array.isArray(c.days)){
      return decorateBlock({
        id:c.id||genId(),name:c.name||'Untitled',description:clean(c.description),location:clean(c.location),color:c.color||COLORS[0],
        days:c.days.filter(function(d){return d&&d.start&&d.end}).map(function(d){return{day:+d.day||0,start:d.start,end:d.end,location:clean(d.location||c.location)}})
      },c);
    }
    /* v2 flat migration */
    return decorateBlock({
      id:(c&&c.id)||genId(),name:(c&&c.name)||'Untitled',description:clean(c&&c.prof),location:clean(c&&c.room),color:(c&&c.color)||COLORS[0],
      days:[{day:+(c&&c.day)||0,start:(c&&c.start)||'09:00',end:(c&&c.end)||'10:00',location:clean(c&&c.room)}]
    },c);
  }).filter(function(block){return block.days.length});
}
function readVault(){
  var vault=readStoredJson(TT_VAULT_KEY,null);
  if(!vault||typeof vault!=='object'||!Array.isArray(vault.current))return null;
  if(!Array.isArray(vault.backups))vault.backups=[];
  return vault;
}
function intentionallyEmpty(){
  try{return localStorage.getItem(TT_EMPTY_KEY)==='1'}catch(e){return false}
}
function requestPersistentStorage(){
  if(ttPersistenceRequested)return;
  ttPersistenceRequested=true;
  try{if(navigator.storage&&typeof navigator.storage.persist==='function')navigator.storage.persist().catch(function(){})}catch(e){}
}
function writeLocalSnapshot(arr,markIntentionalEmpty){
  var safe=normaliseBlocks(arr),now=Date.now(),previous=readVault();
  var backups=previous&&Array.isArray(previous.backups)?previous.backups.slice():[];
  function remember(courses,savedAt){
    var copy=normaliseBlocks(courses);
    if(!copy.length)return;
    var token=JSON.stringify(copy);
    backups=backups.filter(function(entry){return !entry||JSON.stringify(normaliseBlocks(entry.courses))!==token});
    backups.unshift({savedAt:savedAt||now,courses:copy});
  }
  if(previous&&Array.isArray(previous.current))remember(previous.current,previous.savedAt);
  remember(safe,now);
  backups=backups.slice(0,TT_MAX_BACKUPS);
  try{localStorage.setItem(TT_LOCAL_KEY,JSON.stringify(safe))}catch(e){}
  try{localStorage.setItem(TT_VAULT_KEY,JSON.stringify({version:1,savedAt:now,current:safe,backups:backups}))}catch(e){}
  try{
    if(safe.length)localStorage.removeItem(TT_EMPTY_KEY);
    else if(markIntentionalEmpty)localStorage.setItem(TT_EMPTY_KEY,'1');
  }catch(e){}
  requestPersistentStorage();
  return safe;
}
function readLocalBlocks(){
  var direct=readStoredJson(TT_LOCAL_KEY,null),vault=readVault(),empty=intentionallyEmpty();
  if(Array.isArray(direct)){
    if(direct.length)return direct;
    if(empty)return[];
    if(vault&&Array.isArray(vault.current)&&vault.current.length)return vault.current;
    return[];
  }
  if(vault&&Array.isArray(vault.current)){
    if(vault.current.length||empty)return vault.current;
  }
  if(!empty&&vault&&vault.backups.length){
    for(var i=0;i<vault.backups.length;i++)if(Array.isArray(vault.backups[i].courses)&&vault.backups[i].courses.length)return vault.backups[i].courses;
  }
  return[];
}
function loadPrefs(){
  var p=null;
  try{p=SyncEngine.get('timetable','preferences')}catch(e){}
  if(!p)p=readStoredJson(TT_PREFS_KEY,null);
  if(!p||typeof p!=='object')p={};
  return{defaultView:/^(today|week)$/.test(p.defaultView)?p.defaultView:'auto',sound:p.sound!==false,mondayFirst:!!p.mondayFirst};
}
function savePrefs(){
  try{localStorage.setItem(TT_PREFS_KEY,JSON.stringify(prefs))}catch(e){}
  try{SyncEngine.set('timetable','preferences',prefs)}catch(e){}
  drawSettings();render();
}
function drawSettings(){
  if(!$('prefView'))return;
  $('prefView').value=prefs.defaultView;$('prefSound').checked=prefs.sound;$('prefMonday').checked=prefs.mondayFirst;
}
function loadBlocks(){
  var synced=null;
  try{synced=SyncEngine.get('timetable','courses')}catch(e){}
  if(Array.isArray(synced)&&synced.length)return normaliseBlocks(synced);
  var local=readLocalBlocks();
  if(local.length&&!intentionallyEmpty())return normaliseBlocks(local);
  if(Array.isArray(synced))return normaliseBlocks(synced);
  return normaliseBlocks(local);
}
function saveBlocks(arr){
  schedule=writeLocalSnapshot(arr,true);
  try{if(typeof SyncEngine!=='undefined'&&SyncEngine.set)SyncEngine.set('timetable','courses',schedule)}catch(e){}
}
function protectRemoteSchedule(){
  if(!schedule.length||typeof SyncEngine==='undefined'||!SyncEngine.set)return;
  var synced=null;
  try{synced=SyncEngine.get('timetable','courses')}catch(e){}
  if(synced===null||(Array.isArray(synced)&&!synced.length&&!intentionallyEmpty())){
    try{SyncEngine.set('timetable','courses',schedule)}catch(e){}
  }
}

`;

source = source.slice(0, start) + storageSection + source.slice(end);

const oldBoot = "  prefs=loadPrefs();schedule=loadBlocks();\n  saveBlocks(schedule);";
const newBoot = "  prefs=loadPrefs();schedule=loadBlocks();\n  if(schedule.length)schedule=writeLocalSnapshot(schedule,false);\n  protectRemoteSchedule();";
if (!source.includes(oldBoot)) throw new Error('Expected timetable boot sequence was not found');
source = source.replace(oldBoot, newBoot);

const oldSubscription = "      SyncEngine.subscribe('timetable','courses',function(value){var next=loadBlocks();if(Array.isArray(value))next=value;if(JSON.stringify(next)!==JSON.stringify(schedule)){schedule=next;render();drawSaved()}});";
const newSubscription = "      SyncEngine.subscribe('timetable','courses',function(value){\n        if(!Array.isArray(value))return;\n        if(!value.length&&schedule.length&&!intentionallyEmpty()){protectRemoteSchedule();return}\n        var next=normaliseBlocks(value);\n        if(JSON.stringify(next)!==JSON.stringify(schedule)){schedule=writeLocalSnapshot(next,false);render();drawSaved()}\n      });";
if (!source.includes(oldSubscription)) throw new Error('Expected timetable subscription was not found');
source = source.replace(oldSubscription, newSubscription);

const oldInitGate = "if(window.SyncEngine&&typeof SyncEngine.init==='function'){";
const newInitGate = "if(typeof SyncEngine!=='undefined'&&typeof SyncEngine.init==='function'){";
if (!source.includes(oldInitGate)) throw new Error('Expected SyncEngine init gate was not found');
source = source.replace(oldInitGate, newInitGate);

if (source.includes('  saveBlocks(schedule);')) throw new Error('Unsafe empty boot write remains');
if (!source.includes('TIMETABLE DURABLE PERSISTENCE v1')) throw new Error('Persistence marker missing');
if (!source.includes("typeof SyncEngine!=='undefined'&&SyncEngine.set")) throw new Error('SyncEngine lexical-global gate was not fixed');

fs.writeFileSync(file, source);
console.log('Applied durable timetable persistence fix');
