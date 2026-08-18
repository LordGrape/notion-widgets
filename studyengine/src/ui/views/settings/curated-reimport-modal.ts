/**
 * UI layer (L4): confirm modal before reimporting French Core 2000.
 * Split verbatim from src/settings.ts in Phase V2b-ii (2026-08-18).
 * This closure captured nothing from openSettings, so the signature is
 * unchanged from the nested version.
 */
import type { FrenchCoreImportSnapshot } from '../../../application/settings/types';

export async function confirmCuratedReimport(snapshot: FrenchCoreImportSnapshot): Promise<boolean> {
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
