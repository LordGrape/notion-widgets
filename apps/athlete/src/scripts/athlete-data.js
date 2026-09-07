'use strict';
/* ATHLETE v2 - data, catalogue and scoring.
   Persistent shape is unchanged from v1: SyncEngine namespace
   'fitness', key 'state' = { v, bw, entries:[{id,t,d,v,load,dist,raw,ts}], ruck }.
   All existing logs carry over untouched. */

var WORKER = 'https://widget-sync.lordgrape-widgets.workers.dev';
var NS = 'fitness';

/* Test catalogue. Anchors are [value, score] pairs ascending by value.
   dir 'hi': bigger is better. dir 'lo': faster is better. */
var TESTS = [
 { id:'run2400', name:'2400 m Run',        attr:'AEP', kind:'time',  dir:'lo', anchors:[[440,99],[480,90],[495,75],[510,60],[660,25]], lv:[510,495,480], hint:'mm:ss, fresh effort' },
 { id:'run8000', name:'8 km Run',          attr:'AEC', kind:'time',  dir:'lo', anchors:[[1800,99],[2040,90],[2100,75],[2250,60],[2880,25]], lv:[2250,2100,2040], hint:'mm:ss' },
 { id:'run400',  name:'400 m Run',         attr:'ANA', kind:'time',  dir:'lo', anchors:[[56,99],[65,90],[70,75],[75,60],[95,25]], lv:[75,70,65], hint:'mm:ss' },
 { id:'sprint40',name:'40 m Sprint',       attr:'POW', kind:'timeS', dir:'lo', anchors:[[4.9,99],[5.16,90],[5.2,75],[5.25,60],[6.2,25]], lv:[5.25,5.2,5.16], hint:'seconds, e.g. 5.08' },
 { id:'vjump',   name:'Vertical Jump',     attr:'POW', kind:'num',   dir:'hi', unit:'cm', anchors:[[30,25],[50,60],[55,75],[60,90],[75,99]], lv:[50,55,60], hint:'centimetres' },
 { id:'pullups', name:'Pull-ups (strict)', attr:'UPS', kind:'int',   dir:'hi', anchors:[[1,25],[9,60],[12,75],[14,90],[20,99]], lv:[9,12,14], hint:'max strict reps' },
 { id:'pushups', name:'Push-ups (max)',    attr:'UPS', kind:'int',   dir:'hi', anchors:[[15,25],[50,60],[53,75],[55,90],[70,99]], lv:[50,53,55], hint:'max continuous reps' },
 { id:'situps',  name:'Sit-ups (cadence)', attr:'COR', kind:'int',   dir:'hi', anchors:[[30,25],[100,60],[125,75],[148,90],[150,97]], lv:[100,125,150], hint:'reps at cadence, 6 min cap' },
 { id:'grip',    name:'Grip (relative)',   attr:'UPS', kind:'grip',  dir:'hi', anchors:[[0.6,25],[1,60],[1.1,75],[1.16,90],[1.45,99]], lv:[1,1.1,1.16], hint:'left + right kg over bodyweight' },
 { id:'bench',   name:'Bench Press AMRAP', attr:'UPS', kind:'amrap', dir:'hi', defaultLoad:65,
   loads:{ '55':[[10,25],[33,60],[35,75],[37,90],[45,99]], '65':[[5,25],[24,60],[26,75],[28,90],[38,99]], '75':[[2,25],[13,60],[15,75],[17,90],[24,99]] },
   lvPer:{ '55':[33,35,37], '65':[24,26,28], '75':[13,15,17] }, hint:'reps at chosen load' },
 { id:'squat',   name:'Back Squat AMRAP',  attr:'LWS', kind:'amrap', dir:'hi', defaultLoad:80,
   loads:{ '72':[[5,25],[18,60],[22,75],[26,90],[34,99]], '80':[[4,25],[16,60],[19,75],[22,90],[30,99]], '90':[[2,25],[9,60],[12,75],[15,90],[22,99]] },
   lvPer:{ '72':[18,22,26], '80':[16,19,22], '90':[9,12,15] }, hint:'reps at chosen load' },
 { id:'ruck',    name:'Loaded March',      attr:'RUC', kind:'ruck',  dir:'lo', custom:true, hint:'pace per km with load' }
];

