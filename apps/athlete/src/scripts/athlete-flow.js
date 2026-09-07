'use strict';
/* ATHLETE v2 - interaction: log flow, attribute detail, settings,
   boot. Log flow redesigned for speed: recent tests up top, groups
   named in plain language, live score preview, Enter saves. */

/* ── Modals ── */
function openModal(id){ el(id).hidden = false; snd('open'); }
function closeModal(id){ el(id).hidden = true; hideTip(); snd('close'); }
document.addEventListener('keydown', function(e){
 if (e.key !== 'Escape') return;
 ['logSheet','detail','settings'].forEach(function(id){ if (!el(id).hidden) closeModal(id); });
});
Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function(b){
 b.addEventListener('click', function(){ closeModal(b.getAttribute('data-close')); });
});
Array.prototype.forEach.call(document.querySelectorAll('.overlay'), function(ov){
 ov.addEventListener('mousedown', function(e){ if (e.target === ov) closeModal(ov.id); });
});
document.addEventListener('click', function(e){
 var t = e.target;
 while (t && t !== document){ if (t.hasAttribute && t.hasAttribute('data-snd')){ snd('click'); return; } t = t.parentNode; }
});

/* ── Log flow ── */
var logTestId = null;

function openLog(testId){
 logTestId = testId || null;
 var body = el('logBody');
 body.oninput = null;
 body.onkeydown = null;
 el('logTitle').textContent = 'Log result';
 if (!testId){ body.innerHTML = buildTestGrid(); wireTestGrid(); }
 else renderLogForm(testById(testId));
 openModal('logSheet');
}

function testBtn(t){
 var lat = latestEntry(t.id);
 var sub = lat ? lat.raw + ' \u00b7 ' + fmtDate(lat.d) : t.hint;
 return '<button class="test-pick" data-test="' + t.id + '">' + t.name + '<span class="t-last">' + sub + '</span></button>';
}
function buildTestGrid(){
 var html = '';
 var rec = recentTests(2);
 if (rec.length){
  html += '<div class="tg-head">Recent</div><div class="test-grid">';
  rec.forEach(function(tid){ html += testBtn(testById(tid)); });
  html += '</div>';
 }
 ATTRS.forEach(function(a){
  html += '<div class="tg-head">' + BODY_DATA.info[a.code].name + '</div><div class="test-grid">';
  a.tests.forEach(function(tid){ html += testBtn(testById(tid)); });
  html += '</div>';
 });
 return html;
}
function wireTestGrid(){
 Array.prototype.forEach.call(el('logBody').querySelectorAll('[data-test]'), function(b){
  b.addEventListener('click', function(){ snd('click'); renderLogForm(testById(b.getAttribute('data-test'))); });
 });
}

