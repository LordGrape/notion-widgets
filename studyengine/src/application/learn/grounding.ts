/**
 * Application layer (L2): plan grounding verification.
 * Split verbatim from src/learn-mode.ts in Phase V2a (2026-08-18).
 */
import type { StudyItem } from '../../types';
import type { ConsolidationQuestion, LearnSegment } from './types';

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const LEARN_GATE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'by', 'from',
  'at', 'into', 'about', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
  'what', 'when', 'where', 'who', 'why', 'how', 'which'
]);

function tokenizeForLearnGate(input: string): string[] {
  return normalize(input)
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !LEARN_GATE_STOPWORDS.has(token));
}

function computeTokenOverlapRatio(sourceText: string, targetText: string): number {
  const sourceTokens = Array.from(new Set(tokenizeForLearnGate(sourceText)));
  const targetTokens = Array.from(new Set(tokenizeForLearnGate(targetText)));
  if (sourceTokens.length === 0) return 1;
  const targetSet = new Set(targetTokens);
  const overlapCount = sourceTokens.filter((token) => targetSet.has(token)).length;
  return overlapCount / sourceTokens.length;
}

export function verifyConsolidationQuestions(questions: ConsolidationQuestion[], items: StudyItem[]): ConsolidationQuestion[] {
  const cardMap = new Map<string, string>();
  (items || []).forEach((item) => {
    if (!item || !item.id) return;
    cardMap.set(item.id, `${item.prompt || ''}\n${item.modelAnswer || ''}`);
  });
  return (questions || []).filter((q) => {
    if (!q || !q.question || !q.answer) return false;
    const linked = Array.isArray(q.linkedCardIds) ? q.linkedCardIds : [];
    if (linked.length === 0) return false;
    const ans = normalize(q.answer);
    if (!ans || ans.length < 10) return false;
    const anchor = ans.length > 200 ? ans.slice(0, 200) : ans;
    return linked.some((cardId) => {
      const source = cardMap.get(String(cardId || ''));
      if (!source) return false;
      return normalize(source).includes(anchor);
    });
  });
}

export function substringVerified(segments: LearnSegment[], items: StudyItem[]): LearnSegment[] {
  const cardMap = new Map<string, string>();
  (items || []).forEach((item) => {
    if (!item || !item.id) return;
    cardMap.set(item.id, `${item.prompt || ''}\n${item.modelAnswer || ''}`);
  });

  return (segments || []).filter((segment) => {
    if (!Array.isArray(segment.groundingSnippets) || segment.groundingSnippets.length === 0) return false;
    return segment.groundingSnippets.every((snippet) => {
      const source = cardMap.get(String(snippet.cardId || ''));
      if (!source) return false;
      const quote = normalize(snippet.quote || '');
      if (!quote || quote.length < 10) return false;
      if (normalize(source).includes(quote)) return true;
      const teachRatio = computeTokenOverlapRatio(source, String(segment.teach || ''));
      const tutorRatio = computeTokenOverlapRatio(source, String(segment.tutorPrompt || ''));
      return teachRatio >= 0.4 && tutorRatio >= 0.15;
    });
  });
}
