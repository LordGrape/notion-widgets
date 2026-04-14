/*
 * DOM Controller
 * Imperative rendering layer that reads from signals and updates the HTML shell.
 * This replaces the Preact components for Dashboard, Session, and Done views.
 */

import { effect } from '@preact/signals-react';
import {
  items,
  courses,
  stats,
  calibration,
  settings,
  currentView,
  sessionQueue,
  sessionIndex,
  sessionPhase,
  sessionXP,
  currentShown,
  userAnswer,
  saveState,
  dueItems,
  sessionStartTime,
} from './signals';
import { showView, countDue, avgRetention, calibrationPct, tierLabel, tierColour, el, esc, toast, fmtMMSS, renderMd } from './utils';
import { listCourses } from './courses';
import type { StudyItem } from './types';

// ============================================
// Dashboard Rendering
// ============================================

export function renderDashboard(): void {
  const its = items.value;
  const now = new Date();
  
  // Count due items
  const dueCount = countDue(its);
  const totalDue = dueCount.total;
  
  // Calculate average retention
  const avgRet = avgRetention(its);
  
  // Get calibration percentage
  const calVal = calibrationPct(calibration.value);
  
  // Count mastered items (stability > 30d, no lapses)
  let masteredCount = 0;
  for (const id in its) {
    const it = its[id];
    if (!it || it.archived || !it.fsrs) continue;
    if ((it.fsrs.stability || 0) > 30 && (it.fsrs.lapses || 0) === 0) {
      masteredCount++;
    }
  }
  
  // Update stat elements
  const statDue = el('statDue');
  if (statDue) statDue.textContent = totalDue > 0 ? String(totalDue) : '0';
  
  const statRet = el('statRet');
  if (statRet) statRet.textContent = avgRet !== null ? Math.round(avgRet * 100) + '%' : '—';
  
  const statStreak = el('statStreak');
  if (statStreak) statStreak.textContent = masteredCount > 0 ? String(masteredCount) : '—';
  
  const statStudyStreak = el('statStudyStreak');
  const streakVal = stats.value.streakDays || 0;
  if (statStudyStreak) statStudyStreak.textContent = streakVal > 0 ? String(streakVal) : '—';
  
  // Update calibration
  const calValEl = el('calVal');
  const calSub = el('calSub');
  if (calValEl) {
    if (calVal !== null) {
      const pct = Math.round(calVal * 100);
      calValEl.textContent = pct + '%';
      // Color coding
      if (pct >= 80) calValEl.style.color = '#22c55e';
      else if (pct >= 60) calValEl.style.color = '#f59e0b';
      else calValEl.style.color = '#ef4444';
    } else {
      calValEl.textContent = '—';
      calValEl.style.color = '';
    }
  }
  if (calSub) {
    if (calVal !== null) {
      const pct = Math.round(calVal * 100);
      if (pct >= 80) calSub.textContent = 'Well calibrated';
      else if (pct >= 60) calSub.textContent = 'Improving';
      else calSub.textContent = 'Needs practice';
    } else {
      calSub.textContent = 'Metacognitive feedback';
    }
  }
  
  // Update calibration arc
  const calArc = document.getElementById('calArc') as SVGCircleElement | null;
  if (calArc && calVal !== null) {
    const pct = calVal;
    const circumference = 120;
    const offset = circumference - (pct * circumference);
    calArc.style.strokeDashoffset = String(offset);
  }
  
  // Enable/disable start button based on due items
  const startBtn = el('startBtn') as HTMLButtonElement | null;
  if (startBtn) {
    if (totalDue > 0) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Session';
    } else {
      startBtn.disabled = true;
      startBtn.textContent = 'No items due';
    }
  }
  
  // Update tier breakdown
  renderTierBreakdown(dueCount.byTier);
  
  // Update progression hub (if gamification enabled)
  const progHub = el('progressionHub');
  if (progHub && settings.value.gamificationMode === 'motivated') {
    progHub.style.display = '';
    updateProgressionDisplay();
  } else if (progHub) {
    progHub.style.display = 'none';
  }
  
  // Update cram banner
  const cramBanner = el('cramBanner');
  const cramText = el('cramText');
  if (cramBanner && cramText) {
    // Check if any course has exam date within 7 days
    let cramActive = false;
    let cramMsg = '';
    for (const k in courses.value) {
      const c = courses.value[k];
      if (c.examDate && !c.archived) {
        const exam = new Date(c.examDate);
        const days = Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (days > 0 && days <= 7) {
          cramActive = true;
          cramMsg = `Cram mode — ${c.name} exam in ${days} day${days === 1 ? '' : 's'}`;
          break;
        }
      }
    }
    if (cramActive) {
      cramBanner.style.display = 'flex';
      cramText.textContent = cramMsg;
    } else {
      cramBanner.style.display = 'none';
    }
  }
  
  // Update empty state visibility
  const emptyState = el('emptyState');
  if (emptyState) {
    const hasItems = Object.keys(its).length > 0;
    emptyState.style.display = hasItems ? 'none' : '';
  }
}

