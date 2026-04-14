/*
 * Study Engine TypeScript Entry Point
 * Signals-first: no DI, no bridge effects, no hydrateFromSync.
 */

// CSS imports (Vite inlines these)
import './css/base.css';
import './css/dashboard.css';
import './css/session.css';
import './css/sidebar.css';
import './css/modals.css';
import './css/learn.css';

// Modules in dependency order (side-effects: window assignments)
import './fsrs';
import './utils';
import './tiers';
import './courses';
import './cards';

import { setOpenCourseModal, setOpenCourseDetail, setMaybeAutoPrepare } from './cards';
import { listCourses, saveCourse, deleteCourse, getCourse, getCourseExamType } from './courses';
import { esc, toast } from './utils';
import { items, courses, settings, currentView, saveState } from './signals';
import { COURSE_COLORS, EXAM_TYPE_LABELS } from './constants';
import { loadState, loadOptimizedWeights, initSyncAndBackground } from './state-io';
import { initDomController, wireViewSignal, wireAutoRender, renderDashboard, openCourseDetail, switchTab } from './dom-controller';
import { initSettingsController, openSettings } from './settings-controller';
import { initCardsController } from './cards-controller';
import { initCanvasController } from './canvas-controller';

// React
import { createRoot } from 'react-dom/client';
import { App, mountSidebar } from './App';

const w = window as unknown as Record<string, unknown>;

// ── Thin window shims (set signal values) ───────────────────────
w.switchNav = (view: string) => { currentView.value = view; };
w.startSession = () => { currentView.value = 'session'; };
w.resumeSavedSession = (snap: unknown) => {
  (w as any)._resumeSnap = snap;
  currentView.value = 'session';
};
w.renderDashboard = () => { items.value = { ...items.value }; };
w.openCourseModal = () => {
  const ov = document.getElementById('courseOv');
  if (ov) { ov.classList.add('show'); ov.setAttribute('aria-hidden', 'false'); }
  renderCourseModal();
};
w.openCreateCourseFlow = () => (w.openCourseModal as () => void)();
w.openSettings = () => { openSettings(); };
w.openImportModal = () => { (w.openModal as ((tab: string) => void) | undefined)?.('import'); };
w.openCourseDetail = (name: string) => { currentView.value = 'dashboard'; switchTab('courses'); openCourseDetail(name); };
w.updateBreadcrumb = () => {};
w.applySidebarFilter = () => {};
w.startCourseSession = (courseName: string) => {
  const courseItems = Object.values(items.value).filter((it) => it && !it.archived && it.course === courseName);
  if (courseItems.length === 0) { toast('No cards in this course'); return; }
  (w.startSession as (() => void) | undefined)?.();
};

// Wire remaining cards.ts callbacks
setOpenCourseModal(() => (w.openCourseModal as () => void)());
setOpenCourseDetail((course: string) => (w.openCourseDetail as (name: string) => void)(course));
setMaybeAutoPrepare((_course: string) => {});

