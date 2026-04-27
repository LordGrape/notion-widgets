export type SummarySection =
  | 'key-concepts'
  | 'important-arguments'
  | 'exam-ready-facts'
  | 'essay-hooks'
  | 'key-quotes'
  | 'memory-anchor';

export type IngestSource =
  | { type: 'manual' }
  | { type: 'qec'; originDocUrl?: string; sourceBlockId?: string; lectureAttended: boolean }
  | {
      type: 'notion-ai-summary';
      originDocUrl?: string;
      summaryBlockId?: string;
      sourceSection: SummarySection;
      lectureAttended: false;
    }
  | { type: 'lecture-paste-freeform'; originDocUrl?: string; lectureAttended: boolean };

export interface DraftCard {
  id: string;
  prompt: string;
  modelAnswer: string;
  groundingSnippets?: string[];
  source: IngestSource;
  suggestedSubDeckId?: string;
  warnings?: string[];
}

export interface ParseWarning {
  severity: 'info' | 'warn';
  message: string;
  sourceLine?: number;
}

export interface IngestBatch {
  drafts: DraftCard[];
  warnings: ParseWarning[];
  summary: {
    qecCount: number;
    summaryCount: number;
    skipped: number;
  };
}

export function createDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const raw = `${Date.now()}-${Math.random()}-${Math.random()}`;
  return raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
}

export function getCardEncodingDefault(card: { source?: IngestSource }): 'rapid-consolidation' | 'full-learn' {
  const source = card.source;
  if (!source || source.type === 'manual') return 'full-learn';
  if (source.type === 'qec') return source.lectureAttended ? 'rapid-consolidation' : 'full-learn';
  if (source.type === 'notion-ai-summary') return 'full-learn';
  if (source.type === 'lecture-paste-freeform') return source.lectureAttended ? 'rapid-consolidation' : 'full-learn';
  return 'full-learn';
}