function renderTierBreakdown(byTier: Record<string, number>): void {
  const container = el('tierBreakdown');
  if (!container) return;
  
  const tiers = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
  const tierConfig: Record<string, { label: string; color: string }> = {
    quickfire: { label: 'QF', color: '#3b82f6' },
    explain: { label: 'EI', color: '#22c55e' },
    apply: { label: 'AI', color: '#f59e0b' },
    distinguish: { label: 'DI', color: '#8b5cf6' },
    mock: { label: 'ME', color: '#ef4444' },
    worked: { label: 'WE', color: '#06b6d4' }
  };
  
  let html = '';
  for (const tier of tiers) {
    const count = byTier[tier] || 0;
    const cfg = tierConfig[tier];
    html += `<div class="tier-pill" style="background:${cfg.color}20;color:${cfg.color};border:1px solid ${cfg.color}40;">
      <span class="tier-pill-label">${cfg.label}</span>
      <span class="tier-pill-count">${count}</span>
    </div>`;
  }
  
  container.innerHTML = html;
}

function updateProgressionDisplay(): void {
  // Get dragon state from SyncEngine or signals
  const dragon = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get('dragon', 'dragon') as { xp?: number; rank?: string; rankEmoji?: string } | undefined;
  
  const xp = dragon?.xp || 0;
  const rank = dragon?.rank || 'RECRUIT';
  const rankEmoji = dragon?.rankEmoji || '🥚';
  
  const progRankEmoji = el('progRankEmoji');
  const progRankName = el('progRankName');
  const progXPValue = el('progXPValue');
  const progBarFill = el('progBarFill');
  const progBarCurrent = el('progBarCurrent');
  
  if (progRankEmoji) progRankEmoji.textContent = rankEmoji;
  if (progRankName) progRankName.textContent = rank;
  if (progXPValue) progXPValue.textContent = String(xp);
  
  // Calculate XP progress (simplified - assume 1000 XP per rank)
  const xpForNext = 1000;
  const pct = Math.min(100, Math.round((xp % xpForNext) / xpForNext * 100));
  if (progBarFill) progBarFill.style.width = pct + '%';
  if (progBarCurrent) progBarCurrent.textContent = pct + '%';
}

// ============================================
// Courses Tab
// ============================================

let _activeCourseDetail: string | null = null;

