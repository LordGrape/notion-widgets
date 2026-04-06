/* ═══════════════════════════════════════════════════════
   core.js v3 — Shared Widget Engine
   LordGrape/notion-widgets
   ═══════════════════════════════════════════════════════
   Single import for all widgets. Loads GSAP 3 dynamically.
   Usage: <script src="core.js"></script>
   ═══════════════════════════════════════════════════════ */

/* ── GSAP Dynamic Loader ──────────────────────────────
   Injects GSAP 3 from jsDelivr CDN (~30 KB gzipped).
   All GSAP-dependent systems wait on Core.gsapReady.
   Falls back gracefully to vanilla rAF if load fails.
   ────────────────────────────────────────────────────── */
let _gsapReady = new Promise(function(resolve) {
  let s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js';
  s.onload = function() { resolve(window.gsap); };
  s.onerror = function() {
    console.warn('[core.js] GSAP CDN unreachable — vanilla fallback active.');
    resolve(null);
  };
  document.head.appendChild(s);
});


/* ── Environment Detection (computed once) ── */
let Core = {
  isDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  isLowEnd: !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4),
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  gsapReady: _gsapReady
};

/* Core runtime primitives (event bus, registry, perf monitor) */
let _coreEvents = {};
let _corePlugins = {};
let _perfFrameTimes = [];
let _perfAvgFrameMs = 16.67;
let _perfDropHandlers = [];
let _perfWasLow = false;

Core.on = function(event, callback) {
  if (!_coreEvents[event]) _coreEvents[event] = [];
  _coreEvents[event].push(callback);
};

Core.off = function(event, callback) {
  if (!_coreEvents[event]) return;
  _coreEvents[event] = _coreEvents[event].filter(function(cb) { return cb !== callback; });
};

Core.emit = function(event, data) {
  if (!_coreEvents[event]) return;
  _coreEvents[event].forEach(function(cb) {
    try { cb(data); } catch (e) {}
  });
};

Core.register = function(name, plugin) {
  _corePlugins[name] = plugin;
  return plugin;
};

Core.getPlugin = function(name) {
  return _corePlugins[name] || null;
};

function _coreRecordFrame(dtMs) {
  if (!dtMs || !isFinite(dtMs) || dtMs <= 0) return;
  _perfFrameTimes.push(dtMs);
  if (_perfFrameTimes.length > 120) _perfFrameTimes.shift();
  let sum = 0;
  for (let i = 0; i < _perfFrameTimes.length; i++) sum += _perfFrameTimes[i];
  _perfAvgFrameMs = sum / _perfFrameTimes.length;
  let lowFPS = (1000 / _perfAvgFrameMs) < 30;
  if (lowFPS && !_perfWasLow) {
    _perfDropHandlers.forEach(function(cb) { try { cb(Core.perf.getFPS()); } catch (e) {} });
  }
  _perfWasLow = lowFPS;
}

Core.perf = {
  getFPS: function() { return 1000 / (_perfAvgFrameMs || 16.67); },
  isOverBudget: function() { return _perfAvgFrameMs > 16.67; },
  onDrop: function(callback) {
    if (typeof callback === 'function') _perfDropHandlers.push(callback);
  }
};

/* Live theme tracking — updates derived constants mid-session */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
  Core.isDark = e.matches;
  Core.orbAlpha = Core.isDark ? 0.04 : 0.02;
  Core.particleRGB = Core.isDark ? '167, 139, 250' : '124, 58, 237';
  Core.particleAlphaBase = Core.isDark ? 0.25 : 0.1;
  Core.emit('theme-change', { isDark: Core.isDark });
});

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
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

/* ── Helper: create a gain-connected oscillator with envelope ── */
function _tone(freq, type, attack, hold, decay, volume, startTime) {
  let ctx = getAudioCtx();
  let now = startTime || ctx.currentTime;
  let osc = ctx.createOscillator();
  let gain = ctx.createGain();
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

/* ── Helper: frequency sweep ── */
function _sweep(startHz, endHz, duration, volume, type) {
  let ctx = getAudioCtx(), now = ctx.currentTime;
  let osc = ctx.createOscillator();
  let gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(startHz, now);
  osc.frequency.exponentialRampToValueAtTime(endHz, now + duration);
  gain.gain.setValueAtTime(volume || 0.10, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + duration + 0.01);
}

/* ── 1. CLICK ── */
function playClick() {
  _tone(800, 'sine', 0.003, 0.01, 0.05, 0.12);
}

/* ── 2. OPEN / EXPAND ── */
function playOpen() {
  _sweep(400, 820, 0.08, 0.10, 'sine');
}

/* ── 3. CLOSE / COLLAPSE ── */
function playClose() {
  _sweep(700, 350, 0.065, 0.09, 'sine');
}

/* ── 4. START ── */
function playStart() {
  _tone(523.25, 'sine', 0.005, 0.02, 0.06, 0.14);
  _tone(659.25, 'sine', 0.005, 0.02, 0.08, 0.14, getAudioCtx().currentTime + 0.065);
}

/* ── 5. PAUSE ── */
function playPause() {
  let ctx = getAudioCtx(), now = ctx.currentTime;
  let osc = ctx.createOscillator();
  let gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(500, now);
  gain.gain.setValueAtTime(0.11, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.10);
}

/* ── 6. RESUME ── */
function playResume() {
  _sweep(480, 600, 0.07, 0.09, 'sine');
}

/* ── 7. RESET ── */
function playReset() {
  _tone(659.25, 'sine', 0.005, 0.02, 0.05, 0.10);
  _tone(523.25, 'sine', 0.005, 0.02, 0.07, 0.10, getAudioCtx().currentTime + 0.06);
}

/* ── 8. LAP ── */
function playLap() {
  _tone(1200, 'sine', 0.002, 0.005, 0.03, 0.10);
}

/* ── 9. MODE SWITCH ── */
function playModeSwitch() {
  let ctx = getAudioCtx(), now = ctx.currentTime;
  let bufferSize = ctx.sampleRate * 0.12;
  let buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  let data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
  let src = ctx.createBufferSource(); src.buffer = buffer;
  let bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.setValueAtTime(800, now);
  bp.frequency.exponentialRampToValueAtTime(2400, now + 0.06);
  bp.frequency.exponentialRampToValueAtTime(600, now + 0.12);
  bp.Q.value = 1.8;
  let gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  src.connect(bp); bp.connect(gain); gain.connect(ctx.destination);
  src.start(now); src.stop(now + 0.13);
}

/* ── 10. CHIME ── */
function playChime() {
  let ctx = getAudioCtx(), now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach(function(freq, i) {
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.22);
    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.22 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.22 + 1.4);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now + i * 0.22); osc.stop(now + i * 0.22 + 1.6);
  });
}

/* ── 11. BREAK APPEAR ── */
function playBreakAppear() {
  let ctx = getAudioCtx(), now = ctx.currentTime;
  let osc = ctx.createOscillator();
  let gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.35);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.10, now + 0.15);
  gain.gain.setValueAtTime(0.10, now + 0.20);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.42);
  let osc2 = ctx.createOscillator();
  let gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(330, now);
  osc2.frequency.exponentialRampToValueAtTime(495, now + 0.35);
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.linearRampToValueAtTime(0.04, now + 0.18);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
  osc2.connect(gain2); gain2.connect(ctx.destination);
  osc2.start(now); osc2.stop(now + 0.42);
}

/* ── 12. BREAK DISMISS ── */
function playBreakDismiss() {
  _sweep(330, 200, 0.20, 0.08, 'sine');
}

/* ── 13. ERROR ── */
function playError() {
  _tone(300, 'sine', 0.003, 0.01, 0.03, 0.13);
  _tone(280, 'sine', 0.003, 0.01, 0.04, 0.11, getAudioCtx().currentTime + 0.055);
}

