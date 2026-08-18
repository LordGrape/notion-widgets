/**
 * UI layer (L4): restore-from-paste backup flow (data-critical path).
 * Split from src/settings.ts in Phase V2b-ii (2026-08-18). Body verbatim;
 * `el` is destructured from the context parameter, matching the closure's
 * capture of the same context member.
 */
import type { AppState, Settings } from '../../../types';
import type { SettingsModuleContext } from '../../../application/settings/types';

export function handleRestoreFromPaste(ctx: SettingsModuleContext): void {
  const { el } = ctx;
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
}
