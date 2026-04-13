/* ══════════════════════════════════════════════════
   LEARN MODE — Scaffolded AI Instruction Engine
   Phase 2: Core client module
   ══════════════════════════════════════════════════ */

var learnSession = null;
var learnSelectedTopics = [];
var learnSubDeckFilter = 'All';

/* ── Learn Mode Keyboard Shortcuts ── */
document.addEventListener('keydown', function(e) {
  if (!learnSession) return;
  /* Don't capture when typing in inputs */
  var tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.target.isContentEditable) return;

  var viewLearn = el('viewLearn');
  if (!viewLearn || viewLearn.style.display === 'none') return;

  /* Escape — exit learn session (with confirm) */
  if (e.key === 'Escape') {
    e.preventDefault();
    var exitBtn = el('learnExitBtn');
    if (exitBtn) exitBtn.click();
    return;
  }

  /* Space or Enter — advance to next segment (when advance button is visible) */
  if (e.key === ' ' || e.key === 'Enter') {
    var advBtn = el('learnAdvanceBtn');
    if (advBtn) { e.preventDefault(); advBtn.click(); return; }
    /* Also handle consolidation reveal */
    var revealBtn = el('consolReveal');
    if (revealBtn && revealBtn.style.display !== 'none') { e.preventDefault(); revealBtn.click(); return; }
    /* Handle done button */
    var doneBtn = el('learnDoneBtn') || el('learnSummaryDashBtn');
    if (doneBtn) { e.preventDefault(); doneBtn.click(); return; }
  }

  /* Number keys 1-4 for consolidation ratings */
  if (e.key >= '1' && e.key <= '4') {
    var rateBtn = document.querySelector('#consolAnswerArea [data-rate="' + e.key + '"]');
    if (rateBtn) { e.preventDefault(); rateBtn.click(); return; }
  }
});

/* ── Topic Helpers ── */

function getLearnableTopics(courseName, subDeckFilter) {
  var topics = {};
  for (var id in state.items) {
    if (!state.items.hasOwnProperty(id)) continue;
    var it = state.items[id];
    if (!it || it.archived || it.course !== courseName) continue;
    if (isItemInArchivedSubDeck(it)) continue;
    if (subDeckFilter && subDeckFilter !== 'All' && it.subDeck !== subDeckFilter) continue;
    var t = (it.topic || 'General').trim();
    if (!topics[t]) topics[t] = { name: t, cards: [], subDecks: {} };
    topics[t].cards.push(it);
    var sd = it.subDeck || '__none__';
    topics[t].subDecks[sd] = true;
  }
  return topics;
}

function getTopicLearnStatus(courseName, topicName) {
  if (!state.learnProgress[courseName]) return 'not_started';
  var p = state.learnProgress[courseName][topicName];
  if (!p) return 'not_started';
  return p.status || 'not_started';
}

function getRecommendedLearnTopics(courseName, maxTopics) {
  maxTopics = maxTopics || 2;
  var topics = getLearnableTopics(courseName, 'All');
  var scored = [];

  for (var tName in topics) {
    if (!topics.hasOwnProperty(tName)) continue;
    var t = topics[tName];
    var status = getTopicLearnStatus(courseName, tName);
    var score = 0;

    if (status === 'not_started') score += 100;

    try {
      var assess = getActiveAssessment(courseName);
      if (assess && assess.prioritySet) {
        var isPriority = false;
        (assess.prioritySet || []).forEach(function(qId) {
          var q = (assess.questions || []).find(function(x) { return x.id === qId; });
          if (q && q.mappedTopics && q.mappedTopics.indexOf(tName) >= 0) isPriority = true;
        });
        if (isPriority) score += 80;
      }
    } catch(e) {}

    var weakCards = 0;
    t.cards.forEach(function(c) {
      var item = state.items[c.id || c];
      if (!item) return;
      if (!item.fsrs || item.fsrs.stability < 5) weakCards++;
      if (item.fsrs && item.fsrs.lapses >= 3) weakCards++;
    });
    score += Math.min(weakCards * 5, 50);

    score += Math.min(t.cards.length, 10);

    if (status === 'learned' && state.learnProgress[courseName] && state.learnProgress[courseName][tName]) {
      var lp = state.learnProgress[courseName][tName];
      if (lp.lastLearnedAt) {
        var hoursAgo = (Date.now() - new Date(lp.lastLearnedAt).getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 24) score -= 200;
        else if (hoursAgo < 72) score -= 50;
      }
    }

    try {
      var assess2 = getActiveAssessment(courseName);
      if (assess2 && assess2.sacrificeSet) {
        var isSacrifice = false;
        (assess2.sacrificeSet || []).forEach(function(qId) {
          var q = (assess2.questions || []).find(function(x) { return x.id === qId; });
          if (q && q.mappedTopics && q.mappedTopics.indexOf(tName) >= 0) isSacrifice = true;
        });
        if (isSacrifice) score -= 100;
      }
    } catch(e2) {}

    scored.push({ name: tName, score: score });
  }

  scored.sort(function(a, b) { return b.score - a.score; });
  return scored.slice(0, maxTopics).filter(function(s) { return s.score > 0; }).map(function(s) { return s.name; });
}

/* ── Review/Learn Toggle Injection ── */

