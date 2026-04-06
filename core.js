/* ═══════════════════════════════════════════════════════
   core.js — Shared Widget Engine
   LordGrape/notion-widgets
   ═══════════════════════════════════════════════════════
   Single import for all widgets. Zero dependencies.
   Usage: <script src="core.js"></script>
   ═══════════════════════════════════════════════════════ */

/* ── Environment Detection (computed once) ── */
var Core = {
  isDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  isLowEnd: !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4),
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
};

// Derived colour constants used by background + confetti
Core.orbAlpha = Core.isDark ? 0.04 : 0.02;
Core.particleRGB = Core.isDark ? '167, 139, 250' : '124, 58, 237';
Core.particleAlphaBase = Core.isDark ? 0.25 : 0.1;
Core.confettiColors = ['#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe','#ede9fe','#ec4899','#f59e0b','#10b981','#6366f1'];


/* ══════════════════════════════════════
   AUDIO ENGINE — Differentiated Sound Palette
   ══════════════════════════════════════
   Design principles (Material Design + psychoacoustics):
   • Pitch direction signals action: rising = open/begin, falling = close/end
   • Frequency range conveys weight: high (1-5kHz) = attention; low = background
   • Duration signals importance: <80ms = lightweight; 200ms+ = significant
   • Paired sounds are melodic inverses (open/close, start/reset)
   • All sounds are physically plausible — modelled on real acoustic phenomena
   ══════════════════════════════════════ */
var _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

/* ── Helper: create a gain-connected oscillator with envelope ── */
function _tone(freq, type, attack, hold, decay, volume, startTime) {
  var ctx = getAudioCtx();
  var now = startTime || ctx.currentTime;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = type || 'sine';
  if (typeof freq === 'number') {
    osc.frequency.setValueAtTime(freq, now);
  }
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume || 0.12, now + attack);
  gain.gain.setValueAtTime(volume || 0.12, now + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.001, now + attack + hold + decay);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + attack + hold + decay + 0.01);
  return { osc: osc, gain: gain, ctx: ctx, now: now };
}

/* ── Helper: frequency sweep (physically models a struck surface changing tension) ── */
function _sweep(startHz, endHz, duration, volume, type) {
  var ctx = getAudioCtx(), now = ctx.currentTime;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(startHz, now);
  osc.frequency.exponentialRampToValueAtTime(endHz, now + duration);
  gain.gain.setValueAtTime(volume || 0.10, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + duration + 0.01);
}

/* ── 1. CLICK — neutral tap feedback (800Hz, 60ms) ── */
function playClick() {
  _tone(800, 'sine', 0.003, 0.01, 0.05, 0.12);
}

/* ── 2. OPEN / EXPAND — rising pitch, soft attack (400→800Hz, 80ms) ── */
function playOpen() {
  _sweep(400, 820, 0.08, 0.10, 'sine');
}

/* ── 3. CLOSE / COLLAPSE — falling pitch, quick decay (700→350Hz, 65ms) ── */
function playClose() {
  _sweep(700, 350, 0.065, 0.09, 'sine');
}

/* ── 4. START — ascending two-note motif (C5→E5, 130ms) ── */
function playStart() {
  _tone(523.25, 'sine', 0.005, 0.02, 0.06, 0.14);
  _tone(659.25, 'sine', 0.005, 0.02, 0.08, 0.14, getAudioCtx().currentTime + 0.065);
}

/* ── 5. PAUSE — single damped tone (500Hz, 90ms, fast decay) ── */
function playPause() {
  var ctx = getAudioCtx(), now = ctx.currentTime;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(500, now);
  gain.gain.setValueAtTime(0.11, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.10);
}

/* ── 6. RESUME — gentle rising nudge (480→600Hz, 70ms) ── */
function playResume() {
  _sweep(480, 600, 0.07, 0.09, 'sine');
}

/* ── 7. RESET — descending two-note (E5→C5, 120ms) ── */
function playReset() {
  _tone(659.25, 'sine', 0.005, 0.02, 0.05, 0.10);
  _tone(523.25, 'sine', 0.005, 0.02, 0.07, 0.10, getAudioCtx().currentTime + 0.06);
}

