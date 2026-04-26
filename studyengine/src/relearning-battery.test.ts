import { describe, expect, it } from 'vitest';
import { getNextBurstTs, recordBurstCompletion, reconcileMissedBursts, startRelearningBattery } from './relearning-battery';

const DAY = 24 * 60 * 60 * 1000;

describe('relearning battery', () => {
  it('starts with +1d/+3d/+7d bursts', () => {
    const item: any = {};
    const now = Date.UTC(2026, 0, 1);
    startRelearningBattery(item, now);
    expect(item.relearningBattery.plannedBursts).toEqual([now + DAY, now + 3 * DAY, now + 7 * DAY]);
    expect(item.relearningBattery.completedBursts).toEqual([]);
  });

  it('returns next burst timestamp and null when complete', () => {
    const item: any = {};
    const now = Date.UTC(2026, 0, 1);
    startRelearningBattery(item, now);
    expect(getNextBurstTs(item, now)).toBe(now + DAY);
    recordBurstCompletion(item, true, now + DAY);
    expect(getNextBurstTs(item, now + DAY)).toBe(now + 3 * DAY);
    recordBurstCompletion(item, true, now + 3 * DAY);
    recordBurstCompletion(item, true, now + 7 * DAY);
    expect(getNextBurstTs(item, now + 8 * DAY)).toBeNull();
  });

  it('promotes on final successful burst', () => {
    const item: any = { lifecycleStage: 'relearning', learnStatus: 'taught' };
    const now = Date.UTC(2026, 0, 1);
    startRelearningBattery(item, now);
    recordBurstCompletion(item, true, now + DAY);
    recordBurstCompletion(item, true, now + 3 * DAY);
    recordBurstCompletion(item, true, now + 7 * DAY);
    expect(item.lifecycleStage).toBe('consolidating');
    expect(item.learnStatus).toBe('consolidated');
    expect(item.relearningBattery).toBeUndefined();
  });

  it('reconciles missed bursts by shifting remaining schedule forward', () => {
    const item: any = {};
    const now = Date.UTC(2026, 0, 1);
    startRelearningBattery(item, now);
    const original = item.relearningBattery.plannedBursts.slice();
    const lateNow = original[0] + 3 * DAY;
    reconcileMissedBursts(item, lateNow);
    const shifted = item.relearningBattery.plannedBursts;
    expect(shifted[0] - original[0]).toBe(3 * DAY);
    expect(shifted[1] - shifted[0]).toBe(original[1] - original[0]);
    expect(shifted[2] - shifted[1]).toBe(original[2] - original[1]);
  });
});