function injectModeToggle(courseName, container) {
  var existing = container.querySelector('.mode-toggle');
  if (existing) existing.remove();

  var toggle = document.createElement('div');
  toggle.className = 'mode-toggle';
  toggle.innerHTML =
    '<button class="mode-toggle-btn active-review" data-mode="review">Review</button>' +
    '<button class="mode-toggle-btn" data-mode="learn">Learn</button>';

  /* Insert after the course header */
  var header = container.querySelector('.ctx-course-header');
  if (header && header.nextSibling) {
    container.insertBefore(toggle, header.nextSibling);
  } else if (header) {
    container.appendChild(toggle);
  } else {
    container.insertBefore(toggle, container.firstChild);
  }

  var reviewContent = null;
  var learnContent = null;

  toggle.addEventListener('click', function(e) {
    var btn = e.target.closest('.mode-toggle-btn');
    if (!btn) return;
    var mode = btn.dataset.mode;
    toggle.querySelectorAll('.mode-toggle-btn').forEach(function(b) {
      b.className = 'mode-toggle-btn';
    });
    btn.className = 'mode-toggle-btn active-' + mode;
    try { playClick(); } catch(ex) {}

    if (mode === 'learn') {
      /* Hide review content, show learn tab */
      if (!reviewContent) {
        reviewContent = [];
        var children = Array.prototype.slice.call(container.children);
        children.forEach(function(child) {
          if (child === toggle) return;
          if (child.classList && child.classList.contains('learn-tab-content')) return;
          if (child.style.display !== 'none') {
            reviewContent.push({ el: child, display: child.style.display });
            child.style.display = 'none';
          }
        });
      } else {
        reviewContent.forEach(function(r) { r.el.style.display = 'none'; });
      }
      renderLearnTab(courseName, container);
    } else {
      /* Restore review content, remove learn tab */
      var lt = container.querySelector('.learn-tab-content');
      if (lt) lt.remove();
      if (reviewContent) {
        reviewContent.forEach(function(r) { r.el.style.display = r.display || ''; });
        reviewContent = null;
      }
    }

    if (window.gsap) {
      gsap.fromTo(btn, { scale: 0.95 }, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
    }
  });
}

/* ── Learn Tab Rendering ── */

function renderLearnTab(courseName, container) {
  var existing = container.querySelector('.learn-tab-content');
  if (existing) existing.remove();

  var div = document.createElement('div');
  div.className = 'learn-tab-content';

  var subDecks = listSubDecks(courseName);
  var topics = getLearnableTopics(courseName, learnSubDeckFilter);
  var topicNames = Object.keys(topics).sort();

  /* Sort topics: priority (from active assessment) first, then alphabetical */
  try {
    var activeAssess = getActiveAssessment(courseName);
    if (activeAssess && activeAssess.prioritySet && activeAssess.prioritySet.length > 0) {
      var priorityTopics = {};
      var sacrificeTopics = {};
      (activeAssess.prioritySet || []).forEach(function(qId) {
        var q = (activeAssess.questions || []).find(function(x) { return x.id === qId; });
        if (q && q.mappedTopics) q.mappedTopics.forEach(function(t) { priorityTopics[t] = true; });
      });
      (activeAssess.sacrificeSet || []).forEach(function(qId) {
        var q = (activeAssess.questions || []).find(function(x) { return x.id === qId; });
        if (q && q.mappedTopics) q.mappedTopics.forEach(function(t) {
          if (!priorityTopics[t]) sacrificeTopics[t] = true;
        });
      });
      topicNames.sort(function(a, b) {
        var aPrio = priorityTopics[a] ? 0 : sacrificeTopics[a] ? 2 : 1;
        var bPrio = priorityTopics[b] ? 0 : sacrificeTopics[b] ? 2 : 1;
        if (aPrio !== bPrio) return aPrio - bPrio;
        return a.localeCompare(b);
      });
    }
  } catch(e) {}

  /* Sub-deck filter chips */
  var filterHtml = '<div class="learn-filter-row">';
  filterHtml += '<button class="learn-filter-chip' + (learnSubDeckFilter === 'All' ? ' active' : '') + '" data-sd="All">All</button>';
  subDecks.forEach(function(sd) {
    if (sd.archived) return;
    filterHtml += '<button class="learn-filter-chip' + (learnSubDeckFilter === sd.name ? ' active' : '') + '" data-sd="' + esc(sd.name) + '">' + esc(sd.name) + '</button>';
  });
  filterHtml += '</div>';

  /* Topic grid */
  var gridHtml = '<div class="learn-topic-grid">';
  if (topicNames.length === 0) {
    gridHtml += '<div style="grid-column:1/-1;text-align:center;color:var(--text-secondary);font-size:0.82rem;padding:20px;">No topics found' + (learnSubDeckFilter !== 'All' ? ' in ' + esc(learnSubDeckFilter) : '') + '</div>';
  } else {
    topicNames.forEach(function(tName) {
      var t = topics[tName];
      var status = getTopicLearnStatus(courseName, tName);
      var lastLearned = '';
      if (status === 'learned' && state.learnProgress[courseName] && state.learnProgress[courseName][tName]) {
        var lp = state.learnProgress[courseName][tName];
        if (lp.lastLearnedAt) {
          var daysAgo = Math.round((Date.now() - new Date(lp.lastLearnedAt).getTime()) / (1000 * 60 * 60 * 24));
          lastLearned = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : daysAgo + 'd ago';
        }
      }
      var isSelected = learnSelectedTopics.indexOf(tName) >= 0;
      var primarySd = Object.keys(t.subDecks).filter(function(k) { return k !== '__none__'; })[0] || null;

      gridHtml += '<div class="learn-topic-card' + (isSelected ? ' selected' : '') + '" data-topic="' + esc(tName) + '">';
      if (primarySd) gridHtml += '<span class="learn-subdeck-badge">' + esc(primarySd) + '</span>';
      try {
        var activeAssess2 = getActiveAssessment(courseName);
        if (activeAssess2) {
          var isPriorityTopic = false;
          var isSacrificeTopic = false;
          (activeAssess2.prioritySet || []).forEach(function(qId) {
            var q = (activeAssess2.questions || []).find(function(x) { return x.id === qId; });
            if (q && q.mappedTopics && q.mappedTopics.indexOf(tName) >= 0) isPriorityTopic = true;
          });
          (activeAssess2.sacrificeSet || []).forEach(function(qId) {
            var q = (activeAssess2.questions || []).find(function(x) { return x.id === qId; });
            if (q && q.mappedTopics && q.mappedTopics.indexOf(tName) >= 0) isSacrificeTopic = true;
          });
          if (isPriorityTopic) {
            gridHtml += '<span style="position:absolute;top:8px;left:8px;font-size:0.6rem;padding:1px 5px;border-radius:3px;background:rgba(34,197,94,0.15);color:var(--rate-good);font-weight:700">★ PRIORITY</span>';
          } else if (isSacrificeTopic) {
            gridHtml += '<span style="position:absolute;top:8px;left:8px;font-size:0.6rem;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.1);color:var(--rate-again);font-weight:700;opacity:0.6">SKIP</span>';
          }
        }
      } catch(e) {}
      gridHtml += '<div class="learn-topic-name">' + esc(tName) + '</div>';
      gridHtml += '<div class="learn-topic-meta">';
      gridHtml += '<span class="learn-status-dot ' + status.replace('_', '-') + '"></span>';
      gridHtml += '<span>' + t.cards.length + ' cards</span>';
      gridHtml += '<span>' + status.replace('_', ' ') + '</span>';
      if (lastLearned) {
        gridHtml += '<span style="font-size:0.65rem;color:var(--text-tertiary)">· ' + esc(lastLearned) + '</span>';
      }
      gridHtml += '</div>';
      gridHtml += '</div>';
    });
  }
  gridHtml += '</div>';

  /* Start button */
  var startHtml = '<button class="learn-start-btn" id="learnStartBtn" disabled>Select topics to learn</button>';

  div.innerHTML = filterHtml + gridHtml + startHtml;
  container.appendChild(div);

  /* Wire filter chips */
  div.querySelectorAll('.learn-filter-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      learnSubDeckFilter = this.dataset.sd;
      learnSelectedTopics = [];
      renderLearnTab(courseName, container);
      try { playClick(); } catch(ex) {}
    });
  });

  /* Wire topic card selection */
  div.querySelectorAll('.learn-topic-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var topic = this.dataset.topic;
      var idx = learnSelectedTopics.indexOf(topic);
      if (idx >= 0) learnSelectedTopics.splice(idx, 1);
      else learnSelectedTopics.push(topic);
      this.classList.toggle('selected');
      updateLearnStartBtn();
      try { playClick(); } catch(ex) {}
      if (window.gsap) gsap.fromTo(this, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
    });
  });

  function updateLearnStartBtn() {
    var btn = document.getElementById('learnStartBtn');
    if (!btn) return;
    if (learnSelectedTopics.length === 0) {
      btn.disabled = true;
      btn.textContent = 'Select topics to learn';
    } else {
      var allLearned = learnSelectedTopics.every(function(t) { return getTopicLearnStatus(courseName, t) === 'learned'; });
      btn.disabled = false;
      var verb = allLearned ? 'Re-learn' : 'Start Learning';
      btn.textContent = verb + ' (' + learnSelectedTopics.length + ' topic' + (learnSelectedTopics.length !== 1 ? 's' : '') + ')';
    }
  }

  /* Wire start button */
  var startBtn = document.getElementById('learnStartBtn');
  if (startBtn) {
    startBtn.addEventListener('click', function() {
      if (learnSelectedTopics.length === 0) return;
      startLearnSession(courseName, learnSelectedTopics.slice(), learnSubDeckFilter);
    });
  }

  if (window.gsap) gsap.fromTo(div, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
}

