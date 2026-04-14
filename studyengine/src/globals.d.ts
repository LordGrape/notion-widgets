// core.js globals (loaded via <script> tag before Vite bundle)
declare const SyncEngine: {
  init(config: { worker: string; namespaces: string[] }): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): void;
  flush(): Promise<void>;
  _key?: string;
  key?: string;
  passphrase?: string;
};

declare const Core: {
  isDark: boolean;
  isLowEnd: boolean;
  audio: {
    click(): void;
    chime(): void;
    [key: string]: (() => void) | undefined;
  };
  background: {
    init(canvas: string, options: Record<string, unknown>): void;
  };
  confetti: {
    launch(options?: Record<string, unknown>): void;
  };
  dragon: Record<string, unknown>;
  a11y: {
    trap(element: HTMLElement): void;
    release(): void;
  };
  tooltip: Record<string, unknown>;
  perf: Record<string, unknown>;
  gsapReady: Promise<typeof gsap | null>;
};

declare function initBackground(canvasId: string, options: Record<string, unknown>): void;
declare function playClick(): void;
declare function playChime(): void;
declare function playBreakAppear(): void;
declare function playOpen(): void;
declare function playClose(): void;
declare function playError(): void;
declare function playPresetSelect(): void;
declare function launchConfetti(options?: Record<string, unknown>): void;

declare const gsap: {
  to(target: unknown, vars: Record<string, unknown>): unknown;
  fromTo(target: unknown, fromVars: Record<string, unknown>, toVars: Record<string, unknown>): unknown;
  set(target: unknown, vars: Record<string, unknown>): unknown;
  killTweensOf(target: unknown): void;
};

// marked.js and DOMPurify globals
declare const marked: {
  parse(text: string, options?: { breaks?: boolean; gfm?: boolean }): string;
};

declare const DOMPurify: {
  sanitize(html: string, config?: {
    ALLOWED_TAGS?: string[];
    ALLOWED_ATTR?: string[];
    ADD_ATTR?: string[];
  }): string;
};

// mermaid.js global
declare const mermaid: {
  render(id: string, code: string): Promise<{ svg: string }>;
};

// Window extensions
declare global {
  interface Window {
    WIDGET_KEY?: string;
    editCard?: (itemId: string) => void;
  }
}

// Worker endpoints
declare const TUTOR_ENDPOINT: string;
declare const LECTURE_CTX_ENDPOINT: string;
declare const PRIME_WORKER_URL: string;
declare const VISUAL_WORKER_URL: string;
declare const TTS_WORKER_URL: string;

// FSRS-6 constants
declare const FSRS6_DEFAULT_DECAY: number;

// Tier profiles
declare const TIER_PROFILES: Record<string, { quickfire: number; explain: number; apply: number; distinguish: number; mock: number; worked: number }>;
declare const BLOOM_STABILITY_BONUS: Record<string, number>;
declare const CRAM_TIER_MOD: Record<string, Partial<Record<string, number>>>;
declare const BREAK_TIPS: string[];

// Exam type labels
declare const EXAM_TYPE_LABELS: Record<string, string>;
