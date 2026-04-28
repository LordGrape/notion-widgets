import type { AppState, Settings } from './types';

type ElFn = <T extends HTMLElement = HTMLElement>(id: string) => T;

type SettingsModuleContext = {
  el: ElFn;
  settingsOv: HTMLElement;
  getState: () => AppState;
  getSettings: () => Settings;
  saveState: () => void;
  renderDashboard: () => void;
  renderSettings: () => void;
  refreshCostEstimateInSettings: () => void;
  migrateItems: () => void;
  toast: (message: string) => void;
  clamp: (n: number, min: number, max: number) => number;
  reinitFsrsWithRetention: (retention: number) => void;
  playPresetSelect?: () => void;
  playOpen?: () => void;
  playClose?: () => void;
};

declare global {
  interface Window {
    Core?: {
      a11y?: {
        trap?: (target: HTMLElement) => void;
      };
    };
  }
}

function isDevModeEnabled(): boolean {
  let dev = false;
  try { dev = window.localStorage?.getItem('studyEngineDevMode') === '1'; } catch {}
  if (!dev) {
    try { dev = new URLSearchParams(window.location.search).get('dev') === '1'; } catch {}
  }
  return dev;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then((value) => {
      window.clearTimeout(id);
      resolve(value);
    }).catch((err) => {
      window.clearTimeout(id);
      reject(err);
    });
  });
}

function getActiveModeValue(selector: string, fallback: string): string {
  const group = document.querySelector(selector);
  const active = group ? group.querySelector('.mode-btn.active') : null;
  return active ? String(active.getAttribute('data-val') || fallback) : fallback;
}

function applySettingsFromDom(ctx: SettingsModuleContext): void {
  const { el, getSettings, clamp, reinitFsrsWithRetention } = ctx;
  const settings = getSettings();

  const r = parseFloat((el<HTMLInputElement>('s_ret')?.value as string) || '0.9');
  const lim = parseInt((el<HTMLInputElement>('s_lim')?.value as string) || '12', 10);
  const mm = parseInt(getActiveModeValue('.mode-toggle[data-setting="s_mock"]', '10'), 10);
  const at = getActiveModeValue('.mode-toggle[data-setting="s_apply"]', '1') === '1';
  const revealMode = getActiveModeValue('.mode-toggle[data-setting="s_revealMode"]', 'auto');

  settings.desiredRetention = clamp(Number.isFinite(r) ? r : 0.9, 0.8, 0.95);
  reinitFsrsWithRetention(settings.desiredRetention);

  settings.sessionLimit = clamp(Number.isFinite(lim) ? lim : 12, 5, 60);
  settings.mockDefaultMins = [5, 10, 15, 30].includes(mm) ? mm : 10;
  settings.showApplyTimer = !!at;
  settings.revealMode = (['auto', 'manual', 'visual', 'audio', 'both'] as const).includes(
    revealMode as Settings['revealMode']
  )
    ? (revealMode as Settings['revealMode'])
    : 'auto';

  settings.ttsVoice = el<HTMLSelectElement>('tts-voice')?.value || 'en-US-Studio-O';
  settings.breakReminders = el<HTMLSelectElement>('s_breakReminders')?.value === 'true';
  settings.breakIntervalMins = parseInt(el<HTMLSelectElement>('s_breakInterval')?.value || '25', 10);
  settings.performanceBreaks = el<HTMLSelectElement>('s_perfBreaks')?.value === 'true';

  const fm = el<HTMLSelectElement>('s_feedbackMode')?.value || 'adaptive';
  settings.feedbackMode = (['adaptive', 'always_socratic', 'always_quick', 'self_rate'] as const).includes(
    fm as Settings['feedbackMode']
  )
    ? (fm as Settings['feedbackMode'])
    : 'adaptive';

  const mo = el<HTMLSelectElement>('s_modelOverride')?.value || 'adaptive';
  settings.modelOverride = (['adaptive', 'pro', 'flash'] as const).includes(mo as Settings['modelOverride'])
    ? (mo as Settings['modelOverride'])
    : 'adaptive';

  settings.userName = String(el<HTMLInputElement>('s_userName')?.value || '').trim();

  const tv = el<HTMLSelectElement>('s_tutorVoice')?.value || 'rigorous';
  settings.tutorVoice = tv === 'supportive' ? 'supportive' : 'rigorous';
}