export function renderCourseList(): void {
  const area = el('courseCardsArea');
  if (!area) return;

  const allCourses = listCourses(false);
  const its = items.value;
  const now = new Date();

  if (allCourses.length === 0) {
    area.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;text-align:center;padding:20px 0;">No courses yet. Click ＋ Add or manage courses to get started.</div>';
    return;
  }

  area.innerHTML = allCourses.map((c) => {
    const courseItems = Object.values(its).filter((it) => it && !it.archived && it.course === c.name);
    const due = countDue(its, c.name);
    const ret = avgRetention(Object.fromEntries(courseItems.map((it) => [it!.id, it!])));

    const retStr = ret !== null ? Math.round(ret * 100) + '%' : '—';

    let examBadge = '';
    if (c.examDate) {
      const days = Math.ceil((new Date(c.examDate).getTime() - now.getTime()) / 86400000);
      if (days > 0) {
        examBadge = '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:rgba(239,68,68,0.12);color:#ef4444;margin-left:6px;">' + days + 'd</span>';
      }
    }

    return '<div class="course-card" data-course="' + esc(c.name) + '" style="cursor:pointer;padding:10px 12px;border-radius:10px;border:1px solid var(--border-subtle);margin-bottom:8px;background:var(--surface-1);">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:' + (c.color || '#8b5cf6') + ';flex-shrink:0;"></div>' +
        '<div style="font-weight:700;font-size:12px;color:var(--text-primary);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(c.name) + '</div>' +
        examBadge +
      '</div>' +
      '<div style="display:flex;gap:12px;">' +
        '<div style="font-size:10px;color:var(--text-secondary);"><span style="font-weight:700;color:var(--text-primary);">' + courseItems.length + '</span> cards</div>' +
        '<div style="font-size:10px;color:var(--text-secondary);"><span style="font-weight:700;color:' + (due.total > 0 ? '#f59e0b' : 'var(--text-primary)') + ';">' + due.total + '</span> due</div>' +
        '<div style="font-size:10px;color:var(--text-secondary);"><span style="font-weight:700;color:var(--text-primary);">' + retStr + '</span> ret.</div>' +
      '</div>' +
    '</div>';
  }).join('');

  area.querySelectorAll('.course-card[data-course]').forEach((card) => {
    card.addEventListener('click', () => {
      const name = card.getAttribute('data-course') || '';
      openCourseDetail(name);
    });
  });
}

