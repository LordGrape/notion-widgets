/* Study Engine — multi-modal retrieval practice engine (FSRS) */
    var isEmbedded = (window.self !== window.top);
    if (!isEmbedded) document.body.classList.add('standalone');

    /* ── SyncEngine Init ── */
    SyncEngine.init({
      worker: 'https://widget-sync.lordgrape-widgets.workers.dev',
      namespaces: ['dragon', 'clock', 'user', 'studyengine']
    });

    /* ── Background ── */
    initBackground('bgCanvas', {
      orbCount: isEmbedded ? 2 : 3,
      particleCount: Core.isLowEnd ? (Core.isDark ? 8 : 5) : (Core.isDark ? 18 : 12),
      orbRadius: [80, 140],
      hueRange: [250, 40],
      mouseTracking: true
    });

    var STUDYENGINE_WORKER_BASE = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine';
    var TUTOR_ENDPOINT = STUDYENGINE_WORKER_BASE + '/tutor';
    var MEMORY_ENDPOINT = STUDYENGINE_WORKER_BASE + '/memory';
    var PREPARE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/prepare';
    var SYLLABUS_ENDPOINT = STUDYENGINE_WORKER_BASE + '/syllabus';
    var LECTURE_CTX_ENDPOINT = STUDYENGINE_WORKER_BASE + '/lecture-context';
    var GRADE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/grade';
    var LEARN_PLAN_ENDPOINT = STUDYENGINE_WORKER_BASE + '/learn-plan';
    var LEARN_CHECK_ENDPOINT = STUDYENGINE_WORKER_BASE + '/learn-check';

    /* ── State ── */
    var NS = 'studyengine';
var DEFAULT_STATE = {
      items: {},
      courses: {},
      subDecks: {},
      learnProgress: {},
      learnSessions: [],
      calibration: { totalSelfRatings: 0, totalActualCorrect: 0, history: [] },
      stats: {
        totalReviews: 0,
        streakDays: 0,
        lastSessionDate: '',
        reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 }
      }
    };
    var DEFAULT_SETTINGS = {
      desiredRetention: 0.90,
      sessionLimit: 12,
      mockDefaultMins: 10,
      showApplyTimer: true,
      revealMode: 'auto',
      ttsVoice: 'en-US-Studio-O',
      breakReminders: true,
      breakIntervalMins: 25,
      performanceBreaks: true,
      feedbackMode: 'adaptive',
      gamificationMode: 'clean',
      modelOverride: 'adaptive',
      userName: '',
      tutorVoice: 'rigorous'
    };

    /* ── Tier Distribution Profiles (by exam type) ── */
    var TIER_PROFILES = {
      mc:           { quickfire: 0.48, explain: 0.18, apply: 0.10, distinguish: 0.15, mock: 0.05, worked: 0.04 },
      short_answer: { quickfire: 0.28, explain: 0.33, apply: 0.13, distinguish: 0.13, mock: 0.05, worked: 0.08 },
      essay:        { quickfire: 0.13, explain: 0.22, apply: 0.22, distinguish: 0.13, mock: 0.18, worked: 0.12 },
      mixed:        { quickfire: 0.23, explain: 0.23, apply: 0.18, distinguish: 0.13, mock: 0.13, worked: 0.10 }
    };

    /* ── Cram Tier Modifier (shifts tier distribution under time pressure) ── */
    /* Research basis: Dunlosky et al. (2013) — practice testing utility is highest
       when high-frequency and low-stakes. Under severe time constraints, maximise
       retrieval attempts per unit time by favouring fast-cycle tiers. */
    var CRAM_TIER_MOD = {
      critical: { quickfire: 1.6, explain: 1.3, apply: 0.7, distinguish: 0.8, mock: 0.2, worked: 0.4 },
      high:     { quickfire: 1.3, explain: 1.2, apply: 0.9, distinguish: 0.9, mock: 0.5, worked: 0.7 },
      moderate: { quickfire: 1.1, explain: 1.1, apply: 1.0, distinguish: 1.0, mock: 0.8, worked: 0.9 },
      low:      { quickfire: 1.0, explain: 1.0, apply: 1.0, distinguish: 1.0, mock: 1.0, worked: 1.0 }
    };

    /* ── Bloom Stability Bonus (higher tier = stronger memory trace on success) ── */
    /* ── Card Priority/Importance System ── */
    var PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'];
    var PRIORITY_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
    var PRIORITY_COLORS = { critical: '#ef4444', high: '#f59e0b', medium: '#8b5cf6', low: '#6b7280' };
    var PRIORITY_WEIGHT = { critical: 3.0, high: 2.0, medium: 1.0, low: 0.5 };
    var CRAM_PRIORITY_BOOST = { critical: 1.5, high: 1.2, medium: 1.0, low: 0.7 };
    function getPriority(item) {
      if (!item || !item.priority) return 'medium';
      return PRIORITY_LEVELS.indexOf(item.priority) >= 0 ? item.priority : 'medium';
    }
    function priorityWeight(item, cramActive) {
      var p = getPriority(item);
      var base = PRIORITY_WEIGHT[p] || 1.0;
      if (cramActive) base *= (CRAM_PRIORITY_BOOST[p] || 1.0);
      return base;
    }
    function priorityBadgeHTML(priority) {
      var p = priority || 'medium';
      var col = PRIORITY_COLORS[p] || PRIORITY_COLORS.medium;
      var label = PRIORITY_LABELS[p] || 'Medium';
      return '<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:7px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#fff;background:' + col + ';">' + label + '</span>';
    }

    var BLOOM_STABILITY_BONUS = {
      quickfire: 1.0,
      explain: 1.05,
      apply: 1.10,
      distinguish: 1.10,
      mock: 1.15,
      worked: 1.12
    };

    var EXAM_TYPE_LABELS = {
      mc: 'Multiple Choice',
      short_answer: 'Short Answer',
      essay: 'Essay',
      mixed: 'Mixed'
    };

    var COURSE_COLORS = [
      { name: 'Purple', value: '#8b5cf6' },
      { name: 'Blue', value: '#3b82f6' },
      { name: 'Cyan', value: '#06b6d4' },
      { name: 'Green', value: '#22c55e' },
      { name: 'Yellow', value: '#eab308' },
      { name: 'Orange', value: '#f97316' },
      { name: 'Red', value: '#ef4444' },
      { name: 'Pink', value: '#ec4899' },
      { name: 'Indigo', value: '#6366f1' },
      { name: 'Teal', value: '#14b8a6' }
    ];

/* ── Exam-Aware Scheduling (replaces old objective modes) ── */
    /* No separate "modes" — FSRS runs identically for all items.
       The only modifier is whether a course has an exam date.
       When an exam date is set and within 14 days, cram mode activates. */

/* ── Cram Mode Detection ── */
var state = null;
    var settings = null;
    var _bootStarted = false;

    function deepClone(obj){ return JSON.parse(JSON.stringify(obj || {})); }

    /* ── FSRS Parameter Optimization (ts-fsrs: clip/check — full training not in browser bundle) ── */
    function loadState() {
      var items = SyncEngine.get(NS, 'items') || null;
      var courses = SyncEngine.get(NS, 'courses') || null;
      var subDecks = SyncEngine.get(NS, 'subDecks') || null;
      var calibration = SyncEngine.get(NS, 'calibration') || null;
      var stats = SyncEngine.get(NS, 'stats') || null;
      state = deepClone(DEFAULT_STATE);
      if (items && typeof items === 'object') state.items = items;
      if (courses && typeof courses === 'object') state.courses = courses;
      if (subDecks && typeof subDecks === 'object') state.subDecks = subDecks;
      state.learnProgress = SyncEngine.get(NS, 'learnProgress') || {};
      state.learnSessions = SyncEngine.get(NS, 'learnSessions') || [];
      if (calibration && typeof calibration === 'object') state.calibration = calibration;
      if (stats && typeof stats === 'object') state.stats = stats;
      migrateItems();
      migrateCoursesPhase6();
      migrateSubDecks();
      var s = SyncEngine.get(NS, 'settings') || null;
      settings = deepClone(DEFAULT_SETTINGS);
      if (s && typeof s === 'object') {
        for (var k in s) if (s.hasOwnProperty(k)) settings[k] = s[k];
      }
      if (['clean', 'motivated', 'off'].indexOf(settings.gamificationMode) < 0) {
        settings.gamificationMode = 'clean';
      }
    }

    function saveState() {
      SyncEngine.set(NS, 'items', state.items || {});
      SyncEngine.set(NS, 'courses', state.courses || {});
      SyncEngine.set(NS, 'subDecks', state.subDecks || {});
      SyncEngine.set(NS, 'learnProgress', state.learnProgress || {});
      SyncEngine.set(NS, 'learnSessions', state.learnSessions || []);
      SyncEngine.set(NS, 'calibration', state.calibration || deepClone(DEFAULT_STATE.calibration));
      SyncEngine.set(NS, 'stats', state.stats || deepClone(DEFAULT_STATE.stats));
      SyncEngine.set(NS, 'settings', settings || deepClone(DEFAULT_SETTINGS));
    }

    /* ── Item Migration (v1 → v2: tier field becomes optional) ── */
    function migrateItems() {
      var changed = false;
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it) continue;
        /* Ensure variants field for Phase B AI content */
        if (!it.variants) { it.variants = {}; changed = true; }
        /* Auto-create course entry if item references a course not in state.courses */
        if (it.course && !state.courses[it.course]) {
          state.courses[it.course] = {
            id: it.course,
            name: it.course,
            examType: 'mixed',
            examDate: null,
            manualMode: false,
            color: '#8b5cf6',
            created: it.created || isoNow(),
            examWeight: null,
            syllabusContext: null,
            professorValues: null,
            allowedMaterials: null,
            rawSyllabusText: null,
            examFormat: null,
            syllabusKeyTopics: [],
            prepared: false
          };
          changed = true;
        }
        if (it.course && !state.subDecks[it.course]) {
          state.subDecks[it.course] = { subDecks: {} };
          changed = true;
        }
      }
      if (changed) saveState();
    }

    function migrateSubDecks() {
      state.subDecks = state.subDecks || {};
      var changed = false;
      for (var cName in state.courses) {
        if (!state.courses.hasOwnProperty(cName)) continue;
        if (!state.subDecks[cName]) {
          state.subDecks[cName] = { subDecks: {} };
          changed = true;
        }
      }
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it) continue;
        if (it.subDeck === undefined) {
          it.subDeck = null;
          changed = true;
        }
      }
      if (changed) saveState();
    }

    /* ── Supported Tiers Detection ── */
    function getPromotionCandidates(courseName) {
      var candidates = [];
      var TIER_ORDER = ['quickfire', 'explain', 'apply', 'distinguish', 'mock'];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || !it.fsrs) continue;
        if (courseName && courseName !== 'All' && it.course !== courseName) continue;
        var tier = it.tier || 'quickfire';
        var tierIdx = TIER_ORDER.indexOf(tier);
        if (tierIdx >= 3) continue;
        if ((it.fsrs.stability || 0) > 30 && (it.fsrs.lapses || 0) === 0 && (it.fsrs.reps || 0) >= 4) {
          var supported = detectSupportedTiers(it);
          var nextTier = null;
          for (var i = tierIdx + 1; i < TIER_ORDER.length; i++) {
            if (supported.indexOf(TIER_ORDER[i]) >= 0) { nextTier = TIER_ORDER[i]; break; }
          }
          if (nextTier) {
            candidates.push({ id: id, item: it, currentTier: tier, suggestedTier: nextTier });
          }
        }
      }
      return candidates;
    }

    function promoteItemTier(itemId, newTier) {
      var it = state.items[itemId];
      if (!it) return;
      it.lastTier = it.tier;
      it.tier = newTier;
      if (it.fsrs && it.fsrs.stability) {
        it.fsrs.stability = Math.max(1, it.fsrs.stability * 0.6);
        it.fsrs.due = isoNow();
      }
      saveState();
      toast('Promoted to ' + tierLabel(newTier).toUpperCase());
    }

    function tierSupportBadgeHTML(tiers) {
      if (!tiers || !tiers.length) return '';
      var h = '<div class="tier-support-badge"><span class="tsb-label">Supports</span>';
      tiers.forEach(function(t) {
        var col = tierColour(t);
        h += '<span class="tsb-tier" style="background:' + col + ';">' + tierLabel(t) + '</span>';
      });
      h += '</div>';
      return h;
    }

/* ── Module Helpers ── */
/* ── Course Helpers ── */
/* ── FSRS-6: 21 parameters. w[19] = short-term stability weight, w[20] = decay (was hardcoded 0.5 in FSRS-5) ── */
    var FSRS6_DEFAULT_DECAY = 0.1542;
    var DEFAULT_WEIGHTS = [0.2172, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, FSRS6_DEFAULT_DECAY];
    var w = DEFAULT_WEIGHTS.slice();
    var fsrsInstance = null;
    try {
      if (typeof FSRS !== 'undefined' && FSRS.FSRS && FSRS.generatorParameters) {
        fsrsInstance = new FSRS.FSRS(FSRS.generatorParameters({
          w: DEFAULT_WEIGHTS.slice(),
          request_retention: 0.9,
          enable_fuzz: true
        }));
      }
    } catch (e) {
      console.warn('ts-fsrs not loaded; inline FSRS only');
    }

/* ── UI + Session Engine ── */
    /* ═══════════════════════════════════════════
       SVG ICON SYSTEM (Lucide-style, 16×16, 1.5px stroke)
       All icons use currentColor — inherit from parent.
       ═══════════════════════════════════════════ */
    var ICONS = {
      gear: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85"/></svg>',
      close: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>',
      plus: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
      brain: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V8"/><path d="M5.5 8C3.5 8 2 6.5 2 4.8 2 3.2 3.3 2 5 2c.7 0 1.4.3 1.9.7C7.3 2.3 7.6 2 8 2s.7.3 1.1.7C9.6 2.3 10.3 2 11 2c1.7 0 3 1.2 3 2.8C14 6.5 12.5 8 10.5 8"/><path d="M4 8.5c-1.1.4-2 1.5-2 2.7C2 12.7 3.3 14 5 14h6c1.7 0 3-1.3 3-2.8 0-1.2-.9-2.3-2-2.7"/></svg>',
      book: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12.5V3a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0114 3v9.5"/><path d="M2 12.5A1.5 1.5 0 013.5 11h9a1.5 1.5 0 011.5 1.5v0a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5z"/></svg>',
      target: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3.5"/><circle cx="8" cy="8" r="1"/></svg>',
      zap: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="9,1.5 3.5,9 8,9 7,14.5 12.5,7 8,7"/></svg>',
      flame: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5c0 2.5 3.5 4 3.5 7a3.5 3.5 0 01-7 0C4.5 5.5 8 4 8 1.5z"/></svg>',
      calendar: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="1.5"/><line x1="2" y1="6.5" x2="14" y2="6.5"/><line x1="5.5" y1="1.5" x2="5.5" y2="4"/><line x1="10.5" y1="1.5" x2="10.5" y2="4"/></svg>',
      clipboard: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="2.5" width="9" height="12" rx="1.5"/><path d="M6 2.5V2a2 2 0 014 0v.5"/></svg>',
      robot: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="10" height="8" rx="2"/><line x1="8" y1="2" x2="8" y2="5"/><circle cx="8" cy="1.5" r="0.8"/><circle cx="6" cy="9" r="1"/><circle cx="10" cy="9" r="1"/><line x1="1" y1="9" x2="3" y2="9"/><line x1="13" y1="9" x2="15" y2="9"/></svg>',
      archive: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="13" height="3.5" rx="1"/><path d="M2.5 5.5V13a1 1 0 001 1h9a1 1 0 001-1V5.5"/><line x1="6.5" y1="8.5" x2="9.5" y2="8.5"/></svg>',
      restore: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,7 5,4 8,7"/><path d="M5 4v5a3 3 0 003 3h4"/></svg>',
      edit: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5a1.8 1.8 0 012.5 2.5L6 13l-3.5 1 1-3.5z"/><line x1="9.5" y1="4.5" x2="12" y2="7"/></svg>',
      trash: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,4 13,4"/><path d="M6 4V2.5h4V4"/><path d="M4 4l.7 9.5a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4"/></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5L1.5 13.5h13z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/></svg>',
      download: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="2" x2="8" y2="10.5"/><polyline points="4.5,7 8,10.5 11.5,7"/><path d="M2.5 12.5h11"/></svg>',
      sparkle: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2"/></svg>',
      notepad: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="1.5" width="10" height="13" rx="1.5"/><line x1="6" y1="5" x2="10" y2="5"/><line x1="6" y1="7.5" x2="10" y2="7.5"/><line x1="6" y1="10" x2="8.5" y2="10"/></svg>',
      sword: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="13" x2="13" y2="3"/><polyline points="9,3 13,3 13,7"/><line x1="5" y1="8.5" x2="7.5" y2="11"/></svg>',
      arrowLeft: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="13" y1="8" x2="3" y2="8"/><polyline points="7,4 3,8 7,12"/></svg>',
      check: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5,8.5 6.5,11.5 12.5,4.5"/></svg>',
      model: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><polyline points="2,5 8,9 14,5"/></svg>'
    };

var el = function(id){ return document.getElementById(id); };
    var viewDash = el('viewDash');
    var viewSession = el('viewSession');
    var viewDone = el('viewDone');
    var rootCard = el('rootCard');
    var tierArea = el('tierArea');
    var modelAnswerEl = el('modelAnswer');
    var ratingsEl = el('ratings');
    var studyIndicator = el('studyIndicator');
    var modalOv = el('modalOv');
    var settingsOv = el('settingsOv');
    var courseModalOv = el('courseModalOv');

    var selectedCourse = 'All';
    var selectedTopic = 'All';
    var retentionFilter = 'All'; /* controls which course the retention graph shows */

    var session = null;
    var activeRubric = null;
    var essayPhase = null;
    var essayOutlineText = '';
    var essayOutlineTimer = null;
    var essayOutlineEndsAt = 0;
    var restudyIntervalTimer = null;
    var restudyTimeoutTimer = null;
    var breakState = {
      sessionStartTime: 0,
      lastBreakTime: 0,
      breaksTaken: 0,
      bannerDismissed: false,
      breakTimerInterval: null,
      breakDurationMs: 5 * 60 * 1000
    };
    var BREAK_TIPS = [
      'Stand up, stretch, look at something 20 feet away for 20 seconds.',
      'Take 5 deep breaths. Inhale for 4 seconds, hold for 4, exhale for 6.',
      'Walk to another room and back. Physical movement improves hippocampal encoding.',
      'Drink water. Even mild dehydration reduces working memory capacity by ~15%.',
      'Close your eyes and mentally review the last 3 items you studied.',
      'Do 10 squats or push-ups. Exercise-induced BDNF enhances memory consolidation.',
      'Look out a window. Natural light exposure resets attentional circuitry.'
    ];
    var awakeningState = {
      activeStep: null,
      name: '',
      about: '',
      motivation: '',
      notes: '',
      onComplete: null,
      timers: [],
      hatchTimeline: null,
      hatchLoops: []
    };
    var checkInState = {
      active: false,
      trigger: null
    };

    function scheduleUiTimer(fn, delay) {
      var id = setTimeout(fn, delay);
      awakeningState.timers.push(id);
      return id;
    }

    function clearAwakeningTimers() {
      while (awakeningState.timers.length) {
        clearTimeout(awakeningState.timers.pop());
      }
    }

    function runWithGsap(task, fallback) {
      if (window.gsap) {
        task(window.gsap);
        return;
      }
      if (Core && Core.gsapReady) {
        Core.gsapReady.then(function(gsap) {
          if (gsap) task(gsap);
          else if (fallback) fallback();
        });
        return;
      }
      if (fallback) fallback();
    }

    function playOverlayClick() {
      try {
        if (Core && Core.audio && Core.audio.click) Core.audio.click();
        else if (typeof playClick === 'function') playClick();
      } catch (e) {}
    }

    function playOverlayChime() {
      try {
        if (Core && Core.audio && Core.audio.chime) Core.audio.chime();
        else if (typeof playChime === 'function') playChime();
      } catch (e) {}
    }

    function getDragonGrowthStageFromXp(xp) {
      var thresholds = [0, 1000, 5000, 20000, 60000, 120000];
      var stage = 0;
      for (var i = thresholds.length - 1; i >= 0; i--) {
        if ((xp || 0) >= thresholds[i]) { stage = i; break; }
      }
      return stage;
    }

    function getCurrentDragonGrowthStage() {
      var xp = 0;
      try { xp = SyncEngine.get('dragon', 'xp') || 0; } catch (e) {}
      return getDragonGrowthStageFromXp(xp);
    }

    function getUserProfile() {
      var profile = null;
      try { profile = SyncEngine.get('user', 'profile') || null; } catch (e) {}
      if (!profile) return null;
      if (!profile.checkInSignals || typeof profile.checkInSignals !== 'object') profile.checkInSignals = {};
      if (profile.lastKnownDragonStage == null) profile.lastKnownDragonStage = getCurrentDragonGrowthStage();
      if (!profile.lastCheckIn && profile.awakenedAt) profile.lastCheckIn = profile.awakenedAt;
      return profile;
    }

    function saveUserProfile(profile) {
      if (!profile) return;
      if (!profile.checkInSignals || typeof profile.checkInSignals !== 'object') profile.checkInSignals = {};
      if (profile.lastKnownDragonStage == null) profile.lastKnownDragonStage = getCurrentDragonGrowthStage();
      SyncEngine.set('user', 'profile', profile);
      if (profile.name) SyncEngine.set('user', 'name', profile.name);
    }

    function describeCheckInTrigger(trigger, name) {
      if (trigger && trigger.kind === 'absence') {
        return {
          title: 'Welcome back' + (name ? ', ' + name : '') + '.',
          copy: 'A lot can change after time away. Is this still you, or should the engine learn a little more about where you are now?'
        };
      }
      if (trigger && trigger.kind === 'new-semester') {
        return {
          title: 'A new chapter is starting' + (name ? ', ' + name : '') + '.',
          copy: 'You have added a burst of new courses. Before the engine adapts around them, make sure your profile still reflects your current goals and situation.'
        };
      }
      if (trigger && trigger.kind === 'calibration') {
        return {
          title: 'That was a meaningful round.',
          copy: 'Now that new results are in, this is a good reflection moment. Update anything the engine should keep in mind going forward.'
        };
      }
      if (trigger && trigger.kind === 'milestone') {
        return {
          title: 'You have grown' + (name ? ', ' + name : '') + '.',
          copy: 'Your dragon reached a new growth stage. If your path or priorities have shifted too, this is a good moment to tell the engine.'
        };
      }
      return {
        title: 'Still on the same path?',
        copy: 'Take a quick glance at your profile and make sure the engine still understands who you are and what you are aiming for.'
      };
    }

    function resolveCheckInTrigger(profile) {
      if (!profile) return null;
      var lastCheck = new Date(profile.lastCheckIn || profile.awakenedAt || isoNow());
      var signals = profile.checkInSignals || {};
      var stats = (state && state.stats) ? state.stats : (SyncEngine.get(NS, 'stats') || {});
      var lastSessionDate = stats && stats.lastSessionDate ? String(stats.lastSessionDate) : '';
      if (lastSessionDate) {
        var lastSessionStamp = new Date(lastSessionDate + 'T00:00:00');
        var daysAway = daysBetween(lastSessionStamp.getTime(), Date.now());
        var absenceAlreadyHandled = signals.lastAbsencePromptedAt && new Date(signals.lastAbsencePromptedAt).getTime() >= lastSessionStamp.getTime();
        if (daysAway >= 30 && !absenceAlreadyHandled) {
          return { kind: 'absence', sessionDate: lastSessionDate };
        }
      }

      var createdDates = listCourses(true).map(function(course) {
        return course && course.created ? new Date(course.created) : null;
      }).filter(function(dt) {
        return dt && !isNaN(dt.getTime()) && dt.getTime() >= lastCheck.getTime();
      }).sort(function(a, b) {
        return a.getTime() - b.getTime();
      });
      for (var i = 0; i <= createdDates.length - 3; i++) {
        var spanMs = createdDates[i + 2].getTime() - createdDates[i].getTime();
        var clusterEnd = createdDates[i + 2].toISOString();
        var semesterAlreadyHandled = signals.lastSemesterPromptedAt && new Date(signals.lastSemesterPromptedAt).getTime() >= createdDates[i + 2].getTime();
        if (spanMs <= (7 * 24 * 60 * 60 * 1000) && !semesterAlreadyHandled) {
          return { kind: 'new-semester', clusterEnd: clusterEnd };
        }
      }

      var calHistory = (state && state.calibration && state.calibration.history) ? state.calibration.history : [];
      var daysSinceCheckIn = daysBetween(lastCheck.getTime(), Date.now());
      var newCalEntries = calHistory.filter(function(entry) {
        return entry && entry.ts && new Date(entry.ts).getTime() > lastCheck.getTime();
      });
      if (newCalEntries.length >= 5 && daysSinceCheckIn >= 14) {
        var latestCalTs = newCalEntries[newCalEntries.length - 1].ts;
        var calibrationAlreadyHandled = signals.lastCalibrationPromptedAt && new Date(signals.lastCalibrationPromptedAt).getTime() >= new Date(latestCalTs).getTime();
        if (!calibrationAlreadyHandled) {
          return { kind: 'calibration', latestCalibrationAt: latestCalTs };
        }
      }

      var currentStage = getCurrentDragonGrowthStage();
      var lastKnownStage = profile.lastKnownDragonStage != null ? profile.lastKnownDragonStage : 0;
      var milestoneHandled = signals.lastMilestonePromptedStage != null ? signals.lastMilestonePromptedStage : lastKnownStage;
      if (currentStage > lastKnownStage && currentStage > milestoneHandled) {
        return { kind: 'milestone', stage: currentStage };
      }
      return null;
    }

    function stampCheckInTrigger(profile, trigger, timestamp) {
      if (!profile) return profile;
      if (!profile.checkInSignals || typeof profile.checkInSignals !== 'object') profile.checkInSignals = {};
      var stamp = timestamp || isoNow();
      profile.lastCheckIn = stamp;
      profile.lastKnownDragonStage = getCurrentDragonGrowthStage();
      if (!trigger) return profile;
      if (trigger.kind === 'absence') profile.checkInSignals.lastAbsencePromptedAt = stamp;
      if (trigger.kind === 'new-semester') profile.checkInSignals.lastSemesterPromptedAt = trigger.clusterEnd || stamp;
      if (trigger.kind === 'calibration') profile.checkInSignals.lastCalibrationPromptedAt = trigger.latestCalibrationAt || stamp;
      if (trigger.kind === 'milestone') profile.checkInSignals.lastMilestonePromptedStage = profile.lastKnownDragonStage;
      return profile;
    }

    function closeCheckIn() {
      var overlay = el('checkin-overlay');
      if (!overlay) return;
      checkInState.active = false;
      checkInState.trigger = null;
      runWithGsap(function(gsap) {
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.3,
          ease: 'power2.inOut',
          onComplete: function() {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
          }
        });
      }, function() {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
      });
    }

    function persistCheckIn(updated) {
      var profile = getUserProfile();
      if (!profile) return;
      if (updated) {
        profile.about = (el('checkin-about').value || '').trim();
        profile.motivation = (el('checkin-motivation').value || '').trim();
        profile.notes = (el('checkin-notes').value || '').trim();
      }
      stampCheckInTrigger(profile, checkInState.trigger, isoNow());
      saveUserProfile(profile);
      closeCheckIn();
    }

    function showCheckIn(profile, trigger) {
      /* Never interrupt an active study session */
      if (session && session.queue && session.queue.length > 0 &&
          session.idx < session.queue.length) return;
      if (!profile || checkInState.active) return;
      var overlay = el('checkin-overlay');
      if (!overlay) return;
      var messaging = describeCheckInTrigger(trigger, profile.name || '');
      el('checkin-title').textContent = messaging.title;
      el('checkin-copy').textContent = messaging.copy;
      el('checkin-about').value = profile.about || '';
      el('checkin-motivation').value = profile.motivation || '';
      el('checkin-notes').value = profile.notes || '';
      el('checkin-meta').textContent = 'Is this still you? Edit anything that changed, or tap Still me and continue.';
      checkInState.active = true;
      checkInState.trigger = trigger || null;
      overlay.style.display = 'flex';
      overlay.style.opacity = '0';
      overlay.setAttribute('aria-hidden', 'false');
      runWithGsap(function(gsap) {
        gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' });
        gsap.fromTo(overlay.querySelector('.checkin-card'),
          { opacity: 0, y: 16, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power2.out' }
        );
      }, function() {
        overlay.style.opacity = '1';
      });
    }

    function checkForCheckIn() {
      if (session && session.queue && session.idx < session.queue.length) return;
      var profile = getUserProfile();
      if (!profile || !profile.awakened || checkInState.active) return;
      var trigger = resolveCheckInTrigger(profile);
      if (trigger) showCheckIn(profile, trigger);
    }

    function focusAwakeningField(id) {
      scheduleUiTimer(function() {
        var field = el(id);
        if (field) field.focus();
      }, 60);
    }

    function renderTypewriterLines(containerId, lines, delayMs) {
      var container = el(containerId);
      if (!container) return 0;
      container.innerHTML = '';
      var totalDelay = delayMs || 0;
      lines.forEach(function(lineText) {
        var line = document.createElement('span');
        var text = String(lineText || '');
        var chars = Math.max(text.length, 1);
        var charDelay = 40;
        line.className = 'awakening-typewriter-line';
        line.textContent = '';
        line.style.animation = 'awakening-cursor 0.85s step-end infinite';
        container.appendChild(line);
        (function(target, targetText, startDelay) {
          scheduleUiTimer(function() {
            var index = 0;
            function typeNextChar() {
              target.textContent = targetText.slice(0, index);
              if (index >= targetText.length) return;
              index++;
              scheduleUiTimer(typeNextChar, charDelay);
            }
            typeNextChar();
          }, startDelay);
        })(line, text, totalDelay);
        totalDelay += (chars * charDelay) + 180;
      });
      return totalDelay;
    }

    function setAwakeningButtonEnabled(id, enabled) {
      var button = el(id);
      if (!button) return;
      button.disabled = !enabled;
      if (!enabled || button.dataset.shown === 'true') return;
      button.dataset.shown = 'true';
      runWithGsap(function(gsap) {
        gsap.fromTo(button, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }, function() {
        button.style.opacity = '1';
        button.style.transform = 'translateY(0)';
      });
    }

    function resetAwakeningButtonReveal(id) {
      var button = el(id);
      if (!button) return;
      button.dataset.shown = 'false';
      button.style.opacity = '0';
      button.style.transform = 'translateY(10px)';
    }

    function switchAwakeningStep(nextId, onShown) {
      clearAwakeningTimers();
      var next = el(nextId);
      var current = awakeningState.activeStep ? el(awakeningState.activeStep) : null;
      if (!next) return;
      function activate() {
        document.querySelectorAll('.awakening-step').forEach(function(step) {
          step.classList.remove('awakening-step-active');
          step.style.display = 'none';
          step.style.opacity = '0';
        });
        next.classList.add('awakening-step-active');
        next.style.display = 'block';
        awakeningState.activeStep = nextId;
        if (onShown) onShown();
        runWithGsap(function(gsap) {
          gsap.fromTo(next, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' });
        }, function() {
          next.style.opacity = '1';
        });
      }
      if (current && current !== next) {
        runWithGsap(function(gsap) {
          gsap.to(current, {
            opacity: 0,
            duration: 0.4,
            ease: 'power2.inOut',
            onComplete: activate
          });
        }, activate);
        return;
      }
      activate();
    }

    function burstAwakeningParticles() {
      var host = el('awakening-hatch-particles');
      if (!host) return;
      host.innerHTML = '';
      for (var i = 0; i < 12; i++) {
        var particle = document.createElement('span');
        particle.className = 'awakening-particle';
        host.appendChild(particle);
        (function(node, idx) {
          var angle = (Math.PI * 2 / 12) * idx;
          var distance = 42 + Math.random() * 38;
          var dx = Math.cos(angle) * distance;
          var dy = Math.sin(angle) * distance;
          runWithGsap(function(gsap) {
            gsap.fromTo(node,
              { opacity: 0.95, x: 0, y: 0, scale: 0.4 },
              { opacity: 0, x: dx, y: dy, scale: 1.2, duration: 0.65, ease: 'power2.out', onComplete: function() { node.remove(); } }
            );
          }, function() {
            node.remove();
          });
        })(particle, i);
      }
    }

    function startHatchSequence() {
      var dormant = el('awakening-egg-dormant');
      var cracking = el('awakening-egg-cracking');
      var hatching = el('awakening-egg-hatching');
      var dragon = el('awakening-dragon-hatchling');
      var flash = el('awakening-flash');
      var hatchText = el('awakening-hatch-text');
      var enterBtn = el('awakening-enter-btn');
      if (!dormant || !cracking || !hatching || !dragon || !flash || !hatchText || !enterBtn) return;
      hatchText.innerHTML = '';
      enterBtn.style.opacity = '0';
      enterBtn.style.transform = 'translateY(10px)';
      cracking.style.opacity = '0';
      hatching.style.opacity = '0';
      dragon.style.opacity = '0';
      dormant.style.opacity = '1';
      dormant.style.filter = 'drop-shadow(0 0 18px rgba(var(--accent-rgb),0.38))';
      if (awakeningState.hatchTimeline && awakeningState.hatchTimeline.kill) awakeningState.hatchTimeline.kill();
      awakeningState.hatchLoops.forEach(function(tween) { if (tween && tween.kill) tween.kill(); });
      awakeningState.hatchLoops = [];
      runWithGsap(function(gsap) {
        var tl = gsap.timeline();
        awakeningState.hatchTimeline = tl;
        tl.to(dormant, {
          filter: 'drop-shadow(0 0 26px rgba(139,92,246,0.72))',
          duration: 1.0,
          repeat: 1,
          yoyo: true,
          ease: 'sine.inOut'
        });
        tl.to(dormant, {
          rotation: 2,
          duration: 0.1,
          repeat: 8,
          yoyo: true,
          transformOrigin: 'center center',
          ease: 'sine.inOut'
        }, 2.0);
        tl.to(dormant, {
          rotation: 4,
          duration: 0.08,
          repeat: 12,
          yoyo: true,
          transformOrigin: 'center center',
          ease: 'sine.inOut'
        }, 3.0);
        tl.to(dormant, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 4.0);
        tl.to(cracking, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 4.0);
        tl.call(function() {
          burstAwakeningParticles();
          playOverlayClick();
        }, null, 4.2);
        tl.to(cracking, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 5.5);
        tl.to(hatching, { opacity: 1, duration: 0.5, ease: 'power2.out', filter: 'drop-shadow(0 0 40px rgba(139,92,246,0.8))' }, 5.5);
        tl.fromTo(flash, { opacity: 0 }, { opacity: 0.9, duration: 0.3, ease: 'power2.out', yoyo: true, repeat: 1 }, 6.5);
        tl.to(hatching, { opacity: 0, duration: 0.35, ease: 'power2.out' }, 7.0);
        tl.fromTo(dragon,
          { opacity: 0, scale: 0.4, y: 12 },
          { opacity: 1, scale: 1, y: 0, duration: 1.0, ease: 'elastic.out(1, 0.5)' },
          7.0
        );
        tl.call(function() {
          playOverlayChime();
          awakeningState.hatchLoops.push(gsap.to(dragon, {
            scaleY: 1.03,
            scaleX: 0.98,
            duration: 2.5,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
            transformOrigin: 'center bottom'
          }));
          awakeningState.hatchLoops.push(gsap.to(dragon, {
            y: -6,
            duration: 3,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut'
          }));
          awakeningState.hatchLoops.push(gsap.to(dragon, {
            filter: 'drop-shadow(0 0 25px rgba(139,92,246,0.85))',
            duration: 2.2,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut'
          }));
        }, null, 7.0);
        tl.call(function() {
          renderTypewriterLines('awakening-hatch-text', ['Your companion has awakened.'], 0);
        }, null, 8.5);
        tl.call(function() {
          renderTypewriterLines('awakening-hatch-text', ['Your companion has awakened.', awakeningState.name + ', your journey begins now.'], 0);
        }, null, 10.0);
        tl.call(function() {
          gsap.fromTo(enterBtn,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
          );
          gsap.to(enterBtn, {
            boxShadow: '0 0 26px rgba(139,92,246,0.38)',
            duration: 1.2,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut'
          });
        }, null, 11.5);
      }, function() {
        dragon.style.opacity = '1';
        enterBtn.style.opacity = '1';
      });
    }

    function renderAwakeningStep(stepKey) {
      if (stepKey === 'intro') {
        resetAwakeningButtonReveal('awakening-begin-btn');
        switchAwakeningStep('awakening-step-intro', function() {
          var total = renderTypewriterLines('awakening-intro-prompt', ['A new mind has entered the System.'], 1000);
          scheduleUiTimer(function() {
            setAwakeningButtonEnabled('awakening-begin-btn', true);
          }, total + 1500);
        });
        return;
      }
      if (stepKey === 'name') {
        resetAwakeningButtonReveal('awakening-name-continue');
        switchAwakeningStep('awakening-step-name', function() {
          renderTypewriterLines('awakening-name-prompt', ['What should I call you?'], 0);
          focusAwakeningField('awakening-name-input');
        });
        return;
      }
      if (stepKey === 'about') {
        resetAwakeningButtonReveal('awakening-about-continue');
        switchAwakeningStep('awakening-step-about', function() {
          renderTypewriterLines('awakening-about-prompt', ['Tell me about yourself, ' + awakeningState.name + '.', 'Where are you in life?', 'What are you studying?'], 0);
          focusAwakeningField('awakening-about-input');
        });
        return;
      }
      if (stepKey === 'motivation') {
        resetAwakeningButtonReveal('awakening-motivation-continue');
        switchAwakeningStep('awakening-step-motivation', function() {
          renderTypewriterLines('awakening-motivation-prompt', ['What made you come here?', 'What do you want to get out of this?'], 0);
          focusAwakeningField('awakening-motivation-input');
        });
        return;
      }
      if (stepKey === 'notes') {
        switchAwakeningStep('awakening-step-notes', function() {
          renderTypewriterLines('awakening-notes-prompt', ['Anything else I should know?', 'How you learn. What frustrates you.', 'What has or has not worked before.'], 0);
          focusAwakeningField('awakening-notes-input');
        });
        return;
      }
      if (stepKey === 'hatch') {
        switchAwakeningStep('awakening-step-hatch', function() {
          startHatchSequence();
        });
      }
    }

    function completeAwakening() {
      var overlay = el('awakening-overlay');
      if (!overlay) return;
      var profile = {
        name: awakeningState.name,
        about: awakeningState.about,
        motivation: awakeningState.motivation,
        notes: awakeningState.notes || '',
        awakened: true,
        awakenedAt: isoNow(),
        lastCheckIn: isoNow(),
        lastKnownDragonStage: getCurrentDragonGrowthStage(),
        checkInSignals: {}
      };
      saveUserProfile(profile);
      runWithGsap(function(gsap) {
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.8,
          ease: 'power2.inOut',
          onComplete: function() {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
            if (typeof awakeningState.onComplete === 'function') {
              var done = awakeningState.onComplete;
              awakeningState.onComplete = null;
              done();
            }
          }
        });
      }, function() {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        if (typeof awakeningState.onComplete === 'function') {
          var doneFallback = awakeningState.onComplete;
          awakeningState.onComplete = null;
          doneFallback();
        }
      });
    }

    function showAwakening(onComplete) {
      ['egg-dormant','egg-cracking','egg-hatching','dragon-hatchling'].forEach(function(name) {
        var img = new Image();
        img.src = 'assets/dragon/' + name + '.png';
      });
      awakeningState.name = '';
      awakeningState.about = '';
      awakeningState.motivation = '';
      awakeningState.notes = '';
      awakeningState.onComplete = onComplete || null;
      clearAwakeningTimers();
      var overlay = el('awakening-overlay');
      if (!overlay) return;
      overlay.style.display = 'flex';
      overlay.style.opacity = '1';
      overlay.setAttribute('aria-hidden', 'false');
      renderAwakeningStep('intro');
    }

    var awakeningNameInput = el('awakening-name-input');
    var awakeningAboutInput = el('awakening-about-input');
    var awakeningMotivationInput = el('awakening-motivation-input');
    var awakeningNotesInput = el('awakening-notes-input');
    var awakeningBeginBtn = el('awakening-begin-btn');
    var awakeningNameContinue = el('awakening-name-continue');
    var awakeningAboutContinue = el('awakening-about-continue');
    var awakeningMotivationContinue = el('awakening-motivation-continue');
    var awakeningNotesSkip = el('awakening-notes-skip');
    var awakeningNotesContinue = el('awakening-notes-continue');
    var awakeningEnterBtn = el('awakening-enter-btn');
    var checkinStillMeBtn = el('checkin-stillme');
    var checkinUpdatedBtn = el('checkin-updated');

    if (awakeningBeginBtn) {
      awakeningBeginBtn.addEventListener('click', function() {
        playOverlayClick();
        renderAwakeningStep('name');
      });
    }
    if (awakeningNameInput) {
      awakeningNameInput.addEventListener('input', function() {
        setAwakeningButtonEnabled('awakening-name-continue', (this.value || '').trim().length >= 1);
      });
      awakeningNameInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !awakeningNameContinue.disabled) {
          e.preventDefault();
          awakeningNameContinue.click();
        }
      });
    }
    if (awakeningNameContinue) {
      awakeningNameContinue.addEventListener('click', function() {
        var value = (awakeningNameInput && awakeningNameInput.value ? awakeningNameInput.value : '').trim();
        if (!value) return;
        awakeningState.name = value;
        playOverlayClick();
        renderAwakeningStep('about');
      });
    }
    if (awakeningAboutInput) {
      awakeningAboutInput.addEventListener('input', function() {
        setAwakeningButtonEnabled('awakening-about-continue', (this.value || '').trim().length >= 10);
      });
    }
    if (awakeningAboutContinue) {
      awakeningAboutContinue.addEventListener('click', function() {
        var value = (awakeningAboutInput && awakeningAboutInput.value ? awakeningAboutInput.value : '').trim();
        if (value.length < 10) return;
        awakeningState.about = value;
        playOverlayClick();
        renderAwakeningStep('motivation');
      });
    }
    if (awakeningMotivationInput) {
      awakeningMotivationInput.addEventListener('input', function() {
        setAwakeningButtonEnabled('awakening-motivation-continue', (this.value || '').trim().length >= 10);
      });
    }
    if (awakeningMotivationContinue) {
      awakeningMotivationContinue.addEventListener('click', function() {
        var value = (awakeningMotivationInput && awakeningMotivationInput.value ? awakeningMotivationInput.value : '').trim();
        if (value.length < 10) return;
        awakeningState.motivation = value;
        playOverlayClick();
        renderAwakeningStep('notes');
      });
    }
    if (awakeningNotesSkip) {
      awakeningNotesSkip.addEventListener('click', function() {
        awakeningState.notes = '';
        playOverlayClick();
        renderAwakeningStep('hatch');
      });
    }
    if (awakeningNotesContinue) {
      awakeningNotesContinue.addEventListener('click', function() {
        awakeningState.notes = (awakeningNotesInput && awakeningNotesInput.value ? awakeningNotesInput.value : '').trim();
        playOverlayClick();
        renderAwakeningStep('hatch');
      });
    }
    if (awakeningEnterBtn) {
      awakeningEnterBtn.addEventListener('click', function() {
        playOverlayClick();
        completeAwakening();
      });
    }
    if (checkinStillMeBtn) {
      checkinStillMeBtn.addEventListener('click', function() {
        playOverlayClick();
        persistCheckIn(false);
      });
    }
    if (checkinUpdatedBtn) {
      checkinUpdatedBtn.addEventListener('click', function() {
        playOverlayClick();
        persistCheckIn(true);
      });
    }

/* Recompute stats from actual item data — call after any delete/archive */
    function getOverconfidentTopics(courseName) {
      var topicStats = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || !it.fsrs || !it.fsrs.lastReview) continue;
        if (courseName && courseName !== 'All' && it.course !== courseName) continue;
        var topic = it.topic || 'General';
        if (!topicStats[topic]) topicStats[topic] = { selfGood: 0, actualLow: 0, total: 0 };
        topicStats[topic].total++;
        var R = retrievability(it.fsrs, Date.now());
        if (it.fsrs.lapses >= 2 || R < 0.7) topicStats[topic].actualLow++;
        if (it.fsrs.stability && it.fsrs.stability < 10 && it.fsrs.reps >= 2) topicStats[topic].selfGood++;
      }
      var overconfident = [];
      for (var t in topicStats) {
        if (!topicStats.hasOwnProperty(t)) continue;
        var s = topicStats[t];
        if (s.total >= 3 && s.actualLow / s.total > 0.4) {
          overconfident.push({ topic: t, pctWeak: Math.round(s.actualLow / s.total * 100) });
        }
      }
      overconfident.sort(function(a, b) { return b.pctWeak - a.pctWeak; });
      return overconfident;
    }

    function getSleepAwareAdvice() {
      var hour = new Date().getHours();
      if (hour >= 19 || hour < 5) {
        return {
          show: true,
          icon: '🌙',
          title: 'Evening Study — Optimal for New Material',
          message: 'New and difficult cards benefit from evening study. The first sleep cycle is richest in non-REM sleep, which consolidates fresh memories.',
          bias: 'new'
        };
      }
      if (hour >= 5 && hour < 11) {
        return {
          show: true,
          icon: '☀️',
          title: 'Morning Review — Optimal for Reinforcement',
          message: 'Morning sessions are ideal for reviewing familiar cards. Your brain consolidated overnight memories — now strengthen those traces with retrieval.',
          bias: 'review'
        };
      }
      return { show: false, bias: 'neutral' };
    }

    function computeExamReadiness(courseName) {
      if (!courseName || !state.items) return null;
      var TIER_DEPTH = {
        quickfire: 0.40,
        explain: 0.60,
        apply: 0.75,
        distinguish: 0.85,
        mock: 0.95,
        worked: 0.70
      };
      var now = Date.now();
      var topicStats = {};
      var totalCards = 0;

      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || it.course !== courseName) continue;
        var topic = it.topic || 'General';
        if (!topicStats[topic]) {
          topicStats[topic] = {
            totalCards: 0,
            retentionSum: 0,
            highestTierFactor: 0
          };
        }
        var ts = topicStats[topic];
        ts.totalCards++;
        totalCards++;

        var R = 1.0;
        if (it.fsrs && it.fsrs.lastReview && it.fsrs.stability) {
          R = retrievability(it.fsrs, now);
        } else if (it.fsrs && !it.fsrs.lastReview) {
          R = 0.0;
        }
        ts.retentionSum += R;

        var itemTier = it.lastTier || it.tier || 'quickfire';
        var tierFactor = TIER_DEPTH[itemTier] || 0.40;
        if (tierFactor > ts.highestTierFactor) {
          ts.highestTierFactor = tierFactor;
        }
      }

      if (totalCards < 5) return null;
      var topicNames = Object.keys(topicStats);
      if (!topicNames.length) return null;

      var readinessNumerator = 0;
      var readinessDenominator = 0;
      for (var ti = 0; ti < topicNames.length; ti++) {
        var tName = topicNames[ti];
        var tStats = topicStats[tName];
        var topicWeight = tStats.totalCards;
        var topicRetention = tStats.retentionSum / tStats.totalCards;
        var tierDepth = tStats.highestTierFactor;
        var topicReadiness = topicRetention * tierDepth;
        readinessNumerator += topicWeight * topicReadiness;
        readinessDenominator += topicWeight;
      }

      if (readinessDenominator === 0) return null;
      var overallReadiness = readinessNumerator / readinessDenominator;
      var pct = Math.round(clamp(overallReadiness, 0, 1) * 100);

      return {
        readinessPct: pct,
        totalCards: totalCards,
        topicCount: topicNames.length,
        topicBreakdown: topicNames.map(function(t) {
          var s = topicStats[t];
          var avgR = s.retentionSum / s.totalCards;
          return {
            topic: t,
            cards: s.totalCards,
            avgRetention: Math.round(avgR * 100),
            tierFactor: s.highestTierFactor,
            readiness: Math.round(avgR * s.highestTierFactor * 100)
          };
        }).sort(function(a, b) { return a.readiness - b.readiness; })
      };
    }

    function setCalArc(p) {
      var arc = el('calArc');
      var dash = 120;
      var off = dash * (1 - clamp(p,0,1));
      arc.style.strokeDasharray = String(dash);
      arc.style.strokeDashoffset = String(off);
      var col = (p >= 0.75) ? 'var(--rate-good)' : (p >= 0.55) ? 'var(--rate-hard)' : 'var(--rate-again)';
      arc.style.stroke = col;
    }

    function ensureStandaloneDashboardLayout() {
      if (!document.body.classList.contains('standalone')) return;

      var homePanel = el('tabHome');
      var hero = el('heroStat');
      var heroSub = el('heroCourseHint');
      var startBtn = el('startBtn');
      var miniActions = el('homeMiniActions');
      var tierHeader = el('tierBreakdownHeader');
      var tierBreakdown = el('tierBreakdown');
      var analyticsStrip = el('homeAnalyticsStrip');
      var cramBanner = el('cramBanner');
      var sleepBanner = el('sleepAdviceBanner');
      if (!homePanel || !hero) return;

      if (startBtn && startBtn.parentNode !== hero) {
        if (heroSub && heroSub.parentNode === hero && heroSub.nextSibling) hero.insertBefore(startBtn, heroSub.nextSibling);
        else hero.appendChild(startBtn);
      }
      if (miniActions && miniActions.parentNode !== hero) {
        hero.appendChild(miniActions);
      }

      if (tierHeader) tierHeader.style.display = 'none';
      if (!tierBreakdown || !analyticsStrip) return;

      var details = el('dashDetails');
      var detailsBody = el('dashDetailsBody');
      if (!details) {
        details = document.createElement('details');
        details.className = 'dash-details';
        details.id = 'dashDetails';
        details.open = true;
        details.innerHTML =
          '<summary class="dash-details-toggle">' +
            '<span class="se-icon">📊</span> Analytics &amp; Breakdown' +
            '<span class="dash-details-arrow">▸</span>' +
          '</summary>' +
          '<div class="dash-details-body" id="dashDetailsBody"></div>';
        var insertBeforeNode = sleepBanner || null;
        if (cramBanner && cramBanner.parentNode === homePanel) {
          cramBanner.insertAdjacentElement('afterend', details);
        } else if (insertBeforeNode && insertBeforeNode.parentNode === homePanel) {
          homePanel.insertBefore(details, insertBeforeNode);
        } else {
          homePanel.appendChild(details);
        }
        detailsBody = el('dashDetailsBody');
      }

      if (!detailsBody) return;
      if (tierBreakdown.parentNode !== detailsBody) detailsBody.appendChild(tierBreakdown);
      if (analyticsStrip.parentNode !== detailsBody) detailsBody.appendChild(analyticsStrip);
    }

function refreshCostEstimateInSettings() {
      var box = el('s_costEstimate');
      if (!box || typeof SyncEngine === 'undefined' || !SyncEngine.get) return;
      var analytics = SyncEngine.get(NS, 'tutorAnalytics');
      if (!analytics || !analytics.sessionHistory || !analytics.sessionHistory.length) {
        box.textContent = 'This month: 0 Flash / 0 Pro calls · Estimated cost: ~$0.00';
        return;
      }
      var now = new Date();
      var y = now.getFullYear();
      var m = now.getMonth();
      var flashM = 0;
      var proM = 0;
      analytics.sessionHistory.forEach(function(row) {
        if (!row || !row.date) return;
        var d = new Date(row.date + 'T12:00:00');
        if (d.getFullYear() === y && d.getMonth() === m) {
          flashM += row.flashCalls || 0;
          proM += row.proCalls || 0;
        }
      });
      var cost = flashM * 0.0003 + proM * 0.002;
      var costStr = cost < 0.01 && cost > 0 ? '<$0.01' : '$' + cost.toFixed(2);
      box.textContent = 'This month: ' + flashM + ' Flash / ' + proM + ' Pro calls · Estimated cost: ~' + costStr;
    }

    function autoPrepareAfterImport(courseName, importedItems) {
      if (!courseName || !importedItems || importedItems.length < 3) return;
      if (settings.feedbackMode === 'self_rate') return;
      var cardSummaries = importedItems.slice(0, 50).map(function(entry) {
        var obj = entry.obj || entry;
        return {
          prompt: (obj.prompt || '').substring(0, 200),
          topic: obj.topic || ''
        };
      });
      var courseData = state.courses && state.courses[courseName];
      var existingContext = {
        syllabusContext: (courseData && courseData.syllabusContext) || null,
        professorValues: (courseData && courseData.professorValues) || null
      };
      fetch(PREPARE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetKey()
        },
        body: JSON.stringify({ courseName: courseName, cards: cardSummaries, existingCourseContext: existingContext })
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (!data || data.error) return;
          var cd = state.courses && state.courses[courseName];
          if (data.syllabusContext && cd && !cd.syllabusContext) {
            cd.syllabusContext = String(data.syllabusContext).slice(0, 2000);
            if (data.keyTopics) cd.syllabusKeyTopics = data.keyTopics;
            cd.prepared = true;
            saveCourse(cd);
          } else if (cd && !cd.prepared) {
            cd.prepared = true;
            saveCourse(cd);
          }
          if (data.initialMemories && Array.isArray(data.initialMemories)) {
            var memories = SyncEngine.get(NS, 'tutorMemories') || [];
            data.initialMemories.forEach(function(m) {
              if (!m || !m.content) return;
              m.id = 'mem_' + Math.random().toString(36).replace(/[^a-z0-9]+/g, '').slice(0, 10);
              m.course = courseName;
              m.scope = m.scope || 'course';
              m.confidence = m.confidence != null ? m.confidence : 0.3;
              m.created = new Date().toISOString();
              m.lastRelevant = new Date().toISOString();
              m.relatedTopics = data.keyTopics ? data.keyTopics.slice(0, 3) : [];
              memories.push(m);
            });
            if (memories.length > 50) {
              memories.sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); });
              memories = memories.slice(0, 50);
            }
            SyncEngine.set(NS, 'tutorMemories', memories);
          }
          if (data.userSummary) toast(data.userSummary);
        })
        .catch(function() {});
    }

    function maybeAutoPrepare(courseName) {
      var courseData = state.courses && state.courses[courseName];
      if (!courseData || courseData.prepared) return;
      if (settings.feedbackMode === 'self_rate') return;
      var count = 0;
      var allItems = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (it && !it.archived && it.course === courseName) {
          count++;
          allItems.push({ obj: it });
        }
      }
      if (count < 5) return;
      autoPrepareAfterImport(courseName, allItems);
    }

    function extractPdfText(file) {
      return new Promise(function(resolve, reject) {
        if (typeof pdfjsLib === 'undefined') {
          reject(new Error('PDF library not loaded'));
          return;
        }
        var reader = new FileReader();
        reader.onload = function() {
          var typedArray = new Uint8Array(reader.result);
          pdfjsLib.getDocument({ data: typedArray }).promise.then(function(pdf) {
            var pages = [];
            var total = pdf.numPages;
            function extractPage(i) {
              if (i > total) {
                resolve(pages.join('\n\n'));
                return;
              }
              pdf.getPage(i).then(function(page) {
                page.getTextContent().then(function(content) {
                  var text = content.items.map(function(item) { return item.str; }).join(' ');
                  pages.push(text);
                  extractPage(i + 1);
                }).catch(reject);
              }).catch(reject);
            }
            extractPage(1);
          }).catch(reject);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    }

    function postSyllabusDistill(rawText, courseName, existingExamType) {
      var t = rawText != null ? String(rawText) : '';
      var truncated = t.length > 15000 ? t.slice(0, 15000) : t;
      return fetch(SYLLABUS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetKey()
        },
        body: JSON.stringify({
          rawText: truncated,
          courseName: courseName,
          existingExamType: existingExamType || 'mixed'
        })
      }).then(function(res) { return res.json(); });
    }

    function getAllTutorMemories() {
      if (typeof SyncEngine === 'undefined' || !SyncEngine.get) return [];
      return SyncEngine.get(NS, 'tutorMemories') || [];
    }

    function getCourseScopedMemoriesForDisplay(courseName) {
      return getAllTutorMemories()
        .filter(function(m) {
          return m && m.course === courseName && (!m.scope || m.scope === 'course');
        })
        .sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); });
    }

    function getGlobalMemoriesForDisplay() {
      return getAllTutorMemories()
        .filter(function(m) { return m && m.scope === 'global'; })
        .sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); });
    }

    function memoryTypeLabel(t) {
      var map = { pattern: 'Pattern', misconception: 'Misconception', strength: 'Strength', connection: 'Connection' };
      return map[t] || (t ? String(t) : 'Note');
    }

    function tutorNotesInfoIconHTML() {
      return '<span class="info-icon" tabindex="0" role="button" aria-label="What are tutor notes?">ⓘ' +
        '<span class="info-tooltip">Tutor notes are observations the AI tutor builds about your learning over time. It tracks recurring mistakes (patterns), specific misunderstandings (misconceptions), reliable knowledge areas (strengths), and links between topics (connections). These memories persist across sessions, so the tutor can reference past struggles, connect new material to things you already know, and avoid repeating feedback you have already absorbed. Course-specific notes apply only within one course; global notes inform the tutor across all your courses.<span class="tip-arrow"></span></span></span>';
    }

    function renderSingleTutorNoteHTML(m) {
      var confPct = Math.min(100, Math.max(0, Math.round((Number(m.confidence) || 0.5) * 100)));
      var scopeLabel = m && m.scope === 'global' ? 'GLOBAL' : 'COURSE';
      return '<div class="tutor-note-item">' +
        '<span class="tn-type">' + esc(memoryTypeLabel(m.type)) + '</span>' +
        '<span class="tn-scope" style="display:inline-block;font-size:6px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 5px;border-radius:4px;margin-left:4px;background:rgba(var(--accent-rgb),0.06);color:var(--text-tertiary);border:1px solid rgba(var(--accent-rgb),0.08);">' + scopeLabel + '</span>' +
        '<div class="tn-content">' + esc(m.content || '') + '</div>' +
        '<div class="tn-confidence"><div style="width:' + confPct + '%"></div></div>' +
        '</div>';
    }

    function renderTutorNotesClearControls(scope, courseName) {
      var attrs = ' data-clear-scope="' + esc(scope || '') + '"';
      if (scope === 'course' && courseName) attrs += ' data-course-enc="' + esc(encodeURIComponent(courseName)) + '"';
      return '' +
        '<div class="tn-clear-wrap" style="margin-top:8px;">' +
        '<button class="ghost-btn tn-clear-trigger" type="button" style="width:100%;min-width:auto;padding:8px;font-size:8px;">Clear memories</button>' +
        '<div class="tn-clear-confirm" style="display:none;margin-top:8px;">' +
        '<div style="font-size:9px;color:var(--rate-again);font-weight:700;letter-spacing:0.8px;text-transform:uppercase;text-align:center;margin-bottom:8px;">' +
        '⚠ This will permanently delete all tutor notes for this scope. Are you sure?' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button class="ghost-btn tn-clear-yes" type="button" ' + attrs + ' style="flex:1;border-color:rgba(239,68,68,0.25);color:var(--rate-again);background:rgba(239,68,68,0.06);">Yes, delete</button>' +
        '<button class="ghost-btn tn-clear-no" type="button" style="flex:1;">Cancel</button>' +
        '</div></div></div>';
    }

    function renderCourseTutorNotesPanelHTML(courseName) {
      var courseNotes = getCourseScopedMemoriesForDisplay(courseName);
      var globalNotes = getGlobalMemoriesForDisplay();
      var n = courseNotes.length + globalNotes.length;
      var bodyInner = '';
      if (!n) {
        bodyInner = '<div class="help" style="padding:0 0 4px;font-size:9px;color:var(--text-secondary);">No tutor notes yet — they appear as you use the AI tutor.</div>';
      } else {
        if (courseNotes.length > 0) {
          bodyInner += '<div style="font-size:7px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent);margin:8px 0 6px;display:flex;align-items:center;gap:6px;"><span style="font-size:10px;">📚</span> Course-Specific</div>';
          courseNotes.forEach(function(m) {
            bodyInner += renderSingleTutorNoteHTML(m);
          });
        }
        if (globalNotes.length > 0) {
          bodyInner += '<div style="font-size:7px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-secondary);margin:' + (courseNotes.length > 0 ? '12' : '8') + 'px 0 6px;display:flex;align-items:center;gap:6px;"><span style="font-size:10px;">🌐</span> Global (All Courses)</div>';
          globalNotes.forEach(function(m) {
            bodyInner += renderSingleTutorNoteHTML(m);
          });
        }
      }
      return '<div class="tutor-notes open">' +
        '<button type="button" class="tutor-notes-toggle" aria-expanded="true">' +
        '<span>Tutor Notes' + (n ? ' (' + n + ')' : '') + ' ' + tutorNotesInfoIconHTML() + '</span><span style="opacity:0.5;font-size:8px;">▼</span></button>' +
        '<div class="tutor-notes-body">' + bodyInner +
        renderTutorNotesClearControls('course', courseName) +
        '</div></div>';
    }

    function renderGlobalTutorNotesOverlayHTML() {
      var mems = getAllTutorMemories().slice().sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); });
      var courseNotes = mems.filter(function(m) { return m && m.scope !== 'global'; });
      var globalNotes = mems.filter(function(m) { return m && m.scope === 'global'; });
      var n = mems.length;
      var h = '<div style="font-size:10px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:var(--text);margin:0 0 10px;display:flex;align-items:center;gap:6px;">🧠 Tutor Notes ' + tutorNotesInfoIconHTML() + '</div>';
      if (!n) {
        h += '<p class="help" style="text-align:center;padding:16px;">No tutor notes yet. The tutor records learning patterns as you study.</p>';
        h += renderTutorNotesClearControls('global');
        return h;
      }
      if (courseNotes.length > 0) {
        h += '<div style="font-size:7px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent);margin:8px 0 6px;display:flex;align-items:center;gap:6px;"><span style="font-size:10px;">📚</span> Course-Specific</div>';
        courseNotes.forEach(function(m) { h += renderSingleTutorNoteHTML(m); });
      }
      if (globalNotes.length > 0) {
        h += '<div style="font-size:7px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-secondary);margin:' + (courseNotes.length > 0 ? '12' : '8') + 'px 0 6px;display:flex;align-items:center;gap:6px;"><span style="font-size:10px;">🌐</span> Global (All Courses)</div>';
        globalNotes.forEach(function(m) { h += renderSingleTutorNoteHTML(m); });
      }
      h += renderTutorNotesClearControls('global');
      return h;
    }

    function wireTutorNotesClearConfirmation(container) {
      if (!container) return;
      var clearTrigger = container.querySelector('.tn-clear-trigger');
      var clearConfirm = container.querySelector('.tn-clear-confirm');
      var clearYes = container.querySelector('.tn-clear-yes');
      var clearNo = container.querySelector('.tn-clear-no');
      if (clearTrigger && clearConfirm) {
        clearTrigger.addEventListener('click', function() {
          clearTrigger.style.display = 'none';
          clearConfirm.style.display = 'block';
          if (window.gsap) gsap.fromTo(clearConfirm, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
          try { playClick(); } catch (e0) {}
        });
      }
      if (clearNo) {
        clearNo.addEventListener('click', function() {
          clearConfirm.style.display = 'none';
          clearTrigger.style.display = '';
          try { playClick(); } catch (e1) {}
        });
      }
      if (clearYes) {
        clearYes.addEventListener('click', function() {
          var scope = clearYes.getAttribute('data-clear-scope') || '';
          if (scope === 'global') {
            clearGlobalTutorMemories();
          } else if (scope === 'course') {
            var enc = clearYes.getAttribute('data-course-enc');
            if (!enc) return;
            try {
              clearCourseTutorMemoriesForCourse(decodeURIComponent(enc));
            } catch (e2) {}
          }
          try { playClick(); } catch (e3) {}
        });
      }
    }

    function wireTutorNotesPanelToggle(host) {
      if (!host) return;
      var btn = host.querySelector('.tutor-notes-toggle');
      var panel = host.querySelector('.tutor-notes');
      if (btn && panel) {
        btn.addEventListener('click', function() {
          var open = panel.classList.toggle('open');
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }
      wireTutorNotesClearConfirmation(host);
    }

    function clearCourseTutorMemoriesForCourse(courseName) {
      if (!courseName || typeof SyncEngine === 'undefined' || !SyncEngine.get || !SyncEngine.set) return;
      var all = SyncEngine.get(NS, 'tutorMemories') || [];
      var next = all.filter(function(m) {
        if (!m) return false;
        if (m.scope === 'global') return true;
        if (m.course === courseName && (!m.scope || m.scope === 'course')) return false;
        return true;
      });
      SyncEngine.set(NS, 'tutorMemories', next);
      toast('Cleared tutor notes for this course');
      var host = el('cdTutorNotesHost');
      if (host) {
        host.innerHTML = renderCourseTutorNotesPanelHTML(courseName);
        wireTutorNotesPanelToggle(host);
      }
    }

    function clearGlobalTutorMemories() {
      if (typeof SyncEngine === 'undefined' || !SyncEngine.get || !SyncEngine.set) return;
      var all = SyncEngine.get(NS, 'tutorMemories') || [];
      var next = all.filter(function(m) { return m && m.scope !== 'global'; });
      SyncEngine.set(NS, 'tutorMemories', next);
      toast('Cleared global tutor notes');
      var body = el('globalTutorNotesBody');
      if (body) {
        body.innerHTML = renderGlobalTutorNotesOverlayHTML();
        wireTutorNotesClearConfirmation(body);
      }
    }

    function openGlobalTutorNotesOverlay() {
      var ov = el('globalTutorNotesOv');
      var body = el('globalTutorNotesBody');
      if (!ov || !body) return;
      body.innerHTML = renderGlobalTutorNotesOverlayHTML();
      wireTutorNotesClearConfirmation(body);
      ov.classList.add('show');
      ov.setAttribute('aria-hidden', 'false');
      try { playOpen(); } catch (e0) {}
    }

    function closeGlobalTutorNotesOverlay() {
      var ov = el('globalTutorNotesOv');
      if (!ov) return;
      ov.classList.remove('show');
      ov.setAttribute('aria-hidden', 'true');
      try { playClose(); } catch (e1) {}
    }

    var globalTutorNotesWired = false;
    function wireGlobalTutorNotesUI() {
      if (globalTutorNotesWired) return;
      globalTutorNotesWired = true;
      var btn = el('dashGlobalTutorNotesBtn');
      var ov = el('globalTutorNotesOv');
      var closeBtn = el('globalTutorNotesClose');
      if (btn) {
        btn.addEventListener('click', function() {
          openGlobalTutorNotesOverlay();
        });
      }
      if (closeBtn) closeBtn.addEventListener('click', closeGlobalTutorNotesOverlay);
      if (ov) {
        ov.addEventListener('click', function(e) {
          if (e.target === ov) closeGlobalTutorNotesOverlay();
        });
      }
    }

    function getFeedbackArea() {
      return document.getElementById('aiFeedbackRight') || el('aiFeedbackArea');
    }

    function getTutorUserName() {
      if (settings.userName && String(settings.userName).trim()) return String(settings.userName).trim();
      try {
        if (typeof SyncEngine !== 'undefined' && SyncEngine.get) {
          var n = SyncEngine.get('user', 'name');
          if (n) return String(n).trim();
        }
      } catch (e1) {}
      return 'there';
    }

    function selectModel(item, sess) {
      var mo = settings.modelOverride || 'adaptive';
      if (mo === 'pro') return 'pro';
      if (mo === 'flash') return 'flash';
      var proScore = 0;
      if (sess && sess.recentRatings && sess.recentRatings.length >= 4) {
        var recent = sess.recentRatings.slice(-6);
        var avg = recent.reduce(function(a, b) { return a + b; }, 0) / recent.length;
        if (avg < 1.5) proScore += 3;
        else if (avg < 2.0) proScore += 2;
        else if (avg > 3.2) proScore -= 2;
      }
      var lapses = (item.fsrs && item.fsrs.lapses) || 0;
      if (lapses >= 3) proScore += 2;
      else if (lapses >= 1) proScore += 1;
      if ((item.fsrs && item.fsrs.difficulty) > 7) proScore += 1;
      if (item.priority === 'critical') proScore += 2;
      else if (item.priority === 'high') proScore += 1;
      var tier = item._presentTier || item.tier || 'quickfire';
      if (tier === 'mock' || tier === 'distinguish') proScore += 2;
      else if (tier === 'apply' || tier === 'worked') proScore += 1;
      else if (tier === 'quickfire') proScore -= 1;
      if (sess && sess._dontKnow) proScore += 3;
      var cram = (typeof getCramState === 'function') ? getCramState(item.course) : { active: false };
      if (cram && cram.active) proScore -= 2;
      return proScore >= 3 ? 'pro' : 'flash';
    }

    function selectFeedbackMode(item, sess) {
      var fm = settings.feedbackMode || 'adaptive';
      if (fm === 'always_socratic') {
        var t0 = item._presentTier || item.tier || 'quickfire';
        if (t0 === 'quickfire') return 'insight';
        return 'socratic';
      }
      if (fm === 'always_quick') {
        var t1 = item._presentTier || item.tier || 'quickfire';
        if (t1 === 'quickfire') return 'insight';
        return 'quick';
      }
      if (fm === 'self_rate') return 'self_rate';

      var tier = item._presentTier || item.tier || 'quickfire';
      if (tier === 'quickfire') return 'insight';
      if (sess && sess._dontKnow) return 'teach';
      var retries = (sess && sess.loops && item && sess.loops[item.id]) || 0;
      if (retries >= 2) return 'quick';
      var cram = (typeof getCramState === 'function') ? getCramState(item.course) : { active: false };
      if (cram && cram.active) return 'quick';
      if (sess && sess.recentRatings && sess.recentRatings.length >= 6) {
        var avg6 = sess.recentRatings.slice(-6).reduce(function(a, b) { return a + b; }, 0) / 6;
        if (avg6 < 1.5) return 'quick';
      }
      if (item.priority === 'critical' || item.priority === 'high') return 'socratic';
      var lapses = (item.fsrs && item.fsrs.lapses) || 0;
      if (lapses >= 2) return 'socratic';
      if (tier === 'distinguish' || tier === 'mock' || tier === 'apply' || tier === 'explain' || tier === 'worked') return 'socratic';
      return 'quick';
    }

var tutorConversation = [];
    var tutorTurnCount = 0;
    var tutorMaxTurns = 3;
    var tutorCurrentMode = null;
    var tutorCurrentItem = null;
    var tutorCurrentTier = null;
    var tutorOpeningUserText = '';
    var tutorAcknowledgeDone = false;
    var tutorAcknowledgeOriginalRating = null;
    var tutorInRelearning = false;

    function addTutorMessage(role, html) {
      var msgs = document.getElementById('tutorMessages');
      if (!msgs) return;
      var div = document.createElement('div');
      div.className = 'tutor-msg from-' + role;
      var icon = role === 'tutor' ? '🧠' : '✍️';
      var label = role === 'tutor' ? 'AI Tutor' : 'You';
      div.innerHTML = '<div class="msg-label">' + icon + ' ' + esc(label) + '</div>' +
        '<div class="msg-body">' + html + '</div>';
      msgs.appendChild(div);
      if (window.gsap) {
        var fromX = role === 'tutor' ? -12 : 12;
        gsap.fromTo(div,
          { opacity: 0, x: fromX, scale: 0.97 },
          { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'back.out(1.4)' }
        );
      }
      msgs.scrollTop = msgs.scrollHeight;
    }

    function showTypingIndicator() {
      var msgs = document.getElementById('tutorMessages');
      if (!msgs) return;
      var existing = document.getElementById('tutorTyping');
      if (existing) existing.remove();
      var div = document.createElement('div');
      div.id = 'tutorTyping';
      div.className = 'tutor-typing';
      div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      if (window.gsap) {
        gsap.fromTo(div, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' });
      }
    }

    function hideTypingIndicator() {
      var tel = document.getElementById('tutorTyping');
      if (tel) tel.remove();
    }

    function updateTurnCounter() {
      var counter = document.getElementById('tutorTurnCounter');
      if (counter) {
        counter.textContent = 'Turn ' + (tutorTurnCount + 1) + ' of ' + tutorMaxTurns;
      }
    }

    function disableTutorInput() {
      var ta = document.getElementById('tutorInput');
      var btn = document.getElementById('tutorSend');
      var row = document.getElementById('tutorInputRow');
      if (ta) { ta.disabled = true; ta.style.opacity = '0.4'; }
      if (btn) btn.disabled = true;
      if (row) row.style.display = 'none';
    }

    function getRecentAvg() {
      if (!session || !session.recentRatings || session.recentRatings.length === 0) return 2.5;
      var r = session.recentRatings.slice(-6);
      return r.reduce(function(a, b) { return a + b; }, 0) / r.length;
    }

    function tutorContextForItem(tItem) {
      var ctx = {
        lapses: (tItem.fsrs && tItem.fsrs.lapses) || 0,
        sessionRetryCount: (session && session.loops && tItem && session.loops[tItem.id]) || 0,
        recentAvgRating: getRecentAvg(),
        isRelearning: !!(session && session._isRelearning),
        sessionSummary: (session && session.dialogueSummary) ? session.dialogueSummary.slice(-5) : []
      };
      if (typeof state !== 'undefined' && state) {
        ctx.learner = buildLearnerContext(tItem, state);
      }
      if (typeof state !== 'undefined' && state && state.courses && tItem && tItem.course) {
        var courseData = state.courses[tItem.course];
        if (courseData) {
          ctx.courseContext = {
            syllabusContext: courseData.syllabusContext || null,
            professorValues: courseData.professorValues || null,
            allowedMaterials: courseData.allowedMaterials || null,
            examWeight: courseData.examWeight != null ? courseData.examWeight : null,
            examDate: courseData.examDate || null,
            examType: courseData.examType || null,
            examFormat: courseData.examFormat || null
          };
        }
      }
      return ctx;
    }

    function updateTutorMemories(item, conversation, suggestedRating) {
      if (!conversation || conversation.length < 2) return;
      if (settings.feedbackMode === 'self_rate') return;
      if (typeof SyncEngine === 'undefined' || !SyncEngine.get || !SyncEngine.set) return;
      var allMem0 = SyncEngine.get(NS, 'tutorMemories') || [];
      var globalMemories = allMem0.filter(function(m) { return m && m.scope === 'global'; })
        .sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); })
        .slice(0, 6);
      var courseMemories = allMem0.filter(function(m) {
        return m && (!m.scope || m.scope === 'course') && m.course === item.course;
      }).sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); })
        .slice(0, 8);
      var mergedMemories = globalMemories.concat(courseMemories);
      var payload = {
        userName: getTutorUserName(),
        item: {
          prompt: item.prompt || '',
          modelAnswer: item.modelAnswer || '',
          course: item.course || '',
          topic: item.topic || ''
        },
        dialogue: conversation,
        suggestedRating: suggestedRating != null ? suggestedRating : 2,
        existingMemories: mergedMemories
      };
      fetch(MEMORY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetKey()
        },
        body: JSON.stringify(payload)
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (!data || data.action === null || data.action === undefined) return;
          var memories = SyncEngine.get(NS, 'tutorMemories') || [];
          if (data.action === 'create' && data.memory) {
            if (!data.memory.scope) data.memory.scope = 'course';
            data.memory.created = new Date().toISOString();
            data.memory.lastRelevant = new Date().toISOString();
            memories.push(data.memory);
          } else if (data.action === 'update' && data.memory && data.memory.id) {
            for (var i = 0; i < memories.length; i++) {
              if (memories[i].id === data.memory.id) {
                memories[i].content = data.memory.content || memories[i].content;
                memories[i].confidence = data.memory.confidence != null ? data.memory.confidence : memories[i].confidence;
                memories[i].relatedTopics = data.memory.relatedTopics || memories[i].relatedTopics;
                if (data.memory.scope) memories[i].scope = data.memory.scope;
                if (data.memory.course != null) memories[i].course = data.memory.course;
                memories[i].lastRelevant = new Date().toISOString();
                break;
              }
            }
          }
          if (memories.length > 50) {
            memories.sort(function(a, b) {
              return (b.confidence || 0) - (a.confidence || 0);
            });
            memories = memories.slice(0, 50);
          }
          SyncEngine.set(NS, 'tutorMemories', memories);
        })
        .catch(function() { /* silent — memories are supplementary */ });
    }

    function queueTutorMemoryUpdateIfEligible(item, convSnapshot, suggestedRating) {
      if (!item || tutorInRelearning) return;
      if (!convSnapshot || convSnapshot.length < 2) return;
      if (settings.feedbackMode === 'self_rate') return;
      var tm = tutorCurrentMode;
      if (tm !== 'socratic' && tm !== 'teach' && tm !== 'acknowledge') return;
      var r = suggestedRating != null ? suggestedRating : session.aiRating;
      // Only extract memories from multi-turn dialogues (2+ student turns).
      var studentTurns = convSnapshot.filter(function(t) { return t && t.role === 'user'; }).length;
      if (studentTurns >= 2) {
        updateTutorMemories(item, convSnapshot.slice(), r != null ? r : 2);
      }
    }

    function getLastUserTextForTutor() {
      for (var i = tutorConversation.length - 1; i >= 0; i--) {
        if (tutorConversation[i].role === 'user') return tutorConversation[i].text || '';
      }
      return tutorOpeningUserText || '';
    }

    function handleAcknowledgeFollowupResponse(ackData) {
      if (!ackData) {
        showRatingButtons(tutorAcknowledgeOriginalRating);
        return;
      }
      var ack = ackData.acknowledgment || '';
      var ext = ackData.extensionQuestion || '';
      var alreadyIncludedAck = ext && ack.trim().endsWith(ext.trim());
      var fullT = ack + (!alreadyIncludedAck && ext ? '\n\n' + ext : '');
      if (ackData && ackData.reconstructionPrompt) {
        fullT += (fullT ? '\n\n' : '') + ackData.reconstructionPrompt;
        noteReconstructionPromptShown();
      }
      tutorConversation.push({ role: 'tutor', text: fullT });
      var htmlA = '<div>' + esc(ack) + '</div>';
      if (ext && !alreadyIncludedAck) htmlA += '<div class="msg-question">' + esc(ext) + '</div>';
      if (ackData && ackData.reconstructionPrompt) {
        htmlA += '<div class="msg-question">' + esc(ackData.reconstructionPrompt) + '</div>';
      }
      addTutorMessage('tutor', htmlA);
      if (ackData && ackData.suggestedRating != null && ackData.suggestedRating !== '') {
        session.aiRating = ackData.suggestedRating;
      }
      tutorTurnCount++;
      updateTurnCounter();
      if ((ackData && ackData.isComplete) || tutorTurnCount >= tutorMaxTurns) {
        disableTutorInput();
        var srA = (ackData && ackData.suggestedRating != null) ? ackData.suggestedRating : tutorAcknowledgeOriginalRating;
        showRatingButtons(srA != null ? srA : null);
        queueTutorMemoryUpdateIfEligible(tutorCurrentItem, tutorConversation, srA != null ? srA : tutorAcknowledgeOriginalRating);
        try { playClick(); } catch (ea) {}
        return;
      }
      var taA = document.getElementById('tutorInput');
      var btnA = document.getElementById('tutorSend');
      if (taA) { taA.disabled = false; taA.style.opacity = '1'; taA.focus(); }
      if (btnA) btnA.disabled = false;
      try { playClick(); } catch (eb) {}
    }

    function finishRelearningRequeue(it, nowTs) {
      nowTs = nowTs || Date.now();
      hideTypingIndicator();
      disableTutorInput();
      studyIndicator.classList.remove('show');
      disableRatings(false);
      if (session) session._isRelearning = false;
      tutorInRelearning = false;
      tutorMaxTurns = 3;
      tutorCurrentMode = null;

      var fbDone = getFeedbackArea();
      if (fbDone) fbDone.innerHTML = '';

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
      var remainingItems = session.queue.length - (session.idx + 1);
      var minOffset = Math.max(5, Math.floor(remainingItems * 0.4));
      var insertPos = Math.min(session.idx + 1 + minOffset, session.queue.length);
      session.queue.splice(insertPos, 0, it);
      advanceItem();
    }

    function beginPassiveRestudyFlow(it, nowTs) {
      var restudyDuration = calcRestudyDuration(it.modelAnswer);
      var restudyBarId = 'restudyBarInline';
      var existingBar = document.getElementById(restudyBarId);
      if (existingBar) existingBar.remove();

      var barHTML = '<div id="' + restudyBarId + '" class="restudy-bar">' +
        '<span class="rb-icon">🔁</span>' +
        '<span class="rb-label">Re-encode</span>' +
        '<div class="rb-progress"><div id="rbProgressFill"></div></div>' +
        '<span class="rb-timer" id="rbTimer">' + Math.ceil(restudyDuration / 1000) + 's</span>' +
        '</div>' +
        '<div class="restudy-elaboration">Why is this the correct answer? How does it connect to what you already know?</div>';
      modelAnswerEl.insertAdjacentHTML('afterend', barHTML);

      modelAnswerEl.classList.add('restudy-active');
      modelAnswerEl.scrollTop = 0;

      if (window.gsap) {
        gsap.fromTo(modelAnswerEl,
          { borderColor: 'transparent' },
          { borderColor: 'var(--rate-again)', duration: 0.6, ease: 'power2.out' }
        );
        var barEl0 = document.getElementById(restudyBarId);
        if (barEl0) {
          gsap.fromTo(barEl0, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, delay: 0.15, ease: 'power2.out' });
        }
        var elabEl0 = barEl0 ? barEl0.nextElementSibling : null;
        if (elabEl0 && elabEl0.classList.contains('restudy-elaboration')) {
          gsap.fromTo(elabEl0, { opacity: 0 }, { opacity: 0.8, duration: 0.4, delay: 0.3, ease: 'power2.out' });
        }
      }

      studyIndicator.classList.add('show');
      try { playError(); } catch (ePr) {}
      disableRatings(true);

      var restudyStart = Date.now();
      if (restudyIntervalTimer) { clearInterval(restudyIntervalTimer); restudyIntervalTimer = null; }
      restudyIntervalTimer = setInterval(function() {
        var elapsed = Date.now() - restudyStart;
        var remaining = Math.max(0, Math.ceil((restudyDuration - elapsed) / 1000));
        var rbTimer = document.getElementById('rbTimer');
        var rbFill = document.getElementById('rbProgressFill');
        if (rbTimer) rbTimer.textContent = remaining + 's';
        if (rbFill) rbFill.style.width = Math.min(100, Math.round((elapsed / restudyDuration) * 100)) + '%';
        if (elapsed >= restudyDuration) {
          clearInterval(restudyIntervalTimer);
          restudyIntervalTimer = null;
        }
      }, 250);

      if (restudyTimeoutTimer) { clearTimeout(restudyTimeoutTimer); restudyTimeoutTimer = null; }
      restudyTimeoutTimer = setTimeout(function() {
        if (restudyIntervalTimer) { clearInterval(restudyIntervalTimer); restudyIntervalTimer = null; }

        disableRatings(false);
        studyIndicator.classList.remove('show');

        modelAnswerEl.classList.remove('restudy-active');
        if (window.gsap) {
          gsap.to(modelAnswerEl, { duration: 0.3, ease: 'power2.inOut', clearProps: 'boxShadow,borderColor' });
        }
        var oldBar = document.getElementById('restudyBarInline');
        if (oldBar) {
          var oldElab = oldBar.nextElementSibling;
          if (oldElab && oldElab.classList.contains('restudy-elaboration')) oldElab.remove();
          oldBar.remove();
        }

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

        function requeueAfterRestudy() {
          var remainingItemsB = session.queue.length - (session.idx + 1);
          var minOffsetB = Math.max(5, Math.floor(remainingItemsB * 0.4));
          var insertPosB = Math.min(session.idx + 1 + minOffsetB, session.queue.length);
          session.queue.splice(insertPosB, 0, it);
          advanceItem();
        }

        var tierRestudy = it._presentTier || it.tier || 'quickfire';
        if (tierRestudy === 'quickfire' && settings.feedbackMode !== 'self_rate') {
          runQuickFireFollowupMicro(it, requeueAfterRestudy);
        } else {
          requeueAfterRestudy();
        }
      }, restudyDuration);
    }

    function startRelearningDialogue(it, nowTs) {
      var fbR = getFeedbackArea();
      if (!fbR) {
        cleanupPreviousDialogueUI();
        beginPassiveRestudyFlow(it, nowTs);
        return;
      }
      cleanupPreviousDialogueUI();
      studyIndicator.classList.add('show');
      try { playError(); } catch (er) {}
      disableRatings(true);
      if (session) session._isRelearning = true;
      tutorInRelearning = true;
      tutorMaxTurns = 2;
      tutorTurnCount = 0;
      tutorConversation = [];
      tutorAcknowledgeDone = false;
      tutorAcknowledgeOriginalRating = null;
      tutorCurrentMode = 'socratic';
      tutorCurrentItem = it;
      tutorOpeningUserText =
        '[Session relearning] The student rated Again after feedback. Lead a very short active re-encoding pass (max 2 student turns), ' +
        'then end with isComplete true. Prefer a diagnostic question first; on the final turn include a reconstruction prompt if helpful.';
      buildTutorUI(fbR);
      updateTurnCounter();
      showTypingIndicator();
      var modelR = selectModel(it, session);
      var ctxR = tutorContextForItem(it);
      callTutor('socratic', modelR, it, tutorOpeningUserText, [], ctxR)
        .then(function(dataR) {
          hideTypingIndicator();
          if (dataR && dataR.error) {
            finishRelearningRequeue(it, nowTs);
            return;
          }
          handleTutorResponse(dataR);
        })
        .catch(function() {
          hideTypingIndicator();
          finishRelearningRequeue(it, nowTs);
        });
    }

    function appendModelAnswerCollapsible(fbArea, it) {
      var macDiv = document.createElement('div');
      macDiv.className = 'model-answer-collapsible';
      macDiv.innerHTML = '<button type="button" class="mac-toggle" aria-expanded="false"><span class="mac-arrow">▸</span> View model answer</button>' +
        '<div class="mac-content"><div class="md-content">' + renderMd(it.modelAnswer || '') + '</div></div>';
      fbArea.appendChild(macDiv);
      var btn = macDiv.querySelector('.mac-toggle');
      if (btn) {
        btn.addEventListener('click', function() {
          macDiv.classList.toggle('open');
          btn.setAttribute('aria-expanded', macDiv.classList.contains('open') ? 'true' : 'false');
          try { playClick(); } catch (e7) {}
        });
      }
    }

/* ── "Don't know" — skip grading, teaching explanation + Again default ── */
    var DONT_KNOW_PATTERNS = [
      /^\s*i\s*(don'?t|do not|dont)\s*know/i,
      /^\s*not\s*sure/i,
      /^\s*i'?m\s*not\s*sure/i,
      /^\s*no\s*idea/i,
      /^\s*(i\s*)?(have\s*)?no\s*(idea|clue)/i,
      /^\s*unsure/i,
      /^\s*i\s*am\s*not\s*sure/i,
      /^\s*idk\b/i,
      /^\s*dunno\b/i,
      /^\s*i\s*forget/i,
      /^\s*i\s*forgot/i,
      /^\s*can'?t\s*remember/i,
      /^\s*don'?t\s*remember/i,
      /^\s*(can'?t|cannot)\s*recall/i,
      /^\s*no\s*answer/i,
      /^\s*pass\s*$/i,
      /^\s*\?\s*$/i
    ];

    function isDontKnowResponse(text) {
      if (!text || !text.trim()) return false;
      var t = text.trim();
      if (t.length > 80) return false;
      return DONT_KNOW_PATTERNS.some(function(p) { return p.test(t); });
    }

    function showDontKnowExplanation(fbArea, data) {
      var h = '<div class="ai-feedback">' +
        '<div class="af-header">' +
        '<div class="af-icon">💡</div>' +
        '<div class="af-title">Why This Is The Answer</div>' +
        '</div>';
      if (data.explanation) {
        h += '<div class="af-dim-feedback" style="font-size:11px;line-height:1.65;margin-bottom:12px;">' + esc(data.explanation) + '</div>';
      } else if (data.summary) {
        h += '<div class="af-dim-feedback" style="font-size:11px;line-height:1.65;margin-bottom:12px;">' + esc(data.summary) + '</div>';
      }
      if (data.keyPoints && Array.isArray(data.keyPoints)) {
        h += '<div class="af-improvement" style="border-left-color:var(--tier-ex);">' +
          '<div class="af-improve-label" style="color:var(--tier-ex);">Key Points to Remember</div>';
        data.keyPoints.forEach(function(pt) {
          h += '<div class="af-improve-text" style="margin-bottom:6px;">• ' + esc(String(pt)) + '</div>';
        });
        h += '</div>';
      } else if (data.improvement) {
        h += '<div class="af-improvement">' +
          '<div class="af-improve-label">Focus Area</div>' +
          '<div class="af-improve-text">' + esc(data.improvement) + '</div>' +
          '</div>';
      }
      if (data.memoryHook) {
        h += '<div class="af-summary" style="margin-top:10px;">🪝 <strong>Memory hook:</strong> ' + esc(data.memoryHook) + '</div>';
      }
      h += '</div>';
      fbArea.innerHTML = h;
      if (window.gsap && fbArea.querySelector('.ai-feedback')) {
        gsap.fromTo(fbArea.querySelector('.ai-feedback'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
      }
    }

    function showDontKnowFallback(fbArea) {
      fbArea.innerHTML = '<div class="af-error">' +
        '<div class="af-error-title">Could not load explanation</div>' +
        '<div>Study the model answer above carefully. Try to identify the key reasoning chain before moving on.</div>' +
        '</div>';
      ratingsEl.style.display = 'grid';
    }

    function handleDontKnowReveal(it, revealTier) {
      session._dontKnow = true;
      if (session.tutorStats) session.tutorStats.dontKnows++;
      persistTutorAnalyticsDeltas();
      session.currentShown = true;
      clearTimers();
      try {
        el('timerBar').classList.remove('show');
        el('metaTimer').style.display = 'none';
      } catch (e2) {}

      if (el('userText')) el('userText').style.display = 'none';
      var checkBtn = el('checkBtn');
      var submitBtn = el('submitBtn');
      if (checkBtn) checkBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';
      var dkBtn = el('dontKnowBtn');
      if (dkBtn) dkBtn.style.display = 'none';
      var essayNext = el('essayNextPhase');
      if (essayNext) essayNext.style.display = 'none';
      var confPrompt = el('confidencePrompt');
      if (confPrompt) confPrompt.style.display = 'none';
      // Hide tierArea for tiers where it only contains interactive elements (textarea, buttons).
      // Keep it visible for tiers with reference content (scenario, concepts, scaffold).
      var currentTier = revealTier || it._presentTier || it.tier || 'quickfire';
      var tierHasContext =
        currentTier === 'apply' || currentTier === 'distinguish' || currentTier === 'worked';
      if (tierArea) {
        if (tierHasContext) {
          tierArea.style.opacity = '0.6';
          tierArea.style.pointerEvents = 'none';
          tierArea.querySelectorAll('.panel, textarea, button').forEach(function(el) {
            el.style.display = 'none';
          });
        } else {
          tierArea.style.display = 'none';
        }
      }

      var oldWrap = document.getElementById('revealColumnsWrap');
      if (oldWrap) oldWrap.remove();
      var oldDkWrap = document.getElementById('dkRevealWrap');
      if (oldDkWrap) oldDkWrap.remove();

      modelAnswerEl.style.display = 'none';

      var wrapHTML =
        '<div id="dkRevealWrap" class="dk-reveal-wrap">' +
          '<div class="dk-label">🤷 Let\'s work through this together</div>' +
          '<div class="dk-tutor-slot" id="dkTutorSlot"></div>' +
          '<div class="dk-consolidation" id="dkConsolidation" style="display:none;">' +
            '<div class="dk-consol-header">' +
              '<span class="col-icon">📋</span> Model Answer — consolidate what you just learned' +
            '</div>' +
            '<div class="dk-ma-body" id="dkConsolBody"></div>' +
            '<div class="dk-visual-slot" id="dkVisualSlot"></div>' +
            '<div class="dk-actions" id="dkActions"></div>' +
          '</div>' +
        '</div>';

      var revealContainer = document.createElement('div');
      revealContainer.innerHTML = wrapHTML;
      tierArea.insertAdjacentElement('afterend', revealContainer.firstChild);

      try { playClick(); } catch (e) {}

      var tutorSlot = document.getElementById('dkTutorSlot');
      if (settings.feedbackMode === 'self_rate' || !tutorSlot) {
        revealDkModelAnswer(it, revealTier);
        return;
      }

      tutorConversation = [];
      tutorTurnCount = 0;
      tutorOpeningUserText = '';
      tutorAcknowledgeDone = false;
      tutorAcknowledgeOriginalRating = null;
      tutorCurrentMode = 'teach';
      tutorCurrentItem = it;
      tutorCurrentTier = revealTier;
      session.lastTutorContext = 'teach';

      buildTutorUI(tutorSlot);
      updateTurnCounter();
      showTypingIndicator();

      if (window.gsap) {
        gsap.fromTo(tutorSlot, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }

      var skipBtn = document.getElementById('tutorSkip');
      if (skipBtn) {
        var newSkip = skipBtn.cloneNode(true);
        skipBtn.parentNode.replaceChild(newSkip, skipBtn);
        newSkip.textContent = 'Show Answer →';
        newSkip.addEventListener('click', function() {
          if (session && session.tutorStats) session.tutorStats.skipsToRating++;
          persistTutorAnalyticsDeltas();
          disableTutorInput();
          addTutorMessage('tutor', '<em>Skipped to model answer. Review it carefully below.</em>');
          revealDkModelAnswer(it, revealTier);
          try { playClick(); } catch (es) {}
        });
      }

      var dkModel = selectModel(it, session);
      var dkCtx = tutorContextForItem(it);
      callTutor('teach', dkModel, it, '', [], dkCtx)
        .then(function(data) {
          hideTypingIndicator();
          if (!data || data.error) {
            tutorSlot.innerHTML = '<div class="dk-tutor-fallback"><div class="dk-tutor-fallback-text">Could not reach the tutor.</div></div>';
            revealDkModelAnswer(it, revealTier);
            return;
          }
          handleDkTutorResponse(data, it, revealTier);
        })
        .catch(function() {
          hideTypingIndicator();
          tutorSlot.innerHTML = '<div class="dk-tutor-fallback"><div class="dk-tutor-fallback-text">Could not reach the tutor.</div></div>';
          revealDkModelAnswer(it, revealTier);
        });

      ratingsEl.style.display = 'none';
    }

    function handleDkTutorResponse(data, it, revealTier) {
      var tutorText = data.tutorMessage || data.correct || '';
      var question = data.followUpQuestion || '';
      var alreadyIncludedDk = question && tutorText.trim().endsWith(question.trim());
      var fullText = tutorText + (!alreadyIncludedDk && question ? '\n\n' + question : '');
      if (data.reconstructionPrompt) {
        fullText += (fullText ? '\n\n' : '') + data.reconstructionPrompt;
        noteReconstructionPromptShown();
      }
      tutorConversation.push({ role: 'tutor', text: fullText });

      var html = '<span class="tutor-text">' + esc(tutorText) + '</span>';
      if (question && !alreadyIncludedDk) html += '<span class="tutor-question">' + esc(question) + '</span>';
      if (data.reconstructionPrompt) html += '<span class="tutor-question">' + esc(data.reconstructionPrompt) + '</span>';
      addTutorMessage('tutor', html);

      if (data.suggestedRating != null && data.suggestedRating !== '') {
        session.aiRating = data.suggestedRating;
      }

      var terminal = data.isComplete || tutorTurnCount >= tutorMaxTurns;
      if (terminal) {
        disableTutorInput();
        queueTutorMemoryUpdateIfEligible(tutorCurrentItem, tutorConversation, data.suggestedRating);
        revealDkModelAnswer(it, revealTier);
        try { playClick(); } catch (e3) {}
      } else {
        var ta2 = document.getElementById('tutorInput');
        var btn2 = document.getElementById('tutorSend');
        if (ta2) { ta2.disabled = false; ta2.style.opacity = '1'; ta2.focus(); }
        if (btn2) btn2.disabled = false;
        overrideDkTutorSubmit(it, revealTier);
        try { playClick(); } catch (e4) {}
      }
    }

    function overrideDkTutorSubmit(it, revealTier) {
      var ta = document.getElementById('tutorInput');
      var sendBtn = document.getElementById('tutorSend');

      function dkSubmit() {
        var taNow = document.getElementById('tutorInput');
        var sendNow = document.getElementById('tutorSend');
        if (!taNow || taNow.disabled) return;
        var text = taNow.value.trim();
        if (!text) return;
        addTutorMessage('user', esc(text));
        tutorConversation.push({ role: 'user', text: text });
        tutorTurnCount++;
        updateTurnCounter();
        taNow.value = '';
        taNow.style.height = '42px';
        showTypingIndicator();
        taNow.disabled = true;
        if (sendNow) sendNow.disabled = true;
        var model = selectModel(tutorCurrentItem, session);
        callTutor('teach', model, tutorCurrentItem, text, tutorConversation, tutorContextForItem(tutorCurrentItem))
          .then(function(data) {
            hideTypingIndicator();
            if (data && data.error) {
              addTutorMessage('tutor', '⚠ ' + esc(data.error));
              revealDkModelAnswer(it, revealTier);
              return;
            }
            handleDkTutorResponse(data, it, revealTier);
          })
          .catch(function() {
            hideTypingIndicator();
            addTutorMessage('tutor', '⚠ Could not reach the tutor.');
            revealDkModelAnswer(it, revealTier);
          });
      }

      if (sendBtn) {
        var newSend = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSend, sendBtn);
        newSend.addEventListener('click', dkSubmit);
      }
      if (ta) {
        var newTa = ta.cloneNode(true);
        ta.parentNode.replaceChild(newTa, ta);
        newTa.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = Math.min(120, Math.max(42, this.scrollHeight)) + 'px';
        });
        newTa.addEventListener('keydown', function(e) {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            dkSubmit();
          }
        });
        newTa.disabled = false;
        newTa.style.opacity = '1';
        newTa.focus();
      }
    }

    function revealDkModelAnswer(it, revealTier) {
      var consolWrap = document.getElementById('dkConsolidation');
      var consolBody = document.getElementById('dkConsolBody');
      var dkActions = document.getElementById('dkActions');
      var dkVisualSlot = document.getElementById('dkVisualSlot');
      if (!consolWrap || !consolBody) return;

      consolBody.innerHTML = renderMd(it.modelAnswer || '');
      consolWrap.style.display = 'block';

      if (window.gsap) {
        gsap.fromTo(consolWrap, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
      }
      consolWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      if (dkActions) {
        dkActions.innerHTML =
          '<button type="button" class="ghost-btn dk-listen-btn" id="dkListenBtn">🔊 Listen</button>';
        var listenBtn = document.getElementById('dkListenBtn');
        if (listenBtn) {
          if (window.gsap) {
            gsap.fromTo(listenBtn, { opacity: 0 }, { opacity: 1, duration: 0.25, delay: 0.2, ease: 'power2.out' });
          }
          listenBtn.addEventListener('click', function() {
            var text = it.modelAnswer || '';
            listenBtn.innerHTML = '⏹ Stop';
            listenBtn.classList.add('dk-listen-active');
            playTTS(text).then(function() {
              listenBtn.innerHTML = '🔊 Listen';
              listenBtn.classList.remove('dk-listen-active');
            });
          });
        }
      }

      if (it.visual && dkVisualSlot) {
        dkVisualSlot.innerHTML = renderMermaidBlock(it.visual, 'answer', it.id);
        setTimeout(initMermaidBlocks, 50);
        if (window.gsap) {
          gsap.fromTo(dkVisualSlot, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, delay: 0.3, ease: 'power2.out' });
        }
      } else {
        ensureAnswerVisual(it, revealTier);
        var visualCheck = setInterval(function() {
          if (it.visual && dkVisualSlot && !dkVisualSlot.hasChildNodes()) {
            clearInterval(visualCheck);
            dkVisualSlot.innerHTML = renderMermaidBlock(it.visual, 'answer', it.id);
            setTimeout(initMermaidBlocks, 50);
            if (window.gsap) {
              gsap.fromTo(dkVisualSlot, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
            }
          }
        }, 500);
        setTimeout(function() { clearInterval(visualCheck); }, 15000);
      }

      session.aiRating = session.aiRating || 1;
      ratingsEl.style.display = 'grid';
      if (window.gsap) {
        gsap.fromTo(ratingsEl, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, delay: 0.3, ease: 'power2.out' });
      }
      ratingsEl.querySelectorAll('button').forEach(function(b) {
        var r = parseInt(b.getAttribute('data-rate'), 10);
        if (r === 1) {
          b.style.outline = '2px solid var(--rate-again)';
          b.style.outlineOffset = '2px';
        } else {
          b.style.outline = 'none';
          b.style.outlineOffset = '0';
        }
      });
      var oldHint = document.querySelector('.override-hint');
      if (oldHint) oldHint.remove();
      var hint = document.createElement('div');
      hint.className = 'override-hint';
      hint.textContent = 'Auto-rated Again — override if you partially knew this';
      ratingsEl.parentNode.insertBefore(hint, ratingsEl.nextSibling);
      // Re-bind rating buttons to ensure clean handler
      ratingsEl.querySelectorAll('button').forEach(function(b) {
        b.onclick = function() {
          rateCurrent(parseInt(this.getAttribute('data-rate'), 10));
        };
      });
    }

    function wireGenerative(tier) {
      var ta = el('userText');
      ta.addEventListener('input', function(){ autoGrowTextarea(ta); });
      autoGrowTextarea(ta);
      el('checkBtn').addEventListener('click', function(){ revealAnswer(true); });
      var dkBtn = el('dontKnowBtn');
      if (dkBtn) {
        dkBtn.addEventListener('click', function() {
          var cur = session.queue[session.idx];
          if (!cur) return;
          var rt = cur._presentTier || cur.tier || 'quickfire';
          handleDontKnowReveal(cur, rt);
        });
      }
    }

    function wireMock() {
      var ta = el('userText');
      ta.addEventListener('input', function(){ autoGrowTextarea(ta); });
      autoGrowTextarea(ta);
      el('submitBtn').addEventListener('click', function(){ revealAnswer(true); });
      var dkBtn = el('dontKnowBtn');
      if (dkBtn) {
        dkBtn.addEventListener('click', function() {
          var cur = session.queue[session.idx];
          if (!cur) return;
          var rt = cur._presentTier || cur.tier || 'quickfire';
          handleDontKnowReveal(cur, rt);
        });
      }
    }

/* ── Inline Annotation Engine ── */
    function applyInlineAnnotations(annotations) {
      var lockedEl = document.getElementById('userResponseLocked');
      if (!lockedEl) return;
      var text = lockedEl.textContent || '';
      if (!text) return;

      /* Sort annotations by position in text (longest match first for overlap safety) */
      var validAnnos = [];
      annotations.forEach(function(a) {
        if (!a.text || !a.tag) return;
        var idx = text.toLowerCase().indexOf(a.text.toLowerCase());
        var usedFuzzy = false;
        var sub = '';
        if (idx === -1) {
          /* Fuzzy: try first 40 chars as substring */
          sub = a.text.substring(0, 40).toLowerCase();
          idx = text.toLowerCase().indexOf(sub);
          usedFuzzy = idx >= 0;
        }
        if (idx >= 0) {
          /* Find the actual matched length in original text */
          var matchLen = a.text.length;
          /* If we used fuzzy, match up to end of sentence or original length */
          if (usedFuzzy) {
            matchLen = Math.min(sub.length + 20, text.length - idx);
          }
          validAnnos.push({ idx: idx, len: matchLen, tag: a.tag, note: a.note || '' });
        }
      });

      if (!validAnnos.length) return;

      /* Sort by position descending so we can insert from end without shifting indices */
      validAnnos.sort(function(a, b) { return b.idx - a.idx; });

      /* Remove overlaps (keep the one that appears first) */
      var used = [];
      var filtered = [];
      validAnnos.reverse(); /* now ascending */
      validAnnos.forEach(function(a) {
        var overlaps = false;
        for (var i = 0; i < used.length; i++) {
          if (a.idx < used[i].end && (a.idx + a.len) > used[i].start) {
            overlaps = true; break;
          }
        }
        if (!overlaps) {
          filtered.push(a);
          used.push({ start: a.idx, end: a.idx + a.len });
        }
      });

      /* Build annotated HTML (process from end to preserve indices) */
      filtered.sort(function(a, b) { return b.idx - a.idx; });
      var result = text;
      filtered.forEach(function(a) {
        var before = result.substring(0, a.idx);
        var match = result.substring(a.idx, a.idx + a.len);
        var after = result.substring(a.idx + a.len);
        result = before +
          '<span class="anno-highlight" data-tag="' + esc(a.tag) + '" data-note="' + esc(a.note) + '">' +
          esc(match) + '</span>' +
          after;
      });

      lockedEl.innerHTML = result;

      /* Wire tooltip hover */
      var tip = document.getElementById('annoTip');
      if (!tip) return;
      lockedEl.querySelectorAll('.anno-highlight').forEach(function(el) {
        el.addEventListener('mouseenter', function() {
          var tag = this.getAttribute('data-tag') || '';
          var note = this.getAttribute('data-note') || '';
          if (!note) return;
          var tagLabels = { accurate: '✓ Accurate', partial: '◐ Partial', inaccurate: '✗ Inaccurate', missing: '✗ Missing', insight: '★ Good Insight' };
          tip.querySelector('.at-tag').textContent = tagLabels[tag] || tag;
          tip.querySelector('.at-tag').setAttribute('data-tag', tag);
          tip.querySelector('.at-note').textContent = note;
          var rect = this.getBoundingClientRect();
          tip.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
          tip.style.top = (rect.bottom + 8) + 'px';
          tip.classList.add('show');
        });
        el.addEventListener('mouseleave', function() {
          tip.classList.remove('show');
        });
      });

      /* Animate annotations in */
      if (window.gsap) {
        gsap.fromTo(lockedEl.querySelectorAll('.anno-highlight'),
          { backgroundColor: 'transparent' },
          { backgroundColor: null, duration: 0.4, stagger: 0.08, delay: 0.5, ease: 'power2.out',
            clearProps: 'backgroundColor' }
        );
      }
    }

    function showAIError(title, detail) {
      var fbArea = getFeedbackArea();
      fbArea.innerHTML = '<div class="af-error">' +
        '<div class="af-error-title">⚠ ' + esc(title) + '</div>' +
        '<div>' + esc(detail) + '</div>' +
        '<div style="margin-top:8px;font-size:9px;color:var(--text-secondary);">Rate yourself against the model answer instead.</div>' +
      '</div>';
      ratingsEl.style.display = 'grid';
    }

    function showSelfRateFallback(message) {
      var fbArea = getFeedbackArea();
      fbArea.innerHTML = '<div class="af-error">' +
        '<div style="font-size:10px;color:var(--text-secondary);">' + esc(message) + '</div>' +
      '</div>';
      ratingsEl.style.display = 'grid';
    }

    function mountQuickFireFollowup(it, data, done) {
      var oldQ = document.getElementById('qfFollowupRoot');
      if (oldQ) oldQ.remove();
      if (!ratingsEl || !ratingsEl.parentNode) {
        done();
        return;
      }
      var root = document.createElement('div');
      root.id = 'qfFollowupRoot';
      root.className = 'qf-followup';
      root.innerHTML =
        '<div class="qf-followup-q">' + esc(data.followUpQuestion) + '</div>' +
        '<div class="qf-followup-row">' +
        '<input type="text" class="qf-followup-input" placeholder="Quick answer..." autocomplete="off" />' +
        '<button type="button" class="qf-followup-send" aria-label="Submit">✓</button>' +
        '</div>';
      ratingsEl.parentNode.insertBefore(root, ratingsEl.nextSibling);
      if (window.gsap) {
        gsap.fromTo(root, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }
      var input = root.querySelector('.qf-followup-input');
      var sendB = root.querySelector('.qf-followup-send');
      var advanceTimer = null;
      var qfFinished = false;
      function finishQf() {
        if (qfFinished) return;
        qfFinished = true;
        if (advanceTimer) clearTimeout(advanceTimer);
        root.remove();
        done();
      }
      function revealFollowupAnswer() {
        var ans = (data.followUpAnswer != null && data.followUpAnswer !== '') ? String(data.followUpAnswer) : 'Nice — keep that link in mind.';
        var ansDiv = document.createElement('div');
        ansDiv.className = 'qf-followup-answer';
        ansDiv.textContent = ans;
        root.appendChild(ansDiv);
        var hint = document.createElement('div');
        hint.className = 'qf-followup-hint';
        hint.textContent = 'Tap to continue — or wait 2s';
        root.appendChild(hint);
        root.classList.add('qf-followup-done');
        if (window.gsap) {
          gsap.fromTo(ansDiv, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.5)' });
        }
        advanceTimer = setTimeout(finishQf, 2000);
        root.addEventListener('click', function() { finishQf(); }, { once: true });
      }
      function submitQf() {
        var t = input.value.trim();
        if (!t) return;
        input.disabled = true;
        sendB.disabled = true;
        try { playClick(); } catch (eq) {}
        revealFollowupAnswer();
      }
      sendB.addEventListener('click', submitQf);
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitQf();
        }
      });
      input.focus();
    }

    function mountQuickFireReRetrieval(it, data, done) {
      var oldQ = document.getElementById('qfFollowupRoot');
      if (oldQ) oldQ.remove();
      var oldRe = document.getElementById('qfReRetrievalRoot');
      if (oldRe) oldRe.remove();
      if (!ratingsEl || !ratingsEl.parentNode) {
        done();
        return;
      }

      if (modelAnswerEl) modelAnswerEl.style.display = 'none';
      var oldHintR = document.querySelector('.override-hint');
      if (oldHintR) oldHintR.remove();
      ratingsEl.style.display = 'none';

      var root = document.createElement('div');
      root.id = 'qfReRetrievalRoot';
      root.className = 'qf-re-retrieval';
      root.innerHTML =
        '<div style="margin-top:14px;padding:18px 20px;border-radius:var(--radius-lg);border:1px solid rgba(var(--accent-rgb),0.18);background:rgba(var(--accent-rgb),0.04);">' +
          '<div style="font-size:9px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px;">🔁 Re-test — try again from memory</div>' +
          '<div style="font-size:13px;line-height:1.65;color:var(--text);margin-bottom:14px;">' + esc(data.followUpQuestion) + '</div>' +
          '<div style="display:flex;gap:8px;align-items:flex-end;">' +
            '<input id="qfReRetInput" type="text" placeholder="Type your answer..." style="flex:1;padding:12px 14px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.18);background:rgba(var(--accent-rgb),0.04);color:var(--text);font-family:inherit;font-size:12px;outline:none;">' +
            '<button id="qfReRetSend" type="button" style="width:40px;height:40px;border-radius:12px;border:none;background:linear-gradient(135deg,rgba(var(--accent-rgb),1),rgba(var(--accent-rgb),0.7));color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">→</button>' +
          '</div>' +
          '<div id="qfReRetSkip" style="text-align:center;margin-top:10px;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text-tertiary);cursor:pointer;padding:6px;">Skip — show answer</div>' +
        '</div>' +
        '<div id="qfReRetReaction" style="display:none;margin-top:12px;"></div>' +
        '<div id="qfReRetConsolidation" style="display:none;margin-top:14px;padding:18px 20px;border-radius:var(--radius-lg);border:1px solid rgba(34,197,94,0.18);border-left:3px solid var(--rate-good);background:rgba(34,197,94,0.03);">' +
          '<div style="font-size:9px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--rate-good);margin-bottom:10px;display:flex;align-items:center;gap:6px;">✅ Consolidate — here\'s the full answer</div>' +
          '<div id="qfReRetModelBody" style="font-size:12px;line-height:1.65;color:var(--text);"></div>' +
        '</div>';

      ratingsEl.parentNode.insertBefore(root, ratingsEl.nextSibling);

      if (window.gsap) {
        gsap.fromTo(root, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
        var itemCard = document.querySelector('.item-card');
        if (itemCard) {
          gsap.fromTo(itemCard,
            { boxShadow: '0 0 0px rgba(239,68,68,0)' },
            { boxShadow: '0 0 32px rgba(239,68,68,0.28), 0 0 80px rgba(239,68,68,0.10)',
              borderColor: 'rgba(239,68,68,0.45)',
              duration: 0.5, ease: 'power2.out' }
          );
        }
      }
      try { playError(); } catch(eAud) {}

      var input = document.getElementById('qfReRetInput');
      var sendBtn = document.getElementById('qfReRetSend');
      var skipBtn = document.getElementById('qfReRetSkip');
      var reactionArea = document.getElementById('qfReRetReaction');
      var consolidation = document.getElementById('qfReRetConsolidation');
      var modelBody = document.getElementById('qfReRetModelBody');
      var finished = false;
      var spaceHandlerRef = null;

      function finishFlow() {
        if (finished) return;
        finished = true;
        if (spaceHandlerRef) {
          document.removeEventListener('keydown', spaceHandlerRef);
          spaceHandlerRef = null;
        }
        root.remove();
        if (modelAnswerEl) modelAnswerEl.style.display = '';
        var itemCard = document.querySelector('.item-card');
        if (itemCard && window.gsap) {
          gsap.to(itemCard, { duration: 0.3, ease: 'power2.inOut', clearProps: 'boxShadow,borderColor' });
        }
        done();
      }

      function showConsolidation() {
        if (modelBody) modelBody.innerHTML = renderMd(it.modelAnswer || '');
        if (consolidation) {
          consolidation.style.display = 'block';
          if (window.gsap) {
            gsap.fromTo(consolidation, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
          }
          consolidation.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        var contBtn = document.createElement('button');
        contBtn.type = 'button';
        contBtn.className = 'big-btn';
        contBtn.style.marginTop = '14px';
        contBtn.textContent = 'CONTINUE (SPACE)';
        contBtn.addEventListener('click', finishFlow);
        root.appendChild(contBtn);
        if (window.gsap) gsap.fromTo(contBtn, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, delay: 0.2, ease: 'power2.out' });

        if (spaceHandlerRef) {
          document.removeEventListener('keydown', spaceHandlerRef);
          spaceHandlerRef = null;
        }
        function spaceHandler(e) {
          if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
          if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            finishFlow();
          }
        }
        spaceHandlerRef = spaceHandler;
        document.addEventListener('keydown', spaceHandler);
      }

      function submitResponse() {
        if (!input || finished) return;
        var text = input.value.trim();
        if (!text) return;

        input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (skipBtn) skipBtn.style.display = 'none';
        try { playClick(); } catch (eSr) {}

        if (reactionArea) {
          reactionArea.style.display = 'block';
          reactionArea.innerHTML = '<div style="padding:12px 14px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.14);background:rgba(var(--accent-rgb),0.03);font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-secondary);">Checking your response...</div>';
        }

        var ctxReact = tutorContextForItem(it);
        ctxReact.quickFireReRetrieval = true;
        if (data.followUpQuestion) ctxReact.quickFireFollowUpQuestion = data.followUpQuestion;
        var modelReact = selectModel(it, session);
        callTutor('quick', modelReact, it, text, [], ctxReact)
          .then(function(reactData) {
            if (!reactData || reactData.error) {
              if (reactionArea) {
                reactionArea.innerHTML =
                  '<div style="padding:14px 16px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.14);background:rgba(var(--accent-rgb),0.04);font-size:11px;line-height:1.6;color:var(--text);">' +
                    (data.followUpAnswer ? esc(data.followUpAnswer) : 'Review the model answer below.') +
                  '</div>';
              }
              showConsolidation();
              return;
            }
            var h = '<div style="padding:14px 16px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.18);background:linear-gradient(135deg,rgba(var(--accent-rgb),0.04),rgba(var(--accent-rgb),0.01));font-size:11px;line-height:1.65;color:var(--text);">';
            if (reactData.correct) h += '<div style="margin-bottom:6px;"><strong style="color:var(--rate-good);">✓</strong> ' + esc(reactData.correct) + '</div>';
            if (reactData.missing) h += '<div style="margin-bottom:6px;"><strong style="color:var(--rate-hard);">△</strong> ' + esc(reactData.missing) + '</div>';
            if (reactData.bridge) h += '<div><strong style="color:var(--accent);">↔</strong> ' + esc(reactData.bridge) + '</div>';
            if (!reactData.correct && !reactData.missing && !reactData.bridge && reactData.tutorMessage) {
              h += esc(reactData.tutorMessage);
            }
            h += '</div>';
            if (reactionArea) {
              reactionArea.innerHTML = h;
              if (window.gsap) gsap.fromTo(reactionArea, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
            }
            showConsolidation();
          })
          .catch(function() {
            if (reactionArea) {
              reactionArea.innerHTML =
                '<div style="padding:14px 16px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.14);background:rgba(var(--accent-rgb),0.04);font-size:11px;line-height:1.6;color:var(--text);">' +
                  (data.followUpAnswer ? esc(data.followUpAnswer) : 'Review the model answer below.') +
                '</div>';
            }
            showConsolidation();
          });
      }

      function skipToAnswer() {
        if (finished) return;
        if (input) input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (skipBtn) skipBtn.style.display = 'none';
        try { playClick(); } catch (eSk) {}
        showConsolidation();
      }

      if (sendBtn) sendBtn.addEventListener('click', submitResponse);
      if (skipBtn) skipBtn.addEventListener('click', skipToAnswer);
      if (input) {
        input.addEventListener('keydown', function(e) {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            submitResponse();
          }
        });
        input.focus();
      }
    }

    function runQuickFireFollowupMicro(it, done, opts) {
      opts = opts || {};
      var useReRetrieval = !!opts.reRetrieval;
      disableRatings(true);
      var ctxQ = tutorContextForItem(it);
      ctxQ.quickFireFollowUp = true;
      if (useReRetrieval) ctxQ.userRating = 1;
      var modelQ = selectModel(it, session);
      callTutor('insight', modelQ, it, '', [], ctxQ)
        .then(function(dq) {
          if (!dq || dq.error || !dq.followUpQuestion) {
            disableRatings(false);
            done();
            return;
          }
          if (useReRetrieval) {
            mountQuickFireReRetrieval(it, dq, function() {
              disableRatings(false);
              done();
            });
          } else {
            mountQuickFireFollowup(it, dq, function() {
              disableRatings(false);
              done();
            });
          }
        })
        .catch(function() {
          disableRatings(false);
          done();
        });
    }

    function cleanupPreviousDialogueUI() {
      document.querySelectorAll('.dk-reveal-wrap, .dk-tutor-slot, .dk-consolidation, .dk-label').forEach(function(el) {
        el.style.display = 'none';
      });
      document.querySelectorAll('.tutor-msg').forEach(function(msg) {
        var parent = msg.closest('.tutor-wrap');
        if (!parent) msg.style.display = 'none';
      });
      document.querySelectorAll('.dk-actions').forEach(function(el) {
        el.style.display = 'none';
      });
      document.querySelectorAll('.model-answer-collapsible').forEach(function(mac) {
        mac.classList.remove('open');
      });
      var oldBar = document.getElementById('restudyBarInline');
      if (oldBar) {
        var oldElab = oldBar.nextElementSibling;
        if (oldElab && oldElab.classList.contains('restudy-elaboration')) oldElab.remove();
        oldBar.remove();
      }
    }

    /* ── Rating + successive relearning loop ── */
    function ensureFsrs(it) {
      if (!it.fsrs) it.fsrs = { stability: 0, difficulty: 0, due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), lastReview: null, reps: 0, lapses: 0, state: 'new' };
    }

    /* ── Per-Rating Card Glow ── */
/* ── Per-Card XP Flash ── */
/* ══════════════════════════════════════
       Ask the Tutor — student-initiated Q&A
       ══════════════════════════════════════ */
    var askTutorMaxExchanges = 2;
    var askTutorExchangeCount = 0;
    var askTutorConversation = [];
    var askTutorItem = null;
    var askTutorActive = false;
    var askTutorContinueHandler = null;

    function mountAskTutor(afterRating) {
      /* Don't show if feedback mode is self_rate */
      if (settings.feedbackMode === 'self_rate') return;

      /* Remove any existing ask-tutor panel */
      var existing = document.getElementById('askTutorWrap');
      if (existing) existing.remove();

      var it = session ? session.queue[session.idx] : null;
      if (!it) return;

      askTutorItem = it;
      askTutorExchangeCount = 0;
      askTutorConversation = [];
      askTutorActive = true;

      var isCallbackMode = typeof afterRating === 'function';
      askTutorContinueHandler = isCallbackMode ? afterRating : null;
      var rating = isCallbackMode ? (session.aiRating || 0) : (afterRating || 0);
      var isStruggling = rating <= 2;
      var tc = (session && session.lastTutorContext) || {};
      var tier = tc.tier || (it._presentTier || it.tier || 'quickfire');

      /* ── Context-aware label + auto-expand logic ── */
      var label = '';
      var autoExpand = false;
      if (tier === 'quickfire') {
        label = '💬 Got a question about this card?';
        autoExpand = !!(session && session._forceAskTutorExpand);
        if (session) session._forceAskTutorExpand = false;
      } else if (tc.wasDontKnow) {
        /* Don't Know path ran — reframe as self-check */
        label = 'Want to test your understanding?';
        autoExpand = false;
      } else if (tc.hadDialogue) {
        /* Full Socratic dialogue ran (2+ turns) — softer prompt, never auto-expand */
        label = 'Still have questions?';
        autoExpand = false;
      } else if (tc.hadQuickFeedback) {
        /* Quick feedback only (1 turn, no real dialogue) — follow-up warranted */
        label = isStruggling ? 'Need more clarity? Ask the tutor' : 'Want to explore this further?';
        autoExpand = isStruggling;
      } else {
        /* No AI ran at all (edge case / fallback) */
        label = isStruggling ? 'Something unclear? Ask the tutor' : 'Explore further';
        autoExpand = isStruggling;
      }

      var wrap = document.createElement('div');
      wrap.id = 'askTutorWrap';
      wrap.className = 'ask-tutor-wrap' + (autoExpand ? ' open' : '');
      wrap.innerHTML =
        '<button class="ask-tutor-toggle" id="askTutorToggle" type="button">' +
          '<span class="at-icon">💬</span>' +
          '<span>Ask the Tutor</span>' +
          '<span class="at-arrow">▶</span>' +
        '</button>' +
        '<div class="ask-tutor-body" id="askTutorBody">' +
          '<div class="ask-tutor-panel">' +
            '<div class="ask-tutor-label">' + esc(label) + '</div>' +
            '<div class="ask-tutor-input-row">' +
              '<textarea class="ask-tutor-ta" id="askTutorInput" placeholder="Ask anything about this card…" rows="2" autocomplete="off"></textarea>' +
              '<button type="button" class="ask-tutor-send" id="askTutorSend" aria-label="Send">→</button>' +
            '</div>' +
            '<button type="button" class="ask-tutor-dk" id="askTutorDk">🤷 Skip — move on</button>' +
            '<div class="ask-tutor-messages" id="askTutorMessages"></div>' +
            '<div class="ask-tutor-footer" id="askTutorFooter" style="display:none;">' +
              '<span class="at-exchanges" id="askTutorCount">0 of ' + askTutorMaxExchanges + ' exchanges</span>' +
              '<button type="button" class="ghost-btn ask-tutor-continue" id="askTutorContinue">Continue (Space)</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      /* Insert after ratings */
      if (ratingsEl && ratingsEl.parentNode) {
        var hintEl = ratingsEl.parentNode.querySelector('.override-hint');
        var insertAfter = hintEl || ratingsEl;

        var nextCardBtn = document.createElement('button');
        nextCardBtn.type = 'button';
        nextCardBtn.id = 'askTutorNextCard';
        nextCardBtn.className = 'big-btn';
        nextCardBtn.style.marginTop = '14px';
        nextCardBtn.textContent = 'NEXT CARD →';
        nextCardBtn.addEventListener('click', function() {
          var cb = askTutorContinueHandler;
          cleanupAskTutor();
          if (typeof cb === 'function') cb();
          else advanceItem();
          try { playClick(); } catch(e) {}
        });
        insertAfter.insertAdjacentElement('afterend', nextCardBtn);
        nextCardBtn.insertAdjacentElement('afterend', wrap);

        if (window.gsap) {
          gsap.fromTo(nextCardBtn,
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
          );
        }
      }

      /* Wire toggle */
      var toggleBtn = document.getElementById('askTutorToggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          wrap.classList.toggle('open');
          if (wrap.classList.contains('open')) {
            var inp = document.getElementById('askTutorInput');
            if (inp) setTimeout(function() { inp.focus(); }, 100);
          }
          try { playClick(); } catch(e) {}
        });
      }

      /* Wire send */
      var sendBtn = document.getElementById('askTutorSend');
      var inputEl = document.getElementById('askTutorInput');
      if (sendBtn) sendBtn.addEventListener('click', submitAskTutor);
      if (inputEl) {
        inputEl.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = Math.min(160, Math.max(44, this.scrollHeight)) + 'px';
        });
        inputEl.addEventListener('keydown', function(e) {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitAskTutor();
          }
        });
      }

      var askDk = document.getElementById('askTutorDk');
      if (askDk) {
        askDk.addEventListener('click', function() {
          var cb = askTutorContinueHandler;
          cleanupAskTutor();
          if (typeof cb === 'function') cb();
          else advanceItem();
          try { playClick(); } catch (eAd) {}
        });
      }

      /* Wire continue button */
      var contBtn = document.getElementById('askTutorContinue');
      if (contBtn) {
        contBtn.addEventListener('click', function() {
          var cb = askTutorContinueHandler;
          cleanupAskTutor();
          if (typeof cb === 'function') cb();
          else advanceItem();
        });
      }

      /* Animate in */
      if (window.gsap) {
        gsap.fromTo(wrap, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, delay: 0.2, ease: 'power2.out' });
      }
    }

    function submitAskTutor() {
      var inputEl = document.getElementById('askTutorInput');
      var sendBtn = document.getElementById('askTutorSend');
      if (!inputEl || !askTutorItem) return;

      var question = inputEl.value.trim();
      if (!question) return;

      if (askTutorExchangeCount >= askTutorMaxExchanges) {
        toast('Max questions reached for this card');
        return;
      }

      /* Show student message */
      addAskTutorMessage('student', esc(question));
      inputEl.value = '';
      inputEl.disabled = true;
      if (sendBtn) sendBtn.disabled = true;

      /* Add to conversation */
      askTutorConversation.push({ role: 'user', text: question });

      /* Show typing indicator */
      var msgsEl = document.getElementById('askTutorMessages');
      var typingDiv = document.createElement('div');
      typingDiv.className = 'tutor-typing';
      typingDiv.id = 'askTutorTyping';
      typingDiv.innerHTML = 'Thinking...';
      if (msgsEl) msgsEl.appendChild(typingDiv);

      /* Call tutor */
      var ctx = tutorContextForItem(askTutorItem);
      var model = selectModel(askTutorItem, session);
      callTutor('freeform', model, askTutorItem, question, askTutorConversation.slice(0, -1), ctx)
        .then(function(data) {
          var typing = document.getElementById('askTutorTyping');
          if (typing) typing.remove();
          if (!data || data.error) {
            addAskTutorMessage('tutor', esc('Sorry, I couldn\'t process that. Try rephrasing or move on to the next card.'));
            enableAskTutorInput();
            return;
          }

          askTutorExchangeCount++;
          var msg = data.tutorMessage || '';
          var followUp = data.followUpQuestion || '';
          var alreadyIncludedAt = followUp && msg.trim().endsWith(followUp.trim());
          askTutorConversation.push({
            role: 'tutor',
            text: msg + (!alreadyIncludedAt && followUp ? '\n\n' + followUp : '')
          });

          var html = esc(msg);
          if (followUp && !alreadyIncludedAt) {
            html += '<div class="atm-question">' + esc(followUp) + '</div>';
          }
          addAskTutorMessage('tutor', html);

          /* Update footer */
          var footer = document.getElementById('askTutorFooter');
          var countEl = document.getElementById('askTutorCount');
          if (footer) footer.style.display = 'flex';
          if (countEl) countEl.textContent = askTutorExchangeCount + ' of ' + askTutorMaxExchanges + ' exchanges';

          /* Feed into memory system if we had a meaningful exchange */
          if (askTutorExchangeCount >= 1 && askTutorConversation.length >= 2) {
            try {
              updateTutorMemories(askTutorItem, askTutorConversation.slice(), session.aiRating || 2);
            } catch(e) {}
          }

          /* Check if done */
          var isDone = data.isComplete || askTutorExchangeCount >= askTutorMaxExchanges;
          if (isDone) {
            disableAskTutorInput();
            /* Auto-show continue button prominently */
            var contBtn = document.getElementById('askTutorContinue');
            if (contBtn && window.gsap) {
              gsap.fromTo(contBtn, { scale: 0.95, opacity: 0.5 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.5)' });
            }
          } else {
            enableAskTutorInput();
          }
        })
        .catch(function(err) {
          var typing = document.getElementById('askTutorTyping');
          if (typing) typing.remove();
          addAskTutorMessage('tutor', esc('Network error — try again or move on.'));
          enableAskTutorInput();
        });
    }

    function addAskTutorMessage(role, html) {
      var msgsEl = document.getElementById('askTutorMessages');
      if (!msgsEl) return;

      var div = document.createElement('div');
      var isStudent = role === 'student';
      div.className = 'ask-tutor-msg from-' + (isStudent ? 'student' : 'tutor');
      var icon = isStudent ? '✍️' : '🧠';
      var label = isStudent ? 'You' : 'AI Tutor';
      div.innerHTML =
        '<div class="atm-label">' + icon + ' ' + esc(label) + '</div>' +
        '<div class="atm-body">' + html + '</div>';
      msgsEl.appendChild(div);
      if (window.gsap) {
        var fromX = isStudent ? 8 : -8;
        gsap.fromTo(div, { opacity: 0, x: fromX }, { opacity: 1, x: 0, duration: 0.3, ease: 'back.out(1.3)' });
      }
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function enableAskTutorInput() {
      var inputEl = document.getElementById('askTutorInput');
      var sendBtn = document.getElementById('askTutorSend');
      if (inputEl) { inputEl.disabled = false; inputEl.style.opacity = ''; inputEl.focus(); }
      if (sendBtn) sendBtn.disabled = false;
    }

    function disableAskTutorInput() {
      var inputEl = document.getElementById('askTutorInput');
      var sendBtn = document.getElementById('askTutorSend');
      if (inputEl) { inputEl.disabled = true; inputEl.style.opacity = '0.4'; }
      if (sendBtn) sendBtn.disabled = true;
    }

    function cleanupAskTutor() {
      askTutorActive = false;
      askTutorContinueHandler = null;
      askTutorItem = null;
      askTutorConversation = [];
      askTutorExchangeCount = 0;
      var wrap = document.getElementById('askTutorWrap');
      if (wrap) wrap.remove();
      var ncBtn = document.getElementById('askTutorNextCard');
      if (ncBtn) ncBtn.remove();
    }

    function ensureShortcutHelpButton() {
      var topbarRight = document.querySelector('.topbar-right');
      if (!topbarRight || document.getElementById('shortcutHelpBtn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn';
      btn.id = 'shortcutHelpBtn';
      btn.title = 'Keyboard shortcuts';
      btn.setAttribute('aria-label', 'Keyboard shortcuts');
      btn.textContent = '?';
      btn.addEventListener('click', function() {
        toggleShortcutHelpOverlay();
        try { playClick(); } catch (e) {}
      });
      topbarRight.insertBefore(btn, topbarRight.firstChild || null);
    }

    function ensureShortcutHelpOverlay() {
      var existing = document.getElementById('shortcutHelpOv');
      if (existing) return existing;
      var overlay = document.createElement('div');
      overlay.id = 'shortcutHelpOv';
      overlay.className = 'overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" style="max-width:420px;width:min(92vw,420px);">' +
          '<div class="modal-head">' +
            '<div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--text);">Keyboard shortcuts</div>' +
            '<button type="button" class="icon-btn" id="shortcutHelpClose" aria-label="Close"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg></button>' +
          '</div>' +
          '<div class="modal-body" style="max-height:min(70vh,520px);overflow:auto;">' +
            '<div id="shortcutHelpGrid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">Space</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Reveal answer / Next card / Skip Ask Tutor</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">1</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Rate: Again</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">2</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Rate: Hard</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">3</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Rate: Good</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">4</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Rate: Easy</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">D</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Don&#39;t Know (generative tiers)</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">Esc</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Exit session / Close modal</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">?</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Show this help</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">Enter</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Submit tutor response</div></div>' +
              '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.04);"><div style="font-weight:800;font-size:10px;margin-bottom:4px;">Shift+Enter</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">New line in tutor input</div></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeShortcutHelpOverlay();
      });
      var closeBtn = document.getElementById('shortcutHelpClose');
      if (closeBtn) closeBtn.addEventListener('click', closeShortcutHelpOverlay);
      return overlay;
    }

    function openShortcutHelpOverlay() {
      var overlay = ensureShortcutHelpOverlay();
      if (!overlay) return;
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
      var grid = document.getElementById('shortcutHelpGrid');
      if (window.gsap) {
        gsap.fromTo(overlay.querySelector('.modal'), { opacity: 0, scale: 0.95, y: 8 }, { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'power2.out' });
        if (grid) {
          var cards = Array.prototype.slice.call(grid.children || []);
          if (window.innerWidth < 360) grid.style.gridTemplateColumns = '1fr';
          gsap.fromTo(cards, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.18, stagger: 0.02, ease: 'power2.out', delay: 0.04 });
        }
      }
    }

    function closeShortcutHelpOverlay() {
      var overlay = document.getElementById('shortcutHelpOv');
      if (!overlay) return;
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
    }

    function toggleShortcutHelpOverlay() {
      var overlay = ensureShortcutHelpOverlay();
      if (!overlay) return;
      if (overlay.classList.contains('show')) closeShortcutHelpOverlay();
      else openShortcutHelpOverlay();
    }

    function modalIsOpenForHotkeys() {
      return modalOv.classList.contains('show') || settingsOv.classList.contains('show') || courseOv.classList.contains('show') || el('confirmExitOv').classList.contains('show') || el('confirmDeleteCourseOv').classList.contains('show') || !!(document.getElementById('shortcutHelpOv') && document.getElementById('shortcutHelpOv').classList.contains('show'));
    }

/* ── Keyboard shortcuts ── */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        /* Close modals first */
        var hadModal = modalIsOpenForHotkeys();
        closeModals();
        el('confirmExitOv').classList.remove('show');
        el('confirmDeleteCourseOv').classList.remove('show');
        closeShortcutHelpOverlay();
        if (hadModal) return;

        /* If in session, show confirmation instead of exiting immediately */
        if (viewSession.classList.contains('active') && session) {
          el('confirmExitOv').classList.add('show');
          try { playPause(); } catch(e2) {}
          return;
        }
        return;
      }

      var inText = (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT'));
      if (e.key === '?' && !inText && !modalOv.classList.contains('show') && !settingsOv.classList.contains('show') && !courseOv.classList.contains('show')) {
        e.preventDefault();
        toggleShortcutHelpOverlay();
        return;
      }
      if (!viewSession.classList.contains('active')) return;
      if (!session) return;

      var tutorTa = document.getElementById('tutorInput');
      var tutorRow = document.getElementById('tutorInputRow');
      var tutorBlocking = tutorTa && tutorRow && tutorRow.style.display !== 'none' && !tutorTa.disabled;
      /* Also block shortcuts when typing in Ask the Tutor input */
      var askTutorInput = document.getElementById('askTutorInput');
      var askTutorBlocking = askTutorInput && !askTutorInput.disabled && document.activeElement === askTutorInput;
      var qfInsightInput = document.getElementById('qfInsightInput');
      if (document.activeElement && qfInsightInput && document.activeElement.id === 'qfInsightInput') return;
      if (askTutorBlocking) tutorBlocking = true;

      if (e.key === ' ' && !inText) {
        // Don't advance if DK tutor flow is active (waiting for tutor or user is in dialogue)
        if (document.getElementById('dkTutorSlot') && ratingsEl.style.display === 'none') {
          e.preventDefault();
          return;
        }
        if (tutorBlocking) return;
        e.preventDefault();
        if (!session.currentShown) {
          var currentTier = session.queue[session.idx] ? (session.queue[session.idx]._presentTier || session.queue[session.idx].tier || 'quickfire') : '';
          if (currentTier === 'quickfire' && !session.confidence) {
            toast('Pick a confidence level first');
          } else if (currentTier === 'mock' && essayPhase === 'outline') {
            var nextBtn = el('essayNextPhase');
            if (nextBtn) nextBtn.click();
          } else {
            revealAnswer(true);
          }
        } else {
          /* If already shown, default to Good for speed? No — require explicit rating */
        }
      }

      if (e.key >= '1' && e.key <= '4') {
        if (tutorBlocking) return;
        if (session.currentShown && ratingsEl.style.display === 'grid') {
          e.preventDefault();
          rateCurrent(parseInt(e.key, 10));
        }
      }

      /* Space after rating = skip Ask Tutor and advance */
      if (e.key === ' ' && !inText && askTutorActive) {
        e.preventDefault();
        var cb = askTutorContinueHandler;
        cleanupAskTutor();
        if (typeof cb === 'function') cb();
        else advanceItem();
      }
    });

    /* ── Buttons wiring ── */
    el('startBtn').addEventListener('click', function(){
      selectedCourse = 'All';
      selectedTopic = 'All';
      startSession();
    });
    el('backBtn').addEventListener('click', function(){
      if (viewSession.classList.contains('active') && session) {
        el('confirmExitOv').classList.add('show');
        try { playPause(); } catch(e) {}
      } else {
        showView('viewDash');
        renderDashboard();
      }
    });
    el('skipBtn').addEventListener('click', function(){ skipItem(); });
    el('skipBtn').addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skipItem(); } });
    /* ── Navigation Tabs ── */
    var activeNav = 'home';

    function switchNav(tab) {
      activeNav = tab;
      document.querySelectorAll('.nav-tab').forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-nav') === tab);
      });
      var homePanel = el('tabHome');
      var coursesPanel = el('tabCourses');
      var detail = el('courseDetail');

      if (tab === 'home') {
        homePanel.classList.add('active');
        homePanel.style.display = 'block';
        coursesPanel.classList.remove('active');
        coursesPanel.style.display = 'none';
        detail.classList.remove('active');
        detail.style.display = 'none';
      } else if (tab === 'courses') {
        homePanel.classList.remove('active');
        homePanel.style.display = 'none';
        coursesPanel.classList.add('active');
        coursesPanel.style.display = 'block';
        detail.classList.remove('active');
        detail.style.display = 'none';
        renderCourseCards();
      }

      if (window.gsap) {
        var target = (tab === 'home') ? homePanel : coursesPanel;
        gsap.fromTo(target, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      }

      try { playPresetSelect(); } catch(e) {}

      /* Hide settings gear on Courses tab — not contextually relevant there */
      var gearBtn = document.querySelector('.topbar-right .icon-btn');
      if (gearBtn) gearBtn.style.display = (tab === 'courses') ? 'none' : '';
    }

    el('navHome').addEventListener('click', function() { switchNav('home'); });
    el('navCourses').addEventListener('click', function() { switchNav('courses'); });
    /* ── Session Exit with Confirmation ── */
    el('exitSessionBtn').addEventListener('click', function() {
      if (!session) return;
      el('confirmExitOv').classList.add('show');
      try { playPause(); } catch(e) {}
    });

    el('confirmStay').addEventListener('click', function() {
      el('confirmExitOv').classList.remove('show');
      try { playResume(); } catch(e) {}
    });

    el('confirmLeave').addEventListener('click', function() {
      el('confirmExitOv').classList.remove('show');
      try { playClose(); } catch(e) {}
      if (session) {
        finalizeTutorAnalyticsSession();
      }
      if (typeof clearActiveSessionSnapshot === 'function') clearActiveSessionSnapshot();
      /* Save progress for items already reviewed */
      saveState();
      /* Reset session and return to dashboard */
      session = null;
      clearTimers();
      showView('viewDash');
      renderDashboard();
    });

    el('confirmExitOv').addEventListener('click', function(e) {
      if (e.target === el('confirmExitOv')) {
        el('confirmExitOv').classList.remove('show');
      }
    });
    if (el('confirmDeleteCourseCancel')) el('confirmDeleteCourseCancel').addEventListener('click', closeDeleteCoursePrompt);
    if (el('confirmDeleteCourseConfirm')) el('confirmDeleteCourseConfirm').addEventListener('click', confirmDeleteCoursePrompt);
    if (el('confirmDeleteCourseOv')) el('confirmDeleteCourseOv').addEventListener('click', function(e) {
      if (e.target === el('confirmDeleteCourseOv')) closeDeleteCoursePrompt();
    });
    if (el('archivedCoursesClose')) el('archivedCoursesClose').addEventListener('click', closeArchivedCoursesOverlay);
    if (el('archivedCoursesOv')) el('archivedCoursesOv').addEventListener('click', function(e) {
      if (e.target === el('archivedCoursesOv')) closeArchivedCoursesOverlay();
    });

    ratingsEl.querySelectorAll('button').forEach(function(b){
      b.addEventListener('click', function() { rateCurrent(parseInt(this.getAttribute('data-rate'), 10)); });
    });

    /* ── Modal: Add items / Import JSON ── */
    var modalForm = el('modalForm');
    var activeTab = 'add';
    var advancedOpen = false;
    var modalCourse = null; /* course name the modal is scoped to */
    var modalShowingPicker = false; /* true = showing course picker step */
    var editingItemId = null;
    var modalEditAfterSave = null;
    var importFormat = 'json';

    function closeModals() {
      closeModal();
      closeSettings();
      closeCourseModal();
      closeDeleteCoursePrompt();
      closeArchivedCoursesOverlay();
    }

    el('addBtn').addEventListener('click', function(){ openModal('add'); });
    el('importBtn').addEventListener('click', function(){ openModal('import'); });
    el('modalClose').addEventListener('click', function(){ closeModal(); });
    modalOv.addEventListener('click', function(e){ if (e.target === modalOv) closeModal(); });

    /* Modal tabs (now "modalTabs" in HTML, but keep backward compat) */
    var modalTabsEl = el('modalTabs') || el('tierTabs');
    if (modalTabsEl) {
      modalTabsEl.querySelectorAll('.tab').forEach(function(t){
        t.addEventListener('click', function(){
          activeTab = this.getAttribute('data-tab');
          renderModal();
        });
      });
    }

    function renderModal() {
      var isEditing = !!editingItemId && !!state.items[editingItemId];
      if (editingItemId && !isEditing) editingItemId = null;
      var editingItem = isEditing ? state.items[editingItemId] : null;
      var tabsRoot = el('modalTabs');
      if (tabsRoot) tabsRoot.style.display = isEditing ? 'none' : '';
      /* tabs */
      el('modalTabs') && el('modalTabs').querySelectorAll('.tab').forEach(function(t) {
        var on = t.getAttribute('data-tab') === activeTab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });

      /* Clear any pending import preview when switching tabs or reopening */
      if (activeTab !== 'import' && pendingImport) {
        pendingImport = null;
        var previewArea = document.getElementById('importPreviewArea');
        if (previewArea) previewArea.innerHTML = '';
      }

      var showAdd = (activeTab === 'add');
      el('addNextBtn').style.display = isEditing ? 'inline-flex' : (showAdd ? 'inline-flex' : 'none');
      el('addNextBtn').textContent = isEditing ? 'Cancel' : 'Add & Next';
      el('doneBtn').textContent = isEditing ? 'Save Changes' : 'Done';

      /* ── Course picker step ── */
      if (modalShowingPicker) {
        var courses = listCourses();
        var h = '<div class="section-header">Select a course</div>';
        h += '<div class="course-picker-list">';
        courses.forEach(function(c) {
          var col = c.color || '#8b5cf6';
          var itemCount = 0;
          for (var id in state.items) {
            if (!state.items.hasOwnProperty(id) || !state.items[id] || state.items[id].course !== c.name) continue;
            if (!state.items[id].archived) itemCount++;
          }
          h += '<div class="course-picker-item" data-pick-course="' + esc(c.name) + '">' +
              '<div class="cpi-dot" style="background:' + esc(col) + '"></div>' +
              '<span class="cpi-name">' + esc(c.name) + '</span>' +
              '<span class="cpi-count">' + itemCount + ' cards</span>' +
              '</div>';
        });
        h += '</div>';
        modalForm.innerHTML = h;

        /* Wire course picker clicks */
        modalForm.querySelectorAll('.course-picker-item').forEach(function(item) {
          item.addEventListener('click', function() {
            modalCourse = this.getAttribute('data-pick-course');
            modalShowingPicker = false;
            renderModal();
            try { playClick(); } catch(e) {}
          });
        });

        /* Hide action buttons during picker step */
        el('addNextBtn').style.display = 'none';
        el('doneBtn').style.display = 'none';
        return;
      }

      /* Restore done button visibility */
      el('doneBtn').style.display = 'inline-flex';

      /* ── Card creation form (scoped to modalCourse) ── */
      if (activeTab === 'add') {
        var courseCol = getCourseColor(modalCourse);
        var subDeckList = listSubDecks(modalCourse || '').map(function(sd) {
          return '<option value="' + esc(sd.name || '') + '"></option>';
        }).join('');
        var courseBadge = '<div class="modal-course-badge">' +
            '<div class="mcb-dot" style="background:' + esc(courseCol) + '"></div>' +
            '<span class="mcb-name">' + esc(modalCourse || 'Unknown') + '</span>' +
            (isEditing ? '<span class="mcb-change" style="cursor:default;opacity:0.72;">Locked</span>' : '<span class="mcb-change" onclick="modalShowingPicker=true;renderModal();">Change</span>') +
            '</div>';

        modalForm.innerHTML = courseBadge +
          '<div class="field">' +
          '<label>Topic <span style="font-weight:500;letter-spacing:0.5px;text-transform:lowercase;opacity:0.7">(optional)</span></label>' +
          '<input class="input" id="m_topic" placeholder="e.g., WTO Dispute Settlement" value="' + esc(editingItem ? (editingItem.topic || '') : '') + '">' +
          '<div class="chips topic-suggestions" id="topicSuggestions"></div>' +
          '</div>' +
          '<div class="field">' +
          '<label>Sub-deck <span style="font-weight:500;letter-spacing:0.5px;text-transform:lowercase;opacity:0.7">(optional)</span></label>' +
          '<input class="input" id="m_subDeck" list="m_subDeck_list" placeholder="Sub-deck (optional, e.g. W1)" value="' + esc(editingItem ? (editingItem.subDeck || '') : '') + '">' +
          '<datalist id="m_subDeck_list">' + subDeckList + '</datalist>' +
          '</div>' +
          '<div class="field">' +
          '  <label>Priority</label>' +
          '  <select id="m_priority" class="input">' +
          '    <option value="critical">🔴 Critical — almost certainly on exam</option>' +
          '    <option value="high">🟡 High — very likely tested</option>' +
          '    <option value="medium" selected>🟣 Medium — default</option>' +
          '    <option value="low">⚪ Low — peripheral context</option>' +
          '  </select>' +
          '</div>' +
          '<div class="field"><label>Prompt</label><textarea id="m_prompt" rows="4" placeholder="Question, cue, or concept to recall">' + esc(editingItem ? (editingItem.prompt || '') : '') + '</textarea></div>' +
          '<div class="field"><label>Model Answer</label><textarea id="m_answer" rows="4" placeholder="Ideal response to compare against">' + esc(editingItem ? (editingItem.modelAnswer || '') : '') + '</textarea></div>' +
          '<div class="adv-toggle" id="advToggle">' +
          '<span class="adv-arrow">▶</span>' +
          '<span class="adv-text">Advanced fields (scenario, concepts, timer)</span>' +
          '</div>' +
          '<div class="adv-fields" id="advFields">' +
          '<div class="field"><label>Scenario</label><textarea id="m_scenario" rows="4" placeholder="Fact pattern or context for application (enables Apply It tier)">' + esc(editingItem ? (editingItem.scenario || '') : '') + '</textarea></div>' +
          '<div class="field"><label>Task</label><input class="input" id="m_task" placeholder="Instruction for the scenario (optional)" value="' + esc(editingItem ? (editingItem.task || '') : '') + '" /></div>' +
          '<div class="course-form-row">' +
          '<div class="field"><label>Concept A</label><input class="input" id="m_conceptA" placeholder="e.g., Trade creation" value="' + esc(editingItem ? (editingItem.conceptA || '') : '') + '" /></div>' +
          '<div class="field"><label>Concept B</label><input class="input" id="m_conceptB" placeholder="e.g., Trade diversion" value="' + esc(editingItem ? (editingItem.conceptB || '') : '') + '" /></div>' +
          '</div>' +
          '<p class="help">Filling Concept A + B enables the Distinguish tier.</p>' +
          selectField('Mock time limit', 'm_time', [{v:'5',t:'5 min'},{v:'10',t:'10 min'},{v:'15',t:'15 min'},{v:'30',t:'30 min'}], String(editingItem && editingItem.timeLimitMins ? editingItem.timeLimitMins : (settings.mockDefaultMins || 10))) +
          '<p class="help">Setting a time limit enables the Mock Exam tier.</p>' +
          '</div>' +
          '<div id="tierBadgeArea"></div>' +
          (isEditing ? '<button type="button" id="modalDeleteBtn" class="ghost-btn" style="width:100%;margin-top:14px;border-color:rgba(239,68,68,0.28);color:#ef4444;background:rgba(239,68,68,0.06);">Delete Card</button>' : '');

        /* Wire advanced toggle */
        setTimeout(function() {
          var tog = el('advToggle');
          if (tog) tog.addEventListener('click', function() {
            advancedOpen = !advancedOpen;
            tog.classList.toggle('open', advancedOpen);
            el('advFields').classList.toggle('show', advancedOpen);
          });
          if (isEditing) {
            if (el('m_priority')) el('m_priority').value = editingItem && editingItem.priority ? editingItem.priority : 'medium';
            if (el('m_time')) el('m_time').value = String(editingItem && editingItem.timeLimitMins ? editingItem.timeLimitMins : (settings.mockDefaultMins || 10));
            var deleteBtn = el('modalDeleteBtn');
            if (deleteBtn) {
              deleteBtn.addEventListener('click', function() {
                if (typeof deleteEditedItem === 'function') deleteEditedItem(editingItemId);
              });
            }
          }
          if (advancedOpen || isEditing) {
            advancedOpen = true;
            tog && tog.classList.add('open');
            el('advFields') && el('advFields').classList.add('show');
          }
        }, 0);

        /* Render topic suggestions for this course */
        setTimeout(function() {
          renderTopicSuggestions('m_topic', modalCourse, 'topicSuggestions');
        }, 10);

      } else if (activeTab === 'import') {
        var courseCol2 = getCourseColor(modalCourse);
        var subDeckList2 = listSubDecks(modalCourse || '').map(function(sd) {
          return '<option value="' + esc(sd.name || '') + '"></option>';
        }).join('');
        var courseBadge2 = '<div class="modal-course-badge">' +
            '<div class="mcb-dot" style="background:' + esc(courseCol2) + '"></div>' +
            '<span class="mcb-name">' + esc(modalCourse || 'Unknown') + '</span>' +
            '<span class="mcb-change" onclick="modalShowingPicker=true;renderModal();">Change</span>' +
            '</div>';

        modalForm.innerHTML = courseBadge2 +
          '<div class="field">' +
          '<label>Sub-deck <span style="font-weight:500;letter-spacing:0.5px;text-transform:lowercase;opacity:0.7">(optional)</span></label>' +
          '<input class="input" id="m_subDeck" list="m_subDeck_list" placeholder="Sub-deck (optional, e.g. W1)">' +
          '<datalist id="m_subDeck_list">' + subDeckList2 + '</datalist>' +
          '</div>' +
          '<div class="field">' +
          '<label>Import format</label>' +
          '<div id="importFormatToggle" style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button type="button" class="chip' + (importFormat === 'json' ? ' active' : '') + '" data-import-format="json" style="border:none;cursor:pointer;">JSON</button>' +
          '<button type="button" class="chip' + (importFormat === 'qa' ? ' active' : '') + '" data-import-format="qa" style="border:none;cursor:pointer;">Q/A Text</button>' +
          '</div>' +
          '</div>' +
          '<div class="field">' +
          '<label id="m_import_label">Paste JSON array</label>' +
          '<textarea class="input" id="m_import" rows="8" style="min-height:200px;" placeholder=\'[{"prompt":"...","modelAnswer":"..."}]\'></textarea>' +
          '<p class="help" id="m_import_help">Each object needs at minimum: <b>prompt</b>, <b>modelAnswer</b>. Optional: topic, task, scenario, conceptA, conceptB, timeLimitMins. The course is set automatically to <b>' + esc(modalCourse) + '</b>.</p>' +
          '</div>';
        setTimeout(function() {
          var toggle = document.getElementById('importFormatToggle');
          if (toggle) {
            toggle.querySelectorAll('[data-import-format]').forEach(function(btn) {
              btn.addEventListener('click', function() {
                importFormat = this.getAttribute('data-import-format') || 'json';
                if (typeof updateImportModeUI === 'function') updateImportModeUI(true);
                try { playClick(); } catch (eFmt) {}
              });
            });
          }
          var importInput = el('m_import');
          if (importInput) {
            importInput.addEventListener('input', function() {
              var detected = (typeof detectImportMode === 'function') ? detectImportMode(this.value) : importFormat;
              if (detected !== importFormat) {
                importFormat = detected;
                if (typeof updateImportModeUI === 'function') updateImportModeUI(true);
              }
            });
          }
          if (typeof updateImportModeUI === 'function') updateImportModeUI(false);
        }, 0);
      }

      /* Focus first control */
      setTimeout(function() {
        var first = modalForm.querySelector('textarea, input, select');
        if (first) first.focus();
      }, 0);
    }

    function tailFields() { return ''; }
    function textField(label, id, ph) {
      return '' +
        '<div class="field">' +
          '<label>' + esc(label) + '</label>' +
          '<input class="input" id="' + esc(id) + '" placeholder="' + esc(ph) + '" />' +
        '</div>';
    }
    function areaField(label, id, ph) {
      return '' +
        '<div class="field">' +
          '<label>' + esc(label) + '</label>' +
          '<textarea id="' + esc(id) + '" rows="4" placeholder="' + esc(ph) + '"></textarea>' +
        '</div>';
    }
    function selectField(label, id, opts, defV) {
      var h = '<div class="field"><label>' + esc(label) + '</label><select id="' + esc(id) + '">';
      opts.forEach(function(o){
        h += '<option value="' + esc(o.v) + '"' + (String(o.v) === String(defV) ? ' selected' : '') + '>' + esc(o.t) + '</option>';
      });
      h += '</select></div>';
      return h;
    }

    el('addNextBtn').addEventListener('click', function(){
      if (editingItemId) { closeModal(); return; }
      addFromModal(true);
    });
    el('doneBtn').addEventListener('click', function(){ addFromModal(false); });

    /* ── Import: Parse → Preview → Commit (3-phase) ── */
    var pendingImport = null; /* { valid: [], skipped: [], duplicates: [], skipDuplicates: false } */

/* ── Import: Parse → Preview → Commit (3-phase) ── */
    function renderImportPreview() {
      if (!pendingImport) return;
      var valid = pendingImport.valid;
      var skipped = pendingImport.skipped;
      var duplicates = pendingImport.duplicates;
      var skipDups = pendingImport.skipDuplicates;

      var importable = skipDups ? valid.filter(function(v) { return !v.isDuplicate; }) : valid;
      var dupCount = duplicates.length;
      var skipCount = skipped.length;
      var importCount = importable.length;

      var tierColors = {
        quickfire: tierColour('quickfire'),
        explain: tierColour('explain'),
        apply: tierColour('apply'),
        distinguish: tierColour('distinguish'),
        mock: tierColour('mock'),
        worked: tierColour('worked')
      };

      /* Build preview table */
      var h = '<div class="import-preview">';
      h += '<div class="ip-header">';
      h += '<span class="ip-title">Preview</span>';
      h += '<span class="ip-count">' + importCount + ' item' + (importCount !== 1 ? 's' : '') + ' to import</span>';
      h += '</div>';
      h += '<div class="ip-list">';

      /* Show valid items */
      valid.forEach(function(entry) {
        var isSkippedDup = skipDups && entry.isDuplicate;
        var cls = 'ip-row';
        if (isSkippedDup) cls += ' ip-skipped ip-duplicate';
        else if (entry.isDuplicate) cls += ' ip-duplicate';

        h += '<div class="' + cls + '">';
        h += '<span class="ip-prompt">' + esc(entry.promptPreview) + '</span>';
        h += '<span class="ip-topic">' + esc(entry.topic || '—') + '</span>';
        h += '<span class="ip-tiers">';
        entry.tiers.forEach(function(t) {
          h += '<span class="ip-tier-dot" style="background:' + (tierColors[t] || 'var(--accent)') + ';" title="' + esc(tierLabel(t)) + '"></span>';
        });
        h += '</span>';
        h += '</div>';
      });

      /* Show skipped items */
      skipped.forEach(function(entry) {
        h += '<div class="ip-row ip-skipped">';
        h += '<span class="ip-prompt">Item #' + (entry.idx + 1) + ': ' + esc(entry.reason) + '</span>';
        h += '<span class="ip-topic">—</span>';
        h += '<span class="ip-tiers"></span>';
        h += '</div>';
      });

      h += '</div></div>';

      /* Summary message */
      var hasIssues = (skipCount > 0 || dupCount > 0);
      var summaryClass = hasIssues ? 'has-issues' : 'is-clean';
      var summaryText = '';

      if (!hasIssues) {
        summaryText = '✓ All ' + importCount + ' items are valid and ready to import.';
      } else {
        var parts = [];
        if (importCount > 0) parts.push(importCount + ' valid');
        if (skipCount > 0) parts.push(skipCount + ' skipped (missing required fields)');
        if (dupCount > 0) parts.push(dupCount + ' duplicate' + (dupCount !== 1 ? 's' : '') + ' detected');
        summaryText = parts.join(' · ');
      }

      h += '<div class="import-summary ' + summaryClass + '">';
      h += esc(summaryText);
      if (skipCount > 0) {
        h += '<span class="is-detail">Skipped items need at minimum: prompt + modelAnswer</span>';
      }
      if (dupCount > 0 && !skipDups) {
        h += '<span class="is-detail">Duplicates matched by identical prompt text within the same course</span>';
      }
      h += '</div>';

      /* Action buttons */
      h += '<div class="import-actions">';
      h += '<button class="import-confirm-btn" id="importConfirmBtn"' + (importCount === 0 ? ' disabled' : '') + '>';
      h += 'Import ' + importCount + ' item' + (importCount !== 1 ? 's' : '');
      h += '</button>';
      if (dupCount > 0 && !skipDups) {
        h += '<button class="import-skip-dups-btn" id="importSkipDupsBtn">Skip ' + dupCount + ' dup' + (dupCount !== 1 ? 's' : '') + '</button>';
      }
      h += '</div>';

      /* Render into modal form area (replace the textarea) */
      var previewArea = document.getElementById('importPreviewArea');
      if (!previewArea) {
        previewArea = document.createElement('div');
        previewArea.id = 'importPreviewArea';
        modalForm.appendChild(previewArea);
      }
      previewArea.innerHTML = h;

      /* Hide the textarea and original import help text */
      var ta = el('m_import');
      if (ta) ta.style.display = 'none';
      var helpEls = modalForm.querySelectorAll('.help');
      helpEls.forEach(function(he) { he.style.display = 'none'; });
      var labelEls = modalForm.querySelectorAll('.field label');
      labelEls.forEach(function(le) { le.style.display = 'none'; });

      /* Hide the modal's own Done/Add buttons — we use our own confirm button */
      el('addNextBtn').style.display = 'none';
      el('doneBtn').style.display = 'none';

      /* Wire buttons */
      var confirmBtn = document.getElementById('importConfirmBtn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
          commitImport();
        });
      }
      var skipDupsBtn = document.getElementById('importSkipDupsBtn');
      if (skipDupsBtn) {
        skipDupsBtn.addEventListener('click', function() {
          pendingImport.skipDuplicates = true;
          renderImportPreview();
          try { playClick(); } catch(e) {}
        });
      }

      /* Animate preview in */
      if (window.gsap) {
        gsap.fromTo(previewArea, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
      }
    }

    function commitImport() {
      if (!pendingImport) return;
      var valid = pendingImport.valid;
      var skipDups = pendingImport.skipDuplicates;
      var subDeck = (el('m_subDeck') ? el('m_subDeck').value : '').trim() || null;

      var toImport = skipDups ? valid.filter(function(v) { return !v.isDuplicate; }) : valid;
      var n = 0;
      var importedIds = [];
      var touchedCourses = {};

      toImport.forEach(function(entry) {
        var obj = entry.obj;
        if (!obj.id) obj.id = uid();
        if (!obj.created) obj.created = isoNow();
        if (!obj.fsrs) obj.fsrs = { stability: 0, difficulty: 0, due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), lastReview: null, reps: 0, lapses: 0, state: 'new' };
        if (!obj.variants) obj.variants = {};

        /* Normalize modelAnswer aliases */
        if (!obj.modelAnswer && obj.model_answer) obj.modelAnswer = obj.model_answer;
        if (!obj.modelAnswer && obj.answer) obj.modelAnswer = obj.answer;

        obj.course = entry.course;
        obj.subDeck = subDeck;
        obj.priority = obj.priority || 'medium';
        if (obj.course) touchedCourses[obj.course] = true;

        /* Auto-create course directly — avoid saveCourse() mid-loop which triggers
           premature saveState(), causing KV sync race conditions where courses
           sync but items don't (the premature save writes incomplete items to KV) */
        if (obj.course && !state.courses[obj.course]) {
          state.courses[obj.course] = {
            id: obj.course,
            name: obj.course,
            examType: 'mixed',
            examDate: null,
            manualMode: false,
            color: '#8b5cf6',
            created: isoNow(),
            examWeight: null,
            syllabusContext: null,
            professorValues: null,
            allowedMaterials: null,
            rawSyllabusText: null,
            examFormat: null,
            syllabusKeyTopics: [],
            prepared: false
          };
        }

        state.items[obj.id] = obj;
        importedIds.push(obj.id);
        n++;
      });

      saveState();
      if (subDeck) {
        for (var cName in touchedCourses) {
          if (!touchedCourses.hasOwnProperty(cName)) continue;
          if (!getSubDeck(cName, subDeck)) createSubDeck(cName, subDeck);
          recountSubDeck(cName, subDeck);
        }
      }
      /* Safety net: force a delayed second save to ensure KV sync completes.
         The first save fires the async KV push; this catches cases where the
         push was throttled, batched, or the tab closes before it resolves. */
      setTimeout(function() { saveState(); }, 2500);

      var dupSkipped = skipDups ? pendingImport.duplicates.length : 0;
      var skipCount = pendingImport.skipped.length;
      var msg = 'Imported ' + n;
      if (dupSkipped > 0) msg += ' · ' + dupSkipped + ' dups skipped';
      if (skipCount > 0) msg += ' · ' + skipCount + ' invalid skipped';
      msg += ' — generating visuals...';
      toast(msg);

      /* Immediately update UI so user sees imported cards */
      saveState();
      renderDashboard();

      /* If a course detail panel is open, refresh it too */
      var openDetail = document.querySelector('#courseDetail.active');
      if (openDetail) {
        var detailCourse = openDetail.getAttribute('data-course');
        if (detailCourse) openCourseDetail(detailCourse);
      }

      /* Generate visuals for imported items (async batch, non-blocking) */
      var visualQueue = importedIds.slice();
      var visualBatchSize = 3;

      function processVisualBatch() {
        if (!visualQueue.length) {
          saveState();
          toast('Visuals generated');
          renderDashboard();
          return;
        }
        var batch = visualQueue.splice(0, visualBatchSize);
        var promises = batch.map(function(itemId) {
          var item = state.items[itemId];
          if (!item) return Promise.resolve();
          return generateVisual(item).then(function(visual) {
            if (visual) {
              item.visual = visual;
              state.items[itemId] = item;
            }
          }).catch(function() {});
        });
        Promise.all(promises).then(function() {
          saveState();
          setTimeout(processVisualBatch, 500);
        });
      }
      processVisualBatch();

      if (n > 0 && modalCourse) {
        autoPrepareAfterImport(modalCourse, toImport);
      }

      /* Clean up and close */
      pendingImport = null;
      closeModal();
      renderDashboard();
    }

    /* ── Settings ── */
    var settingsTabListenersBound = false;

    function resetSettingsModalTabs() {
      var generalPanel = el('settingsTabGeneral');
      var dataPanel = el('settingsTabData');
      if (generalPanel) generalPanel.style.display = 'block';
      if (dataPanel) dataPanel.style.display = 'none';
      if (!settingsOv) return;
      settingsOv.querySelectorAll('.settings-tab').forEach(function(t) {
        var isGeneral = t.dataset.settingsTab === 'general';
        t.classList.toggle('active', isGeneral);
        t.setAttribute('aria-selected', isGeneral ? 'true' : 'false');
        t.style.background = isGeneral ? 'rgba(var(--accent-rgb),0.18)' : 'transparent';
        t.style.color = isGeneral ? 'var(--text)' : 'var(--text-secondary)';
      });
    }

    function bindSettingsTabListeners() {
      if (settingsTabListenersBound || !settingsOv) return;
      settingsOv.querySelectorAll('.settings-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          var target = tab.dataset.settingsTab;
          settingsOv.querySelectorAll('.settings-tab').forEach(function(t) {
            var isActive = t.dataset.settingsTab === target;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            t.style.background = isActive ? 'rgba(var(--accent-rgb),0.18)' : 'transparent';
            t.style.color = isActive ? 'var(--text)' : 'var(--text-secondary)';
          });
          var generalPanel = el('settingsTabGeneral');
          var dataPanel = el('settingsTabData');
          if (generalPanel) generalPanel.style.display = target === 'general' ? 'block' : 'none';
          if (dataPanel) dataPanel.style.display = target === 'data' ? 'block' : 'none';
          if (target === 'data') {
            var showArea = el('showDataArea');
            if (showArea) showArea.style.display = 'none';
            var restoreStatus = el('restoreStatus');
            if (restoreStatus) restoreStatus.textContent = '';
            var pasteText = el('pasteDataText');
            if (pasteText) pasteText.value = '';
          }
          try { playPresetSelect(); } catch(e) {}
        });
      });
      settingsTabListenersBound = true;
    }

el('gearBtn').addEventListener('click', openSettings);
    el('settingsClose').addEventListener('click', closeSettings);
    settingsOv.addEventListener('click', function(e){ if (e.target === settingsOv) closeSettings(); });

    /* ── Tooltip Positioning Engine v3 — portal to body ── */
    /* Moves tooltip to document.body so position:fixed works
       regardless of ancestor backdrop-filter / transform. */
    var activeTooltipIcon = null;
    var activeTooltipEl = null;   /* the portaled tooltip clone in <body> */
    var tooltipShowTimer = null;
    var tooltipHideTimer = null;
    var TOOLTIP_DELAY = 180;

    function positionTooltip(icon) {
      var src = icon.querySelector('.info-tooltip');
      if (!src) return;
      removePortaledTooltip();

      var tip = src.cloneNode(true);
      document.body.appendChild(tip);
      activeTooltipEl = tip;

      /* Inline-only visibility/layout so cascade cannot hide the portaled clone */
      tip.setAttribute('style',
        'position:fixed;' +
        'display:block;' +
        'opacity:0;' +
        'z-index:99999;' +
        'top:-9999px;' +
        'left:-9999px;' +
        'pointer-events:auto;' +
        'max-width:280px;' +
        'width:280px;' +
        'padding:14px 16px;' +
        'border-radius:18px;' +
        'font-size:11px;' +
        'font-weight:500;' +
        'line-height:1.6;' +
        'letter-spacing:0.12px;' +
        'text-transform:none;' +
        'white-space:normal;' +
        'word-wrap:break-word;' +
        'transition:opacity 150ms ease,transform 150ms ease;' +
        'transform:translateY(4px);'
      );

      var cs = getComputedStyle(document.documentElement);
      var cardBg = cs.getPropertyValue('--card-bg').trim() || 'rgba(30,20,50,0.95)';
      var textCol = cs.getPropertyValue('--text').trim() || '#e8e0f0';
      var accentRgb = cs.getPropertyValue('--accent-rgb').trim() || '167,139,250';
      tip.style.background = cardBg;
      tip.style.color = textCol;
      tip.style.border = '1px solid rgba(' + accentRgb + ',0.22)';
      tip.style.boxShadow = '0 18px 50px rgba(0,0,0,0.24), 0 0 0 1px rgba(' + accentRgb + ',0.08)';
      tip.style.backdropFilter = 'blur(20px) saturate(1.4)';
      tip.style.webkitBackdropFilter = 'blur(20px) saturate(1.4)';
      tip.style.background = 'linear-gradient(180deg, rgba(' + accentRgb + ',0.08), rgba(' + accentRgb + ',0.02) 18%, ' + cardBg + ' 18%)';

      var tipW = tip.offsetWidth;
      var tipH = tip.offsetHeight;

      var rect = icon.getBoundingClientRect();
      var iconCX = rect.left + rect.width / 2;
      var iconTop = rect.top;
      var iconBottom = rect.bottom;
      var vw = window.innerWidth;
      var vh = window.innerHeight;

      var gap = 10;
      var above = iconTop - gap - tipH >= 4;
      var top;
      if (above) {
        top = iconTop - gap - tipH;
      } else {
        top = iconBottom + gap;
      }

      var left = iconCX - tipW / 2;
      left = Math.max(8, Math.min(left, vw - tipW - 8));
      top = Math.max(4, Math.min(top, vh - tipH - 4));

      var arrow = tip.querySelector('.tip-arrow');
      if (arrow) {
        var arrowLeft = iconCX - left - 6;
        arrowLeft = Math.max(12, Math.min(arrowLeft, tipW - 24));
        arrow.style.left = arrowLeft + 'px';
        arrow.style.position = 'absolute';
        if (above) {
          arrow.style.bottom = '-6px';
          arrow.style.top = '';
        } else {
          arrow.style.top = '-6px';
          arrow.style.bottom = '';
        }
      }

      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
      tip.addEventListener('mouseenter', cancelTooltipHide);
      tip.addEventListener('mouseleave', function(e) {
        if (activeTooltipIcon && activeTooltipIcon.contains(e.relatedTarget)) return;
        scheduleTooltipHide();
      });

      requestAnimationFrame(function() {
        if (activeTooltipEl === tip) {
          tip.style.opacity = '1';
          tip.style.transform = 'translateY(0)';
        }
      });
    }

    function removePortaledTooltip() {
      if (activeTooltipEl && activeTooltipEl.parentNode) {
        activeTooltipEl.parentNode.removeChild(activeTooltipEl);
      }
      activeTooltipEl = null;
    }

    function hideTooltip() {
      if (!activeTooltipEl) return;
      var tip = activeTooltipEl;
      tip.style.opacity = '0';
      tip.style.transform = 'translateY(4px)';
      setTimeout(function() {
        if (activeTooltipEl === tip) {
          removePortaledTooltip();
        }
      }, 170);
    }

    function clearTooltipTimer() {
      if (tooltipShowTimer) { clearTimeout(tooltipShowTimer); tooltipShowTimer = null; }
    }

    function cancelTooltipHide() {
      if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
    }

    function scheduleTooltipHide() {
      cancelTooltipHide();
      tooltipHideTimer = setTimeout(function() {
        hideTooltip();
        activeTooltipIcon = null;
      }, 120);
    }

    /* Event delegation */
    document.addEventListener('mouseover', function(e) {
      var icon = e.target.closest('.info-icon');
      if (!icon) return;
      cancelTooltipHide();
      if (activeTooltipIcon && activeTooltipIcon !== icon) {
        clearTooltipTimer();
        hideTooltip();
      }
      activeTooltipIcon = icon;
      clearTooltipTimer();
      tooltipShowTimer = setTimeout(function() {
        positionTooltip(icon);
      }, TOOLTIP_DELAY);
    });

    document.addEventListener('mouseout', function(e) {
      var icon = e.target.closest('.info-icon');
      if (!icon) return;
      if (activeTooltipEl && activeTooltipEl.contains(e.relatedTarget)) return;
      if (!icon.contains(e.relatedTarget)) {
        clearTooltipTimer();
        scheduleTooltipHide();
      }
    });

    document.addEventListener('focusin', function(e) {
      var icon = e.target.closest('.info-icon');
      if (icon) {
        clearTooltipTimer();
        if (activeTooltipIcon && activeTooltipIcon !== icon) hideTooltip();
        activeTooltipIcon = icon;
        positionTooltip(icon);
      }
    });

    document.addEventListener('focusout', function(e) {
      var icon = e.target.closest('.info-icon');
      if (icon) {
        clearTooltipTimer();
        hideTooltip();
        activeTooltipIcon = null;
      }
    });

    /* Dismiss on Escape */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && activeTooltipIcon) {
        clearTooltipTimer();
        hideTooltip();
        activeTooltipIcon = null;
      }
    }, true);

    /* Reposition on scroll/resize */
    window.addEventListener('resize', function() {
      if (activeTooltipIcon) positionTooltip(activeTooltipIcon);
    });
    window.addEventListener('scroll', function() {
      if (activeTooltipIcon) positionTooltip(activeTooltipIcon);
    }, true);

    function renderSettings() {
      var body = el('settingsTabGeneral');
      var retPct = Math.round(settings.desiredRetention * 100);

      function infoIcon(text) {
        return '<span class="info-icon" tabindex="0" role="button" aria-label="Info">ⓘ<span class="info-tooltip">' + text + '<span class="tip-arrow"></span></span></span>';
      }

      function pillGroup(name, options, currentValue) {
        var h = '<div class="mode-toggle" data-setting="' + name + '">';
        options.forEach(function(o) {
          var isActive = String(o.value) === String(currentValue);
          h += '<button type="button" class="mode-btn' + (isActive ? ' active' : '') + '" data-val="' + esc(String(o.value)) + '">' + esc(o.label) + '</button>';
        });
        h += '</div>';
        return h;
      }

      body.innerHTML =
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Desired retention ' +
              infoIcon('Target probability of remembering a card when it comes due. Higher means more frequent reviews. 0.90 (90%) is the research-backed default. Raise to 0.93-0.95 before exams; lower to 0.85 for maintenance.') +
            '</div>' +
            '<div class="sr-desc">How likely you want to remember each card at review time.</div>' +
            '<div class="sr-value" id="s_ret_display">' + retPct + '%</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<input type="range" id="s_ret" min="0.80" max="0.95" step="0.01" value="' + settings.desiredRetention + '">' +
            '<div class="slider-labels">' +
              '<span>80% (relaxed)</span>' +
              '<span>95% (strict)</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Session size limit ' +
              infoIcon('Maximum cards per study session. Smaller sessions (10-15) maintain focus. Larger sessions (30-60) suit dedicated cram days. Cram mode auto-scales this when exams approach.') +
            '</div>' +
            '<div class="sr-desc">Max number of cards you review in one sitting.</div>' +
            '<div class="sr-value" id="s_lim_display">' + (settings.sessionLimit || 12) + ' cards</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<input type="range" id="s_lim" min="5" max="60" step="1" value="' + (settings.sessionLimit || 12) + '">' +
            '<div class="slider-labels">' +
              '<span>5 (short)</span>' +
              '<span>60 (marathon)</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Mock exam default time ' +
              infoIcon('Default countdown timer for Mock Exam tier items. Adjust based on your exam format. Individual items can override this with their own time limit.') +
            '</div>' +
            '<div class="sr-desc">Countdown duration for mock exam practice items.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            pillGroup('s_mock', [
              { value: '5', label: '5 min' },
              { value: '10', label: '10 min' },
              { value: '15', label: '15 min' },
              { value: '30', label: '30 min' }
            ], String(settings.mockDefaultMins || 10)) +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Apply timer badge ' +
              infoIcon('Shows an elapsed-time counter on Apply It tier items. Builds time-pressure awareness and exam stamina. Purely informational — does not auto-submit.') +
            '</div>' +
            '<div class="sr-desc">Display a running timer during Apply It questions.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            pillGroup('s_apply', [
              { value: '1', label: 'On' },
              { value: '0', label: 'Off' }
            ], settings.showApplyTimer ? '1' : '0') +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Audio reveal mode</div>' +
            '<div class="sr-desc">Auto: TTS on Quick Fire; generative tiers get a Listen button (avoids redundant audio + long text). Override with Visual, Audio, or Both.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            pillGroup('s_revealMode', [
              { value: 'auto', label: 'Auto ★' },
              { value: 'visual', label: 'Visual' },
              { value: 'audio', label: 'Audio' },
              { value: 'both', label: 'Both' }
            ], settings.revealMode || 'auto') +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">TTS voice</div>' +
            '<div class="sr-desc">Google Cloud voice used when audio reveal is enabled.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="tts-voice">' +
              '<option value="en-US-Studio-O"' + ((settings.ttsVoice || 'en-US-Studio-O') === 'en-US-Studio-O' ? ' selected' : '') + '>Studio O — Deep Warm Narrator ★</option>' +
              '<option value="en-US-Chirp3-HD-Charon"' + ((settings.ttsVoice || 'en-US-Studio-O') === 'en-US-Chirp3-HD-Charon' ? ' selected' : '') + '>Chirp HD — Charon (Deep, Calm)</option>' +
              '<option value="en-US-Chirp3-HD-Aoede"' + ((settings.ttsVoice || 'en-US-Studio-O') === 'en-US-Chirp3-HD-Aoede' ? ' selected' : '') + '>Chirp HD — Aoede (Expressive, Clear)</option>' +
              '<option value="en-US-Studio-Q"' + ((settings.ttsVoice || 'en-US-Studio-O') === 'en-US-Studio-Q' ? ' selected' : '') + '>Studio Q — Smooth Narrator</option>' +
              '<option value="en-US-Chirp3-HD-Puck"' + ((settings.ttsVoice || 'en-US-Studio-O') === 'en-US-Chirp3-HD-Puck' ? ' selected' : '') + '>Chirp HD — Puck (Composed)</option>' +
              '<option value="en-US-Chirp3-HD-Kore"' + ((settings.ttsVoice || 'en-US-Studio-O') === 'en-US-Chirp3-HD-Kore' ? ' selected' : '') + '>Chirp HD — Kore (Natural)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Gamification</div>' +
            '<div class="sr-desc">Clean shows streaks and learning stats. Motivated adds XP, rank progression, and the dragon companion. Off removes all game elements.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="s_gamification">' +
              '<option value="clean"' + ((settings.gamificationMode || 'clean') === 'clean' ? ' selected' : '') + '>Clean — streaks + stats only</option>' +
              '<option value="motivated"' + (settings.gamificationMode === 'motivated' ? ' selected' : '') + '>Motivated — XP, ranks, celebrations</option>' +
              '<option value="off"' + (settings.gamificationMode === 'off' ? ' selected' : '') + '>Off — minimal, no game elements</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">AI Tutor — feedback mode</div>' +
            '<div class="sr-desc">Depth of post-check dialogue: adaptive uses your performance and card type.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="s_feedbackMode">' +
              '<option value="adaptive"' + ((settings.feedbackMode || 'adaptive') === 'adaptive' ? ' selected' : '') + '>Adaptive (recommended)</option>' +
              '<option value="always_socratic"' + (settings.feedbackMode === 'always_socratic' ? ' selected' : '') + '>Always Socratic</option>' +
              '<option value="always_quick"' + (settings.feedbackMode === 'always_quick' ? ' selected' : '') + '>Always quick</option>' +
              '<option value="self_rate"' + (settings.feedbackMode === 'self_rate' ? ' selected' : '') + '>Self-rate only (no AI)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">AI Tutor — model</div>' +
            '<div class="sr-desc">Gemini model: adaptive picks Flash or Pro from context.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="s_modelOverride">' +
              '<option value="adaptive"' + ((settings.modelOverride || 'adaptive') === 'adaptive' ? ' selected' : '') + '>Adaptive (recommended)</option>' +
              '<option value="pro"' + (settings.modelOverride === 'pro' ? ' selected' : '') + '>Always Pro</option>' +
              '<option value="flash"' + (settings.modelOverride === 'flash' ? ' selected' : '') + '>Always Flash</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Your name</div>' +
            '<div class="sr-desc">Used by the tutor in prompts (optional).</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<input type="text" id="s_userName" placeholder="Your name" value="' + esc(settings.userName || (typeof SyncEngine !== 'undefined' && SyncEngine.get ? (SyncEngine.get('user', 'name') || '') : '')) + '" style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(var(--accent-rgb),0.2);background:rgba(var(--accent-rgb),0.04);color:var(--text);font-size:11px;">' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">AI Tutor voice</div>' +
            '<div class="sr-desc">Supportive mode warms tone while keeping substantive feedback (sent to the tutor API).</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="s_tutorVoice">' +
              '<option value="rigorous"' + ((settings.tutorVoice || 'rigorous') === 'rigorous' ? ' selected' : '') + '>Rigorous TA</option>' +
              '<option value="supportive"' + (settings.tutorVoice === 'supportive' ? ' selected' : '') + '>Supportive</option>' +
            '</select>' +
            '<div class="cost-estimate" id="s_costEstimate">This month: — · Estimated cost: —</div>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">FSRS Optimization <span class="info-icon" tabindex="0" aria-label="Info">ⓘ<span class="info-tooltip">Personalizes FSRS weights from your review history (heuristic tune + ts-fsrs validation). Requires at least 30 reviews in calibration history. Also runs automatically every 50 reviews.<span class="tip-arrow"></span></span></span></div>' +
            '<div class="sr-desc">Tune scheduling to your memory patterns.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<button class="ghost-btn" id="s_optimize" style="width:100%;min-width:0;">Optimize Now (' + ((state.calibration && state.calibration.history) || []).length + ' reviews)</button>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Break reminders</div>' +
            '<div class="sr-desc">Evidence-based break prompts during study sessions.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="s_breakReminders"><option value="true"' + (settings.breakReminders !== false ? ' selected' : '') + '>On (recommended)</option><option value="false"' + (settings.breakReminders === false ? ' selected' : '') + '>Off</option></select>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Break interval (minutes)</div>' +
            '<div class="sr-desc">How often time-based break notices appear.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="s_breakInterval"><option value="20"' + (settings.breakIntervalMins == 20 ? ' selected' : '') + '>20 min</option><option value="25"' + (settings.breakIntervalMins == 25 || !settings.breakIntervalMins ? ' selected' : '') + '>25 min (default)</option><option value="30"' + (settings.breakIntervalMins == 30 ? ' selected' : '') + '>30 min</option><option value="35"' + (settings.breakIntervalMins == 35 ? ' selected' : '') + '>35 min</option><option value="40"' + (settings.breakIntervalMins == 40 ? ' selected' : '') + '>40 min</option></select>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div class="sr-left">' +
            '<div class="sr-label">Performance-based breaks</div>' +
            '<div class="sr-desc">Detects fatigue from declining ratings and suggests breaks.</div>' +
          '</div>' +
          '<div class="sr-control">' +
            '<select id="s_perfBreaks"><option value="true"' + (settings.performanceBreaks !== false ? ' selected' : '') + '>On (recommended)</option><option value="false"' + (settings.performanceBreaks === false ? ' selected' : '') + '>Off</option></select>' +
          '</div>' +
        '</div>';

      body.querySelectorAll('.mode-toggle').forEach(function(group) {
        group.querySelectorAll('.mode-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            group.querySelectorAll('.mode-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            if (window.gsap) gsap.fromTo(this, { scale: 0.95 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
            try { playClick(); } catch(e) {}
          });
        });
      });

      var retSlider = el('s_ret');
      var retDisplay = el('s_ret_display');
      if (retSlider && retDisplay) {
        retSlider.addEventListener('input', function() {
          retDisplay.textContent = Math.round(parseFloat(this.value) * 100) + '%';
        });
      }
      var limSlider = el('s_lim');
      var limDisplay = el('s_lim_display');
      if (limSlider && limDisplay) {
        limSlider.addEventListener('input', function() {
          limDisplay.textContent = this.value + ' cards';
        });
      }

      if (window.gsap) {
        var rows = body.querySelectorAll('.setting-row');
        gsap.fromTo(rows, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.05, ease: 'power2.out' });
      }

      var optBtn = el('s_optimize');
      if (optBtn) {
        optBtn.addEventListener('click', function() {
          var result = optimizeFsrsParams();
          if (result) {
            toast('Parameters optimized — scheduling is now personalized');
            this.textContent = 'Optimized ✓';
            this.style.borderColor = 'rgba(34,197,94,0.3)';
            this.style.color = '#22c55e';
          } else {
            toast('Need at least 30 reviews to optimize');
            this.textContent = 'Not enough data yet';
          }
        });
      }

      var regenBtn = el('regenVisuals');
      var overrideBtn = el('regenOverrideAll');
      function setVisualJobsBusy(busy) {
        if (regenBtn) regenBtn.disabled = busy;
        if (overrideBtn) overrideBtn.disabled = busy;
      }
      if (regenBtn) {
        regenBtn.addEventListener('click', function() {
          var statusEl = el('regenStatus');
          var itemsNeedingVisuals = [];
          for (var rid in state.items) {
            if (!state.items.hasOwnProperty(rid)) continue;
            var rit = state.items[rid];
            if (rit && !rit.archived && !rit.visual && rit.prompt && rit.modelAnswer) {
              itemsNeedingVisuals.push(rit);
            }
          }
          if (itemsNeedingVisuals.length === 0) {
            if (statusEl) statusEl.textContent = 'All cards already have visuals.';
            toast('All cards already have visuals');
            return;
          }
          setVisualJobsBusy(true);
          var ok = 0;
          var total = itemsNeedingVisuals.length;
          if (statusEl) statusEl.textContent = 'Generating 0/' + total + '...';
          var queue = itemsNeedingVisuals.slice();
          var concurrency = 3;

          function runBatch() {
            if (!queue.length) {
              saveState();
              setVisualJobsBusy(false);
              if (statusEl) statusEl.textContent = 'Done — generated ' + ok + ' of ' + total + '.';
              toast('Regenerated ' + ok + ' visuals');
              return;
            }
            var batch = queue.splice(0, concurrency);
            Promise.all(batch.map(function(item) {
              return generateVisual(item).then(function(visual) {
                if (visual) {
                  item.visual = visual;
                  state.items[item.id] = item;
                  ok++;
                }
              }).catch(function() {});
            })).then(function() {
              saveState();
              if (statusEl) statusEl.textContent = 'Generating ' + ok + '/' + total + '...';
              setTimeout(runBatch, 400);
            });
          }
          runBatch();
        });
      }

      if (overrideBtn) {
        overrideBtn.addEventListener('click', function() {
          var statusEl = el('overrideStatus');
          var allItems = [];
          for (var rid in state.items) {
            if (!state.items.hasOwnProperty(rid)) continue;
            var rit = state.items[rid];
            if (rit && !rit.archived && rit.prompt && rit.modelAnswer) {
              allItems.push(rit);
            }
          }
          if (allItems.length === 0) {
            if (statusEl) statusEl.textContent = 'No cards to regenerate.';
            toast('No cards to regenerate');
            return;
          }
          allItems.forEach(function(item) {
            item.visual = null;
            state.items[item.id] = item;
          });
          saveState();

          setVisualJobsBusy(true);
          var ok = 0;
          var total = allItems.length;
          if (statusEl) statusEl.textContent = 'Overriding 0/' + total + '...';
          var queue = allItems.slice();
          var concurrency = 3;

          function runOverrideBatch() {
            if (!queue.length) {
              saveState();
              setVisualJobsBusy(false);
              if (statusEl) statusEl.textContent = 'Done — regenerated ' + ok + ' of ' + total + '.';
              toast('Override complete: ' + ok + ' visuals regenerated');
              return;
            }
            var batch = queue.splice(0, concurrency);
            Promise.all(batch.map(function(item) {
              return generateVisual(item).then(function(visual) {
                if (visual) {
                  item.visual = visual;
                  state.items[item.id] = item;
                  ok++;
                }
              }).catch(function() {});
            })).then(function() {
              saveState();
              if (statusEl) statusEl.textContent = 'Overriding ' + ok + '/' + total + '...';
              setTimeout(runOverrideBatch, 400);
            });
          }
          runOverrideBatch();
        });
      }
    }

    el('settingsSave').addEventListener('click', function(){
      var r = parseFloat(el('s_ret').value);
      var lim = parseInt(el('s_lim').value, 10);
      var mockGroup = document.querySelector('.mode-toggle[data-setting="s_mock"]');
      var mockActive = mockGroup ? mockGroup.querySelector('.mode-btn.active') : null;
      var mm = mockActive ? parseInt(mockActive.getAttribute('data-val'), 10) : 10;

      var applyGroup = document.querySelector('.mode-toggle[data-setting="s_apply"]');
      var applyActive = applyGroup ? applyGroup.querySelector('.mode-btn.active') : null;
      var at = applyActive ? applyActive.getAttribute('data-val') === '1' : true;
      var revealGroup = document.querySelector('.mode-toggle[data-setting="s_revealMode"]');
      var revealActive = revealGroup ? revealGroup.querySelector('.mode-btn.active') : null;
      var revealMode = revealActive ? revealActive.getAttribute('data-val') : 'auto';
      settings.desiredRetention = clamp(isFinite(r) ? r : 0.9, 0.80, 0.95);
      /* Sync retention target to fsrsInstance */
      if (typeof FSRS !== 'undefined' && FSRS.FSRS && FSRS.generatorParameters) {
        try {
          fsrsInstance = new FSRS.FSRS(FSRS.generatorParameters({
            w: w,
            request_retention: settings.desiredRetention,
            enable_fuzz: true
          }));
        } catch (e) {}
      }
      settings.sessionLimit = clamp(isFinite(lim) ? lim : 12, 5, 60);
      settings.mockDefaultMins = [5,10,15,30].indexOf(mm) >= 0 ? mm : 10;
      settings.showApplyTimer = !!at;
      settings.revealMode = (revealMode === 'auto' || revealMode === 'visual' || revealMode === 'audio' || revealMode === 'both') ? revealMode : 'auto';
      settings.ttsVoice = (el('tts-voice') && el('tts-voice').value) ? el('tts-voice').value : 'en-US-Studio-O';
      settings.breakReminders = (el('s_breakReminders') && el('s_breakReminders').value === 'true');
      settings.breakIntervalMins = parseInt(el('s_breakInterval') ? el('s_breakInterval').value : '25', 10);
      settings.performanceBreaks = (el('s_perfBreaks') && el('s_perfBreaks').value === 'true');
      var fmEl = el('s_feedbackMode');
      var fm = fmEl ? fmEl.value : 'adaptive';
      settings.feedbackMode = (['adaptive', 'always_socratic', 'always_quick', 'self_rate'].indexOf(fm) >= 0) ? fm : 'adaptive';
      var gamEl = el('s_gamification');
      var gam = gamEl ? gamEl.value : 'clean';
      settings.gamificationMode = (['clean', 'motivated', 'off'].indexOf(gam) >= 0) ? gam : 'clean';
      var moEl = el('s_modelOverride');
      var mo = moEl ? moEl.value : 'adaptive';
      settings.modelOverride = (['adaptive', 'pro', 'flash'].indexOf(mo) >= 0) ? mo : 'adaptive';
      var unEl = el('s_userName');
      settings.userName = unEl ? String(unEl.value || '').trim() : '';
      var tvEl = el('s_tutorVoice');
      var tv = tvEl ? tvEl.value : 'rigorous';
      settings.tutorVoice = (tv === 'supportive') ? 'supportive' : 'rigorous';
      saveState();
      closeSettings();
      renderDashboard();
      try { playPresetSelect(); } catch(e) {}
      toast('Saved');
    });

    /* ── Course Management Modal ── */
    var courseOv = el('courseOv');
    var courseModalBody = el('courseModalBody');
    var courseModalState = { mode: 'list', course: null, tab: 'details' };

    function openCourseModal(courseName, tab) {
      if (courseName && getCourse(courseName)) {
        courseModalState.mode = 'editor';
        courseModalState.course = courseName;
        courseModalState.tab = tab || 'details';
      } else {
        courseModalState.mode = 'list';
        courseModalState.course = null;
        courseModalState.tab = 'details';
      }
      renderCourseModal();
      courseOv.classList.add('show');
      courseOv.setAttribute('aria-hidden', 'false');
      var courseModalEl = courseOv ? courseOv.querySelector('.modal') : null;
      if (courseModalEl) {
        courseModalEl.style.maxWidth = isEmbedded ? '95%' : (courseModalState.mode === 'editor' ? '820px' : '520px');
      }
  try { playOpen(); } catch(e) {}
      if (window.gsap && courseModalEl) {
        gsap.fromTo(courseModalEl, { opacity: 0, scale: 0.97, y: 8 }, { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'power2.out' });
      }
    }

    function openCreateCourseFlow() {
      openCourseModal();
      setTimeout(function() {
        var addToggle = el('addCourseToggle');
        if (addToggle && !addToggle.classList.contains('open')) addToggle.click();
        var nameInput = el('nc_name');
        if (nameInput) nameInput.focus();
      }, 80);
    }
    function closeCourseModal() {
      courseOv.classList.remove('show');
      courseOv.setAttribute('aria-hidden', 'true');
  try { playClose(); } catch(e) {}
    }

    el('courseClose').addEventListener('click', closeCourseModal);
    courseOv.addEventListener('click', function(e) { if (e.target === courseOv) closeCourseModal(); });
    el('manageCourses').addEventListener('click', openCourseModal);

    function renderCourseModal() {
      if (courseModalState.mode === 'editor' && courseModalState.course) {
        renderCourseModalEditor(courseModalState.course, courseModalState.tab || 'details');
        return;
      }
      var courses = listCourses();
      var h = '';

      if (!courses.length) {
        h += '<p class="help" style="text-align:center;padding:12px 0;">No courses yet. Add one below.</p>';
      }

      courses.forEach(function(c) {
        var ck = courseKey(c.name);
        var examLabel = EXAM_TYPE_LABELS[c.examType] || c.examType;
        var objLabel = c.examDate ? (getCramState(c.name).active ? '🔥 Cram' : '📅 Exam set') : '🧠 Long-term';
        var examDate = c.examDate ? '<span class="cc-date">Exam: ' + c.examDate + '</span>' : '';
        var itemCount = 0;
        var archivedCount = 0;
        for (var id in state.items) {
          if (!state.items.hasOwnProperty(id) || !state.items[id] || state.items[id].course !== c.name) continue;
          if (state.items[id].archived) archivedCount++;
          else itemCount++;
        }

        h += '<div class="course-modal-item" id="cmi_' + ck + '">' +
          '<div class="course-list-item" id="cli_' + ck + '" style="border-left:3px solid ' + (c.color || '#8b5cf6') + ';">' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="cli-name">' + esc(c.name) + '</div>' +
            '<div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap;">' +
              '<span class="cc-exam-type">' + esc(examLabel) + '</span>' +
              '<span class="cc-exam-type">' + esc(objLabel) + '</span>' +
              '<span class="cc-exam-type">' + itemCount + ' card' + (itemCount !== 1 ? 's' : '') + (archivedCount > 0 ? ' · ' + archivedCount + ' archived' : '') + '</span>' +
              examDate +
            '</div>' +
          '</div>' +
          '<div class="cli-actions">' +
            '<button title="View cards" onclick="viewCourseDeck(\'' + esc(c.name).replace(/'/g, "\\'") + '\')">📋</button>' +
            '<button title="Edit course" onclick="openEditCourse(\'' + esc(c.name).replace(/'/g, "\\'") + '\')">✏️</button>' +
            '<button class="btn-delete" title="Delete course" onclick="startDeleteCourse(\'' + esc(c.name).replace(/'/g, "\\'") + '\')"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,4 13,4"/><path d="M6 4V2.5h4V4"/><path d="M4 4l.7 9.5a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4"/></svg></button>' +
          '</div>' +
          '</div>' +
          '<div id="editRow_' + ck + '" style="display:none;"></div>' +
          '<div id="deleteRow_' + ck + '" style="display:none;"></div>' +
          '<div id="deckRow_' + ck + '" style="display:none;"></div>' +
        '</div>';
      });

      /* Add course toggle button + collapsible form */
      h += '<button class="add-course-toggle" id="addCourseToggle" type="button">' +
        '<span class="toggle-arrow">▼</span> ＋ Add Course' +
        '</button>';

      h += '<div class="add-course-form-wrap" id="addCourseFormWrap">' +
        '<div class="add-course-form">' +
        '<div class="cm-section-title" style="margin-bottom:14px;">New Course</div>' +
        '<div class="field">' +
          '<div class="cm-field-label">Course Name</div>' +
          '<input type="text" id="nc_name" class="input" placeholder="e.g., Constitutional Law">' +
        '</div>' +
        '<div class="field">' +
          '<div class="cm-field-label">Colour</div>' +
          '<div class="color-picker" id="nc_colorPicker">';
      COURSE_COLORS.forEach(function(c, i) {
        h += '<div class="color-swatch' + (i === 0 ? ' active' : '') + '" data-color="' + c.value + '" style="background:' + c.value + '" title="' + c.name + '"></div>';
      });
      h += '</div></div>' +
        '<div class="add-course-row">' +
          '<div class="field">' +
            '<div class="cm-field-label">Exam Format</div>' +
            '<select id="nc_examType" class="input">' +
              '<option value="mc">Multiple Choice</option>' +
              '<option value="short_answer">Short Answer</option>' +
              '<option value="essay">Essay</option>' +
              '<option value="mixed" selected>Mixed</option>' +
            '</select>' +
            '<div id="nc_examTypeDesc" class="cm-field-hint"></div>' +
          '</div>' +
          '<div class="field">' +
            '<div class="cm-field-label">Exam Date (Optional)</div>' +
            '<input type="date" id="nc_examDate" class="input">' +
            '<div id="nc_examDateDesc" class="cm-field-hint">Set an exam date to let cram mode intensify reviews as the deadline gets closer.</div>' +
          '</div>' +
        '</div>' +
        '<button class="big-btn" id="courseAddBtn" type="button" style="margin-top:12px;width:100%;">Add Course</button>' +
        '</div>' +
      '</div>';

      courseModalBody.innerHTML = h;

      /* Wire add-course toggle */
      var addToggle = el('addCourseToggle');
      var addFormWrap = el('addCourseFormWrap');
      function collapseAddForm() {
        if (!addToggle || !addFormWrap) return;
        addToggle.classList.remove('open');

        var hgt = addFormWrap.scrollHeight || 0;
        addFormWrap.style.maxHeight = hgt + 'px';

        if (window.gsap) {
          gsap.to(addFormWrap, {
            opacity: 0,
            maxHeight: 0,
            marginTop: 0,
            duration: 0.25,
            ease: 'power2.inOut',
            onComplete: function() {
              addFormWrap.classList.remove('expanded');
              addFormWrap.style.maxHeight = '';
            }
          });
        } else {
          addFormWrap.classList.remove('expanded');
          addFormWrap.style.maxHeight = '';
        }
      }
      function expandAddForm() {
        if (!addToggle || !addFormWrap) return;
        addToggle.classList.add('open');
        addFormWrap.classList.add('expanded');

        var target = addFormWrap.scrollHeight || 0;
        addFormWrap.style.maxHeight = '0px';

        if (window.gsap) {
          gsap.fromTo(addFormWrap,
            { opacity: 0, maxHeight: 0, marginTop: 0, y: -6 },
            { opacity: 1, maxHeight: target, marginTop: 10, y: 0, duration: 0.3, ease: 'power2.out', onComplete: function() {
              addFormWrap.style.maxHeight = '';
            }}
          );
        } else {
          addFormWrap.style.maxHeight = '';
        }

        setTimeout(function() { var ni = el('nc_name'); if (ni) ni.focus(); }, 50);
      }
      if (addToggle && addFormWrap) {
        addToggle.addEventListener('click', function() {
          var isOpen = addFormWrap.classList.contains('expanded');
          if (isOpen) collapseAddForm();
          else expandAddForm();
          try { playClick(); } catch(e) {}
        });
      }

      var examTypeDescriptions = {
        mc: 'Emphasises Quick Fire (recall speed) and Distinguish (eliminating wrong answers). Good for exams where recognition and discrimination matter most.',
        short_answer: 'Balances Quick Fire with Explain It. Practises producing concise, accurate written answers from memory.',
        essay: 'Emphasises Apply It and Mock Exam tiers. Builds the ability to construct extended arguments under time pressure.',
        mixed: 'Balanced across all five tiers. A good default when your exam combines several question formats.'
      };

      function wireDescriptionUpdater(selectId, descId, descMap) {
        var sel = el(selectId);
        var desc = el(descId);
        if (!sel || !desc) return;
        function update() { desc.textContent = descMap[sel.value] || ''; }
        sel.addEventListener('change', update);
        update();
      }

      wireDescriptionUpdater('nc_examType', 'nc_examTypeDesc', examTypeDescriptions);

      /* Wire colour picker swatches */
      var ncColorPicker = el('nc_colorPicker');
      if (ncColorPicker) {
        ncColorPicker.querySelectorAll('.color-swatch').forEach(function(sw) {
          sw.addEventListener('click', function() {
            ncColorPicker.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
            this.classList.add('active');
            if (window.gsap) gsap.fromTo(this, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' });
            try { playClick(); } catch(e) {}
          });
        });
      }

      /* Wire Add Course submit (button is rendered dynamically) */
      var addBtn = el('courseAddBtn');
      if (addBtn) {
        addBtn.addEventListener('click', function() {
          var name = (el('nc_name').value || '').trim();
          if (!name) { toast('Enter a course name'); return; }
          if (state.courses[name]) { toast('Course already exists'); return; }
          var examType = (el('nc_examType').value || 'mixed');
          var examDate = (el('nc_examDate').value || '').trim() || null;
          var colorPicker = el('nc_colorPicker');
          var selectedColor = '#8b5cf6';
          if (colorPicker) {
            var activeSwatch = colorPicker.querySelector('.color-swatch.active');
            if (activeSwatch) selectedColor = activeSwatch.getAttribute('data-color');
          }
          saveCourse({
            name: name,
            examType: examType,
            examDate: examDate,
            color: selectedColor,
            manualMode: false,
            created: isoNow()
          });
          toast('Course added');
          renderCourseModal();
          renderDashboard();
          scheduleUiTimer(function() {
            checkForCheckIn();
          }, 120);
        });
      }
    }

    /* ── Focus mode: isolate one course in manage modal ── */
    function focusCourseModalItem(row) {
      var wrapper = row.closest('.course-modal-item');
      if (!wrapper) return;
      Array.from(courseModalBody.children).forEach(function(child) {
        if (child !== wrapper) {
          child.dataset.hiddenByFocus = '1';
          child.style.display = 'none';
        }
      });
    }
    function unfocusCourseModalItems() {
      Array.from(courseModalBody.children).forEach(function(child) {
        if (child.dataset.hiddenByFocus) {
          delete child.dataset.hiddenByFocus;
          child.style.display = '';
        }
      });
    }

    function courseModalRefreshShell() {
      var courseModalEl = courseOv ? courseOv.querySelector('.modal') : null;
      if (courseModalEl) {
        courseModalEl.style.maxWidth = isEmbedded ? '95%' : (courseModalState.mode === 'editor' ? '820px' : '520px');
      }
    }

    function getUniqueCourseTopics(courseName) {
      var topics = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived || it.course !== courseName) continue;
        var t = String(it.topic || 'General').trim() || 'General';
        topics[t] = true;
      }
      return Object.keys(topics).sort(function(a, b) { return a.localeCompare(b); });
    }

    function removeTopicFromAllModules(courseObj, topic) {
      if (!courseObj || !Array.isArray(courseObj.modules)) return;
      courseObj.modules.forEach(function(m) {
        if (!m || !Array.isArray(m.topics)) return;
        m.topics = m.topics.filter(function(t) { return t !== topic; });
      });
    }

    function assignTopicToModule(courseName, topic, moduleId) {
      var c = getCourse(courseName);
      if (!c) return;
      ensureCourseModules(courseName);
      removeTopicFromAllModules(c, topic);
      var mod = getModuleById(courseName, moduleId);
      if (!mod) return;
      if (!Array.isArray(mod.topics)) mod.topics = [];
      if (mod.topics.indexOf(topic) < 0) mod.topics.push(topic);
      saveCourse(c);
      if (!isEmbedded) renderSidebar();
    }

    function unassignTopicFromModules(courseName, topic) {
      var c = getCourse(courseName);
      if (!c) return;
      ensureCourseModules(courseName);
      removeTopicFromAllModules(c, topic);
      saveCourse(c);
      if (!isEmbedded) renderSidebar();
    }

    function renderCourseModalEditor(courseName, tab) {
      var c = getCourse(courseName);
      if (!c) {
        courseModalState.mode = 'list';
        renderCourseModal();
        return;
      }
      courseModalState.mode = 'editor';
      courseModalState.course = courseName;
      courseModalState.tab = tab || courseModalState.tab || 'details';
      courseModalRefreshShell();

      var tabs = [
        { id: 'details', label: 'Details' },
        { id: 'syllabus', label: 'Syllabus & AI' },
        { id: 'subdecks', label: 'Subdecks & Topics' },
        { id: 'notes', label: 'Tutor Notes' }
      ];
      var cards = getCardsForCourse(courseName);
      var cram = getCramState(courseName);
      var subtitle = (EXAM_TYPE_LABELS[c.examType] || c.examType) + (cram.active ? ' 🔥 Cram' : '') + ' · ' + cards.length + ' cards' + (c.examDate ? ' · Exam: ' + c.examDate : '');
      var tabNav = tabs.map(function(t) {
        var active = courseModalState.tab === t.id ? ' active' : '';
        return '<button class="nav-tab' + active + '" type="button" data-course-tab="' + t.id + '" style="font-size:' + (isEmbedded ? '8px' : '9px') + ';">' + t.label + '</button>';
      }).join('');

      var h = '';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">';
      h += '<button class="ghost-btn" id="cmBackToList" type="button" style="min-width:0;padding:6px 10px;">← Back to courses</button>';
      h += '<div style="font-size:11px;font-weight:800;letter-spacing:0.5px;">' + esc(courseName) + '</div>';
      h += '</div>';
      h += '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:10px;">' + esc(subtitle) + '</div>';
      h += '<div class="nav-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' + tabNav + '</div>';
      h += '<div id="cmTabContent"></div>';
      courseModalBody.innerHTML = h;

      function renderTabContent() {
        var activeTab = courseModalState.tab || 'details';
        var inner = '';
        if (activeTab === 'details') {
          inner += '<div class="cm-section">';
          inner += '<div class="cm-section-title">Identity</div>';
          inner += '<div class="field"><div class="cm-field-label">Course Name</div><input id="cm_name" class="input" value="' + esc(c.name) + '" /></div>';
          inner += '<div class="field" style="margin-bottom:0;"><div class="cm-field-label">Colour</div><div class="color-picker" id="cm_colorPicker">';
          COURSE_COLORS.forEach(function(cc) {
            var isAct = (c.color || '#8b5cf6') === cc.value;
            inner += '<div class="color-swatch' + (isAct ? ' active' : '') + '" data-color="' + cc.value + '" style="background:' + cc.value + '" title="' + esc(cc.name) + '"></div>';
          });
          inner += '</div></div>';
          inner += '</div>';
          inner += '<div class="cm-section">';
          inner += '<div class="cm-section-title">Exam Configuration</div>';
          inner += '<div class="cm-details-grid">';
          inner += '<div class="field"><div class="cm-field-label">Exam Format</div><select id="cm_examType" class="input">';
          inner += '<option value="mc"' + (c.examType === 'mc' ? ' selected' : '') + '>Multiple Choice</option>';
          inner += '<option value="short_answer"' + (c.examType === 'short_answer' ? ' selected' : '') + '>Short Answer</option>';
          inner += '<option value="essay"' + (c.examType === 'essay' ? ' selected' : '') + '>Essay</option>';
          inner += '<option value="mixed"' + (c.examType === 'mixed' ? ' selected' : '') + '>Mixed</option>';
          inner += '</select><div id="cm_examTypeDesc" class="cm-field-hint"></div></div>';
          inner += '<div class="field"><div class="cm-field-label">Exam Date</div><input id="cm_examDate" type="date" class="input" value="' + esc(c.examDate || '') + '" /><div class="cm-field-hint">Add a date to unlock cram prioritisation as the exam gets closer.</div></div>';
          inner += '<div class="field"><div class="cm-field-label">Exam Weight (%)</div><input id="cm_examWeight" type="number" min="0" max="100" step="1" class="input" value="' + esc(c.examWeight != null ? String(c.examWeight) : '') + '" /><div class="cm-field-hint">Optional weighting for planning and context.</div></div>';
          inner += '</div>';
          inner += '<div style="display:flex;justify-content:flex-end;margin-top:12px;"><button class="big-btn" id="cmSaveDetails" type="button">Save Details</button></div>';
          inner += '</div>';
        } else if (activeTab === 'syllabus') {
          inner += '<div class="field"><label>Syllabus / Exam Info</label><textarea class="input" id="cm_courseContextText" rows="7" placeholder="Paste syllabus text, exam instructions, or course outline...">' + esc(c.rawSyllabusText || '') + '</textarea></div>';
          inner += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
          inner += '<input type="file" accept="application/pdf,.pdf" id="cm_pdfFile" style="display:none">';
          inner += '<button type="button" class="ghost-btn" id="cm_pdfBtn">📄 Import PDF</button>';
          inner += '<button type="button" class="ghost-btn" id="cm_processSyllabus">Process syllabus with AI</button>';
          inner += '<button type="button" class="ghost-btn" id="cm_reprocessSyllabus">Re-process</button>';
          inner += '</div>';
          inner += '<div class="syllabus-status" id="cm_contextStatus"></div>';
          inner += '<div class="chips" id="cm_suggestedTopics" style="margin-top:6px;"></div>';
          inner += '<div id="cm_previewWrap" style="' + (c.syllabusContext ? '' : 'display:none;') + 'margin-top:8px;"><div style="font-size:9px;font-weight:700;margin-bottom:4px;color:var(--text-secondary);">Processed summary</div><div class="syllabus-preview" id="cm_syllabusPreview">' + esc(c.syllabusContext || '') + '</div></div>';
          inner += '<div class="field"><label>Professor values</label><textarea class="input" id="cm_professorValues" rows="3">' + esc(c.professorValues || '') + '</textarea></div>';
          inner += '<div class="field"><label>Allowed materials</label><input type="text" class="input" id="cm_allowedMaterials" value="' + esc(c.allowedMaterials || '') + '"></div>';
          inner += '<div class="or-divider">LECTURE MATERIALS</div>';
          inner += '<div class="field"><input type="text" class="input" id="cm_lectureUrlInput" placeholder="Paste any URL (published Notion page, article, etc.)"></div>';
          inner += '<div style="display:flex;gap:8px;">';
          inner += '<button type="button" class="ghost-btn" id="cm_importLectureUrl" style="flex:1;">🌐 Import from URL</button>';
          inner += '<input type="file" accept="application/pdf,.pdf" id="cm_importLecturePdf" style="display:none">';
          inner += '<button type="button" class="ghost-btn" id="cm_importLecturePdfBtn" style="flex:1;">📄 Import PDF</button>';
          inner += '</div>';
          inner += '<div class="syllabus-status" id="cm_lectureImportStatus" style="min-height:0;"></div>';
          inner += '<div id="cm_lectureManifestDisplay" style="margin-top:8px;"></div>';
          inner += '<div style="display:flex;justify-content:flex-end;margin-top:12px;"><button class="big-btn" id="cmSaveSyllabus" type="button">Save Syllabus & AI</button></div>';
        } else if (activeTab === 'subdecks') {
          ensureCourseModules(courseName);
          var modules = c.modules || [];
          inner += '<div style="display:flex;gap:8px;margin-bottom:10px;">';
          inner += '<input type="text" class="input" id="cm_newModuleName" placeholder="New subdeck name" />';
          inner += '<button type="button" class="ghost-btn" id="cm_addModule">＋ Add Subdeck</button>';
          inner += '</div>';
          if (!modules.length) inner += '<p class="help" style="margin-bottom:10px;">No subdecks yet. Create one to group topics.</p>';
          modules.forEach(function(mod) {
            var mTopics = Array.isArray(mod.topics) ? mod.topics : [];
            inner += '<div style="border:1px solid rgba(var(--accent-rgb),0.16);border-radius:12px;padding:10px;margin-bottom:10px;">';
            inner += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">';
            inner += '<input class="input" data-mod-rename="' + esc(mod.id) + '" value="' + esc(mod.name || 'Subdeck') + '" style="flex:1;">';
            inner += '<button class="ghost-btn" type="button" data-mod-save="' + esc(mod.id) + '" style="min-width:0;padding:6px 10px;">Save</button>';
            inner += '<button class="ghost-btn" type="button" data-mod-del="' + esc(mod.id) + '" style="min-width:0;padding:6px 10px;color:#ef4444;border-color:rgba(239,68,68,0.25);">Delete</button>';
            inner += '</div>';
            inner += '<div class="chips">';
            if (!mTopics.length) inner += '<span class="help">No topics assigned</span>';
            mTopics.forEach(function(t) {
              inner += '<span class="chip" style="display:inline-flex;align-items:center;gap:6px;">' + esc(t) + '<button type="button" data-unassign-topic="' + esc(t) + '" style="border:none;background:transparent;color:var(--text-secondary);cursor:pointer;">✕</button></span>';
            });
            inner += '</div></div>';
          });
          var allTopics = getUniqueCourseTopics(courseName);
          var assigned = {};
          modules.forEach(function(m) { (m.topics || []).forEach(function(t) { assigned[t] = true; }); });
          var unassigned = allTopics.filter(function(t) { return !assigned[t]; });
          inner += '<div class="section-header" style="margin-top:6px;">Unassigned Topics</div>';
          if (!unassigned.length) inner += '<p class="help">All topics are assigned.</p>';
          unassigned.forEach(function(t) {
            inner += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
            inner += '<span class="chip" style="transform-origin:center;">' + esc(t) + '</span>';
            inner += '<select class="input" data-topic-target="' + esc(t) + '" style="max-width:220px;">';
            inner += '<option value="">Assign to subdeck...</option>';
            modules.forEach(function(m) { inner += '<option value="' + esc(m.id) + '">' + esc(m.name || 'Subdeck') + '</option>'; });
            inner += '</select>';
            inner += '</div>';
          });
        } else {
          inner += '<div id="cmCourseNotesHost">' + renderCourseTutorNotesPanelHTML(courseName) + '</div>';
          inner += '<div style="display:flex;justify-content:flex-end;margin-top:10px;">';
          inner += '<button class="ghost-btn" id="cmClearCourseNotes" type="button" style="border-color:rgba(239,68,68,0.3);color:#ef4444;">Clear memories</button>';
          inner += '</div>';
        }
        var tabHost = el('cmTabContent');
        if (tabHost) {
          tabHost.innerHTML = inner;
          if (window.gsap) gsap.fromTo(tabHost, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
        }
        wireEditorTabInteractions(activeTab);
      }

      function wireEditorTabInteractions(activeTab) {
        var back = el('cmBackToList');
        if (back) back.onclick = function() {
          courseModalState.mode = 'list';
          courseModalState.course = null;
          courseModalState.tab = 'details';
          renderCourseModal();
        };
        courseModalBody.querySelectorAll('[data-course-tab]').forEach(function(btn) {
          btn.onclick = function() {
            courseModalState.tab = btn.getAttribute('data-course-tab') || 'details';
            renderTabContent();
            if (window.gsap) gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
            try { playClick(); } catch (e) {}
          };
        });

        if (activeTab === 'details') {
          var cp = el('cm_colorPicker');
          if (cp) cp.querySelectorAll('.color-swatch').forEach(function(sw) {
            sw.onclick = function() {
              cp.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
              sw.classList.add('active');
            };
          });
          var examSelect = el('cm_examType');
          var examDesc = el('cm_examTypeDesc');
          function syncExamDesc() {
            if (!examSelect || !examDesc) return;
            examDesc.textContent = examTypeDescriptions[examSelect.value || 'mixed'] || examTypeDescriptions.mixed;
          }
          if (examSelect) {
            examSelect.onchange = syncExamDesc;
            syncExamDesc();
          }
          var saveDetails = el('cmSaveDetails');
          if (saveDetails) saveDetails.onclick = function() {
            var oldName = c.name;
            var newName = (el('cm_name').value || '').trim();
            if (!newName) { toast('Course name required'); return; }
            if (newName !== oldName && state.courses[newName]) { toast('Course name already exists'); return; }
            var activeSwatch = cp ? cp.querySelector('.color-swatch.active') : null;
            c.color = activeSwatch ? activeSwatch.getAttribute('data-color') : (c.color || '#8b5cf6');
            c.examType = (el('cm_examType').value || 'mixed');
            c.examDate = (el('cm_examDate').value || '').trim() || null;
            var ew = (el('cm_examWeight').value || '').trim();
            c.examWeight = ew ? Math.max(0, Math.min(100, Math.round(Number(ew) || 0))) : null;
            if (newName !== oldName) {
              renameCourse(oldName, newName);
              c = getCourse(newName);
              courseName = newName;
              courseModalState.course = newName;
            }
            saveCourse(c);
            renderDashboard();
            if (!isEmbedded) renderSidebar();
            toast('Course details saved');
            renderCourseModalEditor(courseName, 'details');
          };
        } else if (activeTab === 'syllabus') {
          var pasteBtn = el('cm_togglePasteBtn');
          var pasteArea = el('cm_pasteArea');
          if (pasteBtn) pasteBtn.onclick = function() {
            var isOpen = !!(pasteArea && pasteArea.style.display !== 'none');
            animateSlideToggle(pasteArea, !isOpen);
          };
          function setCtxStatus(msg, cls) {
            var st = el('cm_contextStatus');
            if (!st) return;
            st.className = 'syllabus-status' + (cls ? ' ' + cls : '');
            st.innerHTML = msg || '';
          }
          function renderSuggestedTopics(topics) {
            var box = el('cm_suggestedTopics');
            if (!box) return;
            box.innerHTML = '';
            (topics || []).forEach(function(t) {
              var chip = document.createElement('span');
              chip.className = 'chip';
              chip.textContent = String(t || '').trim();
              box.appendChild(chip);
            });
          }
          renderSuggestedTopics(c.syllabusKeyTopics || []);
          function runSyllabusProcess(rawText) {
            var trimmed = (rawText || '').trim();
            if (!trimmed) { toast('Paste text or import a PDF first'); return; }
            setCtxStatus('<span class="af-spinner"></span> Processing syllabus...', '');
            var examT = (el('cm_examType') && el('cm_examType').value) || c.examType || 'mixed';
            postSyllabusDistill(trimmed, c.name, examT).then(function(data) {
              if (!data || data.error) { setCtxStatus(esc(data && data.error ? String(data.error) : 'Could not process syllabus'), ''); return; }
              c.rawSyllabusText = trimmed.length > 15000 ? trimmed.slice(0, 15000) : trimmed;
              if (data.syllabusContext != null) c.syllabusContext = String(data.syllabusContext).slice(0, 4000);
              c.professorValues = data.professorValues != null && data.professorValues !== 'null' ? String(data.professorValues).slice(0, 500) : c.professorValues;
              c.allowedMaterials = data.allowedMaterials != null && data.allowedMaterials !== 'null' ? String(data.allowedMaterials) : c.allowedMaterials;
              c.syllabusKeyTopics = Array.isArray(data.keyTopics) ? data.keyTopics.slice(0, 20) : [];
              saveCourse(c);
              var prev = el('cm_syllabusPreview');
              if (prev) prev.textContent = c.syllabusContext || '';
              var meta = el('cm_syllabusMeta');
              if (meta) meta.innerHTML = '<span class="cm-status-badge">Processed</span>';
              var zone = el('cm_syllabusZone');
              if (zone) zone.classList.add('has-content');
              var wrap = el('cm_previewWrap');
              if (wrap && c.syllabusContext) wrap.style.display = '';
              var profEl = el('cm_professorValues'); if (profEl) profEl.value = c.professorValues || '';
              var alEl = el('cm_allowedMaterials'); if (alEl) alEl.value = c.allowedMaterials || '';
              renderSuggestedTopics(c.syllabusKeyTopics);
              if (pasteArea && pasteArea.style.display === 'none') animateSlideToggle(pasteArea, true);
              setCtxStatus('Syllabus processed', 'ok');
            }).catch(function() { setCtxStatus('Network error - try again', ''); });
          }
          var pdfBtn = el('cm_pdfBtn');
          var pdfFile = el('cm_pdfFile');
          if (pdfBtn && pdfFile) {
            pdfBtn.onclick = function() { pdfFile.click(); };
            pdfFile.onchange = function() {
              var f = pdfFile.files && pdfFile.files[0];
              if (!f) return;
              extractPdfText(f).then(function(text) {
                var ta = el('cm_courseContextText');
                if (ta) ta.value = text || '';
                runSyllabusProcess(text || '');
                pdfFile.value = '';
              }).catch(function(err) { toast(err && err.message ? err.message : 'Could not read PDF'); });
            };
          }
          var procBtn = el('cm_processSyllabus');
          if (procBtn) procBtn.onclick = function() { runSyllabusProcess(el('cm_courseContextText') ? el('cm_courseContextText').value : ''); };
          var reprocBtn = el('cm_reprocessSyllabus');
          if (reprocBtn) reprocBtn.onclick = function() { runSyllabusProcess(c.rawSyllabusText || (el('cm_courseContextText') ? el('cm_courseContextText').value : '')); };

          var lectureUrlToggle = el('cm_toggleLectureUrl');
          var lectureUrlWrap = el('cm_lectureUrlWrap');
          if (lectureUrlToggle) lectureUrlToggle.onclick = function() {
            var isOpen = !!(lectureUrlWrap && lectureUrlWrap.style.display !== 'none');
            animateSlideToggle(lectureUrlWrap, !isOpen);
          };

          function setLectureStatus(msg, cls) {
            var st = el('cm_lectureImportStatus');
            if (!st) return;
            st.className = 'syllabus-status' + (cls ? ' ' + cls : '');
            st.innerHTML = msg || '';
          }
          function updateLectureManifestDisplay() {
            var box = el('cm_lectureManifestDisplay');
            if (!box) return;
            var count = Number(c._lectureCount || 0) || 0;
            box.innerHTML = count > 0 ? '<span class="cm-status-badge">' + count + ' lecture' + (count !== 1 ? 's' : '') + ' imported</span>' : '';
            var zone = el('cm_lectureZone');
            if (zone) zone.classList.toggle('has-content', count > 0);
          }
          function importLectureFromText(lectureTitle, rawText) {
            var trimmed = (rawText || '').trim();
            if (!trimmed) { toast('Paste text or import a PDF first'); return Promise.resolve(null); }
            setLectureStatus('<span class="af-spinner"></span> Processing lecture...', '');
            return fetch(DISTILL_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Widget-Key': getWidgetKey() },
              body: JSON.stringify({ courseName: c.name, lectureTitle: lectureTitle || 'Lecture', rawText: trimmed, existingSyllabusContext: c.syllabusContext || '' })
            }).then(function(res) { return res.json(); }).then(function(data) {
              if (!data || data.error) { setLectureStatus(esc(data && data.error ? String(data.error) : 'Could not process lecture'), ''); return null; }
              if (data.courseDigestUpdate != null && String(data.courseDigestUpdate).trim()) c.syllabusContext = String(data.courseDigestUpdate).slice(0, 4000);
              if (data.topicChunks && data.topicChunks.length > 0) {
                var modTopics = data.topicChunks.map(function(tc) { return tc && tc.topic ? tc.topic : null; }).filter(Boolean);
                if (modTopics.length > 0) addModuleToCourse(c.name, { name: lectureTitle || 'Imported Lecture', topics: modTopics, lectureImported: true, importDate: new Date().toISOString() });
              }
              c._lectureCount = (Number(c._lectureCount || 0) || 0) + 1;
              saveCourse(c);
              if (!isEmbedded) renderSidebar();
              updateLectureManifestDisplay();
              setLectureStatus('Imported lecture context', 'ok');
              return data;
            }).catch(function() { setLectureStatus('Network error - try again', ''); return null; });
          }
          updateLectureManifestDisplay();
          var importUrlBtn = el('cm_importLectureUrl');
          if (importUrlBtn) importUrlBtn.onclick = function() {
            var inEl = el('cm_lectureUrlInput');
            var url = inEl ? String(inEl.value || '').trim() : '';
            if (!url || url.indexOf('http') !== 0) { toast('Paste a valid URL'); return; }
            setLectureStatus('<span class="af-spinner"></span> Fetching page…', '');
            fetch(FETCH_LECTURE_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Widget-Key': getWidgetKey() },
              body: JSON.stringify({ url: url })
            }).then(function(res) { return res.json(); }).then(function(data) {
              if (!data || data.error || !data.text || String(data.text).length < 200) { setLectureStatus('Could not extract enough text from this page', ''); return; }
              var title = data.title || (url.split('/').pop() || 'Lecture');
              importLectureFromText(title, String(data.text));
            }).catch(function() { setLectureStatus('Network error — try again', ''); });
          };
          var lecturePdfBtn = el('cm_importLecturePdfBtn');
          var lecturePdfFile = el('cm_importLecturePdf');
          if (lecturePdfBtn && lecturePdfFile) {
            lecturePdfBtn.onclick = function() { lecturePdfFile.click(); };
            lecturePdfFile.onchange = function() {
              var f = lecturePdfFile.files && lecturePdfFile.files[0];
              if (!f) return;
              setLectureStatus('<span class="af-spinner"></span> Extracting PDF text…', '');
              extractPdfText(f).then(function(text) {
                if (!text || String(text).length < 200) { setLectureStatus('Could not extract enough text from this PDF', ''); return; }
                importLectureFromText(String(f.name || 'Lecture').replace(/\.pdf$/i, ''), String(text));
              }).catch(function(err) { setLectureStatus(esc(err && err.message ? err.message : 'Could not read PDF'), ''); });
              lecturePdfFile.value = '';
            };
          }
          var saveSyllabus = el('cmSaveSyllabus');
          if (saveSyllabus) saveSyllabus.onclick = function() {
            c.rawSyllabusText = (el('cm_courseContextText') && el('cm_courseContextText').value.trim()) ? el('cm_courseContextText').value.trim().slice(0, 15000) : null;
            c.professorValues = (el('cm_professorValues') && el('cm_professorValues').value.trim()) ? el('cm_professorValues').value.trim().slice(0, 500) : null;
            c.allowedMaterials = (el('cm_allowedMaterials') && el('cm_allowedMaterials').value.trim()) ? el('cm_allowedMaterials').value.trim() : null;
            saveCourse(c);
            toast('Syllabus settings saved');
          };
        } else if (activeTab === 'subdecks') {
          var addModBtn = el('cm_addModule');
          if (addModBtn) addModBtn.onclick = function() {
            var input = el('cm_newModuleName');
            var name = input ? String(input.value || '').trim() : '';
            if (!name) { toast('Enter a subdeck name'); return; }
            addModuleToCourse(courseName, { name: name, topics: [], lectureImported: false });
            if (!isEmbedded) renderSidebar();
            renderCourseModalEditor(courseName, 'subdecks');
            toast('Created subdeck: ' + name);
          };
          courseModalBody.querySelectorAll('[data-mod-save]').forEach(function(btn) {
            btn.onclick = function() {
              var id = btn.getAttribute('data-mod-save');
              var input = courseModalBody.querySelector('[data-mod-rename="' + id + '"]');
              var newName = input ? String(input.value || '').trim() : '';
              if (!newName) { toast('Name cannot be empty'); return; }
              renameModule(courseName, id, newName);
              if (!isEmbedded) renderSidebar();
              toast('Subdeck renamed');
              renderCourseModalEditor(courseName, 'subdecks');
            };
          });
          courseModalBody.querySelectorAll('[data-mod-del]').forEach(function(btn) {
            btn.onclick = function() {
              var id = btn.getAttribute('data-mod-del');
              removeModuleFromCourse(courseName, id);
              if (!isEmbedded) renderSidebar();
              toast('Subdeck deleted');
              renderCourseModalEditor(courseName, 'subdecks');
            };
          });
          courseModalBody.querySelectorAll('[data-unassign-topic]').forEach(function(btn) {
            btn.onclick = function() {
              var topic = btn.getAttribute('data-unassign-topic');
              unassignTopicFromModules(courseName, topic);
              renderCourseModalEditor(courseName, 'subdecks');
            };
          });
          courseModalBody.querySelectorAll('[data-topic-target]').forEach(function(sel) {
            sel.onchange = function() {
              var topic = sel.getAttribute('data-topic-target');
              var targetModule = sel.value;
              if (!targetModule) return;
              assignTopicToModule(courseName, topic, targetModule);
              if (window.gsap) {
                var chip = sel.parentNode && sel.parentNode.querySelector('.chip');
                if (chip) gsap.fromTo(chip, { x: -8, opacity: 0.4 }, { x: 0, opacity: 1, duration: 0.25, ease: 'power2.out' });
              }
              renderCourseModalEditor(courseName, 'subdecks');
            };
          });
        } else if (activeTab === 'notes') {
          var notesHost = el('cmCourseNotesHost');
          if (notesHost) wireTutorNotesPanelToggle(notesHost);
          var clearBtn = el('cmClearCourseNotes');
          if (clearBtn) clearBtn.onclick = function() {
            clearCourseTutorMemoriesForCourse(courseName);
            renderCourseModalEditor(courseName, 'notes');
          };
        }
      }

      renderTabContent();
    }

    window.openEditCourseTab = function(name, tab) {
      openCourseModal();
      setTimeout(function() {
        courseModalState.mode = 'editor';
        courseModalState.course = name;
        courseModalState.tab = (tab === 'subdecks') ? 'structure' : (tab || 'details');
        renderCourseModalEditor(name, courseModalState.tab);
      }, 80);
    };

    function moveModuleInCourse(courseName, moduleId, direction) {
      var c = getCourse(courseName);
      if (!c || !Array.isArray(c.modules)) return;
      var idx = -1;
      for (var i = 0; i < c.modules.length; i++) {
        if (c.modules[i] && c.modules[i].id === moduleId) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return;
      var nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= c.modules.length) return;
      var tmp = c.modules[idx];
      c.modules[idx] = c.modules[nextIdx];
      c.modules[nextIdx] = tmp;
      saveCourse(c);
    }

    function openDeleteCoursePrompt(name, forceDeleteCards) {
      var ov = el('confirmDeleteCourseOv');
      if (!ov) return;
      var itemCount = 0;
      var archivedCount = 0;
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id) || !state.items[id]) continue;
        if (state.items[id].course !== name) continue;
        if (state.items[id].archived) archivedCount++;
        else itemCount++;
      }
      var totalCards = itemCount + archivedCount;
      var title = el('confirmDeleteCourseTitle');
      var desc = el('confirmDeleteCourseDesc');
      var toggle = el('confirmDeleteCourseCards');
      if (title) title.textContent = 'Delete "' + name + '"?';
      if (desc) desc.textContent = totalCards + ' card' + (totalCards === 1 ? '' : 's') + ' in this course (' + itemCount + ' active, ' + archivedCount + ' archived).';
      if (toggle) toggle.checked = forceDeleteCards !== false;
      ov.dataset.courseName = name;
      ov.classList.add('show');
    }

    function closeDeleteCoursePrompt() {
      var ov = el('confirmDeleteCourseOv');
      if (!ov) return;
      ov.classList.remove('show');
      delete ov.dataset.courseName;
    }

    function confirmDeleteCoursePrompt() {
      var ov = el('confirmDeleteCourseOv');
      if (!ov) return;
      var name = ov.dataset.courseName;
      if (!name) return;
      var shouldDeleteCards = !!(el('confirmDeleteCourseCards') && el('confirmDeleteCourseCards').checked);
      if (shouldDeleteCards) {
        var toDelete = [];
        for (var did in state.items) {
          if (state.items.hasOwnProperty(did) && state.items[did] && state.items[did].course === name) toDelete.push(did);
        }
        toDelete.forEach(function(did2) { delete state.items[did2]; });
      } else {
        for (var id3 in state.items) {
          if (state.items.hasOwnProperty(id3) && state.items[id3] && state.items[id3].course === name) state.items[id3].course = '';
        }
      }
      deleteCourse(name);
      reconcileStats();
      saveState();
      closeDeleteCoursePrompt();
      sidebarSelection = { level: 'all', course: null, module: null, topic: null };
      try { hideContextViews(); } catch (eHide) {}
      try { renderSidebar(); } catch (eSb) {}
      try { updateBreadcrumb(); } catch (eBc) {}
      try { showView('viewDash'); } catch (eView) {}
      try { switchNav('home'); } catch (eNav) {}
      renderDashboard();
      toast(shouldDeleteCards ? 'Course and all cards deleted' : 'Course removed');
    }

    function archiveCourse(courseName) {
      var course = getCourse(courseName);
      if (!course) return;
      course.archived = true;
      saveCourse(course);
      saveState();
      sidebarSelection = { level: 'all', course: null, module: null, topic: null };
      hideContextViews();
      renderSidebar();
      updateBreadcrumb();
      renderDashboard();
      toast('Course archived');
    }

    function restoreCourse(courseName) {
      var course = getCourse(courseName);
      if (!course) return;
      course.archived = false;
      saveCourse(course);
      saveState();
      renderSidebar();
      renderDashboard();
      renderArchivedCoursesOverlay();
      toast('Course restored');
    }

    function renderArchivedCoursesOverlay() {
      var body = el('archivedCoursesBody');
      if (!body) return;
      var archivedCourses = listCourses(true).filter(function(c) { return c && c.archived; });
      var html = '';
      if (!archivedCourses.length) {
        html = '<div class="empty-state" style="padding:12px 8px;"><div class="empty-title">No archived courses</div><div class="empty-desc">Archived courses will appear here for restore or permanent deletion.</div></div>';
      } else {
        archivedCourses.forEach(function(c) {
          var col = c.color || '#8b5cf6';
          html += '<div class="archive-course-row">';
          html += '<span class="cc-color-dot" style="background:' + esc(col) + '"></span>';
          html += '<span class="archive-course-name">' + esc(c.name) + '</span>';
          html += '<button class="cd-restore-card" type="button" data-restore-course="' + esc(c.name) + '">Restore</button>';
          html += '<button class="cd-delete-card" type="button" data-delete-course="' + esc(c.name) + '" title="Delete course permanently"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg></button>';
          html += '</div>';
        });
      }
      body.innerHTML = html;
      body.querySelectorAll('[data-restore-course]').forEach(function(btn) {
        btn.onclick = function() {
          restoreCourse(btn.getAttribute('data-restore-course'));
        };
      });
      body.querySelectorAll('[data-delete-course]').forEach(function(btn) {
        btn.onclick = function() {
          openDeleteCoursePrompt(btn.getAttribute('data-delete-course'), true);
        };
      });
    }

    function openArchivedCoursesOverlay() {
      var ov = el('archivedCoursesOv');
      if (!ov) return;
      renderArchivedCoursesOverlay();
      ov.classList.add('show');
    }

    function closeArchivedCoursesOverlay() {
      var ov = el('archivedCoursesOv');
      if (!ov) return;
      ov.classList.remove('show');
    }

    function svgRing(percent, size, strokeWidth, color) {
      var pct = clamp(percent || 0, 0, 100);
      var r = (size - strokeWidth) / 2;
      var circumference = 2 * Math.PI * r;
      var offset = circumference - (pct / 100) * circumference;
      var center = size / 2;
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="transform:rotate(-90deg)">' +
        '<circle cx="' + center + '" cy="' + center + '" r="' + r + '" fill="none" stroke="rgba(var(--accent-rgb),0.12)" stroke-width="' + strokeWidth + '"/>' +
        '<circle class="progress-ring-arc" cx="' + center + '" cy="' + center + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '"/>' +
        '</svg>';
    }

    function getRetentionRingColor(percent) {
      if (percent >= 85) return 'var(--rate-good)';
      if (percent >= 60) return 'var(--rate-hard)';
      return 'var(--rate-again)';
    }

    function getDueBarColor(percent) {
      if (percent < 30) return 'var(--rate-good)';
      if (percent <= 70) return 'var(--rate-hard)';
      return 'var(--rate-again)';
    }

    function getStabilityMeta(days) {
      if (days < 3) return { color: 'var(--rate-again)', label: 'Needs reinforcement' };
      if (days <= 14) return { color: 'var(--rate-hard)', label: 'Building' };
      if (days <= 30) return { color: 'var(--rate-good)', label: 'Strong' };
      return { color: 'var(--accent)', label: 'Mastered' };
    }

    function tooltipIconMarkup(text, label) {
      return '<span class="info-icon" tabindex="0" role="button" aria-label="' + esc(label || 'More info') + '">ⓘ<span class="info-tooltip" role="tooltip">' + text + '<span class="tip-arrow"></span></span></span>';
    }

    function animateProgressRings(scope) {
      if (!window.gsap) return;
      var root = scope || document;
      root.querySelectorAll('.progress-ring-arc').forEach(function(ringCircle) {
        var target = parseFloat(ringCircle.getAttribute('stroke-dashoffset'));
        var circ = parseFloat(ringCircle.getAttribute('stroke-dasharray'));
        if (!isFinite(target) || !isFinite(circ)) return;
        ringCircle.setAttribute('stroke-dashoffset', String(circ));
        gsap.to(ringCircle, { attr: { 'stroke-dashoffset': target }, duration: 1, delay: 0.2, ease: 'power2.out' });
      });
    }

    function applyHomeStatVisuals(masteredCount, totalItems, retentionPct) {
      var masteredStat = document.querySelector('#tabHome .stats-row .stat:nth-child(1)');
      var retentionStat = document.querySelector('#tabHome .stats-row .stat:nth-child(2)');
      if (masteredStat) {
        var masteredPct = totalItems ? Math.round((masteredCount / totalItems) * 100) : 0;
        masteredStat.innerHTML =
          '<div class="k">Mastered ' + tooltipIconMarkup('Cards count as mastered when their stability is above 30 days and they have no lapses. It is a strong-memory signal, not a permanent badge.', 'More info about Mastered') + '</div>' +
          '<div class="v" id="statStreak">' + masteredCount + '</div>' +
          '<div class="stat-bar"><div class="stat-bar-fill" style="width:' + masteredPct + '%;background:' + getDueBarColor(100 - masteredPct) + '"></div></div>' +
          '<div class="s">stability > 30d</div>';
      }
      if (retentionStat) {
        var safePct = retentionPct == null ? 0 : retentionPct;
        retentionStat.classList.add('stat-ring');
        retentionStat.innerHTML =
          '<div class="k">Avg Retention ' + tooltipIconMarkup('Average probability you can recall your reviewed cards right now. FSRS estimates this from each card\'s stability and time since review, and the forecast shows how it decays over the next 30 days without practice.', 'More info about Avg Retention') + '</div>' +
          '<div class="stat-ring-wrap small">' + svgRing(safePct, 52, 5, getRetentionRingColor(safePct)) + '<div class="stat-ring-value" id="statRet">' + (retentionPct == null ? '—' : (safePct + '%')) + '</div></div>' +
          '<div class="s">FSRS retrievability</div>';
      }
      var calGauge = document.querySelector('#tabHome .gauge');
      if (calGauge) calGauge.classList.add('stat-ring');
      animateProgressRings(el('tabHome'));
    }

    function renderCourseModalEditor(courseName, tab) {
      var c = getCourse(courseName);
      if (!c) {
        courseModalState.mode = 'list';
        renderCourseModal();
        return;
      }
      courseModalState.mode = 'editor';
      courseModalState.course = courseName;
      var resolvedTab = tab || courseModalState.tab || 'details';
      if (resolvedTab === 'subdecks') resolvedTab = 'structure';
      courseModalState.tab = resolvedTab;
      courseModalRefreshShell();

      var tabs = [
        { id: 'details', label: '⚙ Details' },
        { id: 'syllabus', label: '🧠 Syllabus & AI' },
        { id: 'structure', label: '📁 Structure' },
        { id: 'notes', label: '📝 Tutor Notes' }
      ];
      var examTypeDescriptions = {
        mc: 'Emphasises Quick Fire and Distinguish practice for recognition-heavy exams.',
        short_answer: 'Balances recall speed with Explain It style written retrieval.',
        essay: 'Emphasises Apply It and Mock Exam tiers for longer written responses.',
        mixed: 'Balanced across all five tiers. A good default when your exam combines several question formats.'
      };
      var cards = getCardsForCourse(courseName);
      var cram = getCramState(courseName);
      var subtitle = (EXAM_TYPE_LABELS[c.examType] || c.examType) + (cram.active ? ' 🔥 Cram' : '') + ' · ' + cards.length + ' cards' + (c.examDate ? ' · Exam: ' + c.examDate : '');
      var tabNav = tabs.map(function(t) {
        var active = courseModalState.tab === t.id ? ' active' : '';
        return '<button class="cm-tab' + active + '" type="button" data-course-tab="' + t.id + '">' + t.label + '</button>';
      }).join('');

      var h = '';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">';
      h += '<button class="ghost-btn" id="cmBackToList" type="button" style="min-width:0;padding:6px 10px;">← Back to courses</button>';
      h += '<div style="font-size:11px;font-weight:800;letter-spacing:0.5px;">' + esc(courseName) + '</div>';
      h += '</div>';
      h += '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:10px;">' + esc(subtitle) + '</div>';
      h += '<div class="cm-tab-bar">' + tabNav + '</div>';
      h += '<div id="cmTabContent"></div>';
      courseModalBody.innerHTML = h;

      function animateSlideToggle(node, shouldOpen) {
        if (!node) return;
        if (shouldOpen) {
          node.style.display = 'block';
          var openHeight = node.scrollHeight || 0;
          if (window.gsap) {
            gsap.fromTo(node, { opacity: 0, y: -6, height: 0 }, { opacity: 1, y: 0, height: openHeight, duration: 0.22, ease: 'power2.out', onComplete: function() { node.style.height = ''; } });
          } else {
            node.style.height = '';
          }
        } else if (window.gsap) {
          gsap.to(node, { opacity: 0, y: -6, height: 0, duration: 0.18, ease: 'power2.inOut', onComplete: function() { node.style.display = 'none'; node.style.height = ''; } });
        } else {
          node.style.display = 'none';
          node.style.height = '';
        }
      }

      function renderTabContent() {
        var activeTab = courseModalState.tab || 'details';
        var inner = '';
        if (activeTab === 'details') {
          inner += '<div class="cm-section">';
          inner += '<div class="cm-section-title">Identity</div>';
          inner += '<div class="field"><div class="cm-field-label">Course Name</div><input id="cm_name" class="input" value="' + esc(c.name) + '" /></div>';
          inner += '<div class="field" style="margin-bottom:0;"><div class="cm-field-label">Colour</div><div class="color-picker" id="cm_colorPicker">';
          COURSE_COLORS.forEach(function(cc) {
            var isAct = (c.color || '#8b5cf6') === cc.value;
            inner += '<div class="color-swatch' + (isAct ? ' active' : '') + '" data-color="' + cc.value + '" style="background:' + cc.value + '" title="' + esc(cc.name) + '"></div>';
          });
          inner += '</div></div></div>';
          inner += '<div class="cm-section">';
          inner += '<div class="cm-section-title">Exam Configuration</div>';
          inner += '<div class="cm-details-grid">';
          inner += '<div class="field"><div class="cm-field-label">Exam Format</div><select id="cm_examType" class="input">';
          inner += '<option value="mc"' + (c.examType === 'mc' ? ' selected' : '') + '>Multiple Choice</option>';
          inner += '<option value="short_answer"' + (c.examType === 'short_answer' ? ' selected' : '') + '>Short Answer</option>';
          inner += '<option value="essay"' + (c.examType === 'essay' ? ' selected' : '') + '>Essay</option>';
          inner += '<option value="mixed"' + (c.examType === 'mixed' ? ' selected' : '') + '>Mixed</option>';
          inner += '</select><div id="cm_examTypeDesc" class="cm-field-hint">' + esc(examTypeDescriptions[c.examType || 'mixed'] || examTypeDescriptions.mixed) + '</div></div>';
          inner += '<div class="field"><div class="cm-field-label">Exam Date</div><input id="cm_examDate" type="date" class="input" value="' + esc(c.examDate || '') + '" /><div class="cm-field-hint">Add a date to unlock cram prioritisation as the exam gets closer.</div></div>';
          inner += '<div class="field"><div class="cm-field-label">Exam Weight (%)</div><input id="cm_examWeight" type="number" min="0" max="100" step="1" class="input" value="' + esc(c.examWeight != null ? String(c.examWeight) : '') + '" /><div class="cm-field-hint">Optional weighting for planning and context.</div></div>';
          inner += '</div>';
          inner += '<div style="display:flex;justify-content:flex-end;margin-top:12px;"><button class="big-btn" id="cmSaveDetails" type="button">Save Details</button></div>';
          inner += '</div>';
        } else if (activeTab === 'syllabus') {
          var hasSyllabus = !!String(c.syllabusContext || c.rawSyllabusText || '').trim();
          var lectureCount = Number(c._lectureCount || 0) || 0;
          inner += '<div class="cm-section">';
          inner += '<input type="file" accept="application/pdf,.pdf" id="cm_pdfFile" style="display:none">';
          inner += '<div class="cm-upload-zone' + (hasSyllabus ? ' has-content' : '') + '" id="cm_syllabusZone">';
          inner += '<div class="cm-upload-icon">📄</div>';
          inner += '<div class="cm-upload-title">' + (hasSyllabus ? 'Syllabus ready' : 'Upload Syllabus') + '</div>';
          inner += '<div class="cm-upload-hint">' + (hasSyllabus ? 'Processed and ready. Re-process or replace it any time.' : 'Drop a PDF or paste text to give the tutor your course context.') + '</div>';
          inner += '<div class="cm-upload-actions">';
          inner += '<button type="button" class="cm-upload-btn" id="cm_pdfBtn">📎 Import PDF</button>';
          inner += '<button type="button" class="cm-upload-btn" id="cm_togglePasteBtn">📝 Paste Text</button>';
          if (hasSyllabus) inner += '<button type="button" class="cm-upload-btn" id="cm_reprocessSyllabus">Re-process</button>';
          inner += '</div>';
          inner += '<div class="cm-upload-meta" id="cm_syllabusMeta">' + (hasSyllabus ? '<span class="cm-status-badge">✓ Processed</span>' : '') + '</div>';
          inner += '</div>';
          inner += '<div class="syllabus-status" id="cm_contextStatus"></div>';
          inner += '<div class="cm-paste-area" id="cm_pasteArea" style="' + (c.rawSyllabusText ? '' : 'display:none;') + '">';
          inner += '<div class="field" style="margin-top:12px;"><div class="cm-field-label">Syllabus / Exam Info</div><textarea class="input" id="cm_courseContextText" rows="7" placeholder="Paste syllabus text, exam instructions, or course outline...">' + esc(c.rawSyllabusText || '') + '</textarea></div>';
          inner += '<div class="cm-inline-actions"><button type="button" class="ghost-btn" id="cm_processSyllabus">Process syllabus with AI</button></div>';
          inner += '</div>';
          inner += '<div class="chips" id="cm_suggestedTopics" style="margin-top:10px;"></div>';
          inner += '<details class="cm-section cm-summary-section" id="cm_previewWrap" ' + (c.syllabusContext ? 'open' : '') + ' style="' + (c.syllabusContext ? '' : 'display:none;') + '">';
          inner += '<summary class="cm-section-title">View processed summary</summary>';
          inner += '<div class="syllabus-preview" id="cm_syllabusPreview">' + esc(c.syllabusContext || '') + '</div>';
          inner += '</details>';
          inner += '<details class="cm-section">';
          inner += '<summary class="cm-section-title cm-summary-toggle">🎓 Professor Preferences & Exam Rules</summary>';
          inner += '<div class="cm-details-stack">';
          inner += '<div class="field"><div class="cm-field-label">Professor Values</div><textarea class="input" id="cm_professorValues" rows="3">' + esc(c.professorValues || '') + '</textarea></div>';
          inner += '<div class="field" style="margin-bottom:0;"><div class="cm-field-label">Allowed Materials</div><input type="text" class="input" id="cm_allowedMaterials" value="' + esc(c.allowedMaterials || '') + '"></div>';
          inner += '</div>';
          inner += '</details>';
          inner += '<div class="cm-section">';
          inner += '<input type="file" accept="application/pdf,.pdf" id="cm_importLecturePdf" style="display:none">';
          inner += '<div class="cm-upload-zone' + (lectureCount ? ' has-content' : '') + '" id="cm_lectureZone">';
          inner += '<div class="cm-upload-icon">📚</div>';
          inner += '<div class="cm-upload-title">Import Lecture Materials</div>';
          inner += '<div class="cm-upload-hint">Add lectures to improve AI grading and course context.</div>';
          inner += '<div class="cm-upload-actions">';
          inner += '<button type="button" class="cm-upload-btn" id="cm_toggleLectureUrl">🌐 From URL</button>';
          inner += '<button type="button" class="cm-upload-btn" id="cm_importLecturePdfBtn">📄 Import PDF</button>';
          inner += '</div>';
          inner += '<div class="cm-upload-meta" id="cm_lectureManifestDisplay">' + (lectureCount ? '<span class="cm-status-badge">📚 ' + lectureCount + ' lecture' + (lectureCount !== 1 ? 's' : '') + ' imported</span>' : '') + '</div>';
          inner += '</div>';
          inner += '<div class="cm-paste-area" id="cm_lectureUrlWrap" style="display:none;">';
          inner += '<div class="field" style="margin-top:12px;"><div class="cm-field-label">Lecture URL</div><input type="text" class="input" id="cm_lectureUrlInput" placeholder="Paste any URL (published Notion page, article, etc.)"></div>';
          inner += '<div class="cm-inline-actions"><button type="button" class="ghost-btn" id="cm_importLectureUrl">Import from URL</button></div>';
          inner += '</div>';
          inner += '</div>';
          inner += '<div class="syllabus-status" id="cm_lectureImportStatus" style="min-height:0;"></div>';
          inner += '<div style="display:flex;justify-content:flex-end;margin-top:12px;"><button class="big-btn" id="cmSaveSyllabus" type="button">Save Syllabus & AI</button></div>';
        } else if (activeTab === 'structure') {
          ensureCourseModules(courseName);
          var modules = c.modules || [];
          var topicCounts = {};
          getCardsForCourse(courseName).forEach(function(it) {
            var topic = String(it.topic || '').trim();
            if (!topic) return;
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          });
          var allTopics = Object.keys(topicCounts).sort(function(a, b) {
            if (topicCounts[b] !== topicCounts[a]) return topicCounts[b] - topicCounts[a];
            return a.localeCompare(b);
          });
          inner += '<div class="cm-section">';
          inner += '<div class="structure-section-header"><span class="structure-icon">📂</span><div><div class="structure-title">Subdecks</div><div class="structure-desc">Organise cards by lecture, chapter, or unit.</div></div></div>';
          inner += '<div style="display:flex;gap:8px;margin-bottom:10px;">';
          inner += '<input type="text" class="input" id="cm_newModuleName" placeholder="New subdeck name" />';
          inner += '<button type="button" class="ghost-btn" id="cm_addModule">＋ Add Subdeck</button>';
          inner += '</div>';
          if (!modules.length) inner += '<p class="help" style="margin-bottom:10px;">No subdecks yet. Create one to group topics by lecture, chapter, or unit.</p>';
          modules.forEach(function(mod, idx) {
            var mTopics = Array.isArray(mod.topics) ? mod.topics : [];
            inner += '<div class="cm-module-card" style="--course-color:' + esc(c.color || '#8b5cf6') + ';">';
            inner += '<div class="structure-module-head">';
            inner += '<input class="input" data-mod-rename="' + esc(mod.id) + '" value="' + esc(mod.name || 'Subdeck') + '" style="flex:1;">';
            inner += '<div class="structure-module-actions">';
            inner += '<button class="ghost-btn" type="button" data-mod-up="' + esc(mod.id) + '"' + (idx === 0 ? ' disabled' : '') + ' style="min-width:0;padding:6px 10px;">↑</button>';
            inner += '<button class="ghost-btn" type="button" data-mod-down="' + esc(mod.id) + '"' + (idx === modules.length - 1 ? ' disabled' : '') + ' style="min-width:0;padding:6px 10px;">↓</button>';
            inner += '<button class="ghost-btn" type="button" data-mod-save="' + esc(mod.id) + '" style="min-width:0;padding:6px 10px;">Save</button>';
            inner += '<button class="ghost-btn" type="button" data-mod-del="' + esc(mod.id) + '" style="min-width:0;padding:6px 10px;color:#ef4444;border-color:rgba(239,68,68,0.25);">Delete</button>';
            inner += '</div></div>';
            inner += '<div class="chips cm-module-topics">';
            if (!mTopics.length) inner += '<span class="help">No topics assigned</span>';
            mTopics.forEach(function(t) {
              inner += '<span class="chip" style="display:inline-flex;align-items:center;gap:6px;">' + esc(t) + '<button type="button" data-unassign-topic="' + esc(t) + '" style="border:none;background:transparent;color:var(--text-secondary);cursor:pointer;">✕</button></span>';
            });
            inner += '</div></div>';
          });
          var assigned = {};
          modules.forEach(function(m) { (m.topics || []).forEach(function(t) { assigned[t] = true; }); });
          var unassigned = allTopics.filter(function(t) { return !assigned[t]; });
          if (allTopics.length > 0) {
            inner += '<div class="cm-section-title" style="margin-top:6px;">Unassigned Topics</div>';
            if (!unassigned.length) inner += '<p class="help">All topics are assigned to a module.</p>';
            unassigned.forEach(function(t) {
              inner += '<div class="cm-topic-assignment-row">';
              inner += '<span class="chip" style="transform-origin:center;">' + esc(t) + '</span>';
              inner += '<select class="input" data-topic-target="' + esc(t) + '" style="max-width:220px;">';
              inner += '<option value="">Assign to module...</option>';
              modules.forEach(function(m) { inner += '<option value="' + esc(m.id) + '">' + esc(m.name || 'Subdeck') + '</option>'; });
              inner += '</select></div>';
            });
          }
          inner += '</div>';
          inner += '<div class="structure-divider"></div>';
          inner += '<div class="cm-section">';
          inner += '<div class="structure-section-header"><span class="structure-icon">🏷️</span><div><div class="structure-title">Topics</div><div class="structure-desc">Concepts and themes across your cards. Used for filtering, not grouping.</div></div></div>';
          if (!allTopics.length) inner += '<p class="help">No topics yet. Topics are created when you add cards.</p>';
          else {
            inner += '<div class="structure-topics">';
            allTopics.forEach(function(topic) {
              inner += '<button type="button" class="structure-topic-chip" data-topic-filter="' + esc(topic) + '"><span>' + esc(topic) + '</span><span class="count">' + topicCounts[topic] + ' card' + (topicCounts[topic] === 1 ? '' : 's') + '</span></button>';
            });
            inner += '</div>';
          }
          inner += '</div>';
        } else {
          var courseNotes = getCourseScopedMemoriesForDisplay(courseName);
          var globalNotes = getGlobalMemoriesForDisplay();
          if (!(courseNotes.length + globalNotes.length)) {
            inner += '<div class="cm-section cm-empty-state"><div class="cm-upload-icon">📝</div><div class="empty-state-title">No tutor memories yet</div><div class="empty-state-desc">The AI builds a memory of your strengths and gaps as you study.</div></div>';
          } else {
            inner += '<div id="cmCourseNotesHost">' + renderCourseTutorNotesPanelHTML(courseName) + '</div>';
            inner += '<div style="display:flex;justify-content:flex-end;margin-top:10px;">';
            inner += '<button class="ghost-btn" id="cmClearCourseNotes" type="button" style="border-color:rgba(239,68,68,0.3);color:#ef4444;">Clear memories</button>';
            inner += '</div>';
          }
        }
        var tabHost = el('cmTabContent');
        if (tabHost) {
          tabHost.innerHTML = inner;
          if (window.gsap) {
            gsap.fromTo(tabHost, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
            gsap.fromTo(
              tabHost.querySelectorAll('.cm-section, .cm-upload-zone'),
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: 0.25, stagger: 0.06, ease: 'power2.out' }
            );
          }
        }
        wireEditorTabInteractions(activeTab);
      }

      function wireEditorTabInteractions(activeTab) {
        var back = el('cmBackToList');
        if (back) back.onclick = function() {
          courseModalState.mode = 'list';
          courseModalState.course = null;
          courseModalState.tab = 'details';
          renderCourseModal();
        };
        courseModalBody.querySelectorAll('[data-course-tab]').forEach(function(btn) {
          btn.onclick = function() {
            courseModalState.tab = btn.getAttribute('data-course-tab') || 'details';
            renderTabContent();
            try { playClick(); } catch (e) {}
          };
        });

        if (activeTab === 'details') {
          var cp = el('cm_colorPicker');
          if (cp) cp.querySelectorAll('.color-swatch').forEach(function(sw) {
            sw.onclick = function() {
              cp.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
              sw.classList.add('active');
            };
          });
          var saveDetails = el('cmSaveDetails');
          if (saveDetails) saveDetails.onclick = function() {
            var oldName = c.name;
            var newName = (el('cm_name').value || '').trim();
            if (!newName) { toast('Course name required'); return; }
            if (newName !== oldName && state.courses[newName]) { toast('Course name already exists'); return; }
            var activeSwatch = cp ? cp.querySelector('.color-swatch.active') : null;
            c.color = activeSwatch ? activeSwatch.getAttribute('data-color') : (c.color || '#8b5cf6');
            c.examType = (el('cm_examType').value || 'mixed');
            c.examDate = (el('cm_examDate').value || '').trim() || null;
            var ew = (el('cm_examWeight').value || '').trim();
            c.examWeight = ew ? Math.max(0, Math.min(100, Math.round(Number(ew) || 0))) : null;
            if (newName !== oldName) {
              renameCourse(oldName, newName);
              c = getCourse(newName);
              courseName = newName;
              courseModalState.course = newName;
            }
            saveCourse(c);
            renderDashboard();
            if (!isEmbedded) renderSidebar();
            toast('Course details saved');
            renderCourseModalEditor(courseName, 'details');
          };
        } else if (activeTab === 'syllabus') {
          function setCtxStatus(msg, cls) {
            var st = el('cm_contextStatus');
            if (!st) return;
            st.className = 'syllabus-status' + (cls ? ' ' + cls : '');
            st.innerHTML = msg || '';
          }
          function renderSuggestedTopics(topics) {
            var box = el('cm_suggestedTopics');
            if (!box) return;
            box.innerHTML = '';
            (topics || []).forEach(function(t) {
              var chip = document.createElement('span');
              chip.className = 'chip';
              chip.textContent = String(t || '').trim();
              box.appendChild(chip);
            });
          }
          renderSuggestedTopics(c.syllabusKeyTopics || []);
          function runSyllabusProcess(rawText) {
            var trimmed = (rawText || '').trim();
            if (!trimmed) { toast('Paste text or import a PDF first'); return; }
            setCtxStatus('<span class="af-spinner"></span> Processing syllabus...', '');
            var examT = (el('cm_examType') && el('cm_examType').value) || c.examType || 'mixed';
            postSyllabusDistill(trimmed, c.name, examT).then(function(data) {
              if (!data || data.error) { setCtxStatus(esc(data && data.error ? String(data.error) : 'Could not process syllabus'), ''); return; }
              c.rawSyllabusText = trimmed.length > 15000 ? trimmed.slice(0, 15000) : trimmed;
              if (data.syllabusContext != null) c.syllabusContext = String(data.syllabusContext).slice(0, 4000);
              c.professorValues = data.professorValues != null && data.professorValues !== 'null' ? String(data.professorValues).slice(0, 500) : c.professorValues;
              c.allowedMaterials = data.allowedMaterials != null && data.allowedMaterials !== 'null' ? String(data.allowedMaterials) : c.allowedMaterials;
              c.syllabusKeyTopics = Array.isArray(data.keyTopics) ? data.keyTopics.slice(0, 20) : [];
              saveCourse(c);
              var prev = el('cm_syllabusPreview');
              if (prev) prev.textContent = c.syllabusContext || '';
              var meta = el('cm_syllabusMeta');
              if (meta) meta.innerHTML = '<span class="cm-status-badge">Processed</span>';
              var zone = el('cm_syllabusZone');
              if (zone) zone.classList.add('has-content');
              var wrap = el('cm_previewWrap');
              if (wrap && c.syllabusContext) wrap.style.display = '';
              var profEl = el('cm_professorValues'); if (profEl) profEl.value = c.professorValues || '';
              var alEl = el('cm_allowedMaterials'); if (alEl) alEl.value = c.allowedMaterials || '';
              renderSuggestedTopics(c.syllabusKeyTopics);
              if (pasteArea && pasteArea.style.display === 'none') animateSlideToggle(pasteArea, true);
              setCtxStatus('Syllabus processed', 'ok');
            }).catch(function() { setCtxStatus('Network error - try again', ''); });
          }
          var pdfBtn = el('cm_pdfBtn');
          var pdfFile = el('cm_pdfFile');
          if (pdfBtn && pdfFile) {
            pdfBtn.onclick = function() { pdfFile.click(); };
            pdfFile.onchange = function() {
              var f = pdfFile.files && pdfFile.files[0];
              if (!f) return;
              extractPdfText(f).then(function(text) {
                var ta = el('cm_courseContextText');
                if (ta) ta.value = text || '';
                runSyllabusProcess(text || '');
                pdfFile.value = '';
              }).catch(function(err) { toast(err && err.message ? err.message : 'Could not read PDF'); });
            };
          }
          var procBtn = el('cm_processSyllabus');
          if (procBtn) procBtn.onclick = function() { runSyllabusProcess(el('cm_courseContextText') ? el('cm_courseContextText').value : ''); };
          var reprocBtn = el('cm_reprocessSyllabus');
          if (reprocBtn) reprocBtn.onclick = function() { runSyllabusProcess(c.rawSyllabusText || (el('cm_courseContextText') ? el('cm_courseContextText').value : '')); };

          var lectureUrlToggle = el('cm_toggleLectureUrl');
          var lectureUrlWrap = el('cm_lectureUrlWrap');
          if (lectureUrlToggle) lectureUrlToggle.onclick = function() {
            var isOpen = !!(lectureUrlWrap && lectureUrlWrap.style.display !== 'none');
            animateSlideToggle(lectureUrlWrap, !isOpen);
          };

          function setLectureStatus(msg, cls) {
            var st = el('cm_lectureImportStatus');
            if (!st) return;
            st.className = 'syllabus-status' + (cls ? ' ' + cls : '');
            st.innerHTML = msg || '';
          }
          function updateLectureManifestDisplay() {
            var box = el('cm_lectureManifestDisplay');
            if (!box) return;
            var count = Number(c._lectureCount || 0) || 0;
            box.innerHTML = count > 0 ? '<span class="cm-status-badge">' + count + ' lecture' + (count !== 1 ? 's' : '') + ' imported</span>' : '';
            var zone = el('cm_lectureZone');
            if (zone) zone.classList.toggle('has-content', count > 0);
          }
          function importLectureFromText(lectureTitle, rawText) {
            var trimmed = (rawText || '').trim();
            if (!trimmed) { toast('Paste text or import a PDF first'); return Promise.resolve(null); }
            setLectureStatus('<span class="af-spinner"></span> Processing lecture...', '');
            return fetch(DISTILL_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Widget-Key': getWidgetKey() },
              body: JSON.stringify({ courseName: c.name, lectureTitle: lectureTitle || 'Lecture', rawText: trimmed, existingSyllabusContext: c.syllabusContext || '' })
            }).then(function(res) { return res.json(); }).then(function(data) {
              if (!data || data.error) { setLectureStatus(esc(data && data.error ? String(data.error) : 'Could not process lecture'), ''); return null; }
              if (data.courseDigestUpdate != null && String(data.courseDigestUpdate).trim()) c.syllabusContext = String(data.courseDigestUpdate).slice(0, 4000);
              if (data.topicChunks && data.topicChunks.length > 0) {
                var modTopics = data.topicChunks.map(function(tc) { return tc && tc.topic ? tc.topic : null; }).filter(Boolean);
                if (modTopics.length > 0) addModuleToCourse(c.name, { name: lectureTitle || 'Imported Lecture', topics: modTopics, lectureImported: true, importDate: new Date().toISOString() });
              }
              c._lectureCount = (Number(c._lectureCount || 0) || 0) + 1;
              saveCourse(c);
              if (!isEmbedded) renderSidebar();
              updateLectureManifestDisplay();
              setLectureStatus('Imported lecture context', 'ok');
              return data;
            }).catch(function() { setLectureStatus('Network error - try again', ''); return null; });
          }
          updateLectureManifestDisplay();
          var importUrlBtn = el('cm_importLectureUrl');
          if (importUrlBtn) importUrlBtn.onclick = function() {
            var inEl = el('cm_lectureUrlInput');
            var url = inEl ? String(inEl.value || '').trim() : '';
            if (!url || url.indexOf('http') !== 0) { toast('Paste a valid URL'); return; }
            setLectureStatus('<span class="af-spinner"></span> Fetching page…', '');
            fetch(FETCH_LECTURE_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Widget-Key': getWidgetKey() },
              body: JSON.stringify({ url: url })
            }).then(function(res) { return res.json(); }).then(function(data) {
              if (!data || data.error || !data.text || String(data.text).length < 200) { setLectureStatus('Could not extract enough text from this page', ''); return; }
              var title = data.title || (url.split('/').pop() || 'Lecture');
              importLectureFromText(title, String(data.text));
            }).catch(function() { setLectureStatus('Network error — try again', ''); });
          };
          var lecturePdfBtn = el('cm_importLecturePdfBtn');
          var lecturePdfFile = el('cm_importLecturePdf');
          if (lecturePdfBtn && lecturePdfFile) {
            lecturePdfBtn.onclick = function() { lecturePdfFile.click(); };
            lecturePdfFile.onchange = function() {
              var f = lecturePdfFile.files && lecturePdfFile.files[0];
              if (!f) return;
              setLectureStatus('<span class="af-spinner"></span> Extracting PDF text…', '');
              extractPdfText(f).then(function(text) {
                if (!text || String(text).length < 200) { setLectureStatus('Could not extract enough text from this PDF', ''); return; }
                importLectureFromText(String(f.name || 'Lecture').replace(/\.pdf$/i, ''), String(text));
              }).catch(function(err) { setLectureStatus(esc(err && err.message ? err.message : 'Could not read PDF'), ''); });
              lecturePdfFile.value = '';
            };
          }
          var saveSyllabus = el('cmSaveSyllabus');
          if (saveSyllabus) saveSyllabus.onclick = function() {
            c.rawSyllabusText = (el('cm_courseContextText') && el('cm_courseContextText').value.trim()) ? el('cm_courseContextText').value.trim().slice(0, 15000) : null;
            c.professorValues = (el('cm_professorValues') && el('cm_professorValues').value.trim()) ? el('cm_professorValues').value.trim().slice(0, 500) : null;
            c.allowedMaterials = (el('cm_allowedMaterials') && el('cm_allowedMaterials').value.trim()) ? el('cm_allowedMaterials').value.trim() : null;
            saveCourse(c);
            toast('Syllabus settings saved');
          };
        } else if (activeTab === 'structure') {
          var addModBtn = el('cm_addModule');
          if (addModBtn) addModBtn.onclick = function() {
            var input = el('cm_newModuleName');
            var name = input ? String(input.value || '').trim() : '';
            if (!name) { toast('Enter a subdeck name'); return; }
            addModuleToCourse(courseName, { name: name, topics: [], lectureImported: false });
            if (!isEmbedded) renderSidebar();
            renderCourseModalEditor(courseName, 'structure');
            toast('Created subdeck: ' + name);
          };
          courseModalBody.querySelectorAll('[data-mod-save]').forEach(function(btn) {
            btn.onclick = function() {
              var id = btn.getAttribute('data-mod-save');
              var input = courseModalBody.querySelector('[data-mod-rename="' + id + '"]');
              var newName = input ? String(input.value || '').trim() : '';
              if (!newName) { toast('Name cannot be empty'); return; }
              renameModule(courseName, id, newName);
              if (!isEmbedded) renderSidebar();
              toast('Subdeck renamed');
              renderCourseModalEditor(courseName, 'structure');
            };
          });
          courseModalBody.querySelectorAll('[data-mod-del]').forEach(function(btn) {
            btn.onclick = function() {
              var id = btn.getAttribute('data-mod-del');
              removeModuleFromCourse(courseName, id);
              if (!isEmbedded) renderSidebar();
              toast('Subdeck deleted');
              renderCourseModalEditor(courseName, 'structure');
            };
          });
          courseModalBody.querySelectorAll('[data-mod-up]').forEach(function(btn) {
            btn.onclick = function() {
              moveModuleInCourse(courseName, btn.getAttribute('data-mod-up'), -1);
              if (!isEmbedded) renderSidebar();
              renderCourseModalEditor(courseName, 'structure');
            };
          });
          courseModalBody.querySelectorAll('[data-mod-down]').forEach(function(btn) {
            btn.onclick = function() {
              moveModuleInCourse(courseName, btn.getAttribute('data-mod-down'), 1);
              if (!isEmbedded) renderSidebar();
              renderCourseModalEditor(courseName, 'structure');
            };
          });
          courseModalBody.querySelectorAll('[data-unassign-topic]').forEach(function(btn) {
            btn.onclick = function() {
              var topic = btn.getAttribute('data-unassign-topic');
              unassignTopicFromModules(courseName, topic);
              renderCourseModalEditor(courseName, 'structure');
            };
          });
          courseModalBody.querySelectorAll('[data-topic-target]').forEach(function(sel) {
            sel.onchange = function() {
              var topic = sel.getAttribute('data-topic-target');
              var targetModule = sel.value;
              if (!targetModule) return;
              assignTopicToModule(courseName, topic, targetModule);
              renderCourseModalEditor(courseName, 'structure');
            };
          });
          courseModalBody.querySelectorAll('[data-topic-filter]').forEach(function(btn) {
            btn.onclick = function() {
              var topic = btn.getAttribute('data-topic-filter');
              closeModals();
              sidebarSelection = { level: 'topic', course: courseName, module: null, topic: topic };
              if (!isEmbedded) renderSidebar();
              updateBreadcrumb();
              showTopicView(courseName, topic);
              try { playClick(); } catch (e) {}
            };
          });
        } else if (activeTab === 'notes') {
          var notesHost = el('cmCourseNotesHost');
          if (notesHost) wireTutorNotesPanelToggle(notesHost);
          var clearBtn = el('cmClearCourseNotes');
          if (clearBtn) clearBtn.onclick = function() {
            clearCourseTutorMemoriesForCourse(courseName);
            renderCourseModalEditor(courseName, 'notes');
          };
        }
      }

      renderTabContent();
    }

    /* Global helpers for inline course actions */
    window.openEditCourse = function(name) {
      courseModalState.mode = 'editor';
      courseModalState.course = name;
      courseModalState.tab = 'details';
      renderCourseModalEditor(name, 'details');
    };

    window.startDeleteCourse = function(name) {
      var row = el('deleteRow_' + courseKey(name));
      if (!row) return;

      if (row.style.display === 'block') { row.style.display = 'none'; row.innerHTML = ''; unfocusCourseModalItems(); return; }

      var itemCount = 0;
      for (var id in state.items) {
        if (state.items.hasOwnProperty(id) && state.items[id] && state.items[id].course === name && !state.items[id].archived) itemCount++;
      }
      var archivedCount = 0;
      for (var id2 in state.items) {
        if (state.items.hasOwnProperty(id2) && state.items[id2] && state.items[id2].course === name && state.items[id2].archived) archivedCount++;
      }
      var totalCards = itemCount + archivedCount;

      row.innerHTML = '<div style="padding:12px;border-radius:14px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.06);margin-top:8px">' +
        '<div style="font-size:11px;font-weight:700;color:var(--rate-again);margin-bottom:6px">Delete "' + esc(name) + '"?</div>' +
        '<div style="font-size:9px;color:var(--text-secondary);line-height:1.5;margin-bottom:6px">' + totalCards + ' card' + (totalCards !== 1 ? 's' : '') + ' (' + itemCount + ' active, ' + archivedCount + ' archived).</div>' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:9px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;cursor:pointer"><input type="checkbox" id="delCards_' + courseKey(name) + '"> Also permanently delete all cards</label>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="ghost-btn" data-action="confirm-delete-course" style="min-width:0;flex:1;border-color:rgba(239,68,68,0.3);color:#ef4444;">Confirm delete</button>' +
          '<button class="ghost-btn" data-action="cancel-delete-course" style="min-width:0;flex:0 0 auto;opacity:0.7;">Cancel</button>' +
        '</div>' +
      '</div>';
      row.style.display = 'block';

      /* Wire confirm/cancel buttons */
      var confirmBtn = row.querySelector('[data-action="confirm-delete-course"]');
      var cancelBtn = row.querySelector('[data-action="cancel-delete-course"]');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
          var delCardsCheckbox = el('delCards_' + courseKey(name));
          var shouldDeleteCards = delCardsCheckbox && delCardsCheckbox.checked;
          if (shouldDeleteCards) {
            /* Permanently delete all items in this course */
            var toDelete = [];
            for (var did in state.items) {
              if (state.items.hasOwnProperty(did) && state.items[did] && state.items[did].course === name) {
                toDelete.push(did);
              }
            }
            toDelete.forEach(function(did2) { delete state.items[did2]; });
          } else {
            /* Just clear the course tag from items */
            for (var id3 in state.items) {
              if (state.items.hasOwnProperty(id3) && state.items[id3] && state.items[id3].course === name) {
                state.items[id3].course = '';
              }
            }
          }
          deleteCourse(name);
          reconcileStats();
          saveState();
          toast(shouldDeleteCards ? 'Course and all cards deleted' : 'Course removed');
          renderCourseModal();
          renderDashboard();
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
          row.style.display = 'none';
          row.innerHTML = '';
          unfocusCourseModalItems();
        });
      }

      focusCourseModalItem(row);
      if (window.gsap) gsap.fromTo(row, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
    };

    window.confirmDeleteCourseNow = function(name) {
      deleteCourse(name);
      reconcileStats();
      saveState();
      renderCourseModal();
      renderDashboard();
      toast('Course deleted');
    };

    window.editCard = function(id) {
      if (typeof editItem === 'function') {
        return editItem(id);
      }
      var it = state.items[id];
      if (!it) { toast('Card not found'); return; }

      function closeSheet(animated) {
        var fe = document.querySelector('.edit-card-form');
        var bd = document.querySelector('.edit-card-backdrop');
        if (!fe && !bd) return;
        var done = function() {
          if (bd && bd.parentNode) bd.remove();
          if (fe && fe.parentNode) fe.remove();
        };
        if (animated && window.gsap && fe) {
          if (bd) gsap.to(bd, { opacity: 0, duration: 0.2 });
          gsap.to(fe, { y: '100%', duration: 0.25, ease: 'power2.in', onComplete: done });
        } else {
          done();
        }
      }

      var existing = document.querySelector('.edit-card-form');
      if (existing) {
        if (existing.getAttribute('data-edit-card-id') === id) {
          closeSheet(true);
          return;
        }
        closeSheet(false);
      }
      var orphanBd = document.querySelector('.edit-card-backdrop');
      if (orphanBd) orphanBd.remove();

      var formId = 'ef_' + Date.now();
      var optionalHTML = '';
      if (it.scenario) {
        optionalHTML += '<div><label>Scenario</label><textarea id="' + formId + '_scenario" rows="3">' + esc(it.scenario || '') + '</textarea></div>';
      }
      if (it.task) {
        optionalHTML += '<div><label>Task</label><input type="text" id="' + formId + '_task" value="' + esc(it.task || '') + '" placeholder="Apply It task instruction" /></div>';
      }
      if (it.conceptA && it.conceptB) {
        optionalHTML += '<div class="ef-row">' +
          '<div><label>Concept A</label><input type="text" id="' + formId + '_conceptA" value="' + esc(it.conceptA || '') + '" /></div>' +
          '<div><label>Concept B</label><input type="text" id="' + formId + '_conceptB" value="' + esc(it.conceptB || '') + '" /></div>' +
          '</div>';
      } else {
        if (it.conceptA) optionalHTML += '<div><label>Concept A</label><input type="text" id="' + formId + '_conceptA" value="' + esc(it.conceptA || '') + '" /></div>';
        if (it.conceptB) optionalHTML += '<div><label>Concept B</label><input type="text" id="' + formId + '_conceptB" value="' + esc(it.conceptB || '') + '" /></div>';
      }

      var backdrop = document.createElement('div');
      backdrop.className = 'edit-card-backdrop';
      document.body.appendChild(backdrop);

      var form = document.createElement('div');
      form.className = 'edit-card-form';
      form.setAttribute('data-edit-card-id', id);
      form.innerHTML =
        '<div class="ef-header"><span class="ef-title">Edit Card</span><button type="button" class="ef-close" aria-label="Close">✕</button></div>' +
        '<div><label>Prompt</label><textarea id="' + formId + '_prompt" rows="3">' + esc(it.prompt || '') + '</textarea></div>' +
        '<div><label>Model Answer</label><textarea id="' + formId + '_answer" rows="4">' + esc(it.modelAnswer || '') + '</textarea></div>' +
        '<div class="ef-row">' +
          '<div><label>Topic</label><input type="text" id="' + formId + '_topic" value="' + esc(it.topic || '') + '" placeholder="Topic tag" /></div>' +
          '<div><label>Priority</label><select id="' + formId + '_priority">' +
            '<option value="critical"' + (it.priority === 'critical' ? ' selected' : '') + '>Critical</option>' +
            '<option value="high"' + (it.priority === 'high' ? ' selected' : '') + '>High</option>' +
            '<option value="medium"' + ((it.priority === 'medium' || !it.priority) ? ' selected' : '') + '>Medium</option>' +
            '<option value="low"' + (it.priority === 'low' ? ' selected' : '') + '>Low</option>' +
          '</select></div>' +
        '</div>' +
        optionalHTML +
        '<div class="ef-actions">' +
          '<button type="button" id="' + formId + '_cancel">Cancel</button>' +
          '<button type="button" class="ef-save" id="' + formId + '_save">Save changes</button>' +
        '</div>';
      document.body.appendChild(form);

      backdrop.addEventListener('click', function(e) {
        if (e.target === backdrop) {
          closeSheet(true);
          try { playClick(); } catch (err) {}
        }
      });
      var closeBtn = form.querySelector('.ef-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function() {
          closeSheet(true);
          try { playClick(); } catch (err2) {}
        });
      }

      if (window.gsap) {
        gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25 });
        gsap.fromTo(form, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' });
      }

      el(formId + '_save').addEventListener('click', function() {
        var newPrompt = (el(formId + '_prompt').value || '').trim();
        var newAnswer = (el(formId + '_answer').value || '').trim();
        if (!newPrompt || !newAnswer) { toast('Prompt and model answer are required'); return; }

        it.prompt = newPrompt;
        it.modelAnswer = newAnswer;
        it.topic = (el(formId + '_topic').value || '').trim();
        it.priority = el(formId + '_priority').value || 'medium';

        var scenarioField = el(formId + '_scenario');
        if (scenarioField) {
          var newScenario = (scenarioField.value || '').trim();
          if (newScenario) it.scenario = newScenario; else delete it.scenario;
        }
        var taskField = el(formId + '_task');
        if (taskField) {
          var newTask = (taskField.value || '').trim();
          if (newTask) it.task = newTask; else delete it.task;
        }
        var conceptAField = el(formId + '_conceptA');
        if (conceptAField) {
          var newConceptA = (conceptAField.value || '').trim();
          if (newConceptA) it.conceptA = newConceptA; else delete it.conceptA;
        }
        var conceptBField = el(formId + '_conceptB');
        if (conceptBField) {
          var newConceptB = (conceptBField.value || '').trim();
          if (newConceptB) it.conceptB = newConceptB; else delete it.conceptB;
        }

        it.visual = null;
        state.items[id] = it;
        saveState();

        generateVisual(it).then(function(visual) {
          if (visual) { it.visual = visual; state.items[id] = it; saveState(); }
        }).catch(function() {});

        toast('Card updated');
        try { playPresetSelect(); } catch (e3) {}

        closeSheet(true);

        var courseName = it.course;
        window.viewCourseDeck(courseName);
        var cd = el('courseDetail');
        if (cd && cd.classList.contains('active')) {
          openCourseDetail(courseName);
        }
      });

      el(formId + '_cancel').addEventListener('click', function() {
        closeSheet(true);
        try { playClick(); } catch (e4) {}
      });
    };

    window.viewCourseDeck = function(name) {
      var row = el('deckRow_' + courseKey(name));
      if (!row) return;

      if (row.style.display === 'block') { row.style.display = 'none'; row.innerHTML = ''; unfocusCourseModalItems(); return; }

      var items = [];
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (it && it.course === name) items.push(it);
      }

      if (!items.length) {
        row.innerHTML = '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.03);margin-bottom:8px;">' +
          renderCourseTutorNotesPanelHTML(name) +
          '<div style="height:8px"></div>' +
          '<div style="font-size:10px;color:var(--text-secondary);text-align:center;">No cards in this course yet.</div>' +
        '</div>';
        row.style.display = 'block';
        var emptyWrap = row.firstElementChild;
        if (emptyWrap) wireTutorNotesPanelToggle(emptyWrap);
        focusCourseModalItem(row);
        return;
      }

      var byTopic = {};
      items.forEach(function(it) {
        var t = (it.topic || '').trim() || 'Uncategorised';
        if (!byTopic[t]) byTopic[t] = [];
        byTopic[t].push(it);
      });
      var topicKeys = Object.keys(byTopic).sort(function(a, b) { return a.localeCompare(b); });

      var h = '<div style="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),0.12);background:rgba(var(--accent-rgb),0.03);margin-bottom:8px;max-height:300px;overflow-y:auto;">';
      h += renderCourseTutorNotesPanelHTML(name);
      h += '<div style="height:8px"></div>';

      topicKeys.forEach(function(topic) {
        var cards = byTopic[topic];
        h += '<div style="font-size:8px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-secondary);font-weight:700;margin:8px 0 4px;">' + esc(topic) + ' (' + cards.length + ')</div>';
        cards.forEach(function(it) {
          var R = it.fsrs ? retrievability(it.fsrs, Date.now()) : 1;
          var retPct = Math.round(R * 100);
          var retColor = retPct >= 80 ? 'var(--rate-good)' : retPct >= 50 ? 'var(--rate-hard)' : 'var(--rate-again)';
          var promptPreview = (it.prompt || '').substring(0, 80) + ((it.prompt || '').length > 80 ? '…' : '');
          h += '<div data-card-id="' + it.id + '" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:10px;border:1px solid rgba(var(--accent-rgb),0.08);background:rgba(var(--accent-rgb),0.02);margin-bottom:4px;">' +
            '<div style="flex:1;min-width:0;font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(promptPreview) + '</div>' +
            '<div style="flex-shrink:0;display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:9px;font-weight:700;color:' + retColor + ';">' + retPct + '%</span>' +
              '<button style="border:none;background:rgba(59,130,246,0.10);color:#60a5fa;border-radius:6px;padding:3px 6px;font-size:9px;cursor:pointer;" onclick="editCard(\'' + it.id + '\')"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5a1.8 1.8 0 012.5 2.5L6 13l-3.5 1 1-3.5z"/><line x1="9.5" y1="4.5" x2="12" y2="7"/></svg></button>' +
              '<button style="border:none;background:rgba(239,68,68,0.08);color:#ef4444;border-radius:6px;padding:3px 6px;font-size:9px;cursor:pointer;" onclick="deleteCard(\'' + it.id + '\',\'' + esc(name).replace(/'/g, "\\'") + '\')"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg></button>' +
            '</div>' +
          '</div>';
        });
      });

      h += '</div>';
      row.innerHTML = h;
      row.style.display = 'block';
      var deckInner = row.querySelector('div[style*="max-height:300px"]');
      if (deckInner) wireTutorNotesPanelToggle(deckInner);
      focusCourseModalItem(row);

      if (window.gsap) gsap.fromTo(row, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
    };

    window.deleteCard = function(itemId, courseName) {
      if (state.items[itemId]) {
        delete state.items[itemId];
        reconcileStats();
        saveState();
        toast('Card deleted');
        viewCourseDeck(courseName);
        viewCourseDeck(courseName);
      }
    };

    /* ── Toast (lightweight) ── */
/* ── Restudy Duration Calculator ──
       Scales with model answer word count (reading time).

       Research basis:
       - Pastötter et al. (2017): test-potentiated learning effect decreases as restudy trial time increases.
       - Murphy, Bjork, & Bjork (2023): multiple brief exposures > one long one.

       Reading rate ~25 words per 5 seconds (deliberately slow to account for re-encoding effort).
       Minimum 6s, maximum 20s (diminishing returns beyond that). */
    function calcRestudyDuration(modelAnswer) {
      if (!modelAnswer) return 8000; /* 8s default */
      var txt = String(modelAnswer).trim();
      if (!txt) return 8000;
      var parts = txt.split(/\s+/);
      var wordCount = parts.length;
      var seconds = Math.ceil(wordCount / 25) * 5;
      seconds = Math.max(6, Math.min(20, seconds));
      return seconds * 1000; /* milliseconds */
    }

/* ── Boot ── */
    /* ── Dragon Mascot (topbar icon) ── */
    var mascotCtx = null;
    var mascotStage = 0;
    var mascotFlapPhase = 0;
    var mascotAnimFrame = null;

    function initMascot() {
      var c = el('mascotCanvas');
      if (!c) return;
      var dpr = window.devicePixelRatio || 1;
      dpr = Math.min(dpr, 2);
      c.width = 28 * dpr;
      c.height = 28 * dpr;
      c.style.width = '28px';
      c.style.height = '28px';
      mascotCtx = c.getContext('2d');
      mascotCtx.scale(dpr, dpr);

      /* Read dragon stage from SyncEngine */
      updateMascotStage();
      startMascotLoop();
    }

    function updateMascotStage() {
      var xp = 0;
      try { xp = SyncEngine.get('dragon', 'xp') || 0; } catch(e) {}
      mascotStage = getDragonGrowthStageFromXp(xp);
    }

    function startMascotLoop() {
      function tick() {
        mascotFlapPhase += 0.04;
        drawMascot();
        mascotAnimFrame = requestAnimationFrame(tick);
      }
      tick();
    }

    function drawMascot() {
      var ctx = mascotCtx;
      if (!ctx) return;
      ctx.clearRect(0, 0, 28, 28);

      var cx = 14, cy = 14;
      var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';
      var accentRGB = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '139,92,246';

      if (mascotStage === 0) {
        drawEggMascot(ctx, cx, cy, accent, accentRGB);
      } else {
        drawDragonMascot(ctx, cx, cy, accent, accentRGB, mascotStage);
      }
    }

    function drawEggMascot(ctx, cx, cy, accent, rgb) {
      /* Subtle idle wobble */
      var wobble = Math.sin(mascotFlapPhase * 1.5) * 1.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(wobble * Math.PI / 180);

      /* Glow */
      var glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 12);
      glow.addColorStop(0, 'rgba(' + rgb + ',0.25)');
      glow.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-14, -14, 28, 28);

      /* Egg body */
      ctx.beginPath();
      ctx.ellipse(0, 1, 6, 8, 0, 0, Math.PI * 2);
      var grad = ctx.createLinearGradient(-6, -8, 6, 8);
      grad.addColorStop(0, accent);
      grad.addColorStop(0.5, 'rgba(' + rgb + ',0.7)');
      grad.addColorStop(1, 'rgba(' + rgb + ',0.4)');
      ctx.fillStyle = grad;
      ctx.fill();

      /* Highlight */
      ctx.beginPath();
      ctx.ellipse(-2, -3, 2, 3, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      /* Crack lines */
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-2, 1); ctx.lineTo(0, -1); ctx.lineTo(2, 2);
      ctx.stroke();

      ctx.restore();
    }

    function drawDragonMascot(ctx, cx, cy, accent, rgb, stage) {
      var flap = Math.sin(mascotFlapPhase * 2.5);
      var breathe = Math.sin(mascotFlapPhase * 1.2) * 0.5;

      ctx.save();
      ctx.translate(cx, cy + breathe);

      /* Glow (stronger at higher stages) */
      var glowSize = 10 + stage;
      var glowAlpha = 0.12 + stage * 0.03;
      var glow = ctx.createRadialGradient(0, 0, 2, 0, 0, glowSize);
      glow.addColorStop(0, 'rgba(' + rgb + ',' + glowAlpha + ')');
      glow.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-14, -14, 28, 28);

      /* Body size scales with stage */
      var bodyW = 4 + stage * 0.4;
      var bodyH = 5 + stage * 0.5;

      /* Wings */
      var wingSpan = 5 + stage * 0.8;
      var wingY = -2 + flap * 2;
      ctx.fillStyle = 'rgba(' + rgb + ',0.5)';
      /* Left wing */
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.quadraticCurveTo(-wingSpan - 2, wingY - 4, -wingSpan, wingY);
      ctx.quadraticCurveTo(-wingSpan + 2, wingY + 2, -1, 2);
      ctx.fill();
      /* Right wing */
      ctx.beginPath();
      ctx.moveTo(1, 0);
      ctx.quadraticCurveTo(wingSpan + 2, wingY - 4, wingSpan, wingY);
      ctx.quadraticCurveTo(wingSpan - 2, wingY + 2, 1, 2);
      ctx.fill();

      /* Body */
      ctx.beginPath();
      ctx.ellipse(0, 1, bodyW, bodyH, 0, 0, Math.PI * 2);
      var bodyGrad = ctx.createLinearGradient(-bodyW, -bodyH, bodyW, bodyH);
      bodyGrad.addColorStop(0, accent);
      bodyGrad.addColorStop(1, 'rgba(' + rgb + ',0.6)');
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      /* Head */
      var headR = 3 + stage * 0.2;
      ctx.beginPath();
      ctx.arc(0, -bodyH + 1, headR, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();

      /* Eyes */
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-1.2, -bodyH + 0.5, 1, 0, Math.PI * 2);
      ctx.arc(1.2, -bodyH + 0.5, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(-1, -bodyH + 0.5, 0.5, 0, Math.PI * 2);
      ctx.arc(1.4, -bodyH + 0.5, 0.5, 0, Math.PI * 2);
      ctx.fill();

      /* Horns (stage 2+) */
      if (stage >= 2) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-2, -bodyH - 1);
        ctx.lineTo(-3.5, -bodyH - 4);
        ctx.moveTo(2, -bodyH - 1);
        ctx.lineTo(3.5, -bodyH - 4);
        ctx.stroke();
      }

      /* Crown glow (stage 4+) */
      if (stage >= 4) {
        var crownGlow = ctx.createRadialGradient(0, -bodyH - 3, 0, 0, -bodyH - 3, 5);
        crownGlow.addColorStop(0, 'rgba(245,158,11,0.35)');
        crownGlow.addColorStop(1, 'rgba(245,158,11,0)');
        ctx.fillStyle = crownGlow;
        ctx.fillRect(-8, -bodyH - 8, 16, 10);

        /* Tiny crown */
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-2.5, -bodyH - 2);
        ctx.lineTo(-1.5, -bodyH - 4.5);
        ctx.lineTo(0, -bodyH - 3);
        ctx.lineTo(1.5, -bodyH - 4.5);
        ctx.lineTo(2.5, -bodyH - 2);
        ctx.closePath();
        ctx.fill();
      }

      /* Tail */
      ctx.strokeStyle = 'rgba(' + rgb + ',0.6)';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, bodyH);
      var tailWag = Math.sin(mascotFlapPhase * 3) * 2;
      ctx.quadraticCurveTo(3 + tailWag, bodyH + 3, 2 + tailWag, bodyH + 5);
      ctx.stroke();

      ctx.restore();
    }

    /* ═══════════════════════════════════════════
       CANVAS ANALYTICS ENGINE
       ═══════════════════════════════════════════ */

    function getCanvasCtx(canvasId, w, h) {
      var c = el(canvasId);
      if (!c) return null;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      var ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      return { ctx: ctx, w: w, h: h };
    }

    function getAccentRGB() {
      var s = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
      return s || '139,92,246';
    }
    function getTextSecondary() {
      return getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6b7280';
    }
    function getTextColor() {
      return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1a1a2e';
    }

    /* ── Graph 1: Retention Curve (interactive) ── */
    /* Stores computed point data per canvas for hover lookups */
    var retentionGraphData = {};

/* ── Retention Graph Hover Interactivity ── */
    function hideCanvasTooltip() {
      var tooltip = el('canvasTooltip');
      if (tooltip) tooltip.classList.remove('show');
    }

    function showCanvasTooltip(canvasId, pt, label, itemCount, clientX, clientY) {
      var tooltip = el('canvasTooltip');
      if (!tooltip) return;

      var dayLabel = pt.day === 0 ? 'Today' : pt.day === 1 ? 'Tomorrow' : 'Day ' + pt.day;
      el('ctDay').textContent = dayLabel;
      el('ctRet').textContent = Math.round(pt.retention * 100) + '%';
      el('ctCourse').textContent = (label || 'All courses') + ' · ' + itemCount + ' card' + (itemCount !== 1 ? 's' : '');

      var retCol = pt.retention >= 0.85 ? 'var(--rate-good)' : pt.retention >= 0.65 ? 'var(--rate-hard)' : 'var(--rate-again)';
      el('ctRet').style.color = retCol;

      var tipW = 160;
      var left = clientX - (tipW / 2);
      left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
      var top = clientY - 68;
      if (top < 6) top = clientY + 16;
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
      tooltip.classList.add('show');
    }

    function drawRetentionHighlight(canvasId, idx) {
      if (idx == null || idx < 0) return;
      var data = retentionGraphData[canvasId];
      var canvas = el(canvasId);
      if (!data || !canvas || !data.points || !data.points.length) return;

      var pt = data.points[idx];
      var rgb = getAccentRGB();
      var ctx = canvas.getContext('2d');
      if (!ctx) return;

      /* Canvas is already scaled in getCanvasCtx() */
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(' + rgb + ',0.2)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(pt.x, data.pad.top);
      ctx.lineTo(pt.x, data.pad.top + data.gh);
      ctx.stroke();
      ctx.setLineDash([]);

      var glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 10);
      glow.addColorStop(0, 'rgba(' + rgb + ',0.3)');
      glow.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + rgb + ',1)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      ctx.restore();
    }

    function redrawRetentionBase(canvasId) {
      var data = retentionGraphData[canvasId];
      if (!data) return;
      drawRetentionCurve(canvasId, data.lastItemsByFilter || {}, data.lastLabelPrefix || '');
    }

/* Wire canvas mouse/touch events for retention graphs */
    var wiredRetentionCanvases = {};
    function wireRetentionInteractivity(canvasId) {
      if (wiredRetentionCanvases[canvasId]) return;
      var canvas = el(canvasId);
      if (!canvas) return;

      wiredRetentionCanvases[canvasId] = true;

      canvas.addEventListener('mousemove', function(e) {
        handleRetentionHover(canvasId, e.clientX, e.clientY);
      });
      canvas.addEventListener('mouseleave', function() {
        hideCanvasTooltip();
        /* Restore cached base graph instead of full redraw */
        var data = retentionGraphData[canvasId];
        if (data && data.baseImage) {
          canvas.getContext('2d').putImageData(data.baseImage, 0, 0);
        }
      });

      canvas.addEventListener('touchmove', function(e) {
        if (e.touches && e.touches.length === 1) {
          e.preventDefault();
          var t = e.touches[0];
          handleRetentionHover(canvasId, t.clientX, t.clientY);
        }
      }, { passive: false });
      canvas.addEventListener('touchend', function() {
        setTimeout(hideCanvasTooltip, 1200);
        /* Restore cached base graph instead of full redraw */
        var data = retentionGraphData[canvasId];
        if (data && data.baseImage) {
          canvas.getContext('2d').putImageData(data.baseImage, 0, 0);
        }
      });
    }

    /* ── Graph 2: Session History Sparkline (30 days) ── */
/* ── Graph 3: Tier Distribution Ring ── */
/* ── Activity heatmap (dashboard; sparkline + tier ring replaced in UI) ── */
    function drawActivityHeatmap(containerId) {
      var host = document.getElementById(containerId);
      if (!host) return;

      // State for current viewed month
      if (!drawActivityHeatmap._viewYear) {
        drawActivityHeatmap._viewYear = new Date().getFullYear();
        drawActivityHeatmap._viewMonth = new Date().getMonth(); // 0-indexed
      }
      var viewYear = drawActivityHeatmap._viewYear;
      var viewMonth = drawActivityHeatmap._viewMonth;

      // Gather session data
      var dayMap = {};
      try {
        var analytics = SyncEngine.get('studyengine', 'tutorAnalytics');
        if (analytics && analytics.sessionHistory) {
          analytics.sessionHistory.forEach(function(row) {
            if (!row || !row.date) return;
            var key = row.date; // "YYYY-MM-DD"
            dayMap[key] = (dayMap[key] || 0) + (row.cards || 0);
          });
        }
      } catch (e) {}

      var hasSessionData = !!(state.stats && state.stats.lastSessionDate);
      if (!hasSessionData) {
        for (var dayKey in dayMap) {
          if (dayMap.hasOwnProperty(dayKey) && dayMap[dayKey] > 0) {
            hasSessionData = true;
            break;
          }
        }
      }
      if (!hasSessionData) {
        host.innerHTML =
          '<div class="chart-empty">' +
          '  <div class="chart-empty-icon">📅</div>' +
          '  <div class="chart-empty-title">No sessions yet</div>' +
          '  <div class="chart-empty-desc">Start a session to track your daily study activity.</div>' +
          '</div>';
        if (window.gsap) {
          var activityEmpty = host.querySelector('.chart-empty');
          if (activityEmpty) {
            gsap.fromTo(activityEmpty,
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
            );
          }
        }
        return;
      }

      // Also check state.stats for today if a session just completed
      // (sessionHistory might not have it yet)

      var now = new Date();
      var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

      // Month info
      var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
      // Convert to Monday-start: Mon=0, Tue=1, ... Sun=6
      var startOffset = (firstDow + 6) % 7;

      // Determine if we can navigate forward (don't go past current month)
      var isCurrentMonth = (viewYear === now.getFullYear() && viewMonth === now.getMonth());

      // Intensity function
      function getIntensity(cards) {
        if (!cards || cards <= 0) return 'rgba(var(--accent-rgb), 0.06)';
        if (cards <= 3) return 'rgba(var(--accent-rgb), 0.20)';
        if (cards <= 8) return 'rgba(var(--accent-rgb), 0.38)';
        if (cards <= 15) return 'rgba(var(--accent-rgb), 0.55)';
        if (cards <= 25) return 'rgba(var(--accent-rgb), 0.72)';
        return 'rgba(var(--accent-rgb), 0.90)';
      }

      // Compute streak from dayMap
      var streakCount = 0;
      var checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      // Check if today has activity; if not, start from yesterday
      var todayCards = dayMap[todayStr] || 0;
      if (todayCards <= 0) {
        checkDate.setDate(checkDate.getDate() - 1);
      }
      for (var s = 0; s < 365; s++) {
        var ck = checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + String(checkDate.getDate()).padStart(2, '0');
        if ((dayMap[ck] || 0) > 0) {
          streakCount++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      // Compute month total
      var monthTotal = 0;
      for (var d = 1; d <= daysInMonth; d++) {
        var dk = viewYear + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        monthTotal += (dayMap[dk] || 0);
      }

      // Build HTML
      var h = '<div class="cal-heatmap-wrap">';

      // Nav
      h += '<div class="cal-heatmap-nav">';
      h += '<button class="cal-heatmap-nav-btn" id="calHeatPrev">◀</button>';
      h += '<span class="cal-heatmap-title">' + monthNames[viewMonth] + ' ' + viewYear + '</span>';
      h += '<button class="cal-heatmap-nav-btn" id="calHeatNext"' + (isCurrentMonth ? ' disabled style="opacity:0.3;cursor:default"' : '') + '>▶</button>';
      h += '</div>';

      // Grid
      h += '<div class="cal-heatmap-grid">';

      // Day-of-week headers (Mon-start)
      var dowLabels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
      dowLabels.forEach(function(dl) {
        h += '<div class="cal-heatmap-dow">' + dl + '</div>';
      });

      // Empty cells before first day
      for (var e = 0; e < startOffset; e++) {
        h += '<div class="cal-heatmap-cell empty"></div>';
      }

      // Day cells
      for (var day = 1; day <= daysInMonth; day++) {
        var dateStr = viewYear + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        var cards = dayMap[dateStr] || 0;
        var bg = getIntensity(cards);
        var isToday = (dateStr === todayStr);
        var isFuture = new Date(viewYear, viewMonth, day) > now;
        var cls = 'cal-heatmap-cell';
        if (isToday) cls += ' today';
        if (isFuture) cls += ' future';
        h += '<div class="' + cls + '" data-date="' + dateStr + '" data-cards="' + cards + '" style="background:' + bg + (cards > 0 ? ';box-shadow:inset 0 0 8px rgba(var(--accent-rgb),' + (Math.min(0.3, cards * 0.02)) + ')' : '') + '">' + day + '</div>';
      }

      h += '</div>'; // grid

      // Stats row
      h += '<div class="cal-heatmap-stats">';
      h += '<span class="cal-heatmap-streak">' + (streakCount > 0 ? '🔥 ' + streakCount + ' day streak' : 'No streak') + '</span>';
      h += '<span>' + monthTotal + ' reviews</span>';
      h += '</div>';

      h += '</div>'; // wrap

      host.innerHTML = h;

      // Tooltip
      var tooltip = document.createElement('div');
      tooltip.className = 'cal-heatmap-tooltip';
      document.body.appendChild(tooltip);
      // Remove old tooltips
      document.querySelectorAll('.cal-heatmap-tooltip').forEach(function(t, i) {
        if (i > 0) t.remove(); // keep only the latest
      });

      host.querySelectorAll('.cal-heatmap-cell:not(.empty)').forEach(function(cell) {
        cell.addEventListener('mouseenter', function() {
          var date = cell.getAttribute('data-date');
          var c = parseInt(cell.getAttribute('data-cards'), 10) || 0;
          var parts = date.split('-');
          var mo = monthNames[parseInt(parts[1], 10) - 1] || '';
          tooltip.textContent = mo + ' ' + parseInt(parts[2], 10) + ': ' + c + ' card' + (c !== 1 ? 's' : '');
          tooltip.classList.add('show');
          var rect = cell.getBoundingClientRect();
          tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
          tooltip.style.top = (rect.top - tooltip.offsetHeight - 6) + 'px';
        });
        cell.addEventListener('mouseleave', function() {
          tooltip.classList.remove('show');
        });
      });

      // Nav handlers
      var prevBtn = document.getElementById('calHeatPrev');
      var nextBtn = document.getElementById('calHeatNext');
      if (prevBtn) {
        prevBtn.addEventListener('click', function() {
          drawActivityHeatmap._viewMonth--;
          if (drawActivityHeatmap._viewMonth < 0) {
            drawActivityHeatmap._viewMonth = 11;
            drawActivityHeatmap._viewYear--;
          }
          drawActivityHeatmap(containerId);
          try { if (typeof playClick === 'function') playClick(); } catch(e) {}
        });
      }
      if (nextBtn && !isCurrentMonth) {
        nextBtn.addEventListener('click', function() {
          drawActivityHeatmap._viewMonth++;
          if (drawActivityHeatmap._viewMonth > 11) {
            drawActivityHeatmap._viewMonth = 0;
            drawActivityHeatmap._viewYear++;
          }
          drawActivityHeatmap(containerId);
          try { if (typeof playClick === 'function') playClick(); } catch(e) {}
        });
      }

      // GSAP animation
      if (window.gsap) {
        gsap.fromTo(host.querySelectorAll('.cal-heatmap-cell:not(.empty)'),
          { opacity: 0, scale: 0.7 },
          { opacity: 1, scale: 1, duration: 0.3, stagger: 0.01, ease: 'back.out(1.4)' }
        );
      }
    }

    function renderActivityStats(containerId) {
      // Stats are now rendered inside drawActivityHeatmap, so this is a no-op.
      // Kept for API compatibility.
    }

    /* ── Draw all analytics ── */
    function renderAnalytics(courseFilter) {
      // Guard: analytics DOM is only present while dashboard/context views are mounted.
      var analyticsHost = el('activityHeatmapHost') || el('analyticsArea') || el('analyticsWrap') || el('heatmapCanvas');
      if (!analyticsHost) return;

      var items = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (courseFilter && courseFilter !== 'All' && it.course !== courseFilter) continue;
        items[id] = it;
      }

      renderRetentionFilterChips();
      renderRetentionGraph();
      drawActivityHeatmap('activityHeatmapHost');
      renderActivityStats('activityHeatmapHost');

      /* Cram banner */
      var cramEl = el('cramBanner');
      var cramTextEl = el('cramText');
      if (!cramEl || !cramTextEl) return;
      if (courseFilter && courseFilter !== 'All') {
        var cramState = getCramState(courseFilter);
        if (cramState.active) {
          cramEl.classList.add('show');
          var labels = { critical: 'CRAM MODE', high: 'Exam soon', moderate: 'Exam approaching', low: 'Exam in range' };
          cramTextEl.textContent = (labels[cramState.intensity] || 'Exam prep') + ' — ' + cramState.daysUntil + ' day' + (cramState.daysUntil !== 1 ? 's' : '') + ' remaining';
        } else {
          cramEl.classList.remove('show');
        }
      } else {
        cramEl.classList.remove('show');
      }
    }

    /* ═══════════════════════════════════════════
       PER-COURSE ADVANCED ANALYTICS
       ═══════════════════════════════════════════ */

    function colorToRgbaBottom(colorStr, alpha) {
      if (!colorStr) return 'rgba(128,128,128,' + alpha + ')';
      colorStr = String(colorStr).trim();
      if (colorStr.charAt(0) === '#') {
        var hex = colorStr.slice(1);
        if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
        var r = parseInt(hex.slice(0, 2), 16);
        var g = parseInt(hex.slice(2, 4), 16);
        var b = parseInt(hex.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
      }
      var m = colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha + ')';
      return colorStr;
    }

    /* ── Rating History (last 30 reviews for this course) ── */
    function drawCourseRatingHistory(canvasId, courseName) {
      var canvas = el(canvasId);
      if (!canvas) return;
      var parent = canvas.parentElement;
      var pw = parent ? parent.clientWidth - 24 : 280;
      pw = Math.max(180, Math.min(pw, 600));
      var ph = 100;

      var r = getCanvasCtx(canvasId, pw, ph);
      if (!r) return;
      var ctx = r.ctx, w = r.w, h = r.h;
      var rgb = getAccentRGB();
      var textSec = getTextSecondary();

      var history = (state.calibration && state.calibration.history) || [];
      var courseHistory = courseName ? history.filter(function(entry) { return entry && entry.course === courseName; }) : history;
      var last30 = courseHistory.slice(-30);
      if (last30.length === 0) {
        ctx.fillStyle = textSec;
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Complete reviews to see rating history', w / 2, h / 2);
        return;
      }

      var ratingColors = {
        1: getComputedStyle(document.documentElement).getPropertyValue('--rate-again').trim() || '#ef4444',
        2: getComputedStyle(document.documentElement).getPropertyValue('--rate-hard').trim() || '#f59e0b',
        3: getComputedStyle(document.documentElement).getPropertyValue('--rate-good').trim() || '#22c55e',
        4: getComputedStyle(document.documentElement).getPropertyValue('--rate-easy').trim() || '#3b82f6'
      };

      var pad = { left: 4, right: 4, top: 8, bottom: 4 };
      var gw = w - pad.left - pad.right;
      var gh = h - pad.top - pad.bottom;
      var gap = 3;
      var barW = Math.max(4, Math.floor((gw - gap * (last30.length - 1)) / last30.length));

      ctx.strokeStyle = 'rgba(' + rgb + ',0.06)';
      ctx.lineWidth = 0.5;
      [0.25, 0.5, 0.75].forEach(function(v) {
        var gy = pad.top + gh - (v * gh);
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(w - pad.right, gy);
        ctx.stroke();
      });

      last30.forEach(function(entry, i) {
        var rating = entry.rating || 2;
        var col = ratingColors[rating] || ratingColors[2];
        var barH = Math.max(rating > 0 ? 4 : 0, (rating / 4) * gh);
        var x = pad.left + i * (barW + gap);
        var y = pad.top + gh - barH;

        var grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, col);
        grad.addColorStop(1, colorToRgbaBottom(col, 0.4));
        ctx.fillStyle = grad;
        var radius = Math.min(barW / 2, 4);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barW, barH);
        }

        if (i === last30.length - 1) {
          ctx.shadowColor = col;
          ctx.shadowBlur = 10;
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
      });

      /* Trend line (moving average of 5) */
      if (last30.length >= 5) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(' + rgb + ',0.5)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        for (var i = 2; i < last30.length - 2; i++) {
          var avg = 0;
          for (var j = i - 2; j <= i + 2; j++) avg += (last30[j].rating || 2);
          avg /= 5;
          var x = pad.left + i * (barW + gap) + barW / 2;
          var y = pad.top + gh - (avg / 4) * gh;
          if (i === 2) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    /* ── Stability Distribution ── */
    function drawStabilityDistribution(canvasId, courseItems) {
      var canvas = el(canvasId);
      if (!canvas) return;
      var parent = canvas.parentElement;
      var pw = parent ? parent.clientWidth - 24 : 200;
      pw = Math.max(140, Math.min(pw, 400));
      var ph = 100;

      var r = getCanvasCtx(canvasId, pw, ph);
      if (!r) return;
      var ctx = r.ctx, w = r.w, h = r.h;
      var textSec = getTextSecondary();
      var textCol = getTextColor();
      var rgb = getAccentRGB();

      var buckets = [
        { label: 'Fragile', min: 0, max: 5, color: '#ef4444', count: 0 },
        { label: 'Developing', min: 5, max: 15, color: '#f59e0b', count: 0 },
        { label: 'Solid', min: 15, max: 60, color: '#22c55e', count: 0 },
        { label: 'Strong', min: 60, max: Infinity, color: '#3b82f6', count: 0 }
      ];

      var total = 0;
      for (var id in courseItems) {
        if (!courseItems.hasOwnProperty(id)) continue;
        var it = courseItems[id];
        if (!it || !it.fsrs || !it.fsrs.stability) continue;
        var s = it.fsrs.stability;
        total++;
        for (var b = 0; b < buckets.length; b++) {
          if (s >= buckets[b].min && s < buckets[b].max) {
            buckets[b].count++;
            break;
          }
        }
      }

      if (total === 0) {
        ctx.fillStyle = textSec;
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Review cards to see stability data', w / 2, h / 2);
        return;
      }

      var pad = { left: 8, right: 8, top: 10, bottom: 24 };
      var gw = w - pad.left - pad.right;
      var gh = h - pad.top - pad.bottom;
      var gap = 8;
      var barW = Math.max(20, Math.floor((gw - gap * 3) / 4));
      var maxCount = Math.max(1, Math.max.apply(null, buckets.map(function(b) { return b.count; })));

      ctx.strokeStyle = 'rgba(' + rgb + ',0.06)';
      ctx.lineWidth = 0.5;
      [0.25, 0.5, 0.75].forEach(function(v) {
        var gy = pad.top + gh - (v * gh);
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(w - pad.right, gy);
        ctx.stroke();
      });

      buckets.forEach(function(bucket, i) {
        var x = pad.left + i * (barW + gap);
        var barH = Math.max(bucket.count > 0 ? 4 : 0, (bucket.count / maxCount) * gh);
        var y = pad.top + gh - barH;

        var grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, bucket.color);
        grad.addColorStop(1, colorToRgbaBottom(bucket.color, 0.4));
        ctx.fillStyle = grad;
        var radius = Math.min(barW / 2, 4);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barW, barH);
        }

        if (bucket.count === maxCount && bucket.count > 0) {
          ctx.shadowColor = bucket.color;
          ctx.shadowBlur = 10;
          ctx.fillStyle = bucket.color;
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barW, barH);
          }
          ctx.shadowBlur = 0;
        }

        /* Count label above bar */
        if (bucket.count > 0) {
          ctx.fillStyle = textCol;
          ctx.font = '800 9px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(bucket.count), x + barW / 2, y - 3);
        }

        /* Bucket label below */
        ctx.fillStyle = textSec;
        ctx.font = '600 7px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(bucket.label, x + barW / 2, h - pad.bottom + 4);

        /* Days range */
        var rangeText = bucket.max === Infinity ? '60d+' : '<' + bucket.max + 'd';
        ctx.font = '500 6px Inter, system-ui, sans-serif';
        ctx.fillText(rangeText, x + barW / 2, h - pad.bottom + 14);
      });
    }

    /* ── Tier Accuracy (avg FSRS rating per tier) ── */
    function drawTierAccuracy(canvasId, courseName) {
      var canvas = el(canvasId);
      if (!canvas) return;
      var parent = canvas.parentElement;
      var pw = parent ? parent.clientWidth - 24 : 200;
      pw = Math.max(140, Math.min(pw, 400));
      var ph = 100;

      var r = getCanvasCtx(canvasId, pw, ph);
      if (!r) return;
      var ctx = r.ctx, w = r.w, h = r.h;
      var textSec = getTextSecondary();
      var textCol = getTextColor();

      /* Collect ratings per tier from calibration history (filtered by course) */
      var history = (state.calibration && state.calibration.history) || [];
      var filteredHistory = courseName ? history.filter(function(entry) { return entry && entry.course === courseName; }) : history;
      var tierData = {
        quickfire: { sum: 0, count: 0 },
        explain: { sum: 0, count: 0 },
        apply: { sum: 0, count: 0 },
        distinguish: { sum: 0, count: 0 },
        mock: { sum: 0, count: 0 },
        worked: { sum: 0, count: 0 }
      };

      filteredHistory.forEach(function(entry) {
        if (!entry || !entry.tier || !entry.rating) return;
        if (tierData[entry.tier]) {
          tierData[entry.tier].sum += entry.rating;
          tierData[entry.tier].count++;
        }
      });

      var tierOrder = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
      var tierLabels = { quickfire: 'QF', explain: 'EI', apply: 'AI', distinguish: 'DI', mock: 'ME', worked: 'WE' };
      var tierColors = {
        quickfire: '#3b82f6',
        explain: '#8b5cf6',
        apply: '#f59e0b',
        distinguish: '#ec4899',
        mock: '#ef4444',
        worked: '#10b981'
      };

      var hasData = false;
      tierOrder.forEach(function(t) { if (tierData[t].count > 0) hasData = true; });

      if (!hasData) {
        ctx.fillStyle = textSec;
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Complete reviews to see tier accuracy', w / 2, h / 2);
        return;
      }

      var pad = { left: 8, right: 8, top: 10, bottom: 24 };
      var gw = w - pad.left - pad.right;
      var gh = h - pad.top - pad.bottom;
      var gap = 6;
      var nBars = tierOrder.length;
      var barW = Math.max(16, Math.floor((gw - gap * (nBars - 1)) / nBars));

      var maxTierCount = Math.max.apply(null, tierOrder.map(function(tt) { return tierData[tt].count; }));

      /* Rating scale lines (1-4) */
      var rgb = getAccentRGB();
      ctx.strokeStyle = 'rgba(' + rgb + ',0.06)';
      ctx.lineWidth = 0.5;
      [1, 2, 3, 4].forEach(function(v) {
        var y = pad.top + gh - ((v / 4) * gh);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      });

      tierOrder.forEach(function(t, i) {
        var d = tierData[t];
        var x = pad.left + i * (barW + gap);
        var avg = d.count > 0 ? (d.sum / d.count) : 0;
        var barH = Math.max(avg > 0 ? 4 : 0, (avg / 4) * gh);
        var y = pad.top + gh - barH;

        /* Bar colour based on average rating */
        var barCol = tierColors[t];
        if (d.count === 0) barCol = 'rgba(' + rgb + ',0.08)';

        var grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, barCol);
        grad.addColorStop(1, colorToRgbaBottom(barCol, 0.4));
        ctx.fillStyle = grad;
        var radius = Math.min(barW / 2, 4);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barW, barH);
        }

        if (d.count > 0 && d.count === maxTierCount) {
          ctx.shadowColor = barCol;
          ctx.shadowBlur = 10;
          ctx.fillStyle = barCol;
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barW, barH);
          }
          ctx.shadowBlur = 0;
        }

        /* Average value above bar */
        if (d.count > 0) {
          var avgDisplay = (Math.round(avg * 10) / 10).toFixed(1);
          ctx.fillStyle = textCol;
          ctx.font = '800 8px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(avgDisplay, x + barW / 2, y - 3);
        }

        /* Tier label */
        ctx.fillStyle = d.count > 0 ? textSec : 'rgba(' + rgb + ',0.15)';
        ctx.font = '700 7px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(tierLabels[t], x + barW / 2, h - pad.bottom + 4);

        /* Review count */
        ctx.font = '500 6px Inter, system-ui, sans-serif';
        ctx.fillText(d.count > 0 ? 'n=' + d.count : '—', x + barW / 2, h - pad.bottom + 14);
      });
    }

    /* ── Course Detail View ── */
    function closeCourseDetail() {
      el('courseDetail').classList.remove('active');
      el('courseDetail').style.display = 'none';
      /* Return to courses tab */
      switchNav('courses');
      var gearBtn = document.querySelector('.topbar-right .icon-btn');
      if (gearBtn) gearBtn.style.display = (activeNav === 'courses') ? 'none' : '';
    }

    el('cdBack').addEventListener('click', closeCourseDetail);
    el('cdStartSession').addEventListener('click', function() {
      var title = el('cdTitle').textContent;
      if (title && title !== '—') {
        selectedCourse = title;
        closeCourseDetail();
        startSession();
      }
    });

    /* Redraw canvases on resize */
    var resizeTimer = null;
    window.addEventListener('resize', function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (viewDash.classList.contains('active')) {
          renderAnalytics(selectedCourse);
        }
      }, 200);
    });

    var focusResyncBound = false;
    var bootBindingsBound = false;
    var bootDidInit = false;
    function finishBoot() {
      if (bootDidInit) return;
      bootDidInit = true;
      loadOptimizedWeights();
      initMascot();
      ensureShortcutHelpButton();
      wireGlobalTutorNotesUI();
      renderDashboard();
      showView('viewDash');

      // ── Sidebar Init (standalone only) ──
      if (!isEmbedded) {
        try { renderSidebar(); } catch (eSb) {}
        try { updateBreadcrumb(); } catch (eBc) {}

        var collapseBtn = document.getElementById('sidebarCollapseBtn');
        if (collapseBtn) {
          collapseBtn.addEventListener('click', function() {
            var sb = document.getElementById('sidebar');
            if (sb) sb.classList.toggle('collapsed');
          });
        }

        // Footer + topbar actions bridge to existing buttons
        var sbAdd = document.getElementById('sbAddCard');
        if (sbAdd) sbAdd.addEventListener('click', function() {
          var b = el('addBtn');
          if (b) b.click();
        });
        var sbImport = document.getElementById('sbImport');
        if (sbImport) sbImport.addEventListener('click', function() {
          var b = el('importBtn');
          if (b) b.click();
        });
        var sbSettings = document.getElementById('sbSettings');
        if (sbSettings) sbSettings.addEventListener('click', function() {
          var b = el('gearBtn');
          if (b) b.click();
        });
        var sbArchived = document.getElementById('sbArchivedBtn');
        if (sbArchived) sbArchived.addEventListener('click', function() {
          openArchivedCoursesOverlay();
        });
        var mainAdd = document.getElementById('mainAddCard');
        if (mainAdd) mainAdd.addEventListener('click', function() {
          var b = el('addBtn');
          if (b) b.click();
        });
        var mainSet = document.getElementById('mainSettingsBtn');
        if (mainSet) mainSet.addEventListener('click', function() {
          var b = el('gearBtn');
          if (b) b.click();
        });

        // Main tabs: HOME resets sidebar selection; COURSES opens course manager
        var mainTabs = document.getElementById('mainTabs');
        if (mainTabs) {
          mainTabs.querySelectorAll('.nav-tab').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var tab = btn.getAttribute('data-nav');
              if (!tab) return;
              if (tab === 'home') {
                sidebarSelection = { level: 'all', course: null, module: null, topic: null };
                renderSidebar();
                updateBreadcrumb();
                hideContextViews();
                showView('viewDash');
                switchNav('home');
                return;
              }
              if (tab === 'courses') {
                try { openCourseModal && openCourseModal(); } catch (eC) {}
                return;
              }
              switchNav(tab);
            });
          });
        }

        // Refresh sidebar after local state saves
        if (!window.__seSidebarSaveWrapped) {
          window.__seSidebarSaveWrapped = true;
          var _origSaveState = saveState;
          saveState = function() {
            _origSaveState();
            try { renderSidebar(); } catch (eR) {}
            try { updateBreadcrumb(); } catch (eB) {}
          };
      }

      var visualCueCloseBtn = el('visualCueClose') || el('visualLightboxClose');
      if (visualCueCloseBtn) {
        visualCueCloseBtn.addEventListener('click', function() {
          var ov = el('visualCueOverlay') || el('visualLightbox');
          if (ov) {
            if (window.gsap) {
              gsap.to(ov, { opacity: 0, duration: 0.25, ease: 'power2.inOut', onComplete: function() {
                ov.style.display = 'none';
                ov.style.opacity = '';
                ov.setAttribute('aria-hidden', 'true');
              }});
            } else {
              ov.style.display = 'none';
              ov.setAttribute('aria-hidden', 'true');
            }
          }
          try { playClick(); } catch (e) {}
        });
      }
      var visualCueOv = el('visualCueOverlay') || el('visualLightbox');
      if (visualCueOv) {
        visualCueOv.addEventListener('click', function(e) {
          if (e.target === visualCueOv && visualCueCloseBtn) {
            visualCueCloseBtn.click();
          }
        });
      }
      }

      /* Wire retention graph interactivity (after first render) */
      setTimeout(function() {
        wireRetentionInteractivity('retentionCanvas');
        /* cdRetentionCanvas removed — retention now in analytics grid */
      }, 200);

      /* Refresh mascot stage every 30s (picks up XP changes from other widgets) */
      setInterval(function() {
        updateMascotStage();
        checkForCheckIn();
      }, 30000);

      /* Show sync status badge */
      var syncBadge = el('syncBadge');
      function setSyncBadge(status) {
        if (!syncBadge) return;
        syncBadge.style.display = 'inline-block';
        syncBadge.classList.remove('sync-saving');
        if (status === 'saving') {
          syncBadge.textContent = '⏳ Saving';
          syncBadge.title = 'Pushing changes to cloud...';
          syncBadge.style.borderColor = 'rgba(245,158,11,0.3)';
          syncBadge.style.color = '#f59e0b';
          syncBadge.style.background = 'rgba(245,158,11,0.08)';
          syncBadge.classList.add('sync-saving');
        } else if (status === 'synced') {
          syncBadge.textContent = '☁️ Synced';
          syncBadge.title = 'All changes saved to Cloudflare KV';
          syncBadge.style.borderColor = 'rgba(34,197,94,0.3)';
          syncBadge.style.color = '#22c55e';
          syncBadge.style.background = 'rgba(34,197,94,0.08)';
        } else if (status === 'error') {
          syncBadge.textContent = '⚠️ Retry';
          syncBadge.title = 'Sync failed — will retry automatically';
          syncBadge.style.borderColor = 'rgba(239,68,68,0.3)';
          syncBadge.style.color = '#ef4444';
          syncBadge.style.background = 'rgba(239,68,68,0.08)';
        } else {
          syncBadge.textContent = '💾 Local';
          syncBadge.title = 'Local-only mode — enter sync passphrase to enable cross-device sync';
          syncBadge.style.borderColor = 'rgba(245,158,11,0.3)';
          syncBadge.style.color = '#f59e0b';
          syncBadge.style.background = 'rgba(245,158,11,0.08)';
        }
      }
      setSyncBadge(SyncEngine.isOnline() ? 'synced' : 'local');
      SyncEngine.onSyncStatus(function(status) {
        setSyncBadge(status);
      });

      checkForCheckIn();
    }

    function finishBootAfterProfileCheck() {
      var retryProfile = getUserProfile();
      if (retryProfile && retryProfile.awakened) {
        finishBoot();
      } else {
        showAwakening(function() {
          loadState();
          finishBoot();
        });
      }
    }

    function boot() {
      if (_bootStarted) return;
      _bootStarted = true;
      loadState();
      var profile = getUserProfile();
      if (!profile || !profile.awakened) {
        SyncEngine.pull('user').then(function() {
          finishBootAfterProfileCheck();
        }).catch(function() {
          /* Give mobile/cloud sync one more chance before surrendering to onboarding. */
          setTimeout(function() {
            SyncEngine.pull('user').then(function() {
              finishBootAfterProfileCheck();
            }).catch(function() {
              showAwakening(function() {
                loadState();
                finishBoot();
              });
            });
          }, 2000);
        });
        return;
      }
      if (!bootBindingsBound) {
        bootBindingsBound = true;
        /* Re-sync from SyncEngine when a remote device writes new state.
           Core.js polls KV every 60s; this listener reloads local state
           and refreshes the dashboard when remote changes arrive. */
        Core.on('sync-remote-update', function(data) {
          if (data && data.namespace === 'studyengine') {
            loadState();
            if (viewDash.classList.contains('active')) {
              renderDashboard();
            }
          }
        });
        /* Re-pull from KV when tab/window regains focus (bridges embed↔standalone) */
        if (!focusResyncBound) {
          focusResyncBound = true;
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible' && SyncEngine.isOnline()) {
              SyncEngine.pull('studyengine').then(function() {
                var freshItems = SyncEngine.get(NS, 'items');
                if (freshItems && typeof freshItems === 'object') {
                  var freshCount = Object.keys(freshItems).length;
                  var localCount = state.items ? Object.keys(state.items).length : 0;
                  if (freshCount !== localCount) {
                    loadState();
                    renderDashboard();
                    toast('Synced ' + freshCount + ' items from cloud');
                  }
                }
              }).catch(function() {});
            }
          });
        }
      }
      finishBoot();
    }

    var __baseRenderDashboard = renderDashboard;
    renderDashboard = function() {
      __baseRenderDashboard();
      var totalItems = 0;
      var masteredCount = 0;
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        totalItems++;
        if (it.fsrs && (it.fsrs.stability || 0) > 30 && (it.fsrs.lapses || 0) === 0) masteredCount++;
      }
      if (totalItems === 0) return;
      var ar = avgRetention(state.items);
      var retTarget = ar == null ? null : Math.round(ar * 100);
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
        } else {
          cramBannerEl.classList.remove('show');
          cramBannerEl.innerHTML = '';
        }
      }
      applyHomeStatVisuals(masteredCount, totalItems, retTarget);
      if (window.gsap) {
        gsap.fromTo(document.querySelectorAll('#tabHome .stats-row .stat, #tabHome .tutor-cal-row > *'),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out' }
        );
        if (cramBannerEl && cramBannerEl.querySelectorAll('.cram-banner').length) {
          gsap.fromTo(cramBannerEl.querySelectorAll('.cram-banner'), { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.28, stagger: 0.06, ease: 'power2.out' });
          gsap.fromTo(cramBannerEl.querySelectorAll('.cram-dashboard-fire'), { scale: 0.96 }, { scale: 1.08, repeat: 1, yoyo: true, duration: 0.45, ease: 'sine.inOut', stagger: 0.08 });
        }
      }
    };

    SyncEngine.onReady(function() {
      boot();
    });

    /* Safety: render even if onReady is slow/offline */
    setTimeout(function() {
      if (!state && !_bootStarted) {
        boot();
      }
    }, 12000);
