/**
 * Application layer (L2): Settings module types.
 * Split verbatim from src/settings.ts in Phase V2b (2026-08-18).
 * Type-only module: no runtime impact.
 */
import type { AppState, Settings } from '../../types';

export type ElFn = <T extends HTMLElement = HTMLElement>(id: string) => T;

export type SettingsModuleContext = {
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

export type CuratedDeckEntry =
  | { id: string; label: string; source: 'static'; dataPath: string; courseHint?: string }
  | { id: string; label: string; source: 'worker'; workerEndpoint: string; courseHint?: string };

export type FrenchCoreImportSnapshot = {
  activeCount: number;
  archivedCount: number;
  totalCount: number;
};

export type WorkerBuildStatus = {
  lexique3?: { ready?: boolean; count?: number; sha256?: string };
  // L1b-β: deterministic Wiktionary cache stage sits before LLM fallback.
  wiktionary?: { ready?: boolean; count?: number };
  tatoeba?: { ready?: boolean; lemmasWithExamples?: number };
  glosses?: {
    totalGlossed?: number;
    totalLemmas?: number;
    cumulativeTokens?: number;
    budgetState?: string;
  };
  assembled?: { ready?: boolean; lemmaCount?: number; generatedAt?: string };
};

export type WorkerGlossResponse = {
  status?: string;
};

export type WorkerDeckPayload = {
  cards?: unknown[];
};
