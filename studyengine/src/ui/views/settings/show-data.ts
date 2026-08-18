/**
 * UI layer (L4): show the full backup payload for manual copy.
 * Split from src/settings.ts in Phase V2b-ii (2026-08-18). Body verbatim;
 * `el` is destructured from the context parameter, matching the closure's
 * capture of the same context member.
 */
import type { SettingsModuleContext } from '../../../application/settings/types';

export function handleShowData(ctx: SettingsModuleContext): void {
  const { el } = ctx;
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
}
