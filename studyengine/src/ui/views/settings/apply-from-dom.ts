/**
 * UI layer (L4): read the settings form into the settings object.
 * Split verbatim from src/settings.ts in Phase V2b (2026-08-18).
 */
import type { Settings } from '../../../types';
import type { SettingsModuleContext } from '../../../application/settings/types';
import { getActiveModeValue } from './dom-helpers';

export function applySettingsFromDom(ctx: SettingsModuleContext): void {
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