/* ── 8. LAP — bright high tick (1200Hz, 35ms) ── */
function playLap() {
  _tone(1200, 'sine', 0.002, 0.005, 0.03, 0.10);
}

/* ── 9. MODE SWITCH — bandpassed noise sweep, breathy "whoosh" (100ms) ── */
function playModeSwitch() {
  var ctx = getAudioCtx(), now = ctx.currentTime;
  var bufferSize = ctx.sampleRate * 0.12;
  var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
  var src = ctx.createBufferSource(); src.buffer = buffer;
  var bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.setValueAtTime(800, now);
  bp.frequency.exponentialRampToValueAtTime(2400, now + 0.06);
  bp.frequency.exponentialRampToValueAtTime(600, now + 0.12);
  bp.Q.value = 1.8;
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  src.connect(bp); bp.connect(gain); gain.connect(ctx.destination);
  src.start(now); src.stop(now + 0.13);
}

/* ── 10. CHIME — ascending triad completion (C5→E5→G5, ~1.6s) ── */
function playChime() {
  var ctx = getAudioCtx(), now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach(function(freq, i) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.22);
    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.22 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.22 + 1.4);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now + i * 0.22); osc.stop(now + i * 0.22 + 1.6);
  });
}

/* ── 11. BREAK APPEAR — warm rising pad (220→330Hz, 350ms, slow swell) ── */
function playBreakAppear() {
  var ctx = getAudioCtx(), now = ctx.currentTime;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.35);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.10, now + 0.15);
  gain.gain.setValueAtTime(0.10, now + 0.20);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.42);
  /* Subtle overtone for warmth (octave + fifth) */
  var osc2 = ctx.createOscillator();
  var gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(330, now);
  osc2.frequency.exponentialRampToValueAtTime(495, now + 0.35);
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.linearRampToValueAtTime(0.04, now + 0.18);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
  osc2.connect(gain2); gain2.connect(ctx.destination);
  osc2.start(now); osc2.stop(now + 0.42);
}

/* ── 12. BREAK DISMISS — inverse of appear: falling, settling (330→200Hz, 200ms) ── */
function playBreakDismiss() {
  _sweep(330, 200, 0.20, 0.08, 'sine');
}

/* ── 13. ERROR / INVALID — double low pulse (300Hz × 2, 100ms total) ── */
function playError() {
  _tone(300, 'sine', 0.003, 0.01, 0.03, 0.13);
  _tone(280, 'sine', 0.003, 0.01, 0.04, 0.11, getAudioCtx().currentTime + 0.055);
}

/* ── 14. PRESET SELECT — soft detent click + pitch hint (100ms) ── */
function playPresetSelect() {
  var ctx = getAudioCtx(), now = ctx.currentTime;
  /* Mechanical click (noise burst) */
  var bufSize = ctx.sampleRate * 0.015;
  var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  var src = ctx.createBufferSource(); src.buffer = buf;
  var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
  var g = ctx.createGain(); g.gain.setValueAtTime(0.06, now);
  src.connect(hp); hp.connect(g); g.connect(ctx.destination);
  src.start(now); src.stop(now + 0.02);
  /* Tonal confirmation */
  _tone(900, 'sine', 0.003, 0.01, 0.06, 0.07);
}


/* ══════════════════════════════════════
   BACKGROUND: Orbs + Particles
   ══════════════════════════════════════
   opts: {
     orbCount:      number  (default: auto by device)
     particleCount: number  (default: auto by device + theme)
     mouseTracking: boolean (default: true — orbs drift toward cursor)
     orbRadius:     [min, range]  (default: [60, 100])
     orbSpeed:      number  (default: 0.15)
     hueRange:      [base, range] (default: [250, 40])
   }
   Returns: { getMouseX(), getMouseY() }
   ══════════════════════════════════════ */
