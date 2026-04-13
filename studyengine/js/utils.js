/* Relocated module-local vars from state.js */
    var toastEl = null;
    var toastTimer = null;

/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function uid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    function esc(s){
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ── Sidebar State (Standalone) ── */
    var sidebarSelection = { level: 'all', course: null, module: null, topic: null };
    var sidebarExpanded = {}; // keys: course names or module ids, values: booleans

    var VISUAL_WORKER_URL = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/visual';
    var TTS_WORKER_URL = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/tts';
    var ttsAudioCtx = null;
    var ttsCurrentSource = null;

    function getWidgetKey() {
      try {
        if (typeof SyncEngine !== 'undefined') {
          if (SyncEngine._key) return SyncEngine._key;
          if (SyncEngine.key) return SyncEngine.key;
          if (SyncEngine.passphrase) return SyncEngine.passphrase;
        }
      } catch (e) {}
      try { if (window.WIDGET_KEY) return window.WIDGET_KEY; } catch (e2) {}
      try { return localStorage.getItem('WIDGET_KEY') || localStorage.getItem('widgetKey') || ''; } catch (e3) {}
      return '';
    }

    function playTTS(text) {
      return new Promise(function(resolve) {
        if (!text || text.length < 3) { resolve(); return; }
        var voiceName = settings.ttsVoice || 'en-US-Studio-O';
        fetch(TTS_WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Widget-Key': getWidgetKey()
          },
          body: JSON.stringify({
            text: String(text).slice(0, 2000),
            voiceName: voiceName
          })
        })
        .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function(d) {
          if (!d || !d.audioContent) { resolve(); return null; }
          var binary = atob(d.audioContent);
          var len = binary.length;
          var bytes = new Uint8Array(len);
          for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          if (!ttsAudioCtx) ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (ttsAudioCtx.state === 'suspended') {
            return ttsAudioCtx.resume().then(function() {
              return ttsAudioCtx.decodeAudioData(bytes.buffer);
            });
          }
          return ttsAudioCtx.decodeAudioData(bytes.buffer);
        })
        .then(function(buffer) {
          if (!buffer || !ttsAudioCtx) { resolve(); return; }
          if (ttsCurrentSource) {
            try { ttsCurrentSource.stop(); } catch (e) {}
          }
          var source = ttsAudioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(ttsAudioCtx.destination);
          source.onended = function() {
            if (ttsCurrentSource === source) ttsCurrentSource = null;
            resolve();
          };
          ttsCurrentSource = source;
          source.start(0);
        })
        .catch(function(err) {
          console.warn('TTS playback failed:', err);
          resolve();
        });
      });
    }

    function stopTTS() {
      if (ttsCurrentSource) {
        try { ttsCurrentSource.stop(); } catch (e) {}
        ttsCurrentSource = null;
      }
      document.querySelectorAll('.listen-tts-btn.playing').forEach(function(btn) {
        btn.classList.remove('playing');
        btn.innerHTML = '🔊 Listen';
      });
    }

    function insertListenButton(targetEl, text) {
      if (!targetEl || !text || text.length < 10) return;
      if (!targetEl.parentElement) return;
      if (targetEl.parentElement.querySelector('.listen-tts-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-tts-btn';
      btn.setAttribute('aria-label', 'Listen to answer');
      btn.innerHTML = '🔊 Listen';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (btn.classList.contains('playing')) {
          stopTTS();
          return;
        }
        stopTTS();
        btn.classList.add('playing');
        btn.innerHTML = '⏹ Stop';
        playTTS(text).then(function() {
          if (!btn.isConnected) return;
          btn.classList.remove('playing');
          btn.innerHTML = '🔊 Listen';
        });
      });
      targetEl.insertAdjacentElement('afterend', btn);
      if (window.gsap) {
        gsap.fromTo(btn, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      }
    }

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) stopTTS();
    });

    async function generateVisual(item) {
      if (!item || !item.prompt || !item.modelAnswer) return null;
      try {
        var res = await fetch(VISUAL_WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Widget-Key': getWidgetKey()
          },
          body: JSON.stringify({
            prompt: item.prompt,
            modelAnswer: item.modelAnswer,
            tier: item.tier || item._presentTier || 'explain',
            course: item.course || '',
            topic: item.topic || '',
            conceptA: item.conceptA || '',
            conceptB: item.conceptB || ''
          })
        });
        if (!res.ok) return null;
        var data = await res.json();
        return data.visual || null;
      } catch (e) {
        console.error('[StudyEngine] Visual generation failed for item:', item && item.id, e);
        return null;
      }
    }

    var mermaidIdCounter = 0;
    var visualGenerationPending = {};

    /* ── Visual Lightbox (click-to-expand) ── */
    var lightboxZoom = 1;
    var lightboxPanX = 0;
    var lightboxPanY = 0;
    var lightboxDragging = false;
    var lightboxLastX = 0;
    var lightboxLastY = 0;

    function applyLightboxTransform(body) {
      var svg = body && body.querySelector('svg');
      if (!svg) return;
      svg.style.transform = 'translate(' + lightboxPanX + 'px,' + lightboxPanY + 'px) scale(' + lightboxZoom + ')';
      svg.style.transformOrigin = 'center center';
    }

    function openVisualLightbox(svgHTML) {
      var ov = el('visualLightbox');
      var body = el('visualLightboxBody');
      if (!ov || !body) return;
      body.innerHTML = svgHTML;
      lightboxZoom = 1;
      lightboxPanX = 0;
      lightboxPanY = 0;
      applyLightboxTransform(body);
      ov.classList.add('show');
      ov.setAttribute('aria-hidden', 'false');
      try { playOpen(); } catch (e) {}
    }

    function closeVisualLightbox() {
      var ov = el('visualLightbox');
      if (!ov) return;
      ov.classList.remove('show');
      ov.setAttribute('aria-hidden', 'true');
      try { playClose(); } catch (e) {}
    }

    (function wireVisualLightbox() {
      document.addEventListener('click', function(e) {
        if (e.target.closest('button, input, textarea, select, .rate, [data-rate], .conf-pill, .listen-tts-btn')) return;
        var closeBtn = e.target.closest('#visualLightboxClose');
        if (closeBtn) {
          e.preventDefault();
          closeVisualLightbox();
          return;
        }
        var ov = el('visualLightbox');
        if (ov && e.target === ov) {
          closeVisualLightbox();
          return;
        }
        var vc = e.target.closest('.visual-container');
        if (!vc) return;
        var svg = vc.querySelector('.mermaid-render svg');
        if (!svg) return;
        e.preventDefault();
        openVisualLightbox(svg.outerHTML);
      });

      document.addEventListener('wheel', function(e) {
        var body = el('visualLightboxBody');
        var ov = el('visualLightbox');
        if (!body || !ov || !ov.classList.contains('show')) return;
        if (!body.contains(e.target) && e.target !== body) return;
        e.preventDefault();
        var delta = e.deltaY > 0 ? -0.1 : 0.1;
        lightboxZoom = Math.max(0.5, Math.min(4, lightboxZoom + delta));
        applyLightboxTransform(body);
      }, { passive: false });

      document.addEventListener('mousedown', function(e) {
        var body = el('visualLightboxBody');
        var ov = el('visualLightbox');
        if (!body || !ov || !ov.classList.contains('show')) return;
        if (!body.contains(e.target)) return;
        lightboxDragging = true;
        lightboxLastX = e.clientX;
        lightboxLastY = e.clientY;
      });

      document.addEventListener('mousemove', function(e) {
        if (!lightboxDragging) return;
        var body = el('visualLightboxBody');
        if (!body) return;
        var dx = (e.clientX - lightboxLastX);
        var dy = (e.clientY - lightboxLastY);
        lightboxPanX += dx;
        lightboxPanY += dy;
        lightboxLastX = e.clientX;
        lightboxLastY = e.clientY;
        applyLightboxTransform(body);
      });

      document.addEventListener('mouseup', function() {
        lightboxDragging = false;
      });

      /* ── Touch: pinch-zoom + drag ── */
      var lightboxTouches = {};
      var lightboxInitialPinchDist = 0;
      var lightboxInitialZoom = 1;

      function getTouchDist(t1, t2) {
        var dx = t1.clientX - t2.clientX;
        var dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
      }

      document.addEventListener('touchstart', function(e) {
        var body = el('visualLightbox') && el('visualLightboxBody');
        var ov = el('visualLightbox');
        if (!body || !ov || !ov.classList.contains('show')) return;
        if (!body.contains(e.target) && e.target !== body) return;
        if (e.touches.length === 2) {
          e.preventDefault();
          lightboxInitialPinchDist = getTouchDist(e.touches[0], e.touches[1]);
          lightboxInitialZoom = lightboxZoom;
        } else if (e.touches.length === 1) {
          lightboxDragging = true;
          lightboxLastX = e.touches[0].clientX;
          lightboxLastY = e.touches[0].clientY;
        }
      }, { passive: false });

      document.addEventListener('touchmove', function(e) {
        var body = el('visualLightboxBody');
        var ov = el('visualLightbox');
        if (!body || !ov || !ov.classList.contains('show')) return;
        if (e.touches.length === 2 && lightboxInitialPinchDist > 0) {
          e.preventDefault();
          var dist = getTouchDist(e.touches[0], e.touches[1]);
          var scale = dist / lightboxInitialPinchDist;
          lightboxZoom = Math.max(0.5, Math.min(4, lightboxInitialZoom * scale));
          applyLightboxTransform(body);
        } else if (e.touches.length === 1 && lightboxDragging) {
          e.preventDefault();
          var dx = e.touches[0].clientX - lightboxLastX;
          var dy = e.touches[0].clientY - lightboxLastY;
          lightboxPanX += dx;
          lightboxPanY += dy;
          lightboxLastX = e.touches[0].clientX;
          lightboxLastY = e.touches[0].clientY;
          applyLightboxTransform(body);
        }
      }, { passive: false });

      document.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) lightboxInitialPinchDist = 0;
        if (e.touches.length === 0) lightboxDragging = false;
      });

      document.addEventListener('keydown', function(e) {
        var ov = el('visualLightbox');
        if (e.key === 'Escape' && ov && ov.classList.contains('show')) {
          closeVisualLightbox();
          e.stopPropagation();
        }
      }, true);
    })();

    function renderMermaidBlock(mermaidCode, placement, itemId) {
      if (!mermaidCode) return '';
      var id = 'mermaid-' + (++mermaidIdCounter);
      var label = (placement === 'prompt') ? 'Visual Cue' : 'Visual Summary';
      var idAttr = itemId ? ' data-item-id="' + esc(itemId) + '"' : '';
      return '' +
        '<div class="visual-container"' + idAttr + ' data-visual-placement="' + esc(placement) + '">' +
          '<div class="visual-label">' + label + '</div>' +
          '<div class="mermaid-render" id="' + id + '" data-mermaid="' + esc(mermaidCode) + '"></div>' +
        '</div>';
    }

    function sanitizeMermaidCode(raw) {
      if (!raw || typeof raw !== 'string') return '';
      var t = raw.trim();
      t = t.replace(/^```mermaid\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap)\b/i.test(t)) {
        var idx = t.search(/\b(graph|flowchart)\s+(TD|LR|TB|BT|RL)\b/i);
        if (idx > 0) t = t.slice(idx);
      }
      var lines = t.split('\n');
      var cleaned = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trimEnd();
        if (/(?:-->|--o|-.->|==>)\|[^|]*$/i.test(line)) continue;
        if (/(?:-->|--o|-.->|==>)\s*$/i.test(line) && i === lines.length - 1) continue;
        cleaned.push(line);
      }
      return cleaned.join('\n').trim();
    }

    function attemptRecoverTruncatedMermaid(elm, code) {
      var wrap = elm.closest('.visual-container');
      var itemId = wrap && wrap.getAttribute('data-item-id');
      var placement = (wrap && wrap.getAttribute('data-visual-placement')) || 'answer';
      if (!itemId || elm.dataset.mermaidRetryDone || !looksIncompleteMermaid(code)) return false;
      elm.dataset.mermaidRetryDone = '1';
      var it = state.items[itemId];
      if (!it) return false;
      delete it.visual;
      state.items[itemId] = it;
      saveState();
      generateVisual(it).then(function(visual) {
        if (!visual || !wrap || !wrap.parentNode) {
          elm.innerHTML = '<pre class="mermaid-fallback">' + esc(code) + '</pre>';
          elm.removeAttribute('data-mermaid');
          return;
        }
        it.visual = visual;
        state.items[itemId] = it;
        saveState();
        wrap.outerHTML = renderMermaidBlock(visual, placement, itemId);
        setTimeout(initMermaidBlocks, 50);
      });
      return true;
    }

    function initMermaidBlocks() {
      if (typeof mermaid === 'undefined') {
        console.warn('[StudyEngine] Mermaid.js not loaded — visual cues will show as code');
        return;
      }
      var blocks = document.querySelectorAll('.mermaid-render[data-mermaid]');
      if (!blocks.length) return;
      blocks.forEach(function(elm) {
        var rawCode = elm.getAttribute('data-mermaid');
        if (!rawCode || elm.querySelector('svg')) return;
        var code = sanitizeMermaidCode(rawCode);
        if (!code) {
          if (attemptRecoverTruncatedMermaid(elm, rawCode)) return;
          elm.innerHTML = '<pre class="mermaid-fallback">' + esc(rawCode) + '</pre>';
          elm.removeAttribute('data-mermaid');
          return;
        }
        var id = elm.id || ('mermaid-auto-' + (++mermaidIdCounter));
        elm.id = id;
        try {
          mermaid.render(id + '-svg', code).then(function(result) {
            elm.innerHTML = result.svg;
            elm.removeAttribute('data-mermaid');
            if (window.gsap) {
              gsap.fromTo(elm, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
            }
          }).catch(function(err) {
            console.warn('[StudyEngine] Mermaid render failed:', err);
            if (attemptRecoverTruncatedMermaid(elm, rawCode)) return;
            elm.innerHTML = '<pre class="mermaid-fallback">' + esc(rawCode) + '</pre>';
            elm.removeAttribute('data-mermaid');
          });
        } catch (e) {
          console.warn('[StudyEngine] Mermaid render exception:', e);
          if (attemptRecoverTruncatedMermaid(elm, rawCode)) return;
          elm.innerHTML = '<pre class="mermaid-fallback">' + esc(rawCode) + '</pre>';
          elm.removeAttribute('data-mermaid');
        }
      });
    }

    function ensureAnswerVisual(it, revealTier) {
      if (!it || !it.id || it.visual || visualGenerationPending[it.id]) return;
      visualGenerationPending[it.id] = true;
      generateVisual(it).then(function(visual) {
        visualGenerationPending[it.id] = false;
        if (!visual) return;
        it.visual = visual;
        state.items[it.id] = it;
        saveState();

        if (!session) return;
        var current = session.queue[session.idx];
        if (!current || current.id !== it.id) return;
        var currentTier = current._presentTier || current.tier || 'quickfire';
        if (currentTier !== revealTier) return;

        if (currentTier === 'quickfire') {
          if (session.currentShown && modelAnswerEl && modelAnswerEl.style.display !== 'none' && !modelAnswerEl.querySelector('.visual-container')) {
            modelAnswerEl.insertAdjacentHTML('beforeend', renderMermaidBlock(visual, 'answer', it.id));
            setTimeout(initMermaidBlocks, 50);
          }
          return;
        }

        var rightAns = document.getElementById('modelAnswerRight');
        if (!rightAns || rightAns.querySelector('.visual-container')) return;
        var slot = rightAns.querySelector('.visual-slot');
        if (slot) {
          slot.insertAdjacentHTML('beforebegin', renderMermaidBlock(visual, 'answer', it.id));
        } else {
          rightAns.insertAdjacentHTML('beforeend', renderMermaidBlock(visual, 'answer', it.id));
        }
        setTimeout(initMermaidBlocks, 50);
      }).catch(function() {
        visualGenerationPending[it.id] = false;
      });
    }

    /** Same heuristics as worker: truncated mid-edge → Mermaid parse fails → raw fallback */
    function looksIncompleteMermaid(s) {
      if (!s || typeof s !== 'string') return true;
      var t = s.trim().replace(/^```mermaid\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      var graphIdx = t.search(/\bgraph\s+(TD|LR)\b/i);
      if (graphIdx === -1) return true;
      t = t.slice(graphIdx).trim();
      var lines = t.split(/\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
      if (lines.length < 2) return true;
      var last = lines[lines.length - 1];
      /* Truncated mid-edge: ends with arrow or arrow+partial label */
      var l = String(last || '').trim();
      if (l.endsWith('-->') || l.endsWith('--o') || l.endsWith('==>')) return true;
      if (l.endsWith('--')) return true;
      /* Unclosed pipe label: has opening | after arrow but no closing | */
      var arrowPos = Math.max(l.lastIndexOf('-->'), l.lastIndexOf('--o'), l.lastIndexOf('==>'));
      if (arrowPos >= 0) {
        var after = l.slice(arrowPos + 3);
        var firstPipe = after.indexOf('|');
        if (firstPipe >= 0) {
          var secondPipe = after.indexOf('|', firstPipe + 1);
          if (secondPipe < 0) return true;
        }
      }
      /* Truncated node definition: opening paren/bracket never closed */
      if (/\([^)]*$/.test(last) || /\[[^\]]*$/.test(last) || /\{[^}]*$/.test(last)) return true;
      /* Truncated quoted string: odd number of double quotes */
      var quoteCount = (last.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) return true;
      return false;
    }

    function tierLabel(tier) {
      return ({
        quickfire: 'QF',
        explain: 'EI',
        apply: 'AI',
        distinguish: 'DI',
        mock: 'ME',
        worked: 'WE'
      })[tier] || '—';
    }

    function tierColour(tier) {
      return ({
        quickfire: getComputedStyle(document.documentElement).getPropertyValue('--tier-qf').trim(),
        explain: getComputedStyle(document.documentElement).getPropertyValue('--tier-ex').trim(),
        apply: getComputedStyle(document.documentElement).getPropertyValue('--tier-ap').trim(),
        distinguish: getComputedStyle(document.documentElement).getPropertyValue('--tier-di').trim(),
        mock: getComputedStyle(document.documentElement).getPropertyValue('--tier-mk').trim(),
        worked: getComputedStyle(document.documentElement).getPropertyValue('--tier-we').trim()
      })[tier] || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    }

    function toRgba(hex, alpha) {
      if (!hex) hex = '#8b5cf6';
      hex = String(hex).trim();
      if (hex.indexOf('var(') === 0) {
        var temp = document.createElement('div');
        temp.style.color = hex;
        document.body.appendChild(temp);
        hex = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        var m = hex.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + (alpha != null ? alpha : 1) + ')';
        return 'rgba(139,92,246,' + (alpha != null ? alpha : 1) + ')';
      }
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      var r = parseInt(hex.substring(0, 2), 16);
      var g = parseInt(hex.substring(2, 4), 16);
      var b = parseInt(hex.substring(4, 6), 16);
      if (isNaN(r)) r = 139;
      if (isNaN(g)) g = 92;
      if (isNaN(b)) b = 246;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha != null ? alpha : 1) + ')';
    }

    function setTierBadge(tier) {
      var badge = document.querySelector('.tier-badge');
      if (!badge) return;
      var config = {
        quickfire: { icon: '⚡', label: 'QF', bg: 'var(--tier-qf)' },
        explain: { icon: '💬', label: 'EI', bg: 'var(--tier-ex)' },
        apply: { icon: '🔧', label: 'AI', bg: 'var(--tier-ap)' },
        distinguish: { icon: '⚖', label: 'DI', bg: 'var(--tier-di)' },
        mock: { icon: '📝', label: 'ME', bg: 'var(--tier-mk)' },
        worked: { icon: '📐', label: 'WE', bg: 'var(--tier-we)' }
      };
      var c = config[tier] || config.quickfire;
      badge.innerHTML = '<span class="tiny">' + c.icon + '</span> ' + c.label;
      badge.style.background = c.bg;
      badge.style.color = '#fff';
      var glow = tierColour(tier);
      badge.style.boxShadow = '0 0 18px ' + toRgba(glow || '#8b5cf6', 0.3);
      if (window.gsap) {
        gsap.fromTo(badge, { scale: 0.85, opacity: 0.6 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' });
      }
      var sessionTierText = el('sessionTierText');
      if (sessionTierText) sessionTierText.textContent = tierLabel(tier);
      var sessionTierDot = document.querySelector('.session-tier-pill .tiny');
      if (sessionTierDot) sessionTierDot.style.color = glow;
    }

    function showView(nextId) {
      var views = [viewDash, viewSession, viewDone];
      var next = el(nextId);
      // Clean up any stale calendar heatmap tooltips
      document.querySelectorAll('.cal-heatmap-tooltip').forEach(function(t) { t.remove(); });
      views.forEach(function(v){ v.classList.remove('active'); });
      next.classList.add('active');

      /* Standalone: session mode collapses sidebar */
      if (!isEmbedded) {
        if (nextId === 'viewSession' || nextId === 'viewDone') document.body.classList.add('in-session');
        else if (nextId === 'viewDash') document.body.classList.remove('in-session');
      }

      /* Standalone: avoid context views "sticking" outside dashboard */
      if (!isEmbedded) {
        if (nextId !== 'viewDash') {
          try { hideContextViews(); } catch (eCtx) {}
        }
      }

      /* Hide/show nav tabs during session */
      var navTabs = document.querySelector('.nav-tabs');
      if (navTabs) {
        if (nextId === 'viewSession' || nextId === 'viewDone') {
          navTabs.style.display = 'none';
        } else {
          navTabs.style.display = 'flex';
        }
      }

      /* When returning to dashboard, restore the active tab */
      if (nextId === 'viewDash') {
        switchNav(activeNav);
      }

      if (window.gsap) {
        gsap.fromTo(next, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }
    }

    function countDue(itemsById, course, topic) {
      var now = Date.now();
      var out = { total: 0, byTier: { quickfire:0, explain:0, apply:0, distinguish:0, mock:0, worked:0 } };
      for (var id in itemsById) {
        if (!itemsById.hasOwnProperty(id)) continue;
        var it = itemsById[id];
        if (!it || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        if (course && course !== 'All' && it.course !== course) continue;
        if (topic && topic !== 'All' && (it.topic || '') !== topic) continue;
        var f = it.fsrs || null;
        var due = f && f.due ? new Date(f.due).getTime() : 0;
        var isDue = (!f || !f.lastReview) ? true : (due <= now);
        if (isDue) {
          out.total++;
          var hasMockField = it.timeLimitMins && it.timeLimitMins > 0;
          var hasDistinguish = it.conceptA && it.conceptB;
          var hasApply = it.task || it.scenario;
          var paraCount = (it.modelAnswer || '').split('\n\n').filter(function(s) { return String(s).trim(); }).length;
          var dt = 'quickfire';
          if (hasMockField) {
            dt = 'mock';
          } else if (hasDistinguish) {
            dt = 'distinguish';
          } else if (hasApply) {
            dt = 'apply';
          } else if (paraCount >= 2) {
            dt = 'worked';
          }
          if (out.byTier[dt] != null) out.byTier[dt]++;
        }
      }
      return out;
    }

    function avgRetention(itemsById) {
      var now = Date.now();
      var sum = 0, n = 0;
      for (var id in itemsById) {
        if (!itemsById.hasOwnProperty(id)) continue;
        var it = itemsById[id];
        if (!it || !it.fsrs || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        sum += retrievability(it.fsrs, now);
        n++;
      }
      if (!n) return null;
      return sum / n;
    }

    function calibrationPct(cal) {
      if (!cal || !cal.totalSelfRatings) return null;
      var p = (cal.totalActualCorrect || 0) / Math.max(1, cal.totalSelfRatings);
      return clamp(p, 0, 1);
    }

    function icon(name, size) {
      var svg = ICONS[name] || '';
      if (size) {
        svg = svg.replace(/width="\d+"/, 'width="' + size + '"').replace(/height="\d+"/, 'height="' + size + '"');
      }
      return '<span class="se-icon" aria-hidden="true">' + svg + '</span>';
    }

    function fmtMMSS(totalSec) {
      totalSec = Math.max(0, totalSec|0);
      var m = Math.floor(totalSec / 60);
      var s = totalSec % 60;
      return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    function toast(msg) {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText =
          'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);' +
          'z-index:99;padding:10px 12px;border-radius:14px;' +
          'background:rgba(var(--accent-rgb),0.16);border:1px solid rgba(var(--accent-rgb),0.22);' +
          'backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);' +
          'color:var(--text);font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;' +
          'box-shadow:var(--shadow-soft);opacity:0;pointer-events:none;';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      if (toastTimer) clearTimeout(toastTimer);
      if (window.gsap) {
        gsap.to(toastEl, { opacity: 1, y: -4, duration: 0.18, ease: 'power2.out' });
      } else {
        toastEl.style.opacity = '1';
      }
      toastTimer = setTimeout(function() {
        if (window.gsap) gsap.to(toastEl, { opacity: 0, y: 0, duration: 0.22, ease: 'power2.inOut' });
        else toastEl.style.opacity = '0';
      }, 1400);
    }

    function isoNow(){ return new Date().toISOString(); }

    function isoDate() {
      var d = new Date();
      var pad = function(n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function daysBetween(a, b){ return (b - a) / (1000 * 60 * 60 * 24); }

    function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

    function renderMd(text) {
      if (!text) return '';
      if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
        return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
      }
      try {
        var raw = marked.parse(String(text), { breaks: true, gfm: true });
        return DOMPurify.sanitize(raw, {
          ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','del',
            'ul','ol','li','h1','h2','h3','h4','h5','h6',
            'blockquote','code','pre','span','a','table',
            'thead','tbody','tr','th','td','hr','sup','sub'],
          ALLOWED_ATTR: ['href','target','rel','class','style'],
          ADD_ATTR: ['target']
        });
      } catch (e) {
        return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
      }
    }