/* ── 14. PRESET SELECT ── */
function playPresetSelect() {
  let ctx = getAudioCtx(), now = ctx.currentTime;
  let bufSize = ctx.sampleRate * 0.015;
  let buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  let d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  let src = ctx.createBufferSource(); src.buffer = buf;
  let hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
  let g = ctx.createGain(); g.gain.setValueAtTime(0.06, now);
  src.connect(hp); hp.connect(g); g.connect(ctx.destination);
  src.start(now); src.stop(now + 0.02);
  _tone(900, 'sine', 0.003, 0.01, 0.06, 0.07);
}


/* ══════════════════════════════════════
   BACKGROUND: Orbs + Layered Particles (v2)
   ══════════════════════════════════════
   v2 upgrades:
   - DPR-aware canvas (crisp on retina displays)
   - gsap.ticker for animation loop (auto tab-throttle)
   - Two-layer particles for parallax depth:
     bg layer = slow, dim, large (reads as distant)
     fg layer = fast, bright, small (reads as close)
   - Smooth mouse interpolation (6% lerp per frame)
   opts: {
     orbCount, particleCount, mouseTracking,
     orbRadius: [min, range], orbSpeed, hueRange: [base, range]
   }
   Returns: { getMouseX(), getMouseY() }
   ══════════════════════════════════════ */