// ── Mount ───────────────────────────────────────────────────────
function mountApp() {
  console.log('[StudyEngine] mountApp called');
  mountSidebar();
  const root = document.getElementById('preact-root');
  console.log('[StudyEngine] preact-root element:', root);
  if (root) {
    try {
      createRoot(root).render(<App />);
      console.log('[StudyEngine] App rendered successfully');
    } catch (e) {
      console.error('[StudyEngine] Failed to render App:', e);
    }
  } else {
    console.error('[StudyEngine] preact-root element not found');
  }

  // Wire topbar buttons
  document.getElementById('mainAddCard')?.addEventListener('click', () => {
    (w.openModal as (() => void) | undefined)?.();
  });
  document.getElementById('mainSettingsBtn')?.addEventListener('click', () => {
    (w.openSettings as (() => void) | undefined)?.();
  });

  // Wire modal close buttons
  const closeOverlay = (ovId: string) => {
    const ov = document.getElementById(ovId);
    if (ov) { ov.classList.remove('show'); ov.setAttribute('aria-hidden', 'true'); }
  };
  document.getElementById('modalClose')?.addEventListener('click', () => {
    (w.closeModal as (() => void) | undefined)?.();
  });
  document.getElementById('settingsClose')?.addEventListener('click', () => { closeOverlay('settingsOv'); });
  document.getElementById('courseClose')?.addEventListener('click', () => { closeOverlay('courseOv'); });

  // Wire modal tabs
  document.getElementById('modalTabs')?.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const t = tab.getAttribute('data-tab');
      if (t) (w.switchModalTab as ((t: string) => void) | undefined)?.(t);
    });
  });

  // Wire settings save
  document.getElementById('settingsSave')?.addEventListener('click', () => { (w.saveSettingsFromForm as (() => void) | undefined)?.(); });

  // Wire addNextBtn (Add & Next = add and keep modal open)
  document.getElementById('addNextBtn')?.addEventListener('click', () => {
    (w.addFromModal as ((stay: boolean) => void) | undefined)?.(true);
  });

  // Wire doneBtn (Add Card modal Done = add and close)
  document.getElementById('doneBtn')?.addEventListener('click', () => {
    (w.addFromModal as ((stay?: boolean) => void) | undefined)?.();
  });

  // Render course modal when opened
  document.getElementById('courseOv')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('courseOv')) closeOverlay('courseOv');
  });
  document.getElementById('settingsOv')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('settingsOv')) closeOverlay('settingsOv');
  });
  document.getElementById('modalOv')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOv')) (w.closeModal as (() => void) | undefined)?.();
  });

  // Open course modal: render content
  const origOpenCourseModal = w.openCourseModal as (() => void) | undefined;
  w.openCourseModal = () => {
    origOpenCourseModal?.();
    renderCourseModal();
  };
  w.openCreateCourseFlow = () => (w.openCourseModal as () => void)();

  // switchModalTab is already exposed by cards.ts via window.switchModalTab

  // Wire legacy dashboard action buttons
  document.getElementById('addBtn')?.addEventListener('click', () => {
    (w.openModal as (() => void) | undefined)?.();
  });
  document.getElementById('importBtn')?.addEventListener('click', () => {
    (w.openImportModal as (() => void) | undefined)?.();
  });
  document.getElementById('manageCourses')?.addEventListener('click', () => {
    (w.openCourseModal as (() => void) | undefined)?.();
  });
  document.getElementById('gearBtn')?.addEventListener('click', () => {
    (w.openSettings as (() => void) | undefined)?.();
  });

  // Wire startBtn for session start
  document.getElementById('startBtn')?.addEventListener('click', () => {
    (w.startSession as (() => void) | undefined)?.();
  });
}

// ── Course modal renderer ───────────────────────────────────────
function renderCourseModal(): void {
  const body = document.getElementById('courseModalBody');
  if (!body) return;
  const allCourses = listCourses(true);
  const active = allCourses.filter((c) => !c.archived);
  const archived = allCourses.filter((c) => c.archived);

  body.innerHTML =
    '<div style="margin-bottom:12px;">' +
      '<button type="button" className="big-btn" id="courseAddNewBtn" style="width:100%;">+ New Course</button>' +
    '</div>' +
    (active.length === 0 ? '<div style="color:var(--text-secondary);font-size:11px;text-align:center;padding:12px 0;">No courses yet.</div>' : '') +
    active.map((c) =>
      '<div className="course-row" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-subtle);">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:' + (c.color || '#8b5cf6') + ';flex-shrink:0;"></div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:12px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(c.name) + '</div>' +
          '<div style="font-size:10px;color:var(--text-secondary);">' + (EXAM_TYPE_LABELS[c.examType || 'mixed'] || 'Mixed') + '</div>' +
        '</div>' +
        '<button type="button" className="mini-btn" data-edit-course="' + esc(c.name) + '">Edit</button>' +
        '<button type="button" className="mini-btn danger" data-delete-course="' + esc(c.name) + '">Delete</button>' +
      '</div>'
    ).join('') +
    (archived.length > 0
      ? '<details style="margin-top:12px;"><summary style="font-size:10px;color:var(--text-secondary);cursor:pointer;">Archived (' + archived.length + ')</summary>' +
          archived.map((c) =>
            '<div className="course-row" style="display:flex;align-items:center;gap:8px;padding:8px 0;opacity:0.6;">' +
              '<div style="flex:1;font-size:12px;">' + esc(c.name) + '</div>' +
              '<button type="button" className="mini-btn" data-unarchive-course="' + esc(c.name) + '">Restore</button>' +
            '</div>'
          ).join('') +
        '</details>'
      : '');

  // New course form injection
  body.querySelector('#courseAddNewBtn')?.addEventListener('click', () => {
    showCreateCourseForm(body);
  });

  body.querySelectorAll('[data-edit-course]').forEach((btn) => {
    btn.addEventListener('click', function(this: HTMLElement) {
      const name = this.getAttribute('data-edit-course') || '';
      showEditCourseForm(body, name);
    });
  });

  body.querySelectorAll('[data-delete-course]').forEach((btn) => {
    btn.addEventListener('click', function(this: HTMLElement) {
      const name = this.getAttribute('data-delete-course') || '';
      if (!confirm('Delete course "' + name + '" and all its cards?')) return;
      deleteCourse(name);
      const its = { ...items.value };
      for (const id in its) {
        if (its[id]?.course === name) delete its[id];
      }
      items.value = its;
      saveState();
      renderCourseModal();
    });
  });

  body.querySelectorAll('[data-unarchive-course]').forEach((btn) => {
    btn.addEventListener('click', function(this: HTMLElement) {
      const name = this.getAttribute('data-unarchive-course') || '';
      const c = getCourse(name);
      if (c) { c.archived = false; saveCourse(c); }
      renderCourseModal();
    });
  });
}

