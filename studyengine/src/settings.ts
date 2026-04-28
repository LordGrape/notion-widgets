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

type CuratedDeckEntry = {
  id: string;
  label: string;
  dataPath: string;
  courseHint?: string;
};

const CURATED_DECKS: ReadonlyArray<CuratedDeckEntry> = [
  {
    // L1b-alpha: first-class curated deck registry entry.
    id: 'french-core-2000',
    label: 'Import French Core 2000',
    dataPath: './data/french-core-2000.json',
    courseHint: 'French',
  },
];

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

    // L1b-alpha: first-class curated import surface in Settings (profile-neutral).
    const curatedMount = el<HTMLElement>('curatedDecksSection');
    const curatedStatus = el<HTMLElement>('curatedDecksStatus');
    if (curatedMount) {
      curatedMount.innerHTML = CURATED_DECKS.map(
        (deck) =>
          `<button type="button" class="ghost-btn curated-deck-btn" data-curated-deck-id="${deck.id}" style="width:100%;min-width:auto;margin-top:8px">${deck.label}</button>`,
      ).join('');

      curatedMount.querySelectorAll<HTMLButtonElement>('.curated-deck-btn').forEach((btn) => {
        btn.onclick = async () => {
          const deck = CURATED_DECKS.find((entry) => entry.id === btn.dataset.curatedDeckId);
          if (!deck) return;
          try {
            const res = await fetch(deck.dataPath, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = String(await res.text()).trim();
            if (!text) throw new Error('Deck file is empty');
            const importBtn = document.getElementById('importBtn') as HTMLButtonElement | null;
            if (!importBtn) throw new Error('Import path not available');
            importBtn.click();
            window.setTimeout(() => {
              const ta = document.getElementById('m_import') as HTMLTextAreaElement | null;
              const next = document.getElementById('addNextBtn') as HTMLButtonElement | null;
              if (!ta || !next) {
                if (curatedStatus) curatedStatus.textContent = 'Import modal did not open.';
                return;
              }
              ta.value = text;
              next.click();
              if (curatedStatus) curatedStatus.textContent = `${deck.label} loaded. Confirm in import preview.`;
            }, 80);
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
      let dev = false;
      try { dev = window.localStorage?.getItem('studyEngineDevMode') === '1'; } catch {}
      if (!dev) {
        try { dev = new URLSearchParams(window.location.search).get('dev') === '1'; } catch {}
      }
      l1aSection.style.display = dev ? 'block' : 'none';
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
