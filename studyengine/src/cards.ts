/*
 * Cards TypeScript Module
 * Signals-first: all state access via signal .value
 */

import { el, esc, uid, isoNow, toast, tierLabel, generateVisual, renderMd } from './utils';
import { items, courses, subDecks, settings, saveState } from './signals';
import { COURSE_COLORS, EXAM_TYPE_LABELS } from './constants';
import { tierSupportBadgeHTML } from './state-io';
import { saveCourse, listCourses as listCoursesFromModule, getSubDeck as getSubDeckFromModule, createSubDeck as createSubDeckFromModule, recountSubDeck as recountSubDeckFromModule, detectSupportedTiers as detectSupportedTiersFromModule, renderTopicSuggestions as renderTopicSuggestionsFromModule } from './courses';
import type { StudyItem, Course } from './types';

// External CDN globals (keep as declare)
declare function playOpen(): void;
declare function playClose(): void;
declare function playError(): void;
declare function playPresetSelect(): void;
declare const Core: { a11y?: { trap?: (el: HTMLElement) => void } };

// Lazy getters for DOM globals
function getModalOv(): HTMLElement {
  return document.getElementById('modalOv')!;
}

// Module-level mutable state (actual definitions, not just declares)
let editingItemId: string | null = null;
let modalEditAfterSave: ((item: StudyItem | null) => void) | null = null;
let importFormat: 'json' | 'qa' = 'json';
let activeTab = 'add';
let modalCourse: string | null = null;
let modalShowingPicker = false;
let pendingImport: StudyItem[] | null = null;

// Lazily resolved window callbacks (set by index.ts init)
let openCourseModalImpl: () => void = () => {};
let openCourseDetailImpl: (course: string) => void = () => {};
let maybeAutoPrepareImpl: (course: string) => void = () => {};
export function setOpenCourseModal(fn: () => void) { openCourseModalImpl = fn; }
export function setOpenCourseDetail(fn: (course: string) => void) { openCourseDetailImpl = fn; }
export function setMaybeAutoPrepare(fn: (course: string) => void) { maybeAutoPrepareImpl = fn; }

// Signal mutations trigger Preact re-renders — no manual renderDashboard needed
function renderDashboard(): void {
  // Trigger signal update to force re-render
  items.value = { ...items.value };
}
function listCourses(): Course[] { return listCoursesFromModule(); }
function getSubDeck(course: string, subDeck: string) { return getSubDeckFromModule(course, subDeck); }
function createSubDeck(course: string, subDeck: string): void { createSubDeckFromModule(course, subDeck); }
function recountSubDeck(course: string, subDeck: string): void { recountSubDeckFromModule(course, subDeck); }
function detectSupportedTiers(item: StudyItem): string[] { return detectSupportedTiersFromModule(item); }
function renderTopicSuggestions(inputId: string, courseName: string | null, containerId: string): void { renderTopicSuggestionsFromModule(inputId, courseName || '', containerId); }
function openCourseModal(): void { openCourseModalImpl(); }
function openCourseDetail(course: string): void { openCourseDetailImpl(course); }
function maybeAutoPrepare(course: string): void { maybeAutoPrepareImpl(course); }

/**
 * Render the add/edit card modal form into #modalForm
 */