export function openCourseDetail(courseName: string): void {
  _activeCourseDetail = courseName;
  const panel = el('courseDetail') as HTMLElement | null;
  if (panel) panel.style.display = '';

  const its = items.value;
  const now = new Date();
  const course = courses.value[courseName];
  const courseItems = Object.values(its).filter((it) => it && !it.archived && it.course === courseName) as StudyItem[];
  const due = countDue(its, courseName);
  const itemMap = Object.fromEntries(courseItems.map((it) => [it.id, it]));
  const ret = avgRetention(itemMap);

  const cdTitle = el('cdTitle');
  if (cdTitle) cdTitle.textContent = courseName;

  const cdItemCount = el('cdItemCount');
  if (cdItemCount) cdItemCount.textContent = String(courseItems.length);

  const cdDueCount = el('cdDueCount');
  if (cdDueCount) cdDueCount.textContent = String(due.total) + ' due';

  const cdAvgRet = el('cdAvgRet');
  if (cdAvgRet) cdAvgRet.textContent = ret !== null ? Math.round(ret * 100) + '%' : '—';

  const cdRetTrend = el('cdRetTrend');
  if (cdRetTrend) cdRetTrend.textContent = ret !== null ? (ret >= 0.8 ? 'Good' : ret >= 0.6 ? 'Improving' : 'Needs work') : '—';

  const cdCountdown = el('cdCountdown') as HTMLElement | null;
  const cdDays = el('cdDays');
  const cdDaysLabel = el('cdDaysLabel');
  if (cdCountdown && course?.examDate) {
    const days = Math.ceil((new Date(course.examDate).getTime() - now.getTime()) / 86400000);
    if (days > 0) {
      cdCountdown.style.display = '';
      if (cdDays) cdDays.textContent = String(days);
      if (cdDaysLabel) cdDaysLabel.textContent = 'Days until exam';
    } else {
      cdCountdown.style.display = 'none';
    }
  } else if (cdCountdown) {
    cdCountdown.style.display = 'none';
  }

  const cdTierStats = el('cdTierStats');
  if (cdTierStats) {
    const tiers = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
    const tierColors: Record<string, string> = {
      quickfire: '#3b82f6', explain: '#22c55e', apply: '#f59e0b',
      distinguish: '#8b5cf6', mock: '#ef4444', worked: '#06b6d4'
    };
    const tierCounts: Record<string, number> = {};
    courseItems.forEach((it) => { const t = it.tier || 'quickfire'; tierCounts[t] = (tierCounts[t] || 0) + 1; });
    cdTierStats.innerHTML = tiers.filter((t) => tierCounts[t]).map((t) =>
      '<div class="tier-pill" style="background:' + tierColors[t] + '20;color:' + tierColors[t] + ';border:1px solid ' + tierColors[t] + '40;">' +
        '<span class="tier-pill-label">' + tierLabel(t) + '</span>' +
        '<span class="tier-pill-count">' + (tierCounts[t] || 0) + '</span>' +
      '</div>'
    ).join('');
  }

  const cdCardList = el('cdCardList');
  if (cdCardList) {
    if (courseItems.length === 0) {
      cdCardList.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;text-align:center;padding:12px 0;">No cards in this course yet.</div>';
    } else {
      cdCardList.innerHTML = courseItems.map((it) =>
        '<div style="padding:6px 8px;border-radius:6px;border:1px solid var(--border-subtle);margin-bottom:4px;background:var(--surface-0);">' +
          '<div style="font-size:11px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(it.prompt || '—') + '</div>' +
          '<div style="font-size:9px;color:var(--text-tertiary);margin-top:2px;">' + tierLabel(it.tier || 'quickfire') + (it.topic ? ' · ' + esc(it.topic) : '') + '</div>' +
        '</div>'
      ).join('');
    }
  }

  const cdBadges = el('cdBadges');
  if (cdBadges && course) {
    const examTypeLabel: Record<string, string> = {
      mcq: 'MCQ', essay: 'Essay', oral: 'Oral', mixed: 'Mixed', problem: 'Problem-Solving'
    };
    cdBadges.innerHTML =
      '<span class="cd-badge">' + (examTypeLabel[course.examType || 'mixed'] || 'Mixed') + '</span>' +
      (course.color ? '<span class="cd-badge" style="background:' + course.color + '22;color:' + course.color + ';border-color:' + course.color + '44;">●</span>' : '');
  }

  const cdStart = el('cdStartSession');
  const oldStart = cdStart?.cloneNode(true) as HTMLElement | null;
  if (cdStart && oldStart) {
    cdStart.parentNode?.replaceChild(oldStart, cdStart);
    oldStart.addEventListener('click', () => {
      const w = window as unknown as Record<string, unknown>;
      (w.startCourseSession as ((c: string) => void) | undefined)?.(courseName) ||
        (w.startSession as (() => void) | undefined)?.();
    });
  }

  const cdAddCardBtn = el('cdAddCardBtn');
  if (cdAddCardBtn) {
    const newBtn = cdAddCardBtn.cloneNode(true) as HTMLElement;
    cdAddCardBtn.parentNode?.replaceChild(newBtn, cdAddCardBtn);
    newBtn.addEventListener('click', () => {
      const w = window as unknown as Record<string, unknown>;
      (w.openModal as ((course?: string) => void) | undefined)?.(courseName);
    });
  }

  const cdImportBtn = el('cdImportBtn');
  if (cdImportBtn) {
    const newBtn = cdImportBtn.cloneNode(true) as HTMLElement;
    cdImportBtn.parentNode?.replaceChild(newBtn, cdImportBtn);
    newBtn.addEventListener('click', () => {
      const w = window as unknown as Record<string, unknown>;
      (w.openImportModal as (() => void) | undefined)?.();
    });
  }
}

export function closeCourseDetail(): void {
  _activeCourseDetail = null;
  const panel = el('courseDetail') as HTMLElement | null;
  if (panel) panel.style.display = 'none';
}

