/**
 * UI layer (L4): route deck text into the standard import preview flow.
 * Split from src/settings.ts in Phase V2b-ii (2026-08-18). Body verbatim;
 * the openSettings-local `curatedStatus` element, previously a closure
 * capture, is now an explicit first parameter.
 */
export async function importDeckText(curatedStatus: HTMLElement | null, deckLabel: string, text: string): Promise<void> {
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