function showCreateCourseForm(container: HTMLElement): void {
  container.innerHTML =
    '<div style="padding:4px 0;">' +
      '<div className="form-row"><label className="form-label">Course Name *</label><input id="nc_name" className="modal-input" type="text" placeholder="e.g. Biology 101"></div>' +
      '<div className="form-row"><label className="form-label">Exam Type</label>' +
        '<select id="nc_examType" className="modal-input">' +
          Object.entries(EXAM_TYPE_LABELS).map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div className="form-row"><label className="form-label">Exam Date (optional)</label><input id="nc_examDate" className="modal-input" type="date"></div>' +
      '<div className="form-row"><label className="form-label">Color</label>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          COURSE_COLORS.map((cc) => '<button type="button" className="color-swatch" data-color="' + cc.value + '" style="width:20px;height:20px;border-radius:50%;background:' + cc.value + ';border:2px solid transparent;cursor:pointer;" title="' + cc.name + '"></button>').join('') +
        '</div>' +
        '<input type="hidden" id="nc_color" value="#8b5cf6">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button type="button" className="big-btn" id="nc_save">Create Course</button>' +
        '<button type="button" className="mini-btn" id="nc_cancel">Cancel</button>' +
      '</div>' +
    '</div>';

  container.querySelectorAll('.color-swatch').forEach((sw) => {
    sw.addEventListener('click', function(this: HTMLElement) {
      container.querySelectorAll('.color-swatch').forEach((s) => (s as HTMLElement).style.borderColor = 'transparent');
      this.style.borderColor = '#fff';
      const inp = document.getElementById('nc_color') as HTMLInputElement | null;
      if (inp) inp.value = this.getAttribute('data-color') || '#8b5cf6';
    });
  });

  container.querySelector('#nc_save')?.addEventListener('click', () => {
    const name = (document.getElementById('nc_name') as HTMLInputElement | null)?.value.trim() || '';
    if (!name) { (w.toast as ((m: string) => void) | undefined)?.('Course name required'); return; }
    const examType = (document.getElementById('nc_examType') as HTMLSelectElement | null)?.value || 'mixed';
    const examDate = (document.getElementById('nc_examDate') as HTMLInputElement | null)?.value || null;
    const color = (document.getElementById('nc_color') as HTMLInputElement | null)?.value || '#8b5cf6';
    const now = new Date().toISOString();
    saveCourse({ id: name, name, examType: examType as any, examDate, manualMode: false, color, created: now } as any);
    renderCourseModal();
    (w.renderDashboard as (() => void) | undefined)?.();
    (w.toast as ((m: string) => void) | undefined)?.('Course created: ' + name);
  });

  container.querySelector('#nc_cancel')?.addEventListener('click', () => renderCourseModal());
}

