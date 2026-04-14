/*
 * Global Type Declarations for Study Engine
 * Zero runtime changes - TypeScript declarations only
 */

// ============================================
// SyncEngine (from core.js)
// ============================================

declare const SyncEngine: {
  /** Initialize sync with worker URL and namespaces */
  init(opts: { worker?: string; namespaces?: string[] }): Promise<void>;
  
  /** Get value from namespace */
  get(namespace: string, key: string): unknown;
  
  /** Set value in namespace */
  set(namespace: string, key: string, value: unknown): void;
  
  /** Get all values from namespace */
  getAll(namespace: string): Record<string, unknown>;
  
  /** Push all dirty namespaces to remote */
  flush(): Promise<void>;
  
  /** Force pull from remote */
  pull(namespace: string): Promise<void>;
  
  /** Force push to remote */
  push(namespace: string): Promise<void>;
  
  /** Register callback for when sync is ready */
  onReady(callback: (engine: typeof SyncEngine) => void): void;
  
  /** Register callback for sync status changes */
  onSyncStatus(callback: (status: 'saving' | 'synced' | 'error') => void): void;
  
  /** Check online status */
  isOnline(): boolean;
  
  /** Fetch milestones from Notion bridge */
  fetchMilestones(dbId?: string): Promise<Array<{
    id: string;
    title: string;
    date: string;
    completed: boolean;
  }>>;
};

// ============================================
// Core.* namespace (from core.js)
// ============================================

declare const Core: {
  // Environment detection
  isDark: boolean;
  isLowEnd: boolean;
  reducedMotion: boolean;
  dpr: number;
  gsapReady: Promise<typeof gsap | null>;
  
  // Theme tokens
  orbAlpha: number;
  particleRGB: string;
  particleAlphaBase: number;
  confettiColors: string[];
  
  // Event system
  on(event: string, callback: (data: unknown) => void): void;
  off(event: string, callback: (data: unknown) => void): void;
  emit(event: string, data: unknown): void;
  
  // Plugin system
  register(name: string, plugin: unknown): unknown;
  getPlugin(name: string): unknown | null;
  
  // Performance monitoring
  perf: {
    getFPS(): number;
    isOverBudget(): boolean;
    onDrop(callback: (fps: number) => void): void;
  };
  
  // Theme utilities
  applyThemeTokens(): void;
  injectGlassStyles(): void;
};

// ============================================
// GSAP (loaded from CDN)
// ============================================

declare const gsap: {
  to(target: unknown, vars: Record<string, unknown>): unknown;
  fromTo(target: unknown, from: Record<string, unknown>, to: Record<string, unknown>): unknown;
  set(target: unknown, vars: Record<string, unknown>): void;
  killTweensOf(target: unknown): void;
  
  // Core plugins/methods
  registerPlugin(...plugins: unknown[]): void;
  
  // Timeline (simplified)
  timeline(vars?: Record<string, unknown>): {
    to(target: unknown, vars: Record<string, unknown>): unknown;
    fromTo(target: unknown, from: Record<string, unknown>, to: Record<string, unknown>): unknown;
    add(child: unknown, position?: string | number): unknown;
    play(): void;
    pause(): void;
  };
};

// ============================================
// Helper from HTML shell or utils.js
// ============================================

declare function el(id: string): HTMLElement | null;
declare function esc(str: string): string;
declare function uid(): string;
declare function isoNow(): string;
declare function fmtMMSS(seconds: number): string;
declare function clamp(n: number, min: number, max: number): number;
declare function daysBetween(a: number | Date, b: number | Date): number;
declare function tierLabel(tier: string): string;
declare function tierColour(tier: string): string;
declare function showView(viewId: string): void;
declare function toast(message: string): void;

// ============================================
// Chart.js (loaded from CDN)
// ============================================

declare const Chart: any;

// ============================================
// Mermaid (loaded from CDN)
// ============================================

declare const mermaid: {
  initialize(config: {
    startOnLoad?: boolean;
    theme?: 'dark' | 'default';
    themeVariables?: Record<string, unknown>;
    flowchart?: Record<string, unknown>;
    securityLevel?: 'loose' | 'strict';
  }): void;
  render(id: string, definition: string): Promise<{ svg: string }>;
};

// ============================================
// KaTeX (loaded from CDN)
// ============================================

declare const katex: {
  renderToString(tex: string, options?: {
    displayMode?: boolean;
    throwOnError?: boolean;
  }): string;
};

// ============================================
// pdf.js (loaded from CDN)
// ============================================

declare const pdfjsLib: {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument(src: string | Uint8Array | { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNum: number): Promise<{
        getTextContent(): Promise<{
          items: Array<{ str: string }>;
        }>;
      }>;
    }>;
  };
};

