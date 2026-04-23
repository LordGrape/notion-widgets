import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearnTurnClientError, runLearnTurn } from './learn-turn-client';
import type { LearnSessionState } from './learn-mode';

function mockSession(): LearnSessionState {
  return {
    plan: {
      segments: [
        {
          id: 'seg1',
          title: 'Seg',
          mechanism: 'worked_example',
          objective: 'obj',
          teach: 'teach block text here for the segment.',
          tutorPrompt: 'prompt',
          expectedAnswer: 'answer',
          linkedCardIds: ['c1'],
          groundingSnippets: [{ cardId: 'c1', quote: 'q' }]
        }
      ]
    },
    index: 0,
    currentMechanism: 'worked_example',
    completedSegmentIds: []
  };
}

function mockFetch(body: unknown, init?: { ok?: boolean; status?: number; bodyAsString?: string }): void {
  const { ok = true, status = 200, bodyAsString } = init || {};
  const text = bodyAsString !== undefined ? bodyAsString : JSON.stringify(body);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status,
    text: async () => text
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runLearnTurn', () => {
  it('returns a LearnTurnResult on a successful envelope response', async () => {
    mockFetch({
      ok: true,
      verdict: 'partial',
      understandingScore: 65,
      copyRatio: 0.3,
      missingConcepts: ['framework'],
      feedback: 'Nice connection to cause.',
      followUp: 'What about the mechanism?',
      advance: false
    });
    const res = await runLearnTurn(mockSession(), 'my answer');
    expect(res.verdict).toBe('partial');
    expect(res.feedback).toBe('Nice connection to cause.');
    expect(res.isSegmentComplete).toBe(false);
    expect(res.nextPrompt).toBe('What about the mechanism?');
    expect(res.missingConcepts).toEqual(['framework']);
  });

  it('throws user-friendly LearnTurnClientError on upstream_failed envelope', async () => {
    mockFetch({
      ok: false,
      errorCode: 'upstream_failed',
      message: 'upstream 502'
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(runLearnTurn(mockSession(), 'answer')).rejects.toMatchObject({
      name: 'LearnTurnClientError',
      errorCode: 'upstream_failed'
    });
    expect(warn).toHaveBeenCalled();
  });

  it('throws generic error and does not leak raw body on schema_invalid envelope', async () => {
    mockFetch({ ok: false, errorCode: 'schema_invalid', message: 'raw parser detail' });
    try {
      await runLearnTurn(mockSession(), 'answer');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LearnTurnClientError);
      const e = err as LearnTurnClientError;
      expect(e.errorCode).toBe('schema_invalid');
      // Generic user-facing copy, not the raw server detail.
      expect(e.message).not.toContain('raw parser detail');
    }
  });

  it('console.warns the raw body and surfaces a readable error when JSON.parse fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch(null, { bodyAsString: 'not-json-at-all' });
    await expect(runLearnTurn(mockSession(), 'answer')).rejects.toBeInstanceOf(LearnTurnClientError);
    const calls = warn.mock.calls.flat().map(String).join(' ');
    expect(calls).toContain('not-json-at-all');
  });

  it('surfaces a transient message (not the raw body) when r.ok is false', async () => {
    mockFetch(null, { ok: false, status: 502, bodyAsString: '{"error":"learn_turn_parse_failed"}' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await runLearnTurn(mockSession(), 'answer');
      expect.unreachable();
    } catch (err) {
      const e = err as LearnTurnClientError;
      // This is the exact regression: user must NOT see the raw JSON.
      expect(e.message).not.toContain('learn_turn_parse_failed');
      expect(e.message).toMatch(/temporarily unavailable|retry/i);
      expect(e.errorCode).toBe('upstream_failed');
    }
  });

  it('accepts legacy non-envelope success bodies for rollout compatibility', async () => {
    mockFetch({
      verdict: 'deep',
      understandingScore: 90,
      copyRatio: 0.1,
      missingConcepts: [],
      feedback: 'Legacy shape.',
      followUp: null,
      advance: true
    });
    const res = await runLearnTurn(mockSession(), 'answer');
    expect(res.verdict).toBe('deep');
    expect(res.isSegmentComplete).toBe(true);
  });

  it('wraps network throws in a transient-user-facing error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net down'); }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(runLearnTurn(mockSession(), 'answer')).rejects.toMatchObject({
      errorCode: 'network_error'
    });
  });
});
