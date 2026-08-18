/**
 * Shared: promise timeout wrapper (small utility, module map section 2.3).
 * Split verbatim from src/settings.ts in Phase V2b (2026-08-18).
 */

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then((value) => {
      window.clearTimeout(id);
      resolve(value);
    }).catch((err) => {
      window.clearTimeout(id);
      reject(err);
    });
  });
}
