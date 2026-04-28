import { describe, expect, it } from 'vitest';
import { parseLlmJson } from '../src/llm/parse';

describe('parseLlmJson', () => {
  it('parses clean JSON', () => {
    const parsed = parseLlmJson('{"insight":"ok","score":1}') as Record<string, unknown>;
    expect(parsed.insight).toBe('ok');
    expect(parsed.score).toBe(1);
  });

  it('parses fenced JSON', () => {
    const parsed = parseLlmJson('```json\n{"insight":"ok"}\n```') as Record<string, unknown>;
    expect(parsed.insight).toBe('ok');
  });

  it('parses trailing prose after closing brace', () => {
    const parsed = parseLlmJson('{"insight":"ok"}\nExtra notes.') as Record<string, unknown>;
    expect(parsed.insight).toBe('ok');
  });

  it('parses leading prose before object', () => {
    const parsed = parseLlmJson('Here you go:\n{"insight":"ok"}') as Record<string, unknown>;
    expect(parsed.insight).toBe('ok');
  });

  it('repairs unescaped internal double quotes in value', () => {
    const raw = '{"insight":"Think of "tu" as informal you","followUp":"ok"}';
    const parsed = parseLlmJson(raw) as Record<string, unknown>;
    expect(parsed.insight).toBe('Think of "tu" as informal you');
    expect(parsed.followUp).toBe('ok');
  });

  it('keeps single quotes inside value untouched', () => {
    const parsed = parseLlmJson(`{"insight":"It's valid JSON as-is"}`) as Record<string, unknown>;
    expect(parsed.insight).toBe("It's valid JSON as-is");
  });
});