export function switchTab(tab: 'home' | 'courses'): void {
  const tabHome = el('tabHome');
  const tabCourses = el('tabCourses');
  const navHome = el('navHome');
  const navCourses = el('navCourses');

  if (tab === 'home') {
    if (tabHome) { tabHome.style.display = ''; tabHome.classList.add('active'); }
    if (tabCourses) { tabCourses.style.display = 'none'; tabCourses.classList.remove('active'); }
    if (navHome) navHome.classList.add('active');
    if (navCourses) navCourses.classList.remove('active');
    closeCourseDetail();
  } else {
    if (tabHome) { tabHome.style.display = 'none'; tabHome.classList.remove('active'); }
    if (tabCourses) { tabCourses.style.display = ''; tabCourses.classList.add('active'); }
    if (navHome) navHome.classList.remove('active');
    if (navCourses) navCourses.classList.add('active');
    renderCourseList();
    closeCourseDetail();
  }
}

// ============================================
// View Switching
// ============================================

export function wireViewSignal(): void {
  effect(() => {
    const view = currentView.value;
    if (view === 'dashboard') {
      // Show dashboard HTML shell, hide others
      showView('viewDash');
      const viewSession = el('viewSession');
      const viewDone = el('viewDone');
      const viewLearn = el('viewLearn');
      if (viewSession) viewSession.style.display = 'none';
      if (viewDone) viewDone.style.display = 'none';
      if (viewLearn) viewLearn.style.display = 'none';
    } else if (view === 'session' || view === 'done' || view === 'learn') {
      // Hide ALL HTML shell views when React takes over
      const viewDash = el('viewDash');
      const viewSession = el('viewSession');
      const viewDone = el('viewDone');
      const viewLearn = el('viewLearn');
      if (viewDash) viewDash.style.display = 'none';
      if (viewSession) viewSession.style.display = 'none';
      if (viewDone) viewDone.style.display = 'none';
      if (viewLearn) viewLearn.style.display = 'none';
      // React ViewRouter will render the appropriate component
    }
  });
}

export function wireAutoRender(): void {
  effect(() => {
    // Touch the signals to subscribe
    items.value;
    courses.value;
    stats.value;
    calibration.value;
    // Re-render dashboard
    renderDashboard();
  });
}

// ============================================
// Session Flow
// ============================================

// Build session queue with interleaving
function buildSessionQueue(allItems: Record<string, StudyItem>, sessionLimit: number): StudyItem[] {
  const now = new Date();
  const candidates: StudyItem[] = [];
  
  // Get due items
  for (const id in allItems) {
    const item = allItems[id];
    if (!item || item.archived) continue;
    
    const f = item.fsrs;
    if (!f || !f.lastReview || !f.due) {
      candidates.push(item);
    } else {
      const dueDate = new Date(f.due);
      if (dueDate <= now) candidates.push(item);
    }
  }
  
  // Sort by priority
  candidates.sort((a, b) => {
    const prioA = typeof a.priority === 'number' ? a.priority : 3;
    const prioB = typeof b.priority === 'number' ? b.priority : 3;
    if (prioA !== prioB) return prioA - prioB;
    return Math.random() - 0.5;
  });
  
  // Interleave by course
  const byCourse: Record<string, StudyItem[]> = {};
  candidates.forEach(item => {
    const course = item.course || 'uncategorized';
    if (!byCourse[course]) byCourse[course] = [];
    byCourse[course].push(item);
  });
  
  const interleaved: StudyItem[] = [];
  const courseKeys = Object.keys(byCourse);
  let idx = 0;
  
  while (interleaved.length < sessionLimit && interleaved.length < candidates.length) {
    let added = false;
    for (const course of courseKeys) {
      const courseItems = byCourse[course];
      if (courseItems[idx]) {
        interleaved.push(courseItems[idx]);
        added = true;
        if (interleaved.length >= sessionLimit) break;
      }
    }
    if (!added) break;
    idx++;
  }
  
  return interleaved.slice(0, sessionLimit);
}

