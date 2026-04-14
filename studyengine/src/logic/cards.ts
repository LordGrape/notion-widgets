// Card management logic - ported from studyengine/js/cards.js

import type { StudyItem, Tier, Priority } from '../types';
import { appState, persistState } from '../signals';
import { uid, toast } from '../utils/helpers';
import { getSubDeck, createSubDeck, isItemInArchivedSubDeck } from './courses';

export function detectSupportedTiers(item: Partial<StudyItem>): Tier[] {
  if (!item || !item.prompt || !item.modelAnswer) return [];
  const tiers: Tier[] = ['quickfire', 'explain'];
  if (item.task || item.scenario) tiers.push('apply');
  if (item.conceptA && item.conceptB) tiers.push('distinguish');
  // Mock: any item can be presented under time pressure
  tiers.push('mock');
  const paraCount = (item.modelAnswer || '').split('\n\n').filter((s) => String(s).trim()).length;
  if (paraCount >= 2) tiers.push('worked');
  return tiers;
}

export function getTierUnlockMessage(beforeTiers: Tier[], afterTiers: Tier[]): string {
  const unlocked: string[] = [];
  afterTiers.forEach((tier) => {
    if (!beforeTiers.includes(tier)) {
      // Use tier label for display
      const labels: Record<string, string> = {
        quickfire: 'QF', explain: 'EI', apply: 'AI',
        distinguish: 'DI', mock: 'ME', worked: 'WE'
      };
      unlocked.push(labels[tier] || tier);
    }
  });
  if (!unlocked.length) return '';
  if (unlocked.length === 1) return `Now supports ${unlocked[0]} tiers`;
  return `Now supports ${unlocked.join(' + ')} tiers`;
}

export function createCard(data: Partial<StudyItem>): StudyItem | null {
  const course = data.course;
  if (!course) {
    toast('No course selected');
    return null;
  }

  const prompt = (data.prompt || '').trim();
  const answer = (data.modelAnswer || '').trim();

  if (!prompt || !answer) {
    toast('Prompt and model answer are required');
    return null;
  }

  const now = new Date().toISOString();
  const card: StudyItem = {
    id: uid(),
    prompt,
    modelAnswer: answer,
    course,
    topic: (data.topic || '').trim() || 'General',
    subDeck: data.subDeck || null,
    created: now,
    archived: false,
    fsrs: {
      stability: 0,
      difficulty: 0,
      due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      lastReview: null,
      reps: 0,
      lapses: 0,
      state: 'new'
    },
    variants: {}
  };

  // Optional fields
  if (data.priority) card.priority = data.priority;
  if (data.scenario) card.scenario = data.scenario;
  if (data.task) card.task = data.task;
  if (data.conceptA) card.conceptA = data.conceptA;
  if (data.conceptB) card.conceptB = data.conceptB;
  if (data.timeLimitMins && [5, 10, 15, 30].includes(data.timeLimitMins)) {
    card.timeLimitMins = data.timeLimitMins;
  }

  appState.value.items[card.id] = card;
  persistState();

  // Create subdeck if needed
  if (card.subDeck && !getSubDeck(course, card.subDeck)) {
    createSubDeck(course, card.subDeck);
  }

  const supported = detectSupportedTiers(card);
  toast(`Added — supports ${supported.length} tier${supported.length !== 1 ? 's' : ''}`);

  return card;
}