/* ── Learn Session ── */

function startLearnSession(courseName, topics, subDeckFilter) {
  var cards = [];
  topics.forEach(function(topicName) {
    for (var id in state.items) {
      if (!state.items.hasOwnProperty(id)) continue;
      var it = state.items[id];
      if (!it || it.archived || it.course !== courseName) continue;
      if (isItemInArchivedSubDeck(it)) continue;
      if ((it.topic || 'General') !== topicName) continue;
      if (subDeckFilter && subDeckFilter !== 'All' && it.subDeck !== subDeckFilter) continue;
      cards.push({ id: it.id, prompt: it.prompt, modelAnswer: it.modelAnswer, tier: it.tier || 'quickfire', topic: it.topic || 'General' });
    }
  });

  if (cards.length === 0) { toast('No cards found for selected topics'); return; }

  /* Build learner context */
  var learnerCtx = { strongTopics: [], weakTopics: [], calibrationAccuracy: 0, relevantMemories: [] };
  try {
    if (typeof buildLearnerContext === 'function' && cards[0]) {
      var sampleItem = state.items[cards[0].id];
      if (sampleItem) learnerCtx = buildLearnerContext(sampleItem, state);
    }
  } catch(e) {}

  var courseData = getCourse(courseName) || {};

  /* Show loading state */
  showView('viewLearn');
  var content = el('learnContent');
  content.innerHTML = '<div class="learn-loading"><div class="learn-loading-spinner"></div>Generating teaching plan...</div>';
  el('learnTitle').textContent = 'LEARNING: ' + topics[0] + (topics.length > 1 ? ' +' + (topics.length - 1) : '');
  el('learnProgressLabel').textContent = '0/0';
  el('learnProgressFill').style.width = '0%';

  /* Exit button */
  var exitBtn = el('learnExitBtn');
  if (exitBtn) {
    exitBtn.onclick = function() {
      if (learnSession && learnSession.segIdx < learnSession.segments.length) {
        if (!confirm('Exit learning session? Progress on completed segments is saved.')) return;
      }
      learnSession = null;
      showView('viewDash');
      renderDashboard();
    };
  }

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timeoutId = null;
  if (controller) {
    timeoutId = setTimeout(function() {
      console.error('[Learn] Fetch aborted after 45s timeout');
      controller.abort();
    }, 45000);
  }

  var fetchOpts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course: courseName,
      topics: topics,
      cards: cards.slice(0, 20),
      courseContext: {
        syllabusContext: courseData.syllabusContext || '',
        professorValues: courseData.professorValues || '',
        examFormat: courseData.examFormat || courseData.examType || 'mixed'
      },
      learnerContext: learnerCtx,
      model: 'flash'
    })
  };
  if (controller) fetchOpts.signal = controller.signal;

  console.log('[Learn] Fetching:', LEARN_PLAN_ENDPOINT);

  fetch(LEARN_PLAN_ENDPOINT, fetchOpts)
    .then(function(res) {
      if (timeoutId) clearTimeout(timeoutId);
      console.log('[Learn] Status:', res.status);
      if (!res.ok) {
        return res.text().then(function(t) {
          console.error('[Learn] Error body:', t);
          throw new Error('Server ' + res.status);
        });
      }
      return res.text();
    })
    .then(function(rawText) {
      console.log('[Learn] Raw response length:', rawText.length);
      var data;
      try { data = JSON.parse(rawText); } catch(e) {
        console.error('[Learn] JSON parse failed:', e.message, rawText.slice(0, 300));
        throw new Error('Bad JSON');
      }
      console.log('[Learn] Segments:', data.segments ? data.segments.length : 0);
      if (!data.segments || !data.segments.length) {
        toast('Could not generate teaching plan');
        showView('viewDash');
        renderDashboard();
        return;
      }
      learnSession = {
        courseName: courseName,
        topics: topics,
        subDeckFilter: subDeckFilter,
        segments: data.segments,
        consolidation: data.consolidationQuestions || [],
        segIdx: 0,
        startedAt: Date.now(),
        checkResults: [],
        skipped: []
      };
      el('learnProgressLabel').textContent = '1/' + data.segments.length;
      renderLearnSegment();
    })
    .catch(function(err) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('[Learn] Failed:', err);
      toast('Learn plan failed: ' + (err.message || err));
      showView('viewDash');
      renderDashboard();
    });
}

