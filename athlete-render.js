'use strict';
/* ATHLETE v2 - rendering: body map hero, tier tooltips, attribute
   rows, radar. Requires core.js, athlete-body.js (BODY_DATA) and
   athlete-data.js loaded first. */

/* ── Tooltip ── */
function showTip(e, html){
 var t = el('tip');
 t.innerHTML = html;
 t.hidden = false;
 t.classList.add('on');
 moveTip(e);
}
function moveTip(e){
 var t = el('tip');
 if (t.hidden) return;
 var w = t.offsetWidth, h = t.offsetHeight;
 var x = e.clientX + 14, y = e.clientY + 14;
 if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
 if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
 if (x < 4) x = 4;
 if (y < 4) y = 4;
 t.style.left = x + 'px';
 t.style.top = y + 'px';
}
function hideTip(){
 var t = el('tip');
 t.classList.remove('on');
 t.hidden = true;
}

/* ── Body map ── */
var TIER_NAMES = ['Untested','Below','Entry','Pro','Elite'];

function tierOf(score){
 if (score === null || score === undefined) return 0;
 if (score < 60) return 1;
 if (score < 75) return 2;
 if (score < 90) return 3;
 return 4;
}

var REGION_OWNER = null;
function ownerOf(view, muscle){
 if (!REGION_OWNER){
  REGION_OWNER = {};
  for (var code in BODY_DATA.regions){
   BODY_DATA.regions[code].forEach(function(r){
    REGION_OWNER[r[0] + '|' + r[1]] = code;
   });
  }
 }
 return REGION_OWNER[view + '|' + muscle] || null;
}

function attrModel(model, code){
 for (var i=0;i<model.attrs.length;i++) if (model.attrs[i].code === code) return model.attrs[i];
 return null;
}

function regionTipHtml(code, model){
 var html = '';
 if (code === 'OVR'){
  html = '<div class="tip-name">Overall</div>';
  if (model.ovr === null){
   html += '<div class="tip-sub">Untested</div>';
  } else {
   html += '<div class="tip-score">' + model.ovr + ' <span>/ 99 \u00b7 ' + bandOf(model.ovr) + '</span></div>';
  }
  html += '<div class="tip-sub">Mean of ' + model.testedCount + ' tested attribute' + (model.testedCount === 1 ? '' : 's') + ' out of ' + ATTRS.length + '.</div>';
  return html;
 }
 var info = BODY_DATA.info[code];
 var a = attrModel(model, code);
 html = '<div class="tip-name">' + info.name + '</div>';
 if (a && a.tested){
  html += '<div class="tip-score">' + a.score + ' <span>/ 99 \u00b7 ' + bandOf(a.score) + '</span></div>';
 } else {
  html += '<div class="tip-sub">Untested</div>';
 }
 html += '<div class="tip-blurb">' + info.blurb + '</div>';
 html += '<div class="tip-sub">Fed by: ' + info.fedBy + '</div>';
 if (a && a.tested){
  var lat = latestEntryAmong(a.tests);
  if (lat){
   var t = testById(lat.t);
   html += '<div class="tip-sub">Latest: ' + t.name + ' \u00b7 ' + lat.raw + ' \u00b7 ' + fmtDate(lat.d) + '</div>';
  }
 }
 html += '<div class="tip-hint">Click for history and logging</div>';
 return html;
}

function buildBody(model){
 var wrap = el('bodyWrap');
 if (!wrap) return;
 var html = '';
 ['front','back'].forEach(function(view){
  html += '<svg viewBox="0 -4 100 230" class="bmap" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + view + ' body map">';
  var musc = BODY_DATA.polys[view];
  for (var m in musc){
   var code = ownerOf(view, m);
   var cls = 'muscle';
   if (code){
    var sc = (code === 'OVR') ? model.ovr : (attrModel(model, code) || {}).score;
    if (sc === undefined) sc = null;
    cls += ' m' + tierOf(sc);
   } else {
    cls += ' m0 m-dead';
   }
   for (var i=0;i<musc[m].length;i++){
    html += '<polygon class="' + cls + '" data-view="' + view + '" data-m="' + m + '" points="' + musc[m][i] + '"/>';
   }
  }
  html += '</svg>';
 });
 wrap.innerHTML = html;
 Array.prototype.forEach.call(wrap.querySelectorAll('polygon'), function(p){
  var code = ownerOf(p.getAttribute('data-view'), p.getAttribute('data-m'));
  if (!code) return;
  p.addEventListener('mouseenter', function(e){ showTip(e, regionTipHtml(code, model)); });
  p.addEventListener('mousemove', moveTip);
  p.addEventListener('mouseleave', hideTip);
  p.addEventListener('click', function(){
   hideTip();
   if (code !== 'OVR') openDetail(code);
  });
 });
}