function renderModal(): void {
  const formEl = el('modalForm');
  if (!formEl) return;
  const editing = editingItemId ? items.value[editingItemId] : null;
  const courses = listCourses();

  // Course picker (shown when multiple courses and no course selected)
  if (modalShowingPicker && !editing) {
    formEl.innerHTML =
      '<div class="modal-course-picker">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Select a course</div>' +
        courses.map((c) =>
          '<button type="button" class="course-pick-btn" data-course="' + esc(c.name) + '" style="border-left:3px solid ' + esc(c.color || '#8b5cf6') + '">' +
            '<span class="cpb-name">' + esc(c.name) + '</span>' +
          '</button>'
        ).join('') +
      '</div>';
    formEl.querySelectorAll('.course-pick-btn').forEach((btn) => {
      btn.addEventListener('click', function(this: HTMLElement) {
        modalCourse = this.getAttribute('data-course') || null;
        modalShowingPicker = false;
        renderModal();
      });
    });
    updateModalTabs();
    return;
  }

  const course = modalCourse || (courses.length === 1 ? courses[0].name : null) || '';
  const it = editing;
  const tab = activeTab || 'add';

  if (tab === 'import') {
    formEl.innerHTML =
      '<div class="import-mode-toggle" style="display:flex;gap:6px;margin-bottom:10px;">' +
        '<button type="button" class="imp-mode-btn ' + (importFormat === 'json' ? 'active' : '') + '" data-fmt="json">JSON</button>' +
        '<button type="button" class="imp-mode-btn ' + (importFormat === 'qa' ? 'active' : '') + '" data-fmt="qa">Q/A Text</button>' +
      '</div>' +
      '<div id="importModeHint" style="font-size:10px;color:var(--text-secondary);margin-bottom:8px;">' +
        (importFormat === 'qa' ? 'Format: Q: question<br>A: answer<br>T: topic (optional)' : 'Paste a JSON array of card objects') +
      '</div>' +
      '<textarea id="m_import" class="modal-ta" rows="8" placeholder="' + (importFormat === 'qa' ? 'Q: What is X?\nA: X is...\nT: Topic' : '[{"prompt":"...","modelAnswer":"...","course":"' + esc(course) + '"}]') + '"></textarea>' +
      '<div id="importPreviewArea" style="margin-top:8px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;">' +
        '<button type="button" class="big-btn" id="modalSaveBtn">Preview Import</button>' +
      '</div>';

    formEl.querySelectorAll('.imp-mode-btn').forEach((btn) => {
      btn.addEventListener('click', function(this: HTMLElement) {
        importFormat = (this.getAttribute('data-fmt') as 'json' | 'qa') || 'json';
        updateImportModeUI(true);
      });
    });
    formEl.querySelector('#modalSaveBtn')?.addEventListener('click', () => addFromModal());
    updateModalTabs();
    return;
  }

  // Add/Edit tab
  const promptVal = it ? esc(it.prompt || '') : '';
  const answerVal = it ? esc(it.modelAnswer || '') : '';
  const topicVal = it ? esc(it.topic || '') : '';
  const subDeckVal = it ? esc(it.subDeck || '') : '';
  const priorityVal = it ? (it.priority || 'medium') : 'medium';
  const scenarioVal = it ? esc(it.scenario || '') : '';
  const taskVal = it ? esc(it.task || '') : '';
  const conceptAVal = it ? esc(it.conceptA || '') : '';
  const conceptBVal = it ? esc(it.conceptB || '') : '';
  const timeVal = it ? (it.timeLimitMins || 0) : 0;

  formEl.innerHTML =
    (course ? '<div class="modal-course-label" style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">Course: <span style="color:var(--accent)">' + esc(course) + '</span></div>' : '') +
    '<div class="form-row">' +
      '<label class="form-label">Question / Prompt *</label>' +
      '<textarea id="m_prompt" class="modal-ta" rows="3" placeholder="What is...">' + promptVal + '</textarea>' +
    '</div>' +
    '<div class="form-row">' +
      '<label class="form-label">Model Answer *</label>' +
      '<textarea id="m_answer" class="modal-ta" rows="4" placeholder="The answer is...">' + answerVal + '</textarea>' +
    '</div>' +
    '<div class="form-row-2col">' +
      '<div class="form-row">' +
        '<label class="form-label">Topic</label>' +
        '<input id="m_topic" class="modal-input" type="text" value="' + topicVal + '" placeholder="e.g. Chapter 3" autocomplete="off">' +
        '<div id="topicSuggestions" class="chip-row" style="display:none;margin-top:4px;flex-wrap:wrap;gap:4px;"></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<label class="form-label">Sub-deck</label>' +
        '<input id="m_subDeck" class="modal-input" type="text" value="' + subDeckVal + '" placeholder="Optional group" autocomplete="off">' +
      '</div>' +
    '</div>' +
    '<div class="form-row">' +
      '<label class="form-label">Priority</label>' +
      '<select id="m_priority" class="modal-select">' +
        ['critical','high','medium','low'].map((p) => '<option value="' + p + '"' + (priorityVal === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>').join('') +
      '</select>' +
    '</div>' +
    '<details class="advanced-fields" style="margin-top:8px;">' +
      '<summary style="font-size:10px;font-weight:700;color:var(--text-secondary);cursor:pointer;user-select:none;text-transform:uppercase;letter-spacing:1px;">Advanced Fields</summary>' +
      '<div style="padding-top:8px;">' +
        '<div class="form-row">' +
          '<label class="form-label">Scenario (Apply tier)</label>' +
          '<textarea id="m_scenario" class="modal-ta" rows="2" placeholder="You are a doctor...">' + scenarioVal + '</textarea>' +
        '</div>' +
        '<div class="form-row">' +
          '<label class="form-label">Task (Apply tier)</label>' +
          '<textarea id="m_task" class="modal-ta" rows="2" placeholder="Diagnose the patient...">' + taskVal + '</textarea>' +
        '</div>' +
        '<div class="form-row-2col">' +
          '<div class="form-row">' +
            '<label class="form-label">Concept A (Distinguish)</label>' +
            '<input id="m_conceptA" class="modal-input" type="text" value="' + conceptAVal + '" placeholder="Concept A">' +
          '</div>' +
          '<div class="form-row">' +
            '<label class="form-label">Concept B (Distinguish)</label>' +
            '<input id="m_conceptB" class="modal-input" type="text" value="' + conceptBVal + '" placeholder="Concept B">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<label class="form-label">Time Limit (Mock tier)</label>' +
          '<select id="m_time" class="modal-select">' +
            '<option value="0"' + (!timeVal ? ' selected' : '') + '>None</option>' +
            [5,10,15,30].map((t) => '<option value="' + t + '"' + (timeVal === t ? ' selected' : '') + '>' + t + ' min</option>').join('') +
          '</select>' +
        '</div>' +
      '</div>' +
    '</details>' +
    '<div id="tierBadgeArea" style="margin-top:8px;"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;">' +
      '<button type="button" class="big-btn" id="modalSaveBtn">' + (it ? 'Save Changes' : 'Add Card') + '</button>' +
      (!it ? '<button type="button" class="mini-btn" id="modalSaveStayBtn">Add &amp; Stay</button>' : '') +
      (it ? '<button type="button" class="mini-btn danger" id="modalDeleteBtn">Delete</button>' : '') +
    '</div>';

  // Wire buttons
  formEl.querySelector('#modalSaveBtn')?.addEventListener('click', () => addFromModal());
  formEl.querySelector('#modalSaveStayBtn')?.addEventListener('click', () => addFromModal(true));
  if (it) {
    formEl.querySelector('#modalDeleteBtn')?.addEventListener('click', () => deleteEditedItem(it.id));
  }

  // Topic suggestions
  if (course) {
    renderTopicSuggestions('m_topic', course, 'topicSuggestions');
    const topicInput = el('m_topic') as HTMLInputElement | null;
    topicInput?.addEventListener('input', () => {
      renderTopicSuggestions('m_topic', course, 'topicSuggestions');
    });
  }

  // Tier badge preview on input change
  const updateBadge = () => {
    const p = (el('m_prompt') as HTMLTextAreaElement | null)?.value || '';
    const a = (el('m_answer') as HTMLTextAreaElement | null)?.value || '';
    if (!p || !a) return;
    const fake: Partial<StudyItem> = {
      id: 'preview', prompt: p, modelAnswer: a,
      scenario: (el('m_scenario') as HTMLTextAreaElement | null)?.value || undefined,
      task: (el('m_task') as HTMLTextAreaElement | null)?.value || undefined,
      conceptA: (el('m_conceptA') as HTMLInputElement | null)?.value || undefined,
      conceptB: (el('m_conceptB') as HTMLInputElement | null)?.value || undefined,
      timeLimitMins: parseInt((el('m_time') as HTMLSelectElement | null)?.value || '0') || undefined
    };
    const supported = detectSupportedTiers(fake as StudyItem);
    const badgeArea = el('tierBadgeArea');
    if (badgeArea) badgeArea.innerHTML = tierSupportBadgeHTML(supported);
  };
  ['m_prompt','m_answer','m_scenario','m_task','m_conceptA','m_conceptB','m_time'].forEach((id) => {
    el(id)?.addEventListener(id === 'm_time' ? 'change' : 'input', updateBadge);
  });
  if (it) updateBadge();

  updateModalTabs();
}

/**
 * Update the modal tab bar to match activeTab
 */
function updateModalTabs(): void {
  const tabs = document.getElementById('modalTabs');
  if (!tabs) return;
  tabs.querySelectorAll('[data-tab]').forEach((t) => {
    if (t.getAttribute('data-tab') === activeTab) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
}

/**
 * Switch modal tab and re-render
 */
export function switchModalTab(tab: string): void {
  activeTab = tab;
  renderModal();
}

/**
 * Update import mode UI (toggle JSON/QA hints)
 */
function updateImportModeUI(animate: boolean): void {
  const hint = el('importModeHint');
  const ta = el('m_import') as HTMLTextAreaElement | null;
  const btns = document.querySelectorAll('.imp-mode-btn');
  btns.forEach((b) => {
    if (b.getAttribute('data-fmt') === importFormat) b.classList.add('active');
    else b.classList.remove('active');
  });
  if (hint) {
    hint.innerHTML = importFormat === 'qa'
      ? 'Format: Q: question<br>A: answer<br>T: topic (optional)'
      : 'Paste a JSON array of card objects';
  }
  if (ta) {
    ta.placeholder = importFormat === 'qa'
      ? 'Q: What is X?\nA: X is...\nT: Topic'
      : '[{"prompt":"...","modelAnswer":"...","course":"' + (modalCourse || '') + '"}]';
  }
  if (animate && (window as unknown as { gsap?: typeof gsap }).gsap && hint) {
    (window as unknown as { gsap: typeof gsap }).gsap.fromTo(hint, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.2 });
  }
}

/**
 * Open card modal
 */
export function openModal(tab?: string, courseName?: string): void {
  editingItemId = null;
  modalEditAfterSave = null;
  importFormat = 'json';
  activeTab = tab || activeTab || 'add';

  // Determine course context
  if (courseName) {
    modalCourse = courseName;
    modalShowingPicker = false;
  } else {
    const courses = listCourses();
    if (courses.length === 0) {
      // No courses: redirect to course management
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

  const modalOv = getModalOv();
  modalOv.classList.add('show');
  modalOv.setAttribute('aria-hidden','false');
  renderModal();
  if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(modalOv);
  try { playOpen(); } catch(e) {}
}

/**
 * Close card modal
 */
export function closeModal(): void {
  const modalOv = getModalOv();
  modalOv.classList.remove('show');
  modalOv.setAttribute('aria-hidden','true');
  pendingImport = null;
  editingItemId = null;
  modalEditAfterSave = null;
  const previewArea = document.getElementById('importPreviewArea');
  if (previewArea) previewArea.innerHTML = '';
  try { playClose(); } catch(e) {}
}

/**
 * Detect import format from raw text
 */
function detectImportMode(raw: string): 'json' | 'qa' {
  const text = String(raw || '').trim();
  if (!text) return importFormat || 'json';
  if (/^[\[{]/.test(text)) return 'json';
  if (/^Q:\s*/m.test(text) || /\nQ:\s*/.test(text)) return 'qa';
  return importFormat || 'json';
}

/**
 * Parse Q/A format import
 */
function parseQaImport(raw: string): Array<{ prompt: string; modelAnswer: string; topic: string }> | null {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const cards: Array<{ prompt: string; modelAnswer: string; topic: string }> = [];
  let card: { prompt: string; modelAnswer: string; topic: string } | null = null;
  let currentField: 'prompt' | 'modelAnswer' | 'topic' | '' = '';
  let sawPrompt = false;
  let sawAnswer = false;

  function ensureCard() {
    if (!card) card = { prompt: '', modelAnswer: '', topic: '' };
  }

  function commitCard() {
    if (!card) return;
    const prompt = String(card.prompt || '').trim();
    const answer = String(card.modelAnswer || '').trim();
    const topic = String(card.topic || '').trim();
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

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      commitCard();
      return;
    }
    if (/^Q:\s*/i.test(trimmed)) {
      if (card && String(card.prompt || '').trim() && String(card.modelAnswer || '').trim()) commitCard();
      ensureCard();
      if (card) {
        card.prompt = trimmed.replace(/^Q:\s*/i, '').trim();
        currentField = 'prompt';
        sawPrompt = true;
      }
      return;
    }
    if (/^A:\s*/i.test(trimmed)) {
      ensureCard();
      if (card) {
        card.modelAnswer = trimmed.replace(/^A:\s*/i, '').trim();
        currentField = 'modelAnswer';
        sawAnswer = true;
      }
      return;
    }
    if (/^T:\s*/i.test(trimmed)) {
      ensureCard();
      if (card) {
        card.topic = trimmed.replace(/^T:\s*/i, '').trim();
        currentField = 'topic';
      }
      return;
    }
    if (!currentField) return;
    ensureCard();
    if (!card) return;
    const spacer = card[currentField] ? '\n' : '';
    card[currentField] = String(card[currentField] || '') + spacer + trimmed;
  });

  commitCard();

  if (!sawPrompt || !sawAnswer) {
    toast('Use Q: and A: prefixes to mark questions and answers');
    return null;
  }
  return cards;
}

/**
 * Get tier unlock message
 */
function getTierUnlockMessage(beforeTiers: string[], afterTiers: string[]): string {
  const unlocked: string[] = [];
  (afterTiers || []).forEach((tier) => {
    if ((beforeTiers || []).indexOf(tier) < 0) unlocked.push(tierLabel(tier));
  });
  if (!unlocked.length) return '';
  if (unlocked.length === 1) return 'Now supports ' + unlocked[0] + ' tiers';
  return 'Now supports ' + unlocked.join(' + ') + ' tiers';
}

/**
 * Save edited item
 */
function saveEditedItem(itemId: string): void {
  const it = items.value[itemId];
  if (!it) { toast('Card not found'); closeModal(); return; }

  const prompt = ((el('m_prompt') as HTMLTextAreaElement | null)?.value || '').trim();
  const answer = ((el('m_answer') as HTMLTextAreaElement | null)?.value || '').trim();
  if (!prompt || !answer) {
    try { playError(); } catch(e) {}
    toast('Prompt and model answer are required');
    return;
  }

  const beforeTiers = detectSupportedTiers(it);
  const beforePrompt = it.prompt || '';
  const beforeAnswer = it.modelAnswer || '';

  it.prompt = prompt;
  it.modelAnswer = answer;
  it.topic = ((el('m_topic') as HTMLInputElement | null)?.value || '').trim();
  it.priority = ((el('m_priority') as HTMLSelectElement | null)?.value as 'critical' | 'high' | 'medium' | 'low') || 'medium';

  const scenario = ((el('m_scenario') as HTMLTextAreaElement | null)?.value || '').trim();
  const task = ((el('m_task') as HTMLTextAreaElement | null)?.value || '').trim();
  const conceptA = ((el('m_conceptA') as HTMLInputElement | null)?.value || '').trim();
  const conceptB = ((el('m_conceptB') as HTMLInputElement | null)?.value || '').trim();
  const timeVal = el('m_time') ? parseInt((el('m_time') as HTMLInputElement).value, 10) : 0;

  if (scenario) it.scenario = scenario; else delete it.scenario;
  if (task) it.task = task; else delete it.task;
  if (conceptA) it.conceptA = conceptA; else delete it.conceptA;
  if (conceptB) it.conceptB = conceptB; else delete it.conceptB;
  if (timeVal && [5,10,15,30].indexOf(timeVal) >= 0) it.timeLimitMins = timeVal;
  else delete it.timeLimitMins;

  if (beforePrompt !== prompt || beforeAnswer !== answer) it.visual = undefined;

  items.value[itemId] = it;
  saveState();
  renderDashboard();

  const afterTiers = detectSupportedTiers(it);
  const unlockMsg = getTierUnlockMessage(beforeTiers, afterTiers);
  toast(unlockMsg || 'Card updated');
  try { playPresetSelect(); } catch(e2) {}

  const afterSave = modalEditAfterSave;
  closeModal();
  if (typeof afterSave === 'function') afterSave(it);
  else if (it.course) {
    try { openCourseDetail(it.course); } catch(e3) {}
  }
}

/**
 * Delete edited item
 */
function deleteEditedItem(itemId: string): void {
  if (!items.value[itemId]) return;
  if (!window.confirm('Delete this card permanently?')) return;
  const its = { ...items.value };
  delete its[itemId];
  items.value = its;
  saveState();
  renderDashboard();
  const afterSave = modalEditAfterSave;
  closeModal();
  toast('Card deleted');
  if (typeof afterSave === 'function') afterSave(null);
}

/**
 * Edit item
 */
function editItem(itemId: string, opts?: { onSave?: (item: StudyItem | null) => void }): void {
  const it = items.value[itemId];
  if (!it) { toast('Card not found'); return; }
  opts = opts || {};
  activeTab = 'add';
  editingItemId = itemId;
  modalEditAfterSave = typeof opts.onSave === 'function' ? opts.onSave : null;
  modalCourse = it.course || null;
  modalShowingPicker = false;
  const modalOv = getModalOv();
  modalOv.classList.add('show');
  modalOv.setAttribute('aria-hidden','false');
  renderModal();
  if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(modalOv);
  try { playOpen(); } catch(e) {}
}

/**
 * Add card from modal
 */
export function addFromModal(stayOpen?: boolean): void {
  if (activeTab === 'import') {
    doImport();
    // Preview is now shown inline — don't close modal yet
    return;
  }
  if (editingItemId) {
    saveEditedItem(editingItemId);
    return;
  }

  // Course comes from modalCourse context, not a form field
  const course = modalCourse;
  if (!course) { toast('No course selected'); return; }

  // Auto-create course if somehow missing (safety net)
  if (!courses.value[course]) {
    saveCourse({
      name: course,
      examType: 'mixed',
      examDate: null,
      manualMode: false,
      color: '#8b5cf6',
      created: isoNow()
    } as Course);
  }

  const topic = ((el('m_topic') as HTMLInputElement | null)?.value || '').trim();
  const subDeck = ((el('m_subDeck') as HTMLInputElement | null)?.value || '').trim() || null;
  const prompt = ((el('m_prompt') as HTMLTextAreaElement | null)?.value || '').trim();
  const answer = ((el('m_answer') as HTMLTextAreaElement | null)?.value || '').trim();

  if (!prompt || !answer) {
    try { playError(); } catch(e) {}
    toast('Prompt and model answer are required');
    return;
  }

  const it: StudyItem = {
    id: uid(),
    prompt: prompt,
    modelAnswer: answer,
    course: course,
    topic: topic,
    subDeck: subDeck,
    created: isoNow(),
    fsrs: { stability: 0, difficulty: 0, due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), lastReview: null, reps: 0, lapses: 0, state: 'new' },
    variants: {}
  };

  // Optional advanced fields
  const scenario = ((el('m_scenario') as HTMLTextAreaElement | null)?.value || '').trim();
  const task = ((el('m_task') as HTMLTextAreaElement | null)?.value || '').trim();
  const conceptA = ((el('m_conceptA') as HTMLInputElement | null)?.value || '').trim();
  const conceptB = ((el('m_conceptB') as HTMLInputElement | null)?.value || '').trim();
  const timeVal = el('m_time') ? parseInt((el('m_time') as HTMLInputElement).value, 10) : 0;
  const priority = ((el('m_priority') as HTMLSelectElement | null)?.value as 'critical' | 'high' | 'medium' | 'low') || 'medium';
  it.priority = priority;

  if (scenario) it.scenario = scenario;
  if (task) it.task = task;
  if (conceptA) it.conceptA = conceptA;
  if (conceptB) it.conceptB = conceptB;
  if (timeVal && [5,10,15,30].indexOf(timeVal) >= 0) it.timeLimitMins = timeVal;

  // For backward compat: set tier if only basic fields (manual mode users can override)
  // Not setting tier — let the session builder assign dynamically

  items.value[it.id] = it;
  saveState();
  if (subDeck && !getSubDeck(course, subDeck)) {
    createSubDeck(course, subDeck);
  }
  if (subDeck) recountSubDeck(course, subDeck);
  renderDashboard();

  // Generate visual (async, non-blocking)
  generateVisual(it).then((visual) => {
    if (visual) {
      it.visual = visual;
      items.value[it.id] = it;
      saveState();
      renderDashboard();
    }
  });

  // Show supported tiers badge
  const supported = detectSupportedTiers(it);
  const badgeArea = el('tierBadgeArea');
  if (badgeArea) {
    badgeArea.innerHTML = tierSupportBadgeHTML(supported);
    if ((window as unknown as { gsap?: typeof gsap }).gsap) {
      (window as unknown as { gsap: typeof gsap }).gsap.fromTo(badgeArea, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }
  }

  toast('Added — supports ' + supported.length + ' tier' + (supported.length !== 1 ? 's' : ''));

  maybeAutoPrepare(course);

  if (stayOpen) {
    // Clear content fields but keep topic
    const mPrompt = el('m_prompt') as HTMLTextAreaElement | null;
    const mAnswer = el('m_answer') as HTMLTextAreaElement | null;
    const mScenario = el('m_scenario') as HTMLTextAreaElement | null;
    const mTask = el('m_task') as HTMLTextAreaElement | null;
    const mConceptA = el('m_conceptA') as HTMLInputElement | null;
    const mConceptB = el('m_conceptB') as HTMLInputElement | null;
    if (mPrompt) mPrompt.value = '';
    if (mAnswer) mAnswer.value = '';
    if (mScenario) mScenario.value = '';
    if (mTask) mTask.value = '';
    if (mConceptA) mConceptA.value = '';
    if (mConceptB) mConceptB.value = '';
    // Refresh topic suggestions (new topic may have been created)
    renderTopicSuggestions('m_topic', modalCourse, 'topicSuggestions');
  }
}

/**
 * Execute import
 */
export function doImport(): void {
  const raw = ((el('m_import') as HTMLTextAreaElement | null)?.value || '').trim();
  if (!raw) { try { playError(); } catch(e) {} toast(importFormat === 'qa' ? 'Paste Q/A text first' : 'Paste JSON first'); return; }

  importFormat = detectImportMode(raw);
  updateImportModeUI(false);
}

// Attach to window for .js consumers
if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>;
  win.openModal = openModal;
  win.closeModal = closeModal;
  win.switchModalTab = switchModalTab;
  win.detectImportMode = detectImportMode;
  win.parseQaImport = parseQaImport;
  win.getTierUnlockMessage = getTierUnlockMessage;
  win.saveEditedItem = saveEditedItem;
  win.deleteEditedItem = deleteEditedItem;
  win.editItem = editItem;
  win.addFromModal = addFromModal;
  win.doImport = doImport;
}