export function startSession(): void {
  const limit = settings.value.sessionLimit || 12;
  const queue = buildSessionQueue(items.value, limit);

  if (queue.length === 0) {
    toast('No items due for review');
    return;
  }

  // Set session signals - Session.tsx will pick up from there
  sessionQueue.value = queue;
  sessionIndex.value = 0;
  sessionPhase.value = 'question';
  sessionXP.value = 0;
  currentShown.value = false;
  userAnswer.value = '';
  sessionStartTime.value = Date.now();

  // Switch to session view - React ViewRouter renders Session component
  currentView.value = 'session';
}

export function renderCurrentItem(): void {
  const queue = sessionQueue.value;
  const idx = sessionIndex.value;
  const item = queue[idx];
  
  if (!item) return;
  
  // Update progress
  const progText = el('progText');
  const progBar = el('progBar');
  const sessionProgText = el('sessionProgText');
  const sessionProgBar = el('sessionProgBar');
  
  const progress = Math.round(((idx) / queue.length) * 100);
  const label = `${idx + 1}/${queue.length}`;
  
  if (progText) progText.textContent = label;
  if (progBar) progBar.style.width = progress + '%';
  if (sessionProgText) sessionProgText.textContent = label;
  if (sessionProgBar) sessionProgBar.style.width = progress + '%';
  
  // Update course hint
  const courseHint = el('courseHint');
  if (courseHint) courseHint.textContent = item.course || '—';
  
  // Update prompt
  const promptText = el('promptText');
  if (promptText) {
    if (item.tier === 'apply' && item.scenario) {
      promptText.innerHTML = '<strong>Scenario:</strong><br>' + renderMd(item.scenario);
    } else {
      promptText.textContent = item.prompt || '—';
    }
  }
  
  // Update meta
  const metaCourse = el('metaCourse');
  const metaTopic = el('metaTopic');
  if (metaCourse) metaCourse.textContent = item.course || '—';
  if (metaTopic) metaTopic.textContent = item.topic || '—';
  
  // Update tier badge
  const tierBadge = el('tierBadge');
  const tierBadgeText = el('tierBadgeText');
  const sessionTierText = el('sessionTierText');
  
  const tier = item.tier || 'quickfire';
  const tierColor = tierColour(tier);
  
  if (tierBadge) {
    tierBadge.innerHTML = `<span class="tiny">●</span> ${tierLabel(tier)}`;
    (tierBadge as HTMLElement).style.background = tierColor;
    (tierBadge as HTMLElement).style.color = '#fff';
  }
  if (tierBadgeText) tierBadgeText.textContent = tierLabel(tier);
  if (sessionTierText) sessionTierText.textContent = tierLabel(tier);
  
  // Hide model answer and ratings initially
  const modelAnswer = el('modelAnswer');
  const ratings = el('ratings');
  if (modelAnswer) modelAnswer.style.display = 'none';
  if (ratings) ratings.style.display = 'none';
  
  // Clear AI feedback
  const aiFeedbackArea = el('aiFeedbackArea');
  if (aiFeedbackArea) aiFeedbackArea.innerHTML = '';
  
  // Render tier-specific UI
  const tierArea = el('tierArea');
  if (tierArea) {
    // Call the appropriate tier renderer from tiers.ts (attached to window)
    const win = window as unknown as Record<string, unknown>;
    // Minimal session state for tier renderers - they only need confidence
    const sessionState = { confidence: 'medium' as const };
    // Type for tier renderer functions
    type TierRenderer = (it: StudyItem, session: { confidence: 'low' | 'medium' | 'high' }) => void;
    
    switch (tier) {
      case 'quickfire':
        (win.renderQuickfireTier as TierRenderer | undefined)?.(item, sessionState);
        break;
      case 'explain':
        (win.renderExplainTier as TierRenderer | undefined)?.(item, sessionState);
        break;
      case 'apply':
        (win.renderApplyTier as TierRenderer | undefined)?.(item, sessionState);
        break;
      case 'distinguish':
        (win.renderDistinguishTier as TierRenderer | undefined)?.(item, sessionState);
        break;
      case 'mock':
        (win.renderMockTier as TierRenderer | undefined)?.(item, sessionState);
        break;
      case 'worked':
        (win.renderWorkedTier as TierRenderer | undefined)?.(item, sessionState);
        break;
      default:
        (win.renderQuickfireTier as TierRenderer | undefined)?.(item, sessionState);
    }
  }
}