/* ── Segment Rendering ── */

function renderLearnSegment() {
  if (!learnSession) return;
  var seg = learnSession.segments[learnSession.segIdx];
  if (!seg) { startConsolidationBattery(); return; }

  var total = learnSession.segments.length;
  var idx = learnSession.segIdx;
  el('learnProgressLabel').textContent = (idx + 1) + '/' + total;
  el('learnProgressFill').style.width = Math.round(((idx + 1) / total) * 100) + '%';

  var content = el('learnContent');
  var h = '';

  /* Segment card: explanation + elaboration */
  h += '<div class="learn-segment-card">';
  h += '<div class="learn-segment-concept">' + esc(seg.concept || 'Concept ' + (idx + 1)) + '</div>';
  h += '<div class="learn-segment-explanation">' + esc(seg.explanation || '') + '</div>';
  if (seg.elaboration) {
    h += '<div class="learn-segment-elaboration">' + esc(seg.elaboration) + '</div>';
  }
  h += '</div>';

  /* Check question card */
  h += '<div class="learn-check-card">';
  h += '<div class="learn-check-label">' + (seg.checkType === 'predict' ? '🔮 PREDICT' : '✍ YOUR TURN') + '</div>';
  h += '<div class="learn-check-question">' + esc(seg.checkQuestion || 'What do you think?') + '</div>';
  h += '<textarea class="learn-check-input" id="learnCheckInput" placeholder="Type your response..."></textarea>';
  h += '<div class="learn-check-actions">';
  h += '<button class="learn-submit-btn" id="learnSubmitBtn">Submit</button>';
  h += '<button class="learn-skip-btn" id="learnSkipBtn">Skip →</button>';
  h += '</div>';
  h += '<div id="learnFeedbackArea"></div>';
  h += '</div>';

  content.innerHTML = h;

  /* Wire textarea auto-grow */
  var ta = el('learnCheckInput');
  if (ta) {
    ta.addEventListener('input', function() { autoGrowTextarea(ta); });
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitLearnCheck();
      }
    });
    requestAnimationFrame(function() { try { ta.focus(); } catch(ex) {} });
  }

  /* Wire submit */
  var submitBtn = el('learnSubmitBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitLearnCheck);

  /* Wire skip */
  var skipBtn = el('learnSkipBtn');
  if (skipBtn) skipBtn.addEventListener('click', function() {
    learnSession.skipped.push(learnSession.segIdx);
    learnSession.segIdx++;
    renderLearnSegment();
    try { playClick(); } catch(ex) {}
  });

  if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
}