// ============================================
// marked.js (loaded from CDN)
// ============================================

declare const marked: {
  parse(markdown: string, options?: { breaks?: boolean }): string;
};

// ============================================
// DOMPurify (loaded from CDN)
// ============================================

declare const DOMPurify: {
  sanitize(dirty: string, config?: { ALLOWED_TAGS?: string[] }): string;
};

// ============================================
// ts-fsrs UMD (loaded from CDN)
// ============================================

declare const FSRS: {
  FSRS: new (params: {
    w: number[];
    request_retention: number;
    enable_fuzz: boolean;
  }) => unknown;
  generatorParameters(opts: {
    w: number[];
    request_retention: number;
    enable_fuzz: boolean;
  }): {
    w: number[];
    request_retention: number;
    enable_fuzz: boolean;
  };
  clipParameters(params: number[], clamp?: number, pad?: boolean): number[];
  checkParameters(params: number[]): number[];
  migrateParameters(params: number[]): number[];
};

// ============================================
// Audio functions from core.js
// ============================================

declare function playClick(): void;
declare function playOpen(): void;
declare function playClose(): void;
declare function playStart(): void;
declare function playPause(): void;
declare function playResume(): void;
declare function playReset(): void;
declare function playLap(): void;
declare function playModeSwitch(): void;
declare function playChime(): void;
declare function playBreakAppear(): void;
declare function playBreakDismiss(): void;

// ============================================
// Canvas/Background from core.js
// ============================================

declare function initBackground(canvasId: string, options: {
  orbCount?: number;
  particleCount?: number;
  orbRadius?: [number, number];
  hueRange?: [number, number];
  mouseTracking?: boolean;
}): void;

declare function launchConfetti(options?: {
  origin?: { x: number; y: number };
  colors?: string[];
  count?: number;
}): void;

// ============================================
// State-level globals (from state.js)
// ============================================

declare const state: {
  items: Record<string, import('./types').StudyItem>;
  courses: Record<string, import('./types').Course>;
  subDecks: Record<string, { subDecks: Record<string, import('./types').SubDeck> }>;
  learnProgress: Record<string, Record<string, import('./types').LearnProgress>>;
  learnSessions: import('./types').LearnSession[];
  calibration: import('./types').CalibrationData;
  stats: import('./types').Stats;
};

declare const settings: import('./types').Settings;

// Note: Session and Tutor are now TypeScript components (src/components/)
// No longer need global declarations for these

// ============================================
// External libraries (kept as globals)
// ============================================

declare const gsap: {
  to: (target: unknown, vars: Record<string, unknown>) => unknown;
  fromTo: (target: unknown, fromVars: Record<string, unknown>, toVars: Record<string, unknown>) => unknown;
  timeline: () => {
    to: (target: unknown, vars: Record<string, unknown>) => unknown;
  };
};

declare const Chart: {
  new (ctx: unknown, config: unknown): unknown;
};

declare const mermaid: {
  init: (config: unknown, nodes: unknown) => Promise<void>;
  run: (config: unknown) => Promise<string>;
};

declare const katex: {
  render: (tex: string, element: HTMLElement, options?: unknown) => void;
};

declare const pdfjsLib: {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string | Uint8Array) => {
    promise: Promise<{
      getPage: (num: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
      }>;
    }>;
  };
};

// ============================================
// Constants from state.js
// ============================================

declare const TIER_PROFILES: Record<string, import('./types').TierProfile>;
declare const CRAM_TIER_MOD: Record<string, import('./types').CramModifier>;
declare const BLOOM_STABILITY_BONUS: Record<string, number>;
declare const PRIORITY_LEVELS: string[];
declare const PRIORITY_LABELS: Record<string, string>;
declare const PRIORITY_COLORS: Record<string, string>;
declare const PRIORITY_WEIGHT: Record<string, number>;
declare const CRAM_PRIORITY_BOOST: Record<string, number>;
declare const COURSE_COLORS: Array<{ name: string; value: string }>;
declare const EXAM_TYPE_LABELS: Record<string, string>;
declare const DEFAULT_WEIGHTS: number[];
declare const FSRS6_DEFAULT_DECAY: number;

// ============================================
// Worker endpoints (from state.js)
// ============================================

declare const STUDYENGINE_WORKER_BASE: string;
declare const TUTOR_ENDPOINT: string;
declare const GRADE_ENDPOINT: string;
declare const MEMORY_ENDPOINT: string;
declare const PREPARE_ENDPOINT: string;
declare const SYLLABUS_ENDPOINT: string;
declare const LECTURE_CTX_ENDPOINT: string;
declare const LEARN_PLAN_ENDPOINT: string;
declare const LEARN_CHECK_ENDPOINT: string;
declare const TRIAGE_ENDPOINT: string;