function initBackground(canvasId, opts) {
  opts = opts || {};

  var canvas = document.getElementById(canvasId);
  if (!canvas) return { getMouseX: function() { return 0; }, getMouseY: function() { return 0; } };
  var ctx = canvas.getContext('2d');
  var W, H;

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  var mouseX = innerWidth / 2, mouseY = innerHeight / 2;
  var tracking = opts.mouseTracking !== false;
  if (tracking) {
    document.addEventListener('mousemove', function(e) { mouseX = e.clientX; mouseY = e.clientY; });
  }

  // Orb defaults
  var orbRad = opts.orbRadius || [60, 100];
  var orbSpd = opts.orbSpeed || 0.15;
  var hueR = opts.hueRange || [250, 40];
  var defaultOrbs = Core.isLowEnd ? 1 : (opts.orbCount || 2);
  var defaultParts = opts.particleCount || (Core.isLowEnd ? (Core.isDark ? 6 : 4) : (Core.isDark ? 12 : 8));

  var orbs = Array.from({ length: defaultOrbs }, function() {
    return {
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      r: orbRad[0] + Math.random() * orbRad[1],
      dx: (Math.random() - 0.5) * orbSpd, dy: (Math.random() - 0.5) * orbSpd,
      hue: hueR[0] + Math.random() * hueR[1],
      alpha: Core.orbAlpha + Math.random() * 0.01
    };
  });

  var particles = Array.from({ length: defaultParts }, function() {
    return {
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      r: 0.6 + Math.random() * 1.8, speed: 0.08 + Math.random() * 0.2,
      alpha: Core.particleAlphaBase * (0.3 + Math.random() * 0.7),
      flicker: Math.random() * Math.PI * 2
    };
  });

  var running = !Core.reducedMotion;
  var lastFrame = 0;

  function animate(time) {
    if (!running) return;
    if (time - lastFrame < 32) { requestAnimationFrame(animate); return; }
    lastFrame = time;
    ctx.clearRect(0, 0, W, H);

    // Orbs
    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i];
      if (tracking) {
        o.x += o.dx + (mouseX - o.x) * 0.0003;
        o.y += o.dy + (mouseY - o.y) * 0.0003;
      } else {
        o.x += o.dx; o.y += o.dy;
      }
      if (o.x < -o.r) o.x = W + o.r; if (o.x > W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = H + o.r; if (o.y > H + o.r) o.y = -o.r;
      var g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, 'hsla(' + o.hue + ', 70%, 50%, ' + o.alpha + ')');
      g.addColorStop(1, 'hsla(' + o.hue + ', 70%, 50%, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    }

    // Particles
    for (var j = 0; j < particles.length; j++) {
      var p = particles[j];
      p.y -= p.speed;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      var a = p.alpha * (0.5 + 0.5 * Math.sin(time * 0.002 + p.flicker));
      ctx.fillStyle = 'rgba(' + Core.particleRGB + ', ' + a + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) { running = false; }
    else { running = true; requestAnimationFrame(animate); }
  });

  return { getMouseX: function() { return mouseX; }, getMouseY: function() { return mouseY; } };
}


/* ══════════════════════════════════════
   3D MOUSE TILT
   ══════════════════════════════════════
   opts: {
     maxDeg: number (default: 3)
   }
   ══════════════════════════════════════ */
function initTilt(selector, opts) {
  opts = opts || {};
  var maxDeg = opts.maxDeg || 3;
  var el = document.querySelector(selector);
  if (!el) return;
  var tiltQueued = false;

  document.addEventListener('mousemove', function(e) {
    if (tiltQueued) return;
    tiltQueued = true;
    requestAnimationFrame(function() {
      tiltQueued = false;
      var rect = el.getBoundingClientRect();
      var dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      var dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      el.style.transform = 'perspective(800px) rotateX(' + (dy * -maxDeg) + 'deg) rotateY(' + (dx * maxDeg) + 'deg)';
    });
  });

  document.addEventListener('mouseleave', function() {
    el.style.transform = 'perspective(800px) rotateX(0) rotateY(0)';
  });
}


/* ══════════════════════════════════════
   CONFETTI BURST
   ══════════════════════════════════════
   Fires 150 particles from centre-screen.
   Canvas is auto-resized to viewport.
   ══════════════════════════════════════ */