type CuratedDeckEntry =
  | { id: string; label: string; source: 'static'; dataPath: string; courseHint?: string }
  | { id: string; label: string; source: 'worker'; workerEndpoint: string; courseHint?: string };

type FrenchCoreImportSnapshot = {
  activeCount: number;
  archivedCount: number;
  totalCount: number;
};

type WorkerBuildStatus = {
  lexique3?: { ready?: boolean; count?: number; sha256?: string };
  // L1b-β: deterministic Wiktionary cache stage sits before LLM fallback.
  wiktionary?: { ready?: boolean; count?: number };
  tatoeba?: { ready?: boolean; lemmasWithExamples?: number };
  glosses?: {
    totalGlossed?: number;
    totalLemmas?: number;
    cumulativeTokens?: number;
    budgetState?: string;
  };
  assembled?: { ready?: boolean; lemmaCount?: number; generatedAt?: string };
};

type WorkerGlossResponse = {
  status?: string;
};

type WorkerDeckPayload = {
  cards?: unknown[];
};

const WORKER_BASE = 'https://widget-sync.lordgrape-widgets.workers.dev';
// POST-L1b-α-2: hardcoded worker auth header — single-user widget, value is already pseudo-public in the deployed bundle.
const WIDGET_KEY = 'G7$mXv!pL3@kR9wNz#Qe2YdF8bJhT6cA';

const CURATED_DECKS: ReadonlyArray<CuratedDeckEntry> = [
  {
    // L1b-alpha-hotfix: static curated deck path remains unchanged.
    id: 'french-core-50-sample',
    label: 'Import French Core 50 (sample)',
    source: 'static',
    dataPath: './data/french-core-50-sample.json',
    courseHint: 'French',
  },
  {
    // L1b-alpha-hotfix: worker-built curated deck entry (dev-mode orchestrated).
    id: 'french-core-2000',
    label: 'French — Core 2000 (built server-side)',
    source: 'worker',
    workerEndpoint: '/studyengine/decks/french-core-2000',
    courseHint: 'French',
  },
];

function getFrenchCoreImportSnapshot(state: AppState): FrenchCoreImportSnapshot {
  let activeCount = 0;
  let archivedCount = 0;
  const items = state.items || {};
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const item = items[id];
    if (!item) continue;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const subDeck = String(item.subDeck || item.subdeck || '');
    const isFrenchCore =
      tags.includes('french-core-2000') ||
      (item.course === 'French' && subDeck === 'Core 2000' && String(item.targetLanguage || '').startsWith('fr'));
    if (!isFrenchCore) continue;
    if (item.archived) archivedCount += 1;
    else activeCount += 1;
  }
  return { activeCount, archivedCount, totalCount: activeCount + archivedCount };
}

