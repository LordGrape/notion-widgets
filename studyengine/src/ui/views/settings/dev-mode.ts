/**
 * UI layer (L4): dev-mode detection for settings surfaces.
 * Split verbatim from src/settings.ts in Phase V2b (2026-08-18).
 */

export function isDevModeEnabled(): boolean {
  let dev = false;
  try { dev = window.localStorage?.getItem('studyEngineDevMode') === '1'; } catch {}
  if (!dev) {
    try { dev = new URLSearchParams(window.location.search).get('dev') === '1'; } catch {}
  }
  return dev;
}