export function updateCard(itemId: string, updates: Partial<StudyItem>): StudyItem | null {
  const card = appState.value.items[itemId];
  if (!card) {
    toast('Card not found');
    return null;
  }

  const beforeTiers = detectSupportedTiers(card);
  const beforePrompt = card.prompt;
  const beforeAnswer = card.modelAnswer;

  // Apply updates
  if (updates.prompt !== undefined) card.prompt = updates.prompt;
  if (updates.modelAnswer !== undefined) card.modelAnswer = updates.modelAnswer;
  if (updates.topic !== undefined) card.topic = updates.topic;
  if (updates.priority !== undefined) card.priority = updates.priority;
  if (updates.scenario !== undefined) card.scenario = updates.scenario || undefined;
  if (updates.task !== undefined) card.task = updates.task || undefined;
  if (updates.conceptA !== undefined) card.conceptA = updates.conceptA || undefined;
  if (updates.conceptB !== undefined) card.conceptB = updates.conceptB || undefined;
  if (updates.timeLimitMins !== undefined) {
    if (updates.timeLimitMins && [5, 10, 15, 30].includes(updates.timeLimitMins)) {
      card.timeLimitMins = updates.timeLimitMins;
    } else {
      delete card.timeLimitMins;
    }
  }
  if (updates.archived !== undefined) card.archived = updates.archived;
  if (updates.subDeck !== undefined) card.subDeck = updates.subDeck;

  // Clear visual if prompt or answer changed
  if (beforePrompt !== card.prompt || beforeAnswer !== card.modelAnswer) {
    delete card.visual;
  }

  appState.value.items[itemId] = card;
  persistState();

  const afterTiers = detectSupportedTiers(card);
  const unlockMsg = getTierUnlockMessage(beforeTiers, afterTiers);
  toast(unlockMsg || 'Card updated');

  return card;
}

export function deleteCard(itemId: string): boolean {
  if (!appState.value.items[itemId]) return false;
  delete appState.value.items[itemId];
  reconcileStats();
  persistState();
  toast('Card deleted');
  return true;
}

export function archiveCard(itemId: string): void {
  const card = appState.value.items[itemId];
  if (card) {
    card.archived = true;
    appState.value.items[itemId] = card;
    persistState();
    toast('Card archived');
  }
}

export function unarchiveCard(itemId: string): void {
  const card = appState.value.items[itemId];
  if (card) {
    card.archived = false;
    appState.value.items[itemId] = card;
    persistState();
    toast('Card restored');
  }
}

export function getCard(itemId: string): StudyItem | null {
  return appState.value.items[itemId] || null;
}

export function reconcileStats(): void {
  const items = appState.value.items;
  let totalReviews = 0;
  const byTier: Record<Tier, number> = {
    quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0
  };

  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
    if (!it || it.archived) continue;
    if (isItemInArchivedSubDeck(it)) continue;

    const reps = (it.fsrs && it.fsrs.reps) ? it.fsrs.reps : 0;
    totalReviews += reps;

    let t = it.lastTier;
    if (!t) {
      const hasMockField = it.timeLimitMins && it.timeLimitMins > 0;
      const hasDistinguish = it.conceptA && it.conceptB;
      const hasApply = it.task || it.scenario;
      const paraCount2 = (it.modelAnswer || '').split('\n\n').filter((s: string) => String(s).trim()).length;
      if (hasMockField) {
        t = 'mock';
      } else if (hasDistinguish) {
        t = 'distinguish';
      } else if (hasApply) {
        t = 'apply';
      } else if (paraCount2 >= 2) {
        t = 'worked';
      } else {
        t = 'quickfire';
      }
    }
    const tier = t as Tier;
    if (byTier[tier] !== undefined) byTier[tier] += reps;
  }

  appState.value.stats.totalReviews = totalReviews;
  appState.value.stats.reviewsByTier = byTier;
}

export interface ImportEntry {
  idx: number;
  obj: Partial<StudyItem>;
  course: string;
  topic: string;
  promptPreview: string;
  tiers: Tier[];
  isDuplicate: boolean;
}

export interface ImportPreview {
  valid: ImportEntry[];
  skipped: Array<{ idx: number; reason: string; obj: unknown }>;
  duplicates: ImportEntry[];
  skipDuplicates: boolean;
}