function launchConfetti(canvasId) {
  var cv = document.getElementById(canvasId);
  if (!cv) return;
  var ctx = cv.getContext('2d');
  cv.width = window.innerWidth; cv.height = window.innerHeight;

  var parts = [];
  var cx = cv.width / 2, cy = cv.height * 0.38;

  for (var i = 0; i < 150; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 3 + Math.random() * 9;
    parts.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed * (0.4 + Math.random() * 0.6),
      vy: Math.sin(angle) * speed * (0.4 + Math.random() * 0.6) - 3,
      w: 4 + Math.random() * 7, h: 3 + Math.random() * 5,
      color: Core.confettiColors[Math.floor(Math.random() * Core.confettiColors.length)],
      rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.3,
      a: 1, gravity: 0.1 + Math.random() * 0.08
    });
  }

  var running = true;
  function animate() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    var alive = false;
    parts.forEach(function(p) {
      if (p.a <= 0) return; alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.vx *= 0.99;
      p.rot += p.rotV; p.a -= 0.006;
      if (p.a < 0) p.a = 0;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = p.a; ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive) requestAnimationFrame(animate);
    else { running = false; ctx.clearRect(0, 0, cv.width, cv.height); }
  }
  requestAnimationFrame(animate);

  // Auto-resize confetti canvas
  window.addEventListener('resize', function() {
    if (running) { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  });
}


/* ══════════════════════════════════════
   FOCUS STATS (localStorage)
   ══════════════════════════════════════
   Shared across stopwatch and timer modes.
   Tracks cumulative focus seconds per calendar day.
   ══════════════════════════════════════ */
function _focusKey() {
  var d = new Date();
  return 'focus_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addFocusSeconds(secs) {
  if (secs < 1) return 0;
  var key = _focusKey();
  var total = parseInt(localStorage.getItem(key) || '0', 10) + Math.floor(secs);
  localStorage.setItem(key, String(total));
  return total;
}

function getTodayFocus() {
  return parseInt(localStorage.getItem(_focusKey()) || '0', 10);
}

function formatFocusTime(secs) {
  var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}


/* ══════════════════════════════════════
   DRAGON XP (cross-widget shared state)
   ══════════════════════════════════════
   Any widget can award XP to the dragon companion
   via addDragonXP(). The dragon widget reads these
   values on each frame to update its display.
   ══════════════════════════════════════ */
function addDragonXP(amount) {
  var xp = parseInt(localStorage.getItem('dragon_xp') || '0', 10);
  xp += Math.floor(amount);
  localStorage.setItem('dragon_xp', String(xp));
  return xp;
}

function getDragonXP() {
  return parseInt(localStorage.getItem('dragon_xp') || '0', 10);
}

function getDragonStage() {
  var xp = getDragonXP();
  if (xp >= 150000) return 5; // Major
  if (xp >= 60000)  return 4; // Captain
  if (xp >= 20000)  return 3; // Lieutenant
  if (xp >= 5000)   return 2; // 2nd Lieutenant
  if (xp >= 1000)   return 1; // Officer Cadet
  return 0;                    // Egg / Recruit
}


/* ══════════════════════════════════════
   CROSS-WIDGET SUMMON SEQUENCE
   ══════════════════════════════════════
   Coordinated dragon flythrough across all widgets
   on first workspace visit after 4+ hours away.
   Each widget calls playSummon('top'|'middle'|'bottom').
   Uses localStorage timestamps for cross-iframe sync.
   ══════════════════════════════════════ */

var SUMMON_GAP = 4 * 3600000;
var SUMMON_WINDOW = 4000;

function _checkSummon() {
  var now = Date.now();
  var last = parseInt(localStorage.getItem('summon_last') || '0', 10);
  var start = parseInt(localStorage.getItem('summon_start') || '0', 10);
  if (now - start < SUMMON_WINDOW + 2000) {
    return { start: start, elapsed: now - start };
  }
  if (now - last < SUMMON_GAP) return null;
  localStorage.setItem('summon_start', String(now));
  localStorage.setItem('summon_last', String(now));
  return { start: now, elapsed: 0 };
}

