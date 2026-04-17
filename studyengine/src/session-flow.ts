import type { SessionState, StudyItem, TierId } from './types';

type Rating = 1 | 2 | 3 | 4;
type SessionRuntime = SessionState & Record<string, any>;

declare const el: (id: string) => HTMLElement | null;
declare const state: Record<string, any>;
declare const settings: Record<string, any>;
declare function saveState(): void;
declare function toast(msg: string): void;
declare function playClick(): void;
declare function playLevelUp(): void;

interface SessionFlowBridge {
  state: Record<string, any>;
  settings: Record<string, any>;
  getSession: () => SessionRuntime | null;
  setSession: (session: SessionRuntime | null) => void;
  setSessionSummary: (summary: any) => void;
  getSelectedCourse: () => string;
  getSelectedTopic: () => string;
  getIsEmbedded: () => boolean;
  getSidebarSelection: () => any;
  getRatingsEl: () => HTMLElement | null;
  getViewSession: () => HTMLElement | null;
  getBreakState: () => any;
  defaultTutorStats: () => any;
  defaultTutorModeCounts: () => any;
  calibrationPct: (cal: any) => number | null;
  showView: (viewId: string) => void;
  playStart: () => void;
  renderCurrentItem: () => void;
  getSleepAwareAdvice: () => { bias: 'new' | 'review' | string };
  getEffectiveProfile: (course: string | null) => Record<TierId, number>;
  detectSupportedTiers: (it: StudyItem) => TierId[];
  getCramState: (course: string) => { active: boolean; sessionMod: number; intensity?: string; intervalMod: number };
  priorityWeight: (it: StudyItem, cramActive?: boolean) => number;
  getOverconfidentTopics: (course: string) => Array<{ topic: string }>;
  getModuleById: (course: string, module: string) => any;
  scheduleFsrs: (it: StudyItem, rating: Rating, nowTs: number, persist: boolean) => { intervalDays: number };
  getEffectiveBloomBonus: (course?: string) => Partial<Record<TierId, number>>;
  computeXP: (it: StudyItem, rating: Rating, intervalDays?: number) => number;
  flashXP: (xp: number) => void;
  awardXP: (xp: number) => void;
  saveState: () => void;
  mountAskTutor: (rating: Rating) => void;
  tutorContextForItem: (it: StudyItem) => any;
  selectModel: (it: StudyItem, session: SessionRuntime | null) => string;
  callTutor: (...args: any[]) => Promise<any>;
  getRecentAvg: () => number;
  buildInsightUI: (area: HTMLElement, data: any, done: () => void) => void;
  runQuickFireFollowupMicro: (it: StudyItem, done: () => void, opts?: { reRetrieval?: boolean }) => void;
  mountQuickFireReRetrieval: (it: StudyItem, data: any, done: () => void) => void;
  updateQuickFireReRetrievalInsight?: (itemId: string, insightText: string | null, opts?: { failed?: boolean }) => void;
  preloadQuickfireInsight: (it: StudyItem) => void;
  mountQuickFireFollowup: (it: StudyItem, data: any, done: () => void) => void;
  revealAnswer: (fromCheck?: boolean) => void;
  rubricTemplate: (tier: TierId) => string;
  bindRubric: (tier: TierId) => void;
  rubricToFsrsRating: () => Rating;
  beginDontKnowFlow: (it: StudyItem, tier?: TierId) => void;
  startRelearningDialogue: (it: StudyItem, nowTs: number) => void;
  beginPassiveRestudyFlow: (it: StudyItem, nowTs: number) => void;
  ensureFsrs: (it: StudyItem) => void;
  persistTutorAnalyticsDeltas: () => void;
  flashRatingFeedback: (rating: Rating) => void;
  playError: () => void;
  playLap: () => void;
  playGoodRate: () => void;
  playEasyRate: () => void;
  cleanupAskTutor: () => void;
  stopTTS: () => void;
  clearTimers: () => void;
  checkBreakTriggers: () => void;
  optimizeFsrsParams: () => boolean;
  finalizeTutorAnalyticsSession: () => void;
  requestSessionAiSummary: (sessionSnap: any, reviewed: number) => void;
  isoDate: () => string;
  daysBetween: (a: number, b: number) => number;
  tierColour: (tier: TierId) => string;
  trackTimeOfDayRating: (rating: Rating) => void;
  trackTimeOfDaySessionCompletion: () => void;
  addStudyTime: (durationMs: number) => void;
  toast: (msg: string) => void;
  playClick: () => void;
  playChime: () => void;
  launchConfetti: () => void;
  SyncEngine: { set: (ns: string, key: string, value: any) => void };
  el: (id: string) => HTMLElement | null;
}

const bridge = new Proxy(
  {},
  {
    get(_target, prop) {
      return (globalThis as any).__studyEngineSessionFlow?.[prop as string];
    },
    set(_target, prop, value) {
      (globalThis as any).__studyEngineSessionFlow = (globalThis as any).__studyEngineSessionFlow || {};
      (globalThis as any).__studyEngineSessionFlow[prop as string] = value;
      return true;
    },
  },
) as SessionFlowBridge;

