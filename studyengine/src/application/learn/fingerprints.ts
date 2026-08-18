/**
 * Application layer (L2): plan fingerprints.
 * Split verbatim from src/learn-mode.ts in Phase V2a (2026-08-18).
 */
import type { CourseContext, StudyItem } from '../../types';

function shortDjb2Hash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(-8);
}

export function fingerprintLearnInputs(args: {
  cardIds: string[];
  cardFingerprint?: string;
  courseContext?: CourseContext;
}): string {
  const cardIds = Array.isArray(args.cardIds)
    ? args.cardIds.map((id) => String(id || ''))
    : [];
  const cardHash = args.cardFingerprint
    ? String(args.cardFingerprint)
    : shortDjb2Hash(cardIds.join('|'));
  if (!args.courseContext) return cardHash;
  const contextHash = shortDjb2Hash(JSON.stringify(args.courseContext));
  return `${cardHash}:${contextHash}`;
}

export function fingerprintSubDeckCards(cards: StudyItem[]): string {
  const fingerprintInput = (cards || [])
    .slice()
    .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
    .map((card) => `${String(card?.id || '')}|${String(card?.prompt || '').trim()}|${String(card?.modelAnswer || '').trim()}`)
    .join('\n');
  return shortDjb2Hash(fingerprintInput);
}
