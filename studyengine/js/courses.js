/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function courseKey(name){
      return String(name || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function getCourseColor(courseName) {
      var c = getCourse(courseName);
      if (c && c.color) return c.color;
      return '#8b5cf6'; /* default purple */
    }

    function getEffectiveRetention(courseName) {
      /* If exam is imminent, slightly lower retention target to increase review volume */
      var cram = getCramState(courseName);
      if (cram.active && cram.intensity === 'critical') return Math.min(settings.desiredRetention || 0.90, 0.85);
      if (cram.active && cram.intensity === 'high') return Math.min(settings.desiredRetention || 0.90, 0.87);
      return settings.desiredRetention || 0.90;
    }

    function getEffectiveProfile(courseName) {
      var examType = getCourseExamType(courseName);
      var base = deepClone(TIER_PROFILES[examType] || TIER_PROFILES.mixed);
      /* Apply cram tier modifier when exam is imminent */
      var cram = getCramState(courseName);
      if (cram.active && CRAM_TIER_MOD[cram.intensity]) {
        var mod = CRAM_TIER_MOD[cram.intensity];
        for (var t in base) {
          if (mod[t]) base[t] = base[t] * mod[t];
        }
        /* Renormalize to sum to 1 */
        var total = 0;
        for (var t2 in base) total += base[t2];
        if (total > 0) {
          for (var t3 in base) base[t3] = base[t3] / total;
        }
      }
      return base;
    }

    function getEffectiveBloomBonus(courseName) {
      /* Flat — no objective-based scaling. Bloom bonuses always apply at their natural rate. */
      var result = {};
      for (var t in BLOOM_STABILITY_BONUS) {
        result[t] = BLOOM_STABILITY_BONUS[t];
      }
      return result;
    }

    function getCramState(courseName) {
      var c = getCourse(courseName);
      if (!c || !c.examDate) return { active: false };
      /* Compare calendar dates at local midnight for accurate day count */
      var examMidnight = new Date(c.examDate + 'T00:00:00');
      var todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
      var daysUntil = Math.max(0, Math.round((examMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));
      if (daysUntil > 14) return { active: false, daysUntil: daysUntil };

      var intensity = 'normal';
      var sessionMod = 1.0;
      var intervalMod = 1.0;

      if (daysUntil <= 2) {
        intensity = 'critical';
        sessionMod = 2.0;
        intervalMod = 0.3;
      } else if (daysUntil <= 5) {
        intensity = 'high';
        sessionMod = 1.5;
        intervalMod = 0.5;
      } else if (daysUntil <= 7) {
        intensity = 'moderate';
        sessionMod = 1.25;
        intervalMod = 0.7;
      } else {
        intensity = 'low';
        sessionMod = 1.1;
        intervalMod = 0.85;
      }

      return {
        active: true,
        daysUntil: daysUntil,
        intensity: intensity,
        sessionMod: sessionMod,
        intervalMod: intervalMod
      };
    }

    function detectSupportedTiers(item) {
      if (!item || !item.prompt || !item.modelAnswer) return [];
      var tiers = ['quickfire', 'explain'];
      if (item.task || item.scenario) tiers.push('apply');
      if (item.conceptA && item.conceptB) tiers.push('distinguish');
      /* Mock: any item can be presented under time pressure */
      tiers.push('mock');
      if ((item.modelAnswer || '').split('\n\n').filter(function(s) { return String(s).trim(); }).length >= 2) tiers.push('worked');
      return tiers;
    }

    function normalizeCoursePhase6(c) {
      if (!c) return c;
      if (c.examWeight === undefined) c.examWeight = null;
      if (c.syllabusContext === undefined) c.syllabusContext = null;
      if (c._lectureCount === undefined) c._lectureCount = 0;
      if (!Array.isArray(c.modules)) c.modules = [];
      if (c.professorValues === undefined) c.professorValues = null;
      if (c.allowedMaterials === undefined) c.allowedMaterials = null;
      if (c.rawSyllabusText === undefined) c.rawSyllabusText = null;
      if (c.examFormat === undefined) c.examFormat = null;
      if (!Array.isArray(c.syllabusKeyTopics)) c.syllabusKeyTopics = [];
      if (c.prepared === undefined) c.prepared = false;
      return c;
    }

    function ensureCourseModules(courseName) {
      var c = state.courses && state.courses[courseName];
      if (!c) return;
      if (!Array.isArray(c.modules)) c.modules = [];
    }

    function generateModuleId() {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      var s = 'mod_';
      for (var i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }

    function addModuleToCourse(courseName, moduleObj) {
      ensureCourseModules(courseName);
      var c = state.courses && state.courses[courseName];
      if (!c) return null;
      if (!moduleObj) moduleObj = {};
      if (!moduleObj.id) moduleObj.id = generateModuleId();
      if (moduleObj.order == null) moduleObj.order = c.modules.length;
      if (!Array.isArray(moduleObj.topics)) moduleObj.topics = [];
      c.modules.push(moduleObj);
      saveCourse(c);
      return moduleObj;
    }

    function removeModuleFromCourse(courseName, moduleId) {
      ensureCourseModules(courseName);
      var c = state.courses && state.courses[courseName];
      if (!c) return;
      c.modules = c.modules.filter(function(m) { return m && m.id !== moduleId; });
      saveCourse(c);
    }

    function renameModule(courseName, moduleId, newName) {
      ensureCourseModules(courseName);
      var c = state.courses && state.courses[courseName];
      if (!c) return;
      var mod = c.modules.find(function(m) { return m && m.id === moduleId; });
      if (mod) { mod.name = newName; saveCourse(c); }
    }

    function getModuleForTopic(courseName, topic) {
      var c = state.courses && state.courses[courseName];
      if (!c || !c.modules) return null;
      for (var i = 0; i < c.modules.length; i++) {
        if (c.modules[i] && c.modules[i].topics && c.modules[i].topics.indexOf(topic) >= 0) return c.modules[i];
      }
      return null;
    }

    function getModuleById(courseName, moduleId) {
      var c = state.courses && state.courses[courseName];
      if (!c || !c.modules) return null;
      return c.modules.find(function(m) { return m && m.id === moduleId; }) || null;
    }

    function getCardsForModule(courseName, moduleId) {
      var mod = getModuleById(courseName, moduleId);
      if (!mod || !mod.topics) return [];
      var cards = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || it.course !== courseName) continue;
        if (mod.topics.indexOf(it.topic) >= 0) cards.push(it);
      }
      return cards;
    }

    function getCardsForTopic(courseName, topic) {
      var cards = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (courseName && it.course !== courseName) continue;
        if ((it.topic || 'General') === topic) cards.push(it);
      }
      return cards;
    }

    function getCardsForCourse(courseName) {
      var cards = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || it.course !== courseName) continue;
        cards.push(it);
      }
      return cards;
    }

    function isDueNow(item) {
      if (!item || !item.fsrs || !item.fsrs.due) return true;
      return new Date(item.fsrs.due) <= new Date();
    }

    function getCourseStats(courseName) {
      var cards = getCardsForCourse(courseName);
      var total = cards.length;
      var due = cards.filter(isDueNow).length;
      var reviewed = cards.filter(function(c) { return c.fsrs && c.fsrs.reps > 0; }).length;
      var avgStability = 0;
      var stableCount = 0;
      var retentionSum = 0;
      var retentionCount = 0;
      var now = Date.now();
      cards.forEach(function(c) {
        if (c.fsrs && c.fsrs.stability > 0) { avgStability += c.fsrs.stability; stableCount++; }
        if (c.fsrs && c.fsrs.lastReview) {
          retentionSum += retrievability(c.fsrs, now);
          retentionCount++;
        }
      });
      if (stableCount > 0) avgStability = avgStability / stableCount;
      var tierDist = {};
      cards.forEach(function(c) { var t = c.tier || 'quickfire'; tierDist[t] = (tierDist[t] || 0) + 1; });
      return {
        total: total,
        due: due,
        reviewed: reviewed,
        avgStability: Math.round(avgStability),
        avgRetention: retentionCount ? Math.round((retentionSum / retentionCount) * 100) : null,
        tierDist: tierDist
      };
    }

    function getModuleStats(courseName, moduleId) {
      var cards = getCardsForModule(courseName, moduleId);
      var total = cards.length;
      var due = cards.filter(isDueNow).length;
      var reviewed = cards.filter(function(c) { return c.fsrs && c.fsrs.reps > 0; }).length;
      return { total: total, due: due, reviewed: reviewed };
    }

    function clampCourseStringFields(c) {
      if (!c) return;
      // Used both as syllabus summary and (now) lecture digest, so allow a bit more room.
      if (c.syllabusContext && String(c.syllabusContext).length > 4000) {
        c.syllabusContext = String(c.syllabusContext).slice(0, 4000);
      }
      if (c.professorValues && String(c.professorValues).length > 500) {
        c.professorValues = String(c.professorValues).slice(0, 500);
      }
      if (c.rawSyllabusText && String(c.rawSyllabusText).length > 15000) {
        c.rawSyllabusText = String(c.rawSyllabusText).slice(0, 15000);
      }
      if (c.examFormat && String(c.examFormat).length > 300) {
        c.examFormat = String(c.examFormat).slice(0, 300);
      }
    }

    function migrateCoursesPhase6() {
      var changed = false;
      for (var k in state.courses) {
        if (!state.courses.hasOwnProperty(k)) continue;
        var c0 = state.courses[k];
        var snap = JSON.stringify(c0);
        normalizeCoursePhase6(c0);
        // Ensure modules array exists
        if (!Array.isArray(c0.modules)) { c0.modules = []; }
        if (JSON.stringify(c0) !== snap) changed = true;
      }
      if (changed && typeof SyncEngine !== 'undefined' && SyncEngine.set) {
        SyncEngine.set(NS, 'courses', state.courses || {});
      }
    }

    function getCourse(courseName) {
      if (!courseName) return null;
      return state.courses[courseName] || null;
    }

    function getCourseExamType(courseName) {
      var c = getCourse(courseName);
      return (c && c.examType) ? c.examType : 'mixed';
    }

    function getCourseExamType(course) {
      if (!course) return '';
      if (settings && settings.courseExamTypes && settings.courseExamTypes[course]) {
        return String(settings.courseExamTypes[course]).toLowerCase();
      }
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var item = state.items[id];
        if (item && item.course === course && item.examType) return String(item.examType).toLowerCase();
      }
      return '';
    }

    function isCourseManual(courseName) {
      var c = getCourse(courseName);
      return c ? !!c.manualMode : false;
    }

    function saveCourse(courseObj) {
      if (!courseObj || !courseObj.name) return;
      courseObj.id = courseObj.id || courseObj.name;
      normalizeCoursePhase6(courseObj);
      clampCourseStringFields(courseObj);
      state.courses[courseObj.name] = courseObj;
      saveState();
    }

    function deleteCourse(courseName) {
      if (state.courses[courseName]) {
        delete state.courses[courseName];
      }
    }

    function listCourses(includeArchived) {
      var out = [];
      for (var k in state.courses) {
        if (!state.courses.hasOwnProperty(k)) continue;
        var course = state.courses[k];
        if (!course) continue;
        if (!includeArchived && course.archived) continue;
        out.push(course);
      }
      out.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
      return out;
    }

    function getTopicsForCourse(courseName) {
      if (!courseName) return [];
      var topics = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.course !== courseName) continue;
        var t = (it.topic || '').trim();
        if (t) topics[t] = (topics[t] || 0) + 1;
      }
      /* Sort by usage count descending, then alphabetical */
      return Object.keys(topics).sort(function(a, b) {
        if (topics[b] !== topics[a]) return topics[b] - topics[a];
        return a.localeCompare(b);
      });
    }

    function renderTopicSuggestions(inputId, courseName, containerId) {
      var existing = getTopicsForCourse(courseName);
      var container = el(containerId);
      if (!container) return;
      if (!existing.length) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }
      var h = '';
      existing.forEach(function(t) {
        h += '<span class="chip topic-suggestion" data-topic-val="' + esc(t) + '" style="cursor:pointer;">' + esc(t) + '</span>';
      });
      container.innerHTML = h;
      container.style.display = 'flex';

      container.querySelectorAll('.topic-suggestion').forEach(function(chip) {
        chip.addEventListener('click', function() {
          var input = el(inputId);
          if (input) {
            input.value = this.getAttribute('data-topic-val');
            input.focus();
          }
          /* Highlight selected chip */
          container.querySelectorAll('.topic-suggestion').forEach(function(c) { c.classList.remove('active'); });
          this.classList.add('active');
          try { playClick(); } catch(e) {}
          if (window.gsap) gsap.fromTo(this, { scale: 0.94 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
        });
      });

      if (window.gsap) {
        gsap.fromTo(container.querySelectorAll('.chip'), { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.03, ease: 'power2.out' });
      }
    }
