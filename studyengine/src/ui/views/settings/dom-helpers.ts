/**
 * UI layer (L4): settings DOM read helpers.
 * Split verbatim from src/settings.ts in Phase V2b (2026-08-18).
 */

export function getActiveModeValue(selector: string, fallback: string): string {
  const group = document.querySelector(selector);
  const active = group ? group.querySelector('.mode-btn.active') : null;
  return active ? String(active.getAttribute('data-val') || fallback) : fallback;
}
