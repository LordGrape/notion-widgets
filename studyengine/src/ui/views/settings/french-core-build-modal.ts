/**
 * UI layer (L4): French Core 2000 worker-build progress modals.
 * Split from src/settings.ts in Phase V2b-ii (2026-08-18). Bodies verbatim;
 * the openSettings-local `curatedStatus` element is now threaded as an
 * explicit parameter, and the importDeckText calls pass it through.
 * LAYER DEBT: these functions fuse DOM modal rendering with direct worker
 * fetch calls. Untangling them into infrastructure/worker-client/ plus a
 * pure view is a later-phase refactor, not a V2 verbatim move.
 */
import type { CuratedDeckEntry, WorkerBuildStatus, WorkerDeckPayload, WorkerGlossResponse } from '../../../application/settings/types';
import { withTimeout } from '../../../shared/with-timeout';
import { importDeckText } from './import-deck-text';

const WORKER_BASE = 'https://widget-sync.lordgrape-widgets.workers.dev';
// POST-L1b-α-2: hardcoded worker auth header — single-user widget, value is already pseudo-public in the deployed bundle.
const WIDGET_KEY = 'G7$mXv!pL3@kR9wNz#Qe2YdF8bJhT6cA';

export async function runWorkerOrchestratorDynamic(deck: Extract<CuratedDeckEntry, { source: 'worker' }>, curatedStatus: HTMLElement | null): Promise<void> {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = '<style>'
    + '.fc-build-modal{width:min(760px,100%);background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);padding:16px;display:grid;gap:14px;overflow:hidden;}'
    + '.fc-build-head{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;}'
    + '.fc-build-mark{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:rgba(var(--accent-rgb),0.14);border:1px solid rgba(var(--accent-rgb),0.22);color:var(--accent-primary);font-weight:900;font-size:13px;letter-spacing:.5px;}'
    + '.fc-build-title{margin:0;color:var(--text);font-size:18px;line-height:1.2;}'
    + '.fc-build-phase{margin-top:4px;color:var(--text-secondary);font-size:12px;line-height:1.35;}'
    + '.fc-build-ring{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--accent-primary) 0deg, rgba(var(--accent-rgb),0.12) 0deg);position:relative;}'
    + '.fc-build-ring::after{content:"";position:absolute;inset:7px;border-radius:50%;background:var(--card-bg);border:1px solid rgba(var(--accent-rgb),0.12);}'
    + '.fc-build-pct{position:relative;z-index:1;color:var(--text);font-weight:900;font-size:15px;}'
    + '.fc-build-track{height:10px;border-radius:999px;background:rgba(var(--accent-rgb),0.1);border:1px solid rgba(var(--accent-rgb),0.1);overflow:hidden;}'
    + '.fc-build-bar{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,var(--accent-primary),var(--accent-tertiary));position:relative;}'
    + '.fc-build-bar::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:fcBuildShimmer 1.4s linear infinite;}'
    + '.fc-build-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}'
    + '.fc-build-metric{border:1px solid rgba(var(--accent-rgb),0.12);border-radius:8px;padding:9px 10px;background:rgba(var(--accent-rgb),0.05);min-width:0;}'
    + '.fc-build-metric span{display:block;color:var(--text-tertiary);font-size:9px;text-transform:uppercase;font-weight:800;letter-spacing:.8px;line-height:1.2;}'
    + '.fc-build-metric strong{display:block;color:var(--text);font-size:15px;line-height:1.35;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.fc-build-stages{display:grid;gap:8px;}'
    + '.fc-stage{display:grid;grid-template-columns:22px 1fr auto;gap:9px;align-items:center;padding:9px 10px;border-radius:8px;border:1px solid rgba(var(--accent-rgb),0.1);background:rgba(var(--accent-rgb),0.04);}'
    + '.fc-stage-dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(var(--accent-rgb),0.18);color:var(--text-secondary);font-size:10px;font-weight:900;}'
    + '.fc-stage-label{color:var(--text);font-size:12px;font-weight:800;line-height:1.25;}'
    + '.fc-stage-state{color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:900;}'
    + '.fc-stage.is-done .fc-stage-dot{background:rgba(var(--accent-rgb),0.18);color:var(--accent-primary);}'
    + '.fc-stage.is-active{border-color:rgba(var(--accent-rgb),0.28);background:rgba(var(--accent-rgb),0.08);}'
    + '.fc-stage.is-active .fc-stage-dot{animation:fcBuildPulse 1.4s ease-in-out infinite;color:var(--accent-primary);}'
    + '.fc-build-warn{display:none;padding:10px;border:1px dashed rgba(var(--accent-rgb),0.4);border-radius:8px;color:var(--text-secondary);font-size:12px;line-height:1.45;background:rgba(var(--accent-rgb),0.06);}'
    + '.fc-build-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}'
    + '@keyframes fcBuildShimmer{from{transform:translateX(-100%);}to{transform:translateX(100%);}}'
    + '@keyframes fcBuildPulse{0%,100%{box-shadow:0 0 0 0 rgba(var(--accent-rgb),0.28);}50%{box-shadow:0 0 0 6px rgba(var(--accent-rgb),0);}}'
    + '@media(max-width:520px){.fc-build-head{grid-template-columns:auto 1fr;}.fc-build-ring{grid-column:1 / -1;justify-self:center;}.fc-build-metrics{grid-template-columns:1fr;}}'
    + '</style>'
    + '<div class="fc-build-modal" role="dialog" aria-modal="true" aria-label="French Core 2000 build">'
    + '<div class="fc-build-head"><div class="fc-build-mark">FR</div><div><h3 class="fc-build-title">French Core 2000 build</h3><div id="hotfixProgress" class="fc-build-phase">Connecting to the build worker...</div></div><div id="hotfixRing" class="fc-build-ring"><div id="hotfixPct" class="fc-build-pct">0%</div></div></div>'
    + '<div class="fc-build-track"><div id="hotfixBar" class="fc-build-bar"></div></div>'
    + '<div class="fc-build-metrics"><div class="fc-build-metric"><span>Glosses</span><strong id="hotfixGlossMetric">0/0</strong></div><div class="fc-build-metric"><span>Tokens</span><strong id="hotfixTokenMetric">0</strong></div><div class="fc-build-metric"><span>Stage</span><strong id="hotfixStageMetric">Starting</strong></div></div>'
    + '<div id="hotfixStages" class="fc-build-stages"></div>'
    + '<div id="hotfixWarn" class="fc-build-warn">Build has used 50% of the token budget. <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;"><button id="hotfixContinue" class="ghost-btn" type="button">Continue</button><button id="hotfixStop" class="ghost-btn" type="button">Stop</button></div></div>'
    + '<div class="fc-build-actions"><button id="hotfixRetry" class="ghost-btn" type="button" style="display:none">Retry</button><button id="hotfixClose" class="ghost-btn" type="button">Close</button></div></div>';
  document.body.appendChild(overlay);
  const cardEl = overlay.querySelector('.fc-build-modal') as HTMLElement;
  const progressEl = overlay.querySelector('#hotfixProgress') as HTMLElement;
  const pctEl = overlay.querySelector('#hotfixPct') as HTMLElement;
  const ringEl = overlay.querySelector('#hotfixRing') as HTMLElement;
  const barEl = overlay.querySelector('#hotfixBar') as HTMLElement;
  const glossMetricEl = overlay.querySelector('#hotfixGlossMetric') as HTMLElement;
  const tokenMetricEl = overlay.querySelector('#hotfixTokenMetric') as HTMLElement;
  const stageMetricEl = overlay.querySelector('#hotfixStageMetric') as HTMLElement;
  const stagesEl = overlay.querySelector('#hotfixStages') as HTMLElement;
  const warnEl = overlay.querySelector('#hotfixWarn') as HTMLElement;
  const retryEl = overlay.querySelector('#hotfixRetry') as HTMLButtonElement;
  const closeEl = overlay.querySelector('#hotfixClose') as HTMLButtonElement;
  closeEl.onclick = () => overlay.remove();
  if (window.gsap) {
    window.gsap.fromTo(cardEl, { opacity: 0, y: 12, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out' });
  }

  const headers = { 'Content-Type': 'application/json', 'X-Widget-Key': WIDGET_KEY };
  const req = async <T,>(path: string, method: 'GET' | 'POST', body?: unknown, timeoutMs = 15000): Promise<T> => {
    const url = `${WORKER_BASE}${path}`;
    const res = await withTimeout(fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }), timeoutMs, path);
    const payload = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    return payload as T;
  };

  const render = (status: WorkerBuildStatus): void => {
    const totalGlosses = Number(status.glosses?.totalLemmas || 0);
    const glossed = Number(status.glosses?.totalGlossed || 0);
    const pct = status.assembled?.ready
      ? 100
      : status.tatoeba?.ready
        ? (totalGlosses ? 30 + Math.floor((glossed / Math.max(1, totalGlosses)) * 60) : 30)
        : status.wiktionary?.ready ? 20 : status.lexique3?.ready ? 10 : 4;
    const phase = status.assembled?.ready
      ? 'Deck assembled'
      : !status.lexique3?.ready
        ? 'Preparing Lexique 3'
        : !status.wiktionary?.ready
          ? 'Preparing Wiktionary glosses'
        : !status.tatoeba?.ready
          ? 'Indexing example sentences'
          : glossed < totalGlosses
            ? 'Running LLM fallback'
            : 'Assembling import deck';
    progressEl.textContent = `${phase}. Progress ${pct}%.`;
    pctEl.textContent = `${pct}%`;
    glossMetricEl.textContent = `${glossed}/${totalGlosses}`;
    tokenMetricEl.textContent = status.tatoeba?.ready ? String(status.glosses?.cumulativeTokens || 0) : '0';
    stageMetricEl.textContent = phase;
    ringEl.style.background = `conic-gradient(var(--accent-primary) ${pct * 3.6}deg, rgba(var(--accent-rgb),0.12) 0deg)`;
    if (window.gsap) {
      window.gsap.to(barEl, { width: `${pct}%`, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
    } else {
      barEl.style.width = `${pct}%`;
    }

    const stages = [
      { label: 'Lexique 3', detail: status.lexique3?.ready ? `${status.lexique3.count || 0} lemmas` : 'Pending', done: !!status.lexique3?.ready, active: !status.lexique3?.ready },
      { label: 'Wiktionary glosses', detail: status.wiktionary?.ready ? `${status.wiktionary.count || 0} cached` : 'Pending', done: !!status.wiktionary?.ready, active: !!status.lexique3?.ready && !status.wiktionary?.ready },
      { label: 'Tatoeba', detail: status.tatoeba?.ready ? `${status.tatoeba.lemmasWithExamples || 0} matched` : 'Pending', done: !!status.tatoeba?.ready, active: !!status.wiktionary?.ready && !status.tatoeba?.ready },
      { label: 'LLM fallback', detail: `${glossed}/${totalGlosses} (${status.glosses?.budgetState || 'ok'})`, done: totalGlosses > 0 && glossed >= totalGlosses, active: !!status.tatoeba?.ready && glossed < totalGlosses },
      { label: 'Assemble', detail: status.assembled?.ready ? 'Ready' : 'Pending', done: !!status.assembled?.ready, active: totalGlosses > 0 && glossed >= totalGlosses && !status.assembled?.ready },
    ];
    stagesEl.innerHTML = stages.map((stage, index) => {
      const className = `fc-stage${stage.done ? ' is-done' : ''}${stage.active ? ' is-active' : ''}`;
      const icon = stage.done ? '&#10003;' : String(index + 1);
      const state = stage.done ? 'Done' : stage.active ? 'Now' : 'Queued';
      return `<div class="${className}"><div class="fc-stage-dot">${icon}</div><div><div class="fc-stage-label">${stage.label}</div><div style="color:var(--text-secondary);font-size:11px;line-height:1.35;margin-top:2px;">${stage.detail}</div></div><div class="fc-stage-state">${state}</div></div>`;
    }).join('');
    if (window.gsap) {
      window.gsap.fromTo(stagesEl.querySelectorAll('.fc-stage'), { opacity: 0.82 }, { opacity: 1, duration: 0.2, stagger: 0.03, ease: 'power2.out' });
    }
  };

  const run = async (): Promise<void> => {
    retryEl.style.display = 'none';
    warnEl.style.display = 'none';
    try {
      let status = await req<WorkerBuildStatus>('/studyengine/build/status', 'GET', undefined, 30000);
      render(status);
      if (!status.lexique3?.ready) { await req<unknown>('/studyengine/build/lexique3-prepare', 'POST', {}, 30000); status = await req<WorkerBuildStatus>('/studyengine/build/status', 'GET'); render(status); }
      if (!status.wiktionary?.ready) {
        // L1b-β: upload generated deterministic gloss cache before token-spending fallback.
        const wiktionaryFile = await fetch('./data/french-core-glosses-wiktionary.json', { cache: 'no-store' });
        if (!wiktionaryFile.ok) throw new Error(`Wiktionary gloss cache missing (${wiktionaryFile.status})`);
        const glosses = await wiktionaryFile.json() as unknown;
        await req<unknown>('/studyengine/build/wiktionary-prepare', 'POST', { glosses }, 30000);
        status = await req<WorkerBuildStatus>('/studyengine/build/status', 'GET');
        render(status);
      }
      if (!status.tatoeba?.ready) { await req<unknown>('/studyengine/build/tatoeba-prepare', 'POST', {}, 30000); status = await req<WorkerBuildStatus>('/studyengine/build/status', 'GET'); render(status); }
      while (!status.assembled?.ready && Number(status.glosses?.totalGlossed || 0) < Number(status.glosses?.totalLemmas || 0)) {
        const glossRes = await req<WorkerGlossResponse>('/studyengine/build/gloss-batch', 'POST', {}, 15000);
        if (glossRes.status === 'budget-warning') {
          warnEl.style.display = 'block';
          await new Promise<void>((resolve, reject) => {
            const c = overlay.querySelector('#hotfixContinue') as HTMLButtonElement;
            const s = overlay.querySelector('#hotfixStop') as HTMLButtonElement;
            c.onclick = async () => { warnEl.style.display = 'none'; await req<unknown>('/studyengine/build/gloss-batch', 'POST', { confirm: true }, 15000); resolve(); };
            s.onclick = () => reject(new Error('Build stopped at budget warning.'));
          });
        }
        if (glossRes.status === 'budget-exceeded') throw new Error('Build token budget exceeded.');
        status = await req<WorkerBuildStatus>('/studyengine/build/status', 'GET');
        render(status);
        if ((status.glosses?.totalGlossed || 0) >= (status.glosses?.totalLemmas || 0)) break;
      }
      status = await req<WorkerBuildStatus>('/studyengine/build/status', 'GET');
      render(status);
      if (!status.assembled?.ready) { await req<unknown>('/studyengine/build/assemble', 'POST', {}, 10000); status = await req<WorkerBuildStatus>('/studyengine/build/status', 'GET'); render(status); }
      const deckPayload = await req<WorkerDeckPayload>(deck.workerEndpoint, 'GET', undefined, 30000);
      await importDeckText(curatedStatus, deck.label, JSON.stringify(deckPayload.cards || []));
      overlay.remove();
    } catch (err) {
      progressEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
      stageMetricEl.textContent = 'Needs attention';
      retryEl.style.display = 'inline-flex';
      retryEl.onclick = () => { void run(); };
    }
  };
  await run();
}

// Legacy single-column variant. No call sites as of V2b-ii (2026-08-18);
// retained verbatim pending the owner's deletion decision. The curatedStatus
// parameter is accepted for signature parity with the dynamic variant.
export async function runWorkerOrchestrator(deck: Extract<CuratedDeckEntry, { source: 'worker' }>, curatedStatus: HTMLElement | null): Promise<void> {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = '<div style="width:min(720px,100%);background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:16px">'
    + '<h3 style="margin:0 0 8px">French Core 2000 build</h3>'
    + '<div id="hotfixProgress" style="font-size:13px;color:var(--text-secondary);margin-bottom:8px"></div>'
    + '<div id="hotfixStages" style="display:grid;gap:6px;margin-bottom:8px"></div>'
    + '<div id="hotfixWarn" style="display:none;padding:8px;border:1px dashed rgba(var(--accent-rgb),0.4);border-radius:10px;margin-bottom:8px">Build has used 50% of the token budget. Continue? <button id="hotfixContinue" class="ghost-btn">Continue</button> <button id="hotfixStop" class="ghost-btn">Stop</button></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end"><button id="hotfixRetry" class="ghost-btn" style="display:none">Retry</button><button id="hotfixClose" class="ghost-btn">Close</button></div></div>';
  document.body.appendChild(overlay);
  const progressEl = overlay.querySelector('#hotfixProgress') as HTMLElement;
  const stagesEl = overlay.querySelector('#hotfixStages') as HTMLElement;
  const warnEl = overlay.querySelector('#hotfixWarn') as HTMLElement;
  const retryEl = overlay.querySelector('#hotfixRetry') as HTMLButtonElement;
  const closeEl = overlay.querySelector('#hotfixClose') as HTMLButtonElement;
  closeEl.onclick = () => overlay.remove();

  const headers = { 'Content-Type': 'application/json', 'X-Widget-Key': WIDGET_KEY };
  const req = async (path: string, method: 'GET' | 'POST', body?: unknown, timeoutMs = 15000): Promise<any> => {
    const url = `${WORKER_BASE}${path}`;
    const res = await withTimeout(fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }), timeoutMs, path);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
    return payload;
  };

  const render = (status: any) => {
    const pct = status.assembled?.ready ? 100 : status.tatoeba?.ready ? (status.glosses?.totalLemmas ? 20 + Math.floor((status.glosses.totalGlossed / Math.max(1, status.glosses.totalLemmas)) * 70) : 20) : status.lexique3?.ready ? 10 : 0;
    progressEl.textContent = `Progress ${pct}% — glosses ${status.glosses?.totalGlossed || 0}/${status.glosses?.totalLemmas || 0}, tokens ${status.glosses?.cumulativeTokens || 0}`;
    stagesEl.innerHTML = [
      `1) Lexique 3: ${status.lexique3?.ready ? 'ready' : 'pending'}`,
      `2) Tatoeba: ${status.tatoeba?.ready ? 'ready' : 'pending'}`,
      `3) Glosses: ${status.glosses?.totalGlossed || 0}/${status.glosses?.totalLemmas || 0} (${status.glosses?.budgetState || 'ok'})`,
      `4) Assemble: ${status.assembled?.ready ? 'ready' : 'pending'}`,
    ].map((line) => `<div>${line}</div>`).join('');
  };

  const run = async (): Promise<void> => {
    retryEl.style.display = 'none';
    try {
      let status = await req('/studyengine/build/status', 'GET', undefined, 30000);
      render(status);
      if (!status.lexique3?.ready) { await req('/studyengine/build/lexique3-prepare', 'POST', {}, 30000); status = await req('/studyengine/build/status', 'GET'); render(status); }
      if (!status.tatoeba?.ready) { await req('/studyengine/build/tatoeba-prepare', 'POST', {}, 30000); status = await req('/studyengine/build/status', 'GET'); render(status); }
      while (!status.assembled?.ready && Number(status.glosses?.totalGlossed || 0) < Number(status.glosses?.totalLemmas || 0)) {
        const glossRes = await req('/studyengine/build/gloss-batch', 'POST', {}, 15000);
        if (glossRes.status === 'budget-warning') {
          warnEl.style.display = 'block';
          await new Promise<void>((resolve, reject) => {
            const c = overlay.querySelector('#hotfixContinue') as HTMLButtonElement;
            const s = overlay.querySelector('#hotfixStop') as HTMLButtonElement;
            c.onclick = async () => { warnEl.style.display = 'none'; await req('/studyengine/build/gloss-batch', 'POST', { confirm: true }, 15000); resolve(); };
            s.onclick = () => reject(new Error('Build stopped at budget warning.'));
          });
        }
        if (glossRes.status === 'budget-exceeded') throw new Error('Build token budget exceeded.');
        status = await req('/studyengine/build/status', 'GET');
        render(status);
        if ((status.glosses?.totalGlossed || 0) >= (status.glosses?.totalLemmas || 0)) break;
      }
      status = await req('/studyengine/build/status', 'GET');
      render(status);
      if (!status.assembled?.ready) { await req('/studyengine/build/assemble', 'POST', {}, 10000); status = await req('/studyengine/build/status', 'GET'); render(status); }
      const deckPayload = await req(deck.workerEndpoint, 'GET', undefined, 30000);
      await importDeckText(curatedStatus, deck.label, JSON.stringify(deckPayload.cards || []));
      overlay.remove();
    } catch (err) {
      progressEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
      retryEl.style.display = 'inline-flex';
      retryEl.onclick = () => { void run(); };
    }
  };
  await run();
}
