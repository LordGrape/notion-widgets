import type { StudyItem } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const BATTERY_INTERVALS_DAYS = [1, 3, 7] as const;

export function startRelearningBattery(item: StudyItem, nowTs: number): void {
  item.relearningBattery = {
    startedAt: nowTs,
    plannedBursts: BATTERY_INTERVALS_DAYS.map((days) => nowTs + days * DAY_MS),
    completedBursts: []
  };
}

export function getNextBurstTs(item: StudyItem, _nowTs: number): number | null {
  const battery = item.relearningBattery;
  if (!battery) return null;
  const idx = battery.completedBursts.length;
  return idx >= battery.plannedBursts.length ? null : battery.plannedBursts[idx];
}

export function recordBurstCompletion(item: StudyItem, success: boolean, nowTs: number): void {
  const battery = item.relearningBattery;
  if (!battery || !success) return;
  battery.completedBursts.push(nowTs);
  if (battery.completedBursts.length >= battery.plannedBursts.length) {
    item.lifecycleStage = 'consolidating';
    item.learnStatus = 'consolidated';
    delete item.relearningBattery;
  }
}

export function reconcileMissedBursts(item: StudyItem, nowTs: number): void {
  const battery = item.relearningBattery;
  if (!battery) return;
  const idx = battery.completedBursts.length;
  const nextTs = battery.plannedBursts[idx];
  if (!Number.isFinite(nextTs)) return;
  const lateness = nowTs - nextTs;
  if (lateness <= 2 * DAY_MS) return;
  for (let i = idx; i < battery.plannedBursts.length; i++) {
    battery.plannedBursts[i] += lateness;
  }
}
