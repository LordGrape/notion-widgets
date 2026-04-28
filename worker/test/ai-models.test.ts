import { describe, expect, it } from 'vitest';
import {
  GEMINI_2_5_FLASH,
  GEMINI_2_5_FLASH_LITE,
  resolveLearnTurnModel,
  resolveUtilityModel
} from '../src/ai-models';
import type { Env } from '../src/types';

function env(extra: Partial<Env> = {}): Env {
  return {
    WIDGET_KV: {} as KVNamespace,
    WIDGET_SECRET: 'secret',
    GEMINI_API_KEY: 'key',
    GOOGLE_TTS_KEY: 'tts',
    ...extra
  };
}

describe('ai model routing', () => {
  it('defaults utility routes to Flash-Lite', () => {
    expect(resolveUtilityModel(env())).toBe(GEMINI_2_5_FLASH_LITE);
  });

  it('allows utility routes to be promoted back to Flash', () => {
    expect(resolveUtilityModel(env({ GEMINI_UTILITY_MODEL: GEMINI_2_5_FLASH }))).toBe(GEMINI_2_5_FLASH);
  });

  it('keeps Learn Turn on Flash unless explicitly testing Flash-Lite', () => {
    expect(resolveLearnTurnModel(env())).toBe(GEMINI_2_5_FLASH);
    expect(resolveLearnTurnModel(env({ LEARN_TURN_MODEL: GEMINI_2_5_FLASH_LITE }))).toBe(GEMINI_2_5_FLASH_LITE);
  });
});
