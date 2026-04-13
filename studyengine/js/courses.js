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
      if (!c) return { active: false };

      /* Find the nearest upcoming assessment date */
      var examDate = null;
      var assessName = null;
      if (c.assessments && c.assessments.length > 0) {
        var active = getActiveAssessment(courseName);
        if (active && active.date) {
          examDate = active.date;
          assessName = active.name || 'Assessment';
        }
      }
      /* Fallback to legacy examDate */
      if (!examDate && c.examDate) {
        examDate = c.examDate;
        assessName = 'Exam';
      }
      if (!examDate) return { active: false };

      var examMidnight = new Date(examDate + 'T00:00:00');
      var todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      var daysUntil = Math.max(0, Math.round((examMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));
      if (daysUntil > 14) return { active: false, daysUntil: daysUntil, assessName: assessName };

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
        intervalMod: intervalMod,
        assessName: assessName
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
      migrateAssessments(c);
      return c;
    }


    function migrateAssessments(c) {
      if (!c) return c;
      if (!Array.isArray(c.assessments)) {
        c.assessments = [];
        /* Migrate legacy single exam into assessments array */
        if (c.examDate) {
          c.assessments.push({
            id: 'assess_' + generateModuleId().slice(4),
            name: 'Final Exam',
            type: c.examType || 'mixed',
            date: c.examDate,
            weight: c.examWeight || null,
            format: c.examFormat || null,
            allowedMaterials: c.allowedMaterials || null,
            questions: [],
            prioritySet: [],
            sacrificeSet: [],
            topicMapping: {},
            chooseN: null,
            outOfM: null,
            active: true
          });
        }
      }
      /* Ensure every assessment has all fields */
      c.assessments.forEach(function(a) {
        if (!a.id) a.id = 'assess_' + generateModuleId().slice(4);
        if (a.name === undefined) a.name = 'Assessment';
        if (a.type === undefined) a.type = 'mixed';
        if (a.date === undefined) a.date = null;
        if (a.weight === undefined) a.weight = null;
        if (a.format === undefined) a.format = null;
        if (a.allowedMaterials === undefined) a.allowedMaterials = null;
        if (!Array.isArray(a.questions)) a.questions = [];
        if (!Array.isArray(a.prioritySet)) a.prioritySet = [];
        if (!Array.isArray(a.sacrificeSet)) a.sacrificeSet = [];
        if (!a.topicMapping || typeof a.topicMapping !== 'object') a.topicMapping = {};
        if (a.chooseN === undefined) a.chooseN = null;
        if (a.outOfM === undefined) a.outOfM = null;
        if (a.active === undefined) a.active = true;
      });
      return c;
    }

    function getActiveAssessment(courseName) {
      var c = getCourse(courseName);
      if (!c || !c.assessments) return null;
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      /* Find nearest future active assessment */
      var best = null;
      var bestDays = Infinity;
      c.assessments.forEach(function(a) {
        if (!a.active || !a.date) return;
        var aMidnight = new Date(a.date + 'T00:00:00');
        var days = Math.round((aMidnight.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (days >= 0 && days < bestDays) {
          bestDays = days;
          best = a;
        }
      });
      return best;
    }

    function getAssessmentById(courseName, assessId) {
      var c = getCourse(courseName);
      if (!c || !c.assessments) return null;
      for (var i = 0; i < c.assessments.length; i++) {
        if (c.assessments[i].id === assessId) return c.assessments[i];
      }
      return null;
    }

    function addAssessment(courseName, assessObj) {
      var c = getCourse(courseName);
      if (!c) return null;
      if (!Array.isArray(c.assessments)) c.assessments = [];
      if (!assessObj.id) assessObj.id = 'assess_' + generateModuleId().slice(4);
      c.assessments.push(assessObj);
      migrateAssessments(c);
      saveCourse(c);
      return assessObj;
    }

    function updateAssessment(courseName, assessId, updates) {
      var c = getCourse(courseName);
      if (!c || !c.assessments) return;
      var a = c.assessments.find(function(x) { return x.id === assessId; });
      if (!a) return;
      for (var k in updates) {
        if (updates.hasOwnProperty(k)) a[k] = updates[k];
      }
      saveCourse(c);
    }

    function deleteAssessment(courseName, assessId) {
      var c = getCourse(courseName);
      if (!c || !c.assessments) return;
      c.assessments = c.assessments.filter(function(a) { return a.id !== assessId; });
      saveCourse(c);
    }

    function getUpcomingAssessments(courseName) {
      var c = getCourse(courseName);
      if (!c || !c.assessments) return [];
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      return c.assessments.filter(function(a) {
        if (!a.date) return false;
        var d = new Date(a.date + 'T00:00:00');
        return d.getTime() >= now.getTime();
      }).sort(function(a, b) {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
    }

    function getPastAssessments(courseName) {
      var c = getCourse(courseName);
      if (!c || !c.assessments) return [];
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      return c.assessments.filter(function(a) {
        if (!a.date) return false;
        var d = new Date(a.date + 'T00:00:00');
        return d.getTime() < now.getTime();
      }).sort(function(a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    }

    function applyTriagePriorities(courseName, assessId) {
      var assess = getAssessmentById(courseName, assessId);
      if (!assess) return;
      var priorityTopics = {};
      var sacrificeTopics = {};

      /* Build topic sets from priority/sacrifice questions */
      (assess.prioritySet || []).forEach(function(qId) {
        var q = assess.questions.find(function(x) { return x.id === qId; });
        if (q && q.mappedTopics) {
          q.mappedTopics.forEach(function(t) { priorityTopics[t] = true; });
        }
      });
      (assess.sacrificeSet || []).forEach(function(qId) {
        var q = assess.questions.find(function(x) { return x.id === qId; });
        if (q && q.mappedTopics) {
          q.mappedTopics.forEach(function(t) {
            if (!priorityTopics[t]) sacrificeTopics[t] = true;
          });
        }
      });

      /* Bulk update card priorities */
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || it.course !== courseName) continue;
        var topic = it.topic || 'General';
        if (priorityTopics[topic]) {
          it.priority = 'critical';
        } else if (sacrificeTopics[topic]) {
          it.priority = 'low';
        } else {
          it.priority = 'medium';
        }
      }
      saveState();
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

    function getCardsForCourse(courseName, excludeArchivedSubDecks) {
      var cards = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || it.course !== courseName) continue;
        if (excludeArchivedSubDecks && isItemInArchivedSubDeck(it)) continue;
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

    function getSubDeck(courseName, subDeckName) {
      if (!state.subDecks[courseName]) return null;
      return state.subDecks[courseName].subDecks[subDeckName] || null;
    }

    function listSubDecks(courseName) {
      if (!state.subDecks[courseName]) return [];
      var subs = state.subDecks[courseName].subDecks;
      var out = [];
      for (var k in subs) {
        if (subs.hasOwnProperty(k)) out.push(subs[k]);
      }
      out.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
      return out;
    }

    function createSubDeck(courseName, name) {
      if (!state.subDecks[courseName]) {
        state.subDecks[courseName] = { subDecks: {} };
      }
      var existing = Object.keys(state.subDecks[courseName].subDecks);
      state.subDecks[courseName].subDecks[name] = {
        name: name,
        order: existing.length,
        archived: false,
        created: isoNow(),
        cardCount: 0
      };
      saveState();
      return state.subDecks[courseName].subDecks[name];
    }

    function renameSubDeck(courseName, oldName, newName) {
      var sd = state.subDecks[courseName];
      if (!sd || !sd.subDecks[oldName]) return;
      var meta = sd.subDecks[oldName];
      meta.name = newName;
      delete sd.subDecks[oldName];
      sd.subDecks[newName] = meta;
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (it && it.course === courseName && it.subDeck === oldName) {
          it.subDeck = newName;
        }
      }
      saveState();
    }

    function archiveSubDeck(courseName, subDeckName) {
      var sd = getSubDeck(courseName, subDeckName);
      if (sd) { sd.archived = true; saveState(); }
    }

    function unarchiveSubDeck(courseName, subDeckName) {
      var sd = getSubDeck(courseName, subDeckName);
      if (sd) { sd.archived = false; saveState(); }
    }

    function deleteSubDeck(courseName, subDeckName, deleteCards) {
      var sd = state.subDecks[courseName];
      if (!sd || !sd.subDecks[subDeckName]) return;
      if (deleteCards) {
        var toDelete = [];
        for (var id in state.items) {
          if (!state.items.hasOwnProperty(id)) continue;
          var it = state.items[id];
          if (it && it.course === courseName && it.subDeck === subDeckName) {
            toDelete.push(id);
          }
        }
        toDelete.forEach(function(did) { delete state.items[did]; });
      } else {
        for (var id2 in state.items) {
          if (!state.items.hasOwnProperty(id2)) continue;
          var it2 = state.items[id2];
          if (it2 && it2.course === courseName && it2.subDeck === subDeckName) {
            it2.subDeck = null;
          }
        }
      }
      delete sd.subDecks[subDeckName];
      reconcileStats();
      saveState();
    }

    function moveSubDeck(subDeckName, fromCourse, toCourse) {
      var fromSd = state.subDecks[fromCourse];
      if (!fromSd || !fromSd.subDecks[subDeckName]) return;
      if (!state.subDecks[toCourse]) {
        state.subDecks[toCourse] = { subDecks: {} };
      }
      state.subDecks[toCourse].subDecks[subDeckName] = fromSd.subDecks[subDeckName];
      delete fromSd.subDecks[subDeckName];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (it && it.course === fromCourse && it.subDeck === subDeckName) {
          it.course = toCourse;
        }
      }
      if (!state.courses[toCourse]) {
        saveCourse({
          name: toCourse,
          examType: 'mixed',
          examDate: null,
          manualMode: false,
          color: '#8b5cf6',
          created: isoNow()
        });
      }
      saveState();
    }

    function isSubDeckArchived(courseName, subDeckName) {
      var sd = getSubDeck(courseName, subDeckName);
      return sd ? sd.archived : false;
    }

    function isItemInArchivedSubDeck(item) {
      if (!item || !item.subDeck || !item.course) return false;
      return isSubDeckArchived(item.course, item.subDeck);
    }

    function recountSubDeck(courseName, subDeckName) {
      if (!subDeckName) return;
      var count = 0;
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (it && !it.archived && it.course === courseName && it.subDeck === subDeckName) count++;
      }
      var sd = getSubDeck(courseName, subDeckName);
      if (sd) sd.cardCount = count;
    }

    function getCardsForSubDeck(courseName, subDeckName) {
      var cards = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || it.course !== courseName) continue;
        if (it.subDeck === subDeckName) cards.push(it);
      }
      return cards;
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