function renderLogForm(test){
 el('logTitle').textContent = test.name;
 var html = '';
 if (test.kind === 'time'){
  html += '<div class="fld"><label>Time</label><div class="timepair"><input id="fMin" inputmode="numeric" placeholder="min" aria-label="Minutes"><span>:</span><input id="fSec" inputmode="decimal" placeholder="sec" aria-label="Seconds"></div></div>';
 } else if (test.kind === 'timeS'){
  html += '<div class="fld"><label>Time (seconds)</label><input id="fVal" inputmode="decimal" placeholder="5.08"></div>';
 } else if (test.kind === 'int'){
  html += '<div class="fld"><label>Reps</label><input id="fVal" inputmode="numeric" placeholder="0"></div>';
 } else if (test.kind === 'num'){
  html += '<div class="fld"><label>Result (' + (test.unit || '') + ')</label><input id="fVal" inputmode="decimal" placeholder="0"></div>';
 } else if (test.kind === 'grip'){
  html += '<div class="fld"><label>Grip strength (kg)</label><div class="timepair"><input id="fL" inputmode="decimal" placeholder="Left" aria-label="Left hand kg"><span>+</span><input id="fR" inputmode="decimal" placeholder="Right" aria-label="Right hand kg"></div></div>';
  if (!state.bw) html += '<div class="fld"><label>Bodyweight (kg) &middot; saved to settings</label><input id="fBw" inputmode="decimal" placeholder="e.g. 77.1"></div>';
 } else if (test.kind === 'amrap'){
  html += '<div class="fld"><label>Load (kg)</label><div class="loadrow" id="fLoads">';
  Object.keys(test.loads).forEach(function(L){
   html += '<button type="button" class="chip' + (Number(L) === test.defaultLoad ? ' set' : '') + '" data-load="' + L + '">' + L + '</button>';
  });
  html += '</div></div><div class="fld"><label>Reps</label><input id="fVal" inputmode="numeric" placeholder="0"></div>';
 } else if (test.kind === 'ruck'){
  html += '<div class="fld"><label>Load (kg)</label><input id="fLoad" inputmode="decimal" value="24.5"></div>';
  html += '<div class="fld"><label>Distance (km)</label><input id="fDist" inputmode="decimal" value="8"></div>';
  html += '<div class="fld"><label>Total time</label><div class="timepair"><input id="fMin" inputmode="numeric" placeholder="min" aria-label="Minutes"><span>:</span><input id="fSec" inputmode="decimal" placeholder="sec" aria-label="Seconds"></div></div>';
 }
 html += '<div class="fld"><label>Date</label><input type="date" id="fDate" value="' + todayStr() + '"></div>';
 html += '<div class="f-prev" id="fPrev"></div>';
 html += '<div class="note">' + test.hint + (test.custom ? ' \u00b7 custom anchors, editable in Settings' : '') + '</div>';
 html += '<div class="err" id="fErr"></div>';
 html += '<div class="sheet-actions"><button class="form-btn form-btn-primary" id="fSave">Save result</button><button class="form-btn" id="fBack">Back</button></div>';
 el('logBody').innerHTML = html;

 Array.prototype.forEach.call(el('logBody').querySelectorAll('#fLoads .chip'), function(ch){
  ch.addEventListener('click', function(){
   Array.prototype.forEach.call(el('fLoads').querySelectorAll('.chip'), function(x){ x.classList.remove('set'); });
   ch.classList.add('set'); snd('click'); updPrev(test);
  });
 });
 el('fBack').addEventListener('click', function(){ snd('click'); openLog(null); });
 el('fSave').addEventListener('click', function(){ saveLog(test); });
 el('logBody').oninput = function(){ updPrev(test); };
 el('logBody').onkeydown = function(e){
  if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && e.target.type !== 'date'){
   e.preventDefault(); saveLog(test);
  }
 };
 var first = el('logBody').querySelector('input');
 if (first) setTimeout(function(){ first.focus(); }, 80);
}

function fieldNum(id){ var n = parseFloat(el(id).value); return isFinite(n) ? n : null; }
function fieldErr(msg){ el('fErr').textContent = msg; }

/* Read current form value without validating or mutating state.
   Powers the live score preview while typing. */
function peekValue(test){
 try {
  if (test.kind === 'time'){
   var m = parseFloat(el('fMin').value) || 0, s = parseFloat(el('fSec').value);
   if (!isFinite(s)) return null;
   var v = m * 60 + s;
   return v > 0 ? { v:v, load:null } : null;
  }
  if (test.kind === 'timeS'){
   var v1 = parseFloat(el('fVal').value);
   return (isFinite(v1) && v1 > 0) ? { v:v1, load:null } : null;
  }
  if (test.kind === 'int' || test.kind === 'num'){
   var v2 = parseFloat(el('fVal').value);
   return (isFinite(v2) && v2 >= 0) ? { v:v2, load:null } : null;
  }
  if (test.kind === 'grip'){
   var L = parseFloat(el('fL').value), R = parseFloat(el('fR').value);
   var bw = state.bw;
   if (!bw && el('fBw')) bw = parseFloat(el('fBw').value);
   if (!isFinite(L) || !isFinite(R) || L <= 0 || R <= 0 || !isFinite(bw) || bw <= 0) return null;
   return { v:Math.round(((L + R) / bw) * 100) / 100, load:null };
  }
  if (test.kind === 'amrap'){
   var chip = el('fLoads').querySelector('.chip.set');
   var load = chip ? Number(chip.getAttribute('data-load')) : test.defaultLoad;
   var v3 = parseFloat(el('fVal').value);
   return (isFinite(v3) && v3 >= 0) ? { v:v3, load:load } : null;
  }
  if (test.kind === 'ruck'){
   var ld = parseFloat(el('fLoad').value), ds = parseFloat(el('fDist').value);
   var rm = parseFloat(el('fMin').value) || 0, rs = parseFloat(el('fSec').value);
   if (!isFinite(ld) || !isFinite(ds) || ds <= 0 || !isFinite(rs)) return null;
   var tot = rm * 60 + rs;
   return tot > 0 ? { v:Math.round(tot / ds), load:ld, dist:ds } : null;
  }
 } catch(e) {}
 return null;
}
function updPrev(test){
 var pv = el('fPrev');
 if (!pv) return;
 var got = peekValue(test);
 if (!got){ pv.innerHTML = ''; return; }
 var s = scoreOf(test, got.v, got);
 pv.innerHTML = 'Score ' + s + ' \u00b7 ' + bandOf(s) + ' \u00b7 ' + levelChip(levelOf(test, got.v, got));
}