/* ── Check Submission ── */

function submitLearnCheck() {
  if (!learnSession) return;
  var seg = learnSession.segments[learnSession.segIdx];
  if (!seg) return;

  var ta = el('learnCheckInput');
  var response = ta ? ta.value.trim() : '';
  if (!response) { toast('Type a response first'); return; }

  var submitBtn = el('learnSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking...'; }

  var courseData = getCourse(learnSession.courseName) || {};

  var checkController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var checkTimeoutId = null;
  if (checkController) {
    checkTimeoutId = setTimeout(function() {
      console.error('[Learn] learn-check aborted after 30s timeout');
      checkController.abort();
    }, 30000);
  }

  console.log('[Learn] learn-check:', LEARN_CHECK_ENDPOINT);

  var checkFetchOpts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      concept: seg.concept || '',
      checkQuestion: seg.checkQuestion || '',
      checkAnswer: seg.checkAnswer || '',
      userResponse: response,
      courseContext: {
        syllabusContext: courseData.syllabusContext || '',
        professorValues: courseData.professorValues || ''
      },
      learnerContext: {}
    })
  };
  if (checkController) checkFetchOpts.signal = checkController.signal;

  fetch(LEARN_CHECK_ENDPOINT, checkFetchOpts)
  .then(function(res) {
    if (checkTimeoutId) clearTimeout(checkTimeoutId);
    console.log('[Learn] learn-check status:', res.status);
    if (!res.ok) {
      return res.text().then(function(t) {
        console.error('[Learn] learn-check error body:', t);
        throw new Error('Server ' + res.status);
      });
    }
    return res.text();
  })
  .then(function(rawText) {
    console.log('[Learn] learn-check raw response length:', rawText.length);
    var data;
    try { data = JSON.parse(rawText); } catch (e) {
      console.error('[Learn] learn-check JSON parse failed:', e.message, rawText.slice(0, 300));
      throw new Error('Bad JSON');
    }
    console.log('[Learn] learn-check verdict:', data.verdict || 'partial');
    learnSession.checkResults.push({
      segIdx: learnSession.segIdx,
      verdict: data.verdict || 'partial',
      response: response
    });
    showLearnFeedback(data);
  })
  .catch(function(err) {
    if (checkTimeoutId) clearTimeout(checkTimeoutId);
    console.error('[Learn] learn-check failed:', err);
    showLearnFeedback({ verdict: 'strong', feedback: 'Could not reach the tutor. Moving on.', isComplete: true });
  });
}

function showLearnFeedback(data) {
  var area = el('learnFeedbackArea');
  if (!area) return;

  var verdict = data.verdict || 'partial';
  var h = '<div class="learn-feedback ' + verdict + '">';
  h += esc(data.feedback || 'Good effort.');
  if (data.followUp && !data.isComplete) {
    h += '<div class="learn-feedback-followup">' + esc(data.followUp) + '</div>';
  }
  h += '</div>';

  if (data.isComplete !== false) {
    h += '<button class="learn-advance-btn" id="learnAdvanceBtn">Next →</button>';
  } else {
    /* Follow-up: show another input */
    h += '<textarea class="learn-check-input" id="learnFollowUpInput" placeholder="Your response..." style="margin-top:10px"></textarea>';
    h += '<div class="learn-check-actions" style="margin-top:8px">';
    h += '<button class="learn-submit-btn" id="learnFollowUpSubmit">Submit</button>';
    h += '<button class="learn-skip-btn" id="learnFollowUpSkip">Skip →</button>';
    h += '</div>';
  }

  area.innerHTML = h;

  /* Disable original input + buttons */
  var origInput = el('learnCheckInput');
  if (origInput) origInput.disabled = true;
  var origSubmit = el('learnSubmitBtn');
  if (origSubmit) origSubmit.style.display = 'none';
  var origSkip = el('learnSkipBtn');
  if (origSkip) origSkip.style.display = 'none';

  /* Wire advance */
  var advBtn = el('learnAdvanceBtn');
  if (advBtn) {
    advBtn.addEventListener('click', function() {
      learnSession.segIdx++;
      renderLearnSegment();
      try { playClick(); } catch(ex) {}
    });
    /* Space key to advance */
    var spaceHandler = function(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        document.removeEventListener('keydown', spaceHandler);
        learnSession.segIdx++;
        renderLearnSegment();
      }
    };
    document.addEventListener('keydown', spaceHandler);
  }

  /* Wire follow-up input */
  var fuInput = el('learnFollowUpInput');
  if (fuInput) {
    fuInput.addEventListener('input', function() { autoGrowTextarea(fuInput); });
    requestAnimationFrame(function() { try { fuInput.focus(); } catch(ex) {} });
  }
  var fuSubmit = el('learnFollowUpSubmit');
  if (fuSubmit) {
    fuSubmit.addEventListener('click', function() {
      var resp = fuInput ? fuInput.value.trim() : '';
      if (!resp) return;
      /* For follow-ups, just advance — one Socratic turn max in Phase 2 */
      learnSession.segIdx++;
      renderLearnSegment();
    });
  }
  var fuSkip = el('learnFollowUpSkip');
  if (fuSkip) {
    fuSkip.addEventListener('click', function() {
      learnSession.segIdx++;
      renderLearnSegment();
    });
  }

  if (window.gsap) gsap.fromTo(area, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
}

