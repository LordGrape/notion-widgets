/* Tier renderers restored from monolith split for session UI parity. */

function renderQuickfireTier(it, session) {
  tierArea.innerHTML =
    '<div class="confidence-prompt" id="confidencePrompt">' +
      '<div class="confidence-label">How confident are you?</div>' +
      '<div class="confidence-pills">' +
        '<div class="conf-pill" data-conf="low">Low</div>' +
        '<div class="conf-pill" data-conf="medium">Medium</div>' +
        '<div class="conf-pill" data-conf="high">High</div>' +
      '</div>' +
    '</div>' +
    '<button class="qa-btn conf-then-reveal" id="revealBtn">Reveal (Space)</button>';

  tierArea.querySelectorAll('.conf-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      tierArea.querySelectorAll('.conf-pill').forEach(function(p) { p.classList.remove('selected'); });
      this.classList.add('selected');
      session.confidence = this.getAttribute('data-conf');
      var revBtn = el('revealBtn');
      if (revBtn) revBtn.classList.add('ready');
      try { playClick(); } catch(e) {}
      if (window.gsap) gsap.fromTo(this, { scale: 0.94 }, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' });
    });
  });

  el('revealBtn').addEventListener('click', function(){
    if (!session.confidence) {
      toast('Pick a confidence level first');
      return;
    }
    revealAnswer();
  });
  /* Visual deferred to revealAnswer() — answer-side only. Background-generate so reveal stays snappy. */
  if (!it.visual && it.prompt && it.modelAnswer && !visualGenerationPending[it.id]) {
    visualGenerationPending[it.id] = true;
    generateVisual(it).then(function(v) {
      visualGenerationPending[it.id] = false;
      if (v) {
        it.visual = v;
        state.items[it.id] = it;
        saveState();
      }
    }).catch(function() { visualGenerationPending[it.id] = false; });
  }
}

function renderExplainTier(it, session) {
  tierArea.innerHTML = '' +
    '<div class="two-col single">' +
      '<div class="panel">' +
        '<div class="p-h">Your response</div>' +
        '<textarea id="userText" rows="3" placeholder="Write your explanation. Focus on key mechanisms, not wording."></textarea>' +
        '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
        '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
          '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  wireGenerative('explain');
}