function saveLog(test){
 var v = null, load = null, dist = null, raw = '';
 if (test.kind === 'time'){
  var m = fieldNum('fMin') || 0, s = fieldNum('fSec');
  if (s === null || (m === 0 && s === 0)){ fieldErr('Enter a time.'); return; }
  v = m * 60 + s; raw = fmtMS(v);
 } else if (test.kind === 'timeS'){
  v = fieldNum('fVal');
  if (v === null || v <= 0){ fieldErr('Enter seconds, e.g. 5.08.'); return; }
  raw = (Math.round(v*100)/100) + ' s';
 } else if (test.kind === 'int'){
  v = fieldNum('fVal');
  if (v === null || v < 0){ fieldErr('Enter reps.'); return; }
  v = Math.floor(v); raw = v + ' reps';
 } else if (test.kind === 'num'){
  v = fieldNum('fVal');
  if (v === null || v <= 0){ fieldErr('Enter a result.'); return; }
  raw = v + ' ' + (test.unit || '');
 } else if (test.kind === 'grip'){
  var L = fieldNum('fL'), R = fieldNum('fR');
  if (L === null || R === null || L <= 0 || R <= 0){ fieldErr('Enter left and right kg.'); return; }
  if (!state.bw){
   var bw = el('fBw') ? fieldNum('fBw') : null;
   if (bw === null || bw <= 0){ fieldErr('Enter bodyweight once. It is saved to settings.'); return; }
   state.bw = Math.round(bw * 10) / 10;
  }
  v = Math.round(((L + R) / state.bw) * 100) / 100;
  raw = 'L ' + L + ' + R ' + R + ' kg \u2192 ' + v.toFixed(2);
 } else if (test.kind === 'amrap'){
  var chip = el('fLoads').querySelector('.chip.set');
  load = chip ? Number(chip.getAttribute('data-load')) : test.defaultLoad;
  v = fieldNum('fVal');
  if (v === null || v < 0){ fieldErr('Enter reps.'); return; }
  v = Math.floor(v); raw = v + ' \u00d7 ' + load + ' kg';
 } else if (test.kind === 'ruck'){
  load = fieldNum('fLoad'); dist = fieldNum('fDist');
  var rm = fieldNum('fMin') || 0, rs = fieldNum('fSec');
  if (load === null || load <= 0 || dist === null || dist <= 0 || rs === null){ fieldErr('Enter load, distance and time.'); return; }
  var total = rm * 60 + rs;
  if (total <= 0){ fieldErr('Enter a time.'); return; }
  v = Math.round(total / dist);
  raw = fmtMS(v) + ' /km \u00b7 ' + load + ' kg \u00b7 ' + dist + ' km';
 }
 var d = el('fDate').value || todayStr();
 var prev = latestEntry(test.id);
 var prevLevel = prev ? levelOf(test, prev.v, prev) : -1;
 var entry = { id:uid(), t:test.id, d:d, v:v, load:load, dist:dist, raw:raw, ts:Date.now() };
 state.entries.push(entry);
 save();
 closeModal('logSheet');
 renderAll();
 var newLevel = levelOf(test, v, entry);
 announce('Saved ' + test.name + ', ' + raw + '.');
 if (prevLevel >= 0 && newLevel > prevLevel){
  try { if (window.Core && Core.confetti) Core.confetti.launch('fx'); else if (typeof launchConfetti === 'function') launchConfetti('fx'); } catch(e) {}
  snd('chime');
  announce('Level up. ' + test.name + ' is now Level ' + newLevel + '.');
 }
}