/* ── Consolidation Battery ── */

function startConsolidationBattery() {
  if (!learnSession || !learnSession.consolidation || learnSession.consolidation.length === 0) {
    completeLearnSession();
    return;
  }

  learnSession.consolIdx = 0;
  learnSession.consolRatings = [];
  el('learnProgressLabel').textContent = 'Retrieval Check';
  el('learnProgressFill').style.width = '100%';
  renderConsolidationItem();
}

function renderConsolidationItem() {
  if (!learnSession) return;
  var items = learnSession.consolidation;
  var idx = learnSession.consolIdx;
  if (idx >= items.length) { completeLearnSession(); return; }

  var q = items[idx];
  var content = el('learnContent');

  var h = '<div class="learn-consolidation-header">';
  h += '<div class="learn-consolidation-title">Consolidation Check</div>';
  h += '<div class="learn-consolidation-sub">' + (idx + 1) + ' of ' + items.length + ' — retrieve what you just learned</div>';
  h += '</div>';

  h += '<div class="learn-segment-card">';
  h += '<div class="learn-check-question" style="font-size:1rem;font-weight:600">' + esc(q.question) + '</div>';
  h += '<textarea class="learn-check-input" id="consolInput" placeholder="Type from memory..."></textarea>';
  h += '<button class="learn-submit-btn" id="consolReveal" style="margin-top:12px">Reveal Answer</button>';
  h += '<div id="consolAnswerArea" style="display:none"></div>';
  h += '</div>';

  content.innerHTML = h;

  var ta = el('consolInput');
  if (ta) {
    ta.addEventListener('input', function() { autoGrowTextarea(ta); });
    requestAnimationFrame(function() { try { ta.focus(); } catch(ex) {} });
  }

  var revealBtn = el('consolReveal');
  if (revealBtn) {
    revealBtn.addEventListener('click', function() {
      var ansArea = el('consolAnswerArea');
      if (!ansArea) return;
      ansArea.style.display = 'block';
      ansArea.innerHTML =
        '<div style="margin-top:14px;padding:14px;border-radius:var(--radius);background:rgba(var(--learn-accent-rgb),0.06);border:1px solid rgba(var(--learn-accent-rgb),0.15)">' +
        '<div style="font-size:0.7rem;font-weight:700;color:var(--learn-accent);text-transform:uppercase;margin-bottom:6px">Model Answer</div>' +
        '<div style="font-size:0.88rem;line-height:1.55;color:var(--text)">' + esc(q.answer || '') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:12px">' +
        '<button class="learn-submit-btn" data-rate="1" style="background:var(--rate-again);flex:1">Again</button>' +
        '<button class="learn-submit-btn" data-rate="2" style="background:var(--rate-hard);flex:1">Hard</button>' +
        '<button class="learn-submit-btn" data-rate="3" style="background:var(--rate-good);flex:1">Good</button>' +
        '<button class="learn-submit-btn" data-rate="4" style="background:var(--rate-easy);flex:1">Easy</button>' +
        '</div>';

      revealBtn.style.display = 'none';

      ansArea.querySelectorAll('[data-rate]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var rating = parseInt(this.dataset.rate, 10);
          learnSession.consolRatings.push(rating);
          learnSession.consolIdx++;
          renderConsolidationItem();
          try { playClick(); } catch(ex) {}
        });
      });

      if (window.gsap) gsap.fromTo(ansArea, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
    });
  }

  if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
}

/* ── Session Completion ── */