export function parseImportData(raw: string, importFormat: string, modalCourse: string): ImportPreview {
  const valid: ImportEntry[] = [];
  const skipped: Array<{ idx: number; reason: string; obj: unknown }> = [];
  const duplicates: ImportEntry[] = [];

  // Build prompt index for duplicate detection
  const existingPrompts: Record<string, boolean> = {};
  const items = appState.value.items;
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const existing = items[id];
    if (!existing || existing.archived) continue;
    const course = existing.course || '';
    const key = course + ':::' + (existing.prompt || '').trim().toLowerCase();
    existingPrompts[key] = true;
  }

  // Also track duplicates within the batch itself
  const batchPrompts: Record<string, boolean> = {};

  let arr: unknown[] = [];

  if (importFormat === 'json') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        arr = parsed;
      } else if (parsed && typeof parsed === 'object' && '_export' in parsed) {
        // Full backup restore - handled separately
        return { valid: [], skipped: [], duplicates: [], skipDuplicates: false };
      }
    } catch (e) {
      toast('Invalid JSON');
      return { valid: [], skipped: [], duplicates: [], skipDuplicates: false };
    }
  } else if (importFormat === 'qa') {
    arr = parseQaImport(raw);
  }

  for (let idx = 0; idx < arr.length; idx++) {
    const obj = arr[idx];
    if (!obj || typeof obj !== 'object') {
      skipped.push({ idx, reason: 'Not an object', obj });
      continue;
    }
    const item = obj as Record<string, unknown>;

    if (!item.prompt || !String(item.prompt).trim()) {
      skipped.push({ idx, reason: 'Missing prompt', obj });
      continue;
    }

    const modelAnswer = (item.modelAnswer || item.model_answer || item.answer) as string;
    if (!modelAnswer) {
      skipped.push({ idx, reason: 'Missing modelAnswer', obj });
      continue;
    }

    // Normalize modelAnswer aliases
    if (!item.modelAnswer && item.model_answer) item.modelAnswer = item.model_answer;
    if (!item.modelAnswer && item.answer) item.modelAnswer = item.answer;

    const itemCourse = modalCourse || (item.course as string) || 'Uncategorised';
    const promptKey = itemCourse + ':::' + String(item.prompt).trim().toLowerCase();

    const isDuplicate = !!(existingPrompts[promptKey] || batchPrompts[promptKey]);
    batchPrompts[promptKey] = true;

    // Detect supported tiers
    const tempItem: Partial<StudyItem> = {
      prompt: item.prompt as string,
      modelAnswer: modelAnswer,
      task: (item.task || '') as string,
      scenario: (item.scenario || '') as string,
      conceptA: (item.conceptA || '') as string,
      conceptB: (item.conceptB || '') as string
    };
    const tiers = detectSupportedTiers(tempItem);

    const entry: ImportEntry = {
      idx,
      obj: item as Partial<StudyItem>,
      course: itemCourse,
      topic: ((item.topic as string) || '').trim(),
      promptPreview: String(item.prompt).trim().substring(0, 120),
      tiers,
      isDuplicate
    };

    if (isDuplicate) {
      duplicates.push(entry);
    }
    valid.push(entry);
  }

  return {
    valid,
    skipped,
    duplicates,
    skipDuplicates: false
  };
}