function showEditCourseForm(container: HTMLElement, name: string): void {
  const c = getCourse(name);
  if (!c) return;
  container.innerHTML =
    '<div style="padding:4px 0;">' +
      '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;">Editing: ' + esc(name) + '</div>' +
      '<div className="form-row"><label className="form-label">Exam Type</label>' +
        '<select id="ec_examType" className="modal-input">' +
          Object.entries(EXAM_TYPE_LABELS).map(([v, l]) => '<option value="' + v + '"' + (getCourseExamType(c) === v ? ' selected' : '') + '>' + l + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div className="form-row"><label className="form-label">Exam Date</label><input id="ec_examDate" className="modal-input" type="date" value="' + esc(c.examDate || '') + '"></div>' +
      '<div className="form-row"><label className="form-label">Color</label>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          COURSE_COLORS.map((cc) => '<button type="button" className="color-swatch" data-color="' + cc.value + '" style="width:20px;height:20px;border-radius:50%;background:' + cc.value + ';border:2px solid ' + (c.color === cc.value ? '#fff' : 'transparent') + ';cursor:pointer;"></button>').join('') +
        '</div>' +
        '<input type="hidden" id="ec_color" value="' + esc(c.color || '#8b5cf6') + '">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button type="button" className="big-btn" id="ec_save">Save</button>' +
        '<button type="button" className="mini-btn" id="ec_archive">' + (c.archived ? 'Unarchive' : 'Archive') + '</button>' +
        '<button type="button" className="mini-btn" id="ec_cancel">Cancel</button>' +
      '</div>' +
    '</div>';

  container.querySelectorAll('.color-swatch').forEach((sw) => {
    sw.addEventListener('click', function(this: HTMLElement) {
      container.querySelectorAll('.color-swatch').forEach((s) => (s as HTMLElement).style.borderColor = 'transparent');
      this.style.borderColor = '#fff';
      const inp = document.getElementById('ec_color') as HTMLInputElement | null;
      if (inp) inp.value = this.getAttribute('data-color') || '#8b5cf6';
    });
  });

  container.querySelector('#ec_save')?.addEventListener('click', () => {
    c.examType = ((document.getElementById('ec_examType') as HTMLSelectElement | null)?.value || 'mixed') as any;
    c.examDate = (document.getElementById('ec_examDate') as HTMLInputElement | null)?.value || null;
    c.color = (document.getElementById('ec_color') as HTMLInputElement | null)?.value || '#8b5cf6';
    saveCourse(c);
    renderCourseModal();
    (w.renderDashboard as (() => void) | undefined)?.();
    (w.toast as ((m: string) => void) | undefined)?.('Course updated');
  });

  container.querySelector('#ec_archive')?.addEventListener('click', () => {
    c.archived = !c.archived;
    saveCourse(c);
    renderCourseModal();
    (w.renderDashboard as (() => void) | undefined)?.();
  });

  container.querySelector('#ec_cancel')?.addEventListener('click', () => renderCourseModal());
}

// ── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('[StudyEngine] DOMContentLoaded fired');
  // SyncEngine.init is already called from HTML <script> block
  initSyncAndBackground(); // Only sets up background, not SyncEngine

  const SE = (window as any).SyncEngine;
  console.log('[StudyEngine] SyncEngine available:', !!SE);

  const boot = () => {
    console.log('[StudyEngine] boot() called');
    loadState();
    loadOptimizedWeights();
    mountApp();
    // Initialize dom-controller for HTML shell UI
    initDomController();
    initSettingsController();
    initCardsController();
    initCanvasController();
    wireViewSignal();
    wireAutoRender();
    renderDashboard();
  };

  if (SE && typeof SE.onReady === 'function') {
    SE.onReady(boot);
    // Safety: if onReady never fires within 3s, mount anyway
    setTimeout(() => {
      if (!document.getElementById('preact-root')?.children.length) boot();
    }, 3000);
  } else {
    boot();
    // Re-hydrate after SyncEngine likely finishes
    setTimeout(loadState, 1500);
  }
});

// Hide visual lightbox on load
document.addEventListener('DOMContentLoaded', () => {
  const lb = document.getElementById('visualLightbox');
  if (lb && !lb.classList.contains('show')) {
    lb.style.display = 'none';
  }
});

export {};
