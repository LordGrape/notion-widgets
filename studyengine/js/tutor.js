/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function callTutor(mode, model, item, userResponse, conversation, context) {
      var modelEff = model || 'flash';
      var payload = {
        mode: mode,
        model: modelEff,
        item: {
          prompt: item.prompt || '',
          modelAnswer: item.modelAnswer || '',
          tier: item._presentTier || item.tier || 'explain',
          course: item.course || '',
          topic: item.topic || ''
        },
        userName: getTutorUserName(),
        tutorVoice: (settings && settings.tutorVoice === 'supportive') ? 'supportive' : 'rigorous',
        userResponse: userResponse || '',
        conversation: conversation || [],
        context: context || {}
      };
      if (item.conceptA) payload.item.conceptA = item.conceptA;
      if (item.conceptB) payload.item.conceptB = item.conceptB;
      if (item.task) payload.item.task = item.task;

      // Attach lecture context if available (course digest + topic chunk)
      var courseData = (item && item.course) ? (state.courses && state.courses[item.course]) : null;
      if (courseData && courseData.syllabusContext) {
        payload.lectureContext = { courseDigest: courseData.syllabusContext };
      }

      var topicChunkPromise = (item && item.topic && item.course)
        ? fetch(LECTURE_CTX_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Widget-Key': getWidgetKey() },
          body: JSON.stringify({ courseName: item.course, topic: item.topic })
        }).then(function(r) { return r.json(); }).catch(function() { return { topicChunk: null }; })
        : Promise.resolve({ topicChunk: null });

      return topicChunkPromise.then(function(ctxData) {
        if (ctxData && ctxData.topicChunk && ctxData.topicChunk.content) {
          if (!payload.lectureContext) payload.lectureContext = {};
          payload.lectureContext.topicChunk = ctxData.topicChunk.content;
        }

        return fetch(TUTOR_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Widget-Key': getWidgetKey()
          },
          body: JSON.stringify(payload)
        }).then(function(res) {
          return res.json().then(function(data) {
            if (res.ok && data && !data.error) {
              recordTutorApiSuccess(mode, modelEff);
            }
            if (!res.ok && data && !data.error) {
              data = { error: 'Request failed', detail: String(res.status) };
            }
            return data;
          });
        });
      });
    }

    function buildTutorUI(container) {
      var relearningHeader = tutorInRelearning
        ? '<div class="tutor-relearn-banner"><span aria-hidden="true">🔁</span> Re-encoding — Active Recall</div>'
        : '';
      container.innerHTML = relearningHeader +
        '<div class="tutor-wrap">' +
        '  <div class="tutor-messages" id="tutorMessages"></div>' +
        '  <div class="tutor-input-row" id="tutorInputRow">' +
        '    <textarea id="tutorInput" placeholder="Type your response..." rows="1"></textarea>' +
        '    <button type="button" class="send-btn" id="tutorSend" aria-label="Send">→</button>' +
        '  </div>' +
        '  <div class="tutor-footer">' +
        '    <span class="turn-counter" id="tutorTurnCounter">Turn 1 of 3</span>' +
        '    <button type="button" class="skip-btn" id="tutorSkip">Skip to Rating →</button>' +
        '  </div>' +
        '</div>';
      var ta = document.getElementById('tutorInput');
      var sendBtn = document.getElementById('tutorSend');
      if (ta) {
        ta.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = Math.min(120, Math.max(42, this.scrollHeight)) + 'px';
        });
        ta.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitTutorResponse();
          }
        });
      }
      if (sendBtn) sendBtn.addEventListener('click', submitTutorResponse);
      var skip = document.getElementById('tutorSkip');
      if (skip) {
        skip.addEventListener('click', function() {
          skipToRating();
          try { playClick(); } catch (e2) {}
        });
      }
      if (window.gsap && container.querySelector('.tutor-wrap')) {
        gsap.fromTo(container.querySelector('.tutor-wrap'),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
        );
      }
    }

    function submitTutorResponse() {
      var ta = document.getElementById('tutorInput');
      if (!ta || ta.disabled) return;
      var text = ta.value.trim();
      if (!text) return;
      addTutorMessage('user', esc(text));
      tutorConversation.push({ role: 'user', text: text });
      tutorTurnCount++;
      updateTurnCounter();
      ta.value = '';
      ta.style.height = '42px';
      showTypingIndicator();
      ta.disabled = true;
      var sendB = document.getElementById('tutorSend');
      if (sendB) sendB.disabled = true;
      var model = selectModel(tutorCurrentItem, session);
      callTutor(tutorCurrentMode, model, tutorCurrentItem, text, tutorConversation, tutorContextForItem(tutorCurrentItem))
        .then(function(data) {
          hideTypingIndicator();
          if (data && data.error) {
            if (tutorInRelearning) {
              finishRelearningRequeue(tutorCurrentItem, Date.now());
              return;
            }
            addTutorMessage('tutor', '⚠ ' + esc(data.error));
            showRatingButtons(tutorCurrentMode === 'acknowledge' ? tutorAcknowledgeOriginalRating : null);
            return;
          }
          handleTutorResponse(data);
        })
        .catch(function() {
          hideTypingIndicator();
          if (tutorInRelearning) {
            finishRelearningRequeue(tutorCurrentItem, Date.now());
            return;
          }
          addTutorMessage('tutor', '⚠ Could not reach the tutor. Rate yourself against the model answer.');
          showRatingButtons(tutorCurrentMode === 'acknowledge' ? tutorAcknowledgeOriginalRating : null);
        });
    }

    function handleTutorResponse(data) {
      if (tutorInRelearning) {
        var tutorTextRl = data.tutorMessage || data.acknowledgment || data.correct || data.insight || '';
        var questionRl = data.followUpQuestion || data.extensionQuestion || '';
        var alreadyIncludedRl = questionRl && tutorTextRl.trim().endsWith(questionRl.trim());
        var fullTextRl = tutorTextRl + (!alreadyIncludedRl && questionRl ? '\n\n' + questionRl : '');
        if (data.reconstructionPrompt) {
          fullTextRl += (fullTextRl ? '\n\n' : '') + data.reconstructionPrompt;
          noteReconstructionPromptShown();
        }
        tutorConversation.push({ role: 'tutor', text: fullTextRl });
        var htmlRl = '<div>' + esc(tutorTextRl) + '</div>';
        if (questionRl && !alreadyIncludedRl) htmlRl += '<div class="msg-question">' + esc(questionRl) + '</div>';
        if (data.reconstructionPrompt) htmlRl += '<div class="msg-question">' + esc(data.reconstructionPrompt) + '</div>';
        addTutorMessage('tutor', htmlRl);
        if (data.annotations && data.annotations.length > 0 && typeof applyInlineAnnotations === 'function') {
          applyInlineAnnotations(data.annotations);
        }
        var doneRl = data.isComplete || tutorTurnCount >= tutorMaxTurns;
        if (doneRl) {
          disableTutorInput();
          finishRelearningRequeue(tutorCurrentItem, Date.now());
          try { playClick(); } catch (eRl1) {}
          return;
        }
        var taRl = document.getElementById('tutorInput');
        var btnRl = document.getElementById('tutorSend');
        if (taRl) { taRl.disabled = false; taRl.style.opacity = '1'; taRl.focus(); }
        if (btnRl) btnRl.disabled = false;
        try { playClick(); } catch (eRl2) {}
        return;
      }

      if (tutorCurrentMode === 'socratic' && data.isComplete && data.suggestedRating != null && data.suggestedRating >= 3 && !tutorAcknowledgeDone) {
        tutorAcknowledgeDone = true;
        tutorAcknowledgeOriginalRating = data.suggestedRating;
        session.aiRating = data.suggestedRating;
        var confirmMsg = data.tutorMessage || '';
        tutorConversation.push({ role: 'tutor', text: confirmMsg });
        var htmlAck0 = '<div>' + esc(confirmMsg) + '</div>';
        addTutorMessage('tutor', htmlAck0);
        if (data.annotations && data.annotations.length > 0 && typeof applyInlineAnnotations === 'function') {
          applyInlineAnnotations(data.annotations);
        }
        tutorTurnCount++;
        updateTurnCounter();
        showTypingIndicator();
        disableTutorInput();
        var modelAck = selectModel(tutorCurrentItem, session);
        var urAck = getLastUserTextForTutor();
        if (!String(urAck).trim()) urAck = '(The student gave a strong response; acknowledge specifics and ask one extension question.)';
        callTutor('acknowledge', modelAck, tutorCurrentItem, urAck, tutorConversation, tutorContextForItem(tutorCurrentItem))
          .then(function(ackD) {
            hideTypingIndicator();
            if (ackD && ackD.error) {
              showRatingButtons(tutorAcknowledgeOriginalRating);
              queueTutorMemoryUpdateIfEligible(tutorCurrentItem, tutorConversation, tutorAcknowledgeOriginalRating);
              return;
            }
            tutorCurrentMode = 'acknowledge';
            handleAcknowledgeFollowupResponse(ackD);
          })
          .catch(function() {
            hideTypingIndicator();
            showRatingButtons(tutorAcknowledgeOriginalRating);
            queueTutorMemoryUpdateIfEligible(tutorCurrentItem, tutorConversation, tutorAcknowledgeOriginalRating);
          });
        return;
      }

      var tutorText = data.tutorMessage || data.acknowledgment || data.correct || data.insight || '';
      var question = data.followUpQuestion || data.extensionQuestion || '';
      var alreadyIncluded = question && tutorText.trim().endsWith(question.trim());
      var fullText = tutorText + (!alreadyIncluded && question ? '\n\n' + question : '');
      if (data.reconstructionPrompt) {
        fullText += (fullText ? '\n\n' : '') + data.reconstructionPrompt;
        noteReconstructionPromptShown();
      }
      tutorConversation.push({ role: 'tutor', text: fullText });
      var html = '<div>' + esc(tutorText) + '</div>';
      if (question && !alreadyIncluded) {
        html += '<div class="msg-question">' + esc(question) + '</div>';
      }
      if (data.reconstructionPrompt) {
        html += '<div class="msg-question">' + esc(data.reconstructionPrompt) + '</div>';
      }
      addTutorMessage('tutor', html);
      if (data.annotations && data.annotations.length > 0 && typeof applyInlineAnnotations === 'function') {
        applyInlineAnnotations(data.annotations);
      }
      if (data.suggestedRating != null && data.suggestedRating !== '') {
        session.aiRating = data.suggestedRating;
      }
      var terminal = data.isComplete || tutorTurnCount >= tutorMaxTurns;
      if (terminal) {
        disableTutorInput();
        var suggOut = data.suggestedRating != null ? data.suggestedRating : null;
        if (tutorCurrentMode === 'acknowledge' && suggOut == null) suggOut = tutorAcknowledgeOriginalRating;
        showRatingButtons(suggOut);
        queueTutorMemoryUpdateIfEligible(tutorCurrentItem, tutorConversation, suggOut);
        try { playClick(); } catch (e3) {}
      } else {
        var ta2 = document.getElementById('tutorInput');
        var btn2 = document.getElementById('tutorSend');
        if (ta2) { ta2.disabled = false; ta2.style.opacity = '1'; ta2.focus(); }
        if (btn2) btn2.disabled = false;
        try { playClick(); } catch (e4) {}
      }
    }

    function showRatingButtons(suggestedRating) {
      ratingsEl.style.display = 'grid';
      document.querySelectorAll('.override-hint').forEach(function(h) { h.remove(); });
      ratingsEl.querySelectorAll('button').forEach(function(b) {
        b.style.outline = 'none';
        b.style.outlineOffset = '0';
      });
      if (window.gsap) {
        gsap.fromTo(ratingsEl,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }
        );
      }
      var ratingColors = { 1: 'var(--rate-again)', 2: 'var(--rate-hard)', 3: 'var(--rate-good)', 4: 'var(--rate-easy)' };
      var ratingNames = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
      if (suggestedRating != null && suggestedRating >= 1 && suggestedRating <= 4) {
        ratingsEl.querySelectorAll('button').forEach(function(b) {
          var r = parseInt(b.getAttribute('data-rate'), 10);
          if (r === suggestedRating) {
            b.style.outline = '2px solid ' + (ratingColors[r] || 'var(--accent)');
            b.style.outlineOffset = '2px';
          }
        });
        var hint = document.createElement('div');
        hint.className = 'override-hint';
        hint.textContent = 'AI suggested ' + (ratingNames[suggestedRating] || '') + ' — tap a different rating to override';
        if (ratingsEl.parentNode) {
          ratingsEl.parentNode.insertBefore(hint, ratingsEl.nextSibling);
        }
      }
    }

    function skipToRating() {
      if (tutorInRelearning) {
        disableTutorInput();
        finishRelearningRequeue(tutorCurrentItem, Date.now());
        return;
      }
      if (session && session.tutorStats) session.tutorStats.skipsToRating++;
      persistTutorAnalyticsDeltas();
      disableTutorInput();
      addTutorMessage('tutor', '<em>Skipped to rating. Review the model answer below.</em>');
      var mac = document.querySelector('.model-answer-collapsible');
      if (mac) mac.classList.add('open');
      var skipSugg = session.aiRating != null ? session.aiRating : null;
      if (tutorCurrentMode === 'acknowledge' && skipSugg == null) skipSugg = tutorAcknowledgeOriginalRating;
      showRatingButtons(skipSugg);
    }

    function buildQuickFeedbackUI(container, data) {
      var h = '<div class="quick-feedback">';
      if (data.correct) {
        h += '<div class="qf-section"><div class="qf-label correct">✓ What you got right</div>';
        h += '<div class="qf-text">' + esc(data.correct) + '</div></div>';
      }
      if (data.missing) {
        h += '<div class="qf-section"><div class="qf-label missing">△ What\'s missing</div>';
        h += '<div class="qf-text">' + esc(data.missing) + '</div></div>';
      }
      if (data.bridge) {
        h += '<div class="qf-section"><div class="qf-label bridge">↔ The bridge</div>';
        h += '<div class="qf-text">' + esc(data.bridge) + '</div></div>';
      }
      if (data.quickCheck) {
        h += '<div class="qf-check" id="qfCheck">';
        h += '<div class="qf-check-label">Quick check — tap to reveal</div>';
        h += '<div class="qf-check-q">' + esc(data.quickCheck.question) + '</div>';
        h += '<div class="qf-check-a">' + esc(data.quickCheck.answer) + '</div>';
        h += '</div>';
      }
      h += '</div>';
      container.innerHTML = h;
      var qfCheck = document.getElementById('qfCheck');
      if (qfCheck) {
        qfCheck.addEventListener('click', function() {
          this.classList.add('revealed');
          try { playClick(); } catch (e5) {}
        });
      }
      if (window.gsap && container.querySelector('.quick-feedback')) {
        gsap.fromTo(container.querySelector('.quick-feedback'),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }
        );
      }
      if (data.suggestedRating != null) session.aiRating = data.suggestedRating;
      showRatingButtons(data.suggestedRating != null ? data.suggestedRating : null);
    }

    function buildInsightUI(container, data, onDone) {
      var h = '<div class="quick-feedback">';
      h += '<div class="qf-section-label">💡 Key anchor</div>';
      h += '<div class="qf-section-body">' + esc(data.insight || '') + '</div>';
      if (data.followUpQuestion) {
        h += '<div class="qf-insight-interact" id="qfInsightInteract">';
        h += '<div class="qf-section-label" style="margin-top:12px;">🧠 Quick check</div>';
        h += '<div class="qf-section-body" style="margin-bottom:8px;">' + esc(data.followUpQuestion) + '</div>';
        h += '<div class="qf-insight-input-row" id="qfInsightInputRow">';
        h += '<textarea id="qfInsightInput" class="qf-insight-ta" placeholder="Type your answer…" rows="2"></textarea>';
        h += '<button type="button" id="qfInsightSend" class="qf-insight-send">→</button>';
        h += '</div>';
        h += '<button type="button" id="qfInsightDk" class="qf-insight-dk">🤷 Don’t know</button>';
        h += '<div class="qf-insight-answer" id="qfInsightAnswer" style="display:none;">';
        h += '<div class="qf-section-label" style="color:var(--rate-good);">✓ Answer</div>';
        h += '<div class="qf-section-body">' + esc(data.followUpAnswer || '') + '</div>';
        h += '</div>';
        h += '</div>';
      }
      h += '</div>';
      container.innerHTML = h;

      var inputRow = document.getElementById('qfInsightInputRow');
      var ta = document.getElementById('qfInsightInput');
      var sendBtn = document.getElementById('qfInsightSend');
      var dkInsBtn = document.getElementById('qfInsightDk');
      var answerDiv = document.getElementById('qfInsightAnswer');

      function revealInsightAnswer() {
        if (!ta || !answerDiv) return;
        if (inputRow) inputRow.style.display = 'none';
        answerDiv.style.display = 'block';
        if (window.gsap) {
          gsap.fromTo(answerDiv, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
        }
        try { playClick(); } catch (e6) {}
      }

      if (sendBtn) {
        sendBtn.addEventListener('click', function() {
          var text = ta ? ta.value.trim() : '';
          if (!text) return;
          revealInsightAnswer();
        });
      }
      if (dkInsBtn) {
        dkInsBtn.addEventListener('click', function() {
          revealInsightAnswer();
          try { playClick(); } catch (edk) {}
        });
      }
      if (ta) {
        ta.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            var text = ta.value.trim();
            if (!text) return;
            revealInsightAnswer();
          }
        });
        ta.addEventListener('keydown', function(e) {
          e.stopPropagation();
        });
      }
      if (window.gsap && container.querySelector('.quick-feedback')) {
        gsap.fromTo(container.querySelector('.quick-feedback'),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }
        );
      }
      if (data.suggestedRating != null) session.aiRating = data.suggestedRating;
      if (typeof onDone === 'function') {
        var nextWrap = document.createElement('div');
        nextWrap.id = 'qfInsightNextWrap';
        nextWrap.style.marginTop = '14px';
        nextWrap.style.display = 'flex';
        nextWrap.style.gap = '10px';
        nextWrap.style.alignItems = 'center';

        var nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'big-btn';
        nextBtn.style.flex = '1';
        nextBtn.textContent = 'NEXT CARD →';
        nextBtn.addEventListener('click', function() {
          document.removeEventListener('keydown', spaceRef);
          if (session) session._insightSpaceRef = null;
          nextWrap.remove();
          onDone();
        });

        var askBtn = document.createElement('button');
        askBtn.type = 'button';
        askBtn.className = 'ghost-btn';
        askBtn.style.flex = '0 0 auto';
        askBtn.style.minWidth = '0';
        askBtn.textContent = 'Ask Tutor';
        askBtn.addEventListener('click', function() {
          document.removeEventListener('keydown', spaceRef);
          if (session) session._insightSpaceRef = null;
          nextWrap.remove();
          if (session) session._forceAskTutorExpand = true;
          onDone();
        });

        nextWrap.appendChild(nextBtn);
        nextWrap.appendChild(askBtn);
        container.appendChild(nextWrap);

        if (window.gsap) {
          gsap.fromTo(nextWrap, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, delay: 0.15, ease: 'power2.out' });
        }

        var spaceRef = function(e) {
          if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')) return;
          if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            document.removeEventListener('keydown', spaceRef);
            nextWrap.remove();
            onDone();
          }
        };
        if (session) session._insightSpaceRef = spaceRef;
        document.addEventListener('keydown', spaceRef);
      } else {
        showRatingButtons(data.suggestedRating != null ? data.suggestedRating : null);
      }
    }

    function fallbackToGrade(item, userText, tier) {
      var fbArea = getFeedbackArea();
      if (fbArea) {
        fbArea.innerHTML = '<div class="af-loading"><div class="af-spinner"></div><span class="af-loading-text">Using classic grader…</span></div>';
      }
      var payload = {
        prompt: item.prompt || '',
        modelAnswer: item.modelAnswer || '',
        userResponse: userText,
        tier: tier,
        course: item.course || '',
        topic: item.topic || ''
      };
      if (tier === 'distinguish') {
        payload.conceptA = item.conceptA || '';
        payload.conceptB = item.conceptB || '';
      }
      if ((essayOutlineText || '').trim()) {
        payload.essayOutline = essayOutlineText;
      }

      // Attach lecture context if available (course digest + topic chunk)
      var courseData = (item && item.course) ? (state.courses && state.courses[item.course]) : null;
      if (courseData && courseData.syllabusContext) {
        payload.lectureContext = { courseDigest: courseData.syllabusContext };
      }

      var topicChunkPromise = (item && item.topic && item.course)
        ? fetch(LECTURE_CTX_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Widget-Key': getWidgetKey() },
          body: JSON.stringify({ courseName: item.course, topic: item.topic })
        }).then(function(r) { return r.json(); }).catch(function() { return { topicChunk: null }; })
        : Promise.resolve({ topicChunk: null });

      topicChunkPromise.then(function(ctxData) {
        if (ctxData && ctxData.topicChunk && ctxData.topicChunk.content) {
          if (!payload.lectureContext) payload.lectureContext = {};
          payload.lectureContext.topicChunk = ctxData.topicChunk.content;
        }

        fetch('https://widget-sync.lordgrape-widgets.workers.dev/studyengine/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Widget-Key': getWidgetKey() },
          body: JSON.stringify(payload)
        })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.error) { showAIError(data.error, data.detail || ''); return; }
            showAIFeedback(data, tier);
          })
          .catch(function(err) { showAIError('Network error', err.message || ''); });
      });
    }

    function showAIFeedback(data, tier) {
      var fbArea = getFeedbackArea();
      var ratingNames = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
      var ratingColors = { 1: 'var(--rate-again)', 2: 'var(--rate-hard)', 3: 'var(--rate-good)', 4: 'var(--rate-easy)' };
      var scoreLabels = { 0: 'Missed', 1: 'Partial', 2: 'Strong' };

      var dimensions;
      if (data.essayMode) {
        dimensions = [
          { key: 'thesisClarity', label: 'Thesis' },
          { key: 'evidenceDensity', label: 'Evidence' },
          { key: 'argumentStructure', label: 'Structure' },
          { key: 'analyticalDepth', label: 'Analysis' },
          { key: 'conclusionQuality', label: 'Conclusion' }
        ];
      } else {
        dimensions = [
          { key: 'accuracy', label: 'Accuracy' },
          { key: 'depth', label: 'Depth' },
          { key: 'clarity', label: 'Clarity' }
        ];
      }
      if (tier === 'distinguish' && data.discrimination) {
        dimensions.push({ key: 'discrimination', label: 'Discrimination' });
      }

      /* Score cards row */
      var scoreRowHTML = '';
      dimensions.forEach(function(dim) {
        var d = data[dim.key];
        if (!d) return;
        var s = d.score || 0;
        scoreRowHTML += '<div class="af-score score-' + s + '">' +
          '<div class="af-score-val">' + s + '/2</div>' +
          '<div class="af-score-label">' + esc(dim.label) + '</div>' +
        '</div>';
      });

      /* Dimension feedback blocks */
      var dimHTML = '';
      dimensions.forEach(function(dim) {
        var d = data[dim.key];
        if (!d) return;
        var s = d.score || 0;
        dimHTML += '<div class="af-dimension">' +
          '<div class="af-dim-header">' +
            '<span class="af-dim-name">' + esc(dim.label) + '</span>' +
            '<span class="af-dim-score score-' + s + '">' + esc(scoreLabels[s] || '?') + '</span>' +
          '</div>' +
          '<div class="af-dim-feedback">' + esc(d.feedback || '') + '</div>' +
        '</div>';
      });

      /* Suggested rating */
      var suggestedRating = data.fsrsRating || 2;
      var suggestedName = ratingNames[suggestedRating] || 'Hard';
      var suggestedColor = ratingColors[suggestedRating] || 'var(--text)';

      var h = '<div class="ai-feedback">' +
        '<div class="af-header">' +
          '<div class="af-icon"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="10" height="8" rx="2"/><line x1="8" y1="2" x2="8" y2="5"/><circle cx="8" cy="1.5" r="0.8"/><circle cx="6" cy="9" r="1"/><circle cx="10" cy="9" r="1"/></svg></div>' +
          '<div class="af-title">AI Feedback</div>' +
        '</div>' +
        '<div class="af-score-row">' + scoreRowHTML + '</div>' +
        dimHTML +
        '<div class="af-improvement">' +
          '<div class="af-improve-label">↑ To improve</div>' +
          '<div class="af-improve-text">' + esc(data.improvement || '') + '</div>' +
        '</div>' +
        '<div class="af-summary">' + esc(data.summary || '') + '</div>' +
        '<div class="af-total">' +
          '<div class="af-total-score">' + (data.totalScore || 0) + '/' + (data.maxScore || 6) + '</div>' +
          '<div class="af-total-label">Total score</div>' +
        '</div>' +
        '<div class="af-rating-hint">Suggested rating: <span class="af-suggested" style="color:' + suggestedColor + '">' + esc(suggestedName) + '</span> — override below if you disagree</div>' +
      '</div>';

      fbArea.innerHTML = h;

      if (window.gsap) {
        gsap.fromTo(fbArea.querySelector('.ai-feedback'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
        gsap.fromTo(fbArea.querySelectorAll('.af-score'), { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.06, delay: 0.15, ease: 'back.out(1.8)' });
        gsap.fromTo(fbArea.querySelectorAll('.af-dimension'), { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.25, stagger: 0.06, delay: 0.3, ease: 'power2.out' });
      }

      /* ── Inline Annotations ── */
      if (data.annotations && Array.isArray(data.annotations) && data.annotations.length > 0) {
        applyInlineAnnotations(data.annotations);
      }

      /* Store the AI rating on the session for calibration tracking */
      session.aiRating = suggestedRating;

      /* Show rating buttons - pre-highlight the suggested one */
      ratingsEl.style.display = 'grid';
      ratingsEl.querySelectorAll('button').forEach(function(b) {
        var r = parseInt(b.getAttribute('data-rate'), 10);
        if (r === suggestedRating) {
          b.style.outline = '2px solid ' + suggestedColor;
          b.style.outlineOffset = '2px';
        } else {
          b.style.outline = 'none';
          b.style.outlineOffset = '0';
        }
      });

      /* Add override hint below ratings */
      var existingHint = document.querySelector('.override-hint');
      if (!existingHint) {
        var hint = document.createElement('div');
        hint.className = 'override-hint';
        hint.textContent = 'AI suggested ' + suggestedName + ' — tap a different rating to override';
        ratingsEl.parentNode.insertBefore(hint, ratingsEl.nextSibling);
      }
    }

    function startGenerativeTutorFlow(it, revealTier, userText) {
      var feedbackMode = selectFeedbackMode(it, session);
      if (feedbackMode === 'self_rate') {
        showSelfRateFallback('Rate yourself against the model answer.');
        return;
      }
      tutorConversation = [];
      tutorTurnCount = 0;
      tutorOpeningUserText = userText || '';
      tutorAcknowledgeDone = false;
      tutorAcknowledgeOriginalRating = null;
      tutorCurrentMode = feedbackMode;
      tutorCurrentItem = it;
      tutorCurrentTier = revealTier;
      var model = selectModel(it, session);
      var context = tutorContextForItem(it);
      var fbArea = getFeedbackArea();

      if (feedbackMode === 'socratic' || feedbackMode === 'teach') {
        buildTutorUI(fbArea);
        updateTurnCounter();
        showTypingIndicator();
        appendModelAnswerCollapsible(fbArea, it);
        var initialUser = (feedbackMode === 'teach' && session._dontKnow) ? '' : userText;
        callTutor(feedbackMode, model, it, initialUser, [], context)
          .then(function(data) {
            hideTypingIndicator();
            if (data && data.error) {
              fallbackToGrade(it, userText, revealTier);
              return;
            }
            handleTutorResponse(data);
          })
          .catch(function() {
            hideTypingIndicator();
            fallbackToGrade(it, userText, revealTier);
          });
      } else if (feedbackMode === 'quick') {
        fbArea.innerHTML = '<div class="af-loading"><div class="af-spinner"></div><span class="af-loading-text">Generating feedback…</span></div>';
        callTutor('quick', model, it, userText, [], context)
          .then(function(data) {
            if (data && data.error) { fallbackToGrade(it, userText, revealTier); return; }
            buildQuickFeedbackUI(fbArea, data);
            if (data.annotations && typeof applyInlineAnnotations === 'function') {
              applyInlineAnnotations(data.annotations);
            }
          })
          .catch(function() { fallbackToGrade(it, userText, revealTier); });
      }
    }

    function buildLearnerContext(item, stateObj) {
      var course = item.course || '';
      var topic = item.topic || '';
      var cardHistory = {
        lapses: (item.fsrs && item.fsrs.lapses) || 0,
        reps: (item.fsrs && item.fsrs.reps) || 0,
        stability: (item.fsrs && item.fsrs.stability) || 0,
        isNew: !(item.fsrs && item.fsrs.lastReview)
      };
      var allMemories = [];
      if (typeof SyncEngine !== 'undefined' && SyncEngine.get) {
        allMemories = SyncEngine.get(NS, 'tutorMemories') || [];
      }
      var relevantMemories = allMemories
        .filter(function(m) {
          if (!m) return false;
          if (m.scope === 'global') return true;
          if (m.course === course && (!m.scope || m.scope === 'course')) return true;
          if (topic && Array.isArray(m.relatedTopics) && m.relatedTopics.indexOf(topic) >= 0) return true;
          return false;
        })
        .sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); })
        .slice(0, 8)
        .map(function(m) { return m.content; });
      var calAcc = null;
      var streak = 0;
      if (stateObj) {
        if (typeof calibrationPct === 'function' && stateObj.calibration) {
          calAcc = calibrationPct(stateObj.calibration);
        }
        if (stateObj.stats && stateObj.stats.streakDays != null) {
          streak = stateObj.stats.streakDays;
        }
      }
      if (!stateObj || !stateObj.items) {
        return {
          courseStats: { totalCards: 0, reviewedCards: 0 },
          currentTopic: { name: topic, stats: null },
          strongTopics: [],
          weakTopics: [],
          cardHistory: cardHistory,
          calibrationAccuracy: calAcc,
          overallStreak: streak,
          relevantMemories: relevantMemories,
          calibrationNudgeTopics: getOverconfidentTopics(item.course).slice(0, 3).map(function(ot) { return ot.topic + ' (' + ot.pctWeak + '% weak)'; })
        };
      }
      var courseItems = [];
      for (var id in stateObj.items) {
        if (!stateObj.items.hasOwnProperty(id)) continue;
        var it = stateObj.items[id];
        if (!it || it.archived || it.course !== course) continue;
        courseItems.push(it);
      }
      var topicMap = {};
      courseItems.forEach(function(it2) {
        var t = it2.topic || 'General';
        if (!topicMap[t]) {
          topicMap[t] = { total: 0, mastered: 0, struggling: 0, totalStability: 0, totalLapses: 0 };
        }
        topicMap[t].total++;
        var s = (it2.fsrs && it2.fsrs.stability) || 0;
        var lapses = (it2.fsrs && it2.fsrs.lapses) || 0;
        topicMap[t].totalStability += s;
        topicMap[t].totalLapses += lapses;
        if (s > 30 && lapses === 0) topicMap[t].mastered++;
        if (lapses >= 2 || (s < 3 && it2.fsrs && it2.fsrs.lastReview)) topicMap[t].struggling++;
      });
      var strongTopics = [];
      var weakTopics = [];
      for (var tk in topicMap) {
        if (!topicMap.hasOwnProperty(tk)) continue;
        var tm = topicMap[tk];
        tm.avgStability = tm.total > 0 ? (tm.totalStability / tm.total) : 0;
        if (tm.total >= 2 && tm.mastered / tm.total > 0.7) strongTopics.push(tk);
        if (tm.total >= 2 && tm.struggling / tm.total > 0.3) weakTopics.push(tk);
      }
      return {
        courseStats: {
          totalCards: courseItems.length,
          reviewedCards: courseItems.filter(function(i) { return i.fsrs && i.fsrs.lastReview; }).length
        },
        currentTopic: {
          name: topic,
          stats: topicMap[topic] || null
        },
        strongTopics: strongTopics.slice(0, 5),
        weakTopics: weakTopics.slice(0, 5),
        cardHistory: cardHistory,
        calibrationAccuracy: calAcc,
        overallStreak: streak,
        relevantMemories: relevantMemories,
        calibrationNudgeTopics: getOverconfidentTopics(item.course).slice(0, 3).map(function(ot) { return ot.topic + ' (' + ot.pctWeak + '% weak)'; })
      };
    }
