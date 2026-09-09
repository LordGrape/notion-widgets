/**
 * UI layer (L4): French Core 2000 worker-build progress modal.
 * Worker credentials are resolved at runtime from SyncEngine or browser-local
 * state. They must never be bundled into this public client.
 */
import type { CuratedDeckEntry, WorkerBuildStatus, WorkerDeckPayload, WorkerGlossResponse } from '../../../application/settings/types';
import { withTimeout } from '../../../shared/with-timeout';
import { importDeckText } from './import-deck-text';

const WORKER_BASE = 'https://widget-sync.lordgrape-widgets.workers.dev';

type SyncEngineAuthShape = {
  _key?: unknown;
  key?: unknown;
  passphrase?: unknown;
};

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveWidgetKey(): string {
  const syncEngine = (globalThis as { SyncEngine?: SyncEngineAuthShape }).SyncEngine;
  const syncKey = nonEmptyString(syncEngine?._key)
    || nonEmptyString(syncEngine?.key)
    || nonEmptyString(syncEngine?.passphrase);
  if (syncKey) return syncKey;

  try {
    const fragment = new URLSearchParams(globalThis.location?.hash?.slice(1) || '');
    const fragmentKey = nonEmptyString(fragment.get('key')) || nonEmptyString(fragment.get('passphrase'));
    if (fragmentKey) return fragmentKey;
  } catch {
    // Ignore unavailable or malformed URL state.
  }

  try {
    return nonEmptyString(globalThis.localStorage?.getItem('_sync_passphrase'));
  } catch {
    return '';
  }
}

type BuildElements = {
  overlay: HTMLDivElement;
  progress: HTMLElement;
  stages: HTMLElement;
  warning: HTMLElement;
  retry: HTMLButtonElement;
  close: HTMLButtonElement;
};

function createBuildModal(): BuildElements {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = '<div role="dialog" aria-modal="true" aria-label="French Core 2000 build" style="width:min(720px,100%);background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;box-shadow:var(--shadow);padding:16px;display:grid;gap:12px">'
    + '<div><p style="margin:0;color:var(--text-tertiary);font-size:10px;font-weight:800;letter-spacing:.8px;text-transform:uppercase">Study Engine</p><h3 style="margin:4px 0 0;color:var(--text)">French Core 2000 build</h3></div>'
    + '<div id="workerBuildProgress" style="color:var(--text-secondary);font-size:13px">Connecting to the build worker…</div>'
    + '<div id="workerBuildStages" style="display:grid;gap:7px"></div>'
    + '<div id="workerBuildWarning" style="display:none;padding:10px;border:1px dashed rgba(var(--accent-rgb),.4);border-radius:8px;color:var(--text-secondary)">Build has used 50% of the token budget. <button id="workerBuildContinue" class="ghost-btn" type="button">Continue</button> <button id="workerBuildStop" class="ghost-btn" type="button">Stop</button></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end"><button id="workerBuildRetry" class="ghost-btn" type="button" style="display:none">Retry</button><button id="workerBuildClose" class="ghost-btn" type="button">Close</button></div></div>';
  document.body.appendChild(overlay);

  const get = <T extends Element>(selector: string): T => {
    const element = overlay.querySelector<T>(selector);
    if (!element) throw new Error(`Build modal element missing: ${selector}`);
    return element;
  };

  const elements: BuildElements = {
    overlay,
    progress: get<HTMLElement>('#workerBuildProgress'),
    stages: get<HTMLElement>('#workerBuildStages'),
    warning: get<HTMLElement>('#workerBuildWarning'),
    retry: get<HTMLButtonElement>('#workerBuildRetry'),
    close: get<HTMLButtonElement>('#workerBuildClose'),
  };
  elements.close.onclick = () => overlay.remove();
  return elements;
}

function renderStatus(elements: BuildElements, status: WorkerBuildStatus): void {
  const totalGlosses = Number(status.glosses?.totalLemmas || 0);
  const glossed = Number(status.glosses?.totalGlossed || 0);
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

  elements.progress.textContent = `${phase}. Glosses ${glossed}/${totalGlosses}; tokens ${status.glosses?.cumulativeTokens || 0}.`;
  const stages = [
    ['Lexique 3', !!status.lexique3?.ready],
    ['Wiktionary glosses', !!status.wiktionary?.ready],
    ['Tatoeba examples', !!status.tatoeba?.ready],
    ['LLM fallback', totalGlosses > 0 && glossed >= totalGlosses],
    ['Assemble', !!status.assembled?.ready],
  ] as const;
  elements.stages.innerHTML = stages.map(([label, done], index) => (
    `<div style="display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:center;padding:8px 10px;border-radius:8px;border:1px solid rgba(var(--accent-rgb),.12)"><strong>${done ? '&#10003;' : index + 1}</strong><span>${label}</span><small>${done ? 'Done' : 'Pending'}</small></div>`
  )).join('');
}