/* ── Hero ── */
function renderHero(model){
 var o = el('ovrNum');
 if (model.ovr === null){ o.textContent = '\u2014'; }
 else {
  var prev = parseInt(o.textContent, 10);
  if (window.Core && Core.smoothCounter && !Core.reducedMotion && isFinite(prev)){
   try { Core.smoothCounter(o, model.ovr, { duration:0.7 }); } catch(e){ o.textContent = String(model.ovr); }
  } else o.textContent = String(model.ovr);
 }
 var band = el('ovrBand');
 if (model.ovr === null){ band.textContent = ''; band.className = 'ovr-band'; }
 else {
  band.textContent = bandOf(model.ovr);
  band.className = 'ovr-band b' + tierOf(model.ovr);
 }
 var tally = el('heroTally');
 if (!model.testedCount){ tally.textContent = 'Log your first result to bring the body online.'; return; }
 var counts = { Elite:0, Pro:0, Entry:0, Below:0 };
 model.attrs.forEach(function(a){ if (a.tested) counts[bandOf(a.score)]++; });
 var parts = [];
 ['Elite','Pro','Entry','Below'].forEach(function(b){ if (counts[b]) parts.push(counts[b] + ' ' + b); });
 var untested = ATTRS.length - model.testedCount;
 if (untested) parts.push(untested + ' untested');
 var worst = null;
 model.attrs.forEach(function(a){ if (a.tested && (!worst || a.score < worst.score)) worst = a; });
 tally.innerHTML = parts.join(' \u00b7 ') + (worst ? '<br>Focus: <span class="limiter">' + BODY_DATA.info[worst.code].name + ' ' + worst.score + '</span>' : '');
}

/* ── Attribute rows ── */
function renderAttrs(model){
 var host = el('attrList');
 host.innerHTML = '';
 model.attrs.forEach(function(a){
  var info = BODY_DATA.info[a.code];
  var row = document.createElement('div');
  row.className = 'item attr' + (a.tested ? '' : ' off');
  row.setAttribute('data-attr', a.code);
  row.setAttribute('role', 'button');
  row.setAttribute('tabindex', '0');
  var deltaHtml = '';
  if (a.delta !== null) deltaHtml = '<div class="attr-delta ' + (a.delta > 0 ? 'up' : 'down') + '">' + (a.delta > 0 ? '\u25b2' : '\u25bc') + Math.abs(a.delta) + '</div>';
  else if (a.tested) deltaHtml = '<div class="attr-delta"></div>';
  else deltaHtml = '<div class="attr-delta">new</div>';
  row.innerHTML = '<div class="attr-code">' + info.short + '</div>' +
   '<div><div class="attr-name">' + info.name + '</div><div class="attr-bar"><i style="width:0%"></i></div></div>' +
   '<div class="attr-score stats-num">' + (a.tested ? a.score : '\u2014') + '</div>' + deltaHtml;
  row.addEventListener('click', function(){ openDetail(a.code); });
  row.addEventListener('keydown', function(ev){ if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); openDetail(a.code); } });
  row.addEventListener('mouseenter', function(e){ showTip(e, regionTipHtml(a.code, model)); });
  row.addEventListener('mousemove', moveTip);
  row.addEventListener('mouseleave', hideTip);
  host.appendChild(row);
  if (a.tested){
   var fill = row.querySelector('.attr-bar i');
   setTimeout(function(f, s){ return function(){ f.style.width = s + '%'; }; }(fill, a.score), 60);
  }
 });
}