function completeLearnSession() {
  if (!learnSession) return;

  var courseName = learnSession.courseName;
  var topics = learnSession.topics;
  var ratings = learnSession.consolRatings || [];
  var avgRating = ratings.length > 0 ? ratings.reduce(function(a, b) { return a + b; }, 0) / ratings.length : 0;
  var now = Date.now();
  var nowIso = isoNow();

  /* ── 1. Build per-card rating map from consolidation battery ── */
  /* Each consolidation question has linkedCardIds. Map each card to its rating. */
  var cardRatingMap = {}; /* cardId → rating (1-4) */
  var consolItems = learnSession.consolidation || [];
  for (var ci = 0; ci < consolItems.length; ci++) {
    var cq = consolItems[ci];
    var rating = ratings[ci]; /* may be undefined if battery was cut short */
    if (!cq.linkedCardIds || !rating) continue;
    cq.linkedCardIds.forEach(function(cid) {
      /* If a card is linked to multiple questions, use the lowest rating (conservative) */
      if (!cardRatingMap[cid] || rating < cardRatingMap[cid]) {
        cardRatingMap[cid] = rating;
      }
    });
  }

  /* Also mark skipped segment cards with rating 1 (Again) */
  (learnSession.skipped || []).forEach(function(segIdx) {
    var seg = learnSession.segments[segIdx];
    if (!seg || !seg.linkedCardIds) return;
    seg.linkedCardIds.forEach(function(cid) {
      if (!cardRatingMap[cid]) cardRatingMap[cid] = 1;
    });
  });

  /* ── 2. Initialise FSRS state for each linked card ── */
  var fsrsResults = []; /* { id, rating, intervalDays } for summary */
  var allLinkedCardIds = [];

  learnSession.segments.forEach(function(seg) {
    if (!seg.linkedCardIds) return;
    seg.linkedCardIds.forEach(function(cid) {
      if (allLinkedCardIds.indexOf(cid) >= 0) return;
      allLinkedCardIds.push(cid);

      var it = state.items[cid];
      if (!it) return;

      var rating = cardRatingMap[cid] || 2; /* default Hard if not in battery */

      /* Only initialise if the card hasn't been reviewed yet (don't overwrite active FSRS) */
      if (it.fsrs && it.fsrs.reps > 0 && it.fsrs.lastReview) {
        /* Card already has review history — just mark learn status */
        it.learnStatus = 'learned';
        it.learnedAt = nowIso;
        return;
      }

      /* Call FSRS initialDifficulty for the first rating */
      var d0 = (typeof initialDifficulty === 'function') ? initialDifficulty(rating) : 5;

      /* Set initial FSRS state based on consolidation rating */
      var stabilityMap = { 1: 0.4, 2: 0.8, 3: 1.5, 4: 3.0 };
      var initStability = stabilityMap[rating] || 1.0;

      it.fsrs = {
        stability: initStability,
        difficulty: d0,
        due: null, /* will be set by scheduleFsrs */
        lastReview: new Date(now).toISOString(),
        reps: 1,
        lapses: (rating === 1) ? 1 : 0,
        state: (rating === 1) ? 'relearning' : 'review'
      };

      /* Run scheduleFsrs to compute the proper due date and interval */
      var schedResult = null;
      try {
        schedResult = scheduleFsrs(it, rating, now, true); /* allowWrite=true mutates it.fsrs */
      } catch(e) {
        /* Fallback: manual due date if scheduleFsrs fails */
        var fallbackDays = { 1: 1, 2: 1, 3: 2, 4: 4 };
        it.fsrs.due = new Date(now + (fallbackDays[rating] || 1) * 24 * 60 * 60 * 1000).toISOString();
      }

      it.learnStatus = 'learned';
      it.learnedAt = nowIso;

      fsrsResults.push({
        id: cid,
        prompt: (it.prompt || '').substring(0, 60),
        rating: rating,
        intervalDays: schedResult ? schedResult.intervalDays : (rating === 1 ? 1 : rating),
        stability: Math.round((it.fsrs.stability || 0) * 10) / 10,
        difficulty: Math.round((it.fsrs.difficulty || 0) * 10) / 10
      });
    });
  });

  /* Mark any unlinked items in these topics */
  topics.forEach(function(topicName) {
    for (var id in state.items) {
      if (!state.items.hasOwnProperty(id)) continue;
      var it = state.items[id];
      if (!it || it.archived || it.course !== courseName) continue;
      if ((it.topic || 'General') !== topicName) continue;
      if (allLinkedCardIds.indexOf(id) >= 0) continue;
      /* Unlinked card in a learned topic — mark as unlearned so the user knows */
      if (!it.learnStatus) it.learnStatus = 'unlearned';
    }
  });

  /* ── 3. Update learnProgress ── */
  if (!state.learnProgress[courseName]) state.learnProgress[courseName] = {};
  topics.forEach(function(topicName) {
    state.learnProgress[courseName][topicName] = {
      status: 'learned',
      segmentsTotal: learnSession.segments.length,
      segmentsCompleted: learnSession.segments.length - (learnSession.skipped || []).length,
      consolidationAvgRating: Math.round(avgRating * 10) / 10,
      lastLearnedAt: nowIso,
      linkedCardIds: allLinkedCardIds.slice()
    };
  });

  /* ── 4. XP calculation and dragon push ── */
  var segsCompleted = learnSession.segments.length - (learnSession.skipped || []).length;
  var learnXP = Math.round(segsCompleted * 15 + avgRating * 10);
  try {
    SyncEngine.set('dragon', 'lastStudyXP', { xp: learnXP, timestamp: now });
  } catch(e) {}

  /* ── 5. Record session ── */
  state.learnSessions.unshift({
    course: courseName,
    topics: topics,
    subDeck: learnSession.subDeckFilter !== 'All' ? learnSession.subDeckFilter : null,
    segmentsCompleted: segsCompleted,
    consolidationRatings: ratings,
    cardsHandedOff: fsrsResults.length,
    duration: Math.round((now - learnSession.startedAt) / 1000),
    timestamp: nowIso,
    xpEarned: learnXP
  });
  if (state.learnSessions.length > 30) state.learnSessions.length = 30;

  saveState();

  /* ── 6. Render summary ── */
  renderLearnSummary(learnSession, fsrsResults, learnXP, avgRating);
}