/* ── Attribute detail ── */
function openDetail(code){
 var attr = attrByCode(code);
 if (!attr) return;
 var info = BODY_DATA.info[code];
 el('detailTitle').textContent = info.name + ' (' + code + ')';
 var html = '<div class="d-blurb">' + info.blurb + ' Fed by: ' + info.fedBy + '.</div>';
 attr.tests.forEach(function(tid){
  var t = testById(tid);
  var list = entriesFor(tid);
  var latest = list.length ? list[list.length-1] : null;
  html += '<div class="d-test">';
  html += '<div class="d-row"><div class="d-name">' + t.name + '</div>';
  if (latest){
   var lv = levelOf(t, latest.v, latest);
   html += '<span class="d-val">' + latest.raw + '</span>' + levelChip(lv);
  } else {
   html += '<span class="d-val" style="color:var(--lg-ink-faint)">\u2014</span>';
  }
  html += '</div>';
  html += '<div class="d-sub">';
  if (latest){
   var best = bestEntry(t, list);
   html += 'Best ' + best.raw + ' \u00b7 ' + fmtDate(best.d) + ' \u00b7 Latest ' + fmtDate(latest.d) + ' \u00b7 Score ' + scoreOf(t, latest.v, latest);
  } else {
   html += 'No results yet';
  }
  html += '</div>';
  if (list.length) html += '<canvas class="spark" id="spark-' + tid + '"></canvas>';
  if (list.length){
   html += '<div class="entries">';
   list.slice(-5).reverse().forEach(function(e){
    html += '<div class="entry"><span class="e-d">' + fmtDate(e.d) + '</span><span class="e-v">' + e.raw + '</span><button class="e-x" data-del="' + e.id + '" aria-label="Delete entry">&times;</button></div>';
   });
   html += '</div>';
  }
  html += '<button class="mini-log" data-log="' + tid + '">+ Log ' + t.name + '</button>';
  html += '</div>';
 });
 el('detailBody').innerHTML = html;
 Array.prototype.forEach.call(el('detailBody').querySelectorAll('[data-log]'), function(b){
  b.addEventListener('click', function(){ closeModal('detail'); openLog(b.getAttribute('data-log')); });
 });
 Array.prototype.forEach.call(el('detailBody').querySelectorAll('[data-del]'), function(b){
  b.addEventListener('click', function(){
   var id = b.getAttribute('data-del');
   if (b.getAttribute('data-armed') === '1'){
    state.entries = state.entries.filter(function(e){ return e.id !== id; });
    save(); renderAll(); openDetail(code); snd('click');
   } else {
    b.setAttribute('data-armed', '1'); b.textContent = 'sure?';
    setTimeout(function(){ b.removeAttribute('data-armed'); b.innerHTML = '&times;'; }, 2500);
   }
  });
 });
 openModal('detail');
 attr.tests.forEach(function(tid){
  var list = entriesFor(tid);
  if (list.length) setTimeout(function(a,b){ return function(){ drawSpark(a,b); }; }(tid, list), 40);
 });
}
function drawSpark(tid, list){
 var cv = el('spark-' + tid);
 if (!cv) return;
 var t = testById(tid);
 var cssW = cv.clientWidth || 300, cssH = 46;
 var dpr = Math.min(window.devicePixelRatio || 1, 2);
 cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
 var ctx = cv.getContext('2d');
 ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 var scores = list.map(function(e){ return scoreOf(t, e.v, e); });
 var min = Math.min.apply(null, scores), max = Math.max.apply(null, scores);
 if (min === max){ min -= 5; max += 5; }
 var padX = 8, padY = 7;
 var X = function(i){ return list.length === 1 ? cssW/2 : padX + i * (cssW - padX*2) / (list.length - 1); };
 var Y = function(s){ return cssH - padY - (s - min) / (max - min) * (cssH - padY*2); };
 var dark = !!(window.Core && Core.isDark);
 var line = dark ? 'rgba(167,139,250,0.9)' : 'rgba(124,58,237,0.9)';
 ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.beginPath();
 scores.forEach(function(s, i){ var x = X(i), y = Y(s); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
 ctx.stroke();
 scores.forEach(function(s, i){
  ctx.beginPath(); ctx.arc(X(i), Y(s), i === scores.length-1 ? 3 : 2, 0, Math.PI*2);
  ctx.fillStyle = line; ctx.fill();
 });
}

/* ── Settings ── */
function openSettings(){
 el('setBw').value = state.bw || '';
 var r = state.ruck || DEFAULT_RUCK;
 el('rkFloor').value = fmtMS(r.floor); el('rkL1').value = fmtMS(r.l1); el('rkL2').value = fmtMS(r.l2); el('rkL3').value = fmtMS(r.l3); el('rkCap').value = fmtMS(r.cap);
 el('setErr').textContent = '';
 openModal('settings');
}
function saveSettings(){
 var bw = parseFloat(el('setBw').value);
 if (el('setBw').value.trim() !== '' && (!isFinite(bw) || bw <= 0)){ el('setErr').textContent = 'Bodyweight must be a positive number.'; return; }
 var r = { floor:parsePace(el('rkFloor').value), l1:parsePace(el('rkL1').value), l2:parsePace(el('rkL2').value), l3:parsePace(el('rkL3').value), cap:parsePace(el('rkCap').value) };
 for (var k in r){ if (r[k] === null || r[k] <= 0){ el('setErr').textContent = 'All five pace anchors are required (mm:ss per km).'; return; } }
 if (!(r.floor > r.l1 && r.l1 > r.l2 && r.l2 > r.l3 && r.l3 > r.cap)){ el('setErr').textContent = 'Paces must descend: floor slowest, cap fastest.'; return; }
 state.bw = (el('setBw').value.trim() === '') ? null : Math.round(bw * 10) / 10;
 state.ruck = r;
 save(); closeModal('settings'); renderAll();
 announce('Settings saved.');
}
function exportState(){
 var txt = JSON.stringify(state, null, 2);
 function done(){ announce('Backup copied to clipboard.'); var b = el('setExport'); b.textContent = 'Copied'; setTimeout(function(){ b.textContent = 'Export'; }, 1600); }
 if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done, function(){ fallbackCopy(txt); done(); }); }
 else { fallbackCopy(txt); done(); }
}
function fallbackCopy(txt){
 var ta = document.createElement('textarea');
 ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
 document.body.appendChild(ta); ta.select();
 try { document.execCommand('copy'); } catch(e) {}
 ta.remove();
}
function wireReset(){
 var b = el('setReset');
 b.addEventListener('click', function(){
  if (b.classList.contains('armed')){
   state = { v:1, bw:null, entries:[], ruck:{ floor:840, l1:750, l2:700, l3:660, cap:570 } };
   save(); b.classList.remove('armed'); b.textContent = 'Reset';
   closeModal('settings'); renderAll(); announce('All athlete data cleared.');
  } else {
   b.classList.add('armed'); b.textContent = 'Click again to wipe';
   setTimeout(function(){ b.classList.remove('armed'); b.textContent = 'Reset'; }, 3000);
  }
 });
}

