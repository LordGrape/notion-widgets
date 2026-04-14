/*
 * Tiers TypeScript Module
 * Phase 3 conversion: types only, ZERO logic changes
 */

import { el, visualGenerationPending, esc, renderMd, generateVisual, fmtMMSS, toast } from './utils';
import { items, settings, saveState } from './signals';
import type { StudyItem, SessionState } from './types';

// External CDN globals (keep as declare)
declare function wireGenerative(tier: string): void;
declare function wireMock(): void;
declare function startApplyTimer(): void;
declare function startMockTimer(): void;
declare function startEssayOutlineTimer(mins: number): void;
declare function transitionToWritingPhase(item: StudyItem, writingMins: number, wordTarget: { min: number; max: number; label: string }, examType: string): void;
declare function isEssayMode(item: StudyItem): boolean;
declare function getCourseExamType(course?: string): string;
declare function getEssayWordTarget(mins: number): { min: number; max: number; label: string };
declare function getEssayStructureHint(examType: string): string;
declare function autoGrowTextarea(ta: HTMLTextAreaElement): void;
declare function updateEssayWordCount(text: string, wordTarget?: { min: number; max: number }): void;
declare function rubricTemplate(tier: string): string;
declare function revealAnswer(): void;
declare function playClick(): void;

// Lazy getters for DOM globals
function getTierArea(): HTMLElement {
  return document.getElementById('tierArea')!;
}
function getMockTotalMs(): number {
  return (window as unknown as { mockTotalMs?: number }).mockTotalMs || 0;
}
function getMockEndsAt(): number {
  return (window as unknown as { mockEndsAt?: number }).mockEndsAt || 0;
}

// Module-level mutable state
let essayPhase: 'outline' | 'writing' | null = null;
let essayOutlineText = '';
let essayOutlineEndsAt = 0;

/**
 * Render Quickfire tier UI
 */
