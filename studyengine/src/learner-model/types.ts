import type { IngestSource } from '../ingest/types';
import type { PlanProfile } from '../types';

export type LearnCheckType = 'elaborative' | 'predictive' | 'self_explain' | 'prior_knowledge_probe' | 'worked_example' | 'transfer_question' | 'cloze';
export type CheckTypeStrength = number;

export interface ProfileSuccessRates {
  sessions: number;
  deepRate: number;
  partialRate: number;
  surfaceRate: number;
}

export interface LearnerModel {
  version: 1;
  updatedAt: string;
  sessionCount: number;
  checkTypeStrengths: Record<LearnCheckType, CheckTypeStrength>;
  profileSuccess: Partial<Record<PlanProfile, ProfileSuccessRates>>;
  calibration: {
    overconfidenceBias: number;
    sampleSize: number;
  };
  consolidationHalfLifeDays: number | null;
  sourceTypeLapseRate: Partial<Record<IngestSource['type'] | 'manual', number>>;
  recommendedSegmentMix: Record<LearnCheckType, number>;
}
