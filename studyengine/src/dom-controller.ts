/*
 * DOM Controller
 * Imperative rendering layer that reads from signals and updates the HTML shell.
 * This replaces the Preact components for Dashboard, Session, and Done views.
 */

import { effect } from '@preact/signals-react';
import { items, courses, currentView } from './signals';
import { countDue, avgRetention, tierLabel, el, esc } from './utils';
import { listCourses } from './courses';
import type { StudyItem } from './types';

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
  const viewDash = el('viewDash');
  const tabHome = el('tabHome');
  const tabCourses = el('tabCourses');
  const navHome = el('navHome');
  const navCourses = el('navCourses');

  if (tab === 'home') {
    // Home dashboard is rendered in React root now.
    if (viewDash) { viewDash.style.display = 'none'; viewDash.classList.remove('active'); }
    if (tabHome) { tabHome.style.display = ''; tabHome.classList.add('active'); }
    if (tabCourses) { tabCourses.style.display = 'none'; tabCourses.classList.remove('active'); }
    if (navHome) navHome.classList.add('active');
    if (navCourses) navCourses.classList.remove('active');
    closeCourseDetail();
  } else {
    // Courses still uses HTML shell for now.
    if (viewDash) { viewDash.style.display = ''; viewDash.classList.add('active'); }
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
    if (view === 'session') document.body.classList.add('in-session');
    else document.body.classList.remove('in-session');

    if (view === 'dashboard') {
      // Hide dashboard HTML shell; React Dashboard is primary renderer.
      const viewDash = el('viewDash');
      const viewSession = el('viewSession');
      const viewDone = el('viewDone');
      const viewLearn = el('viewLearn');
      if (viewDash) viewDash.style.display = 'none';
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

// ============================================
// Initialization
// ============================================

export function initDomController(): void {
  // Wire view switching
  wireViewSignal();
  
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

  // Initialize tooltips
  initTooltips();
}

// ============================================
// Tooltip System
// ============================================

function initTooltips(): void {
  let activeTooltip: HTMLElement | null = null;
  let activeIcon: HTMLElement | null = null;
  let hideTimer: number | null = null;
  
  function showTooltip(icon: HTMLElement): void {
    // Clear any pending hide
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    
    // Hide existing tooltip
    if (activeTooltip) {
      activeTooltip.classList.remove('shown');
      activeTooltip.remove();
      activeTooltip = null;
    }
    
    // Get the tooltip template from inside the info-icon
    const template = icon.querySelector('.info-tooltip') as HTMLElement | null;
    if (!template) return;
    
    activeIcon = icon;
    
    // Clone tooltip and portal it to body
    const tooltip = template.cloneNode(true) as HTMLElement;
    tooltip.id = 'portaled-tooltip';
    tooltip.classList.add('visible');
    document.body.appendChild(tooltip);
    activeTooltip = tooltip;
    
    // Position the tooltip
    positionTooltip(icon, tooltip);
    
    // Show with animation
    requestAnimationFrame(() => {
      tooltip.classList.add('shown');
    });
  }
  
  function hideTooltip(): void {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (activeTooltip) {
        activeTooltip.classList.remove('shown');
        setTimeout(() => {
          activeTooltip?.remove();
          activeTooltip = null;
          activeIcon = null;
        }, 150);
      }
    }, 100); // Small delay to allow moving mouse to tooltip
  }
  
  // Delegate mouseenter/mouseleave for info-icons
  document.addEventListener('mouseenter', (e) => {
    const target = e.target as HTMLElement;
    const infoIcon = target.closest('.info-icon') as HTMLElement | null;
    if (!infoIcon) return;
    showTooltip(infoIcon);
  }, true); // Use capture to catch events on dynamically added elements
  
  document.addEventListener('mouseleave', (e) => {
    const target = e.target as HTMLElement;
    const infoIcon = target.closest('.info-icon') as HTMLElement | null;
    if (!infoIcon) return;
    
    // Check if we're moving to the tooltip itself
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.closest('#portaled-tooltip')) return;
    
    hideTooltip();
  }, true);
  
  // Also handle tooltip hover to keep it open
  document.addEventListener('mouseenter', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#portaled-tooltip')) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
  }, true);
  
  document.addEventListener('mouseleave', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#portaled-tooltip')) {
      const related = e.relatedTarget as HTMLElement | null;
      // Don't hide if moving back to the icon
      if (related?.closest('.info-icon')) return;
      hideTooltip();
    }
  }, true);
  
  // Hide on click elsewhere
  document.addEventListener('click', () => {
    if (activeTooltip) {
      activeTooltip.classList.remove('shown');
      setTimeout(() => {
        activeTooltip?.remove();
        activeTooltip = null;
        activeIcon = null;
      }, 150);
    }
  });
  
  // Reposition on resize
  window.addEventListener('resize', () => {
    if (activeTooltip && activeIcon) {
      positionTooltip(activeIcon, activeTooltip);
    }
  });
}

function positionTooltip(icon: HTMLElement, tooltip: HTMLElement): void {
  const iconRect = icon.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 8;
  
  // Calculate position
  let top = iconRect.top - tooltipRect.height - margin;
  let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
  
  // Flip if too close to top
  if (top < margin) {
    top = iconRect.bottom + margin;
    tooltip.classList.add('arrow-top');
    tooltip.classList.remove('arrow-bottom');
  } else {
    tooltip.classList.add('arrow-bottom');
    tooltip.classList.remove('arrow-top');
  }
  
  // Keep within viewport horizontally
  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}