export function setupSettingsModule(ctx: SettingsModuleContext): {
  openSettings: () => void;
  closeSettings: () => void;
  resetSettingsModalTabs: () => void;
  bindSettingsTabListeners: () => void;
  saveSettings: () => void;
} {
  const { el, settingsOv } = ctx;
  let settingsTabListenersBound = false;

  const resetSettingsModalTabs = (): void => {
    const generalPanel = el<HTMLElement>('settingsTabGeneral');
    const dataPanel = el<HTMLElement>('settingsTabData');
    if (generalPanel) generalPanel.style.display = 'block';
    if (dataPanel) dataPanel.style.display = 'none';

    settingsOv.querySelectorAll<HTMLElement>('.settings-tab').forEach((t) => {
      const isGeneral = t.dataset.settingsTab === 'general';
      t.classList.toggle('active', isGeneral);
      t.setAttribute('aria-selected', isGeneral ? 'true' : 'false');
      t.style.background = isGeneral ? 'rgba(var(--accent-rgb),0.18)' : 'transparent';
      t.style.color = isGeneral ? 'var(--text)' : 'var(--text-secondary)';
    });
  };

  const bindSettingsTabListeners = (): void => {
    if (settingsTabListenersBound) return;

    settingsOv.querySelectorAll<HTMLElement>('.settings-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.settingsTab;
        settingsOv.querySelectorAll<HTMLElement>('.settings-tab').forEach((t) => {
          const isActive = t.dataset.settingsTab === target;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', isActive ? 'true' : 'false');
          t.style.background = isActive ? 'rgba(var(--accent-rgb),0.18)' : 'transparent';
          t.style.color = isActive ? 'var(--text)' : 'var(--text-secondary)';
        });

        const generalPanel = el<HTMLElement>('settingsTabGeneral');
        const dataPanel = el<HTMLElement>('settingsTabData');
        if (generalPanel) generalPanel.style.display = target === 'general' ? 'block' : 'none';
        if (dataPanel) dataPanel.style.display = target === 'data' ? 'block' : 'none';

        if (target === 'data') {
          const showArea = el<HTMLElement>('showDataArea');
          if (showArea) showArea.style.display = 'none';
          const restoreStatus = el<HTMLElement>('restoreStatus');
          if (restoreStatus) restoreStatus.textContent = '';
          const pasteText = el<HTMLTextAreaElement>('pasteDataText');
          if (pasteText) pasteText.value = '';
        }

        try {
          ctx.playPresetSelect?.();
        } catch {
          // no-op
        }
      });
    });

    settingsTabListenersBound = true;
  };

  const openSettings = (): void => {
    resetSettingsModalTabs();

    const showDataAreaReset = el<HTMLElement>('showDataArea');
    if (showDataAreaReset) showDataAreaReset.style.display = 'none';
    const restoreStatusReset = el<HTMLElement>('restoreStatus');
    if (restoreStatusReset) restoreStatusReset.textContent = '';

    ctx.renderSettings();
    ctx.refreshCostEstimateInSettings();
    bindSettingsTabListeners();

    settingsOv.classList.add('show');
    settingsOv.setAttribute('aria-hidden', 'false');
    window.Core?.a11y?.trap?.(settingsOv);

    const showDataBtn = el<HTMLButtonElement>('showDataBtn');
    if (showDataBtn) {
      showDataBtn.onclick = () => {
        const area = el<HTMLElement>('showDataArea');
        const textEl = el<HTMLTextAreaElement>('showDataText');
        if (!area || !textEl) return;

        const exportData = {
          _export: 'studyengine-full-backup',
          _version: 1,
          _date: new Date().toISOString(),
          items: ctx.getState().items || {},
          courses: ctx.getState().courses || {},
          calibration: ctx.getState().calibration || {},
          stats: ctx.getState().stats || {},
          settings: ctx.getSettings() || {},
        };

        textEl.value = JSON.stringify(exportData, null, 2);
        area.style.display = 'block';
        textEl.focus();
        textEl.select();
        ctx.toast('Data shown — select all and copy (Ctrl+A → Ctrl+C)');
      };
    }

    const showDataTextEl = el<HTMLTextAreaElement>('showDataText');
    if (showDataTextEl) {
      showDataTextEl.onclick = function onShowDataClick(): void {
        (this as HTMLTextAreaElement).select();
      };
    }

    // POST-L1b-α: dev-mode gate removed — single-user widget, no benefit to hiding worker decks.
    const curatedMount = el<HTMLElement>('curatedDecksSection');
    const curatedStatus = el<HTMLElement>('curatedDecksStatus');

    async function importDeckText(deckLabel: string, text: string): Promise<void> {
      const importBtn = document.getElementById('importBtn') as HTMLButtonElement | null;
      if (!importBtn) throw new Error('Import path not available');
      importBtn.click();
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const ta = document.getElementById('m_import') as HTMLTextAreaElement | null;
      const next = document.getElementById('addNextBtn') as HTMLButtonElement | null;
      if (!ta || !next) throw new Error('Import modal did not open.');
      ta.value = text;
      next.click();
      if (curatedStatus) curatedStatus.textContent = `${deckLabel} loaded. Confirm in import preview.`;
    }

    async function confirmCuratedReimport(snapshot: FrenchCoreImportSnapshot): Promise<boolean> {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = '<div role="dialog" aria-modal="true" aria-label="French Core 2000 already imported" style="width:min(520px,100%);background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);padding:16px;display:grid;gap:12px;">'
          + '<div style="display:flex;align-items:flex-start;gap:12px;">'
          + '<div style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(var(--accent-rgb),0.14);border:1px solid rgba(var(--accent-rgb),0.2);font-weight:900;color:var(--accent-primary);">!</div>'
          + '<div style="min-width:0;"><h3 style="margin:0 0 4px;font-size:17px;line-height:1.2;color:var(--text);">French Core 2000 is already in your library</h3>'
          + `<p style="margin:0;color:var(--text-secondary);font-size:12px;line-height:1.45;">You already have ${snapshot.activeCount} active cards${snapshot.archivedCount ? ` and ${snapshot.archivedCount} archived cards` : ''} from this deck. Reimporting can create duplicates.</p></div></div>`
          + '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;"><button id="fcGuardCancel" class="ghost-btn" type="button">Cancel</button><button id="fcGuardContinue" class="ghost-btn" type="button">Import anyway</button></div></div>';
        document.body.appendChild(overlay);
        const card = overlay.querySelector('[role="dialog"]') as HTMLElement | null;
        if (card && window.gsap) {
          window.gsap.fromTo(card, { opacity: 0, y: 10, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'power2.out' });
        }
        const finish = (answer: boolean): void => {
          const done = (): void => {
            overlay.remove();
            resolve(answer);
          };
          if (card && window.gsap) {
            window.gsap.to(card, { opacity: 0, y: 8, duration: 0.16, ease: 'power2.in', onComplete: done });
          } else {
            done();
          }
        };
        const cancel = overlay.querySelector('#fcGuardCancel') as HTMLButtonElement | null;
        const keepGoing = overlay.querySelector('#fcGuardContinue') as HTMLButtonElement | null;
        if (cancel) cancel.onclick = () => finish(false);
        if (keepGoing) keepGoing.onclick = () => finish(true);
      });
    }

    async function runWorkerOrchestratorDynamic(deck: Extract<CuratedDeckEntry, { source: 'worker' }>): Promise<void> {
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
          await importDeckText(deck.label, JSON.stringify(deckPayload.cards || []));
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

    async function runWorkerOrchestrator(deck: Extract<CuratedDeckEntry, { source: 'worker' }>): Promise<void> {
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
          await importDeckText(deck.label, JSON.stringify(deckPayload.cards || []));
          overlay.remove();
        } catch (err) {
          progressEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
          retryEl.style.display = 'inline-flex';
          retryEl.onclick = () => { void run(); };
        }
      };
      await run();
    }

    if (curatedMount) {
      const visibleDecks = CURATED_DECKS.slice();
      curatedMount.innerHTML = visibleDecks.map(
        (deck) =>
          `<button type="button" class="ghost-btn curated-deck-btn" data-curated-deck-id="${deck.id}" style="width:100%;min-width:auto;margin-top:8px">${deck.label}</button>`,
      ).join('');

      curatedMount.querySelectorAll<HTMLButtonElement>('.curated-deck-btn').forEach((btn) => {
        btn.onclick = async () => {
          const deck = CURATED_DECKS.find((entry) => entry.id === btn.dataset.curatedDeckId);
          if (!deck) return;
          try {
            if (deck.source === 'worker') {
              const snapshot = getFrenchCoreImportSnapshot(ctx.getState());
              if (snapshot.activeCount > 0) {
                const shouldImport = await confirmCuratedReimport(snapshot);
                if (!shouldImport) {
                  if (curatedStatus) curatedStatus.textContent = 'French Core 2000 import cancelled.';
                  return;
                }
              }
              await runWorkerOrchestratorDynamic(deck);
              return;
            }
            const res = await fetch(deck.dataPath, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = String(await res.text()).trim();
            if (!text) throw new Error('Deck file is empty');
            await importDeckText(deck.label, text);
          } catch (err) {
            if (curatedStatus) {
              curatedStatus.textContent = `Could not load deck (${err instanceof Error ? err.message : String(err)}).`;
            }
          }
        };
      });
    }

    const l1aSection = el<HTMLElement>('l1aFrenchSampleSection');
    const l1aBtn = el<HTMLButtonElement>('l1aFrenchSampleBtn');
    const l1aFile = el<HTMLInputElement>('l1aFrenchSampleFile');
    const l1aStatus = el<HTMLElement>('l1aFrenchSampleStatus');
    if (l1aSection) {
      l1aSection.style.display = isDevModeEnabled() ? 'block' : 'none';
    }
    if (l1aBtn && l1aFile) {
      l1aBtn.onclick = () => { l1aFile.value = ''; l1aFile.click(); };
      l1aFile.onchange = () => {
        const file = l1aFile.files && l1aFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '').trim();
          if (!text) { if (l1aStatus) l1aStatus.textContent = 'File is empty.'; return; }
          const importBtn = document.getElementById('importBtn') as HTMLButtonElement | null;
          if (!importBtn) { if (l1aStatus) l1aStatus.textContent = 'Import path not available.'; return; }
          importBtn.click();
          window.setTimeout(() => {
            const ta = document.getElementById('m_import') as HTMLTextAreaElement | null;
            const next = document.getElementById('addNextBtn') as HTMLButtonElement | null;
            if (!ta || !next) { if (l1aStatus) l1aStatus.textContent = 'Import modal did not open.'; return; }
            ta.value = text;
            next.click();
            if (l1aStatus) l1aStatus.textContent = 'Sample loaded — confirm in the import preview.';
          }, 80);
        };
        reader.onerror = () => { if (l1aStatus) l1aStatus.textContent = 'Could not read file.'; };
        reader.readAsText(file);
      };
    }

    const restoreBtn = el<HTMLButtonElement>('restoreDataBtn');
    if (restoreBtn) {
      restoreBtn.onclick = () => {
        const textEl = el<HTMLTextAreaElement>('pasteDataText');
        const statusEl = el<HTMLElement>('restoreStatus');
        if (!textEl) return;

        const raw = (textEl.value || '').trim();
        if (!raw) {
          if (statusEl) statusEl.textContent = 'Paste your data first';
          return;
        }

        try {
          const imported = JSON.parse(raw) as Partial<AppState> & { settings?: Partial<Settings> };
          if (!imported.items || typeof imported.items !== 'object') {
            if (statusEl) statusEl.textContent = 'Invalid data — missing items';
            return;
          }

          const itemCount = Object.keys(imported.items).length;
          const courseCount = imported.courses ? Object.keys(imported.courses).length : 0;
          const state = ctx.getState();

          for (const id in imported.items) {
            if (Object.prototype.hasOwnProperty.call(imported.items, id)) {
              state.items[id] = imported.items[id] as AppState['items'][string];
            }
          }

          if (imported.courses) {
            for (const cName in imported.courses) {
              if (Object.prototype.hasOwnProperty.call(imported.courses, cName)) {
                state.courses[cName] = imported.courses[cName] as AppState['courses'][string];
              }
            }
          }

          if (
            imported.calibration &&
            imported.calibration.history &&
            imported.calibration.history.length > ((state.calibration || {}).history || []).length
          ) {
            state.calibration = imported.calibration;
          }

          if (
            imported.stats &&
            (imported.stats.totalReviews || 0) > ((state.stats || {}).totalReviews || 0)
          ) {
            state.stats = imported.stats;
          }

          if (imported.settings && typeof imported.settings === 'object') {
            const settings = ctx.getSettings();
            for (const sk in imported.settings) {
              if (Object.prototype.hasOwnProperty.call(imported.settings, sk)) {
                (settings as unknown as Record<string, unknown>)[sk] = (imported.settings as unknown as Record<string, unknown>)[sk];
              }
            }
          }

          ctx.migrateItems();
          ctx.saveState();
          if (statusEl) statusEl.textContent = `Restored ${itemCount} items, ${courseCount} courses`;
          ctx.toast(`Restored ${itemCount} items`);
          setTimeout(() => {
            ctx.renderDashboard();
          }, 500);

          try {
            ctx.playPresetSelect?.();
          } catch {
            // no-op
          }
        } catch (e) {
          if (statusEl) statusEl.textContent = `Invalid JSON — ${(e as Error).message || String(e)}`;
        }
      };
    }

    try {
      ctx.playOpen?.();
    } catch {
      // no-op
    }
  };

  const closeSettings = (): void => {
    settingsOv.classList.remove('show');
    settingsOv.setAttribute('aria-hidden', 'true');
    try {
      ctx.playClose?.();
    } catch {
      // no-op
    }
  };

  const saveSettings = (): void => {
    applySettingsFromDom(ctx);
    ctx.saveState();
    closeSettings();
    ctx.renderDashboard();
    try {
      ctx.playPresetSelect?.();
    } catch {
      // no-op
    }
    ctx.toast('Saved');
  };

  return {
    openSettings,
    closeSettings,
    resetSettingsModalTabs,
    bindSettingsTabListeners,
    saveSettings,
  };
}
