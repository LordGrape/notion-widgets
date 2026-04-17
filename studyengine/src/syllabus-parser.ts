import type { CourseContext, ParsedSyllabus } from './types';

interface ParseSyllabusFailurePayload {
  error?: string;
  finishReason?: string;
  rawPreview?: string;
}

export class SyllabusParseError extends Error {
  readonly status: number;
  readonly finishReason?: string;
  readonly rawPreview?: string;

  constructor(message: string, status: number, finishReason?: string, rawPreview?: string) {
    super(message);
    this.name = 'SyllabusParseError';
    this.status = status;
    this.finishReason = finishReason;
    this.rawPreview = rawPreview;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesNormalized(source: string, candidate: string): boolean {
  const sourceNorm = normalizeText(source);
  const candidateNorm = normalizeText(candidate);
  if (!candidateNorm) return false;
  return sourceNorm.includes(candidateNorm);
}

function cloneParsedSyllabus(parsed: ParsedSyllabus): ParsedSyllabus {
  return {
    ...parsed,
    assessmentFormat: parsed.assessmentFormat
      ? {
          ...parsed.assessmentFormat,
          weights: { ...(parsed.assessmentFormat.weights || {}) },
        }
      : undefined,
    allowedMaterials: parsed.allowedMaterials ? { ...parsed.allowedMaterials } : undefined,
    topicWeights: parsed.topicWeights
      ? parsed.topicWeights.map((entry) => ({
          ...entry,
          readings: entry.readings ? entry.readings.map((reading) => ({ ...reading })) : undefined,
        }))
      : undefined,
    professorValueHints: parsed.professorValueHints
      ? parsed.professorValueHints.map((entry) => ({ ...entry }))
      : undefined,
    scopeTerms: parsed.scopeTerms ? [...parsed.scopeTerms] : undefined,
    aiPolicy: parsed.aiPolicy ? { ...parsed.aiPolicy } : undefined,
    academicIntegrityHints: parsed.academicIntegrityHints ? [...parsed.academicIntegrityHints] : undefined,
    rubricHints: parsed.rubricHints ? parsed.rubricHints.map((entry) => ({ ...entry })) : undefined,
    bloomProfile: parsed.bloomProfile ? { ...parsed.bloomProfile } : undefined,
    textbooks: parsed.textbooks
      ? parsed.textbooks.map((entry) => ({
          ...entry,
          chapterMapping: entry.chapterMapping ? { ...entry.chapterMapping } : undefined,
        }))
      : undefined,
    supplementaryReadings: parsed.supplementaryReadings
      ? parsed.supplementaryReadings.map((entry) => ({ ...entry }))
      : undefined,
    confidence: { ...parsed.confidence },
  };
}

function getBodyPreview(raw: string): string {
  const trimmed = String(raw || '').trim();
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

type SyncEngineAuthShape = {
  _key?: unknown;
  key?: unknown;
  passphrase?: unknown;
};

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveWidgetKey(): string {
  const syncEngine = (globalThis as { SyncEngine?: SyncEngineAuthShape }).SyncEngine;
  const syncKey = nonEmptyString(syncEngine?._key) || nonEmptyString(syncEngine?.key) || nonEmptyString(syncEngine?.passphrase);
  if (syncKey) return syncKey;

  const envKey = nonEmptyString(import.meta.env.VITE_WIDGET_KEY);
  const globalEnvKey = nonEmptyString((globalThis as { __VITE_WIDGET_KEY__?: unknown }).__VITE_WIDGET_KEY__);
  return envKey || globalEnvKey;
}

export async function callParseSyllabus(syllabusText: string): Promise<ParsedSyllabus> {
  const widgetKey = resolveWidgetKey();
  if (!widgetKey) {
    throw new Error('Missing widget key — check VITE_WIDGET_KEY');
  }

  const response = await fetch('https://widget-sync.lordgrape-widgets.workers.dev/studyengine/parse-syllabus', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Key': widgetKey,
    },
    body: JSON.stringify({ syllabusText }),
  });

  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 502 && data && typeof data === 'object') {
      const failure = data as ParseSyllabusFailurePayload;
      if (failure.error === 'syllabus_parse_failed') {
        const finishReason = failure.finishReason || 'unknown';
        const rawPreview = failure.rawPreview || getBodyPreview(raw) || 'n/a';
        throw new SyllabusParseError(
          `Syllabus parse failed (finishReason: ${finishReason}, rawPreview: ${rawPreview})`,
          response.status,
          finishReason,
          rawPreview,
        );
      }
    }
    const preview = getBodyPreview(raw) || '[empty body]';
    throw new SyllabusParseError(`Parse request failed (${response.status}): ${preview}`, response.status);
  }

  if (!data || typeof data !== 'object') {
    throw new SyllabusParseError('Parse request failed (invalid JSON response)', response.status);
  }

  return data as ParsedSyllabus;
}

export function validateEvidenceQuotes(parsed: ParsedSyllabus, source: string): ParsedSyllabus {
  const cleaned = cloneParsedSyllabus(parsed);
  const normalizedSource = normalizeText(source);

  let droppedProfessor = 0;
  let droppedRubric = 0;
  let droppedIntegrity = 0;

  if (cleaned.professorValueHints && cleaned.professorValueHints.length) {
    const originalCount = cleaned.professorValueHints.length;
    cleaned.professorValueHints = cleaned.professorValueHints.filter((entry) => {
      return includesNormalized(normalizedSource, entry.evidence);
    });
    droppedProfessor = originalCount - cleaned.professorValueHints.length;
  }

  if (cleaned.rubricHints && cleaned.rubricHints.length) {
    const originalCount = cleaned.rubricHints.length;
    cleaned.rubricHints = cleaned.rubricHints.filter((entry) => {
      return includesNormalized(normalizedSource, entry.verbatim);
    });
    droppedRubric = originalCount - cleaned.rubricHints.length;
  }

  if (cleaned.aiPolicy && cleaned.aiPolicy.verbatimQuote) {
    if (!includesNormalized(normalizedSource, cleaned.aiPolicy.verbatimQuote)) {
      delete cleaned.aiPolicy.verbatimQuote;
      cleaned.confidence.aiPolicy = 'low';
    }
  }

  if (cleaned.academicIntegrityHints && cleaned.academicIntegrityHints.length) {
    const originalCount = cleaned.academicIntegrityHints.length;
    cleaned.academicIntegrityHints = cleaned.academicIntegrityHints.filter((hint) => {
      return includesNormalized(normalizedSource, hint);
    });
    droppedIntegrity = originalCount - cleaned.academicIntegrityHints.length;
  }

  if (droppedProfessor > 0 || droppedRubric > 0 || droppedIntegrity > 0) {
    console.warn(
      `[syllabus-parser] dropped ${droppedProfessor} professor value hints, ${droppedRubric} rubric hint, ${droppedIntegrity} integrity hints (unverifiable quotes)`,
    );
  }

  return cleaned;
}

export function computeSourceFingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(-8);
}

export function buildCourseContext(parsed: ParsedSyllabus, source: string, now: number): CourseContext {
  return {
    ...parsed,
    parsedAt: now,
    acceptedAt: now,
    sourceFingerprint: computeSourceFingerprint(source),
  };
}
