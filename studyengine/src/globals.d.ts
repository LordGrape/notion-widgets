import type {
  AppState,
  CalibrationData,
  Course,
  FSRSState,
  SessionState,
  Settings,
  StudyItem,
  TierId,
} from './types';

declare function el(id: string): HTMLElement | null;

declare function scheduleFsrs(
  item: StudyItem,
  rating: 1 | 2 | 3 | 4,
  nowTs: number,
  allowWrite: boolean,
): { intervalDays: number; retr: number };

declare function scheduleFSRS(
  item: StudyItem,
  rating: 1 | 2 | 3 | 4,
  nowTs: number,
  allowWrite: boolean,
): { intervalDays: number; retr: number };

declare function countDue(
  itemsById: Record<string, StudyItem>,
  course?: string,
  topic?: string,
): { total: number; byTier: Record<TierId, number> } | number;

declare function avgRetention(itemsById: Record<string, StudyItem>): number | null;

declare const SyncEngine: {
  get(ns: string, key?: string): unknown;
  set(ns: string, data: unknown, value?: unknown): Promise<void> | void;
  init(): Promise<void>;
  flush(): Promise<void>;
};

declare const Core: {
  isDark?: boolean;
  isLowEnd?: boolean;
  audio: {
    play(...args: unknown[]): void;
    stop(): void;
  };
  background: {
    init(): void;
  };
  confetti: {
    launch(): void;
  };
  dragon: Record<string, unknown>;
  a11y: Record<string, unknown>;
  tooltip: Record<string, unknown>;
  perf: Record<string, unknown>;
};

declare const gsap: any;
declare const ScrollTrigger: any;
declare const SplitText:
  | (new (target: Element, options?: { type?: string; charsClass?: string }) => {
      chars: Element[];
      revert?: () => void;
    })
  | undefined;

declare const marked: { parse(md: string): string };
declare const DOMPurify: { sanitize(html: string): string };
declare const mermaid: {
  run(config?: unknown): Promise<void>;
  initialize(config: unknown): void;
};

declare function renderDashboard(): void;
declare function startSession(): void;
declare function rateCurrent(rating: 1 | 2 | 3 | 4): void;
declare function completeSession(): void;
declare function showView(nextId: string): void;
declare function openSettings(): void;
declare function closeSettings(): void;
declare function renderSettings(): void;
declare function switchTab(tabId: string): void;
declare function switchTopic(topic: string): void;
declare function switchCourse(course: string): void;
declare function openEditCourse(name: string): void;
declare function openEditCourseTab(name: string, tab: string): void;
declare function startDeleteCourse(name: string): void;
declare function confirmDeleteCourseNow(name: string): void;
declare function editCard(id: string): void;
declare function deleteCard(itemId: string, courseName?: string): void;
declare function viewCourseDeck(name: string): void;
declare function renderCurrentItem(): void;
declare function toast(message: string): void;

declare global {
  interface Window {
    state: AppState;
    settings: Settings;
    session: SessionState | null;

    openEditCourseTab: (name: string, tab: string) => void;
    openEditCourse: (name: string) => void;
    startDeleteCourse: (name: string) => void;
    confirmDeleteCourseNow: (name: string) => void;
    editCard: (id: string) => void;
    viewCourseDeck: (name: string) => void;
    deleteCard: (itemId: string, courseName?: string) => void;

    scheduleFSRS?: typeof scheduleFSRS;
    scheduleFsrs?: typeof scheduleFsrs;
    renderDashboard?: typeof renderDashboard;
    startSession?: typeof startSession;
    rateCurrent?: typeof rateCurrent;
    completeSession?: typeof completeSession;
    openSettings?: typeof openSettings;
    closeSettings?: typeof closeSettings;

    courses?: Record<string, Course>;
    calibration?: CalibrationData;
    fsrsState?: FSRSState;
    SplitText?: typeof SplitText;
    gsap?: {
      to: (...args: unknown[]) => unknown;
      fromTo: (...args: unknown[]) => unknown;
      timeline: (...args: unknown[]) => { fromTo: (...timelineArgs: unknown[]) => unknown };
    };
  }
}

export {};