function renderApplyTier(it, session) {
  /* Prompt is scenario; modelAnswer includes ideal response. Task is embedded at top of modelAnswer if provided. */
  var scen = it.prompt || '';
  var task = (it.task || '');
  function isNearDuplicateInstruction(longText, shortText) {
    var longNorm = String(longText || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    var shortNorm = String(shortText || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    var longStrip = longNorm.replace(/\s+/g, '');
    var shortStrip = shortNorm.replace(/\s+/g, '');
    if (!shortStrip) return true;

    /* Exact or substring match (stripped). */
    if (
      longStrip === shortStrip ||
      longStrip.indexOf(shortStrip) >= 0 ||
      shortStrip.indexOf(longStrip) >= 0
    ) return true;

    /* Length delta < 15%. */
    var maxLen = Math.max(longStrip.length, shortStrip.length, 1);
    if ((Math.abs(longStrip.length - shortStrip.length) / maxLen) < 0.15) return true;

    /* Token overlap: if 70%+ of short words appear in long, it adds nothing new. */
    var longWords = longNorm.split(/\s+/).filter(function(w) { return w.length > 2; });
    var shortWords = shortNorm.split(/\s+/).filter(function(w) { return w.length > 2; });
    if (!shortWords.length) return true;
    var set = {};
    longWords.forEach(function(w) { set[w] = true; });
    var overlap = 0;
    shortWords.forEach(function(w) { if (set[w]) overlap++; });
    return (overlap / shortWords.length) >= 0.7;
  }

  /* Skip Task block if it's essentially the same as the scenario (normalise and compare). */
  var taskIsDuplicate = !task || isNearDuplicateInstruction(scen, task);
  tierArea.innerHTML = '' +
    '<div class="scenario md-content" id="scenarioBlock">' + renderMd(scen) + '</div>' +
    (task && !taskIsDuplicate ? '<div class="divider"></div><div class="prompt" style="font-weight:700">Task</div><div class="answer" style="margin-top:8px"><div class="md-content">' + renderMd(task) + '</div></div>' : '') +
    '<div class="divider"></div>' +
    '<div class="panel">' +
      '<div class="p-h">Your response</div>' +
      '<textarea id="userText" rows="4" placeholder="Apply the concept. Use structured reasoning and conclude clearly."></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
      '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
        '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
      '</div>' +
    '</div>';
  if (settings.showApplyTimer) startApplyTimer();
  wireGenerative('apply');
}

function renderDistinguishTier(it, session) {
  function isNearDuplicateInstruction(longText, shortText) {
    var longNorm = String(longText || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    var shortNorm = String(shortText || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    var longStrip = longNorm.replace(/\s+/g, '');
    var shortStrip = shortNorm.replace(/\s+/g, '');
    if (!shortStrip) return true;

    if (
      longStrip === shortStrip ||
      longStrip.indexOf(shortStrip) >= 0 ||
      shortStrip.indexOf(longStrip) >= 0
    ) return true;

    var maxLen = Math.max(longStrip.length, shortStrip.length, 1);
    if ((Math.abs(longStrip.length - shortStrip.length) / maxLen) < 0.15) return true;

    var longWords = longNorm.split(/\s+/).filter(function(w) { return w.length > 2; });
    var shortWords = shortNorm.split(/\s+/).filter(function(w) { return w.length > 2; });
    if (!shortWords.length) return true;
    var set = {};
    longWords.forEach(function(w) { set[w] = true; });
    var overlap = 0;
    shortWords.forEach(function(w) { if (set[w]) overlap++; });
    return (overlap / shortWords.length) >= 0.7;
  }

  /* Skip scenario block if it's essentially the same as the prompt (already shown above). */
  var distScen = it.scenario || it.prompt || '';
  var distScenIsDuplicate = !distScen || isNearDuplicateInstruction(it.prompt || '', distScen);
  tierArea.innerHTML = '' +
    '<div class="concepts">' +
      '<div class="concept"><div class="c-h">Concept A</div><div class="c-v md-content">' + renderMd(it.conceptA || '—') + '</div></div>' +
      '<div class="concept"><div class="c-h">Concept B</div><div class="c-v md-content">' + renderMd(it.conceptB || '—') + '</div></div>' +
    '</div>' +
    '<div class="prompt" style="font-weight:700; margin-bottom:8px">Given the following scenario, which applies? Justify your choice.</div>' +
    (!distScenIsDuplicate ? '<div class="scenario md-content">' + renderMd(distScen) + '</div>' : '') +
    '<div class="divider"></div>' +
    '<div class="panel">' +
      '<div class="p-h">Your response</div>' +
      '<textarea id="userText" rows="4" placeholder="State which applies, then justify with discriminating features."></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
      '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
        '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
      '</div>' +
    '</div>';
  wireGenerative('distinguish');
}

function renderMockTier(it, session) {
  var mins = parseInt(it.timeLimitMins || settings.mockDefaultMins || 10, 10);
  mins = [5,10,15,30].indexOf(mins) >= 0 ? mins : 10;
  mockTotalMs = mins * 60 * 1000;
  mockEndsAt = Date.now() + mockTotalMs;
  el('timerBar').classList.add('show');

  if (isEssayMode(it)) {
    var examType = (it.examType ? String(it.examType).toLowerCase() : getCourseExamType(it.course));
    var outlineMins = Math.max(1, Math.round(mins * 0.2));
    var writingMins = mins - outlineMins;
    var wordTarget = getEssayWordTarget(mins);
    essayPhase = 'outline';
    essayOutlineText = '';
    essayOutlineEndsAt = Date.now() + (outlineMins * 60 * 1000);

    tierArea.innerHTML = '' +
      '<div class="panel">' +
        '<div class="p-h">Response (timed)</div>' +
        '<div class="essay-outline-phase">' +
          '<div class="essay-phase-label">' +
            '<span class="epl-title">Phase 1: Outline</span>' +
            '<span class="epl-timer" id="essayPhaseTimer">' + fmtMMSS(outlineMins * 60) + '</span>' +
          '</div>' +
          '<div class="essay-structure-hint">' + getEssayStructureHint(examType) + '</div>' +
          '<textarea id="userText" rows="7" placeholder="Outline your argument:\n- Thesis: ...\n- Body 1: [topic] + [evidence]\n- Body 2: [topic] + [evidence]\n- Body 3: [topic] + [evidence]\n- Conclusion: ..."></textarea>' +
          '<div class="essay-word-count">' +
            '<span class="ewc-current" id="essayWordCount">0 words</span>' +
            '<span class="ewc-target">Target: ' + esc(wordTarget.label) + ' (' + wordTarget.min + '-' + wordTarget.max + ' words)</span>' +
          '</div>' +
        '</div>' +
        '<button class="qa-btn" id="essayNextPhase">Start Writing -></button>' +
        '<button class="qa-btn" id="submitBtn" style="display:none">Submit (Space)</button>' +
        '<div class="help">Outline: ' + outlineMins + ' min. Writing: ' + writingMins + ' min. Total: ' + mins + ' min.</div>' +
      '</div>' +
      rubricTemplate('mock');

    var outlineTA = el('userText');
    outlineTA.addEventListener('input', function() {
      autoGrowTextarea(outlineTA);
      updateEssayWordCount(outlineTA.value);
    });
    autoGrowTextarea(outlineTA);
    startEssayOutlineTimer(outlineMins);
    el('essayNextPhase').addEventListener('click', function() {
      transitionToWritingPhase(it, writingMins, wordTarget, examType);
    });
    startMockTimer();
  } else {
    essayPhase = null;
    tierArea.innerHTML = '' +
      '<div class="panel">' +
        '<div class="p-h">Response (timed)</div>' +
        '<textarea id="userText" rows="10" placeholder="Write your full answer. Aim for structure and clear conclusions."></textarea>' +
        '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
        '<button class="qa-btn" id="submitBtn" style="flex:1;min-width:0">Submit (Space)</button>' +
          '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
        '</div>' +
        '<div class="help">Timer starts immediately. Submit early if you finish.</div>' +
      '</div>' +
      rubricTemplate('mock');
    startMockTimer();
    wireMock();
  }
}

function renderWorkedTier(it, session) {
  var scaffoldW = it.workedScaffold || it.modelAnswer || '';
  var sectionsW = scaffoldW.split('\n\n');
  var blankIdxW = Math.min(1, Math.max(0, sectionsW.length - 1));
  var visibleBeforeW = sectionsW.slice(0, blankIdxW).join('\n\n');
  var visibleAfterW = sectionsW.slice(blankIdxW + 1).join('\n\n');
  tierArea.innerHTML = '' +
    '<div style="font-size:9px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#10b981;margin-bottom:8px;">Worked Example — Complete the Missing Section</div>' +
    (visibleBeforeW ? '<div class="answer" style="border-left:3px solid #10b981;margin-bottom:8px;"><div class="md-content">' + renderMd(visibleBeforeW) + '</div></div>' : '') +
    '<div style="padding:10px 14px;border-radius:14px;border:2px dashed rgba(16,185,129,0.3);background:rgba(16,185,129,0.04);margin-bottom:8px;text-align:center;">' +
    '<div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#10b981;">Your Turn — Fill In This Section</div></div>' +
    '<div class="panel">' +
      '<div class="p-h">Your response</div>' +
      '<textarea id="userText" rows="4" placeholder="Complete the missing analysis (e.g. the blank IRAC step)..."></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:6px">' +
      '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
      '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
      '</div></div>' +
    (visibleAfterW ? '<div class="answer" style="border-left:3px solid #10b981;margin-top:8px;"><div class="md-content">' + renderMd(visibleAfterW) + '</div></div>' : '');
  wireGenerative('worked');
}
