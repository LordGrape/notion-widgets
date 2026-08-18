import type { SettingsModuleContext } from './application/settings/types';
import { CURATED_DECKS, getFrenchCoreImportSnapshot } from './application/settings/curation';
import { isDevModeEnabled } from './ui/views/settings/dev-mode';
import { applySettingsFromDom } from './ui/views/settings/apply-from-dom';
import { confirmCuratedReimport } from './ui/views/settings/curated-reimport-modal';
import { importDeckText } from './ui/views/settings/import-deck-text';
import { runWorkerOrchestratorDynamic } from './ui/views/settings/french-core-build-modal';
import { handleRestoreFromPaste } from './ui/views/settings/restore-data';
import { handleShowData } from './ui/views/settings/show-data';

// --- Phase V2b-ii facade ----------------------------------------------------
// The settings modal orchestration moved to ui/views/settings/ (2026-08-18):
// bodies verbatim, with the openSettings-local curatedStatus element now
// threaded as an explicit parameter. This facade holds wiring only: tab
// logic, element lookups, and handler delegation. The legacy
// runWorkerOrchestrator moved with its sibling into french-core-build-modal.ts;
// it has no call sites and remains a deletion candidate pending owner review.

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
        handleShowData(ctx);
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
              await runWorkerOrchestratorDynamic(deck, curatedStatus);
              return;
            }
            const res = await fetch(deck.dataPath, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = String(await res.text()).trim();
            if (!text) throw new Error('Deck file is empty');
            await importDeckText(curatedStatus, deck.label, text);
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
        handleRestoreFromPaste(ctx);
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