export function revealAnswer(): void {
  const queue = sessionQueue.value;
  const idx = sessionIndex.value;
  const item = queue[idx];
  
  if (!item) return;
  
  currentShown.value = true;
  sessionPhase.value = 'revealed';
  
  // Show model answer
  const modelAnswer = el('modelAnswer');
  if (modelAnswer) {
    modelAnswer.style.display = '';
    modelAnswer.innerHTML = '<div class="md-content">' + renderMd(item.modelAnswer || 'No model answer provided.') + '</div>';
  }
  
  // Show ratings
  const ratings = el('ratings');
  if (ratings) {
    ratings.style.display = 'grid';
    // Wire rating buttons
    ratings.querySelectorAll('.rate').forEach((btn) => {
      // Remove old listeners by cloning
      const newBtn = btn.cloneNode(true) as HTMLElement;
      btn.parentNode?.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => {
        const rating = parseInt(newBtn.getAttribute('data-rate') || '3', 10);
        rateCurrent(rating);
      });
    });
  }
}

export function rateCurrent(rating: number): void {
  const queue = sessionQueue.value;
  const idx = sessionIndex.value;
  const item = queue[idx];
  
  if (!item) return;
  
  // Call FSRS scheduling (global function from fsrs.ts)
  const win = window as unknown as { scheduleFsrs?: (item: StudyItem, rating: number, now: number, updateStats: boolean) => { intervalDays: number } };
  const result = win.scheduleFsrs?.(item, rating, Date.now(), true) || { intervalDays: 1 };
  
  // Update XP
  const tier = item.tier || 'quickfire';
  const tierMultipliers: Record<string, number> = {
    quickfire: 1, explain: 1.5, apply: 2, distinguish: 2.5, mock: 3, worked: 2
  };
  const ratingMultipliers = [0, 0.5, 1, 1.5, 2];
  const baseXP = 10;
  const xp = Math.round(baseXP * (tierMultipliers[tier] || 1) * (ratingMultipliers[rating] || 1));
  sessionXP.value += xp;
  
  // Save updated item
  items.value = { ...items.value, [item.id]: item };
  saveState();
  
  // Check if session complete
  if (idx + 1 >= queue.length) {
    completeSession();
  } else {
    // Advance to next item
    sessionIndex.value = idx + 1;
    currentShown.value = false;
    userAnswer.value = '';
    sessionPhase.value = 'question';
    renderCurrentItem();
  }
}

export function completeSession(): void {
  sessionPhase.value = 'complete';
  currentView.value = 'done';
  
  // Update done view
  const queue = sessionQueue.value;
  const xp = sessionXP.value;
  
  const doneTitle = el('doneTitle');
  const doneSub = el('doneSub');
  const doneXP = el('doneXP');
  
  if (doneTitle) doneTitle.textContent = `${queue.length} items reviewed`;
  if (doneSub) doneSub.textContent = 'Session complete';
  if (doneXP) doneXP.textContent = String(xp);
  
  // Push XP to dragon
  if (settings.value.gamificationMode === 'motivated') {
    const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
    if (se) {
      se.set('dragon', 'lastStudyXP', { xp, timestamp: new Date().toISOString() });
    }
  }
  
  // Clear active session snapshot
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (se) {
    se.set('studyengine', 'activeSession', null);
  }
  
  // Update done breakdown
  renderDoneBreakdown();
}

