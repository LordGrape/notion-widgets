import type { StudyItem } from './types';

export interface CoverageRatio {
  consolidated: number;
  total: number;
  percent: number;
}

export function computeCoverageRatio(items: StudyItem[]): CoverageRatio {
  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.length;
  const consolidated = safeItems.filter((item) => item?.learnStatus === 'consolidated').length;
  const percent = total > 0 ? Math.round((consolidated / total) * 100) : 0;
  return { consolidated, total, percent };
}
