/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function renderDashboard() {
      ensureStandaloneDashboardLayout();
      var due = countDue(state.items, 'All', 'All');
      var totalItems = 0;
      for (var _id in state.items) {
        if (!state.items.hasOwnProperty(_id) || !state.items[_id] || state.items[_id].archived) continue;
        if (state.items[_id].course && state.courses[state.items[_id].course] && state.courses[state.items[_id].course].archived) continue;
        totalItems++;
      }

      /* Empty state */
      var emptyEl = el('emptyState');
      var heroEl = el('heroStat');
      var emptyTitleEl = emptyEl ? emptyEl.querySelector('.empty-title') : null;
      var emptyDescEl = emptyEl ? emptyEl.querySelector('.empty-desc') : null;
      var emptyAddDeckBtn = el('emptyAddDeckBtn');
      var startBtnEl = el('startBtn');
      var miniActionsEl = el('homeMiniActions');
      if (totalItems === 0) {
        emptyEl.style.display = 'block';
        heroEl.style.display = 'none';
        if (startBtnEl) startBtnEl.disabled = true;
        el('tierBreakdown').innerHTML = '';
        if (document.body.classList.contains('standalone')) {
          var emptyMiniActions = el('homeMiniActions');
          if (emptyMiniActions) emptyEl.insertAdjacentElement('afterend', emptyMiniActions);
        }
        var sleepBannerEmpty = el('sleepAdviceBanner');
        if (sleepBannerEmpty) {
          sleepBannerEmpty.className = 'break-banner';
          sleepBannerEmpty.innerHTML = '';
        }
        el('statStreak').textContent = '—';
        var streakWrapEmpty = el('streakStatWrap');
        if (streakWrapEmpty) streakWrapEmpty.style.display = (settings.gamificationMode === 'off') ? 'none' : '';
        var progHubEmpty = el('progressionHub');
        if (progHubEmpty) progHubEmpty.style.display = 'none';
        var streakValEmpty = el('statStudyStreak');
        if (streakValEmpty) streakValEmpty.textContent = '—';
        el('statRet').textContent = '—';
        el('calVal').textContent = '—';
        el('calSub').textContent = 'Add items to begin';
        setCalArc(0);
        var hasCourses = listCourses().length > 0;
        if (emptyTitleEl) emptyTitleEl.textContent = hasCourses ? 'No items yet' : 'No decks yet';
        if (emptyDescEl) emptyDescEl.textContent = hasCourses
          ? 'Add study items manually or import a JSON batch to start your first retrieval session.'
          : 'Create your first deck to organize topics, track retention, and make the dashboard come alive.';
        if (emptyAddDeckBtn) emptyAddDeckBtn.style.display = hasCourses ? 'none' : 'inline-flex';
        if (isEmbedded && !hasCourses) {
          if (startBtnEl) startBtnEl.style.display = 'none';
          if (miniActionsEl) miniActionsEl.style.display = 'none';
        } else {
          if (startBtnEl) startBtnEl.style.display = '';
          if (miniActionsEl) miniActionsEl.style.display = '';
        }
        renderAnalytics('All');
        renderTutorAnalyticsDashboard();
        renderCourseCards();
        if (emptyAddDeckBtn && !emptyAddDeckBtn.dataset.wired) {
          emptyAddDeckBtn.dataset.wired = 'true';
          emptyAddDeckBtn.addEventListener('click', function() {
            openCreateCourseFlow();
            try { playClick(); } catch (e) {}
          });
        }
        return;
      }
      emptyEl.style.display = 'none';
      if (emptyAddDeckBtn) emptyAddDeckBtn.style.display = 'none';
      if (startBtnEl) startBtnEl.style.display = '';
      if (miniActionsEl) miniActionsEl.style.display = '';
      heroEl.style.display = 'block';

      /* Hero due count with counter animation */
      animateCounter(el('statDue'), due.total);
      el('heroCourseHint').textContent = 'Across all tiers';

      var cramBannerEl = el('cramBanner');
      if (cramBannerEl) {
        var activeCrams = listCourses().map(function(course) {
          return { name: course.name, cram: getCramState(course.name) };
        }).filter(function(entry) {
          return entry.cram && entry.cram.active;
        }).sort(function(a, b) {
          return (a.cram.daysUntil || 9999) - (b.cram.daysUntil || 9999);
        });
        if (activeCrams.length) {
          var cramHtml = '';
          activeCrams.forEach(function(entry) {
            cramHtml += '<div class="cram-banner show" style="background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(245,158,11,0.08));border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-lg);padding:16px;margin:12px 0;">' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
              '<span class="cram-dashboard-fire" style="display:inline-flex;align-items:center;justify-content:center;">🔥</span>' +
              '<div style="min-width:0;">' +
              '<div style="font-weight:600;font-size:13px;">CRAM MODE — ' + esc(entry.name) + ' (' + esc(String(entry.cram.daysUntil)) + ' days)</div>' +
              '<div style="font-size:11px;opacity:0.7;">' + esc(entry.cram.intensity) + ' intensity · ' + esc(String(entry.cram.sessionMod)) + '× session size · ' + esc(String(entry.cram.intervalMod)) + '× intervals</div>' +
              '</div>' +
              '</div>' +
              '</div>';
          });
          cramBannerEl.classList.add('show');
          cramBannerEl.innerHTML = cramHtml;
          if (window.gsap) {
            gsap.fromTo(cramBannerEl.querySelectorAll('.cram-banner'), { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.28, stagger: 0.06, ease: 'power2.out' });
            gsap.fromTo(cramBannerEl.querySelectorAll('.cram-dashboard-fire'), { scale: 0.96 }, { scale: 1.08, repeat: 1, yoyo: true, duration: 0.45, ease: 'sine.inOut', stagger: 0.08 });
          }
        } else {
          cramBannerEl.classList.remove('show');
          cramBannerEl.innerHTML = '';
        }
      }

      /* Secondary stats — animated counters */
      var masteredCount = 0;
      for (var sid in state.items) {
        if (!state.items.hasOwnProperty(sid)) continue;
        var sit = state.items[sid];
        if (!sit || sit.archived || !sit.fsrs) continue;
        if (sit.course && state.courses[sit.course] && state.courses[sit.course].archived) continue;
        if ((sit.fsrs.stability || 0) > 30 && (sit.fsrs.lapses || 0) === 0) masteredCount++;
      }
      animateCounter(el('statStreak'), masteredCount);
      /* Streak counter */
      var streakWrap = el('streakStatWrap');
      if (streakWrap) {
        if (settings.gamificationMode === 'off') {
          streakWrap.style.display = 'none';
        } else {
          streakWrap.style.display = '';
          var streakDays = (state.stats && state.stats.streakDays) || 0;
          animateCounter(el('statStudyStreak'), streakDays);
          var streakSubEl = el('streakSub');
          if (streakSubEl) {
            streakSubEl.textContent = streakDays === 1 ? 'day' : 'days';
          }
        }
      }
      /* ── Progression Hub (motivated mode) ── */
      var progHub = el('progressionHub');
      var streakWrapEl = el('streakStatWrap');
      if (progHub) {
        if (settings.gamificationMode === 'motivated' && due.total >= 0) {
          progHub.style.display = '';
          if (streakWrapEl) streakWrapEl.style.display = 'none';

          var totalXP = 0;
          try { totalXP = parseInt(SyncEngine.get('dragon', 'xp') || '0', 10); } catch (e) {}
          var stageInfo = getDragonStage(totalXP);
          var streakDays = (state.stats && state.stats.streakDays) || 0;

          var progEmoji = el('progRankEmoji');
          var progRankName = el('progRankName');
          if (progEmoji) progEmoji.textContent = stageInfo.emoji;
          if (progRankName) progRankName.textContent = stageInfo.rank.toUpperCase();

          var progXP = el('progXPValue');
          if (progXP) {
            var prevXP = parseInt(progXP.textContent.replace(/,/g, ''), 10) || 0;
            if (window.gsap && prevXP !== totalXP) {
              var xpObj = { val: prevXP };
              gsap.to(xpObj, {
                val: totalXP,
                duration: 0.8,
                ease: 'power2.out',
                onUpdate: function() {
                  progXP.textContent = Math.round(xpObj.val).toLocaleString();
                }
              });
            } else {
              progXP.textContent = totalXP.toLocaleString();
            }
          }

          var progStreakVal = el('progStreakVal');
          var progStreakUnit = el('progStreakUnit');
          var progStreakPill = el('progStreakPill');
          if (progStreakVal) {
            if (window.gsap) {
              var sObj = { val: parseInt(progStreakVal.textContent, 10) || 0 };
              gsap.to(sObj, {
                val: streakDays,
                duration: 0.6,
                ease: 'power2.out',
                onUpdate: function() { progStreakVal.textContent = String(Math.round(sObj.val)); }
              });
            } else {
              progStreakVal.textContent = String(streakDays);
            }
          }
          if (progStreakUnit) progStreakUnit.textContent = streakDays === 1 ? 'day' : 'days';
          if (progStreakPill) {
            var streakIcon = progStreakPill.querySelector('.prog-streak-icon');
            if (streakIcon && window.gsap) {
              var flameScale = streakDays >= 30 ? 1.3 : streakDays >= 7 ? 1.15 : 1.0;
              gsap.to(streakIcon, { scale: flameScale, duration: 0.4, ease: 'back.out(1.7)' });
            }
          }

          var progFill = el('progBarFill');
          var progGlow = el('progBarGlow');
          var progCurrent = el('progBarCurrent');
          var progNext = el('progBarNext');
          var pct = 0;
          if (stageInfo.next === Infinity) {
            pct = 100;
          } else {
            var currentThreshold = 0;
            if (stageInfo.stage === 1) currentThreshold = 1000;
            else if (stageInfo.stage === 2) currentThreshold = 5000;
            else if (stageInfo.stage === 3) currentThreshold = 20000;
            else if (stageInfo.stage === 4) currentThreshold = 60000;
            else if (stageInfo.stage === 5) currentThreshold = 120000;
            var range = stageInfo.next - currentThreshold;
            var progress = totalXP - currentThreshold;
            pct = range > 0 ? Math.min(99, Math.max(0, Math.round((progress / range) * 100))) : 0;
          }
          if (progFill) {
            if (window.gsap) {
              gsap.to(progFill, { width: pct + '%', duration: 1.0, ease: 'power2.out', delay: 0.2 });
            } else {
              progFill.style.width = pct + '%';
            }
          }
          if (progGlow && window.gsap && pct > 0) {
            gsap.to(progGlow, { opacity: 1, duration: 0.6, delay: 0.8 });
          }
          if (progCurrent) progCurrent.textContent = pct + '% to next rank';
          if (progNext) {
            if (stageInfo.next === Infinity) {
              progNext.textContent = 'Max rank achieved';
            } else {
              var nextInfo = getDragonStage(stageInfo.next);
              progNext.textContent = nextInfo.rank;
            }
          }

          if (window.gsap) {
            gsap.fromTo(progHub,
              { opacity: 0, y: 10, scale: 0.98 },
              { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out' }
            );
            gsap.fromTo(progHub.querySelectorAll('.prog-rank-badge, .prog-rank-info, .prog-streak-pill, .prog-bar-section'),
              { opacity: 0, y: 6 },
              { opacity: 1, y: 0, duration: 0.3, stagger: 0.08, delay: 0.15, ease: 'power2.out' }
            );
            var badge = el('progRankBadge');
            if (badge && !badge.dataset.progBreathing) {
              badge.dataset.progBreathing = '1';
              gsap.to(badge, {
                boxShadow: '0 4px 28px rgba(var(--accent-rgb), 0.25)',
                duration: 2.5,
                yoyo: true,
                repeat: -1,
                ease: 'sine.inOut'
              });
            }
          }
        } else {
          progHub.style.display = 'none';
          if (streakWrapEl) {
            streakWrapEl.style.display = (settings.gamificationMode === 'off') ? 'none' : '';
          }
        }
      }
      var ar = avgRetention(state.items);
      if (ar == null) {
        el('statRet').textContent = '—';
      } else {
        var retTarget = Math.round(ar * 100);
        var retEl = el('statRet');
        if (window.gsap) {
          var retObj = { val: 0 };
          gsap.to(retObj, {
            val: retTarget,
            duration: 0.6,
            ease: 'power2.out',
            onUpdate: function() { retEl.textContent = Math.round(retObj.val) + '%'; }
          });
        } else {
          retEl.textContent = retTarget + '%';
        }
      }

      /* Calibration — animated */
      var calP = calibrationPct(state.calibration);
      if (calP == null) {
        el('calVal').textContent = '—';
      } else {
        var calTarget = Math.round(calP * 100);
        var calEl = el('calVal');
        if (window.gsap) {
          var calObj = { val: 0 };
          gsap.to(calObj, {
            val: calTarget,
            duration: 0.7,
            ease: 'power2.out',
            onUpdate: function() { calEl.textContent = Math.round(calObj.val) + '%'; }
          });
        } else {
          calEl.textContent = calTarget + '%';
        }
      }
      el('calSub').textContent = (calP == null) ? 'Complete a session to begin' : (calP >= 0.75 ? 'Well calibrated' : calP >= 0.55 ? 'Slight overconfidence' : 'Significant miscalibration');
      setCalArc(calP == null ? 0 : calP);

      /* Tier breakdown with tier colours */
      var tiers = ['quickfire','explain','apply','distinguish','mock','worked'];
      var tierNames = { quickfire:'Quick Fire', explain:'Explain', apply:'Apply', distinguish:'Distinguish', mock:'Mock', worked:'Worked Example' };
      var tierDescs = {
        quickfire: 'Cued recall — see a prompt, retrieve the answer from memory. Tests raw factual knowledge (Remember level). Best for definitions, key terms, and MC prep.',
        explain: 'Write an explanation, then compare to a model answer. Tests conceptual understanding (Understand/Analyse). Builds the ability to articulate why, not just what.',
        apply: 'Read a scenario and apply a concept to it. Tests transfer to new contexts (Apply/Analyse). Builds essay and short-answer exam skills.',
        distinguish: 'Two similar concepts side by side — decide which applies to a given scenario. Tests discrimination (Analyse/Evaluate). Prevents confusing related ideas under pressure.',
        mock: 'Full synthesis under a countdown timer. Tests everything at once (Evaluate/Create). Builds exam stamina and time management.',
        worked: 'Partial model analysis with one section blank — you complete the missing reasoning (e.g. IRAC steps). Bridges worked examples and active retrieval.'
      };
      var bd = '';
      tiers.forEach(function(t) {
        var c = due.byTier[t] || 0;
        var col = tierColour(t);
        bd += '<span class="tier-pill info-icon" data-count="' + c + '" tabindex="0" aria-label="' + esc(tierNames[t]) + ' info" style="border-color:' + col + '30;cursor:help;position:relative;"><span class="tier-dot" style="background:' + col + ';box-shadow:0 0 12px ' + col + '33;"></span>' + tierNames[t] + ': ' + c + '<span class="info-tooltip">' + esc(tierDescs[t]) + '<span class="tip-arrow"></span></span></span>';
      });
      el('tierBreakdown').innerHTML = bd;

      /* ── Integrated resume-or-new session UI ── */
      var startBtnEl = el('startBtn');
      var resumeSnapshot = checkForResumableSession();

      /* Clean up any previous resume wrapper */
      var oldResumeWrap = document.getElementById('resumeSessionWrap');
      if (oldResumeWrap) oldResumeWrap.remove();

      if (resumeSnapshot && resumeSnapshot._remaining > 0 && due.total > 0) {
        /* Hide the normal start button, show dual-action UI */
        startBtnEl.style.display = 'none';

        var wrap = document.createElement('div');
        wrap.id = 'resumeSessionWrap';
        wrap.className = 'resume-session-wrap';
        wrap.innerHTML =
          '<div class="resume-session-hint">' +
            '<span class="resume-session-dot"></span>' +
            resumeSnapshot._remaining + ' card' + (resumeSnapshot._remaining === 1 ? '' : 's') +
            ' remaining from your last session' +
          '</div>' +
          '<div class="resume-session-actions">' +
            '<button class="big-btn" id="resumeContinueBtn">Continue Session</button>' +
            '<button class="big-btn ghost-btn" id="resumeNewBtn">New Session</button>' +
          '</div>';

        startBtnEl.insertAdjacentElement('afterend', wrap);

        document.getElementById('resumeContinueBtn').addEventListener('click', function() {
          resumeSavedSession(resumeSnapshot);
        });
        document.getElementById('resumeNewBtn').addEventListener('click', function() {
          clearActiveSessionSnapshot();
          var wrapEl = document.getElementById('resumeSessionWrap');
          if (wrapEl) wrapEl.remove();
          startBtnEl.style.display = '';
          startSession();
        });

        if (window.gsap) {
          gsap.fromTo(wrap, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
        }
      } else {
        /* Normal state — no interrupted session */
        startBtnEl.style.display = '';
        startBtnEl.disabled = (due.total === 0);
      }

      var sleepAdvice = getSleepAwareAdvice();
      var sleepBannerEl = el('sleepAdviceBanner');
      if (sleepBannerEl) {
        if (sleepAdvice.show && due.total > 0) {
          sleepBannerEl.innerHTML = '<div class="bb-icon">' + sleepAdvice.icon + '</div>' +
            '<div class="bb-text"><strong>' + esc(sleepAdvice.title) + '</strong>' +
            '<span class="bb-sub">' + esc(sleepAdvice.message) + '</span></div>';
          sleepBannerEl.className = 'break-banner show';
          sleepBannerEl.style.cursor = 'default';
        } else {
          sleepBannerEl.className = 'break-banner';
          sleepBannerEl.innerHTML = '';
        }
      }

      renderTutorAnalyticsDashboard();

      /* Staggered entry animation */
      if (window.gsap) {
        var targets = viewDash.querySelectorAll('.hero-stat, .stats-row, .tutor-stats-row, .gauge, .dash-details, .breakdown, .big-btn, .chips, .mini-actions');
        gsap.fromTo(targets,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.3, stagger: 0.04, ease: 'power2.out' }
        );
      }
      /* Render analytics graphs */
      setTimeout(function() {
        drawActivityHeatmap._viewYear = new Date().getFullYear();
        drawActivityHeatmap._viewMonth = new Date().getMonth();
        renderAnalytics('All');
      }, 50);

      /* Render course cards for Courses tab */
      renderCourseCards();
    }

    function renderCourseCards() {
      var container = el('courseCardsArea');
      var topicEmpty = el('topicChipsEmpty');
      if (!container) return;

      var courses = listCourses();
      var now = Date.now();

      if (!courses.length) {
        container.innerHTML = '<div class="empty-state" style="padding:20px 12px;">' +
          '<div class="empty-icon"><svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7"><path d="M2 12.5V3a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0114 3v9.5"/><path d="M2 12.5A1.5 1.5 0 013.5 11h9a1.5 1.5 0 011.5 1.5v0a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5z"/></svg></div>' +
          '<div class="empty-title">No courses yet</div>' +
          '<div class="empty-desc">Add a course to organise your study items and track per-course retention.</div>' +
        '</div>';
        if (topicEmpty) topicEmpty.style.display = 'block';
        return;
      }

      var h = '';
      courses.forEach(function(c) {
        var due = 0, total = 0, retSum = 0, retN = 0;
        for (var id in state.items) {
          if (!state.items.hasOwnProperty(id)) continue;
          var it = state.items[id];
          if (!it || it.course !== c.name || it.archived) continue;
          total++;
          var f = it.fsrs || null;
          var dueTs = f && f.due ? new Date(f.due).getTime() : 0;
          if (!f || !f.lastReview || dueTs <= now) due++;
          if (f && f.lastReview) { retSum += retrievability(f, now); retN++; }
        }
        var retPct = retN ? Math.round((retSum / retN) * 100) : null;
        var courseReadiness = computeExamReadiness(c.name);
        var readinessBadge = '';
        if (courseReadiness && courseReadiness.totalCards >= 5) {
          var rPct = courseReadiness.readinessPct;
          var rCol = rPct >= 75 ? 'var(--rate-good)' : rPct >= 50 ? 'var(--rate-hard)' : 'var(--rate-again)';
          readinessBadge = '<span class="cc-exam-type" style="border-color:' + rCol + ';color:' + rCol + ';background:rgba(139,92,246,0.08);">' + rPct + '% ready</span>';
        }
        var cramState = getCramState(c.name);
        var courseCol = c.color || '#8b5cf6';
        h += '<div class="course-card" data-course-name="' + esc(c.name) + '" style="border-left-color:' + esc(courseCol) + '; background: linear-gradient(135deg, ' + esc(courseCol) + '12, ' + esc(courseCol) + '06);">' +
          '<div class="cc-left">' +
          '<div class="cc-name"><span class="cc-color-dot" style="background:' + esc(courseCol) + ';"></span>' + esc(c.name) + '</div>' +
          '<div class="cc-meta">' +
          '<span class="cc-exam-type">' + esc(EXAM_TYPE_LABELS[c.examType] || c.examType) + '</span>' +
          (c.examDate ? '<span class="cc-exam-type" style="border-color:rgba(239,68,68,0.2);color:var(--rate-again);background:rgba(239,68,68,0.06);">' + (cramState.active ? '🔥 Cram' : '📅 Exam set') + '</span>' : '<span class="cc-exam-type" style="border-color:rgba(34,197,94,0.2);color:var(--rate-good);background:rgba(34,197,94,0.06);">🧠 Long-term</span>') +
          readinessBadge +
          '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div class="cc-due">' + due + '</div>' +
            '<div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--text-secondary);font-weight:600;">due</div>' +
            (retPct !== null ? '<div style="font-size:9px;color:var(--text-tertiary);margin-top:2px;">' + retPct + '% ret</div>' : '') +
          '</div>' +
        '</div>';
      });

      container.innerHTML = h;

      /* Wire click → sidebar-driven course dashboard */
      container.querySelectorAll('.course-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var name = this.getAttribute('data-course-name');
          if (name) {
            selectedCourse = name;
            if (isEmbedded) {
              openCourseDetail(name);
            } else {
              sidebarSelection = { level: 'course', course: name, module: null, topic: null };
              sidebarExpanded[name] = true;
              renderSidebar();
              updateBreadcrumb();
              applySidebarFilter();
            }
          }
          try { playClick(); } catch(e) {}
        });
      });

      if (topicEmpty) topicEmpty.style.display = 'block';

      /* Animate cards in */
      if (window.gsap) {
        gsap.fromTo(container.querySelectorAll('.course-card'),
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.25, stagger: 0.04, ease: 'power2.out' }
        );
      }
    }

    function renderCourseChips(courseList) {
      var chips = '';
      courseList.forEach(function(c) {
        chips += '<span class="chip' + (c === selectedCourse ? ' active' : '') + '" data-course="' + esc(c) + '">' + esc(c) + '</span>';
      });
      el('courseChips').innerHTML = chips;
      el('courseChips').querySelectorAll('.chip').forEach(function(ch){
        ch.addEventListener('click', function() {
          selectedCourse = this.getAttribute('data-course');
          selectedTopic = 'All';
          try { playPresetSelect(); } catch(e) {}
          renderDashboard();
        });
        ch.addEventListener('dblclick', function() {
          var course = this.getAttribute('data-course');
          if (course && course !== 'All') {
            openCourseDetail(course);
          }
        });
      });
    }

    function renderTopicChips() {
      var wrap = el('topicChipsWrap');
      var container = el('topicChips');
      if (!wrap || !container) return;

      if (selectedCourse === 'All') {
        wrap.style.display = 'none';
        selectedTopic = 'All';
        return;
      }

      var topics = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.course !== selectedCourse) continue;
        var t = (it.topic || '').trim();
        if (t) topics[t] = true;
      }
      var topicList = Object.keys(topics).sort(function(a, b) { return a.localeCompare(b); });

      if (topicList.length === 0) {
        wrap.style.display = 'none';
        selectedTopic = 'All';
        return;
      }

      topicList.unshift('All');
      wrap.style.display = 'block';

      var h = '';
      topicList.forEach(function(t) {
        h += '<span class="chip' + (t === selectedTopic ? ' active' : '') + '" data-topic="' + esc(t) + '">' + esc(t) + '</span>';
      });
      container.innerHTML = h;

      container.querySelectorAll('.chip').forEach(function(ch) {
        ch.addEventListener('click', function() {
          selectedTopic = this.getAttribute('data-topic');
          try { playPresetSelect(); } catch(e) {}
          renderDashboard();
        });
      });

      if (window.gsap) {
        gsap.fromTo(container.querySelectorAll('.chip'), { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.03, ease: 'power2.out' });
      }
    }

    function animateCounter(target, endVal) {
      if (!target) return;
      if (!window.gsap) { target.textContent = String(endVal); return; }
      var obj = { val: 0 };
      gsap.to(obj, {
        val: endVal,
        duration: 0.6,
        ease: 'power2.out',
        onUpdate: function() {
          target.textContent = String(Math.round(obj.val));
        }
      });
    }

    function drawRetentionCurve(canvasId, itemsByFilter, labelPrefix) {
      var parent = el(canvasId);
      if (!parent) return;
      var rect = parent.parentElement;
      var pw = rect ? rect.clientWidth - 24 : 280;
      pw = Math.max(200, pw);
      var ph = window.matchMedia('(max-width: 479px)').matches ? 160 : 185;

      var r = getCanvasCtx(canvasId, pw, ph);
      if (!r) return;
      var ctx = r.ctx, w = r.w, h = r.h;
      var rgb = getAccentRGB();
      var textSec = getTextSecondary();
      var textCol = getTextColor();

      /* Compute predicted retention for next 30 days */
      var now = Date.now();
      var items = [];
      for (var id in itemsByFilter) {
        if (!itemsByFilter.hasOwnProperty(id)) continue;
        var it = itemsByFilter[id];
        if (it && it.fsrs && it.fsrs.lastReview) items.push(it);
      }

      /* Clear stored data */
      retentionGraphData[canvasId] = null;

      if (!items.length) {
        ctx.fillStyle = textSec;
        ctx.font = '500 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Review items to see retention forecast', w / 2, h / 2);
        return;
      }

      var days = 30;
      var pad = { top: 8, right: 12, bottom: 22, left: 32 };
      var gw = w - pad.left - pad.right;
      var gh = h - pad.top - pad.bottom;

      var points = [];
      for (var d = 0; d <= days; d++) {
        var futureTs = now + d * 24 * 60 * 60 * 1000;
        var sum = 0;
        items.forEach(function(it) {
          sum += retrievability(it.fsrs, futureTs);
        });
        var avg = sum / items.length;
        var x = pad.left + (d / days) * gw;
        var y = pad.top + gh - (clamp(avg, 0, 1) * gh);
        points.push({ day: d, retention: avg, x: x, y: y });
      }

      /* Store for hover lookups + redraws */
      retentionGraphData[canvasId] = {
        points: points,
        pad: pad,
        gw: gw,
        gh: gh,
        w: w,
        h: h,
        days: days,
        itemCount: items.length,
        label: labelPrefix || 'All courses',
        lastItemsByFilter: itemsByFilter,
        lastLabelPrefix: labelPrefix || 'All courses'
      };

      /* Grid lines */
      ctx.strokeStyle = 'rgba(' + rgb + ',0.06)';
      ctx.lineWidth = 0.5;
      [0.25, 0.5, 0.75, 1.0].forEach(function(v) {
        var gy = pad.top + gh - (v * gh);
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(w - pad.right, gy);
        ctx.stroke();
      });

      /* Y-axis labels */
      ctx.fillStyle = textSec;
      ctx.font = '600 7px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      [0, 0.25, 0.5, 0.75, 1.0].forEach(function(v) {
        var gy = pad.top + gh - (v * gh);
        ctx.fillText(Math.round(v * 100) + '%', pad.left - 4, gy);
      });

      /* X-axis labels */
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      [0, 7, 14, 21, 30].forEach(function(d) {
        var gx = pad.left + (d / days) * gw;
        ctx.fillText(d + 'd', gx, h - pad.bottom + 6);
      });

      /* Gradient fill under curve */
      var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gh);
      grad.addColorStop(0, 'rgba(' + rgb + ',0.18)');
      grad.addColorStop(1, 'rgba(' + rgb + ',0.01)');

      ctx.beginPath();
      ctx.moveTo(points[0].x, pad.top + gh);
      points.forEach(function(p) { ctx.lineTo(p.x, p.y); });
      ctx.lineTo(points[points.length - 1].x, pad.top + gh);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      /* Curve line */
      ctx.beginPath();
      points.forEach(function(p, i) {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = 'rgba(' + rgb + ',0.7)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      /* Dot markers at key intervals for visual anchoring */
      [0, 7, 14, 21, 30].forEach(function(d) {
        var p = points[d];
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + rgb + ',0.5)';
        ctx.fill();
      });

      /* Today dot (larger, solid) */
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + rgb + ',0.9)';
      ctx.fill();

      /* Today label */
      ctx.fillStyle = textCol;
      ctx.font = '700 8px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(Math.round(points[0].retention * 100) + '% today', points[0].x + 8, points[0].y - 2);

      /* Desired retention threshold line */
      var dr = settings.desiredRetention || 0.90;
      var drY = pad.top + gh - (dr * gh);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(' + rgb + ',0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, drY);
      ctx.lineTo(w - pad.right, drY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = textSec;
      ctx.font = '600 7px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('target ' + Math.round(dr * 100) + '%', w - pad.right, drY - 2);

      /* Cache base graph pixels for O(1) hover restore (avoids full redraw on mousemove) */
      var cacheCanvas = el(canvasId);
      if (cacheCanvas && retentionGraphData[canvasId]) {
        retentionGraphData[canvasId].baseImage = cacheCanvas.getContext('2d').getImageData(0, 0, cacheCanvas.width, cacheCanvas.height);
      }
    }

    function handleRetentionHover(canvasId, clientX, clientY) {
      var canvas = el(canvasId);
      var data = retentionGraphData[canvasId];
      if (!canvas || !data || !data.points || !data.points.length) { hideCanvasTooltip(); return; }

      var cRect = canvas.getBoundingClientRect();
      var mx = clientX - cRect.left;

      /* Find nearest point by x-distance in screen space */
      var scaleX = cRect.width / data.w;
      var nearest = -1;
      var nearestDist = Infinity;
      data.points.forEach(function(p, i) {
        var px = p.x * scaleX;
        var dist = Math.abs(mx - px);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      });

      if (nearest < 0 || nearestDist > 22) {
        hideCanvasTooltip();
        /* Restore cached base graph (clears old highlight) — no full redraw */
        if (data.baseImage) {
          canvas.getContext('2d').putImageData(data.baseImage, 0, 0);
        }
        return;
      }

      var pt = data.points[nearest];
      showCanvasTooltip(canvasId, pt, data.label, data.itemCount, clientX, clientY);

      /* Restore cached base pixels then overlay highlight dot — O(1) blit, no redraw */
      if (data.baseImage) {
        canvas.getContext('2d').putImageData(data.baseImage, 0, 0);
        drawRetentionHighlight(canvasId, nearest);
      }
    }

    function drawSparkline(canvasId) {
      var parent = el(canvasId);
      if (!parent) return;
      var pw = parent.parentElement ? parent.parentElement.clientWidth - 24 : 200;
      pw = Math.max(140, Math.min(pw, 500));
      var ph = 80;

      var r = getCanvasCtx(canvasId, pw, ph);
      if (!r) return;
      var ctx = r.ctx, w = r.w, h = r.h;
      var rgb = getAccentRGB();
      var textSec = getTextSecondary();
      var textCol = getTextColor();

      /* Build 30-day history from calibration.history */
      var history = (state.calibration && state.calibration.history) || [];
      var days = {};
      var now = new Date();
      for (var d = 29; d >= 0; d--) {
        var dt = new Date(now);
        dt.setDate(dt.getDate() - d);
        var key = dt.toISOString().slice(0, 10);
        days[key] = { count: 0, ratingSum: 0, ratingN: 0 };
      }
      history.forEach(function(entry) {
        if (!entry.ts) return;
        var dk = entry.ts.slice(0, 10);
        if (days[dk]) {
          days[dk].count++;
          days[dk].ratingSum += (entry.rating || 0);
          days[dk].ratingN++;
        }
      });

      var dayKeys = Object.keys(days).sort();
      var maxCount = 1;
      dayKeys.forEach(function(k) { if (days[k].count > maxCount) maxCount = days[k].count; });

      var pad = { left: 4, right: 4, top: 8, bottom: 18 };
      var gw = w - pad.left - pad.right;
      var gh = h - pad.top - pad.bottom;
      var gap = 2;
      var barW = Math.max(3, Math.floor((gw - gap * 29) / 30));

      /* Empty state */
      var totalReviews = 0;
      dayKeys.forEach(function(k) { totalReviews += days[k].count; });
      if (totalReviews === 0) {
        ctx.fillStyle = textSec;
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Complete a session to see activity', w / 2, h / 2);
        return;
      }

      /* Subtle horizontal grid lines */
      ctx.strokeStyle = 'rgba(' + rgb + ',0.06)';
      ctx.lineWidth = 0.5;
      [0.25, 0.5, 0.75].forEach(function(v) {
        var y = pad.top + gh - (v * gh);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      });

      /* Bars */
      dayKeys.forEach(function(k, i) {
        var d = days[k];
        var x = pad.left + i * (barW + gap);
        var barH = Math.max(d.count > 0 ? 3 : 0, (d.count / maxCount) * gh);
        var y = pad.top + gh - barH;

        /* Colour by avg rating */
        var col = 'rgba(' + rgb + ',0.15)';
        if (d.count > 0) {
          var avg = d.ratingSum / d.ratingN;
          if (avg >= 3) col = 'rgba(34,197,94,0.7)';
          else if (avg >= 2) col = 'rgba(245,158,11,0.7)';
          else col = 'rgba(239,68,68,0.7)';
        }

        if (d.count > 0) {
          ctx.fillStyle = col;
          var radius = Math.min(barW / 2, 3);
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barW, barH);
          }

          /* Today: glow effect */
          if (i === dayKeys.length - 1) {
            ctx.shadowColor = col;
            ctx.shadowBlur = 8;
            ctx.fillStyle = col;
            if (typeof ctx.roundRect === 'function') {
              ctx.beginPath();
              ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
              ctx.fill();
            } else {
              ctx.fillRect(x, y, barW, barH);
            }
            ctx.shadowBlur = 0;
          }
        } else {
          /* Empty day: subtle dot at baseline */
          ctx.fillStyle = 'rgba(' + rgb + ',0.10)';
          ctx.beginPath();
          ctx.arc(x + barW / 2, pad.top + gh - 1, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      /* X-axis labels */
      ctx.fillStyle = textSec;
      ctx.font = '600 7px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var labelIndices = [0, 7, 14, 21, 29];
      labelIndices.forEach(function(i) {
        if (!dayKeys[i]) return;
        var x = pad.left + i * (barW + gap) + barW / 2;
        var label;
        if (i === 29) {
          label = 'Today';
        } else {
          var parts = dayKeys[i].split('-');
          label = parts[1] + '-' + parts[2];
        }
        ctx.fillText(label, x, h - pad.bottom + 4);
      });

      /* Legend: review count for today */
      var todayCount = days[dayKeys[29]] ? days[dayKeys[29]].count : 0;
      if (todayCount > 0) {
        var tx = pad.left + 29 * (barW + gap) + barW / 2;
        var ty = pad.top + gh - Math.max(3, (todayCount / maxCount) * gh) - 6;
        ctx.fillStyle = textCol;
        ctx.font = '800 8px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(todayCount), tx, ty);
      }
    }

    function drawTierRing(canvasId) {
      var r = getCanvasCtx(canvasId, 64, 64);
      if (!r) return;
      var ctx = r.ctx;
      var cx = 32, cy = 32, radius = 22, thick = 7;
      var rgb = getAccentRGB();
      var textCol = getTextColor();

      /* Count recent reviews by tier (last 50) */
      var history = (state.calibration && state.calibration.history) || [];
      var recent = history.slice(-50);
      var tierCounts = { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 };
      var total = 0;
      recent.forEach(function(h) {
        if (h.tier && tierCounts[h.tier] != null) {
          tierCounts[h.tier]++;
          total++;
        }
      });

      if (total === 0) {
        /* Empty ring */
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(' + rgb + ',0.08)';
        ctx.lineWidth = thick;
        ctx.stroke();
        ctx.fillStyle = getTextSecondary();
        ctx.font = '700 8px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('—', cx, cy);
        return;
      }

      var tierOrder = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
      var tierColors = {
        quickfire: '#3b82f6',
        explain: '#8b5cf6',
        apply: '#f59e0b',
        distinguish: '#ec4899',
        mock: '#ef4444',
        worked: '#10b981'
      };

      var angle = -Math.PI / 2;
      tierOrder.forEach(function(t) {
        var pct = tierCounts[t] / total;
        if (pct <= 0) return;
        var endAngle = angle + pct * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, angle, endAngle);
        ctx.strokeStyle = tierColors[t];
        ctx.lineWidth = thick;
        ctx.lineCap = 'butt';
        ctx.stroke();
        angle = endAngle;
      });

      /* Centre: total count */
      ctx.fillStyle = textCol;
      ctx.font = '800 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(total), cx, cy - 2);
      ctx.fillStyle = getTextSecondary();
      ctx.font = '600 6px Inter, system-ui, sans-serif';
      ctx.fillText('reviews', cx, cy + 8);
    }

    function renderRetentionFilterChips() {
      var container = el('retFilterChips');
      if (!container) return;

      /* Collect courses that have reviewed (non-archived) items */
      var coursesWithData = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || !it.fsrs || !it.fsrs.lastReview) continue;
        if (it.course) coursesWithData[it.course] = true;
      }
      var courseNames = Object.keys(coursesWithData).sort();

      /* Don't show chips if 0 or 1 course */
      if (courseNames.length <= 1) {
        container.innerHTML = '';
        retentionFilter = 'All';
        return;
      }

      var h = '<span class="ret-chip ' + (retentionFilter === 'All' ? 'active' : '') + '" data-ret-filter="All">Average</span>';
      courseNames.forEach(function(name) {
        var col = getCourseColor(name);
        var isActive = retentionFilter === name;
        h += '<span class="ret-chip ' + (isActive ? 'active' : '') + '" data-ret-filter="' + esc(name) + '" style="' +
          (col ? 'border-color:' + col + ';' + (isActive ? 'background:' + col + '22;color:' + col : '') : '') +
          '">' + esc(name) + '</span>';
      });
      container.innerHTML = h;

      container.querySelectorAll('.ret-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
          retentionFilter = this.getAttribute('data-ret-filter') || 'All';
          try { playPresetSelect(); } catch(e) {}
          renderRetentionFilterChips();
          renderRetentionGraph();
        });
      });

      if (window.gsap) {
        gsap.fromTo(container.querySelectorAll('.ret-chip'),
          { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.03, ease: 'power2.out' });
      }
    }

    function renderRetentionGraph() {
      var items = {};
      var filterCourse = retentionFilter || 'All';
      var label = filterCourse === 'All' ? 'All courses' : filterCourse;
      var hasData = false;
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        if (filterCourse !== 'All' && it.course !== filterCourse) continue;
        if (it.fsrs && it.fsrs.reps > 0) hasData = true;
        items[id] = it;
      }
      if (!hasData) {
        var container = document.getElementById('retentionWrap') || document.querySelector('.retention-wrap');
        if (container) {
          var titleEl = container.querySelector('.ac-title');
          var chipsEl = container.querySelector('.ret-filter-chips');
          container.innerHTML = '';
          if (titleEl) container.appendChild(titleEl);
          if (chipsEl) container.appendChild(chipsEl);
          var empty = document.createElement('div');
          empty.className = 'chart-empty';
          empty.innerHTML =
            '<div class="chart-empty-icon">📈</div>' +
            '<div class="chart-empty-title">No retention data yet</div>' +
            '<div class="chart-empty-desc">Complete your first study session to see your predicted retention curve.</div>';
          container.appendChild(empty);
          if (window.gsap) {
            gsap.fromTo(empty,
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
            );
          }
        }
        return;
      }
      var retentionWrap = document.getElementById('retentionWrap') || document.querySelector('.retention-wrap');
      if (retentionWrap && !document.getElementById('retentionCanvas')) {
        var canvas = document.createElement('canvas');
        canvas.id = 'retentionCanvas';
        canvas.height = 200;
        retentionWrap.appendChild(canvas);
      }
      drawRetentionCurve('retentionCanvas', items, label);
    }

    function renderTutorAnalyticsDashboard() {
      var avgEl = el('tutorStatAvgTurns');
      var reconEl = el('tutorStatRecon');
      var modelEl = el('tutorStatModel');
      if (!avgEl || !reconEl || !modelEl) return;
      if (typeof SyncEngine === 'undefined' || !SyncEngine.get) {
        avgEl.textContent = '—';
        reconEl.textContent = '—';
        modelEl.textContent = '—';
        return;
      }
      var a = SyncEngine.get(NS, 'tutorAnalytics');
      if (!a || !a.totalSessions) {
        avgEl.textContent = '—';
        reconEl.textContent = '—';
        modelEl.textContent = '—';
        return;
      }
      var avgTurns = a.totalTutorCalls / Math.max(1, a.totalSessions);
      avgEl.textContent = String(Math.round(avgTurns * 10) / 10);
      var reconPct = Math.round((a.totalReconstructionSuccesses / Math.max(1, a.totalReconstructions)) * 100);
      reconEl.textContent = a.totalReconstructions > 0 ? reconPct + '%' : 'N/A';
      var reconSubEl = reconEl.closest('.stat') ? reconEl.closest('.stat').querySelector('.s') : null;
      if (reconSubEl) reconSubEl.textContent = a.totalReconstructions > 0 ? 'success after re-study' : 'needs generative reviews';
      var f = a.totalFlashCalls || 0;
      var p = a.totalProCalls || 0;
      var tot = f + p;
      if (tot <= 0) modelEl.textContent = '—';
      else {
        var fp = Math.round((f / tot) * 100);
        var pp = 100 - fp;
        modelEl.innerHTML = 'Flash ' + fp + '% / Pro ' + pp + '%';
      }
      var modelSubEl = modelEl.closest('.stat') ? modelEl.closest('.stat').querySelector('.s') : null;
      if (modelSubEl) {
        if (f > 0 && p === 0) modelSubEl.textContent = 'Pro activates on harder cards';
        else modelSubEl.textContent = 'Flash / Pro calls';
      }
    }

    function requestSessionAiSummary(sessionSnap, reviewedCount) {
      var wrap = el('sessionAiSummaryWrap');
      var body = el('sessionAiSummaryBody');
      if (!wrap || !body) return;
      if ((Number(reviewedCount) || 0) <= 3) {
        wrap.style.display = 'none';
        return;
      }
      if (!reviewedCount || reviewedCount <= 0) {
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = '';
      body.innerHTML = '<div class="syllabus-status" id="sessionAiSummaryLoading"><span class="af-spinner"></span> Generating summary…</div>';

      var log = sessionSnap.sessionRatingsLog || [];
      var dist = { '1': 0, '2': 0, '3': 0, '4': 0 };
      var courseBreakdown = {};
      log.forEach(function(r) {
        var k = String(r.rating);
        if (dist[k] != null) dist[k]++;
        var c = r.course || 'General';
        courseBreakdown[c] = (courseBreakdown[c] || 0) + 1;
      });
      var weakCards = log.filter(function(r) { return r.rating === 1; }).map(function(r) {
        return { prompt: (r.prompt || '').substring(0, 100), topic: r.topic || '', rating: 1 };
      });
      var strongCards = log.filter(function(r) { return r.rating === 4; }).map(function(r) {
        return { prompt: (r.prompt || '').substring(0, 100), topic: r.topic || '', rating: 4 };
      });
      var ts = sessionSnap.tutorStats || {};
      var avgRating = sessionSnap.ratingN ? sessionSnap.ratingSum / sessionSnap.ratingN : 0;
      var payload = {
        userName: getTutorUserName(),
        sessionStats: {
          totalCards: sessionSnap.ratingN || 0,
          avgRating: avgRating,
          ratingDistribution: dist,
          courseBreakdown: courseBreakdown,
          dontKnows: ts.dontKnows || 0,
          skips: ts.skipsToRating || 0,
          tutorModes: sessionSnap.tutorModeCounts || defaultTutorModeCounts()
        },
        weakCards: weakCards.slice(0, 12),
        strongCards: strongCards.slice(0, 12),
        calibrationBefore: sessionSnap.calBefore,
        calibrationAfter: calibrationPct(state.calibration)
      };

      fetch(SUMMARY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetKey()
        },
        body: JSON.stringify(payload)
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (!data || data.error || !data.summary) {
            wrap.style.display = 'none';
            return;
          }
          body.textContent = data.summary;
        })
        .catch(function() {
          wrap.style.display = 'none';
        });
    }

    function renderCourseDetailReadiness(courseName) {
      if (!courseName) return;
      var readinessHost = el('cdReadinessHost');
      if (!readinessHost) {
        readinessHost = document.createElement('div');
        readinessHost.id = 'cdReadinessHost';
        readinessHost.style.cssText = 'margin:16px 0;';
        var cdCountdownEl = el('cdCountdown');
        var insertAfter = cdCountdownEl || el('cdBadges');
        if (insertAfter && insertAfter.parentNode) {
          insertAfter.parentNode.insertBefore(readinessHost, insertAfter.nextSibling);
        } else {
          var view = el('viewCourseDetail');
          if (view) view.appendChild(readinessHost);
        }
      }
      var readinessData = computeExamReadiness(courseName);
      if (readinessData && readinessData.totalCards >= 5) {
        var pct = readinessData.readinessPct;
        var gaugeColor = pct >= 75 ? 'var(--rate-good)' : pct >= 50 ? 'var(--rate-hard)' : 'var(--rate-again)';
        var gaugeLabel = pct >= 75 ? 'Strong' : pct >= 50 ? 'Developing' : 'Needs Work';
        var weakTopics = readinessData.topicBreakdown.slice(0, 3);
        var weakHTML = weakTopics.map(function(t) {
          return '<span style="display:inline-block;font-size:0.75em;padding:1px 6px;border-radius:6px;' +
            'background:rgba(239,68,68,0.12);color:var(--rate-again);margin:2px 3px;">' +
            esc(t.topic) + ' ' + t.readiness + '%</span>';
        }).join('');
        readinessHost.innerHTML =
          '<div style="background:var(--card-bg);backdrop-filter:blur(20px) saturate(1.4);' +
          'border:1px solid var(--card-border,rgba(139,92,246,0.12));border-radius:16px;padding:16px 20px;">' +
          '<div style="display:flex;align-items:center;gap:16px;">' +
          '<div style="position:relative;width:64px;height:64px;">' +
          '<svg viewBox="0 0 36 36" style="width:64px;height:64px;transform:rotate(-90deg);">' +
          '<circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--card-border,rgba(139,92,246,0.12))" stroke-width="3"/>' +
          '<circle cx="18" cy="18" r="15.9" fill="none" stroke="' + gaugeColor + '" ' +
          'stroke-width="3" stroke-dasharray="' + pct + ' ' + (100 - pct) + '" ' +
          'stroke-linecap="round" style="transition:stroke-dasharray 0.6s ease;"/>' +
          '</svg>' +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
          'font-size:1.1em;font-weight:700;color:' + gaugeColor + ';">' + pct + '%</div>' +
          '</div>' +
          '<div style="flex:1;">' +
          '<div style="font-size:0.85em;font-weight:600;color:var(--text-primary);">Exam Readiness</div>' +
          '<div style="font-size:0.75em;color:var(--text-secondary);margin-top:2px;">' +
          gaugeLabel + ' · ' + readinessData.totalCards + ' cards across ' +
          readinessData.topicCount + ' topics</div>' +
          (weakHTML ? '<div style="margin-top:6px;">Weakest: ' + weakHTML + '</div>' : '') +
          '</div>' +
          '</div>' +
          '</div>';
        if (window.gsap) {
          gsap.fromTo(readinessHost.firstChild,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
          );
        }
      } else {
        readinessHost.innerHTML = '';
      }
    }

    (function installCourseDetailReadinessHook() {
      if (typeof openCourseDetail !== 'function') {
        setTimeout(installCourseDetailReadinessHook, 100);
        return;
      }
      if (openCourseDetail._readinessHooked) return;
      var __baseOpenCourseDetail = openCourseDetail;
      openCourseDetail = function(courseName) {
        __baseOpenCourseDetail(courseName);
        renderCourseDetailReadiness(courseName);
      };
      openCourseDetail._readinessHooked = true;
    })();