function renderQuickfireTier(it: StudyItem, session: SessionState): void {
  const tierArea = getTierArea();
  tierArea.innerHTML =
    '<div id="confidencePrompt" class="confidence-prompt-label">How confident are you?</div>' +
    '<div class="confidence-row">' +
      '<button class="conf-pill" data-conf="low">LOW</button>' +
      '<button class="conf-pill" data-conf="medium">MEDIUM</button>' +
      '<button class="conf-pill" data-conf="high">HIGH</button>' +
    '</div>' +
    '<button id="revealBtn" class="big-btn conf-then-reveal">Reveal</button>';

  tierArea.querySelectorAll('.conf-pill').forEach((pill) => {
    pill.addEventListener('click', function(this: HTMLElement) {
      tierArea.querySelectorAll('.conf-pill').forEach((p) => {
        p.classList.remove('selected');
        (p as HTMLElement).style.opacity = '';
        (p as HTMLElement).style.transform = '';
      });
      this.classList.add('selected');
      session.confidence = this.getAttribute('data-conf') as 'low' | 'medium' | 'high';

      tierArea.querySelectorAll('.conf-pill:not(.selected)').forEach((p) => {
        if ((window as unknown as { gsap?: typeof gsap }).gsap) {
          (window as unknown as { gsap: typeof gsap }).gsap.to(p, { opacity: 0.5, scale: 0.97, duration: 0.2, ease: 'power2.out' });
        } else {
          (p as HTMLElement).style.opacity = '0.5';
        }
      });

      const revBtn = el('revealBtn');
      if (revBtn) revBtn.classList.add('ready');

      try { playClick(); } catch(e) {}
      if ((window as unknown as { gsap?: typeof gsap }).gsap) {
        (window as unknown as { gsap: typeof gsap }).gsap.fromTo(this, { scale: 0.92 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' });
      }
    });
  });

  const revealBtn = el('revealBtn');
  if (revealBtn) {
    revealBtn.addEventListener('click', () => {
      if (!session.confidence) {
        toast('Pick a confidence level first');
        return;
      }
      revealAnswer();
    });
  }

  if (!it.visual && it.prompt && it.modelAnswer && typeof generateVisual === 'function' && typeof visualGenerationPending !== 'undefined' && !visualGenerationPending[it.id]) {
    visualGenerationPending[it.id] = true;
    generateVisual(it).then((v) => {
      visualGenerationPending[it.id] = false;
      if (v) {
        it.visual = v;
        items.value = { ...items.value, [it.id]: it };
        saveState();
      }
    }).catch(() => { visualGenerationPending[it.id] = false; });
  }
}

/**
 * Render Explain tier UI
 */
function renderExplainTier(it: StudyItem, session: SessionState): void {
  getTierArea().innerHTML = '' +
    '<div class="two-col single">' +
      '<div class="panel">' +
        '<div class="p-h">Your response</div>' +
        '<textarea id="userText" rows="3" placeholder="Write your explanation. Focus on key mechanisms, not wording."></textarea>' +
        '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
        '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
          '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  wireGenerative('explain');
}

/**
 * Check if task text is near-duplicate of scenario text
 */
function isNearDuplicateInstruction(longText: string, shortText: string): boolean {
  const longNorm = String(longText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const shortNorm = String(shortText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const longStrip = longNorm.replace(/\s+/g, '');
  const shortStrip = shortNorm.replace(/\s+/g, '');
  if (!shortStrip) return true;

  // Exact or substring match (stripped)
  if (
    longStrip === shortStrip ||
    longStrip.indexOf(shortStrip) >= 0 ||
    shortStrip.indexOf(longStrip) >= 0
  ) return true;

  // Length delta < 15%
  const maxLen = Math.max(longStrip.length, shortStrip.length, 1);
  if ((Math.abs(longStrip.length - shortStrip.length) / maxLen) < 0.15) return true;

  // Token overlap: if 70%+ of short words appear in long, it adds nothing new
  const longWords = longNorm.split(/\s+/).filter((w) => w.length > 2);
  const shortWords = shortNorm.split(/\s+/).filter((w) => w.length > 2);
  if (!shortWords.length) return true;
  const set: Record<string, boolean> = {};
  longWords.forEach((w) => { set[w] = true; });
  let overlap = 0;
  shortWords.forEach((w) => { if (set[w]) overlap++; });
  return (overlap / shortWords.length) >= 0.7;
}

/**
 * Render Apply tier UI
 */
function renderApplyTier(it: StudyItem, session: SessionState): void {
  const tierArea = getTierArea();
  // Prompt is scenario; modelAnswer includes ideal response. Task is embedded at top of modelAnswer if provided.
  const scen = it.prompt || '';
  const task = (it.task || '');

  // Skip Task block if it's essentially the same as the scenario (normalise and compare)
  const taskIsDuplicate = !task || isNearDuplicateInstruction(scen, task);
  tierArea.innerHTML = '' +
    '<div class="scenario scenario-block md-content" id="scenarioBlock">' + renderMd(scen) + '</div>' +
    (task && !taskIsDuplicate ? '<div class="divider"></div><div class="task-block"><div class="task-label">Task</div><div class="md-content">' + renderMd(task) + '</div></div>' : '') +
    '<div class="divider"></div>' +
    '<div class="panel">' +
      '<div class="p-h">Your response</div>' +
      '<textarea id="userText" rows="4" placeholder="Apply the concept. Use structured reasoning and conclude clearly."></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
      '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
        '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
      '</div>' +
    '</div>';
  if (settings.value.showApplyTimer) startApplyTimer();
  wireGenerative('apply');
}

/**
 * Render Distinguish tier UI
 */
function renderDistinguishTier(it: StudyItem, session: SessionState): void {
  // Skip scenario block if it's essentially the same as the prompt (already shown above)
  const distScen = it.scenario || it.prompt || '';
  const distScenIsDuplicate = !distScen || isNearDuplicateInstruction(it.prompt || '', distScen);
  getTierArea().innerHTML = '' +
    '<div class="concepts concept-pair">' +
      '<div class="concept concept-box"><div class="c-h concept-label">Concept A</div><div class="c-v md-content">' + renderMd(it.conceptA || '—') + '</div></div>' +
      '<div class="concept concept-box"><div class="c-h concept-label">Concept B</div><div class="c-v md-content">' + renderMd(it.conceptB || '—') + '</div></div>' +
    '</div>' +
    '<div class="prompt distinguish-prompt" style="font-weight:700; margin-bottom:8px">Given the following scenario, which applies? Justify your choice.</div>' +
    (!distScenIsDuplicate ? '<div class="scenario md-content">' + renderMd(distScen) + '</div>' : '') +
    '<div class="divider"></div>' +
    '<div class="panel">' +
      '<div class="p-h">Your response</div>' +
      '<textarea id="userText" rows="4" placeholder="State which applies, then justify with discriminating features."></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
      '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
        '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
      '</div>' +
    '</div>';
  wireGenerative('distinguish');
}

/**
 * Render Mock tier UI
 */
function renderMockTier(it: StudyItem, session: SessionState): void {
  let mins = parseInt(String(it.timeLimitMins || settings.value.mockDefaultMins || 10), 10);
  mins = [5,10,15,30].indexOf(mins) >= 0 ? mins : 10;
  (window as unknown as { mockTotalMs: number }).mockTotalMs = mins * 60 * 1000;
  (window as unknown as { mockEndsAt: number }).mockEndsAt = Date.now() + (window as unknown as { mockTotalMs: number }).mockTotalMs;
  el('timerBar')?.classList.add('show');

  if (isEssayMode(it)) {
    const examType = (it.examType ? String(it.examType).toLowerCase() : getCourseExamType(it.course));
    const outlineMins = Math.max(1, Math.round(mins * 0.2));
    const writingMins = mins - outlineMins;
    const wordTarget = getEssayWordTarget(mins);
    essayPhase = 'outline';
    essayOutlineText = '';
    essayOutlineEndsAt = Date.now() + (outlineMins * 60 * 1000);

    getTierArea().innerHTML = '' +
      '<div class="panel">' +
        '<div class="p-h">Response (timed)</div>' +
        '<div class="essay-outline-phase">' +
          '<div class="essay-phase-label essay-phase-header">' +
            '<span class="epl-title phase-label">Phase 1: Outline</span>' +
            '<span class="epl-timer phase-timer" id="essayPhaseTimer">' + fmtMMSS(outlineMins * 60) + '</span>' +
          '</div>' +
          '<div class="essay-structure-hint">' + getEssayStructureHint(examType) + '</div>' +
          '<textarea id="userText" rows="7" placeholder="Outline your argument:\n- Thesis: ...\n- Body 1: [topic] + [evidence]\n- Body 2: [topic] + [evidence]\n- Body 3: [topic] + [evidence]\n- Conclusion: ..."></textarea>' +
          '<div class="essay-word-count essay-word-meta">' +
            '<span class="ewc-current" id="essayWordCount">0 words</span>' +
            '<span class="ewc-target">Target: ' + esc(wordTarget.label) + ' (' + wordTarget.min + '-' + wordTarget.max + ' words)</span>' +
          '</div>' +
        '</div>' +
        '<button class="qa-btn" id="essayNextPhase">Start Writing -></button>' +
        '<button class="qa-btn" id="submitBtn" style="display:none">Submit (Space)</button>' +
        '<div class="help">Outline: ' + outlineMins + ' min. Writing: ' + writingMins + ' min. Total: ' + mins + ' min.</div>' +
      '</div>' +
      rubricTemplate('mock');

    const outlineTA = el('userText') as HTMLTextAreaElement;
    outlineTA.addEventListener('input', () => {
      autoGrowTextarea(outlineTA);
      updateEssayWordCount(outlineTA.value);
    });
    autoGrowTextarea(outlineTA);
    startEssayOutlineTimer(outlineMins);
    el('essayNextPhase')?.addEventListener('click', () => {
      transitionToWritingPhase(it, writingMins, wordTarget, examType);
    });
    startMockTimer();
  } else {
    essayPhase = null;
    getTierArea().innerHTML = '' +
      '<div class="panel">' +
        '<div class="p-h">Response (timed)</div>' +
        '<textarea id="userText" rows="10" placeholder="Write your full answer. Aim for structure and clear conclusions."></textarea>' +
        '<div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">' +
        '<button class="qa-btn" id="submitBtn" style="flex:1;min-width:0">Submit (Space)</button>' +
          '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
        '</div>' +
        '<div class="help">Timer starts immediately. Submit early if you finish.</div>' +
      '</div>' +
      rubricTemplate('mock');
    startMockTimer();
    wireMock();
  }
}

/**
 * Render Worked tier UI
 */
function renderWorkedTier(it: StudyItem, session: SessionState): void {
  const scaffoldW = it.workedScaffold || it.modelAnswer || '';
  const sectionsW = scaffoldW.split('\n\n');
  const blankIdxW = Math.min(1, Math.max(0, sectionsW.length - 1));
  const visibleBeforeW = sectionsW.slice(0, blankIdxW).join('\n\n');
  const visibleAfterW = sectionsW.slice(blankIdxW + 1).join('\n\n');
  getTierArea().innerHTML = '' +
    '<div class="worked-label">Worked Example — Complete the Missing Section</div>' +
    (visibleBeforeW ? '<div class="answer worked-step"><div class="md-content">' + renderMd(visibleBeforeW) + '</div></div>' : '') +
    '<div class="worked-blank">' +
    '<div class="worked-label">Your Turn — Fill In This Section</div></div>' +
    '<div class="panel">' +
      '<div class="p-h">Your response</div>' +
      '<textarea id="userText" rows="4" placeholder="Complete the missing analysis (e.g. the blank IRAC step)..."></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:6px">' +
      '<button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>' +
      '<button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don\u2019t know</button>' +
      '</div></div>' +
    (visibleAfterW ? '<div class="answer worked-step" style="margin-top:8px;"><div class="md-content">' + renderMd(visibleAfterW) + '</div></div>' : '');
  wireGenerative('worked');
}

// Attach to window for .js consumers
if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>;
  win.renderQuickfireTier = renderQuickfireTier;
  win.renderExplainTier = renderExplainTier;
  win.renderApplyTier = renderApplyTier;
  win.renderDistinguishTier = renderDistinguishTier;
  win.renderMockTier = renderMockTier;
  win.renderWorkedTier = renderWorkedTier;
  win.isNearDuplicateInstruction = isNearDuplicateInstruction;
}
