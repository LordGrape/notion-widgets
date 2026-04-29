import { describe, expect, it } from 'vitest';
import { buildLearnTurnGenerationConfigForTest } from '../src/routes/learn-turn';

describe('learn-turn generation config', () => {
  it('disables Gemini thinking so JSON grading output is not truncated by hidden thought tokens', () => {
    const config = buildLearnTurnGenerationConfigForTest(1024);
    expect(config.maxOutputTokens).toBe(1024);
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(config.responseMimeType).toBe('application/json');
  });
});