function getSession(): SessionRuntime | null {
  return bridge.getSession();
}

function setSession(session: SessionRuntime | null): void {
  bridge.setSession(session);
}

function normalizeTier(tier: unknown): string {
  return String(tier || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function getCachedInsightText(it: StudyItem): string {
  return typeof it.cachedInsight === 'string' ? it.cachedInsight.trim() : '';
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function reweightProfile(
  profile: Record<TierId, number>,
  tierBuckets: Record<TierId, StudyItem[]>,
  targetTotal: number
): Record<TierId, number> {
  const tierOrder: TierId[] = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
  const counts = {} as Record<TierId, number>;

  const uniqueAvailable = {} as Record<TierId, number>;
  const seenIds: Record<string, boolean> = {};
  tierOrder.forEach((t) => {
    let unique = 0;
    (tierBuckets[t] || []).forEach((it) => {
      const key = `${t}:${it.id}`;
      if (!seenIds[key]) {
        unique++;
        seenIds[key] = true;
      }
    });
    uniqueAvailable[t] = unique;
  });

  tierOrder.forEach((t) => {
    counts[t] = Math.round(profile[t] * targetTotal);
  });

  let excess = 0;
  const uncapped: TierId[] = [];
  tierOrder.forEach((t) => {
    if (counts[t] > uniqueAvailable[t]) {
      excess += counts[t] - uniqueAvailable[t];
      counts[t] = uniqueAvailable[t];
    } else {
      uncapped.push(t);
    }
  });

  if (excess > 0 && uncapped.length > 0) {
    let uncappedTotal = 0;
    uncapped.forEach((t) => {
      uncappedTotal += profile[t];
    });
    if (uncappedTotal > 0) {
      uncapped.forEach((t) => {
        const bonus = Math.round(excess * (profile[t] / uncappedTotal));
        const maxAdd = uniqueAvailable[t] - counts[t];
        counts[t] += Math.min(bonus, maxAdd);
      });
    }
  }

  tierOrder.forEach((t) => {
    if (counts[t] === 0 && uniqueAvailable[t] > 0 && targetTotal > tierOrder.length) {
      counts[t] = 1;
    }
  });

  return counts;
}

function interleaveQueue(queue: StudyItem[]): StudyItem[] {
  const groups: Record<string, StudyItem[]> = {};
  queue.forEach((it) => {
    const t = it._presentTier || 'quickfire';
    if (!groups[t]) groups[t] = [];
    groups[t].push(it);
  });
  const keys = Object.keys(groups);
  keys.forEach((k) => shuffle(groups[k]));

  const out: StudyItem[] = [];
  let done = false;
  while (!done) {
    done = true;
    for (let i = 0; i < keys.length; i++) {
      if (groups[keys[i]].length) {
        out.push(groups[keys[i]].shift() as StudyItem);
        done = false;
      }
    }
  }
  return out;
}

export function buildSessionQueue(): StudyItem[] {
  const state = bridge.state;
  const settings = bridge.settings;
  if (!state || !state.items || !settings) return [];
  const now = Date.now();
  const selectedCourse = bridge.getSelectedCourse();
  const selectedTopic = bridge.getSelectedTopic();
  const sidebarSelection = bridge.getSidebarSelection();
  const isEmbedded = bridge.getIsEmbedded();
  const courseFilter = selectedCourse;

  const dueItems: StudyItem[] = [];
  for (const id in state.items) {
    if (!Object.prototype.hasOwnProperty.call(state.items, id)) continue;
    const it = state.items[id] as StudyItem;
    if (!it || it.archived) continue;
    if (courseFilter !== 'All' && it.course !== courseFilter) continue;
    if (selectedTopic !== 'All' && (it.topic || '') !== selectedTopic) continue;
    if (!isEmbedded && sidebarSelection) {
      if (sidebarSelection.level === 'topic' && sidebarSelection.topic) {
        if ((it.topic || 'General') !== sidebarSelection.topic) continue;
      }
      if (sidebarSelection.level === 'module' && sidebarSelection.course && sidebarSelection.module) {
        const studyMod = bridge.getModuleById(sidebarSelection.course, sidebarSelection.module);
        if (studyMod && studyMod.topics && studyMod.topics.length) {
          if (studyMod.topics.indexOf(it.topic) < 0) continue;
        }
      }
    }
    const f = it.fsrs || null;
    const dueTs = f && f.due ? new Date(f.due).getTime() : 0;
    const isDue = (!f || !f.lastReview) ? true : (dueTs <= now);
    if (isDue) dueItems.push(it);
  }
  if (!dueItems.length) return [];

  const sleepBias = bridge.getSleepAwareAdvice().bias;
  if (sleepBias === 'new' && dueItems.length > 3) {
    dueItems.sort((a, b) => {
      const aNew = (!a.fsrs || !a.fsrs.lastReview || (a.fsrs.stability || 0) < 5) ? 0 : 1;
      const bNew = (!b.fsrs || !b.fsrs.lastReview || (b.fsrs.stability || 0) < 5) ? 0 : 1;
      return aNew - bNew;
    });
  } else if (sleepBias === 'review' && dueItems.length > 3) {
    dueItems.sort((a, b) => {
      const aRev = (a.fsrs && a.fsrs.lastReview && (a.fsrs.stability || 0) >= 5) ? 0 : 1;
      const bRev = (b.fsrs && b.fsrs.lastReview && (b.fsrs.stability || 0) >= 5) ? 0 : 1;
      return aRev - bRev;
    });
  }

  const profile = bridge.getEffectiveProfile(courseFilter !== 'All' ? courseFilter : null);
  const isManual = false;

  const tierBuckets: Record<TierId, StudyItem[]> = { quickfire: [], explain: [], apply: [], distinguish: [], mock: [], worked: [] };
  dueItems.forEach((it) => {
    if (isManual && it.tier && tierBuckets[it.tier]) {
      tierBuckets[it.tier].push(it);
      return;
    }
    const supported = bridge.detectSupportedTiers(it);
    supported.forEach((t) => {
      if (tierBuckets[t]) tierBuckets[t].push(it);
    });
  });

  const tierOrder: TierId[] = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
  tierOrder.forEach((t) => shuffle(tierBuckets[t]));

  let limit = parseInt(settings.sessionLimit || 12, 10);
  if (!limit || limit < 1) limit = 12;
  const cram = (courseFilter !== 'All') ? bridge.getCramState(courseFilter) : { active: false, sessionMod: 1, intervalMod: 1 };
  if (cram.active) {
    limit = Math.ceil(limit * cram.sessionMod);
  }
  const targetTotal = Math.min(limit, dueItems.length);

  const tierCounts = reweightProfile(profile as Record<TierId, number>, tierBuckets, targetTotal);

  let queue: StudyItem[] = [];
  const usedIds: Record<string, boolean> = {};

  tierOrder.forEach((t) => {
    const count = tierCounts[t] || 0;
    const bucket = tierBuckets[t];
    let picked = 0;
    for (let i = 0; i < bucket.length && picked < count; i++) {
      const it = bucket[i];
      if (usedIds[it.id]) continue;
      it._presentTier = t;
      queue.push(it);
      usedIds[it.id] = true;
      picked++;
    }
  });

  if (queue.length < targetTotal) {
    const remaining = dueItems.filter((it) => !usedIds[it.id]);
    const cramActive = cram && cram.active;
    remaining.sort((a, b) => bridge.priorityWeight(b, cramActive) - bridge.priorityWeight(a, cramActive));
    remaining.forEach((it) => {
      if (queue.length >= targetTotal) return;
      it._presentTier = 'quickfire';
      queue.push(it);
      usedIds[it.id] = true;
    });
  }

  if (cram.active) {
    const extras: StudyItem[] = [];
    queue.forEach((it) => {
      const w = bridge.priorityWeight(it, true);
      if (w >= 2.5 && extras.length < Math.ceil(targetTotal * 0.3)) {
        const clone = Object.assign({}, it);
        clone._presentTier = clone._presentTier || 'quickfire';
        (clone as any)._priorityExtra = true;
        extras.push(clone);
      }
    });
    if (extras.length > 0) {
      shuffle(extras);
      queue = queue.concat(extras);
    }
  }

  if (cram.active && (cram.intensity === 'critical' || cram.intensity === 'high')) {
    queue.sort((a, b) => {
      const sa = (a.fsrs && a.fsrs.stability) ? a.fsrs.stability : 0;
      const sb = (b.fsrs && b.fsrs.stability) ? b.fsrs.stability : 0;
      return sa - sb;
    });
    const bandSize = Math.max(1, Math.ceil(queue.length / 4));
    const bands: StudyItem[][] = [];
    for (let bi = 0; bi < queue.length; bi += bandSize) {
      bands.push(queue.slice(bi, bi + bandSize));
    }
    let interleavedQueue: StudyItem[] = [];
    bands.forEach((band) => {
      interleavedQueue = interleavedQueue.concat(interleaveQueue(band));
    });
    queue = interleavedQueue;
  }

  queue = interleaveQueue(queue);

  const overconfTopics = bridge.getOverconfidentTopics(selectedCourse);
  if (overconfTopics.length > 0) {
    const overconfSet: Record<string, boolean> = {};
    overconfTopics.forEach((ot) => { overconfSet[ot.topic] = true; });
    const frontLoad: StudyItem[] = [];
    const rest: StudyItem[] = [];
    queue.forEach((item) => {
      if (overconfSet[item.topic || 'General']) frontLoad.push(item);
      else rest.push(item);
    });
    const maxFront = Math.ceil(queue.length * 0.4);
    queue = frontLoad.slice(0, maxFront).concat(rest).concat(frontLoad.slice(maxFront));
  }

  return queue;
}

export function startSession(): void {
  if (!bridge.state || !bridge.settings) return;
  try {
    bridge.SyncEngine.set('studyengine', 'resumeSession', null);
  } catch (e) {}
  const q = buildSessionQueue();
  const session = {
    queue: q,
    idx: 0,
    loops: {},
    currentShown: false,
    startedAt: Date.now(),
    xp: 0,
    reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 },
    ratingSum: 0,
    ratingN: 0,
    calBefore: bridge.calibrationPct(bridge.state.calibration),
    confidence: null,
    recentRatings: [],
    fatigueWarningShown: false,
    tutorStats: bridge.defaultTutorStats(),
    tutorModeCounts: bridge.defaultTutorModeCounts(),
    sessionRatingsLog: [],
    lastTutorContext: null,
    tutorAnalyticsHistoryKey: 's' + Date.now()
  } as SessionRuntime;

  setSession(session);
  bridge.setSessionSummary(null);
  const breakState = bridge.getBreakState();
  breakState.sessionStartTime = Date.now();
  breakState.lastBreakTime = 0;
  breakState.breaksTaken = 0;
  breakState.bannerDismissed = false;
  if (!q.length) return;
  const prevSum = bridge.el('sessionAiSummaryWrap');
  if (prevSum) prevSum.style.display = 'none';
  bridge.showView('viewSession');
  try { bridge.playStart(); } catch (e) {}
  bridge.renderCurrentItem();
}

function scheduleRatingAndAdvance(
  it: StudyItem,
  mappedRating: Rating,
  nowTs: number,
  tier: TierId,
  againCount: number,
  opts: { skipPostRatingUI?: boolean } = {}
): void {
  const session = getSession();
  if (!session) return;

  if (mappedRating < 2) {
    advanceItem();
    return;
  }
  if (againCount > 0 && mappedRating >= 3) session.loops[it.id] = 0;
  const res = bridge.scheduleFsrs(it, mappedRating, nowTs, true);
  const effectiveBonus = bridge.getEffectiveBloomBonus(it.course);
  if (mappedRating >= 3 && effectiveBonus[tier]) {
    const bonus = effectiveBonus[tier] as number;
    if (bonus > 1.0 && it.fsrs && it.fsrs.stability) {
      it.fsrs.stability = Math.min(3650, it.fsrs.stability * bonus);
    }
  }
  const cramInfo = bridge.getCramState(it.course || '');
  if (cramInfo.active && it.fsrs && it.fsrs.due) {
    const dueTs = new Date(it.fsrs.due).getTime();
    const nowMs = Date.now();
    const currentInterval = dueTs - nowMs;
    if (currentInterval > 0) {
      const compressed = nowMs + Math.round(currentInterval * cramInfo.intervalMod);
      it.fsrs.due = new Date(compressed).toISOString();
    }
  }
  it.lastTier = tier;
  const xp = bridge.computeXP(it, mappedRating, res.intervalDays);
  const flashKey = (it.id || '') + '_' + nowTs;
  if (session._xpFlashGuard && session._xpFlashGuard === flashKey) return;
  session._xpFlashGuard = flashKey;
  session.xp += xp;
  bridge.flashXP(xp);
  bridge.awardXP(xp);
  bridge.saveState();
  const prevMode = (globalThis as any).tutorCurrentMode || null;
  const prevTurns = (globalThis as any).tutorTurnCount || 0;
  const prevDontKnow = !!(session._dontKnow);
  const hadSocratic = (prevMode === 'socratic' || prevMode === 'teach' || prevMode === 'acknowledge') && prevTurns >= 1;
  const hadQuickFeedback = prevMode === 'quick' && prevTurns >= 1;
  session.lastTutorContext = {
    mode: prevMode,
    turns: prevTurns,
    hadDialogue: hadSocratic,
    hadQuickFeedback,
    wasDontKnow: prevDontKnow,
    tier
  };
  if (!opts.skipPostRatingUI) {
    bridge.mountAskTutor(mappedRating);
  }
}

function runQuickfireAgainFollowup(it: StudyItem, done: () => void, session: SessionRuntime): void {
  const canMount = typeof bridge.mountQuickFireReRetrieval === 'function';
  const canTutor = typeof bridge.callTutor === 'function';
  session._qfAgainInFlight = session._qfAgainInFlight || new Set<string>();
  session._insightPreloadInFlight = session._insightPreloadInFlight || new Set<string>();
  if (session._qfAgainInFlight.has(it.id)) {
    console.debug('[Quickfire Again] duplicate followup blocked for item', it.id);
    return;
  }
  session._qfAgainInFlight.add(it.id);
  if (!canMount || !canTutor) {
    try {
      bridge.runQuickFireFollowupMicro(it, done, { reRetrieval: true });
    } finally {
      session._qfAgainInFlight.delete(it.id);
    }
    return;
  }

  const cachedInsight = getCachedInsightText(it);
  if (cachedInsight) {
    bridge.mountQuickFireReRetrieval(it, {
      followUpQuestion: 'Try again from memory before checking the full answer.',
      followUpAnswer: it.modelAnswer || '',
      insight: cachedInsight,
      insightLoading: false
    }, done);
    session._qfAgainInFlight.delete(it.id);
    return;
  }

  const preloadInFlight = session._insightPreloadInFlight.has(it.id);
  const ctx = bridge.tutorContextForItem(it);
  ctx.quickFireFollowUp = true;
  ctx.userRating = 1;
  bridge.mountQuickFireReRetrieval(it, {
    followUpQuestion: 'Try again from memory before checking the full answer.',
    followUpAnswer: it.modelAnswer || '',
    insight: null,
    insightLoading: true
  }, done);
  if (preloadInFlight) {
    let waitedMs = 0;
    const poll = window.setInterval(() => {
      const activeSession = getSession();
      const activeItem = activeSession && activeSession.queue ? activeSession.queue[activeSession.idx] : null;
      if (!activeSession || !activeItem || activeItem.id !== it.id) {
        window.clearInterval(poll);
        session._qfAgainInFlight.delete(it.id);
        return;
      }
      const polledInsight = getCachedInsightText(it);
      if (polledInsight) {
        bridge.updateQuickFireReRetrievalInsight?.(it.id, polledInsight);
        window.clearInterval(poll);
        session._qfAgainInFlight.delete(it.id);
        return;
      }
      waitedMs += 200;
      if (waitedMs >= 15000) {
        bridge.updateQuickFireReRetrievalInsight?.(it.id, null, { failed: true });
        window.clearInterval(poll);
        session._qfAgainInFlight.delete(it.id);
      }
    }, 200);
    return;
  }
  const model = bridge.selectModel(it, session);
  bridge.callTutor('insight', model, it, '', [], ctx)
    .then((data) => {
      const insightText = data && !data.error && typeof data.insight === 'string'
        ? data.insight.trim()
        : '';
      if (!insightText) {
        bridge.updateQuickFireReRetrievalInsight?.(it.id, null, { failed: true });
        return;
      }
      if (!getCachedInsightText(it)) {
        it.cachedInsight = insightText;
        bridge.saveState();
      }
      bridge.updateQuickFireReRetrievalInsight?.(it.id, insightText);
    })
    .catch(() => {
      bridge.updateQuickFireReRetrievalInsight?.(it.id, null, { failed: true });
    })
    .finally(() => {
      session._qfAgainInFlight.delete(it.id);
    });
}

export function preloadQuickfireInsight(it: StudyItem): void {
  const session = getSession();
  if (!session || !it || !it.id) return;
  const normalizedTier = normalizeTier(it._presentTier || it.tier || 'quickfire');
  if (normalizedTier !== 'quickfire') return;
  if (getCachedInsightText(it)) return;
  session._insightPreloadInFlight = session._insightPreloadInFlight || new Set<string>();
  if (session._insightPreloadInFlight.has(it.id)) return;

  session._insightPreloadInFlight.add(it.id);
  const ctx = bridge.tutorContextForItem(it);
  ctx.quickFireFollowUp = true;
  ctx.userRating = 1;
  const model = bridge.selectModel(it, session);
  bridge.callTutor('insight', model, it, '', [], ctx)
    .then((data) => {
      const insightText = data && !data.error && typeof data.insight === 'string'
        ? data.insight.trim()
        : '';
      if (!insightText) return;
      if (!getCachedInsightText(it)) {
        it.cachedInsight = insightText;
        bridge.saveState();
      }
    })
    .catch(() => {})
    .finally(() => {
      session._insightPreloadInFlight.delete(it.id);
    });
}

export function rateCurrent(rating: Rating): void {
  const session = getSession();
  if (!session) return;
  const nowTs = Date.now();
  if ((session._lastRateTs || 0) && (nowTs - session._lastRateTs) < 300) {
    console.debug('[Quickfire Again] rateCurrent debounced', { rating, delta: nowTs - session._lastRateTs });
    return;
  }
  session._lastRateTs = nowTs;
  const it = session.queue[session.idx] as StudyItem | undefined;
  if (!it) return;
  if (!session.currentShown) return;

  const ratingsEl = bridge.getRatingsEl();
  if (!ratingsEl) return;
  ratingsEl.style.display = 'none';
  const hintElRate = document.querySelector('.override-hint');
  if (hintElRate) hintElRate.remove();

  const tier = (it._presentTier || it.tier || 'quickfire') as TierId;
  const normalizedTier = normalizeTier(tier);
  const isQuickfireTier = normalizedTier === 'quickfire';
  const itemSelfRateFlag = (it as any).self_rate === true || (it as any).selfRate === true;
  const useQuickfireActiveAgain = isQuickfireTier && !itemSelfRateFlag && bridge.settings.feedbackMode !== 'self_rate';
  const mappedRating = rating;

  bridge.state.calibration.totalSelfRatings = (bridge.state.calibration.totalSelfRatings || 0) + 1;
  const aiSuggested = (session && session.aiRating) ? session.aiRating : null;
  const confidence = (session && session.confidence) ? session.confidence : null;
  let actualCorrect: 0 | 1;
  if (aiSuggested !== null) {
    actualCorrect = (Math.abs(mappedRating - aiSuggested) <= 1) ? 1 : 0;
  } else if (confidence !== null) {
    const confMap: Record<string, [number, number]> = { low: [1, 2], medium: [2, 3], high: [3, 4] };
    const expectedRange = confMap[confidence] || [2, 3];
    actualCorrect = (mappedRating >= expectedRange[0] && mappedRating <= expectedRange[1]) ? 1 : 0;
  } else {
    actualCorrect = (mappedRating >= 3) ? 1 : 0;
  }
  bridge.state.calibration.totalActualCorrect = (bridge.state.calibration.totalActualCorrect || 0) + actualCorrect;
  bridge.state.calibration.history = bridge.state.calibration.history || [];
  bridge.state.calibration.history.push({
    ts: new Date(nowTs).toISOString(),
    course: (it && it.course) ? it.course : '',
    tier,
    rating: mappedRating,
    aiRating: aiSuggested,
    confidence,
    actual: actualCorrect
  });
  if (bridge.state.calibration.history.length > 200) bridge.state.calibration.history.shift();
  bridge.trackTimeOfDayRating(mappedRating);

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
    if (mappedRating >= 3 && session.tutorStats) (session.tutorStats as any).reconstructionSuccesses++;
    bridge.persistTutorAnalyticsDeltas();
    session._reconstructionPending = false;
  }
  bridge.flashRatingFeedback(mappedRating);
  try {
    if (mappedRating === 1) bridge.playError();
    else if (mappedRating === 2) bridge.playLap();
    else if (mappedRating === 3) bridge.playGoodRate();
    else if (mappedRating === 4) bridge.playEasyRate();
  } catch (e) {}

  const isReviewCard = it.fsrs && it.fsrs.reps && it.fsrs.reps > 1;
  if (isReviewCard) {
    session.recentRatings.push(mappedRating);
    if (session.recentRatings.length > 6) session.recentRatings.shift();
  }

  bridge.state.stats.totalReviews = (bridge.state.stats.totalReviews || 0) + 1;
  bridge.state.stats.reviewsByTier[tier] = (bridge.state.stats.reviewsByTier[tier] || 0) + 1;

  const againCount = session.loops[it.id] || 0;

  if (mappedRating === 1) {
    session.loops[it.id] = againCount + 1;

    const proceedAfterAgain = () => {
      const generativeTier = tier === 'explain' || tier === 'apply' || tier === 'distinguish' || tier === 'mock';
      if (generativeTier && bridge.settings.feedbackMode !== 'self_rate') {
        if (againCount >= 2) {
          bridge.toast('Scheduled for next session — spacing will help more than repeating now');
          bridge.ensureFsrs(it);
          it.fsrs.due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          it.fsrs.state = 'relearning';
          it.fsrs.lapses = (it.fsrs.lapses || 0) + 1;
          it.fsrs.reps = (it.fsrs.reps || 0) + 1;
          it.fsrs.lastReview = new Date(nowTs).toISOString();
          advanceItem();
          return;
        }
        if (session._dontKnow) {
          const remainingDk = session.queue.length - (session.idx + 1);
          const minOffsetDk = Math.max(5, Math.floor(remainingDk * 0.4));
          const insertPosDk = Math.min(session.idx + 1 + minOffsetDk, session.queue.length);
          session.queue.splice(insertPosDk, 0, it);
          advanceItem();
          return;
        }
        bridge.startRelearningDialogue(it, nowTs);
        return;
      }
      if (useQuickfireActiveAgain) {
        session.loops[it.id] = session.loops[it.id] || 0;
        if (session.loops[it.id] >= 3) {
          bridge.toast('Review tomorrow');
          bridge.ensureFsrs(it);
          it.fsrs.due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          it.fsrs.state = 'relearning';
          it.fsrs.lapses = (it.fsrs.lapses || 0) + 1;
          it.fsrs.reps = (it.fsrs.reps || 0) + 1;
          it.fsrs.lastReview = new Date(nowTs).toISOString();
          advanceItem();
          return;
        }
        const remainingQF = session.queue.length - (session.idx + 1);
        const minOffsetQF = Math.max(5, Math.floor(remainingQF * 0.4));
        const insertPosQF = Math.min(session.idx + 1 + minOffsetQF, session.queue.length);
        session.queue.splice(insertPosQF, 0, it);
        advanceItem();
        return;
      }
      bridge.beginPassiveRestudyFlow(it, nowTs);
    };

    if (useQuickfireActiveAgain) {
      runQuickfireAgainFollowup(it, proceedAfterAgain, session);
      return;
    }
    proceedAfterAgain();
    return;
  }

  if (isQuickfireTier && mappedRating === 2 && bridge.settings.feedbackMode !== 'self_rate') {
    bridge.runQuickFireFollowupMicro(it, () => {
      if (againCount > 0 && mappedRating === 2) {
        const remainingItemsQ = session.queue.length - (session.idx + 1);
        const minOffsetQ = Math.max(5, Math.floor(remainingItemsQ * 0.4));
        const insertPosQ = Math.min(session.idx + 1 + minOffsetQ, session.queue.length);
        session.queue.splice(insertPosQ, 0, it);
        advanceItem();
        return;
      }
      scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount, { skipPostRatingUI: true });
    });
    return;
  }

  if (againCount > 0 && mappedRating === 2) {
    const remainingItems2 = session.queue.length - (session.idx + 1);
    const minOffset2 = Math.max(5, Math.floor(remainingItems2 * 0.4));
    const insertPos2 = Math.min(session.idx + 1 + minOffset2, session.queue.length);
    session.queue.splice(insertPos2, 0, it);
    advanceItem();
    return;
  }

  if (isQuickfireTier && bridge.settings.feedbackMode !== 'self_rate') {
    const qfInsightArea = bridge.el('aiFeedbackArea');
    ratingsEl.style.display = 'none';
    const oldHint = document.querySelector('.override-hint');
    if (oldHint) oldHint.remove();
    if (qfInsightArea) {
      qfInsightArea.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:10px;letter-spacing:1px;text-transform:uppercase;">Loading insight…</div>';
    }
    const qfCtxPost = bridge.tutorContextForItem(it);
    qfCtxPost.userRating = mappedRating;
    qfCtxPost.recentAvgRating = bridge.getRecentAvg();
    const qfModelPost = bridge.selectModel(it, session);
    bridge.callTutor('insight', qfModelPost, it, '', [], qfCtxPost).then((insData) => {
      if (!qfInsightArea || !insData || insData.error || (!insData.insight && !insData.followUpQuestion)) {
        scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
        return;
      }
      if (insData.followUpQuestion && typeof bridge.mountQuickFireFollowup === 'function') {
        bridge.mountQuickFireFollowup(it, insData, () => {
          scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount, { skipPostRatingUI: true });
        });
        return;
      }
      bridge.buildInsightUI(qfInsightArea, insData, () => {
        scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount, { skipPostRatingUI: true });
      });
    }).catch(() => {
      scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
    });
  } else {
    scheduleRatingAndAdvance(it, mappedRating, nowTs, tier, againCount);
  }
}