function renderDoneBreakdown(): void {
  const container = el('doneBreakdown');
  if (!container) return;
  
  const queue = sessionQueue.value;
  const tierCounts: Record<string, number> = {};
  
  queue.forEach(item => {
    const tier = item.tier || 'quickfire';
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  });
  
  const tiers = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
  const tierConfig: Record<string, { label: string; color: string }> = {
    quickfire: { label: 'Quickfire', color: '#3b82f6' },
    explain: { label: 'Explain', color: '#22c55e' },
    apply: { label: 'Apply', color: '#f59e0b' },
    distinguish: { label: 'Distinguish', color: '#8b5cf6' },
    mock: { label: 'Mock Exam', color: '#ef4444' },
    worked: { label: 'Worked', color: '#06b6d4' }
  };
  
  let html = '';
  for (const tier of tiers) {
    const count = tierCounts[tier] || 0;
    if (count > 0) {
      const cfg = tierConfig[tier];
      html += `<div class="done-tier-stat" style="border-left:3px solid ${cfg.color};padding-left:8px;margin-bottom:8px;">
        <div style="font-size:11px;color:var(--text-secondary);">${cfg.label}</div>
        <div style="font-size:16px;font-weight:700;color:${cfg.color};">${count}</div>
      </div>`;
    }
  }
  
  container.innerHTML = html || '<div style="color:var(--text-secondary);font-size:11px;">No items reviewed</div>';
}

// ============================================
// Wire Buttons
// ============================================

export function wireSessionButtons(): void {
  // Exit session button
  const exitBtn = el('exitSessionBtn');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      if (confirm('End this session early? Your progress will be saved.')) {
        completeSession();
      }
    });
  }
  
  // Skip button
  const skipBtn = el('skipBtn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      const queue = sessionQueue.value;
      const idx = sessionIndex.value;
      if (queue.length <= 1) return;
      
      // Move current item to end
      const newQueue = [...queue];
      const [skipped] = newQueue.splice(idx, 1);
      newQueue.push(skipped);
      sessionQueue.value = newQueue;
      
      // Reset state for next item
      currentShown.value = false;
      userAnswer.value = '';
      renderCurrentItem();
    });
  }
  
  // Back to dashboard button
  const backBtn = el('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      currentView.value = 'dashboard';
    });
  }
}

// ============================================
// Initialization
// ============================================

export function initDomController(): void {
  // Wire view switching
  wireViewSignal();
  wireAutoRender();
  wireSessionButtons();
  
  // Initial render
  renderDashboard();
  
  // Wire start button on dashboard
  const startBtn = el('startBtn');
  if (startBtn) {
    // Remove old listeners by cloning
    const newBtn = startBtn.cloneNode(true) as HTMLElement;
    startBtn.parentNode?.replaceChild(newBtn, startBtn);
    newBtn.addEventListener('click', startSession);
  }

  // Wire learn button on dashboard
  const learnBtn = el('learnBtn');
  if (learnBtn) {
    // Remove old listeners by cloning
    const newLearnBtn = learnBtn.cloneNode(true) as HTMLElement;
    learnBtn.parentNode?.replaceChild(newLearnBtn, learnBtn);
    newLearnBtn.addEventListener('click', () => {
      currentView.value = 'learn';
    });
  }
  
  // Wire nav tabs
  document.querySelectorAll('.nav-tab[data-nav]').forEach(tab => {
    tab.addEventListener('click', () => {
      const nav = tab.getAttribute('data-nav');
      if (nav === 'home') {
        currentView.value = 'dashboard';
        switchTab('home');
      } else if (nav === 'courses') {
        currentView.value = 'dashboard';
        switchTab('courses');
      }
    });
  });

  // Wire course detail back button
  const cdBack = el('cdBack');
  if (cdBack) {
    cdBack.addEventListener('click', () => {
      closeCourseDetail();
    });
  }

  // Wire course detail settings button
  const cdSettingsBtn = el('cdSettingsBtn');
  if (cdSettingsBtn) {
    cdSettingsBtn.addEventListener('click', () => {
      if (_activeCourseDetail) {
        const w = window as unknown as Record<string, unknown>;
        (w.openCourseModal as (() => void) | undefined)?.();
      }
    });
  }

  // Ensure courseDetail starts hidden
  const cdPanel = el('courseDetail') as HTMLElement | null;
  if (cdPanel) cdPanel.style.display = 'none';
}
