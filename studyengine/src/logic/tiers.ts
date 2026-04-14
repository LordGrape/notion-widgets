// Tier logic - ported from studyengine/js/tiers.js

import type { StudyItem, Tier } from '../types';

export function detectSupportedTiers(item: StudyItem): Tier[] {
  if (!item || !item.prompt || !item.modelAnswer) return [];
  const tiers: Tier[] = ['quickfire', 'explain'];
  if (item.task || item.scenario) tiers.push('apply');
  if (item.conceptA && item.conceptB) tiers.push('distinguish');
  // Mock: any item can be presented under time pressure
  tiers.push('mock');
  const paraCount = (item.modelAnswer || '').split('\n\n').filter((s: string) => String(s).trim()).length;
  if (paraCount >= 2) tiers.push('worked');
  return tiers;
}

export function getTierUnlockMessage(beforeTiers: Tier[], afterTiers: Tier[]): string {
  const unlocked: string[] = [];
  afterTiers.forEach((tier) => {
    if (!beforeTiers.includes(tier)) {
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

export function tierLabel(tier: string): string {
  const labels: Record<string, string> = {
    quickfire: 'QF',
    explain: 'EI',
    apply: 'AI',
    distinguish: 'DI',
    mock: 'ME',
    worked: 'WE'
  };
  return labels[tier] || '—';
}

export function tierFullName(tier: string): string {
  const names: Record<string, string> = {
    quickfire: 'Quick Fire',
    explain: 'Explain',
    apply: 'Apply',
    distinguish: 'Distinguish',
    mock: 'Mock Exam',
    worked: 'Worked Example'
  };
  return names[tier] || tier;
}

export function tierColour(tier: string): string {
  if (typeof document === 'undefined') return '#8b5cf6';
  const root = document.documentElement;
  const colors: Record<string, string> = {
    quickfire: getComputedStyle(root).getPropertyValue('--tier-qf').trim(),
    explain: getComputedStyle(root).getPropertyValue('--tier-ex').trim(),
    apply: getComputedStyle(root).getPropertyValue('--tier-ap').trim(),
    distinguish: getComputedStyle(root).getPropertyValue('--tier-di').trim(),
    mock: getComputedStyle(root).getPropertyValue('--tier-mk').trim(),
    worked: getComputedStyle(root).getPropertyValue('--tier-we').trim()
  };
  return colors[tier] || getComputedStyle(root).getPropertyValue('--accent').trim() || '#8b5cf6';
}

// Tier renderers for session UI
export function renderQuickfireTierHTML(): string {
  return `
    <div id="confidencePrompt" class="confidence-prompt-label">How confident are you?</div>
    <div class="confidence-row">
      <button class="conf-pill" data-conf="low">LOW</button>
      <button class="conf-pill" data-conf="medium">MEDIUM</button>
      <button class="conf-pill" data-conf="high">HIGH</button>
    </div>
    <button id="revealBtn" class="big-btn conf-then-reveal">Reveal</button>
  `;
}

export function renderExplainTierHTML(): string {
  return `
    <div class="two-col single">
      <div class="panel">
        <div class="p-h">Your response</div>
        <textarea id="userText" rows="3" placeholder="Write your explanation. Focus on key mechanisms, not wording."></textarea>
        <div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">
          <button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>
          <button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don't know</button>
        </div>
      </div>
    </div>
  `;
}

export function renderApplyTierHTML(item: StudyItem): string {
  const scen = item.prompt || '';
  const task = item.task || '';
  
  // Check if task is a near-duplicate of the scenario
  function isNearDuplicate(longText: string, shortText: string): boolean {
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

    if (
      longStrip === shortStrip ||
      longStrip.indexOf(shortStrip) >= 0 ||
      shortStrip.indexOf(longStrip) >= 0
    ) return true;

    const maxLen = Math.max(longStrip.length, shortStrip.length, 1);
    if ((Math.abs(longStrip.length - shortStrip.length) / maxLen) < 0.15) return true;

    const longWords = longNorm.split(/\s+/).filter((w: string) => w.length > 2);
    const shortWords = shortNorm.split(/\s+/).filter((w: string) => w.length > 2);
    if (!shortWords.length) return true;
    const set: Record<string, boolean> = {};
    longWords.forEach((w: string) => { set[w] = true; });
    let overlap = 0;
    shortWords.forEach((w: string) => { if (set[w]) overlap++; });

    return (overlap / shortWords.length) >= 0.7;
  }

  const showTaskExplicitly = task && !isNearDuplicate(scen, task);

  return `
    <div class="two-col single">
      <div class="panel">
        <div class="p-h">${esc(scen)}</div>
        ${showTaskExplicitly ? `<div class="task-inset">${esc(task)}</div>` : ''}
        <textarea id="userText" rows="4" placeholder="Apply the concept to this scenario..."></textarea>
        <div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">
          <button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>
          <button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don't know</button>
        </div>
      </div>
    </div>
  `;
}

export function renderDistinguishTierHTML(item: StudyItem): string {
  return `
    <div class="two-col single">
      <div class="panel">
        <div class="p-h">Distinguish</div>
        <div class="concepts-row">
          <div class="concept-pill">${esc(item.conceptA || '')}</div>
          <div class="concept-vs">vs</div>
          <div class="concept-pill">${esc(item.conceptB || '')}</div>
        </div>
        <textarea id="userText" rows="4" placeholder="Explain the key difference between these concepts..."></textarea>
        <div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">
          <button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Check (Space)</button>
          <button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don't know</button>
        </div>
      </div>
    </div>
  `;
}

export function renderMockTierHTML(item: StudyItem): string {
  const timeLimit = item.timeLimitMins || 10;
  return `
    <div class="two-col single">
      <div class="panel">
        <div class="p-h">Mock Exam (${timeLimit} min)</div>
        <div class="timer-bar" id="mockTimerBar">
          <div class="timer-fill" id="mockTimerFill"></div>
          <span class="timer-text" id="mockTimerText">${timeLimit}:00</span>
        </div>
        <textarea id="userText" rows="5" placeholder="Write your full response. This is timed like a real exam."></textarea>
        <div style="display:flex;gap:10px;margin-top:6px;align-items:stretch">
          <button class="qa-btn" id="checkBtn" style="flex:1;min-width:0">Submit (Space)</button>
          <button type="button" class="ghost-btn" id="dontKnowBtn" style="flex:0 0 auto;padding:10px 12px;font-size:10px;white-space:nowrap">🤷 Don't know</button>
        </div>
      </div>
    </div>
  `;
}

export function renderWorkedTierHTML(): string {
  return `
    <div class="two-col single">
      <div class="panel">
        <div class="p-h">Worked Example — Follow along</div>
        <div class="worked-instructions">
          Read the model answer carefully. Try to understand each step before revealing.
        </div>
        <button class="qa-btn" id="checkBtn">Reveal Answer (Space)</button>
        <button type="button" class="ghost-btn" id="dontKnowBtn">🤷 Don't know</button>
      </div>
    </div>
  `;
}

function esc(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
