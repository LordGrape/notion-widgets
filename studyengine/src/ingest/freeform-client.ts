import { createDraftId } from './types'
import type { DraftCard, IngestBatch, ParseWarning } from './types'

const INGEST_EXTRACT_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/ingest-extract'
const CHUNK_CHAR_LIMIT = 12000
const PRO_BUDGET_DAILY_CAP = 5

type SyncEngineAuthShape = {
  _key?: unknown
  key?: unknown
  passphrase?: unknown
}

export interface ExtractedDraft {
  prompt: string
  modelAnswer: string
  sourceParagraphSnippet: string
  sourceLineRange: { start: number; end: number }
  confidence: 'high' | 'medium' | 'low'
}

interface IngestExtractResponse {
  drafts: ExtractedDraft[]
  warnings: Array<{ severity: 'info' | 'warn'; message: string }>
  chunksRemaining: number
  budgetState?: { proCallsRemainingToday?: number }
}

interface ProBudgetExhaustedResponse {
  error?: string
  resetAt?: string
}

interface ChunkPayload {
  markdown: string
  startLine: number
}

export interface ExtractFreeformDraftsArgs {
  markdown: string
  originDocUrl?: string
  lectureAttended: boolean
  subDeckId?: string
  courseId?: string
  onProgress?: (chunkIndex: number, chunkCount: number) => void
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveWidgetKey(): string {
  const syncEngine = (globalThis as { SyncEngine?: SyncEngineAuthShape }).SyncEngine
  const syncKey = nonEmptyString(syncEngine?._key) || nonEmptyString(syncEngine?.key) || nonEmptyString(syncEngine?.passphrase)
  if (syncKey) return syncKey

  const envKey = nonEmptyString((import.meta as { env?: { VITE_WIDGET_KEY?: unknown } }).env?.VITE_WIDGET_KEY)
  const globalEnvKey = nonEmptyString((globalThis as { __VITE_WIDGET_KEY__?: unknown }).__VITE_WIDGET_KEY__)
  return envKey || globalEnvKey
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const raw = `${Date.now()}-${Math.random()}-${Math.random()}`
  return raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 26)
}

function countLines(value: string): number {
  if (!value) return 1
  return value.split('\n').length
}

function splitFreeformChunks(markdown: string, maxChars = CHUNK_CHAR_LIMIT): ChunkPayload[] {
  const text = String(markdown || '').replace(/\r\n?/g, '\n')
  if (!text.trim()) return []

  const paragraphs = text.split(/\n\n/)
  const chunks: ChunkPayload[] = []
  let current = ''
  let currentStartLine = 1
  let cursorLine = 1

  const pushCurrent = () => {
    if (!current.trim()) return
    chunks.push({ markdown: current, startLine: currentStartLine })
    current = ''
  }

  paragraphs.forEach((paragraph, idx) => {
    const separator = idx === 0 ? '' : '\n\n'
    const candidate = current ? `${current}${separator}${paragraph}` : paragraph

    if (current && candidate.length > maxChars) {
      pushCurrent()
      currentStartLine = cursorLine
      current = paragraph
    } else if (!current && paragraph.length > maxChars) {
      let start = 0
      while (start < paragraph.length) {
        const slice = paragraph.slice(start, start + maxChars)
        chunks.push({ markdown: slice, startLine: cursorLine })
        cursorLine += countLines(slice)
        start += maxChars
      }
      current = ''
      currentStartLine = cursorLine
      return
    } else {
      current = candidate
    }

    cursorLine += countLines(paragraph)
    if (idx < paragraphs.length - 1) cursorLine += 1
  })

  pushCurrent()
  return chunks
}