async function runBuild(
  deck: Extract<CuratedDeckEntry, { source: 'worker' }>,
  curatedStatus: HTMLElement | null,
): Promise<void> {
  const elements = createBuildModal();

  const execute = async (): Promise<void> => {
    elements.retry.style.display = 'none';
    elements.warning.style.display = 'none';
    const widgetKey = resolveWidgetKey();
    if (!widgetKey) {
      throw new Error('Unlock Study Engine with your widget access key, then retry.');
    }

    const headers = { 'Content-Type': 'application/json', 'X-Widget-Key': widgetKey };
    const request = async <T,>(path: string, method: 'GET' | 'POST', body?: unknown, timeoutMs = 15000): Promise<T> => {
      const response = await withTimeout(fetch(`${WORKER_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }), timeoutMs, path);
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      return payload as T;
    };

    let status = await request<WorkerBuildStatus>('/studyengine/build/status', 'GET', undefined, 30000);
    renderStatus(elements, status);
    if (!status.lexique3?.ready) {
      await request<unknown>('/studyengine/build/lexique3-prepare', 'POST', {}, 30000);
      status = await request<WorkerBuildStatus>('/studyengine/build/status', 'GET');
      renderStatus(elements, status);
    }
    if (!status.wiktionary?.ready) {
      const wiktionaryFile = await fetch('./data/french-core-glosses-wiktionary.json', { cache: 'no-store' });
      if (!wiktionaryFile.ok) throw new Error(`Wiktionary gloss cache missing (${wiktionaryFile.status})`);
      await request<unknown>('/studyengine/build/wiktionary-prepare', 'POST', { glosses: await wiktionaryFile.json() }, 30000);
      status = await request<WorkerBuildStatus>('/studyengine/build/status', 'GET');
      renderStatus(elements, status);
    }
    if (!status.tatoeba?.ready) {
      await request<unknown>('/studyengine/build/tatoeba-prepare', 'POST', {}, 30000);
      status = await request<WorkerBuildStatus>('/studyengine/build/status', 'GET');
      renderStatus(elements, status);
    }

    while (!status.assembled?.ready && Number(status.glosses?.totalGlossed || 0) < Number(status.glosses?.totalLemmas || 0)) {
      const gloss = await request<WorkerGlossResponse>('/studyengine/build/gloss-batch', 'POST', {}, 15000);
      if (gloss.status === 'budget-warning') {
        elements.warning.style.display = 'block';
        await new Promise<void>((resolve, reject) => {
          const continueButton = elements.overlay.querySelector<HTMLButtonElement>('#workerBuildContinue');
          const stopButton = elements.overlay.querySelector<HTMLButtonElement>('#workerBuildStop');
          if (!continueButton || !stopButton) return reject(new Error('Budget controls unavailable.'));
          continueButton.onclick = async () => {
            elements.warning.style.display = 'none';
            await request<unknown>('/studyengine/build/gloss-batch', 'POST', { confirm: true }, 15000);
            resolve();
          };
          stopButton.onclick = () => reject(new Error('Build stopped at budget warning.'));
        });
      }
      if (gloss.status === 'budget-exceeded') throw new Error('Build token budget exceeded.');
      status = await request<WorkerBuildStatus>('/studyengine/build/status', 'GET');
      renderStatus(elements, status);
    }

    if (!status.assembled?.ready) {
      await request<unknown>('/studyengine/build/assemble', 'POST', {}, 10000);
      status = await request<WorkerBuildStatus>('/studyengine/build/status', 'GET');
      renderStatus(elements, status);
    }
    const deckPayload = await request<WorkerDeckPayload>(deck.workerEndpoint, 'GET', undefined, 30000);
    await importDeckText(curatedStatus, deck.label, JSON.stringify(deckPayload.cards || []));
    elements.overlay.remove();
  };

  try {
    await execute();
  } catch (error) {
    elements.progress.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    elements.retry.style.display = 'inline-flex';
    elements.retry.onclick = () => { void execute().catch((retryError) => {
      elements.progress.textContent = `Error: ${retryError instanceof Error ? retryError.message : String(retryError)}`;
    }); };
  }
}

export async function runWorkerOrchestratorDynamic(
  deck: Extract<CuratedDeckEntry, { source: 'worker' }>,
  curatedStatus: HTMLElement | null,
): Promise<void> {
  await runBuild(deck, curatedStatus);
}

export async function runWorkerOrchestrator(
  deck: Extract<CuratedDeckEntry, { source: 'worker' }>,
  curatedStatus: HTMLElement | null,
): Promise<void> {
  await runBuild(deck, curatedStatus);
}
