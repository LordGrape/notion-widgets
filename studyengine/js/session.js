/* Relocated module-local vars from state.js */
    var sessionSummary = null;

    function defaultTutorStats() {
      return {
        dontKnows: 0,
        skipsToRating: 0,
        reconstructionSuccesses: 0
      };
    }

    function defaultTutorModeCounts() {
      return {
        socratic: 0,
        teach: 0,
        acknowledge: 0
      };
    }

/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function buildSessionQueue() {
      var now = Date.now();
      var courseFilter = selectedCourse;

      /* 1. Collect all due items */
      var dueItems = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (courseFilter !== 'All' && it.course !== courseFilter) continue;
        if (selectedTopic !== 'All' && (it.topic || '') !== selectedTopic) continue;
        // Sidebar topic/module scoping (standalone)
        if (!isEmbedded && sidebarSelection) {
          if (sidebarSelection.level === 'topic' && sidebarSelection.topic) {
            if ((it.topic || 'General') !== sidebarSelection.topic) continue;
          }
          if (sidebarSelection.level === 'module' && sidebarSelection.course && sidebarSelection.module) {
            var studyMod = getModuleById(sidebarSelection.course, sidebarSelection.module);
            if (studyMod && studyMod.topics && studyMod.topics.length) {
              if (studyMod.topics.indexOf(it.topic) < 0) continue;
            }
          }
        }
        var f = it.fsrs || null;
        var dueTs = f && f.due ? new Date(f.due).getTime() : 0;
        var isDue = (!f || !f.lastReview) ? true : (dueTs <= now);
        if (isDue) dueItems.push(it);
      }
      if (!dueItems.length) return [];

      var sleepBias = getSleepAwareAdvice().bias;
      if (sleepBias === 'new' && dueItems.length > 3) {
        dueItems.sort(function(a, b) {
          var aNew = (!a.fsrs || !a.fsrs.lastReview || (a.fsrs.stability || 0) < 5) ? 0 : 1;
          var bNew = (!b.fsrs || !b.fsrs.lastReview || (b.fsrs.stability || 0) < 5) ? 0 : 1;
          return aNew - bNew;
        });
      } else if (sleepBias === 'review' && dueItems.length > 3) {
        dueItems.sort(function(a, b) {
          var aRev = (a.fsrs && a.fsrs.lastReview && (a.fsrs.stability || 0) >= 5) ? 0 : 1;
          var bRev = (b.fsrs && b.fsrs.lastReview && (b.fsrs.stability || 0) >= 5) ? 0 : 1;
          return aRev - bRev;
        });
      }

      /* 2. Determine target profile */
      var profile = getEffectiveProfile(courseFilter !== 'All' ? courseFilter : null);

      /* 3. Check manual mode */
      var isManual = false;

      /* 4. Bucket items by supported tiers */
      var tierBuckets = { quickfire: [], explain: [], apply: [], distinguish: [], mock: [], worked: [] };
      dueItems.forEach(function(it) {
        /* In manual mode, use the item's stored tier if present */
        if (isManual && it.tier && tierBuckets[it.tier]) {
          tierBuckets[it.tier].push(it);
          return;
        }
        var supported = detectSupportedTiers(it);
        supported.forEach(function(t) {
          if (tierBuckets[t]) tierBuckets[t].push(it);
        });
      });

      /* Shuffle each bucket */
      var tierOrder = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
      tierOrder.forEach(function(t) { shuffle(tierBuckets[t]); });

      /* 5. Calculate target counts with proportional reweighting */
      var limit = parseInt(settings.sessionLimit || 12, 10);
      if (!limit || limit < 1) limit = 12;
      /* Cram mode: increase session size */
      var cram = (courseFilter !== 'All') ? getCramState(courseFilter) : { active: false };
      if (cram.active) {
        limit = Math.ceil(limit * cram.sessionMod);
      }
      var targetTotal = Math.min(limit, dueItems.length);

      var tierCounts = reweightProfile(profile, tierBuckets, targetTotal);

      /* 6. Build the queue: pick items per tier, assign presentationTier */
      var queue = [];
      var usedIds = {};

      tierOrder.forEach(function(t) {
        var count = tierCounts[t] || 0;
        var bucket = tierBuckets[t];
        var picked = 0;
        for (var i = 0; i < bucket.length && picked < count; i++) {
          var it = bucket[i];
          if (usedIds[it.id]) continue;
          /* Clone item reference, attach presentation tier */
          it._presentTier = t;
          queue.push(it);
          usedIds[it.id] = true;
          picked++;
        }
      });

      /* 7. Fill remaining slots — prioritise by importance weight */
      if (queue.length < targetTotal) {
        var remaining = dueItems.filter(function(it) { return !usedIds[it.id]; });
        var cramActive = cram && cram.active;
        remaining.sort(function(a, b) {
          return priorityWeight(b, cramActive) - priorityWeight(a, cramActive);
        });
        remaining.forEach(function(it) {
          if (queue.length >= targetTotal) return;
          it._presentTier = 'quickfire';
          queue.push(it);
          usedIds[it.id] = true;
        });
      }

      /* Priority-weighted duplicate injection: critical/high items get extra slots in cram mode. */
      if (cram.active) {
        var extras = [];
        var cramActive2 = true;
        queue.forEach(function(it) {
          var w = priorityWeight(it, cramActive2);
          if (w >= 2.5 && extras.length < Math.ceil(targetTotal * 0.3)) {
            var clone = Object.assign({}, it);
            clone._presentTier = clone._presentTier || 'quickfire';
            clone._priorityExtra = true;
            extras.push(clone);
          }
        });
        if (extras.length > 0) {
          shuffle(extras);
          queue = queue.concat(extras);
        }
      }

      /* Cram mode: stability-aware interleaving
         Research basis: Brunmair & Richter (2019) — interleaving benefits hold
         under time pressure. Pure stability sorting creates blocked practice.
         Fix: sort by stability, chunk into quartile bands, interleave within bands. */
      if (cram.active && (cram.intensity === 'critical' || cram.intensity === 'high')) {
        /* Sort by stability ascending (weakest first) */
        queue.sort(function(a, b) {
          var sa = (a.fsrs && a.fsrs.stability) ? a.fsrs.stability : 0;
          var sb = (b.fsrs && b.fsrs.stability) ? b.fsrs.stability : 0;
          return sa - sb;
        });
        /* Chunk into quartile bands */
        var bandSize = Math.max(1, Math.ceil(queue.length / 4));
        var bands = [];
        for (var bi = 0; bi < queue.length; bi += bandSize) {
          bands.push(queue.slice(bi, bi + bandSize));
        }
        /* Interleave within each band (by course + tier) */
        var interleavedQueue = [];
        bands.forEach(function(band) {
          interleavedQueue = interleavedQueue.concat(interleaveQueue(band));
        });
        queue = interleavedQueue;
      }

      /* 8. Interleave: alternate tiers + courses for spacing */
      queue = interleaveQueue(queue);

      var overconfTopics = getOverconfidentTopics(selectedCourse);
      if (overconfTopics.length > 0) {
        var overconfSet = {};
        overconfTopics.forEach(function(ot) { overconfSet[ot.topic] = true; });
        var frontLoad = [];
        var rest = [];
        queue.forEach(function(item) {
          if (overconfSet[item.topic || 'General']) frontLoad.push(item);
          else rest.push(item);
        });
        var maxFront = Math.ceil(queue.length * 0.4);
        queue = frontLoad.slice(0, maxFront).concat(rest).concat(frontLoad.slice(maxFront));
      }

      return queue;
    }

    function shuffle(arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }

    function interleaveQueue(queue) {
      /* Group by presentation tier, then round-robin */
      var groups = {};
      queue.forEach(function(it) {
        var t = it._presentTier || 'quickfire';
        if (!groups[t]) groups[t] = [];
        groups[t].push(it);
      });
      var keys = Object.keys(groups);
      keys.forEach(function(k) { shuffle(groups[k]); });

      var out = [];
      var done = false;
      while (!done) {
        done = true;
        for (var i = 0; i < keys.length; i++) {
          if (groups[keys[i]].length) {
            out.push(groups[keys[i]].shift());
            done = false;
          }
        }
      }
      return out;
    }

    function createSessionState(queue, startedAt) {
      var ts = startedAt || Date.now();
      return {
        queue: queue,
        idx: 0,
        loops: {},
        currentShown: false,
        startedAt: ts,
        xp: 0,
        reviewsByTier: { quickfire:0, explain:0, apply:0, distinguish:0, mock:0, worked:0 },
        ratingSum: 0,
        ratingN: 0,
        calBefore: calibrationPct(state.calibration),
        confidence: null,
        recentRatings: [],
        fatigueWarningShown: false,
        tutorStats: defaultTutorStats(),
        tutorModeCounts: defaultTutorModeCounts(),
        sessionRatingsLog: [],
        lastTutorContext: null,
        tutorAnalyticsHistoryKey: 's' + ts
      };
    }

    function persistActiveSessionSnapshot() {
      if (!session || !session.queue || !session.queue.length) return;
      try {
        SyncEngine.set('studyengine', 'activeSession', {
          queue: session.queue.map(function(it) { return it && it.id ? it.id : null; }).filter(Boolean),
          idx: session.idx || 0,
          startedAt: session.startedAt || Date.now(),
          selectedCourse: selectedCourse,
          selectedTopic: selectedTopic
        });
      } catch (e) {}
    }

    function clearActiveSessionSnapshot() {
      try { SyncEngine.set('studyengine', 'activeSession', null); } catch (e) {}
    }

    function dismissResumePrompt() {
      var prompt = document.getElementById('resumeSessionPrompt');
      if (prompt && prompt.parentNode) prompt.remove();
    }

    function resumeSavedSession(snapshot) {
      if (!snapshot || !snapshot.queue || !snapshot.queue.length) return false;
      var rebuiltQueue = snapshot.queue.map(function(id) {
        return state.items[id] || null;
      }).filter(function(it) {
        return !!it && !it.archived;
      });
      if (!rebuiltQueue.length) {
        clearActiveSessionSnapshot();
        return false;
      }
      var idx = Math.max(0, Math.min(parseInt(snapshot.idx || 0, 10), rebuiltQueue.length - 1));
      session = createSessionState(rebuiltQueue, snapshot.startedAt || Date.now());
      session.idx = idx;
      selectedCourse = snapshot.selectedCourse || selectedCourse || 'All';
      selectedTopic = snapshot.selectedTopic || selectedTopic || 'All';
      persistActiveSessionSnapshot();
      dismissResumePrompt();
      showView('viewSession');
      renderCurrentItem();
      toast('Resumed your interrupted session');
      return true;
    }

    function checkForResumableSession() {
      dismissResumePrompt();
      var snapshot = null;
      try { snapshot = SyncEngine.get('studyengine', 'activeSession'); } catch (e) {}
      if (!snapshot || !snapshot.queue || !snapshot.queue.length) return;
      if (!snapshot.startedAt || (Date.now() - snapshot.startedAt) > (4 * 60 * 60 * 1000)) {
        clearActiveSessionSnapshot();
        return;
      }
      var remaining = Math.max(0, snapshot.queue.length - (snapshot.idx || 0));
      if (!remaining) {
        clearActiveSessionSnapshot();
        return;
      }
      var prompt = document.createElement('div');
      prompt.id = 'resumeSessionPrompt';
      prompt.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1200;width:min(340px,calc(100vw - 24px));padding:14px 16px;border-radius:18px;border:1px solid rgba(var(--accent-rgb),0.18);background:rgba(10,14,26,0.88);backdrop-filter:blur(18px);box-shadow:0 18px 42px rgba(0,0,0,0.28);';
      prompt.innerHTML =
        '<div style="font-size:12px;font-weight:700;margin-bottom:4px;">Resume interrupted session?</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);line-height:1.55;">' + remaining + ' card' + (remaining === 1 ? '' : 's') + ' remaining.</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;">' +
          '<button type="button" id="resumeDiscardBtn" class="ghost-btn">Discard</button>' +
          '<button type="button" id="resumeNowBtn" class="big-btn">Resume</button>' +
        '</div>';
      document.body.appendChild(prompt);
      if (window.gsap) gsap.fromTo(prompt, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
      var resumeBtn = document.getElementById('resumeNowBtn');
      if (resumeBtn) resumeBtn.addEventListener('click', function() { resumeSavedSession(snapshot); });
      var discardBtn = document.getElementById('resumeDiscardBtn');
      if (discardBtn) discardBtn.addEventListener('click', function() {
        clearActiveSessionSnapshot();
        dismissResumePrompt();
      });
    }

    function refreshSessionEditButton() {
      var metaEl = document.querySelector('.meta');
      if (!metaEl) return;
      var btn = document.getElementById('sessionEditBtn');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'sessionEditBtn';
        btn.className = 'ghost-btn';
        btn.style.padding = '4px 8px';
        btn.style.marginLeft = 'auto';
        btn.style.display = 'none';
        btn.textContent = '✏ Edit';
        btn.addEventListener('click', function() {
          if (!session || !session.queue || !session.queue[session.idx] || typeof editItem !== 'function') return;
          editItem(session.queue[session.idx].id, {
            onSave: function(updatedItem) {
              if (!updatedItem || !session || !session.queue || !session.queue[session.idx]) return;
              session.queue[session.idx] = updatedItem;
              el('metaCourse').textContent = updatedItem.course || '—';
              el('metaTopic').textContent = updatedItem.topic || '—';
              if ((session.queue[session.idx]._presentTier || session.queue[session.idx].tier || 'quickfire') !== 'apply') {
                el('promptText').innerHTML = '<div class="md-content">' + renderMd(updatedItem.prompt || '') + '</div>';
              }
              if (modelAnswerEl && modelAnswerEl.style.display !== 'none') {
                modelAnswerEl.innerHTML = '<div class="answer-header"><span class="se-icon" style="margin-right:4px"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><polyline points="2,5 8,9 14,5"/></svg></span>Model Answer</div><div class="md-content">' + renderMd(updatedItem.modelAnswer || '') + '</div>';
              }
              var modelAnswerRight = document.getElementById('modelAnswerRight');
              if (modelAnswerRight) modelAnswerRight.innerHTML = '<span class="answer-header">Model Answer</span>' + renderMd(updatedItem.modelAnswer || '') + '<div class="visual-slot"></div>';
              refreshSessionEditButton();
            }
          });
        });
        metaEl.appendChild(btn);
      }
      btn.style.display = (session && session.currentShown) ? 'inline-flex' : 'none';
    }

    function startSession() {
      try {
        console.log('[StudyEngine] startSession called, items:', Object.keys(state.items || {}).length);
        var q = buildSessionQueue();
        session = {
          queue: q,
          idx: 0,
          loops: {}, /* itemId -> again count in-session */
          currentShown: false,
          startedAt: Date.now(),
          xp: 0,
          reviewsByTier: { quickfire:0, explain:0, apply:0, distinguish:0, mock:0, worked:0 },
          ratingSum: 0,
          ratingN: 0,
          calBefore: calibrationPct(state.calibration),
          confidence: null,  /* 'low' | 'medium' | 'high' — set before reveal on quickfire */
          recentRatings: [], /* rolling window for fatigue detection */
          fatigueWarningShown: false, /* only show once per session */
          tutorStats: defaultTutorStats(),
          tutorModeCounts: defaultTutorModeCounts(),
          sessionRatingsLog: [],
          lastTutorContext: null,  /* { mode, turns, hadDialogue, wasDontKnow } — set by tutor flows */
          tutorAnalyticsHistoryKey: 's' + Date.now()
        };
        session = createSessionState(q, session.startedAt);
        /* Reset dragon done view for next session */
        var oldDragonImg = document.querySelector('.done-dragon-img');
        if (oldDragonImg) oldDragonImg.remove();
        var oldOrb = document.getElementById('doneDragonOrb');
        if (oldOrb) { oldOrb.style.display = ''; oldOrb.textContent = '🥚'; }
        var oldXPBar = document.getElementById('sessionXPBar');
        if (oldXPBar) oldXPBar.remove();
        sessionSummary = null;
        breakState.sessionStartTime = Date.now();
        breakState.lastBreakTime = 0;
        breakState.breaksTaken = 0;
        breakState.bannerDismissed = false;
        if (!q.length) return;
        persistActiveSessionSnapshot();
        var prevSum = el('sessionAiSummaryWrap');
        if (prevSum) prevSum.style.display = 'none';
        showView('viewSession');
        try { document.body.classList.add('in-session'); } catch(e) {}
        /* Insert session XP bar if not already present */
        var sessionTop = document.querySelector('#viewSession .session-top');
        if (sessionTop && !document.getElementById('sessionXPBar')) {
          var xpBar = document.createElement('div');
          xpBar.className = 'session-xp-bar';
          xpBar.id = 'sessionXPBar';
          xpBar.innerHTML =
            '<div class="sxp-track">' +
              '<div class="sxp-fill"></div>' +
              '<div class="sxp-glow"></div>' +
            '</div>' +
            '<span class="sxp-label"><span class="sxp-value">0</span><span class="sxp-unit">XP</span></span>';
          sessionTop.insertAdjacentElement('afterend', xpBar);
        }
        updateSessionXPBar();
        try { playStart(); } catch(e) {}
        renderCurrentItem();
        /* Mobile safety: ensure session view is scrolled to top and visible */
        try {
          var sessionView = document.getElementById('viewSession');
          if (sessionView) {
            sessionView.scrollTop = 0;
            sessionView.style.display = 'block';
          }
          window.scrollTo(0, 0);
          document.querySelector('.wrap').scrollTop = 0;
        } catch(scrollErr) {}
      } catch (err) {
        console.error('[StudyEngine] startSession failed:', err);
        try { toast('Session error: ' + (err.message || err)); } catch(e2) {}
        try {
          var fallbackQ = [];
          for (var fid in state.items) {
            if (!state.items.hasOwnProperty(fid)) continue;
            var fit = state.items[fid];
            if (fit && !fit.archived) {
              fit._presentTier = fit.tier || 'quickfire';
              fallbackQ.push(fit);
              if (fallbackQ.length >= 12) break;
            }
          }
          if (fallbackQ.length) {
            session = createSessionState(fallbackQ, Date.now());
            showView('viewSession');
            renderCurrentItem();
          }
        } catch (fallbackErr) {
          console.error('[StudyEngine] Fallback also failed:', fallbackErr);
        }
      }
    }

    function renderCurrentItem() {
      try {
        console.log('[StudyEngine] renderCurrentItem called, idx:', session ? session.idx : 'no session');
        document.querySelectorAll('.listen-tts-btn').forEach(function(btn) { btn.remove(); });
        clearTimers();
        cleanupAskTutor();
        if (session) session.lastTutorContext = null;
        activeRubric = null;
        session.currentShown = false;
        if (session) session.confidence = null;
        if (session) session._dontKnow = false;
        if (session) session._reconstructionPending = false;
        modelAnswerEl.style.display = 'none';
        ratingsEl.style.display = 'none';
        studyIndicator.classList.remove('show');
        var breakHint = el('breakHint');
        if (breakHint) breakHint.classList.remove('show');
        var restudyScreen = el('restudyScreen');
        if (restudyScreen) restudyScreen.classList.remove('show');
        modelAnswerEl.classList.remove('restudy-active');
        var oldBarAtRender = document.getElementById('restudyBarInline');
        if (oldBarAtRender) {
          var oldElabAtRender = oldBarAtRender.nextElementSibling;
          if (oldElabAtRender && oldElabAtRender.classList.contains('restudy-elaboration')) oldElabAtRender.remove();
          oldBarAtRender.remove();
        }
        el('timerBar').classList.remove('show');
        el('metaTimer').style.display = 'none';
        el('timerFill').style.width = '0%';
        el('aiFeedbackArea').innerHTML = '';
        /* Remove side-by-side reveal columns from previous item */
        var oldReveal = document.getElementById('revealColumnsWrap');
        if (oldReveal) oldReveal.remove();
        var oldDkWrap = document.getElementById('dkRevealWrap');
        if (oldDkWrap) oldDkWrap.remove();
        if (tierArea) {
          tierArea.style.display = '';
          tierArea.style.opacity = '';
          tierArea.style.pointerEvents = '';
        }
        if (session) session.aiRating = null;
        if (session) session._isRelearning = false;
        tutorAcknowledgeDone = false;
        tutorAcknowledgeOriginalRating = null;
        tutorOpeningUserText = '';
        tutorInRelearning = false;
        tutorMaxTurns = 3;
        var qfRoot = document.getElementById('qfFollowupRoot');
        if (qfRoot) qfRoot.remove();
        var qfReRoot = document.getElementById('qfReRetrievalRoot');
        if (qfReRoot) qfReRoot.remove();
        var oldHint = document.querySelector('.override-hint');
        if (oldHint) oldHint.remove();
        ratingsEl.querySelectorAll('button').forEach(function(b) {
          b.style.outline = 'none';
          b.style.outlineOffset = '0';
        });

        var it = session.queue[session.idx];
        if (!it) { completeSession(); return; }
        var tier = it._presentTier || it.tier || 'quickfire';

        setTierBadge(tier);
        var ic = document.querySelector('.item-card');
        if (ic) ic.className = 'item-card tier-' + tier;

        var pb = document.querySelector('.pbar');
        if (pb) pb.className = 'pbar tier-' + tier;

        if (tier === 'apply') el('promptText').textContent = 'Scenario';
        else el('promptText').innerHTML = '<div class="md-content">' + renderMd(it.prompt) + '</div>';
        el('metaCourse').textContent = it.course || '—';
        var metaEl = document.querySelector('.meta');
        var existingPriBadge = document.getElementById('metaPriority');
        if (existingPriBadge) existingPriBadge.remove();
        if (metaEl && it.priority && it.priority !== 'medium') {
          var badge = document.createElement('span');
          badge.id = 'metaPriority';
          badge.innerHTML = priorityBadgeHTML(it.priority);
          metaEl.appendChild(badge);
        }
        el('metaTopic').textContent = it.topic || '—';
        refreshSessionEditButton();
        el('courseHint').textContent = (selectedCourse === 'All') ? (it.course || '—') : selectedCourse;

        var n = session.queue.length;
        var progressText = (session.idx + 1) + ' of ' + n;
        var progressPct = Math.round(((session.idx) / Math.max(1, n)) * 100);
        el('progText').textContent = progressText;
        el('progBar').style.width = progressPct + '%';
        if (el('sessionProgText')) el('sessionProgText').textContent = progressText;
        if (el('sessionProgBar')) el('sessionProgBar').style.width = progressPct + '%';
        if (window.gsap) {
          var progBarFill = el('progBar');
          if (progBarFill) {
            gsap.fromTo(progBarFill, { boxShadow: '0 0 8px rgba(var(--accent-rgb), 0.5)' }, { boxShadow: '0 0 0 rgba(var(--accent-rgb), 0)', duration: 0.6, ease: 'power2.out' });
          }
        }

        tierArea.innerHTML = '';
        if (tier === 'quickfire') renderQuickfireTier(it, session);
        else if (tier === 'explain') renderExplainTier(it, session);
        else if (tier === 'apply') renderApplyTier(it, session);
        else if (tier === 'worked') renderWorkedTier(it, session);
        else if (tier === 'distinguish') renderDistinguishTier(it, session);
        else if (tier === 'mock') renderMockTier(it, session);

        if (window.gsap) {
          var cardEnter = document.querySelector('.item-card');
          if (cardEnter) {
            gsap.killTweensOf(cardEnter);
            gsap.fromTo(cardEnter,
              { opacity: 0, y: 60, scale: 0.95, rotationX: 4 },
              { opacity: 1, y: 0, scale: 1, rotationX: 0, duration: 0.55, ease: 'back.out(1.4)', clearProps: 'rotationX' }
            );
            var staggerEls = cardEnter.querySelectorAll('.meta, .prompt, #tierArea, .divider');
            if (staggerEls.length) {
              gsap.fromTo(staggerEls, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.06, delay: 0.15 });
            }
          }
        }
      } catch (mobileErr) {
        console.error('[StudyEngine] renderCurrentItem failed:', mobileErr);
        /* Fallback: show a minimal but functional card */
        var fallbackItem = session && session.queue && session.queue[session.idx];
        if (fallbackItem && tierArea) {
          var safePrompt = String(fallbackItem.prompt || 'No prompt').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          var safeAnswer = String(fallbackItem.modelAnswer || 'No answer').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          tierArea.innerHTML =
            '<div style="padding:16px;color:var(--text);font-size:14px;line-height:1.6;">' +
            '<p style="font-weight:700;margin-bottom:8px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-secondary);">PROMPT</p>' +
            '<p style="margin-bottom:16px;">' + safePrompt + '</p>' +
            '<hr style="border:none;border-top:1px solid rgba(var(--accent-rgb),0.12);margin:12px 0;">' +
            '<p style="font-weight:700;margin-bottom:8px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-secondary);">ANSWER</p>' +
            '<p>' + safeAnswer + '</p>' +
            '</div>';
          if (ratingsEl) {
            ratingsEl.style.display = 'grid';
            ratingsEl.querySelectorAll('button').forEach(function(b) {
              b.onclick = function() { rateCurrent(parseInt(this.getAttribute('data-rate'), 10)); };
            });
          }
        }
      }
    }

    function revealAnswer(fromCheck) {
      if (session.currentShown) return;
      session.currentShown = true;
      refreshSessionEditButton();
      var it = session.queue[session.idx];
      if (!it) return;

      var revealTier = it._presentTier || it.tier || 'quickfire';

      /* Show model answer for quickfire immediately */
      if (revealTier === 'quickfire') {
        var confPrompt = el('confidencePrompt');
        if (confPrompt) confPrompt.style.display = 'none';
        var revealBtn = el('revealBtn');
        if (revealBtn) revealBtn.style.display = 'none';
        var qfAnswerVisual = it.visual ? renderMermaidBlock(it.visual, 'answer', it.id) : '';
        modelAnswerEl.innerHTML = '<div class="answer-header"><span class="se-icon" style="margin-right:4px"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><polyline points="2,5 8,9 14,5"/></svg></span>Model Answer</div><div class="md-content">' + renderMd(it.modelAnswer || '') + '</div>' + qfAnswerVisual;
        modelAnswerEl.style.display = 'block';
        if (qfAnswerVisual) setTimeout(initMermaidBlocks, 50);
        else ensureAnswerVisual(it, revealTier);
        ratingsEl.style.display = 'grid';
        if (window.gsap) {
          gsap.fromTo(modelAnswerEl, { opacity: 0, y: 30, clipPath: 'inset(100% 0% 0% 0%)' }, { opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'power2.out' });
          gsap.fromTo(ratingsEl, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, delay: 0.2, ease: 'power2.out' });
        }
        try { playClick(); } catch(e) {}
        ratingsEl.querySelectorAll('button').forEach(function(b) {
          b.onclick = function() { rateCurrent(parseInt(this.getAttribute('data-rate'), 10)); };
        });
        if (it.modelAnswer) insertListenButton(modelAnswerEl, it.modelAnswer);
        return;
      }

      /* For generative tiers: call AI grading */
      var userText = el('userText') ? el('userText').value.trim() : '';

      if (isDontKnowResponse(userText)) {
        handleDontKnowReveal(it, revealTier);
        return;
      }

      var confPromptGen = el('confidencePrompt');
      if (confPromptGen) confPromptGen.style.display = 'none';

      /* Hide the original textarea and check/submit button */
      if (el('userText')) el('userText').style.display = 'none';
      var checkBtn = el('checkBtn');
      var submitBtn = el('submitBtn');
      if (checkBtn) checkBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';
      var dontKnowBtn = el('dontKnowBtn');
      if (dontKnowBtn) dontKnowBtn.style.display = 'none';
      var essayNextPhase = el('essayNextPhase');
      if (essayNextPhase) essayNextPhase.style.display = 'none';

      /* Build side-by-side reveal layout */
      var answerVisual = it.visual ? renderMermaidBlock(it.visual, 'answer', it.id) : '';

      /* Remove old tierArea content that's no longer needed (scenario stays via item-card) */
      var revealHTML = '<div class="reveal-tabs">' +
        '<button type="button" class="nav-tab reveal-tab-btn" data-reveal-tab="user">Your Response</button>' +
        '<button type="button" class="nav-tab reveal-tab-btn active" data-reveal-tab="model">Model Answer</button>' +
      '</div>' +
      '<div class="reveal-columns">' +
        '<div class="reveal-col">' +
          '<div class="col-label"><span class="col-icon">✍️</span> Your Response</div>' +
          '<div class="user-response-locked" id="userResponseLocked">' + esc(userText || '(No response)') + '</div>' +
        '</div>' +
        '<div class="reveal-col active">' +
          '<div class="col-label"><span class="col-icon">📋</span> Model Answer</div>' +
          '<div class="answer" id="modelAnswerRight"><span class="answer-header">Model Answer</span>' + renderMd(it.modelAnswer || '') + '<div class="visual-slot"></div>' + answerVisual + '</div>' +
          '<div id="aiFeedbackRight"></div>' +
        '</div>' +
      '</div>';

      /* Insert the columns after tierArea */
      var revealContainer = document.createElement('div');
      revealContainer.id = 'revealColumnsWrap';
      revealContainer.innerHTML = revealHTML;
      tierArea.insertAdjacentElement('afterend', revealContainer);
      setupRevealTabs(revealContainer);

      /* Hide original modelAnswer element — we use the right-column copy */
      modelAnswerEl.style.display = 'none';
      if (answerVisual) setTimeout(initMermaidBlocks, 50);
      else ensureAnswerVisual(it, revealTier);

      try { playClick(); } catch(e) {}
      var rightAnswerEl = el('modelAnswerRight');
      if (rightAnswerEl && it.modelAnswer) insertListenButton(rightAnswerEl, it.modelAnswer);

      /* If user wrote nothing, skip AI and show self-rate */
      if (!userText) {
        showSelfRateFallback('No response written — rate yourself against the model answer.');
        return;
      }

      var fbArea = getFeedbackArea();
      if ((essayOutlineText || '').trim()) {
        fbArea.innerHTML = '<div class="af-loading"><div class="af-spinner"></div><span class="af-loading-text">AI is grading your response...</span></div>';
        if (window.gsap) {
          gsap.fromTo(fbArea, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
        }
        var essayPayload = {
          prompt: it.prompt || '',
          modelAnswer: it.modelAnswer || '',
          userResponse: userText,
          tier: revealTier,
          course: it.course || '',
          topic: it.topic || '',
          essayOutline: essayOutlineText || ''
        };
        if (revealTier === 'distinguish') {
          essayPayload.conceptA = it.conceptA || '';
          essayPayload.conceptB = it.conceptB || '';
        }
        fetch('https://widget-sync.lordgrape-widgets.workers.dev/studyengine/grade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Widget-Key': getWidgetKey()
          },
          body: JSON.stringify(essayPayload)
        })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.error) {
              showAIError(data.error, data.detail || '');
              return;
            }
            showAIFeedback(data, revealTier);
          })
          .catch(function(err) {
            showAIError('Network error', err.message || 'Could not reach the grading server.');
          });
        return;
      }

      startGenerativeTutorFlow(it, revealTier, userText);
    }

    function rateCurrent(rating) {
      var nowTs = Date.now();
      var it = session.queue[session.idx];
      if (!it) return;
      if (!session.currentShown) return;

      var tappedBtn = ratingsEl.querySelector('[data-rate="' + rating + '"]');
      if (tappedBtn && window.gsap) {
        gsap.fromTo(tappedBtn, { scale: 1 }, {
          scale: 0.88,
          duration: 0.08,
          ease: 'power2.in',
          yoyo: true,
          repeat: 1,
          onComplete: function() {
            gsap.to(tappedBtn, { scale: 1.15, opacity: 0, duration: 0.2, ease: 'power2.out' });
            ratingsEl.querySelectorAll('button').forEach(function(b) {
              if (b !== tappedBtn) gsap.to(b, { opacity: 0.3, scale: 0.95, duration: 0.15 });
            });
          }
        });
      }
      /* Immediately hide rating UI — rating captured */
      ratingsEl.style.display = 'none';
      var hintElRate = document.querySelector('.override-hint');
      if (hintElRate) hintElRate.remove();

      var tier = it._presentTier || it.tier || 'quickfire';
      var mappedRating = rating;
      if (tier === 'quickfire') {
        /* Quickfire: user clicks the rating button directly */
        mappedRating = rating;
      } else {
        /* Generative tiers: use the button the user clicked (which may be the AI suggestion or an override) */
        mappedRating = rating;
      }

      /* Track calibration — compare user rating against prediction */
      state.calibration.totalSelfRatings = (state.calibration.totalSelfRatings || 0) + 1;
      var aiSuggested = (session && session.aiRating) ? session.aiRating : null;
      var confidence = (session && session.confidence) ? session.confidence : null;
      var actualCorrect;
      if (aiSuggested !== null) {
        /* AI-graded (generative tiers): "calibrated" = user's rating is within 1 of AI's suggestion */
        actualCorrect = (Math.abs(mappedRating - aiSuggested) <= 1) ? 1 : 0;
      } else if (confidence !== null) {
        /* Quick Fire with confidence prompt: pre-reveal confidence vs post-reveal rating */
        var confMap = { low: [1, 2], medium: [2, 3], high: [3, 4] };
        var expectedRange = confMap[confidence] || [2, 3];
        actualCorrect = (mappedRating >= expectedRange[0] && mappedRating <= expectedRange[1]) ? 1 : 0;
      } else {
        /* Fallback (no AI, no confidence — shouldn't happen but safety net) */
        actualCorrect = (mappedRating >= 3) ? 1 : 0;
      }
      state.calibration.totalActualCorrect = (state.calibration.totalActualCorrect || 0) + actualCorrect;
      state.calibration.history = state.calibration.history || [];
      state.calibration.history.push({
        ts: new Date(nowTs).toISOString(),
        course: (it && it.course) ? it.course : '',
        tier: tier,
        rating: mappedRating,
        aiRating: aiSuggested,
        confidence: confidence,
        actual: actualCorrect
      });
      if (state.calibration.history.length > 200) state.calibration.history.shift();

      /* Session stats */
      session.reviewsByTier[tier] = (session.reviewsByTier[tier] || 0) + 1;
      session.ratingSum += mappedRating;
      session.ratingN += 1;
      session.sessionRatingsLog = session.sessionRatingsLog || [];
      session.sessionRatingsLog.push({
        prompt: (it.prompt || '').substring(0, 100),
        topic: it.topic || '',
        rating: mappedRating,
        course: it.course || ''
      });
      if (session._reconstructionPending) {
        if (mappedRating >= 3 && session.tutorStats) session.tutorStats.reconstructionSuccesses++;
        persistTutorAnalyticsDeltas();
        session._reconstructionPending = false;
      }
      /* Rating-differentiated sensory feedback */
      flashRatingFeedback(mappedRating);
      try {
        if (mappedRating === 1) { playError(); }
        else if (mappedRating === 2) { playLap(); }
        else if (mappedRating === 3) { playGoodRate(); }
        else if (mappedRating === 4) { playEasyRate(); }
      } catch(e) {}

      /* Only track ratings on REVIEW cards for fatigue detection.
         New cards (reps <= 1) produce low ratings during normal first-exposure
         learning. Including them would false-trigger fatigue warnings when the
         student is learning, not fatiguing. */
      var isReviewCard = it.fsrs && it.fsrs.reps && it.fsrs.reps > 1;
      if (isReviewCard) {
        session.recentRatings.push(mappedRating);
        if (session.recentRatings.length > 6) session.recentRatings.shift();
      }
      /* Fatigue detection now handled by break system (checkBreakTriggers) */

      /* Streak + review counts */
      state.stats.totalReviews = (state.stats.totalReviews || 0) + 1;
      state.stats.reviewsByTier[tier] = (state.stats.reviewsByTier[tier] || 0) + 1;

      /* Successive relearning loop on Again */
      var againCount = session.loops[it.id] || 0;

      if (mappedRating === 1) {
        session.loops[it.id] = againCount + 1;

        var proceedAfterAgain = function() {
          var generativeTier =
            tier === 'explain' || tier === 'apply' || tier === 'distinguish' || tier === 'mock';
          if (generativeTier && settings.feedbackMode !== 'self_rate') {
            if (againCount >= 2) {
              toast('Scheduled for next session — spacing will help more than repeating now');
              ensureFsrs(it);
              it.fsrs.due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              it.fsrs.state = 'relearning';
              it.fsrs.lapses = (it.fsrs.lapses || 0) + 1;
              it.fsrs.reps = (it.fsrs.reps || 0) + 1;
              it.fsrs.lastReview = new Date(nowTs).toISOString();
              advanceItem();
              return;
            }
            // Don't Know path already ran a full teach dialogue — re-running
            // startRelearningDialogue would be redundant and confusing. Instead,
            // re-queue the card later in the session so spaced retrieval does
            // the work on the second pass.
            if (session._dontKnow) {
              var remainingDk = session.queue.length - (session.idx + 1);
              var minOffsetDk = Math.max(5, Math.floor(remainingDk * 0.4));
              var insertPosDk = Math.min(session.idx + 1 + minOffsetDk, session.queue.length);
              session.queue.splice(insertPosDk, 0, it);
              advanceItem();
              return;
            }
            startRelearningDialogue(it, nowTs);
            return;
          }
          /* QF Again: re-retrieval flow already showed consolidation — skip passive restudy, re-queue. */
          if (tier === 'quickfire' && settings.feedbackMode !== 'self_rate') {
            session.loops[it.id] = session.loops[it.id] || 0;
            if (session.loops[it.id] >= 3) {
              toast('Review tomorrow');
              ensureFsrs(it);
              it.fsrs.due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              it.fsrs.state = 'relearning';
              it.fsrs.lapses = (it.fsrs.lapses || 0) + 1;
              it.fsrs.reps = (it.fsrs.reps || 0) + 1;
              it.fsrs.lastReview = new Date(nowTs).toISOString();
              advanceItem();
              return;
            }
            var remainingQF = session.queue.length - (session.idx + 1);
            var minOffsetQF = Math.max(5, Math.floor(remainingQF * 0.4));
            var insertPosQF = Math.min(session.idx + 1 + minOffsetQF, session.queue.length);
            session.queue.splice(insertPosQF, 0, it);
            advanceItem();
            return;
          }
          beginPassiveRestudyFlow(it, nowTs);
        };

        if (tier === 'quickfire' && settings.feedbackMode !== 'self_rate') {
          runQuickFireFollowupMicro(it, proceedAfterAgain, { reRetrieval: true });
          return;
        }
        proceedAfterAgain();
        return;
      }

      /* Quick Fire Hard — optional insight follow-up before FSRS / re-queue */
      if (tier === 'quickfire' && mappedRating === 2 && settings.feedbackMode !== 'self_rate') {
        runQuickFireFollowupMicro(it, function() {
          if (againCount > 0 && mappedRating === 2) {
            var remainingItemsQ = session.queue.length - (session.idx + 1);
            var minOffsetQ = Math.max(5, Math.floor(remainingItemsQ * 0.4));
            var insertPosQ = Math.min(session.idx + 1 + minOffsetQ, session.queue.length);
            session.queue.splice(insertPosQ, 0, it);
            advanceItem();
            return;
          }
          scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
        });
        return;
      }

      /* Successive relearning loop exit condition:
         - After an in-session failure, require Good/Easy to exit.
         - Hard keeps the item in-session (re-queued) without writing FSRS yet. */
      if (againCount > 0 && mappedRating === 2) {
        var remainingItems2 = session.queue.length - (session.idx + 1);
        var minOffset2 = Math.max(5, Math.floor(remainingItems2 * 0.4));
        var insertPos2 = Math.min(session.idx + 1 + minOffset2, session.queue.length);
        session.queue.splice(insertPos2, 0, it);
        advanceItem();
        return;
      }

      if (tier === 'quickfire' && settings.feedbackMode !== 'self_rate') {
        var qfInsightArea = el('aiFeedbackArea');
        ratingsEl.style.display = 'none';
        var oldHint = document.querySelector('.override-hint');
        if (oldHint) oldHint.remove();
        if (qfInsightArea) {
          qfInsightArea.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:10px;letter-spacing:1px;text-transform:uppercase;">Loading insight…</div>';
        }
        var qfCtxPost = tutorContextForItem(it);
        qfCtxPost.userRating = mappedRating;
        qfCtxPost.recentAvgRating = getRecentAvg();
        var qfModelPost = selectModel(it, session);
        callTutor('insight', qfModelPost, it, '', [], qfCtxPost).then(function(insData) {
          if (!qfInsightArea || !insData || insData.error || (!insData.insight && !insData.followUpQuestion)) {
            scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
            return;
          }
          buildInsightUI(qfInsightArea, insData, function onInsightDone() {
            scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
          });
        }).catch(function() {
          scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
        });
      } else {
        scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
      }
    }

    function scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount) {
      if (mappedRating < 2) {
        advanceItem();
        return;
      }
      if (againCount > 0 && mappedRating >= 3) session.loops[it.id] = 0;
      var res = scheduleFsrs(it, mappedRating, nowTs, true);
      var effectiveBonus = getEffectiveBloomBonus(it.course);
      if (mappedRating >= 3 && effectiveBonus[tier]) {
        var bonus = effectiveBonus[tier];
        if (bonus > 1.0 && it.fsrs && it.fsrs.stability) {
          it.fsrs.stability = Math.min(3650, it.fsrs.stability * bonus);
        }
      }
      var cramInfo = getCramState(it.course);
      if (cramInfo.active && it.fsrs && it.fsrs.due) {
        var dueTs = new Date(it.fsrs.due).getTime();
        var nowMs = Date.now();
        var currentInterval = dueTs - nowMs;
        if (currentInterval > 0) {
          var compressed = nowMs + Math.round(currentInterval * cramInfo.intervalMod);
          it.fsrs.due = new Date(compressed).toISOString();
        }
      }
      it.lastTier = tier;
      var xp = computeXP(it, mappedRating, res.intervalDays);
      var flashKey = (it.id || '') + '_' + nowTs;
      if (session._xpFlashGuard && session._xpFlashGuard === flashKey) return;
      session._xpFlashGuard = flashKey;
      session.xp += xp;
      flashXP(xp);
      updateSessionXPBar();
      saveState();
      /* Build tutor context for Ask the Tutor */
      if (session) {
        var prevMode = tutorCurrentMode || null;
        var prevTurns = tutorTurnCount || 0;
        var prevDontKnow = !!(session._dontKnow);
        var hadSocratic = (prevMode === 'socratic' || prevMode === 'teach' || prevMode === 'acknowledge') && prevTurns >= 1;
        var hadQuickFeedback = prevMode === 'quick' && prevTurns >= 1;
        session.lastTutorContext = {
          mode: prevMode,
          turns: prevTurns,
          hadDialogue: hadSocratic,
          hadQuickFeedback: hadQuickFeedback,
          wasDontKnow: prevDontKnow,
          tier: tier
        };
      }
      mountAskTutor(mappedRating);
    }

    function advanceItem() {
      stopTTS();
      cleanupAskTutor();
      document.querySelectorAll('.listen-tts-btn').forEach(function(btn) { btn.remove(); });
      var staleRe = document.getElementById('qfReRetrievalRoot');
      if (staleRe) staleRe.remove();
      var staleFollow = document.getElementById('qfFollowupRoot');
      if (staleFollow) staleFollow.remove();
      if (session && session._insightSpaceRef) {
        document.removeEventListener('keydown', session._insightSpaceRef);
        session._insightSpaceRef = null;
      }
      var staleInsightNext = document.getElementById('qfInsightNextWrap');
      if (staleInsightNext) staleInsightNext.remove();
      var aiFbArea = document.getElementById('aiFeedbackArea');
      if (aiFbArea) aiFbArea.innerHTML = '';
      clearTimers();
      var cardEl = document.querySelector('.item-card');
      var stepped = false;
      var step = function() {
        if (stepped) return;
        stepped = true;
        session.idx++;
        if (session.idx >= session.queue.length) {
          completeSession();
          return;
        }
        persistActiveSessionSnapshot();
        checkBreakTriggers();
        renderCurrentItem();
      };
      if (window.gsap && cardEl && cardEl.isConnected && viewSession && viewSession.classList.contains('active')) {
        gsap.killTweensOf(cardEl);
        gsap.to(cardEl, {
          opacity: 0,
          y: -40,
          scale: 0.96,
          rotationX: -3,
          duration: 0.25,
          ease: 'power3.in',
          onComplete: step
        });
      } else {
        step();
      }
    }

    function skipItem() {
      if (!session) return;
      stopTTS();
      cleanupAskTutor();
      document.querySelectorAll('.listen-tts-btn').forEach(function(btn) { btn.remove(); });
      var it = session.queue[session.idx];
      if (!it) return;
      /* Skips are discouraged but allowed: move to end */
      session.queue.push(it);
      try { playModeSwitch(); } catch(e) {}
      session.idx++;
      if (session.idx >= session.queue.length) {
        completeSession();
        return;
      }
      persistActiveSessionSnapshot();
      renderCurrentItem();
    }

    function completeSession() {
      stopTTS();
      cleanupAskTutor();
      document.querySelectorAll('.listen-tts-btn').forEach(function(btn) { btn.remove(); });
      clearTimers();
      if (!session) return;

      /* Streak update */
      var today = isoDate();
      var last = state.stats.lastSessionDate || '';
      if (last !== today) {
        if (!last) {
          state.stats.streakDays = 1;
        } else {
          var dt = daysBetween(new Date(last + 'T00:00:00').getTime(), new Date(today + 'T00:00:00').getTime());
          if (dt >= 1 && dt <= 2) state.stats.streakDays = (state.stats.streakDays || 0) + 1;
          else state.stats.streakDays = 1;
        }
        state.stats.lastSessionDate = today;
      }

      finalizeTutorAnalyticsSession();

      /* Push XP to dragon */
      try {
        SyncEngine.set('dragon', 'lastStudyXP', { xp: session.xp, timestamp: new Date().toISOString() });
      } catch (e) {}
      clearActiveSessionSnapshot();

      saveState();

      var sessionSnap = {
        xp: session.xp,
        ratingN: session.ratingN,
        ratingSum: session.ratingSum,
        calBefore: session.calBefore,
        tutorStats: session.tutorStats ? JSON.parse(JSON.stringify(session.tutorStats)) : defaultTutorStats(),
        tutorModeCounts: session.tutorModeCounts ? JSON.parse(JSON.stringify(session.tutorModeCounts)) : defaultTutorModeCounts(),
        sessionRatingsLog: session.sessionRatingsLog ? session.sessionRatingsLog.slice() : []
      };
      /* Dragon evolution check */
      var dragonXPBefore = 0;
      try { dragonXPBefore = parseInt(SyncEngine.get('dragon', 'xp') || '0', 10) - (sessionSnap.xp || 0); } catch(e) {}
      var dragonXPAfter = dragonXPBefore + (sessionSnap.xp || 0);
      var avgRatingForDragon = sessionSnap.ratingN ? (sessionSnap.ratingSum / sessionSnap.ratingN) : 0;

      /* Auto-optimize FSRS parameters every 50 reviews */
      if (state.stats.totalReviews > 0 && state.stats.totalReviews % 50 === 0) {
        var optimized = optimizeFsrsParams();
        if (optimized) toast('FSRS parameters optimized to your memory patterns');
      }

      /* Session summary screen */
      var reviewed = 0;
      for (var k in session.reviewsByTier) reviewed += (session.reviewsByTier[k] || 0);

      el('doneTitle').textContent = reviewed + ' items reviewed';
      el('doneSub').textContent = 'Avg self-rating: ' + (session.ratingN ? (Math.round((session.ratingSum / session.ratingN) * 10) / 10) : '—');
      el('doneXP').textContent = String(session.xp);

      var calAfter = calibrationPct(state.calibration);
      el('doneCal').textContent = (calAfter == null) ? '—' : Math.round(calAfter * 100) + '%';
      var before = session.calBefore;
      if (before == null || calAfter == null) el('doneTrend').textContent = 'Calibration updates after more sessions';
      else {
        var d = calAfter - before;
        el('doneTrend').textContent = (d > 0.02) ? 'Trending up' : (d < -0.02) ? 'Trending down' : 'Stable';
      }

      var tiers = ['quickfire','explain','apply','distinguish','mock','worked'];
      var names = { quickfire:'Quick Fire', explain:'Explain', apply:'Apply', distinguish:'Distinguish', mock:'Mock', worked:'Worked Example' };
      var bd = '';
      tiers.forEach(function(t){
        var c = session.reviewsByTier[t] || 0;
        var col = tierColour(t);
        bd += '<span class="tier-pill"><span class="tier-dot" style="background:'+ col +'"></span>' + names[t] + ': ' + c + '</span>';
      });
      el('doneBreakdown').innerHTML = bd;

      session = null;
      try { document.body.classList.remove('in-session'); } catch(e) {}
      showView('viewDone');
      animateDoneDragon(sessionSnap.xp, avgRatingForDragon);
      setTimeout(function() { checkDragonEvolution(dragonXPBefore, dragonXPAfter); }, 1500);
      scheduleUiTimer(function() {
        checkForCheckIn();
      }, 250);

      requestSessionAiSummary(sessionSnap, reviewed);

      /* Celebration animation */
      if (reviewed > 0) {
        try { playChime(); } catch(e) {}
        try { launchConfetti(); } catch(e) {}
      }
      if (window.gsap) {
        var cele = el('doneCelebration');
        if (cele) {
          gsap.fromTo(cele, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' });
        }
        /* Animate XP counter */
        var xpEl = el('doneXP');
        if (xpEl) {
          var xpObj = { val: 0 };
          var finalXP = parseInt(xpEl.textContent, 10) || 0;
          gsap.to(xpObj, {
            val: finalXP,
            duration: 0.8,
            delay: 0.3,
            ease: 'power2.out',
            onUpdate: function() { xpEl.textContent = String(Math.round(xpObj.val)); }
          });
        }
      }
    }

    function clearTimers() {
      if (tierTimer) { clearInterval(tierTimer); tierTimer = null; }
      if (mockCountdownTimer) { clearInterval(mockCountdownTimer); mockCountdownTimer = null; }
      if (restudyIntervalTimer) { clearInterval(restudyIntervalTimer); restudyIntervalTimer = null; }
      if (restudyTimeoutTimer) { clearTimeout(restudyTimeoutTimer); restudyTimeoutTimer = null; }
      if (essayOutlineTimer) { clearInterval(essayOutlineTimer); essayOutlineTimer = null; }
      essayPhase = null;
      essayOutlineText = '';
      if (breakState.breakTimerInterval) { clearInterval(breakState.breakTimerInterval); breakState.breakTimerInterval = null; }
    }

    function computeXP(it, rating, intervalDays) {
      var bloomMultiplier = { quickfire: 1, explain: 2, apply: 3, distinguish: 3, mock: 4, worked: 2.5 };
      var tier = it.lastTier || it._presentTier || it.tier || 'quickfire';
      var mul = bloomMultiplier[tier] || 1;
      ensureFsrs(it);
      var diff = it.fsrs.difficulty || 5;
      var interval = intervalDays || 1;

      /* New item bonus */
      var isNew = !it.fsrs.lastReview || it.fsrs.reps <= 1;
      if (isNew) return Math.round(10 * mul);

      var xp = Math.round(10 * mul * (diff / 5) * Math.min(interval / 7, 3));
      /* Slight penalty for low ratings to keep incentives aligned */
      if (rating === 2) xp = Math.max(4, Math.round(xp * 0.8));
      if (rating === 1) xp = 0;
      return xp;
    }

    function flashXP(xp) {
      var flash = document.createElement('div');
      flash.className = 'xp-flash' + (xp === 0 ? ' zero' : '');
      flash.textContent = xp === 0 ? '0 XP' : '+' + xp + ' XP';
      document.body.appendChild(flash);
      if (window.gsap) {
        var xpBar = document.getElementById('sessionXPBar');
        if (xpBar) {
          xpBar.classList.add('active');
          gsap.fromTo(xpBar.querySelector('.sxp-value'), { textContent: Math.max(0, session.xp - xp) }, {
            textContent: session.xp,
            duration: 0.45,
            roundProps: 'textContent',
            ease: 'power2.out'
          });
          gsap.delayedCall(0.38, function() { xpBar.classList.remove('active'); });
        }
        gsap.fromTo(flash,
          { opacity: 0, y: 0, scale: 0.7 },
          { opacity: 1, y: -30, scale: 1, duration: 0.35, ease: 'back.out(1.8)',
            onComplete: function() {
              gsap.to(flash, {
                opacity: 0, y: -70, duration: 0.5, delay: 0.4, ease: 'power2.in',
                onComplete: function() { flash.remove(); }
              });
            }
          }
        );
      } else {
        flash.style.opacity = '1';
        setTimeout(function() { flash.remove(); }, 1200);
      }
    }

    function setupRevealTabs(revealContainer) {
      if (!revealContainer) return;
      var tabs = revealContainer.querySelectorAll('.reveal-tab-btn');
      var cols = revealContainer.querySelectorAll('.reveal-col');
      if (tabs.length !== 2 || cols.length !== 2) return;
      tabs.forEach(function(tab, idx) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          cols.forEach(function(col) { col.classList.remove('active'); });
          cols[idx].classList.add('active');
          if (window.gsap) {
            gsap.fromTo(cols[idx], { opacity: 0, x: idx === 0 ? -18 : 18 }, { opacity: 1, x: 0, duration: 0.24, ease: 'power2.out' });
          }
        });
      });
    }

    function disableRatings(disabled) {
      ratingsEl.querySelectorAll('button').forEach(function(b){
        if (disabled) b.setAttribute('disabled','disabled');
        else b.removeAttribute('disabled');
      });
    }

    function flashRatingFeedback(rating) {
      var itemCard = document.querySelector('.item-card');
      if (!itemCard || !window.gsap) return;
      var colours = {
        1: { glow: 'rgba(239,68,68,0.35)', soft: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.60)' },
        2: { glow: 'rgba(245,158,11,0.30)', soft: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.55)' },
        3: { glow: 'rgba(34,197,94,0.28)', soft: 'rgba(34,197,94,0.09)', border: 'rgba(34,197,94,0.50)' },
        4: { glow: 'rgba(59,130,246,0.28)', soft: 'rgba(59,130,246,0.09)', border: 'rgba(59,130,246,0.50)' }
      };
      var c = colours[rating];
      if (!c) return;
      var intensity = rating === 1 ? 1.0 : rating === 2 ? 0.75 : rating === 3 ? 0.6 : 0.55;
      gsap.killTweensOf(itemCard);
      gsap.timeline()
        .to(itemCard, {
          boxShadow: '0 0 ' + Math.round(40 * intensity) + 'px ' + c.glow + ', 0 0 ' + Math.round(100 * intensity) + 'px ' + c.soft,
          borderColor: c.border,
          duration: 0.22,
          ease: 'power2.out'
        })
        .to(itemCard, {
          boxShadow: '0 0 0px rgba(0,0,0,0)',
          borderColor: 'rgba(139,92,246,0.12)',
          duration: 0.55,
          delay: 0.08,
          ease: 'power2.in',
          clearProps: 'boxShadow,borderColor'
        });
    }

    function checkBreakTriggers() {
      if (!session || !settings.breakReminders) return;
      var banner = el('breakBanner');
      var hint = el('breakHint');
      if (!banner || !hint) return;
      if (breakState.bannerDismissed) {
        banner.classList.remove('show');
        hint.classList.remove('show');
        return;
      }
      var elapsed = getSessionElapsedMins();
      var sinceLast = getTimeSinceBreakMins();
      var interval = settings.breakIntervalMins || 25;
      var recentAvg = 0;
      if (session.recentRatings && session.recentRatings.length >= 6) {
        recentAvg = session.recentRatings.reduce(function(a, b) { return a + b; }, 0) / session.recentRatings.length;
      }
      if (settings.performanceBreaks && session.recentRatings && session.recentRatings.length >= 6 && recentAvg < 1.3) {
        showBreakBanner('hard-stop', '⚠️ Performance has dropped significantly', 'Your last 6 ratings averaged ' + recentAvg.toFixed(1) + '. Continued study at this level can encode errors as correct. A break will help.', true);
        return;
      }
      if (elapsed > 90 && sinceLast > 30) {
        showBreakBanner('hard-stop', '⏰ 90+ minutes of continuous study', 'Extended sessions without breaks show diminishing returns. Take 15-20 minutes.', true);
        return;
      }
      if (settings.performanceBreaks && session.recentRatings && session.recentRatings.length >= 6 && recentAvg < 1.8) {
        showBreakBanner('fatigue', '😮‍💨 Your recall is dipping', 'Average rating: ' + recentAvg.toFixed(1) + ' over last 6 cards. A short break resets attentional focus.', false);
        return;
      }
      if (sinceLast >= interval) {
        if (isHotStreak()) {
          banner.classList.remove('show');
          hint.textContent = Math.round(sinceLast) + ' min — stretch when ready';
          hint.classList.add('show');
        } else {
          hint.classList.remove('show');
          showBreakBanner('time', '☕ ' + Math.round(sinceLast) + ' minutes since your last break', 'Brief diversions restore sustained attention.', false);
        }
        return;
      }
      banner.classList.remove('show');
      hint.classList.remove('show');
    }

    function startBreakTimer(durationMins) {
      var overlay = el('breakOverlay');
      var timerEl = el('breakTimer');
      var tipEl = el('breakTip');
      var titleEl = el('breakTitle');
      var skipBtn = el('breakSkip');
      if (!overlay) return;
      breakState.breakDurationMs = durationMins * 60 * 1000;
      var endTime = Date.now() + breakState.breakDurationMs;
      titleEl.textContent = durationMins >= 10 ? 'Extended break' : 'Quick recharge';
      tipEl.textContent = getBreakTip();
      overlay.classList.add('show');
      var banner = el('breakBanner');
      if (banner) banner.classList.remove('show');
      var hint = el('breakHint');
      if (hint) hint.classList.remove('show');
      if (breakState.breakTimerInterval) clearInterval(breakState.breakTimerInterval);
      breakState.breakTimerInterval = setInterval(function() {
        var remain = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        timerEl.textContent = fmtMMSS(remain);
        if (remain <= 0) endBreak();
      }, 250);
      var tipRotate = setInterval(function() {
        if (!overlay.classList.contains('show')) { clearInterval(tipRotate); return; }
        tipEl.textContent = getBreakTip();
        if (window.gsap) gsap.fromTo(tipEl, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      }, 45000);
      skipBtn.onclick = function() { endBreak(); try { playBreakDismiss(); } catch (e) {} };
      if (window.gsap) {
        gsap.fromTo(overlay.querySelector('.break-card'),
          { scale: 0.9, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.6)' });
      }
    }

    function endBreak() {
      var overlay = el('breakOverlay');
      if (overlay) overlay.classList.remove('show');
      if (breakState.breakTimerInterval) { clearInterval(breakState.breakTimerInterval); breakState.breakTimerInterval = null; }
      breakState.lastBreakTime = Date.now();
      breakState.breaksTaken++;
      breakState.bannerDismissed = false;
      try { playResume(); } catch (e) {}
      toast('Break complete — back to it');
    }