function renderLearnSummary(sess, fsrsResults, xp, avgRating) {
  var content = el('learnContent');
  if (!content) return;

  var segs = sess.segments.length;
  var skipped = (sess.skipped || []).length;
  var completed = segs - skipped;
  var ratings = sess.consolRatings || [];
  var durationMins = Math.round((Date.now() - sess.startedAt) / 60000);

  var h = '<div class="learn-summary">';

  /* ── Header ── */
  h += '<div class="learn-summary-header">';
  h += '<div class="learn-summary-icon">✅</div>';
  h += '<div class="learn-summary-title">Learning Complete</div>';
  h += '<div class="learn-summary-sub">' + esc(sess.topics.join(', ')) + '</div>';
  h += '</div>';

  /* ── Stats Row ── */
  h += '<div class="learn-summary-stats">';
  h += '<div class="learn-summary-stat">';
  h += '<div class="learn-summary-stat-val">' + completed + '/' + segs + '</div>';
  h += '<div class="learn-summary-stat-label">Segments</div>';
  h += '</div>';
  h += '<div class="learn-summary-stat">';
  h += '<div class="learn-summary-stat-val">' + durationMins + 'm</div>';
  h += '<div class="learn-summary-stat-label">Duration</div>';
  h += '</div>';
  h += '<div class="learn-summary-stat">';
  h += '<div class="learn-summary-stat-val">' + fsrsResults.length + '</div>';
  h += '<div class="learn-summary-stat-label">Cards → FSRS</div>';
  h += '</div>';
  h += '<div class="learn-summary-stat">';
  h += '<div class="learn-summary-stat-val">+' + xp + '</div>';
  h += '<div class="learn-summary-stat-label">XP</div>';
  h += '</div>';
  h += '</div>';

  /* ── Consolidation Rating Distribution ── */
  if (ratings.length > 0) {
    var dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
    ratings.forEach(function(r) { dist[r] = (dist[r] || 0) + 1; });
    var rateLabels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
    var rateColors = { 1: 'var(--rate-again)', 2: 'var(--rate-hard)', 3: 'var(--rate-good)', 4: 'var(--rate-easy)' };

    h += '<div class="learn-summary-section">';
    h += '<div class="learn-summary-section-title">Consolidation Ratings</div>';
    h += '<div class="learn-summary-rating-bars">';
    [1, 2, 3, 4].forEach(function(r) {
      var pct = Math.round((dist[r] / ratings.length) * 100);
      h += '<div class="learn-summary-rating-row">';
      h += '<span class="learn-summary-rating-label" style="color:' + rateColors[r] + '">' + rateLabels[r] + '</span>';
      h += '<div class="learn-summary-rating-bar-bg">';
      h += '<div class="learn-summary-rating-bar-fill" style="width:' + pct + '%;background:' + rateColors[r] + '"></div>';
      h += '</div>';
      h += '<span class="learn-summary-rating-count">' + dist[r] + '</span>';
      h += '</div>';
    });
    h += '</div>';
    h += '</div>';
  }

  /* ── Cards Handed Off ── */
  if (fsrsResults.length > 0) {
    h += '<div class="learn-summary-section">';
    h += '<div class="learn-summary-section-title">Cards Scheduled for Review</div>';
    h += '<div class="learn-summary-card-list">';
    fsrsResults.forEach(function(cr) {
      var rateColor = { 1: 'var(--rate-again)', 2: 'var(--rate-hard)', 3: 'var(--rate-good)', 4: 'var(--rate-easy)' };
      h += '<div class="learn-summary-card-row">';
      h += '<span class="learn-summary-card-prompt">' + esc(cr.prompt) + (cr.prompt.length >= 60 ? '…' : '') + '</span>';
      h += '<span class="learn-summary-card-interval" style="color:' + (rateColor[cr.rating] || 'var(--text-secondary)') + '">';
      h += cr.intervalDays < 1 ? '<1d' : Math.round(cr.intervalDays) + 'd';
      h += '</span>';
      h += '</div>';
    });
    h += '</div>';
    h += '</div>';
  }

  /* ── Actions ── */
  h += '<div class="learn-summary-actions">';
  h += '<button class="learn-start-btn" id="learnSummaryReviewBtn">Start Review Session</button>';
  h += '<button class="learn-skip-btn" id="learnSummaryDashBtn" style="width:100%;margin-top:8px">Back to Dashboard</button>';
  h += '</div>';

  h += '</div>';

  content.innerHTML = h;

  /* Wire buttons */
  var reviewBtn = el('learnSummaryReviewBtn');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', function() {
      learnSession = null;
      learnSelectedTopics = [];
      showView('viewDash');
      /* Set course filter to the just-learned course and start session */
      try {
        selectedCourse = sess.courseName;
        selectedTopic = 'All';
        renderDashboard();
        setTimeout(function() { startSession(); }, 200);
      } catch(e) {
        renderDashboard();
      }
    });
  }

  var dashBtn = el('learnSummaryDashBtn');
  if (dashBtn) {
    dashBtn.addEventListener('click', function() {
      learnSession = null;
      learnSelectedTopics = [];
      showView('viewDash');
      renderDashboard();
    });
  }

  if (window.gsap) gsap.fromTo(content, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
  try { playChime(); } catch(ex) {}
}


(function installLearnToggleEmbedHook() {
  if (typeof openCourseDetail !== 'function') {
    setTimeout(installLearnToggleEmbedHook, 100); return;
  }
  if (openCourseDetail._learnToggleHooked) return;
  var __baseLT = openCourseDetail;
  openCourseDetail = function(courseName) {
    __baseLT(courseName);
    if (!isEmbedded) return;
    var container = el('viewCourseDetail');
    if (container && courseName) {
      injectModeToggle(courseName, container);
    }
  };
  openCourseDetail._learnToggleHooked = true;
})();