function mapExtractedDraft(draft: ExtractedDraft, args: ExtractFreeformDraftsArgs, lineOffset: number): DraftCard {
  const start = Math.max(1, Math.floor(Number(draft.sourceLineRange?.start || 1))) + lineOffset
  const end = Math.max(start, Math.floor(Number(draft.sourceLineRange?.end || start))) + lineOffset
  return {
    id: createDraftId(),
    prompt: String(draft.prompt || '').trim(),
    modelAnswer: String(draft.modelAnswer || '').trim(),
    source: {
      type: 'lecture-paste-freeform',
      originDocUrl: args.originDocUrl,
      lectureAttended: !!args.lectureAttended,
    },
    groundingSnippets: [`L${start}-${end}: "${String(draft.sourceParagraphSnippet || '').trim()}"`],
    warnings: draft.confidence === 'low' ? ['low-confidence extraction — review carefully'] : [],
    suggestedSubDeckId: args.subDeckId,
  }
}

export async function extractFreeformDrafts(args: ExtractFreeformDraftsArgs): Promise<IngestBatch> {
  const markdown = String(args.markdown || '')
  const chunks = splitFreeformChunks(markdown)
  const warnings: ParseWarning[] = []
  const drafts: DraftCard[] = []

  if (!chunks.length) {
    return {
      drafts: [],
      warnings: [{ severity: 'warn', message: 'No lecture content detected.' }],
      summary: { qecCount: 0, summaryCount: 0, skipped: 0 },
    }
  }

  const widgetKey = resolveWidgetKey()

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    args.onProgress?.(index + 1, chunks.length)
    const response = await fetch(INGEST_EXTRACT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(widgetKey ? { 'X-Widget-Key': widgetKey } : {}),
      },
      body: JSON.stringify({
        markdown: chunk.markdown,
        originDocUrl: args.originDocUrl,
        lectureAttended: args.lectureAttended,
        subDeckId: args.subDeckId,
        courseId: args.courseId,
        chunkIndex: index,
        chunkCount: chunks.length,
        requestId: createRequestId(),
      }),
    })

    const rawText = await response.text()
    let parsed: IngestExtractResponse | ProBudgetExhaustedResponse | null = null
    try {
      parsed = rawText ? (JSON.parse(rawText) as IngestExtractResponse | ProBudgetExhaustedResponse) : null
    } catch {
      parsed = null
    }

    const budgetError = parsed && typeof parsed === 'object' && 'error' in parsed ? parsed as ProBudgetExhaustedResponse : null
    if (response.status === 429 && budgetError && budgetError.error === 'pro_budget_exhausted') {
      const chunksRemaining = Math.max(0, chunks.length - index)
      warnings.push({
        severity: 'warn',
        message: `Pro budget exhausted; stopped with ${chunksRemaining} chunk(s) remaining. Resets at ${String(budgetError.resetAt || 'UTC midnight')}.`,
      })
      break
    }

    if (!response.ok) {
      const preview = rawText.trim().slice(0, 300)
      throw new Error(`Free-form extraction failed (${response.status}): ${preview || '[empty response]'}`)
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as IngestExtractResponse).drafts)) {
      throw new Error('Free-form extraction failed: invalid response shape from ingest-extract endpoint.')
    }

    const payload = parsed as IngestExtractResponse
    const chunkLineOffset = Math.max(0, chunk.startLine - 1)
    payload.drafts.forEach((draft) => {
      drafts.push(mapExtractedDraft(draft, args, chunkLineOffset))
    })
    ;(payload.warnings || []).forEach((warning) => {
      warnings.push({ severity: warning.severity, message: warning.message })
    })
    if (payload.budgetState && Number.isFinite(Number(payload.budgetState.proCallsRemainingToday))) {
      warnings.push({
        severity: 'info',
        message: `Pro budget remaining today: ${Math.max(0, Number(payload.budgetState.proCallsRemainingToday))} of ${PRO_BUDGET_DAILY_CAP}.`,
      })
    }
  }

  return {
    drafts,
    warnings,
    summary: { qecCount: 0, summaryCount: drafts.length, skipped: 0 },
  }
}

export const __freeformClientInternals = {
  splitFreeformChunks,
  mapExtractedDraft,
}