function initBackground(canvasId, opts) {
  opts = opts || {};
  let canvas = document.getElementById(canvasId);
  if (!canvas) return { getMouseX: function() { return 0; }, getMouseY: function() { return 0; } };
  let ctx = canvas.getContext('2d');
  let dpr = Core.dpr;
  let W, H;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  let mouseX = W / 2, mouseY = H / 2;
  let smoothMX = mouseX, smoothMY = mouseY;
  let tracking = opts.mouseTracking !== false;
  if (tracking) {
    document.addEventListener('mousemove', function(e) { mouseX = e.clientX; mouseY = e.clientY; });
  }

  let orbRad = opts.orbRadius || [60, 100];
  let orbSpd = opts.orbSpeed || 0.15;
  let hueR = opts.hueRange || [250, 40];
  let defaultOrbs = Core.isLowEnd ? 1 : (opts.orbCount || 2);

  /* Particle counts per layer */
  let bgCount = opts.particleCount || (Core.isLowEnd ? (Core.isDark ? 4 : 2) : (Core.isDark ? 8 : 5));
  let fgCount = Core.isLowEnd ? 2 : (Core.isDark ? 6 : 4);

  let orbs = [];
  for (let i = 0; i < defaultOrbs; i++) {
    orbs.push({
      x: Math.random() * W, y: Math.random() * H,
      r: orbRad[0] + Math.random() * orbRad[1],
      dx: (Math.random() - 0.5) * orbSpd, dy: (Math.random() - 0.5) * orbSpd,
      hue: hueR[0] + Math.random() * hueR[1],
      alpha: Core.orbAlpha + Math.random() * 0.01
    });
  }

  function makeParticle(speedMul, alphaMul, sizeMul) {
    return {
      x: Math.random() * W, y: Math.random() * H,
      r: (0.6 + Math.random() * 1.8) * (sizeMul || 1),
      speed: (0.08 + Math.random() * 0.2) * (speedMul || 1),
      alpha: Core.particleAlphaBase * (0.3 + Math.random() * 0.7) * (alphaMul || 1),
      flicker: Math.random() * Math.PI * 2
    };
  }

  /* Background layer: slow, dim, large — perceived as distant */
  let bgParticles = [];
  for (let i = 0; i < bgCount; i++) bgParticles.push(makeParticle(0.4, 0.5, 1.3));
  /* Foreground layer: fast, bright, small — perceived as close */
  let fgParticles = [];
  for (let i = 0; i < fgCount; i++) fgParticles.push(makeParticle(1.2, 1.0, 0.7));

  let running = !Core.reducedMotion;
  let time = 0;
  let perfBound = false;
  let lastTs = 0;
  let targetParticleTotal = bgCount + fgCount;

  function drawParticles(arr, t, dt) {
    for (let j = 0; j < arr.length; j++) {
      let p = arr[j];
      p.y -= p.speed * dt;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      let a = p.alpha * (0.5 + 0.5 * Math.sin(t * 0.002 + p.flicker));
      ctx.fillStyle = 'rgba(' + Core.particleRGB + ', ' + a + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function draw(dt, dtMs) {
    if (!running) return;
    time += (16.667 * dt);
    _coreRecordFrame(dtMs || (16.667 * dt));
    ctx.clearRect(0, 0, W, H);

    /* Smooth mouse interpolation — 6% lerp feels weighted */
    if (tracking) {
      smoothMX += (mouseX - smoothMX) * 0.06 * dt;
      smoothMY += (mouseY - smoothMY) * 0.06 * dt;
    }

    /* Orbs */
    for (let i = 0; i < orbs.length; i++) {
      let o = orbs[i];
      if (tracking) {
        o.x += o.dx * dt + (smoothMX - o.x) * 0.0003 * dt;
        o.y += o.dy * dt + (smoothMY - o.y) * 0.0003 * dt;
      } else {
        o.x += o.dx * dt; o.y += o.dy * dt;
      }
      if (o.x < -o.r) o.x = W + o.r; if (o.x > W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = H + o.r; if (o.y > H + o.r) o.y = -o.r;
      let g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, 'hsla(' + o.hue + ', 70%, 50%, ' + o.alpha + ')');
      g.addColorStop(1, 'hsla(' + o.hue + ', 70%, 50%, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    }

    /* Particles: background layer first (painter's order) */
    drawParticles(bgParticles, time, dt);
    drawParticles(fgParticles, time, dt);
  }

  function reduceParticlesOnDrop() {
    targetParticleTotal = Math.max(6, Math.floor(targetParticleTotal * 0.8));
    let keepBg = Math.max(2, Math.floor(targetParticleTotal * 0.55));
    let keepFg = Math.max(2, targetParticleTotal - keepBg);
    if (bgParticles.length > keepBg) bgParticles.length = keepBg;
    if (fgParticles.length > keepFg) fgParticles.length = keepFg;
  }

  Core.perf.onDrop(reduceParticlesOnDrop);

  /* Use gsap.ticker if available, else vanilla rAF */
  _gsapReady.then(function(gsap) {
    if (gsap && !Core.reducedMotion) {
      if (!perfBound) {
        gsap.ticker.add(function() {
          let dt = gsap.ticker.deltaRatio ? gsap.ticker.deltaRatio(60) : 1;
          draw(dt, dt * 16.667);
        });
        perfBound = true;
      }
    } else if (!Core.reducedMotion) {
      function loop(ts) {
        if (!running) { requestAnimationFrame(loop); return; }
        if (!lastTs) lastTs = ts;
        let dtMs = ts - lastTs;
        if (dtMs < 0) dtMs = 16.667;
        let dt = dtMs / 16.667;
        lastTs = ts;
        draw(dt, dtMs);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }
  });

  document.addEventListener('visibilitychange', function() {
    running = !document.hidden && !Core.reducedMotion;
  });

  return { getMouseX: function() { return mouseX; }, getMouseY: function() { return mouseY; } };
}


/* ══════════════════════════════════════
   3D MOUSE TILT (v2)
   ══════════════════════════════════════
   v2 upgrades:
   - Lerp-based interpolation (8% per frame) instead of snap
   - Smooth ease-back to zero on mouse leave
   - gsap.ticker drives the update loop
   opts: { maxDeg: number (default: 3) }
   ══════════════════════════════════════ */
function initTilt(selector, opts) {
  opts = opts || {};
  let maxDeg = opts.maxDeg || 3;
  let el = document.querySelector(selector);
  if (!el || Core.reducedMotion) return;

  let targetRX = 0, targetRY = 0;
  let currentRX = 0, currentRY = 0;
  let ease = 0.08;

  document.addEventListener('mousemove', function(e) {
    let rect = el.getBoundingClientRect();
    let dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    let dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    targetRX = dy * -maxDeg;
    targetRY = dx * maxDeg;
  });

  document.addEventListener('mouseleave', function() {
    targetRX = 0; targetRY = 0;
  });

  function update(dt, dtMs) {
    let step = dt || 1;
    currentRX += (targetRX - currentRX) * ease * step;
    currentRY += (targetRY - currentRY) * ease * step;
    _coreRecordFrame(dtMs || (16.667 * step));
    el.style.transform = 'perspective(800px) rotateX(' + currentRX.toFixed(3) + 'deg) rotateY(' + currentRY.toFixed(3) + 'deg)';
  }

  _gsapReady.then(function(gsap) {
    if (gsap) {
      gsap.ticker.add(function() {
        let dt = gsap.ticker.deltaRatio ? gsap.ticker.deltaRatio(60) : 1;
        update(dt, dt * 16.667);
      });
    } else {
      let lastTs = 0;
      (function loop(ts) {
        if (!lastTs) lastTs = ts;
        let dtMs = ts - lastTs;
        if (dtMs < 0) dtMs = 16.667;
        lastTs = ts;
        update(dtMs / 16.667, dtMs);
        requestAnimationFrame(loop);
      })(performance.now());
    }
  });
}


/* ══════════════════════════════════════
   CONFETTI BURST (v2)
   ══════════════════════════════════════
   v2 upgrades:
   - DPR-aware canvas
   - Per-particle air drag (0.985-0.995) for natural deceleration
   - Lateral wobble via sine wave for realistic tumbling
   - gsap.ticker with auto-cleanup when burst completes
   - Resize handler cleanup to prevent memory leaks
   ══════════════════════════════════════ */
function launchConfetti(canvasId) {
  let cv = document.getElementById(canvasId);
  if (!cv) return;
  let ctx = cv.getContext('2d');
  let dpr = Core.dpr;
  let W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let parts = [];
  let cx = W / 2, cy = H * 0.38;

  for (let i = 0; i < 150; i++) {
    let angle = Math.random() * Math.PI * 2;
    let speed = 3 + Math.random() * 9;
    parts.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed * (0.4 + Math.random() * 0.6),
      vy: Math.sin(angle) * speed * (0.4 + Math.random() * 0.6) - 3,
      w: 4 + Math.random() * 7, h: 3 + Math.random() * 5,
      color: Core.confettiColors[Math.floor(Math.random() * Core.confettiColors.length)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.3,
      a: 1,
      gravity: 0.1 + Math.random() * 0.08,
      drag: 0.985 + Math.random() * 0.01,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.03 + Math.random() * 0.05
    });
  }

  function resizer() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizer);

  let tickFn = null;
  function frame(dt, dtMs) {
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    let step = dt || 1;
    _coreRecordFrame(dtMs || (16.667 * step));
    for (let i = 0; i < parts.length; i++) {
      let p = parts[i];
      if (p.a <= 0) continue;
      alive = true;
      p.vy += p.gravity * step;
      p.vx *= Math.pow(p.drag, step);
      p.vy *= Math.pow(p.drag, step);
      p.wobble += p.wobbleSpeed * step;
      p.x += (p.vx + Math.sin(p.wobble) * 0.5) * step;
      p.y += p.vy * step;
      p.rot += p.rotV * step;
      p.a -= 0.005 * step;
      if (p.a < 0) p.a = 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (!alive) {
      ctx.clearRect(0, 0, W, H);
      window.removeEventListener('resize', resizer);
      if (window.gsap && tickFn) window.gsap.ticker.remove(tickFn);
    }
  }

  _gsapReady.then(function(gsap) {
    if (gsap) {
      tickFn = function() {
        let dt = gsap.ticker.deltaRatio ? gsap.ticker.deltaRatio(60) : 1;
        frame(dt, dt * 16.667);
      };
      gsap.ticker.add(tickFn);
    } else {
      let lastTs = 0;
      (function loop() {
        requestAnimationFrame(function(ts) {
          if (!lastTs) lastTs = ts;
          let dtMs = ts - lastTs;
          if (dtMs < 0) dtMs = 16.667;
          lastTs = ts;
          frame(dtMs / 16.667, dtMs);
          let stillAlive = false;
          for (let i = 0; i < parts.length; i++) { if (parts[i].a > 0) { stillAlive = true; break; } }
          if (stillAlive) loop();
        });
      })();
    }
  });
}


/* ══════════════════════════════════════
   FOCUS STATS (SyncEngine-backed)
   ══════════════════════════════════════ */
function _focusKey() {
  let d = new Date();
  return 'focus_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addFocusSeconds(secs) {
  if (secs < 1) return 0;
  let key = _focusKey();
  let total = (SyncEngine.get('clock', key) || 0) + Math.floor(secs);
  SyncEngine.set('clock', key, total);
  return total;
}

function getTodayFocus() {
  return SyncEngine.get('clock', _focusKey()) || 0;
}

function formatFocusTime(secs) {
  let h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}


/* ══════════════════════════════════════
   PRESENCE TRACKER — Passive time-on-Notion
   ══════════════════════════════════════
   Runs in every widget (all load core.js).
   Session: active tab time since this widget loaded.
   Daily: accumulated across all widgets & sessions.
   Leader-claim pattern: only one widget ticks the
   daily counter (30s intervals). If it closes,
   another widget picks up within ~30s.
   No XP reward — purely informational.
   ══════════════════════════════════════ */
let _presenceAccum = 0;
let _presenceLastActive = Date.now();
let _presenceTabVisible = !document.hidden;

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    _presenceAccum += (Date.now() - _presenceLastActive);
    _presenceTabVisible = false;
  } else {
    _presenceLastActive = Date.now();
    _presenceTabVisible = true;
  }
});

function getSessionPresence() {
  if (!_presenceTabVisible) return Math.floor(_presenceAccum / 1000);
  return Math.floor((_presenceAccum + (Date.now() - _presenceLastActive)) / 1000);
}

function _presenceDateKey() {
  let d = new Date();
  return 'presence_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _tickPresence() {
  if (document.hidden) return;
  let now = Date.now();
  let lastTick = SyncEngine.get('clock', 'presence_last_tick') || 0;
  if (now - lastTick < 25000) return;
  SyncEngine.set('clock', 'presence_last_tick', now);
  let key = _presenceDateKey();
  let total = (SyncEngine.get('clock', key) || 0) + 30;
  SyncEngine.set('clock', key, total);
}

setInterval(_tickPresence, 30000);
setTimeout(_tickPresence, 2000);

function getTodayPresence() {
  return SyncEngine.get('clock', _presenceDateKey()) || 0;
}

function formatPresenceTime(secs) {
  if (secs < 60) return '<1m';
  let h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}


/* ══════════════════════════════════════
   DRAGON XP (cross-widget shared state)
   ══════════════════════════════════════ */
function addDragonXP(amount) {
  let xp = SyncEngine.get('dragon', 'xp') || 0;
  let newXP = xp + Math.floor(amount);
  /* Monotonic: XP can never decrease */
  if (newXP <= xp) return xp;
  /* Daily cap: ~1200 XP/day prevents runaway accumulation */
  let today = new Date().toISOString().split('T')[0];
  let capDate = SyncEngine.get('dragon', '_xpCapDate') || '';
  let capUsed = SyncEngine.get('dragon', '_xpCapUsed') || 0;
  if (capDate !== today) { capDate = today; capUsed = 0; }
  let DAILY_CAP = 1200;
  let allowed = Math.min(Math.floor(amount), DAILY_CAP - capUsed);
  if (allowed <= 0) return xp;
  newXP = xp + allowed;
  SyncEngine.set('dragon', 'xp', newXP);
  SyncEngine.set('dragon', '_xpCapDate', capDate);
  SyncEngine.set('dragon', '_xpCapUsed', capUsed + allowed);
  return newXP;
}

function getDragonXP() {
  return SyncEngine.get('dragon', 'xp') || 0;
}

function getDragonStage() {
  let xp = getDragonXP();
  if (xp >= 120000) return 5;
  if (xp >= 60000)  return 4;
  if (xp >= 20000)  return 3;
  if (xp >= 5000)   return 2;
  if (xp >= 1000)   return 1;
  return 0;
}

/* v3 public namespace surface (global script, no modules) */
let _legacyPlayClick = playClick;
let _legacyPlayOpen = playOpen;
let _legacyPlayClose = playClose;
let _legacyPlayStart = playStart;
let _legacyPlayPause = playPause;
let _legacyPlayResume = playResume;
let _legacyPlayReset = playReset;
let _legacyPlayLap = playLap;
let _legacyPlayModeSwitch = playModeSwitch;
let _legacyPlayChime = playChime;
let _legacyPlayBreakAppear = playBreakAppear;
let _legacyPlayBreakDismiss = playBreakDismiss;
let _legacyPlayError = playError;
let _legacyPlayPresetSelect = playPresetSelect;
let _legacyInitBackground = initBackground;
let _legacyInitTilt = initTilt;
let _legacyLaunchConfetti = launchConfetti;
let _legacyAddFocusSeconds = addFocusSeconds;
let _legacyGetTodayFocus = getTodayFocus;
let _legacyFormatFocusTime = formatFocusTime;
let _legacyGetSessionPresence = getSessionPresence;
let _legacyGetTodayPresence = getTodayPresence;
let _legacyFormatPresenceTime = formatPresenceTime;
let _legacyAddDragonXP = addDragonXP;
let _legacyGetDragonXP = getDragonXP;
let _legacyGetDragonStage = getDragonStage;
let _legacyPlaySummon = playSummon;

Core.audio = {
  click: _legacyPlayClick,
  open: _legacyPlayOpen,
  close: _legacyPlayClose,
  start: _legacyPlayStart,
  pause: _legacyPlayPause,
  resume: _legacyPlayResume,
  reset: _legacyPlayReset,
  lap: _legacyPlayLap,
  modeSwitch: _legacyPlayModeSwitch,
  chime: _legacyPlayChime,
  breakAppear: _legacyPlayBreakAppear,
  breakDismiss: _legacyPlayBreakDismiss,
  error: _legacyPlayError,
  presetSelect: _legacyPlayPresetSelect
};
Core.background = { init: _legacyInitBackground };
Core.tilt = { init: _legacyInitTilt };
Core.confetti = { launch: _legacyLaunchConfetti };
Core.focus = {
  addSeconds: _legacyAddFocusSeconds,
  getToday: _legacyGetTodayFocus,
  formatTime: _legacyFormatFocusTime
};
Core.presence = {
  getSession: _legacyGetSessionPresence,
  getToday: _legacyGetTodayPresence,
  formatTime: _legacyFormatPresenceTime
};
Core.dragon = {
  addXP: _legacyAddDragonXP,
  getXP: _legacyGetDragonXP,
  getStage: _legacyGetDragonStage,
  playSummon: _legacyPlaySummon
};

playClick = function() { return Core.audio.click.apply(null, arguments); };
playOpen = function() { return Core.audio.open.apply(null, arguments); };
playClose = function() { return Core.audio.close.apply(null, arguments); };
playStart = function() { return Core.audio.start.apply(null, arguments); };
playPause = function() { return Core.audio.pause.apply(null, arguments); };
playResume = function() { return Core.audio.resume.apply(null, arguments); };
playReset = function() { return Core.audio.reset.apply(null, arguments); };
playLap = function() { return Core.audio.lap.apply(null, arguments); };
playModeSwitch = function() { return Core.audio.modeSwitch.apply(null, arguments); };
playChime = function() { return Core.audio.chime.apply(null, arguments); };
playBreakAppear = function() { return Core.audio.breakAppear.apply(null, arguments); };
playBreakDismiss = function() { return Core.audio.breakDismiss.apply(null, arguments); };
playError = function() { return Core.audio.error.apply(null, arguments); };
playPresetSelect = function() { return Core.audio.presetSelect.apply(null, arguments); };
initBackground = function() { return Core.background.init.apply(null, arguments); };
initTilt = function() { return Core.tilt.init.apply(null, arguments); };
launchConfetti = function() { return Core.confetti.launch.apply(null, arguments); };
addFocusSeconds = function() { return Core.focus.addSeconds.apply(null, arguments); };
getTodayFocus = function() { return Core.focus.getToday.apply(null, arguments); };
formatFocusTime = function() { return Core.focus.formatTime.apply(null, arguments); };
getSessionPresence = function() { return Core.presence.getSession.apply(null, arguments); };
getTodayPresence = function() { return Core.presence.getToday.apply(null, arguments); };
formatPresenceTime = function() { return Core.presence.formatTime.apply(null, arguments); };
addDragonXP = function() { return Core.dragon.addXP.apply(null, arguments); };
getDragonXP = function() { return Core.dragon.getXP.apply(null, arguments); };
getDragonStage = function() { return Core.dragon.getStage.apply(null, arguments); };
playSummon = function() { return Core.dragon.playSummon.apply(null, arguments); };


/* ══════════════════════════════════════
   CROSS-WIDGET SUMMON SEQUENCE
   ══════════════════════════════════════ */
let SUMMON_DELAY = 1000;
let SUMMON_WINDOW = 4000;
let _summonRoles = [];

function _checkSummon() {
  let now = Date.now();
  let start = parseInt(localStorage.getItem('summon_start') || '0', 10);
  if (now - start < SUMMON_WINDOW + SUMMON_DELAY + 2000) {
    return { start: start, elapsed: now - start };
  }
  let delayedStart = now + SUMMON_DELAY;
  localStorage.setItem('summon_start', String(delayedStart));
  localStorage.setItem('summon_last', String(now));
  return { start: delayedStart, elapsed: now - delayedStart };
}

function _drawSummonEgg(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  let glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2);
  glow.addColorStop(0, 'rgba(' + Core.particleRGB + ', 0.4)');
  glow.addColorStop(1, 'rgba(' + Core.particleRGB + ', 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.55, size * 0.75, 0, 0, Math.PI * 2);
  let eg = ctx.createLinearGradient(-size, -size, size, size);
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
  let bc = Core.isDark ? '#a78bfa' : '#8b5cf6';
  let belly = Core.isDark ? '#ddd6fe' : '#c4b5fd';
  let wc = Core.isDark ? '#8b5cf6' : '#7c3aed';
  let wingY = Math.sin(flapPhase) * size * 0.5;
  let glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.5);
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
  let p = [];
  return {
    add: function(x, y) {
      p.push({ x: x, y: y, life: 1, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, s: 1 + Math.random() * 3 });
      if (p.length > 40) p.shift();
    },
    draw: function(ctx) {
      for (let i = p.length - 1; i >= 0; i--) {
        let q = p[i];
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
    let ctx = getAudioCtx(), now = ctx.currentTime;
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 1.2);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    gain.gain.setValueAtTime(0.08, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 1.5);
    let osc2 = ctx.createOscillator();
    let gain2 = ctx.createGain();
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
  return;
  if (Core.reducedMotion) return;
  if (_summonRoles.indexOf(role) === -1) _summonRoles.push(role);
  let summon = _checkSummon();
  if (!summon) return;
  let oldCv = document.getElementById('summon-' + role);
  if (oldCv) oldCv.remove();
  let stage = getDragonStage();
  let windows = {
    top:    { enter: 0,    exit: 1200 },
    upper:  { enter: 500,  exit: 1700 },
    lower:  { enter: 1000, exit: 2200 },
    bottom: { enter: 1500, exit: 2800 }
  };
  let win = windows[role];
  if (!win) return;
  if (summon.elapsed > win.exit + 1000) return;
  let dpr = window.devicePixelRatio || 1;
  let cv = document.createElement('canvas');
  cv.id = 'summon-' + role;
  cv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;';
  cv.width = window.innerWidth * dpr;
  cv.height = window.innerHeight * dpr;
  document.body.appendChild(cv);
  let ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  let trail = _summonTrail();
  let startTime = summon.start;
  let soundPlayed = false;
  function easeIO(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function anim() {
    let now = Date.now();
    let t = now - startTime;
    if (t > win.exit + 800) { cv.remove(); return; }
    let cW = window.innerWidth, cH = window.innerHeight;
    ctx.clearRect(0, 0, cW, cH);
    let progress = Math.max(0, Math.min(1, (t - win.enter) / (win.exit - win.enter)));
    if (progress <= 0) { requestAnimationFrame(anim); return; }
    if (progress >= 1) { cv.remove(); return; }
    if (!soundPlayed && progress > 0.02) { soundPlayed = true; _playSummonSound(); }
    let x, y, size;
    size = Math.min(cW, cH) * (stage === 0 ? 0.06 : 0.055 + stage * 0.008);
    if (role === 'top') {
      if (progress < 0.6) {
        let p1 = progress / 0.6;
        x = cW * (0.1 + p1 * 0.5);
        y = cH * (0.7 - Math.sin(p1 * Math.PI) * 0.5);
      } else {
        let p2 = (progress - 0.6) / 0.4;
        x = cW * (0.6 + p2 * 0.15);
        y = cH * (0.7 + p2 * 0.5);
      }
    } else if (role === 'upper') {
      if (progress < 0.3) {
        let p1 = progress / 0.3;
        x = cW * (0.3 + p1 * 0.1);
        y = cH * (-0.1 + p1 * 0.5);
      } else if (progress < 0.7) {
        let p2 = (progress - 0.3) / 0.4;
        x = cW * (0.4 + p2 * 0.2);
        y = cH * (0.4 + Math.sin(p2 * Math.PI) * 0.12);
      } else {
        let p3 = (progress - 0.7) / 0.3;
        x = cW * (0.6 + p3 * 0.1);
        y = cH * (0.4 + p3 * 0.7);
      }
    } else if (role === 'lower') {
      if (progress < 0.25) {
        let p1 = progress / 0.25;
        x = cW * (0.6 - p1 * 0.1);
        y = cH * (-0.1 + p1 * 0.45);
      } else if (progress < 0.65) {
        let p2 = (progress - 0.25) / 0.4;
        x = cW * (0.5 - p2 * 0.1);
        y = cH * (0.35 + p2 * 0.2 + Math.sin(p2 * Math.PI) * 0.08);
      } else {
        let p3 = (progress - 0.65) / 0.35;
        x = cW * (0.4 + p3 * 0.1);
        y = cH * (0.55 + p3 * 0.6);
      }
    } else {
      if (progress < 0.4) {
        let p1 = progress / 0.4;
        x = cW * (0.7 - p1 * 0.2);
        y = cH * (-0.1 + p1 * 0.55);
      } else if (progress < 0.7) {
        let p2 = (progress - 0.4) / 0.3;
        x = cW * 0.5;
        y = cH * (0.45 + p2 * 0.08);
      } else {
        let p3 = (progress - 0.7) / 0.3;
        x = cW * 0.5;
        let bounce = Math.sin(p3 * Math.PI * 3) * (1 - p3) * 0.04;
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
      let facing = (role === 'bottom' && progress > 0.4) ? -1 : 1;
      _drawSummonDragon(ctx, x, y, size, t * 0.012, facing);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(anim);
  }
  let delay = Math.max(0, win.enter - summon.elapsed);
  if (delay > 0) setTimeout(function() { requestAnimationFrame(anim); }, delay);
  else requestAnimationFrame(anim);
  setTimeout(function() { if (cv.parentNode) cv.remove(); }, SUMMON_WINDOW + SUMMON_DELAY + 3000);
}


/* ══════════════════════════════════════
   MICRO-INTERACTION UTILITIES (v2)
   ══════════════════════════════════════
   Patterns extracted from Awwwards SOTD winners.
   Each falls back gracefully without GSAP.
   All respect prefers-reduced-motion.
   ══════════════════════════════════════ */

/* ── Magnetic Hover ──────────────────────────────────
   Element subtly drifts toward cursor within a
   detection radius. Seen on Awwwards nav items,
   buttons, interactive cards.
   opts: { radius: 100, strength: 0.3, ease: 0.1 }
   ────────────────────────────────────────────────────── */
Core.magneticHover = function(el, opts) {
  if (Core.reducedMotion) return;
  opts = opts || {};
  let radius = opts.radius || 100;
  let strength = opts.strength || 0.3;
  let ease = opts.ease || 0.1;
  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;

  el.addEventListener('mousemove', function(e) {
    let rect = el.getBoundingClientRect();
    let cx = rect.left + rect.width / 2;
    let cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < radius) {
      let pull = (1 - dist / radius) * strength;
      targetX = dx * pull;
      targetY = dy * pull;
    }
  });

  el.addEventListener('mouseleave', function() {
    targetX = 0; targetY = 0;
  });

  function update(dt, dtMs) {
    let step = dt || 1;
    currentX += (targetX - currentX) * ease * step;
    currentY += (targetY - currentY) * ease * step;
    _coreRecordFrame(dtMs || (16.667 * step));
    el.style.transform = 'translate(' + currentX.toFixed(2) + 'px, ' + currentY.toFixed(2) + 'px)';
  }

  _gsapReady.then(function(gsap) {
    if (gsap) {
      gsap.ticker.add(function() {
        let dt = gsap.ticker.deltaRatio ? gsap.ticker.deltaRatio(60) : 1;
        update(dt, dt * 16.667);
      });
    } else {
      let lastTs = 0;
      (function loop(ts) {
        if (!lastTs) lastTs = ts;
        let dtMs = ts - lastTs;
        if (dtMs < 0) dtMs = 16.667;
        lastTs = ts;
        update(dtMs / 16.667, dtMs);
        requestAnimationFrame(loop);
      })(performance.now());
    }
  });
};

/* ── Stagger Reveal ──────────────────────────────────
   IntersectionObserver-triggered staggered entrance.
   Elements animate in sequentially as they scroll
   into view. The stagger creates visual rhythm.
   opts: { y: 30, duration: 0.6, stagger: 0.08, ease: 'power2.out' }
   ────────────────────────────────────────────────────── */
Core.staggerReveal = function(selector, opts) {
  if (Core.reducedMotion) return;
  opts = opts || {};
  let els = document.querySelectorAll(selector);
  if (!els.length) return;

  for (let i = 0; i < els.length; i++) {
    els[i].style.opacity = '0';
    els[i].style.transform = 'translateY(' + (opts.y || 30) + 'px)';
    els[i].style.transition = 'none';
  }

  _gsapReady.then(function(gsap) {
    if (!gsap) {
      for (let i = 0; i < els.length; i++) {
        els[i].style.opacity = '1';
        els[i].style.transform = 'translateY(0)';
      }
      return;
    }

    let observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          let idx = Array.prototype.indexOf.call(els, entry.target);
          gsap.to(entry.target, {
            opacity: 1, y: 0,
            duration: opts.duration || 0.6,
            ease: opts.ease || 'power2.out',
            delay: idx * (opts.stagger || 0.08)
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    for (let i = 0; i < els.length; i++) observer.observe(els[i]);
  });
};

/* ── Smooth Counter ──────────────────────────────────
   Animated number transition. Counts from current
   displayed value to target with eased interpolation.
   opts: { duration: 1, ease: 'power2.out', decimals: 0, prefix: '', suffix: '' }
   ────────────────────────────────────────────────────── */
Core.smoothCounter = function(el, target, opts) {
  opts = opts || {};
  let current = parseFloat(el.textContent) || 0;
  let decimals = opts.decimals || 0;
  let prefix = opts.prefix || '';
  let suffix = opts.suffix || '';

  _gsapReady.then(function(gsap) {
    if (gsap) {
      let obj = { val: current };
      gsap.to(obj, {
        val: target,
        duration: opts.duration || 1,
        ease: opts.ease || 'power2.out',
        onUpdate: function() {
          el.textContent = prefix + obj.val.toFixed(decimals) + suffix;
        }
      });
    } else {
      el.textContent = prefix + target.toFixed(decimals) + suffix;
    }
  });
};

/* ── Spring Animation ────────────────────────────────
   Quick spring-feel tween for any element.
   Wraps gsap.to with spring-appropriate defaults.
   Use for button press feedback, card hovers, etc.
   opts: { duration: 0.5, ease: 'back.out(1.7)' }
   ────────────────────────────────────────────────────── */
Core.spring = function(el, props, opts) {
  opts = opts || {};
  _gsapReady.then(function(gsap) {
    if (gsap) {
      let tweenVars = {};
      for (let key in props) {
        if (props.hasOwnProperty(key)) tweenVars[key] = props[key];
      }
      tweenVars.duration = opts.duration || 0.5;
      tweenVars.ease = opts.ease || 'back.out(1.7)';
      tweenVars.overwrite = 'auto';
      gsap.to(el, tweenVars);
    } else {
      for (let key in props) {
        if (props.hasOwnProperty(key)) el.style[key] = props[key];
      }
    }
  });
};

/* ── Fade In ─────────────────────────────────────────
   GSAP-powered entrance with transform.
   Combines opacity, translation, and optional scale.
   opts: { y: 20, x: 0, scale: 1, duration: 0.6, delay: 0, ease: 'power2.out' }
   ────────────────────────────────────────────────────── */
Core.fadeIn = function(el, opts) {
  opts = opts || {};
  el.style.opacity = '0';
  _gsapReady.then(function(gsap) {
    if (gsap) {
      gsap.fromTo(el,
        { opacity: 0, y: opts.y || 20, x: opts.x || 0, scale: opts.scale || 1 },
        { opacity: 1, y: 0, x: 0, scale: 1,
          duration: opts.duration || 0.6,
          delay: opts.delay || 0,
          ease: opts.ease || 'power2.out'
        }
      );
    } else {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
  });
};


/* ══════════════════════════════════════
   SYNC ENGINE — Cross-device state layer
   ══════════════════════════════════════
   Self-contained addition to core.js.
   Does not modify existing Core globals.

   Usage:
     SyncEngine.init({ worker: 'https://widget-sync.lordgrape-widgets.workers.dev' })
       .then(function() { ... });
     SyncEngine.get('dragon', 'xp');        // read
     SyncEngine.set('dragon', 'xp', 1200);  // write (local + remote)
     SyncEngine.getAll('dragon');            // full namespace object
     SyncEngine.onReady(function(engine) {}); // callback after first sync
   ══════════════════════════════════════ */

let SyncEngine = (function() {
  let PASS_KEY = '_sync_passphrase';
  let WORKER_URL = '';
  let passphrase = '';
  let online = false;
  let cache = {};         // { namespace: { key: value|{value,_ts} } }
  let pushTimers = {};    // debounce timers per namespace
  let dirtyNamespaces = {};
  let offlineQueue = [];
  let DEBOUNCE = 300;
  let RETRY_INTERVAL = 60000;
  let retryTimer = null;
  let readyCallbacks = [];
  let initDone = false;
  let namespaces = [];    // registered namespace strings

  /* ── BroadcastChannel: cross-widget real-time sync ──
     All widgets on the same origin (lordgrape.github.io)
     share a channel. Passphrase entry in one widget
     propagates to all others instantly. State writes
     are broadcast so every open widget stays current
     without waiting for Cloudflare round-trips.
     ────────────────────────────────────────────────── */
  let _channel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel('widget_sync') : null;

  function _broadcast(msg) {
    if (_channel) try { _channel.postMessage(msg); } catch(e) {}
  }

  function _nowTs() { return Date.now(); }
  function _entryValue(entry) {
    if (entry && typeof entry === 'object' && entry.hasOwnProperty('_ts') && entry.hasOwnProperty('value')) {
      return entry.value;
    }
    return entry;
  }
  function _entryTs(entry) {
    if (entry && typeof entry === 'object' && entry.hasOwnProperty('_ts')) return entry._ts || 0;
    return 0;
  }
  function _normalizeNamespaceObject(raw) {
    let out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (let k in raw) {
      if (!raw.hasOwnProperty(k)) continue;
      let entry = raw[k];
      if (entry && typeof entry === 'object' && entry.hasOwnProperty('_ts') && entry.hasOwnProperty('value')) out[k] = entry;
      else out[k] = { value: entry, _ts: 0 };
    }
    return out;
  }
  function _queueWrite(action) { offlineQueue.push(action); }
  function _drainOfflineQueue() {
    if (!online) return;
    while (offlineQueue.length) {
      let action = offlineQueue.shift();
      if (!action) continue;
      if (action.type === 'set') {
        if (!cache[action.ns]) cache[action.ns] = {};
        cache[action.ns][action.key] = { value: action.value, _ts: action.ts || _nowTs() };
        dirtyNamespaces[action.ns] = true;
      } else if (action.type === 'setMany') {
        if (!cache[action.ns]) cache[action.ns] = {};
        for (let k in action.obj) {
          if (action.obj.hasOwnProperty(k)) cache[action.ns][k] = { value: action.obj[k], _ts: action.ts || _nowTs() };
        }
        dirtyNamespaces[action.ns] = true;
      } else if (action.type === 'remove') {
        if (cache[action.ns]) delete cache[action.ns][action.key];
        dirtyNamespaces[action.ns] = true;
      }
      lsWrite(action.ns);
    }
  }

  if (_channel) {
    _channel.addEventListener('message', function(e) {
      let d = e.data;
      if (!d || !d.type) return;

      /* Another widget entered the passphrase */
      if (d.type === 'passphrase' && !passphrase && d.value) {
        passphrase = d.value;
        localStorage.setItem(PASS_KEY, passphrase);
        /* Dismiss prompt if it is currently showing */
        let ov = document.querySelector('[data-sync-prompt]');
        if (ov) ov.remove();
        /* Kick off remote sync now that we have a passphrase */
        if (WORKER_URL && !online) {
          let pulls = namespaces.map(function(ns) {
            return remoteGet(ns)
              .then(function(remote) {
                cache[ns] = merge(cache[ns], remote);
                lsWrite(ns);
                return remotePut(ns);
              })
              .catch(function() {});
          });
          Promise.all(pulls).then(function() {
            online = true;
            _drainOfflineQueue();
            SyncEngine.flush();
          }).catch(function() {});
        }
      }

      /* Another widget wrote state — merge into our cache */
      if (d.type === 'state_update' && d.namespace && d.data) {
        if (!cache[d.namespace]) cache[d.namespace] = {};
        let patch = _normalizeNamespaceObject(d.data);
        cache[d.namespace] = merge(cache[d.namespace], patch);
        lsWrite(d.namespace);
      }
    });
  }

  /* ── localStorage helpers ── */
  function lsKey(ns) { return '_sync_' + ns; }

  function lsRead(ns) {
    try {
      let raw = localStorage.getItem(lsKey(ns));
      return _normalizeNamespaceObject(raw ? JSON.parse(raw) : {});
    } catch(e) { return {}; }
  }

  function lsWrite(ns) {
    try { localStorage.setItem(lsKey(ns), JSON.stringify(cache[ns] || {})); } catch(e) {}
  }

  /* ── Remote helpers ── */
  function remoteGet(ns) {
    return fetch(WORKER_URL + '/state/' + ns, {
      method: 'GET',
      headers: { 'X-Widget-Key': passphrase }
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) { return d.value || {}; });
  }

  function remotePut(ns) {
    return fetch(WORKER_URL + '/state/' + ns, {
      method: 'PUT',
      headers: {
        'X-Widget-Key': passphrase,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: cache[ns] || {} })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); });
  }

  /* Keys where highest-value-wins, not newest-timestamp-wins */
  let MONOTONIC_KEYS = { xp: true, streak: true };
  /* Keys where values are JSON arrays merged via set union */
  let UNION_KEYS = { achievements: true };

  /* ── Merge: strategy-aware conflict resolution ── */
  function merge(local, remote) {
    let merged = {};
    local = _normalizeNamespaceObject(local || {});
    remote = _normalizeNamespaceObject(remote || {});
    for (let k in local) if (local.hasOwnProperty(k)) merged[k] = local[k];
    for (let k in remote) {
      if (!remote.hasOwnProperty(k)) continue;

      /* Strategy 1: Monotonic — always keep the higher numeric value */
      if (MONOTONIC_KEYS[k]) {
        let localVal = _entryValue(merged[k]) || 0;
        let remoteVal = _entryValue(remote[k]) || 0;
        let maxVal = Math.max(Number(localVal) || 0, Number(remoteVal) || 0);
        merged[k] = { value: maxVal, _ts: Math.max(_entryTs(merged[k] || {}), _entryTs(remote[k])) };
        continue;
      }

      /* Strategy 2: Union — merge arrays without duplicates */
      if (UNION_KEYS[k]) {
        let localArr = [];
        let remoteArr = [];
        try { localArr = JSON.parse(_entryValue(merged[k]) || '[]'); } catch(e) {}
        try { remoteArr = JSON.parse(_entryValue(remote[k]) || '[]'); } catch(e) {}
        if (!Array.isArray(localArr)) localArr = [];
        if (!Array.isArray(remoteArr)) remoteArr = [];
        let unionSet = {};
        localArr.concat(remoteArr).forEach(function(v) { unionSet[v] = true; });
        merged[k] = { value: JSON.stringify(Object.keys(unionSet)), _ts: Math.max(_entryTs(merged[k] || {}), _entryTs(remote[k])) };
        continue;
      }

      /* Strategy 3 (default): Newest timestamp wins */
      if (!merged.hasOwnProperty(k) || _entryTs(remote[k]) >= _entryTs(merged[k])) {
        merged[k] = remote[k];
      }
    }
    return merged;
  }

  /* ── Debounced push ── */
  function schedulePush(ns) {
    if (pushTimers[ns]) clearTimeout(pushTimers[ns]);
    pushTimers[ns] = setTimeout(function() {
      dirtyNamespaces[ns] = true;
      if (!online) return;
      remotePut(ns).then(function() {
        delete dirtyNamespaces[ns];
      }).catch(function() { online = false; scheduleRetry(); });
    }, DEBOUNCE);
  }

  /* ── Retry loop ── */
  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setInterval(function() {
      fetch(WORKER_URL + '/state/ping', {
        method: 'GET',
        headers: { 'X-Widget-Key': passphrase }
      })
      .then(function(r) {
        if (r.ok || r.status === 404) {
          online = true;
          clearInterval(retryTimer);
          retryTimer = null;
          _drainOfflineQueue();
          SyncEngine.flush();
        }
      })
      .catch(function() {});
    }, RETRY_INTERVAL);
  }

  /* ── One-time migration from old localStorage keys ── */
  function migrateOnce() {
    if (localStorage.getItem('_sync_migrated')) return;

    /* Dragon state */
    let dragonKeys = [
      'dragon_xp', 'dragon_rations', 'dragon_morale', 'dragon_readiness',
      'dragon_lastVisit', 'dragon_streak', 'dragon_streakDate',
      'dragon_feedToday', 'dragon_playToday', 'dragon_restToday',
      'dragon_visXPToday', 'dragon_loginToday', 'dragon_todayDate',
      'dragon_lastRandom'
    ];
    dragonKeys.forEach(function(oldKey) {
      let val = localStorage.getItem(oldKey);
      if (val !== null) {
        let newKey = oldKey.replace('dragon_', '');
        let parsed = isNaN(Number(val)) ? val : Number(val);
        if (!cache['dragon']) cache['dragon'] = {};
        cache['dragon'][newKey] = { value: parsed, _ts: 0 };
      }
    });

    /* Focus keys (focus_YYYY-MM-DD) */
    for (let i = 0; i < localStorage.length; i++) {
      let k = localStorage.key(i);
      if (k && k.indexOf('focus_') === 0) {
        if (!cache['clock']) cache['clock'] = {};
        cache['clock'][k] = { value: parseInt(localStorage.getItem(k) || '0', 10), _ts: 0 };
      }
    }

    /* Write migrated data to new localStorage keys */
    namespaces.forEach(function(ns) { lsWrite(ns); });
    localStorage.setItem('_sync_migrated', '1');
  }

  /* ── Passphrase prompt ── */
  function showPrompt() {
    return new Promise(function(resolve) {
      let ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,0.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

      let isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      let card = document.createElement('div');
      card.style.cssText = 'background:' + (isDark ? 'rgba(25,25,35,0.96)' : 'rgba(255,255,255,0.98)') +
        ';border-radius:16px;padding:28px 32px;max-width:320px;width:90%;text-align:center;' +
        'border:1px solid ' + (isDark ? 'rgba(138,92,246,0.15)' : 'rgba(138,92,246,0.12)') +
        ';box-shadow:0 8px 40px rgba(0,0,0,0.25);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;';

      let title = document.createElement('div');
      title.textContent = 'Widget Sync Setup';
      title.style.cssText = 'font-size:14px;font-weight:600;letter-spacing:-0.3px;margin-bottom:6px;' +
        'color:' + (isDark ? 'rgba(255,255,255,0.85)' : '#37352f') + ';';

      let desc = document.createElement('div');
      desc.textContent = 'Enter your sync passphrase to enable cross-device state. ' +
        'Without it, widgets run in local-only mode.';
      desc.style.cssText = 'font-size:11px;font-weight:300;line-height:1.5;margin-bottom:16px;' +
        'color:' + (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(100,100,120,0.6)') + ';letter-spacing:0.2px;';

      let input = document.createElement('input');
      input.type = 'password';
      input.placeholder = 'Passphrase';
      input.style.cssText = 'width:100%;padding:10px 14px;border-radius:10px;border:1px solid ' +
        (isDark ? 'rgba(138,92,246,0.2)' : 'rgba(138,92,246,0.15)') +
        ';background:' + (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(138,92,246,0.04)') +
        ';color:' + (isDark ? '#fff' : '#37352f') +
        ';font-size:13px;font-family:inherit;outline:none;margin-bottom:10px;' +
        'transition:border-color 0.2s;box-sizing:border-box;';
      input.addEventListener('focus', function() { input.style.borderColor = '#8b5cf6'; });
      input.addEventListener('blur', function() {
        input.style.borderColor = isDark ? 'rgba(138,92,246,0.2)' : 'rgba(138,92,246,0.15)';
      });

      let row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;';

      let btnConnect = document.createElement('button');
      btnConnect.textContent = 'Connect';
      btnConnect.style.cssText = 'flex:1;padding:9px 0;border-radius:10px;border:none;cursor:pointer;' +
        'font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;' +
        'background:#8b5cf6;color:#fff;font-family:inherit;transition:transform 0.15s,opacity 0.15s;';
      btnConnect.addEventListener('mouseenter', function() { btnConnect.style.transform = 'scale(1.03)'; });
      btnConnect.addEventListener('mouseleave', function() { btnConnect.style.transform = 'scale(1)'; });

      let btnSkip = document.createElement('button');
      btnSkip.textContent = 'Local Only';
      btnSkip.style.cssText = 'flex:1;padding:9px 0;border-radius:10px;border:1px solid ' +
        (isDark ? 'rgba(138,92,246,0.15)' : 'rgba(138,92,246,0.1)') +
        ';cursor:pointer;font-size:11px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;' +
        'background:transparent;color:' + (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(100,100,120,0.5)') +
        ';font-family:inherit;transition:opacity 0.15s;';

      function submit() {
        let val = input.value.trim();
        if (val) {
          localStorage.setItem(PASS_KEY, val);
          passphrase = val;
          _broadcast({ type: 'passphrase', value: val });
        }
        ov.remove();
        resolve(val);
      }

      btnConnect.addEventListener('click', submit);
      btnSkip.addEventListener('click', function() { ov.remove(); resolve(''); });
      input.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit(); });

      row.appendChild(btnConnect);
      row.appendChild(btnSkip);
      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(input);
      card.appendChild(row);
      ov.setAttribute('data-sync-prompt', 'true');
      ov.appendChild(card);
      document.body.appendChild(ov);
      setTimeout(function() { input.focus(); }, 100);
    });
  }

  /* ── Public API ── */
  return {
    /**
     * Initialize the sync engine.
     * @param {Object} opts
     * @param {string} opts.worker - Full URL of your Cloudflare Worker
     * @param {string[]} opts.namespaces - List of namespace keys to sync
     * @returns {Promise}
     */
    init: function(opts) {
      WORKER_URL = (opts.worker || '').replace(/\/+$/, '');
      namespaces = opts.namespaces || ['dragon', 'clock', 'user'];
      passphrase = localStorage.getItem(PASS_KEY) || '';

      /* Pre-load local cache for every namespace */
      namespaces.forEach(function(ns) { cache[ns] = lsRead(ns); });

      /* Migrate old localStorage keys on first run */
      migrateOnce();

      let chain;
      if (!passphrase) {
        chain = showPrompt();
      } else {
        chain = Promise.resolve(passphrase);
      }

      return chain.then(function(pass) {
        if (!pass || !WORKER_URL) {
          /* Local-only mode */
          online = false;
          initDone = true;
          readyCallbacks.forEach(function(cb) { cb(SyncEngine); });
          Core.emit('sync-ready', { online: false });
          return;
        }
        /* Pull remote state for each namespace, merge, push merged copy back */
        let pulls = namespaces.map(function(ns) {
          return remoteGet(ns)
            .then(function(remote) {
              cache[ns] = merge(cache[ns], remote);
              lsWrite(ns);
              return remotePut(ns);
            })
            .catch(function() {
              /* Remote unreachable: keep local */
            });
        });
        return Promise.all(pulls).then(function() {
          online = true;
          _drainOfflineQueue();
          initDone = true;
          readyCallbacks.forEach(function(cb) { cb(SyncEngine); });
          Core.emit('sync-ready', { online: true });
        }).catch(function() {
          online = false;
          initDone = true;
          scheduleRetry();
          readyCallbacks.forEach(function(cb) { cb(SyncEngine); });
          Core.emit('sync-ready', { online: false });
        });
      });
    },

    /** Read a single key from a namespace. */
    get: function(ns, key) {
      let entry = (cache[ns] || {})[key];
      return entry === undefined ? null : _entryValue(entry);
    },

    /** Read the full namespace object. */
    getAll: function(ns) {
      let src = cache[ns] || {};
      let out = {};
      for (let k in src) if (src.hasOwnProperty(k)) out[k] = _entryValue(src[k]);
      return out;
    },

    /** Write a key. Saves to localStorage immediately, pushes to Worker (debounced). */
    set: function(ns, key, value) {
      if (!cache[ns]) cache[ns] = {};
      let ts = _nowTs();
      cache[ns][key] = { value: value, _ts: ts };
      lsWrite(ns);
      if (!online) _queueWrite({ type: 'set', ns: ns, key: key, value: value, ts: ts });
      schedulePush(ns);
      let patch = {}; patch[key] = { value: value, _ts: ts };
      _broadcast({ type: 'state_update', namespace: ns, data: patch });
    },

    /** Batch-write multiple keys in one namespace. */
    setMany: function(ns, obj) {
      if (!cache[ns]) cache[ns] = {};
      let ts = _nowTs();
      for (let k in obj) {
        if (obj.hasOwnProperty(k)) cache[ns][k] = { value: obj[k], _ts: ts };
      }
      lsWrite(ns);
      if (!online) _queueWrite({ type: 'setMany', ns: ns, obj: obj, ts: ts });
      schedulePush(ns);
      let patch = {};
      for (let k in obj) if (obj.hasOwnProperty(k)) patch[k] = { value: obj[k], _ts: ts };
      _broadcast({ type: 'state_update', namespace: ns, data: patch });
    },

    /** Delete a key. */
    remove: function(ns, key) {
      if (cache[ns]) {
        delete cache[ns][key];
        lsWrite(ns);
        if (!online) _queueWrite({ type: 'remove', ns: ns, key: key, ts: _nowTs() });
        schedulePush(ns);
        let patch = {}; patch[key] = { value: null, _ts: _nowTs() };
        _broadcast({ type: 'state_update', namespace: ns, data: patch });
      }
    },

    /** Register a callback for when first sync completes. */
    onReady: function(cb) {
      if (initDone) cb(SyncEngine);
      else readyCallbacks.push(cb);
    },

    /** Push all dirty namespaces in one batch. */
    flush: function() {
      if (!online) return Promise.resolve();
      let pending = Object.keys(dirtyNamespaces).filter(function(ns) { return !!dirtyNamespaces[ns]; });
      if (!pending.length) pending = namespaces.slice();
      return Promise.all(pending.map(function(ns) {
        return remotePut(ns).then(function() { delete dirtyNamespaces[ns]; }).catch(function() {});
      }));
    },

    /** Force a pull from remote for a namespace. */
    pull: function(ns) {
      if (!online) return Promise.resolve();
      return remoteGet(ns).then(function(remote) {
        cache[ns] = merge(cache[ns], remote);
        lsWrite(ns);
      }).catch(function() {});
    },

    /** Force push current cache to remote. */
    push: function(ns) {
      if (!online) return Promise.resolve();
      return remotePut(ns).then(function() {
        delete dirtyNamespaces[ns];
      }).catch(function() {});
    },

    /** Check connectivity status. */
    isOnline: function() { return online; },

    /** Fetch milestones from the Notion bridge (phase 2).
     *  Database ID is stored server-side as NOTION_DB_ID secret.
     *  Optional dbId param overrides the server default. */
    fetchMilestones: function(dbId) {
      if (!online || !passphrase) return Promise.resolve([]);
      let endpoint = WORKER_URL + '/notion/milestones';
      if (dbId) endpoint += '?db=' + encodeURIComponent(dbId);
      return fetch(endpoint, {
        method: 'GET',
        headers: { 'X-Widget-Key': passphrase }
      })
      .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(d) { return d.items || []; })
      .catch(function() { return []; });
    }
  };
})();