/* ── Radar (kept as second view) ── */
function radarColours(){
 var dark = !!(window.Core && Core.isDark);
 var accent = '#8b5cf6';
 try {
  var v = getComputedStyle(document.documentElement).getPropertyValue('--lg-violet').trim();
  if (v) accent = v;
 } catch(e) {}
 return {
  grid:  dark ? 'rgba(196,181,253,0.13)' : 'rgba(124,58,237,0.12)',
  elite: dark ? 'rgba(196,181,253,0.30)' : 'rgba(124,58,237,0.30)',
  label: dark ? 'rgba(255,255,255,0.55)' : 'rgba(36,24,47,0.55)',
  off:   dark ? 'rgba(255,255,255,0.25)' : 'rgba(36,24,47,0.28)',
  stroke: accent,
  fill:  dark ? 'rgba(167,139,250,0.20)' : 'rgba(139,92,246,0.20)'
 };
}
function drawRadar(model, prog){
 var cv = el('radar');
 var cssW = cv.clientWidth || 220;
 var dpr = Math.min(window.devicePixelRatio || 1, 2);
 if (cv.width !== Math.round(cssW * dpr)){ cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssW * dpr); }
 var ctx = cv.getContext('2d');
 ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 ctx.clearRect(0, 0, cssW, cssW);
 var cx = cssW/2, cy = cssW/2, R = cssW/2 - 30;
 var N = ATTRS.length;
 var c = radarColours();
 var ang = function(i){ return -Math.PI/2 + i * 2 * Math.PI / N; };
 var pt = function(i, frac){ return [cx + Math.cos(ang(i)) * R * frac, cy + Math.sin(ang(i)) * R * frac]; };
 var i, j, p;
 var rings = [60/99, 75/99, 90/99, 1];
 for (j=0;j<rings.length;j++){
  ctx.beginPath();
  for (i=0;i<N;i++){ p = pt(i, rings[j]); if (i===0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
  ctx.closePath();
  ctx.strokeStyle = (j === 2) ? c.elite : c.grid;
  ctx.lineWidth = (j === 2) ? 1.4 : 1;
  ctx.stroke();
 }
 ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
 for (i=0;i<N;i++){ p = pt(i, 1); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
 var pgm = (prog === null || prog === undefined) ? 1 : prog;
 ctx.beginPath();
 for (i=0;i<N;i++){
  var a = model.attrs[i];
  var f = (a.tested ? a.score : 0) / 99 * pgm;
  p = pt(i, f);
  if (i===0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
 }
 ctx.closePath();
 ctx.fillStyle = c.fill; ctx.fill();
 ctx.strokeStyle = c.stroke; ctx.lineWidth = 1.6; ctx.stroke();
 for (i=0;i<N;i++){
  var at = model.attrs[i];
  if (!at.tested) continue;
  var ff = at.score / 99 * pgm;
  p = pt(i, ff);
  ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI*2);
  ctx.fillStyle = c.stroke; ctx.fill();
 }
 ctx.font = '700 9px "JetBrains Mono", ui-monospace, monospace';
 ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
 for (i=0;i<N;i++){
  p = pt(i, 1.14);
  ctx.fillStyle = model.attrs[i].tested ? c.label : c.off;
  ctx.fillText(BODY_DATA.info[ATTRS[i].code].short, p[0], p[1]);
 }
}
function animateRadar(model){
 var done = function(){ drawRadar(model, 1); };
 if (window.Core && Core.gsapReady && !Core.reducedMotion){
  Core.gsapReady.then(function(g){
   if (!g){ done(); return; }
   var o = { p:0 };
   g.to(o, { p:1, duration:0.7, ease:'power3.out',
    onUpdate:function(){ drawRadar(model, o.p); },
    onComplete:done });
  });
 } else done();
}

/* ── View tabs: Body (default) / Radar ── */
var vizTab = 'body';
function setViz(tab){
 vizTab = tab;
 el('tabBody').classList.toggle('on', tab === 'body');
 el('tabRadar').classList.toggle('on', tab === 'radar');
 el('bodyWrap').classList.toggle('view-off', tab !== 'body');
 el('radar').classList.toggle('view-off', tab !== 'radar');
 if (tab === 'radar') animateRadar(computeModel());
}

function renderAll(){
 var model = computeModel();
 renderHero(model);
 renderAttrs(model);
 if (vizTab === 'body') buildBody(model);
 else animateRadar(model);
 el('logBtn').classList.toggle('pulse', model.testedCount === 0);
}