function parseQaImport(raw: string): Array<Record<string, string>> {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const cards: Array<Record<string, string>> = [];
  let card: Record<string, string> | null = null;
  let currentField = '';

  function ensureCard() {
    if (!card) card = { prompt: '', modelAnswer: '', topic: '' };
  }

  function commitCard() {
    if (!card) return;
    const prompt = String(card.prompt || '').trim();
    const answer = String(card.modelAnswer || '').trim();
    if (prompt || answer) {
      if (prompt && answer) {
        cards.push({
          prompt,
          modelAnswer: answer,
          topic: card.topic || 'General'
        });
      }
    }
    card = null;
    currentField = '';
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      commitCard();
      continue;
    }
    if (/^Q:\s*/i.test(trimmed)) {
      if (card && String(card.prompt || '').trim() && String(card.modelAnswer || '').trim()) {
        commitCard();
      }
      ensureCard();
      card = { prompt: '', modelAnswer: '', topic: '' };
      card.prompt = trimmed.replace(/^Q:\s*/i, '').trim();
      currentField = 'prompt';
      continue;
    }
    if (/^A:\s*/i.test(trimmed)) {
      ensureCard();
      card!.modelAnswer = trimmed.replace(/^A:\s*/i, '').trim();
      currentField = 'modelAnswer';
      continue;
    }
    if (/^T:\s*/i.test(trimmed)) {
      ensureCard();
      card!.topic = trimmed.replace(/^T:\s*/i, '').trim();
      currentField = 'topic';
      continue;
    }
    if (!currentField) continue;
    ensureCard();
    const spacer = card![currentField] ? '\n' : '';
    card![currentField] = String(card![currentField] || '') + spacer + trimmed;
  }

  commitCard();
  return cards;
}

export function applyImport(preview: ImportPreview, _importFormat: string): number {
  let count = 0;
  const entries = preview.skipDuplicates
    ? preview.valid.filter((e) => !e.isDuplicate)
    : preview.valid;

  entries.forEach((entry) => {
    const obj = entry.obj;
    const card: Partial<StudyItem> = {
      prompt: obj.prompt,
      modelAnswer: (obj.modelAnswer || (obj as Record<string, string>).model_answer || (obj as Record<string, string>).answer) as string,
      course: entry.course,
      topic: entry.topic || 'General',
      priority: (obj.priority as Priority) || 'medium'
    };
    if (obj.subDeck) card.subDeck = obj.subDeck as string;
    if (obj.scenario) card.scenario = obj.scenario as string;
    if (obj.task) card.task = obj.task as string;
    if (obj.conceptA) card.conceptA = obj.conceptA as string;
    if (obj.conceptB) card.conceptB = obj.conceptB as string;
    if (obj.timeLimitMins) card.timeLimitMins = obj.timeLimitMins as number;

    const created = createCard(card);
    if (created) count++;
  });

  return count;
}

// Full backup restore
export function restoreFromBackup(data: {
  items?: Record<string, StudyItem>;
  courses?: Record<string, unknown>;
  subDecks?: Record<string, unknown>;
  calibration?: unknown;
  stats?: unknown;
  settings?: Record<string, unknown>;
}): number {
  if (!data.items || typeof data.items !== 'object') return 0;

  const itemCount = Object.keys(data.items).length;

  // Merge items (newer wins)
  for (const id in data.items) {
    if (Object.prototype.hasOwnProperty.call(data.items, id)) {
      appState.value.items[id] = data.items[id];
    }
  }

  // Merge courses
  if (data.courses) {
    for (const cName in data.courses) {
      if (Object.prototype.hasOwnProperty.call(data.courses, cName)) {
        appState.value.courses[cName] = data.courses[cName] as never;
      }
    }
  }

  // Merge subDecks
  if (data.subDecks) {
    for (const sdCourse in data.subDecks) {
      if (Object.prototype.hasOwnProperty.call(data.subDecks, sdCourse)) {
        appState.value.subDecks[sdCourse] = data.subDecks[sdCourse] as never;
      }
    }
  }

  // Merge calibration if newer
  if (data.calibration) {
    const existingHistory = (appState.value.calibration?.history || []).length;
    const newHistory = ((data.calibration as { history?: unknown[] })?.history || []).length;
    if (newHistory > existingHistory) {
      appState.value.calibration = data.calibration as never;
    }
  }

  // Merge stats if newer
  if (data.stats && ((data.stats as { totalReviews?: number }).totalReviews || 0) > appState.value.stats.totalReviews) {
    appState.value.stats = data.stats as never;
  }

  reconcileStats();
  persistState();

  return itemCount;
}
