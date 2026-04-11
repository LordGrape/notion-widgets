/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function openModal(tab, courseName) {
      editingItemId = null;
      modalEditAfterSave = null;
      importFormat = 'json';
      activeTab = tab || activeTab || 'add';

      /* Determine course context */
      if (courseName) {
        modalCourse = courseName;
        modalShowingPicker = false;
      } else {
        var courses = listCourses();
        if (courses.length === 0) {
          /* No courses: redirect to course management */
          toast('Create a course first');
          openCourseModal();
          return;
        } else if (courses.length === 1) {
          modalCourse = courses[0].name;
          modalShowingPicker = false;
        } else {
          modalCourse = null;
          modalShowingPicker = true;
        }
      }

      modalOv.classList.add('show');
      modalOv.setAttribute('aria-hidden','false');
      renderModal();
      if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(modalOv);
  try { playOpen(); } catch(e) {}
    }

    function closeModal() {
      modalOv.classList.remove('show');
      modalOv.setAttribute('aria-hidden','true');
      pendingImport = null;
      editingItemId = null;
      modalEditAfterSave = null;
      var previewArea = document.getElementById('importPreviewArea');
      if (previewArea) previewArea.innerHTML = '';
  try { playClose(); } catch(e) {}
    }

    function detectImportMode(raw) {
      var text = String(raw || '').trim();
      if (!text) return importFormat || 'json';
      if (/^[\[{]/.test(text)) return 'json';
      if (/^Q:\s*/m.test(text) || /\nQ:\s*/.test(text)) return 'qa';
      return importFormat || 'json';
    }

    function updateImportModeUI(animate) {
      var toggle = document.getElementById('importFormatToggle');
      var textarea = el('m_import');
      var label = document.getElementById('m_import_label');
      var help = document.getElementById('m_import_help');
      if (toggle) {
        toggle.querySelectorAll('[data-import-format]').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-import-format') === importFormat);
        });
      }
      if (!textarea) return;
      var config = importFormat === 'qa'
        ? {
            label: 'Paste Q/A text',
            placeholder: "Q: What is the near abroad doctrine?\nA: Russia's concept of near abroad refers to...\nT: Russian Foreign Policy",
            help: 'Use Q: for prompts, A: for answers, and optional T: lines for topics. Blank lines separate cards.'
          }
        : {
            label: 'Paste JSON array',
            placeholder: '[{"prompt":"...","modelAnswer":"..."}]',
            help: 'Each object needs at minimum: prompt and modelAnswer. Optional: topic, task, scenario, conceptA, conceptB, timeLimitMins.'
          };
      if (label) label.textContent = config.label;
      if (help) help.innerHTML = config.help + ' The course is set automatically to <b>' + esc(modalCourse || 'Unknown') + '</b>.';
      if (animate && window.gsap) {
        gsap.fromTo(textarea, { opacity: 0.75, y: 4 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
      }
      textarea.placeholder = config.placeholder;
    }

    function parseQaImport(raw) {
      var lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
      var cards = [];
      var card = null;
      var currentField = '';
      var sawPrompt = false;
      var sawAnswer = false;

      function ensureCard() {
        if (!card) card = { prompt: '', modelAnswer: '', topic: '' };
      }

      function commitCard() {
        if (!card) return;
        var prompt = String(card.prompt || '').trim();
        var answer = String(card.modelAnswer || '').trim();
        var topic = String(card.topic || '').trim();
        if (prompt || answer || topic) {
          if (!prompt || !answer) {
            throw new Error('Each card needs both Q: and A: lines');
          }
          cards.push({
            prompt: prompt,
            modelAnswer: answer,
            topic: topic || 'General'
          });
        }
        card = null;
        currentField = '';
      }

      lines.forEach(function(line) {
        var trimmed = line.trim();
        if (!trimmed) {
          commitCard();
          return;
        }
        if (/^Q:\s*/i.test(trimmed)) {
          if (card && String(card.prompt || '').trim() && String(card.modelAnswer || '').trim()) commitCard();
          ensureCard();
          card.prompt = trimmed.replace(/^Q:\s*/i, '').trim();
          currentField = 'prompt';
          sawPrompt = true;
          return;
        }
        if (/^A:\s*/i.test(trimmed)) {
          ensureCard();
          card.modelAnswer = trimmed.replace(/^A:\s*/i, '').trim();
          currentField = 'modelAnswer';
          sawAnswer = true;
          return;
        }
        if (/^T:\s*/i.test(trimmed)) {
          ensureCard();
          card.topic = trimmed.replace(/^T:\s*/i, '').trim();
          currentField = 'topic';
          return;
        }
        if (!currentField) return;
        ensureCard();
        var spacer = card[currentField] ? '\n' : '';
        card[currentField] = String(card[currentField] || '') + spacer + trimmed;
      });

      commitCard();

      if (!sawPrompt || !sawAnswer) {
        toast('Use Q: and A: prefixes to mark questions and answers');
        return null;
      }
      return cards;
    }

    function getTierUnlockMessage(beforeTiers, afterTiers) {
      var unlocked = [];
      (afterTiers || []).forEach(function(tier) {
        if ((beforeTiers || []).indexOf(tier) < 0) unlocked.push(tierLabel(tier));
      });
      if (!unlocked.length) return '';
      if (unlocked.length === 1) return 'Now supports ' + unlocked[0] + ' tiers';
      return 'Now supports ' + unlocked.join(' + ') + ' tiers';
    }

    function saveEditedItem(itemId) {
      var it = state.items[itemId];
      if (!it) { toast('Card not found'); closeModal(); return; }

      var prompt = (el('m_prompt').value || '').trim();
      var answer = (el('m_answer').value || '').trim();
      if (!prompt || !answer) {
        try { playError(); } catch(e) {}
        toast('Prompt and model answer are required');
        return;
      }

      var beforeTiers = detectSupportedTiers(it);
      var beforePrompt = it.prompt || '';
      var beforeAnswer = it.modelAnswer || '';

      it.prompt = prompt;
      it.modelAnswer = answer;
      it.topic = (el('m_topic').value || '').trim();
      it.priority = (el('m_priority') && el('m_priority').value) || 'medium';

      var scenario = (el('m_scenario') && el('m_scenario').value || '').trim();
      var task = (el('m_task') && el('m_task').value || '').trim();
      var conceptA = (el('m_conceptA') && el('m_conceptA').value || '').trim();
      var conceptB = (el('m_conceptB') && el('m_conceptB').value || '').trim();
      var timeVal = el('m_time') ? parseInt(el('m_time').value, 10) : 0;

      if (scenario) it.scenario = scenario; else delete it.scenario;
      if (task) it.task = task; else delete it.task;
      if (conceptA) it.conceptA = conceptA; else delete it.conceptA;
      if (conceptB) it.conceptB = conceptB; else delete it.conceptB;
      if (timeVal && [5,10,15,30].indexOf(timeVal) >= 0) it.timeLimitMins = timeVal;
      else delete it.timeLimitMins;

      if (beforePrompt !== prompt || beforeAnswer !== answer) it.visual = null;

      state.items[itemId] = it;
      saveState();
      renderDashboard();

      var afterTiers = detectSupportedTiers(it);
      var unlockMsg = getTierUnlockMessage(beforeTiers, afterTiers);
      toast(unlockMsg || 'Card updated');
      try { playPresetSelect(); } catch(e2) {}

      var afterSave = modalEditAfterSave;
      closeModal();
      if (typeof afterSave === 'function') afterSave(it);
      else if (it.course) {
        try { openCourseDetail(it.course); } catch(e3) {}
      }
    }

    function deleteEditedItem(itemId) {
      if (!state.items[itemId]) return;
      confirmCardDeletion(function(confirmed){
        if (!confirmed) return;
        delete state.items[itemId];
        reconcileStats();
        saveState();
        renderDashboard();
        var afterSave = modalEditAfterSave;
        closeModal();
        toast('Card deleted');
        if (typeof afterSave === 'function') afterSave(null);
      });
    }

    function confirmCardDeletion(onResolve) {
      var existing = document.getElementById('confirmDeleteCardOv');
      if (existing) existing.remove();
      var overlay = document.createElement('div');
      overlay.id = 'confirmDeleteCardOv';
      overlay.className = 'overlay show';
      overlay.setAttribute('aria-hidden', 'false');
      overlay.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Confirm card deletion" style="max-width:380px;">' +
          '<div class="modal-head">' +
            '<div style="font-size:10px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:var(--text);">Delete card</div>' +
            '<button type="button" id="confirmDeleteCardClose" class="icon-btn" aria-label="Close">✕</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div style="font-size:11px;line-height:1.6;color:var(--text-secondary);">Delete this card permanently?</div>' +
          '</div>' +
          '<div class="modal-actions">' +
            '<button type="button" id="confirmDeleteCardCancel" class="ghost-btn">Cancel</button>' +
            '<button type="button" id="confirmDeleteCardOk" class="big-btn danger">Delete</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      var settled = false;
      function done(ok) {
        if (settled) return;
        settled = true;
        overlay.remove();
        if (typeof onResolve === 'function') onResolve(!!ok);
      }
      overlay.addEventListener('click', function(e) { if (e.target === overlay) done(false); });
      var closeBtn = document.getElementById('confirmDeleteCardClose');
      var cancelBtn = document.getElementById('confirmDeleteCardCancel');
      var okBtn = document.getElementById('confirmDeleteCardOk');
      if (closeBtn) closeBtn.addEventListener('click', function(){ done(false); });
      if (cancelBtn) cancelBtn.addEventListener('click', function(){ done(false); });
      if (okBtn) okBtn.addEventListener('click', function(){ done(true); });
      if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(overlay);
    }

    function editItem(itemId, opts) {
      var it = state.items[itemId];
      if (!it) { toast('Card not found'); return; }
      opts = opts || {};
      activeTab = 'add';
      editingItemId = itemId;
      modalEditAfterSave = typeof opts.onSave === 'function' ? opts.onSave : null;
      modalCourse = it.course || null;
      modalShowingPicker = false;
      modalOv.classList.add('show');
      modalOv.setAttribute('aria-hidden','false');
      renderModal();
      if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(modalOv);
      try { playOpen(); } catch(e) {}
    }

    window.editCard = editItem;

    function addFromModal(stayOpen) {
      if (activeTab === 'import') {
        doImport();
        /* Preview is now shown inline — don't close modal yet */
        return;
      }
      if (editingItemId) {
        saveEditedItem(editingItemId);
        return;
      }

      /* Course comes from modalCourse context, not a form field */
      var course = modalCourse;
      if (!course) { toast('No course selected'); return; }

      /* Auto-create course if somehow missing (safety net) */
      if (!state.courses[course]) {
        saveCourse({
          name: course,
          examType: 'mixed',
          examDate: null,
          manualMode: false,
          color: '#8b5cf6',
          created: isoNow()
        });
      }

      var topic = (el('m_topic').value || '').trim();
      var prompt = (el('m_prompt').value || '').trim();
      var answer = (el('m_answer').value || '').trim();

      if (!prompt || !answer) {
        try { playError(); } catch(e) {}
        toast('Prompt and model answer are required');
        return;
      }

      var it = {
        id: uid(),
        prompt: prompt,
        modelAnswer: answer,
        course: course,
        topic: topic,
        created: isoNow(),
        fsrs: { stability: 0, difficulty: 0, due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), lastReview: null, reps: 0, lapses: 0, state: 'new' },
        variants: {}
      };

      /* Optional advanced fields */
      var scenario = (el('m_scenario') && el('m_scenario').value || '').trim();
      var task = (el('m_task') && el('m_task').value || '').trim();
      var conceptA = (el('m_conceptA') && el('m_conceptA').value || '').trim();
      var conceptB = (el('m_conceptB') && el('m_conceptB').value || '').trim();
      var timeVal = el('m_time') ? parseInt(el('m_time').value, 10) : 0;
      var priority = (el('m_priority') && el('m_priority').value) || 'medium';
      it.priority = priority;

      if (scenario) it.scenario = scenario;
      if (task) it.task = task;
      if (conceptA) it.conceptA = conceptA;
      if (conceptB) it.conceptB = conceptB;
      if (timeVal && [5,10,15,30].indexOf(timeVal) >= 0) it.timeLimitMins = timeVal;

      /* For backward compat: set tier if only basic fields (manual mode users can override) */
      /* Not setting tier — let the session builder assign dynamically */

      state.items[it.id] = it;
      saveState();
      renderDashboard();

      /* Generate visual (async, non-blocking) */
      generateVisual(it).then(function(visual) {
        if (visual) {
          it.visual = visual;
          state.items[it.id] = it;
          saveState();
          renderDashboard();
        }
      });

      /* Show supported tiers badge */
      var supported = detectSupportedTiers(it);
      var badgeArea = el('tierBadgeArea');
      if (badgeArea) {
        badgeArea.innerHTML = tierSupportBadgeHTML(supported);
        if (window.gsap) gsap.fromTo(badgeArea, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
      }

      toast('Added — supports ' + supported.length + ' tier' + (supported.length !== 1 ? 's' : ''));

      maybeAutoPrepare(course);

      if (stayOpen) {
        /* Clear content fields but keep topic */
        if (el('m_prompt')) el('m_prompt').value = '';
        if (el('m_answer')) el('m_answer').value = '';
        if (el('m_scenario')) el('m_scenario').value = '';
        if (el('m_task')) el('m_task').value = '';
        if (el('m_conceptA')) el('m_conceptA').value = '';
        if (el('m_conceptB')) el('m_conceptB').value = '';
        /* Refresh topic suggestions (new topic may have been created) */
        renderTopicSuggestions('m_topic', modalCourse, 'topicSuggestions');
      }
    }

    function doImport() {
      var raw = (el('m_import').value || '').trim();
      if (!raw) { try { playError(); } catch(e) {} toast(importFormat === 'qa' ? 'Paste Q/A text first' : 'Paste JSON first'); return; }

      importFormat = detectImportMode(raw);
      updateImportModeUI(false);

      /* Full-state restore from backup file */
      if (importFormat === 'json') try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed._export === 'studyengine-full-backup' && parsed.items) {
          var count = Object.keys(parsed.items).length;
          if (count > 0) {
            state.items = parsed.items;
            if (parsed.courses) state.courses = parsed.courses;
            if (parsed.calibration) state.calibration = parsed.calibration;
            if (parsed.stats) state.stats = parsed.stats;
            if (parsed.settings) {
              for (var k in parsed.settings) {
                if (parsed.settings.hasOwnProperty(k)) settings[k] = parsed.settings[k];
              }
            }
            reconcileStats();
            saveState();
            closeModal();
            renderDashboard();
            toast('Restored ' + count + ' items from backup');
            try { playChime(); } catch(e2) {}
            return;
          }
        }
      } catch(e) { /* not a backup file, fall through to normal import */ }

      var arr = null;
      if (importFormat === 'qa') {
        try { arr = parseQaImport(raw); } catch (e2) { toast(e2.message || 'Could not parse Q/A text'); return; }
        if (!arr) return;
      } else {
        try { arr = JSON.parse(raw); } catch (e) { toast('Invalid JSON'); return; }
      }
      if (!Array.isArray(arr)) { try { playError(); } catch(e) {} toast('Expected an array'); return; }

      /* Phase 1: Parse and classify each item */
      var valid = [];
      var skipped = [];
      var duplicates = [];

      /* Build prompt index for duplicate detection */
      var existingPrompts = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var existing = state.items[id];
        if (!existing || existing.archived) continue;
        var course = existing.course || '';
        var key = course + ':::' + (existing.prompt || '').trim().toLowerCase();
        existingPrompts[key] = true;
      }

      /* Also track duplicates within the batch itself */
      var batchPrompts = {};

      arr.forEach(function(obj, idx) {
        if (!obj || typeof obj !== 'object') {
          skipped.push({ idx: idx, reason: 'Not an object', obj: obj });
          return;
        }
        if (!obj.prompt || !String(obj.prompt).trim()) {
          skipped.push({ idx: idx, reason: 'Missing prompt', obj: obj });
          return;
        }
        if (!obj.modelAnswer && !obj.model_answer && !obj.answer) {
          skipped.push({ idx: idx, reason: 'Missing modelAnswer', obj: obj });
          return;
        }

        /* Normalize modelAnswer aliases */
        if (!obj.modelAnswer && obj.model_answer) obj.modelAnswer = obj.model_answer;
        if (!obj.modelAnswer && obj.answer) obj.modelAnswer = obj.answer;

        var itemCourse = modalCourse || obj.course || 'Uncategorised';
        var promptKey = itemCourse + ':::' + String(obj.prompt).trim().toLowerCase();

        var isDuplicate = false;
        if (existingPrompts[promptKey]) {
          isDuplicate = true;
        } else if (batchPrompts[promptKey]) {
          isDuplicate = true;
        }
        batchPrompts[promptKey] = true;

        /* Detect supported tiers */
        var tempItem = {
          prompt: obj.prompt,
          modelAnswer: obj.modelAnswer,
          task: obj.task || '',
          scenario: obj.scenario || '',
          conceptA: obj.conceptA || '',
          conceptB: obj.conceptB || ''
        };
        var tiers = detectSupportedTiers(tempItem);

        var entry = {
          idx: idx,
          obj: obj,
          course: itemCourse,
          topic: (obj.topic || '').trim(),
          promptPreview: String(obj.prompt).trim().substring(0, 120),
          tiers: tiers,
          isDuplicate: isDuplicate
        };

        if (isDuplicate) {
          duplicates.push(entry);
        }
        valid.push(entry);
      });

      pendingImport = {
        valid: valid,
        skipped: skipped,
        duplicates: duplicates,
        skipDuplicates: false
      };

      renderImportPreview();
    }

    function openSettings() {
      resetSettingsModalTabs();
      var showDataAreaReset = el('showDataArea');
      if (showDataAreaReset) showDataAreaReset.style.display = 'none';
      var restoreStatusReset = el('restoreStatus');
      if (restoreStatusReset) restoreStatusReset.textContent = '';
      renderSettings();
      refreshCostEstimateInSettings();
      bindSettingsTabListeners();
      settingsOv.classList.add('show');
      settingsOv.setAttribute('aria-hidden','false');
      if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(settingsOv);

      var showDataBtn = el('showDataBtn');
      if (showDataBtn) {
        showDataBtn.onclick = function() {
          var area = el('showDataArea');
          var textEl = el('showDataText');
          if (!area || !textEl) return;
          var exportData = {
            _export: 'studyengine-full-backup',
            _version: 1,
            _date: new Date().toISOString(),
            items: state.items || {},
            courses: state.courses || {},
            calibration: state.calibration || {},
            stats: state.stats || {},
            settings: settings || {}
          };
          textEl.value = JSON.stringify(exportData, null, 2);
          area.style.display = 'block';
          textEl.focus();
          textEl.select();
          toast('Data shown — select all and copy (Ctrl+A → Ctrl+C)');
        };
      }

      var showDataTextEl = el('showDataText');
      if (showDataTextEl) {
        showDataTextEl.onclick = function() { this.select(); };
      }

      var restoreBtn = el('restoreDataBtn');
      if (restoreBtn) {
        restoreBtn.onclick = function() {
          var textEl = el('pasteDataText');
          var statusEl = el('restoreStatus');
          if (!textEl) return;
          var raw = (textEl.value || '').trim();
          if (!raw) {
            if (statusEl) statusEl.textContent = 'Paste your data first';
            return;
          }
          try {
            var imported = JSON.parse(raw);
            if (!imported.items || typeof imported.items !== 'object') {
              if (statusEl) statusEl.textContent = 'Invalid data — missing items';
              return;
            }
            var itemCount = Object.keys(imported.items).length;
            var courseCount = imported.courses ? Object.keys(imported.courses).length : 0;

            for (var id in imported.items) {
              if (imported.items.hasOwnProperty(id)) {
                state.items[id] = imported.items[id];
              }
            }
            if (imported.courses) {
              for (var cName in imported.courses) {
                if (imported.courses.hasOwnProperty(cName)) {
                  state.courses[cName] = imported.courses[cName];
                }
              }
            }
            if (imported.calibration && imported.calibration.history &&
                imported.calibration.history.length > ((state.calibration || {}).history || []).length) {
              state.calibration = imported.calibration;
            }
            if (imported.stats && (imported.stats.totalReviews || 0) > ((state.stats || {}).totalReviews || 0)) {
              state.stats = imported.stats;
            }
            if (imported.settings && typeof imported.settings === 'object') {
              for (var sk in imported.settings) {
                if (imported.settings.hasOwnProperty(sk)) {
                  settings[sk] = imported.settings[sk];
                }
              }
            }
            migrateItems();
            saveState();
            if (statusEl) statusEl.textContent = 'Restored ' + itemCount + ' items, ' + courseCount + ' courses';
            toast('Restored ' + itemCount + ' items');
            setTimeout(function() {
              renderDashboard();
            }, 500);
            try { playPresetSelect(); } catch(e2) {}
          } catch (e) {
            if (statusEl) statusEl.textContent = 'Invalid JSON — ' + (e.message || String(e));
          }
        };
      }
  try { playOpen(); } catch(e) {}
    }

    function closeSettings() {
      settingsOv.classList.remove('show');
      settingsOv.setAttribute('aria-hidden','true');
  try { playClose(); } catch(e) {}
    }

    function reconcileStats() {
      var totalReviews = 0;
      var byTier = { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 };
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        var reps = (it.fsrs && it.fsrs.reps) ? it.fsrs.reps : 0;
        totalReviews += reps;
        var t = it.lastTier;
        if (!t) {
          var hasMockField = it.timeLimitMins && it.timeLimitMins > 0;
          var hasDistinguish = it.conceptA && it.conceptB;
          var hasApply = it.task || it.scenario;
          var paraCount2 = (it.modelAnswer || '').split('\n\n').filter(function(s) { return String(s).trim(); }).length;
          if (hasMockField) {
            t = 'mock';
          } else if (hasDistinguish) {
            t = 'distinguish';
          } else if (hasApply) {
            t = 'apply';
          } else if (paraCount2 >= 2) {
            t = 'worked';
          } else {
            t = 'quickfire';
          }
        }
        if (byTier[t] != null) byTier[t] += reps;
      }
      state.stats.totalReviews = totalReviews;
      state.stats.reviewsByTier = byTier;
    }

    function openCourseDetail(courseName) {
      var c = getCourse(courseName);
      if (!c) return;

      var gearBtn = document.querySelector('.topbar-right .icon-btn');
      if (gearBtn) gearBtn.style.display = 'none';

      el('cdTitle').textContent = c.name;
      var cdHeader = document.querySelector('#courseDetail .cd-header');
      if (cdHeader) {
        cdHeader.style.borderLeft = '5px solid ' + (c.color || '#8b5cf6');
        cdHeader.style.paddingLeft = '10px';
        cdHeader.style.borderRadius = '6px';
      }

      /* Badges */
      var examStatus = c.examDate ? (getCramState(c.name).active ? '🔥 Cram Mode Active' : '📅 Exam Date Set') : '🧠 Long-Term Retention';
      var examBadgeClass = c.examDate ? (getCramState(c.name).active ? 'objective-exam' : 'objective-exam') : 'objective-retention';
      var badges = '<span class="cd-badge ' + examBadgeClass + '">' + examStatus + '</span>';
      badges += '<span class="cd-badge">' + esc(EXAM_TYPE_LABELS[c.examType] || c.examType) + '</span>';
      if (c.manualMode) badges += '<span class="cd-badge" style="border-color:rgba(245,158,11,0.3);color:#f59e0b;">Manual</span>';
      el('cdBadges').innerHTML = badges;

      /* Countdown */
      var countdownEl = el('cdCountdown');
      if (c.examDate) {
        /* Compare calendar dates at local midnight for accurate day count */
        var examMidnight = new Date(c.examDate + 'T00:00:00');
        var todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
        var daysUntil = Math.round((examMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil > 0) {
          countdownEl.style.display = 'block';
          el('cdDays').textContent = String(daysUntil);
          el('cdDaysLabel').textContent = daysUntil === 1 ? 'Day until exam' : 'Days until exam';
        } else if (daysUntil === 0) {
          countdownEl.style.display = 'block';
          el('cdDays').textContent = 'Today';
          el('cdDaysLabel').textContent = 'Exam day';
        } else {
          countdownEl.style.display = 'none';
        }
      } else {
        countdownEl.style.display = 'none';
      }

      /* Course items */
      var courseItems = {};
      var totalItems = 0;
      var dueCount = 0;
      var now = Date.now();
      var retSum = 0, retN = 0;
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.course !== courseName || it.archived) continue;
        courseItems[id] = it;
        totalItems++;
        var f = it.fsrs || null;
        var dueTs = f && f.due ? new Date(f.due).getTime() : 0;
        if (!f || !f.lastReview || dueTs <= now) dueCount++;
        if (f && f.lastReview) {
          retSum += retrievability(f, now);
          retN++;
        }
      }

      el('cdItemCount').textContent = String(totalItems);
      el('cdDueCount').textContent = dueCount + ' due now';
      el('cdAvgRet').textContent = retN ? Math.round((retSum / retN) * 100) + '%' : '—';
      el('cdRetTrend').textContent = retN ? 'Across ' + retN + ' reviewed items' : 'No reviews yet';

      /* Per-tier stats */
      var tierOrder = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
      var tierNames = { quickfire: 'Quick Fire', explain: 'Explain', apply: 'Apply', distinguish: 'Distinguish', mock: 'Mock', worked: 'Worked Ex.' };
      var tierStats = '';
      tierOrder.forEach(function(t) {
        var count = 0;
        for (var id2 in courseItems) {
          var supported = detectSupportedTiers(courseItems[id2]);
          if (supported.indexOf(t) >= 0) count++;
        }
        var col = tierColour(t);
        tierStats += '<div class="cd-tier-stat"><div class="cts-count" style="color:' + col + ';">' + count + '</div><div class="cts-label">' + tierNames[t] + '</div></div>';
      });
      el('cdTierStats').innerHTML = tierStats;

      var promoHost = el('cdTierPromoHost');
      if (promoHost) {
        var promos = getPromotionCandidates(courseName);
        if (promos.length > 0) {
          var ph = '<div style="margin-bottom:14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(34,197,94,0.2);background:rgba(34,197,94,0.04);">';
          ph += '<div style="font-size:9px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#22c55e;margin-bottom:8px;">🎯 Tier Promotion Ready</div>';
          ph += '<div style="font-size:10px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px;">' + promos.length + ' card' + (promos.length > 1 ? 's have' : ' has') + ' mastered ' + (promos.length > 1 ? 'their' : 'its') + ' current tier. Promoting increases retrieval difficulty for deeper encoding.</div>';
          promos.slice(0, 5).forEach(function(p) {
            ph += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid rgba(var(--accent-rgb),0.10);background:rgba(var(--accent-rgb),0.02);margin-bottom:6px;">';
            ph += '<div style="flex:1;min-width:0;font-size:10px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(String(p.item.prompt).substring(0, 60)) + '</div>';
            ph += '<div style="flex-shrink:0;font-size:8px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--text-secondary);">' + tierLabel(p.currentTier) + ' → ' + tierLabel(p.suggestedTier) + '</div>';
            ph += '<button type="button" class="cd-promote-tier" data-promote-id="' + esc(p.id) + '" data-promote-tier="' + esc(p.suggestedTier) + '" style="flex-shrink:0;padding:5px 10px;border-radius:8px;border:1px solid rgba(34,197,94,0.2);background:rgba(34,197,94,0.08);color:#22c55e;font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;cursor:pointer;">Promote</button>';
            ph += '</div>';
          });
          if (promos.length > 5) {
            ph += '<div style="font-size:9px;color:var(--text-tertiary);text-align:center;margin-top:4px;">+ ' + (promos.length - 5) + ' more</div>';
          }
          ph += '</div>';
          promoHost.innerHTML = ph;
          promoHost.querySelectorAll('.cd-promote-tier').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var pid = this.getAttribute('data-promote-id');
              var pt = this.getAttribute('data-promote-tier');
              if (pid && pt) promoteItemTier(pid, pt);
              openCourseDetail(courseName);
            });
          });
        } else {
          promoHost.innerHTML = '';
        }
      }

      var primeBtn = el('cdPrimeModeBtn');
      if (primeBtn) {
        primeBtn.onclick = function() { startPrimeMode(courseName); };
      }

      var tnHost = el('cdTutorNotesHost');
      if (tnHost) {
        tnHost.innerHTML = renderCourseTutorNotesPanelHTML(courseName);
        wireTutorNotesPanelToggle(tnHost);
      }

      /* ── Advanced Analytics ── */
      var cdAnalytics = el('cdAnalytics');
      if (!cdAnalytics) {
        /* Create analytics container if it doesn't exist in HTML yet */
        var analyticsDiv = document.createElement('div');
        analyticsDiv.id = 'cdAnalytics';
        analyticsDiv.className = 'cd-analytics';
        /* Insert after tier stats */
        var tierStatsEl = el('cdTierStats');
        if (tierStatsEl && tierStatsEl.nextSibling) {
          tierStatsEl.parentNode.insertBefore(analyticsDiv, tierStatsEl.nextSibling);
        }
        cdAnalytics = analyticsDiv;
      }

      /* Inline SVG icons for analytics cards (12×12, matches Lucide style) */
      var acIcons = {
        rating: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="9" width="2.5" height="5" rx="0.5"/><rect x="6.75" y="5" width="2.5" height="9" rx="0.5"/><rect x="11.5" y="7" width="2.5" height="7" rx="0.5"/></svg>',
        stability: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L3 5v4c0 3.5 2.5 5.5 5 6.5 2.5-1 5-3 5-6.5V5L8 2z"/></svg>',
        target: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="0.5" fill="currentColor"/></svg>',
        trend: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,4 5.5,7.5 9,5.5 14,12"/><polyline points="10,4 14,4 14,8"/></svg>'
      };

      var ratingLegend = [
        { label: 'Again', color: 'var(--rate-again)' },
        { label: 'Hard', color: 'var(--rate-hard)' },
        { label: 'Good', color: 'var(--rate-good)' },
        { label: 'Easy', color: 'var(--rate-easy)' }
      ];
      var legendHTML = '<div class="cda-legend">';
      ratingLegend.forEach(function(r) {
        legendHTML += '<span class="cda-legend-item"><span class="cda-legend-dot" style="background:' + r.color + '"></span>' + r.label + '</span>';
      });
      legendHTML += '</div>';

      cdAnalytics.innerHTML =
        '<div class="cda-section-header">Course Analytics</div>' +
        '<div class="cda-grid">' +
          '<div class="analytics-card">' +
            '<div class="ac-title"><span class="ac-icon">' + acIcons.rating + '</span>Rating History</div>' +
            '<div class="ac-subtitle">Last 30 reviews</div>' +
            '<canvas id="cdaRatingCanvas" height="100"></canvas>' +
            legendHTML +
          '</div>' +
          '<div class="analytics-card">' +
            '<div class="ac-title"><span class="ac-icon">' + acIcons.target + '</span>Tier Accuracy</div>' +
            '<div class="ac-subtitle">Average rating per tier</div>' +
            '<canvas id="cdaTierAccCanvas" height="100"></canvas>' +
          '</div>' +
        '</div>' +
        '<div class="cda-grid">' +
          '<div class="analytics-card">' +
            '<div class="ac-title"><span class="ac-icon">' + acIcons.stability + '</span>Stability</div>' +
            '<div class="ac-subtitle">Memory strength distribution</div>' +
            '<canvas id="cdaStabilityCanvas" height="100"></canvas>' +
          '</div>' +
          '<div class="analytics-card">' +
            '<div class="ac-title"><span class="ac-icon">' + acIcons.trend + '</span>Retention Forecast</div>' +
            '<div class="ac-subtitle">Predicted decay over 30 days</div>' +
            '<canvas id="cdaRetForecastCanvas" height="100"></canvas>' +
          '</div>' +
        '</div>';

      setTimeout(function() {
        drawCourseRatingHistory('cdaRatingCanvas', courseName);
        drawStabilityDistribution('cdaStabilityCanvas', courseItems);
        drawTierAccuracy('cdaTierAccCanvas', courseName);
        drawRetentionCurve('cdaRetForecastCanvas', courseItems, c.name);
        wireRetentionInteractivity('cdaRetForecastCanvas');
      }, 60);

      /* ── Card list with delete ── */
      var cardListEl = el('cdCardList');
      if (cardListEl) {
        var sortedIds = Object.keys(courseItems);
        sortedIds.sort(function(aId, bId) {
          var a = courseItems[aId], b = courseItems[bId];
          var aD = (a.fsrs && a.fsrs.due) ? new Date(a.fsrs.due).getTime() : 0;
          var bD = (b.fsrs && b.fsrs.due) ? new Date(b.fsrs.due).getTime() : 0;
          return aD - bD;
        });
        if (sortedIds.length === 0) {
          cardListEl.innerHTML = '<div class="empty-state" style="padding:16px;"><div class="empty-icon"><svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7"><rect x="3" y="1.5" width="10" height="13" rx="1.5"/><line x1="6" y1="5" x2="10" y2="5"/><line x1="6" y1="7.5" x2="10" y2="7.5"/><line x1="6" y1="10" x2="8.5" y2="10"/></svg></div><div class="empty-title">No cards yet</div><div class="empty-desc">Add cards to this course to start studying.</div></div>';
        } else {
          var clHTML = '';
          sortedIds.forEach(function(cid) {
            var it = courseItems[cid];
            var delId = it.id || cid;
            var preview = (it.prompt || '').substring(0, 80) + ((it.prompt || '').length > 80 ? '…' : '');
            var retVal = (it.fsrs && it.fsrs.lastReview) ? Math.round(retrievability(it.fsrs, now) * 100) : null;
            var retDisplay = retVal !== null ? retVal + '%' : 'New';
            var retCol = retVal === null ? 'var(--text-secondary)' : retVal >= 80 ? 'var(--rate-good)' : retVal >= 50 ? 'var(--rate-hard)' : 'var(--rate-again)';
            var topicTag = it.topic ? '<span class="meta"><span class="tag" style="font-size:7px;padding:3px 6px;">' + esc(it.topic) + '</span></span>' : '';
            var priorityTag = (it.priority && it.priority !== 'medium') ? priorityBadgeHTML(it.priority) : '';
            clHTML += '<div class="course-list-item" data-card-id="' + esc(delId) + '" style="flex-wrap:wrap;">' +
              '<div style="flex:1;min-width:0;">' +
              '<div class="cli-name">' + esc(preview) + '</div>' +
                '<div style="display:flex;gap:6px;margin-top:3px;align-items:center;">' + topicTag + (priorityTag ? '<span class="meta">' + priorityTag + '</span>' : '') + '</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
              '<span style="font-size:10px;font-weight:700;color:' + retCol + ';">' + retDisplay + '</span>' +
              '<button class="cd-edit-card" data-edit-id="' + esc(delId) + '" title="Edit card"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5a1.8 1.8 0 012.5 2.5L6 13l-3.5 1 1-3.5z"/><line x1="9.5" y1="4.5" x2="12" y2="7"/></svg></button>' +
              '<button class="cd-archive-card" data-archive-id="' + esc(delId) + '" title="Archive card"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="13" height="3.5" rx="1"/><path d="M2.5 5.5V13a1 1 0 001 1h9a1 1 0 001-1V5.5"/><line x1="6.5" y1="8.5" x2="9.5" y2="8.5"/></svg></button>' +
                '<button class="cd-delete-card" data-delete-id="' + esc(delId) + '" title="Delete card permanently"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg></button>' +
              '</div>' +
          '</div>' +
          '<div class="cd-edit-wrap" id="editWrap_' + delId + '"></div>';
          });
          /* Build archived cards section */
          var archivedItems = [];
          for (var aid in state.items) {
            if (!state.items.hasOwnProperty(aid)) continue;
            var ait = state.items[aid];
            if (!ait || ait.course !== courseName || !ait.archived) continue;
            archivedItems.push({ key: aid, it: ait });
          }

          var archiveHTML = '';
          if (archivedItems.length > 0) {
            archiveHTML = '<div class="archive-toggle" id="archiveToggle_' + courseKey(courseName) + '">' +
              '<span class="archive-arrow">▶</span> <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><rect x="1.5" y="2" width="13" height="3.5" rx="1"/><path d="M2.5 5.5V13a1 1 0 001 1h9a1 1 0 001-1V5.5"/><line x1="6.5" y1="8.5" x2="9.5" y2="8.5"/></svg>Archived (' + archivedItems.length + ')' +
              '</div>' +
              '<div class="archive-section" id="archiveSection_' + courseKey(courseName) + '">';
            archivedItems.forEach(function(a) {
              var ait = a.it;
              var aPreview = (ait.prompt || '').substring(0, 60) + ((ait.prompt || '').length > 60 ? '…' : '');
              var aId = ait.id || a.key;
              archiveHTML += '<div class="archive-item">' +
                '<span class="ai-prompt">' + esc(aPreview) + '</span>' +
                '<div class="ai-actions">' +
                '<button class="cd-restore-card" data-restore-id="' + esc(aId) + '" title="Restore card"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px"><polyline points="2,7 5,4 8,7"/><path d="M5 4v5a3 3 0 003 3h4"/></svg>Restore</button>' +
                '<button class="cd-delete-card" data-delete-id="' + esc(aId) + '" title="Delete permanently"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg></button>' +
                '</div></div>';
            });
            archiveHTML += '</div>';
          }

          cardListEl.innerHTML = clHTML + archiveHTML;

          cardListEl.querySelectorAll('.cd-delete-card').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var delId = this.getAttribute('data-delete-id');
              if (!delId || !state.items[delId]) return;
              var row = this.closest('.course-list-item');
              if (window.gsap && row) {
                gsap.to(row, { opacity: 0, x: -20, height: 0, marginBottom: 0, padding: 0, duration: 0.3, ease: 'power2.in', onComplete: function() {
                  delete state.items[delId];
                  reconcileStats();
                  saveState();
                  openCourseDetail(courseName);
                  renderDashboard();
                  toast('Card deleted');
                }});
              } else {
                delete state.items[delId];
                reconcileStats();
                saveState();
                openCourseDetail(courseName);
                renderDashboard();
                toast('Card deleted');
              }
            });
          });

          /* Edit button handlers */
          cardListEl.querySelectorAll('.cd-edit-card').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var editId = this.getAttribute('data-edit-id');
              if (editId) window.editCard(editId);
              try { playClick(); } catch(e2) {}
            });
          });

          /* Archive button handlers */
          cardListEl.querySelectorAll('.cd-archive-card').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var archId = this.getAttribute('data-archive-id');
              if (!archId || !state.items[archId]) return;
              var row = this.closest('.course-list-item');
              if (window.gsap && row) {
                gsap.to(row, { opacity: 0, x: 20, height: 0, marginBottom: 0, padding: 0, duration: 0.3, ease: 'power2.in', onComplete: function() {
                  state.items[archId].archived = true;
                  reconcileStats();
                  saveState();
                  openCourseDetail(courseName);
                  renderDashboard();
                  toast('Card archived');
                }});
              } else {
                state.items[archId].archived = true;
                reconcileStats();
                saveState();
                openCourseDetail(courseName);
                renderDashboard();
                toast('Card archived');
              }
            });
          });

          /* Archive section toggle */
          var archToggle = el('archiveToggle_' + courseKey(courseName));
          var archSection = el('archiveSection_' + courseKey(courseName));
          if (archToggle && archSection) {
            archToggle.addEventListener('click', function() {
              var isOpen = archSection.classList.contains('show');
              archSection.classList.toggle('show', !isOpen);
              archToggle.classList.toggle('open', !isOpen);
              if (window.gsap && !isOpen) {
                gsap.fromTo(archSection.querySelectorAll('.archive-item'),
                  { opacity: 0, y: 4 }, { opacity: 0.75, y: 0, duration: 0.2, stagger: 0.04, ease: 'power2.out' });
              }
              try { playClick(); } catch(e) {}
            });
          }

          /* Restore button handlers (inside archive section) */
          cardListEl.querySelectorAll('.cd-restore-card').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var restoreId = this.getAttribute('data-restore-id');
              if (!restoreId || !state.items[restoreId]) return;
              delete state.items[restoreId].archived;
              reconcileStats();
              saveState();
              openCourseDetail(courseName);
              renderDashboard();
              toast('Card restored');
              try { playPresetSelect(); } catch(e2) {}
            });
          });
        }
      }

      /* Retention curve now drawn inside cdAnalytics grid via cdaRetForecastCanvas */

      el('tabHome').style.display = 'none';
      el('tabHome').classList.remove('active');
      el('tabCourses').style.display = 'none';
      el('tabCourses').classList.remove('active');
      el('courseDetail').style.display = 'block';
      el('courseDetail').classList.add('active');

      if (window.gsap) {
        gsap.fromTo(el('courseDetail'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }

      /* Wire course settings shortcut */
      var cdSettingsBtn = el('cdSettingsBtn');
      if (cdSettingsBtn) {
        cdSettingsBtn.onclick = function() {
          showCourseContextMenu(courseName, cdSettingsBtn);
          try { playClick(); } catch(e) {}
        };
      }

      var cdAddBtn = el('cdAddCardBtn');
      if (cdAddBtn) {
        cdAddBtn.onclick = function() {
          openModal('add', courseName);
        };
      }
      var cdImpBtn = el('cdImportBtn');
      if (cdImpBtn) {
        cdImpBtn.onclick = function() {
          openModal('import', courseName);
        };
      }
    }