function _drawSummonEgg(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2);
  glow.addColorStop(0, 'rgba(' + Core.particleRGB + ', 0.4)');
  glow.addColorStop(1, 'rgba(' + Core.particleRGB + ', 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.55, size * 0.75, 0, 0, Math.PI * 2);
  var eg = ctx.createLinearGradient(-size, -size, size, size);
  eg.addColorStop(0, Core.isDark ? '#ddd6fe' : '#c4b5fd');
  eg.addColorStop(0.5, Core.isDark ? '#a78bfa' : '#8b5cf6');
  eg.addColorStop(1, Core.isDark ? '#7c3aed' : '#6d28d9');
  ctx.fillStyle = eg;
  ctx.fill();
  ctx.restore();
}

function _drawSummonDragon(ctx, x, y, size, flapPhase, facing) {
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  var bc = Core.isDark ? '#a78bfa' : '#8b5cf6';
  var belly = Core.isDark ? '#ddd6fe' : '#c4b5fd';
  var wc = Core.isDark ? '#8b5cf6' : '#7c3aed';
  var wingY = Math.sin(flapPhase) * size * 0.5;
  var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.5);
  glow.addColorStop(0, 'rgba(' + Core.particleRGB + ', 0.25)');
  glow.addColorStop(1, 'rgba(' + Core.particleRGB + ', 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wc;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(-size * 0.3, -size * 0.1);
  ctx.quadraticCurveTo(-size * 1.4, wingY - size * 1.0, -size * 2.0, wingY - size * 0.3);
  ctx.quadraticCurveTo(-size * 1.2, wingY + size * 0.3, -size * 0.2, size * 0.15);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.3, -size * 0.1);
  ctx.quadraticCurveTo(size * 1.4, wingY - size * 1.0, size * 2.0, wingY - size * 0.3);
  ctx.quadraticCurveTo(size * 1.2, wingY + size * 0.3, size * 0.2, size * 0.15);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.45, size * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = bc;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, size * 0.1, size * 0.28, size * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = belly;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -size * 0.55, size * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = bc;
  ctx.fill();
  ctx.fillStyle = Core.isDark ? '#c4b5fd' : '#7c3aed';
  ctx.beginPath();
  ctx.arc(-size * 0.1, -size * 0.58, size * 0.055, 0, Math.PI * 2);
  ctx.arc(size * 0.1, -size * 0.58, size * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = Core.isDark ? '#c4b5fd' : '#a78bfa';
  ctx.beginPath();
  ctx.moveTo(-size * 0.12, -size * 0.75);
  ctx.lineTo(-size * 0.06, -size * 0.95);
  ctx.lineTo(0, -size * 0.75);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.75);
  ctx.lineTo(size * 0.06, -size * 0.95);
  ctx.lineTo(size * 0.12, -size * 0.75);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-size * 0.3, size * 0.4);
  ctx.quadraticCurveTo(-size * 0.8, size * 0.6, -size * 0.7, size * 0.2);
  ctx.strokeStyle = bc;
  ctx.lineWidth = size * 0.12;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function _summonTrail() {
  var p = [];
  return {
    add: function(x, y) {
      p.push({ x: x, y: y, life: 1, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, s: 1 + Math.random() * 3 });
      if (p.length > 40) p.shift();
    },
    draw: function(ctx) {
      for (var i = p.length - 1; i >= 0; i--) {
        var q = p[i];
        q.x += q.vx; q.y += q.vy; q.life -= 0.025;
        if (q.life <= 0) { p.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(' + Core.particleRGB + ', ' + (q.life * 0.5) + ')';
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.s * q.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
}

function _playSummonSound() {
  try {
    var ctx = getAudioCtx(), now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 1.2);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    gain.gain.setValueAtTime(0.08, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 1.5);
    var osc2 = ctx.createOscillator();
    var gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(450, now);
    osc2.frequency.exponentialRampToValueAtTime(1350, now + 1.2);
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.04, now + 0.35);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.start(now); osc2.stop(now + 1.5);
  } catch(e) {}
}

function playSummon(role) {
  if (Core.reducedMotion) return;
  var summon = _checkSummon();
  if (!summon) return;
  var stage = getDragonStage();
  var windows = {
    top:    { enter: 0,    exit: 1200 },
    upper:  { enter: 500,  exit: 1700 },
    lower:  { enter: 1000, exit: 2200 },
    bottom: { enter: 1500, exit: 2800 }
  };
  var win = windows[role];
  if (!win) return;
  if (summon.elapsed > win.exit + 1000) return;
  var dpr = window.devicePixelRatio || 1;
  var cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;';
  cv.width = window.innerWidth * dpr;
  cv.height = window.innerHeight * dpr;
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  var trail = _summonTrail();
  var startTime = summon.start;
  var soundPlayed = false;
  function easeIO(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function anim() {
    var now = Date.now();
    var t = now - startTime;
    if (t > win.exit + 800) { cv.remove(); return; }
    var cW = window.innerWidth, cH = window.innerHeight;
    ctx.clearRect(0, 0, cW, cH);
    var progress = Math.max(0, Math.min(1, (t - win.enter) / (win.exit - win.enter)));
    if (progress <= 0) { requestAnimationFrame(anim); return; }
    if (progress >= 1) { cv.remove(); return; }
    if (!soundPlayed && progress > 0.02) { soundPlayed = true; _playSummonSound(); }
    var x, y, size;
    size = Math.min(cW, cH) * (stage === 0 ? 0.06 : 0.055 + stage * 0.008);
    if (role === 'top') {
      if (progress < 0.6) {
        var p1 = progress / 0.6;
        x = cW * (0.1 + p1 * 0.5);
        y = cH * (0.7 - Math.sin(p1 * Math.PI) * 0.5);
      } else {
        var p2 = (progress - 0.6) / 0.4;
        x = cW * (0.6 + p2 * 0.15);
        y = cH * (0.7 + p2 * 0.5);
      }
    } else if (role === 'upper') {
      if (progress < 0.3) {
        var p1 = progress / 0.3;
        x = cW * (0.3 + p1 * 0.1);
        y = cH * (-0.1 + p1 * 0.5);
      } else if (progress < 0.7) {
        var p2 = (progress - 0.3) / 0.4;
        x = cW * (0.4 + p2 * 0.2);
        y = cH * (0.4 + Math.sin(p2 * Math.PI) * 0.12);
      } else {
        var p3 = (progress - 0.7) / 0.3;
        x = cW * (0.6 + p3 * 0.1);
        y = cH * (0.4 + p3 * 0.7);
      }
    } else if (role === 'lower') {
      if (progress < 0.25) {
        var p1 = progress / 0.25;
        x = cW * (0.6 - p1 * 0.1);
        y = cH * (-0.1 + p1 * 0.45);
      } else if (progress < 0.65) {
        var p2 = (progress - 0.25) / 0.4;
        x = cW * (0.5 - p2 * 0.1);
        y = cH * (0.35 + p2 * 0.2 + Math.sin(p2 * Math.PI) * 0.08);
      } else {
        var p3 = (progress - 0.65) / 0.35;
        x = cW * (0.4 + p3 * 0.1);
        y = cH * (0.55 + p3 * 0.6);
      }
    } else {
      if (progress < 0.4) {
        var p1 = progress / 0.4;
        x = cW * (0.7 - p1 * 0.2);
        y = cH * (-0.1 + p1 * 0.55);
      } else if (progress < 0.7) {
        var p2 = (progress - 0.4) / 0.3;
        x = cW * 0.5;
        y = cH * (0.45 + p2 * 0.08);
      } else {
        var p3 = (progress - 0.7) / 0.3;
        x = cW * 0.5;
        var bounce = Math.sin(p3 * Math.PI * 3) * (1 - p3) * 0.04;
        y = cH * (0.53 + bounce);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, p3 - 0.6) / 0.4);
      }
    }
    if (progress > 0.05 && progress < 0.9) {
      trail.add(x, y);
      if (stage > 0) trail.add(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6);
    }
    trail.draw(ctx);
    if (stage === 0) {
      _drawSummonEgg(ctx, x, y, size, t * 0.008);
    } else {
      var facing = (role === 'bottom' && progress > 0.4) ? -1 : 1;
      _drawSummonDragon(ctx, x, y, size, t * 0.012, facing);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(anim);
  }
  var delay = Math.max(0, win.enter - summon.elapsed);
  if (delay > 0) setTimeout(function() { requestAnimationFrame(anim); }, delay);
  else requestAnimationFrame(anim);
}
