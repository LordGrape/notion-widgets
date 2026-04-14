/*
 * Cards TypeScript Module
 * Phase 3 conversion: types only, ZERO logic changes
 */

import type { StudyItem, Course } from './types';

// Global dependencies
declare const state: {
  items: Record<string, StudyItem>;
  courses: Record<string, Course>;
  subDecks: Record<string, { subDecks: Record<string, { archived?: boolean; cardCount?: number }> }>;
};
declare const modalOv: HTMLElement;
declare let editingItemId: string | null;
declare let modalEditAfterSave: ((item: StudyItem | null) => void) | null;
declare let importFormat: 'json' | 'qa';
declare let activeTab: string;
declare let modalCourse: string | null;
declare let modalShowingPicker: boolean;
declare let pendingImport: StudyItem[] | null;

// Helper functions (globals)
declare function el(id: string): HTMLElement | null;
declare function esc(s: string): string;
declare function uid(): string;
declare function isoNow(): string;
declare function toast(msg: string): void;
declare function saveState(): void;
declare function reconcileStats(): void;
declare function renderDashboard(): void;
declare function renderModal(): void;
declare function renderTopicSuggestions(inputId: string, courseName: string | null, containerId: string): void;
declare function listCourses(): Course[];
declare function saveCourse(course: Course): void;
declare function getSubDeck(course: string, subDeck: string): { archived?: boolean } | null;
declare function createSubDeck(course: string, subDeck: string): void;
declare function recountSubDeck(course: string, subDeck: string): void;
declare function detectSupportedTiers(item: StudyItem): string[];
declare function tierLabel(tier: string): string;
declare function tierSupportBadgeHTML(tiers: string[]): string;
declare function generateVisual(item: StudyItem): Promise<string | null>;
declare function openCourseModal(): void;
declare function openCourseDetail(course: string): void;
declare function maybeAutoPrepare(course: string): void;
declare function playOpen(): void;
declare function playClose(): void;
declare function playError(): void;
declare function playPresetSelect(): void;
declare function updateImportModeUI(animate: boolean): void;

// Core global
declare const Core: { a11y?: { trap?: (el: HTMLElement) => void } };

/**
 * Open card modal
 */
function openModal(tab?: string, courseName?: string): void {
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

  modalOv.classList.add('show');
  modalOv.setAttribute('aria-hidden','false');
  renderModal();
  if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(modalOv);
  try { playOpen(); } catch(e) {}
}

/**
 * Close card modal
 */
function closeModal(): void {
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
  const it = state.items[itemId];
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

  state.items[itemId] = it;
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
  if (!state.items[itemId]) return;
  if (!window.confirm('Delete this card permanently?')) return;
  delete state.items[itemId];
  reconcileStats();
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
  const it = state.items[itemId];
  if (!it) { toast('Card not found'); return; }
  opts = opts || {};
  activeTab = 'add';
  editingItemId = itemId;
  modalEditAfterSave = typeof opts.onSave === 'function' ? opts.onSave : null;
  modalCourse = it.course || null;
  modalShowingPicker = false;
  modalOv.classList.add('show');
  modalOv.setAttribute('aria-hidden','false');
  renderModal();
  if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(modalOv);
  try { playOpen(); } catch(e) {}
}

// Attach to window
(window as unknown as { editCard: typeof editItem }).editCard = editItem;

/**
 * Add card from modal
 */
function addFromModal(stayOpen?: boolean): void {
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
  if (!state.courses[course]) {
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

  state.items[it.id] = it;
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
      state.items[it.id] = it;
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
function doImport(): void {
  const raw = ((el('m_import') as HTMLTextAreaElement | null)?.value || '').trim();
  if (!raw) { try { playError(); } catch(e) {} toast(importFormat === 'qa' ? 'Paste Q/A text first' : 'Paste JSON first'); return; }

  importFormat = detectImportMode(raw);
  updateImportModeUI(false);
}

// Attach to window for .js consumers
const win = window as unknown as Record<string, unknown>;

win.openModal = openModal;
win.closeModal = closeModal;
win.detectImportMode = detectImportMode;
win.parseQaImport = parseQaImport;
win.getTierUnlockMessage = getTierUnlockMessage;
win.saveEditedItem = saveEditedItem;
win.deleteEditedItem = deleteEditedItem;
win.editItem = editItem;
win.addFromModal = addFromModal;
win.doImport = doImport;

export {};