var ATTRS = [
 { code:'AEP', tests:['run2400'] },
 { code:'AEC', tests:['run8000'] },
 { code:'ANA', tests:['run400'] },
 { code:'POW', tests:['vjump','sprint40'] },
 { code:'UPS', tests:['bench','pushups','pullups','grip'] },
 { code:'LWS', tests:['squat'] },
 { code:'COR', tests:['situps'] },
 { code:'RUC', tests:['ruck'] }
];

var DEFAULT_RUCK = { floor:840, l1:750, l2:700, l3:660, cap:570 };
var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* State */
var state = { v:1, bw:null, entries:[], ruck:{ floor:840, l1:750, l2:700, l3:660, cap:570 } };

function loadState(){
 var s = null;
 try { s = SyncEngine.get(NS, 'state'); } catch(e) {}
 if (s && typeof s === 'object') {
  state = s;
  if (!state.ruck) state.ruck = { floor:840, l1:750, l2:700, l3:660, cap:570 };
  if (!state.entries) state.entries = [];
 }
}
function save(){ try { SyncEngine.set(NS, 'state', state); } catch(e) {} }

/* Helpers */
function el(id){ return document.getElementById(id); }
function uid(){ return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function mean(a){ return a.reduce(function(x,y){ return x+y; }, 0) / a.length; }
function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function testById(id){ for (var i=0;i<TESTS.length;i++) if (TESTS[i].id===id) return TESTS[i]; return null; }
function attrByCode(code){ for (var i=0;i<ATTRS.length;i++) if (ATTRS[i].code===code) return ATTRS[i]; return null; }
function snd(name){ try { if (window.Core && Core.audio && Core.audio[name]) Core.audio[name](); } catch(e) {} }
function announce(t){ try { if (window.Core && Core.a11y) Core.a11y.announce(t); } catch(e) {} }

function fmtMS(sec){
 sec = Math.round(sec * 10) / 10;
 var m = Math.floor(sec / 60), s = sec - m*60;
 var ss = (s < 10 ? '0' : '') + (Math.round(s*10)/10);
 return m + ':' + ss;
}
function fmtDate(d){
 var p = (d || '').split('-');
 if (p.length !== 3) return d || '';
 return String(parseInt(p[2],10)) + ' ' + (MONTHS[parseInt(p[1],10)-1] || '') + ' ' + p[0].slice(2);
}
function todayStr(){
 var d = new Date();
 var m = d.getMonth()+1, day = d.getDate();
 return d.getFullYear() + '-' + (m<10?'0':'')+m + '-' + (day<10?'0':'')+day;
}

/* Entries */
function entriesFor(tid, list){
 return (list || state.entries).filter(function(e){ return e.t === tid; })
  .sort(function(a,b){ return a.d === b.d ? (a.ts - b.ts) : (a.d < b.d ? -1 : 1); });
}
function latestEntry(tid){ var l = entriesFor(tid); return l.length ? l[l.length-1] : null; }
function latestEntryAmong(tids){
 var best = null;
 tids.forEach(function(id){ var e = latestEntry(id); if (e && (!best || e.d > best.d || (e.d === best.d && e.ts > best.ts))) best = e; });
 return best;
}
function recentTests(n){
 var seen = {}, out = [];
 var sorted = state.entries.slice().sort(function(a,b){ return b.ts - a.ts; });
 for (var i=0;i<sorted.length && out.length<n;i++){
  var t = sorted[i].t;
  if (!seen[t]){ seen[t]=1; out.push(t); }
 }
 return out;
}

/* Scoring */
function anchorsFor(test, entry){
 if (test.id === 'ruck'){ var r = state.ruck || DEFAULT_RUCK; return [[r.cap,99],[r.l3,90],[r.l2,75],[r.l1,60],[r.floor,25]]; }
 if (test.kind === 'amrap'){ var L = String(entry && entry.load ? entry.load : test.defaultLoad); return test.loads[L] || test.loads[String(test.defaultLoad)]; }
 return test.anchors;
}
function levelsFor(test, entry){
 if (test.id === 'ruck'){ var r = state.ruck || DEFAULT_RUCK; return [r.l1, r.l2, r.l3]; }
 if (test.kind === 'amrap'){ var L = String(entry && entry.load ? entry.load : test.defaultLoad); return test.lvPer[L]; }
 return test.lv;
}
function lerpScore(a, v){
 var n = a.length;
 if (v <= a[0][0]) return a[0][1];
 if (v >= a[n-1][0]) return a[n-1][1];
 for (var i=0;i<n-1;i++){
  if (v >= a[i][0] && v <= a[i+1][0]){
   var t = (v - a[i][0]) / (a[i+1][0] - a[i][0]);
   return a[i][1] + t * (a[i+1][1] - a[i][1]);
  }
 }
 return a[n-1][1];
}
function scoreOf(test, v, entry){ return clamp(Math.round(lerpScore(anchorsFor(test, entry), v)), 10, 99); }
function levelOf(test, v, entry){
 var lv = levelsFor(test, entry);
 if (test.dir === 'hi'){ if (v >= lv[2]) return 3; if (v >= lv[1]) return 2; if (v >= lv[0]) return 1; return 0; }
 if (v <= lv[2]) return 3; if (v <= lv[1]) return 2; if (v <= lv[0]) return 1; return 0;
}
function levelChip(lv){ return '<span class="lv lv' + lv + '">' + (lv > 0 ? 'L' + lv : 'L0') + '</span>'; }
function bandOf(s){ if (s >= 90) return 'Elite'; if (s >= 75) return 'Pro'; if (s >= 60) return 'Entry'; return 'Below'; }

function attrScore(attr, entriesList){
 var parts = [];
 attr.tests.forEach(function(tid){
  var t = testById(tid);
  var es = entriesFor(tid, entriesList);
  if (es.length){ var e = es[es.length-1]; parts.push(scoreOf(t, e.v, e)); }
 });
 return parts.length ? Math.round(mean(parts)) : null;
}

function computeModel(){
 var attrs = ATTRS.map(function(a){
  var score = attrScore(a, state.entries);
  var tested = score !== null;
  var delta = null;
  if (tested){
   var latest = latestEntryAmong(a.tests);
   if (latest){
    var rest = state.entries.filter(function(e){ return e.id !== latest.id; });
    var prev = attrScore(a, rest);
    if (prev !== null){ var d = score - prev; if (d !== 0) delta = d; }
   }
  }
  return { code:a.code, tests:a.tests, score:score, tested:tested, delta:delta };
 });
 var testedAttrs = attrs.filter(function(a){ return a.tested; });
 var ovr = testedAttrs.length ? Math.round(mean(testedAttrs.map(function(a){ return a.score; }))) : null;
 return { attrs:attrs, ovr:ovr, testedCount:testedAttrs.length };
}

function bestEntry(t, list){
 var best = list[0];
 list.forEach(function(e){
  if (t.dir === 'hi' ? e.v > best.v : e.v < best.v) best = e;
 });
 return best;
}

function parsePace(str){
 str = (str || '').trim();
 if (!str) return null;
 if (str.indexOf(':') >= 0){
  var p = str.split(':');
  var m = parseInt(p[0], 10), s = parseFloat(p[1]);
  if (!isFinite(m) || !isFinite(s)) return null;
  return m * 60 + s;
 }
 var n = parseFloat(str);
 if (!isFinite(n)) return null;
 return n < 30 ? n * 60 : n;
}
