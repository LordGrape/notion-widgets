/*
 * DOM Controller
 * Imperative rendering layer that reads from signals and updates the HTML shell.
 * This replaces the Preact components for Dashboard, Session, and Done views.
 */

import { effect } from '@preact/signals';
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
} from './signals';
import { showView, countDue, avgRetention, calibrationPct, tierLabel, tierColour, el, esc, toast, fmtMMSS, renderMd } from './utils';
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
// View Switching
// ============================================

export function wireViewSignal(): void {
  effect(() => {
    const view = currentView.value;
    if (view === 'dashboard') showView('viewDash');
    else if (view === 'session') showView('viewSession');
    else if (view === 'done') showView('viewDone');
    else if (view === 'learn') showView('viewLearn');
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
  
  // Set session signals
  sessionQueue.value = queue;
  sessionIndex.value = 0;
  sessionPhase.value = 'question';
  sessionXP.value = 0;
  currentShown.value = false;
  userAnswer.value = '';
  
  // Switch to session view
  currentView.value = 'session';
  
  // Render first item
  renderCurrentItem();
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
  
  // Wire nav tabs
  document.querySelectorAll('.nav-tab[data-nav]').forEach(tab => {
    tab.addEventListener('click', () => {
      const nav = tab.getAttribute('data-nav');
      if (nav === 'home' || nav === 'courses') {
        currentView.value = 'dashboard';
      }
    });
  });
}