/* ── Name (shared user config, never hardcoded) ── */
function renderName(){
 var n = null;
 try { n = SyncEngine.get('user', 'name'); } catch(e) {}
 el('heroName').textContent = (n && typeof n === 'string' ? n : 'Athlete').toUpperCase();
}

/* ── Sync status ── */
function setSync(t){ el('syncState').textContent = t; }

/* ── Boot ── */
function boot(){
 loadState();
 renderName();
 renderAll();
 try { if (window.SyncEngine) SyncEngine.onReady(function(){ setSync(SyncEngine.isOnline() ? 'Synced' : 'Local'); }); } catch(e) {}
 setTimeout(function(){ if (!el('syncState').textContent) setSync(SyncEngine.isOnline && SyncEngine.isOnline() ? 'Synced' : 'Local'); }, 2500);
}

el('logBtn').addEventListener('click', function(){ openLog(null); });
el('settingsBtn').addEventListener('click', function(){ openSettings(); });
el('setSave').addEventListener('click', saveSettings);
el('setExport').addEventListener('click', exportState);
el('tabBody').addEventListener('click', function(){ setViz('body'); });
el('tabRadar').addEventListener('click', function(){ setViz('radar'); });
wireReset();

try {
 if (window.Core && Core.background) Core.background.init('bg', { orbCount:2, orbRadius:[60,100], orbSpeed:0.15, hueRange:[250,40], mouseTracking:true });
 else if (typeof initBackground === 'function') initBackground('bg', { orbCount:2, orbRadius:[60,100], orbSpeed:0.15, hueRange:[250,40], mouseTracking:true });
} catch(e) {}
try { if (window.Core && Core.tilt) Core.tilt.init('.container', { maxDeg:2 }); } catch(e) {}
try { if (window.Core && Core.on) Core.on('theme-change', function(){ renderAll(); }); } catch(e) {}

document.addEventListener('visibilitychange', function(){
 if (!document.hidden && window.SyncEngine && SyncEngine.isOnline && SyncEngine.isOnline()){
  try { SyncEngine.pull(NS).then(function(){ loadState(); renderAll(); }); } catch(e) {}
 }
});

var _resizeT = null;
window.addEventListener('resize', function(){
 clearTimeout(_resizeT);
 _resizeT = setTimeout(function(){ if (vizTab === 'radar') drawRadar(computeModel(), 1); }, 180);
});

if (window.SyncEngine && typeof SyncEngine.init === 'function'){
 var raced = false;
 var t = setTimeout(function(){ if (!raced){ raced = true; boot(); } }, 1600);
 try {
  SyncEngine.init({ worker:WORKER, namespaces:[NS, 'user'] })
   .then(function(){ if (!raced){ raced = true; clearTimeout(t); boot(); } });
 } catch(e){
  if (!raced){ raced = true; clearTimeout(t); boot(); }
 }
} else {
 boot();
}