export function advanceItem(): void {
  const session = getSession();
  if (!session) return;

  bridge.stopTTS();
  bridge.cleanupAskTutor();
  document.querySelectorAll('.listen-tts-btn').forEach((btn) => { btn.remove(); });
  const staleRe = document.getElementById('qfReRetrievalRoot');
  if (staleRe) staleRe.remove();
  const staleFollow = document.getElementById('qfFollowupRoot');
  if (staleFollow) staleFollow.remove();
  if (session && (session as any)._insightSpaceRef) {
    document.removeEventListener('keydown', (session as any)._insightSpaceRef);
    (session as any)._insightSpaceRef = null;
  }
  const staleInsightNext = document.getElementById('qfInsightNextWrap');
  if (staleInsightNext) staleInsightNext.remove();
  const aiFbArea = document.getElementById('aiFeedbackArea');
  if (aiFbArea) aiFbArea.innerHTML = '';
  bridge.clearTimers();
  const cardEl = document.querySelector('.item-card');
  let stepped = false;
  const step = () => {
    if (stepped) return;
    stepped = true;
    session.idx++;
    if (session.idx >= session.queue.length) {
      completeSession();
      return;
    }
    bridge.checkBreakTriggers();
    bridge.renderCurrentItem();
  };
  const viewSession = bridge.getViewSession();
  if ((window as any).gsap && cardEl && (cardEl as HTMLElement).isConnected && viewSession && viewSession.classList.contains('active')) {
    (window as any).gsap.killTweensOf(cardEl);
    (window as any).gsap.to(cardEl, {
      opacity: 0,
      y: -12,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: step
    });
  } else {
    step();
  }
}

