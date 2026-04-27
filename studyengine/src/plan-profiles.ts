import type { Course, PlanProfile, StudyItem, SubDeckMeta } from './types';

const DEFAULT_PROFILE: PlanProfile = 'theory';

function normalizeProfile(value: unknown): PlanProfile | null {
  if (value === 'theory' || value === 'factual' || value === 'procedural') return value;
  return null;
}

export function resolveCardPlanProfile(
  card: StudyItem,
  subDeck: SubDeckMeta | null,
  course: Course | null,
): PlanProfile {
  const cardProfile = normalizeProfile(card?.planProfile);
  if (cardProfile) return cardProfile;
  const subDeckProfile = normalizeProfile(subDeck?.planProfile);
  if (subDeckProfile) return subDeckProfile;
  const courseProfile = normalizeProfile(course?.planProfile);
  if (courseProfile) return courseProfile;
  return DEFAULT_PROFILE;
}

export function resolveSessionPlanProfile(
  cards: StudyItem[],
  subDeckLookup: (card: StudyItem) => SubDeckMeta | null,
  courseLookup: (card: StudyItem) => Course | null,
): PlanProfile {
  if (!Array.isArray(cards) || cards.length === 0) return DEFAULT_PROFILE;

  const tallies: Record<PlanProfile, number> = { theory: 0, factual: 0, procedural: 0 };
  cards.forEach((card) => {
    const resolved = resolveCardPlanProfile(card, subDeckLookup(card), courseLookup(card));
    tallies[resolved] += 1;
  });

  const order: PlanProfile[] = ['theory', 'factual', 'procedural'];
  return order.reduce((best, candidate) => (tallies[candidate] > tallies[best] ? candidate : best), order[0]);
}
