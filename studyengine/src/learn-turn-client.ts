/**
 * Typed client for POST /studyengine/learn-turn.
 *
 * Responsibilities:
 *   - Gate `response.json()` on `response.ok`. On non-OK, read the body as
 *     text first and surface a readable message.
 *   - Wrap `JSON.parse` in try/catch; on parse failure, console.warn the raw
 *     body preview and surface the same readable message.
 *   - Branch on the worker's `{ ok: false, errorCode, message }` envelope so
 *     transient `upstream_failed` states show the retry-oriented copy while
 *     unknown / schema / internal codes fall through to the generic message.
 *
 * Kept pure (no DOM, no globals). `studyengine.html`'s `submitLearnTurn` wraps
 * this via `__studyEngineLearnMode.runLearnTurn`, which re-exports it.
 */

import type {
  LearnTurnEnvelope,
  LearnTurnErrorCode,
  LearnTurnSuccessEnvelope
} from './types';
import type { LearnSessionState, LearnTurnResult } from './learn-mode';

const LEARN_TURN_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/learn-turn';

/**
 * User-facing copy. Kept short so the banner never overflows the Learn modal's
 * 820px focal surface and remains legible at the 375px mobile floor.
 */
const USER_MESSAGE_TRANSIENT = 'The Learn Mode service is temporarily unavailable. Please retry.';
const USER_MESSAGE_GENERIC = 'Learn Mode could not grade that turn. Please retry.';

/**
 * Error thrown by `runLearnTurn` on any failure path. Carries a stable
 * `errorCode` so `submitLearnTurn` can branch if future UI wants to
 * distinguish transient vs. schema vs. unknown without regex-matching
 * `message`.
 */
export class LearnTurnClientError extends Error {
  public readonly errorCode: LearnTurnErrorCode | 'network_error' | 'unknown';
  constructor(message: string, errorCode: LearnTurnErrorCode | 'network_error' | 'unknown') {
    super(message);
    this.name = 'LearnTurnClientError';
    this.errorCode = errorCode;
  }
}

function isEnvelope(value: unknown): value is LearnTurnEnvelope {
  if (!value || typeof value !== 'object') return false;
  const ok = (value as { ok?: unknown }).ok;
  if (ok === true) return typeof (value as { feedback?: unknown }).feedback === 'string';
  if (ok === false) {
    const code = (value as { errorCode?: unknown }).errorCode;
    return code === 'upstream_failed' || code === 'schema_invalid' || code === 'internal_error';
  }
  return false;
}

/**
 * Legacy-shape detector: the worker used to return the raw graded payload
 * (verdict/feedback/...) without an `ok` field. Treat that as a success
 * envelope for backwards compatibility with any cached deployment still
 * running the pre-envelope build during the rollout window.
 */
function looksLikeLegacySuccess(value: unknown): value is Omit<LearnTurnSuccessEnvelope, 'ok'> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.feedback === 'string' &&
    typeof v.verdict === 'string' &&
    typeof v.advance === 'boolean'
  );
}

function messageForErrorCode(code: LearnTurnErrorCode, serverMessage: string): string {
  if (code === 'upstream_failed') return serverMessage || USER_MESSAGE_TRANSIENT;
  // schema_invalid / internal_error: prefer our generic message over any
  // technical detail the server may have attached; log preserves the raw.
  return USER_MESSAGE_GENERIC;
}

function envelopeToResult(envelope: LearnTurnSuccessEnvelope): LearnTurnResult {
  const followUpRaw = envelope.followUp;
  const followUpStr = followUpRaw == null ? '' : String(followUpRaw);
  return {
    verdict: envelope.verdict,
    understandingScore: envelope.understandingScore,
    missingConcepts: Array.isArray(envelope.missingConcepts) ? envelope.missingConcepts.slice() : [],
    followUp: followUpRaw ?? null,
    advance: !!envelope.advance,
    feedback: envelope.feedback,
    nextPrompt: followUpStr,
    isSegmentComplete: !!envelope.advance
  };
}

/**
 * POST a Learn-mode turn and resolve with a normalised `LearnTurnResult`, or
 * throw `LearnTurnClientError` with a user-readable message.
 *
 * Signature-compatible with the previous inline `runLearnTurn` in
 * `learn-mode.ts` so `__studyEngineLearnMode.runLearnTurn` callers in
 * `studyengine.html` are unaffected.
 */
export async function runLearnTurn(
  session: LearnSessionState,
  userInput: string,
  userName = '',
  opts: { segmentLimit?: 1 } = {}
): Promise<LearnTurnResult> {
  const segment = session.plan.segments[session.index];
  if (!segment) throw new LearnTurnClientError('No active learn segment.', 'unknown');

  let response: Response;
  try {
    response = await fetch(LEARN_TURN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mechanism: segment.mechanism,
        segment,
        userInput,
        userName,
        ...(opts.segmentLimit === 1 ? { segmentLimit: 1 } : {})
      })
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn('[learn-turn] network error', detail);
    throw new LearnTurnClientError(USER_MESSAGE_TRANSIENT, 'network_error');
  }

  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn('[learn-turn] response.text() failed', detail);
    throw new LearnTurnClientError(USER_MESSAGE_TRANSIENT, 'network_error');
  }

  // Gate JSON parsing on r.ok AND on being able to parse at all.
  if (!response.ok) {
    console.warn('[learn-turn] non-OK response', response.status, bodyText.slice(0, 400));
    throw new LearnTurnClientError(USER_MESSAGE_TRANSIENT, 'upstream_failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn('[learn-turn] JSON.parse failed', detail, 'rawPreview=', bodyText.slice(0, 400));
    throw new LearnTurnClientError(USER_MESSAGE_GENERIC, 'schema_invalid');
  }

  if (isEnvelope(parsed)) {
    if (parsed.ok) return envelopeToResult(parsed);
    const userMsg = messageForErrorCode(parsed.errorCode, parsed.message || '');
    console.warn('[learn-turn] server failure envelope', parsed.errorCode, parsed.message);
    throw new LearnTurnClientError(userMsg, parsed.errorCode);
  }

  // Backwards-compat: pre-envelope deployment still returning raw payload.
  if (looksLikeLegacySuccess(parsed)) {
    return envelopeToResult({ ok: true, ...parsed });
  }

  console.warn('[learn-turn] unexpected response shape', bodyText.slice(0, 400));
  throw new LearnTurnClientError(USER_MESSAGE_GENERIC, 'unknown');
}