export function completeSession(): void {
  const session = getSession();
  if (!session) return;
  try {
    bridge.SyncEngine.set('studyengine', 'resumeSession', null);
  } catch (e) {}

  bridge.stopTTS();
  bridge.cleanupAskTutor();
  document.querySelectorAll('.listen-tts-btn').forEach((btn) => { btn.remove(); });
  bridge.clearTimers();

  const today = bridge.isoDate();
  const last = bridge.state.stats.lastSessionDate || '';
  if (last !== today) {
    if (!last) {
      bridge.state.stats.streakDays = 1;
    } else {
      const dt = bridge.daysBetween(new Date(last + 'T00:00:00').getTime(), new Date(today + 'T00:00:00').getTime());
      if (dt >= 1 && dt <= 2) bridge.state.stats.streakDays = (bridge.state.stats.streakDays || 0) + 1;
      else bridge.state.stats.streakDays = 1;
    }
    bridge.state.stats.lastSessionDate = today;
  }

  bridge.finalizeTutorAnalyticsSession();
  const sessionDuration = Date.now() - (session.startedAt || Date.now());
  if (sessionDuration > 0) bridge.addStudyTime(sessionDuration);
  bridge.trackTimeOfDaySessionCompletion();

  try {
    bridge.SyncEngine.set('dragon', 'lastStudyXP', { xp: session.xp, timestamp: new Date().toISOString() });
  } catch (e) {}

  bridge.saveState();
  if (session._insightPreloadInFlight && typeof session._insightPreloadInFlight.clear === 'function') {
    session._insightPreloadInFlight.clear();
  }

  const sessionSnap = {
    xp: session.xp,
    ratingN: session.ratingN,
    ratingSum: session.ratingSum,
    calBefore: session.calBefore,
    tutorStats: session.tutorStats ? JSON.parse(JSON.stringify(session.tutorStats)) : bridge.defaultTutorStats(),
    tutorModeCounts: session.tutorModeCounts ? JSON.parse(JSON.stringify(session.tutorModeCounts)) : bridge.defaultTutorModeCounts(),
    sessionRatingsLog: session.sessionRatingsLog ? session.sessionRatingsLog.slice() : []
  };

  if (bridge.state.stats.totalReviews > 0 && bridge.state.stats.totalReviews % 50 === 0) {
    const optimized = bridge.optimizeFsrsParams();
    if (optimized) bridge.toast('FSRS parameters optimized to your memory patterns');
  }

  let reviewed = 0;
  for (const k in session.reviewsByTier) reviewed += (session.reviewsByTier[k as TierId] || 0);

  bridge.el('doneTitle')!.textContent = `${reviewed} items reviewed`;
  bridge.el('doneSub')!.textContent = `Avg self-rating: ${session.ratingN ? (Math.round((session.ratingSum / session.ratingN) * 10) / 10) : '—'}`;
  bridge.el('doneXP')!.textContent = String(session.xp);

  const calAfter = bridge.calibrationPct(bridge.state.calibration);
  bridge.el('doneCal')!.textContent = (calAfter == null) ? '—' : `${Math.round(calAfter * 100)}%`;
  const before = session.calBefore;
  if (before == null || calAfter == null) bridge.el('doneTrend')!.textContent = 'Calibration updates after more sessions';
  else {
    const d = calAfter - before;
    bridge.el('doneTrend')!.textContent = (d > 0.02) ? 'Trending up' : (d < -0.02) ? 'Trending down' : 'Stable';
  }

  const tiers: TierId[] = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
  const names: Record<TierId, string> = {
    quickfire: 'Quick Fire',
    explain: 'Explain',
    apply: 'Apply',
    distinguish: 'Distinguish',
    mock: 'Mock',
    worked: 'Worked Example'
  };
  let bd = '';
  tiers.forEach((t) => {
    const c = session.reviewsByTier[t] || 0;
    const col = bridge.tierColour(t);
    bd += `<span class="tier-pill"><span class="tier-dot" style="background:${col}"></span>${names[t]}: ${c}</span>`;
  });
  bridge.el('doneBreakdown')!.innerHTML = bd;

  setSession(null);
  bridge.showView('viewDone');

  bridge.requestSessionAiSummary(sessionSnap, reviewed);

  if (reviewed > 0) {
    try { bridge.playChime(); } catch (e) {}
    try { bridge.launchConfetti(); } catch (e) {}
  }
  if ((window as any).gsap) {
    const cele = bridge.el('doneCelebration');
    if (cele) {
      (window as any).gsap.fromTo(cele, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' });
    }
    const xpEl = bridge.el('doneXP');
    if (xpEl) {
      const xpObj = { val: 0 };
      const finalXP = parseInt(xpEl.textContent || '0', 10) || 0;
      (window as any).gsap.to(xpObj, {
        val: finalXP,
        duration: 0.8,
        delay: 0.3,
        ease: 'power2.out',
        onUpdate: () => { xpEl.textContent = String(Math.round(xpObj.val)); }
      });
    }
  }
}

export function calcRestudyDuration(modelAnswer: string | null | undefined): number {
  if (!modelAnswer) return 8000;
  const txt = String(modelAnswer).trim();
  if (!txt) return 8000;
  const parts = txt.split(/\s+/);
  const wordCount = parts.length;
  let seconds = Math.ceil(wordCount / 25) * 5;
  seconds = Math.max(6, Math.min(20, seconds));
  return seconds * 1000;
}
