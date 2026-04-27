import { afterEach, describe, expect, it, vi } from 'vitest'
import { __freeformClientInternals, extractFreeformDrafts } from './freeform-client'

function makeParagraph(charCount: number, lineCount = 4): string {
  const lines: string[] = []
  const perLine = Math.max(10, Math.floor(charCount / lineCount))
  for (let i = 0; i < lineCount; i += 1) {
    const line = `line-${i + 1} ` + 'x'.repeat(Math.max(1, perLine - 7))
    lines.push(line)
  }
  return lines.join('\n')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('splitFreeformChunks', () => {
  it('chunks 30k-char fixture into 3 chunks', () => {
    const source = [makeParagraph(10000), makeParagraph(10000), makeParagraph(10000)].join('\n\n')
    const chunks = __freeformClientInternals.splitFreeformChunks(source)
    expect(chunks).toHaveLength(3)
    expect(chunks.every((chunk) => chunk.markdown.length <= 12000)).toBe(true)
  })

  it('splits on paragraph boundaries without cutting sentences', () => {
    const p1 = 'Paragraph one has complete sentence.\nAnd another line.'
    const p2 = 'Paragraph two stays intact.\nNo mid-sentence cut.'
    const p3 = 'Paragraph three also complete.'
    const chunks = __freeformClientInternals.splitFreeformChunks([p1, p2, p3].join('\n\n'), 80)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const reconstructed = chunks.map((chunk) => chunk.markdown).join('\n\n')
    expect(reconstructed).toBe([p1, p2, p3].join('\n\n'))
    expect(chunks[0].markdown).toContain('Paragraph one has complete sentence.')
    expect(chunks[chunks.length - 1].markdown).toContain('Paragraph three also complete.')
  })

  it('preserves line offsets across chunks', () => {
    const text = ['A1\nA2\nA3', 'B1\nB2', 'C1\nC2\nC3\nC4'].join('\n\n')
    const chunks = __freeformClientInternals.splitFreeformChunks(text, 8)
    expect(chunks.map((chunk) => chunk.startLine)).toEqual([1, 5, 8])
  })
})

describe('extractFreeformDrafts', () => {
  it('stops early on 429 and returns partial drafts with warning', async () => {
    const markdown = [makeParagraph(6000), makeParagraph(6000), makeParagraph(6000)].join('\n\n')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        drafts: [
          {
            prompt: 'Q1',
            modelAnswer: 'A1',
            sourceParagraphSnippet: 'snippet',
            sourceLineRange: { start: 2, end: 3 },
            confidence: 'high',
          },
        ],
        warnings: [],
        chunksRemaining: 2,
        budgetState: { proCallsRemainingToday: 4 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'pro_budget_exhausted', resetAt: '2026-05-01T00:00:00.000Z' }), { status: 429 }))

    vi.stubGlobal('fetch', fetchMock)

    const batch = await extractFreeformDrafts({ markdown, lectureAttended: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(batch.drafts).toHaveLength(1)
    expect(batch.warnings.some((warning) => warning.message.includes('Pro budget exhausted'))).toBe(true)
  })

  it('throws surfaced schema-invalid error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'schema_invalid', message: 'bad schema' }), { status: 502 })))
    await expect(extractFreeformDrafts({ markdown: 'x', lectureAttended: false })).rejects.toThrow('schema_invalid')
  })

  it('maps ExtractedDraft into DraftCard source + grounding + low confidence warning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      drafts: [
        {
          prompt: 'What is ATP?',
          modelAnswer: 'Energy currency',
          sourceParagraphSnippet: 'ATP stores energy',
          sourceLineRange: { start: 3, end: 4 },
          confidence: 'low',
        },
      ],
      warnings: [],
      chunksRemaining: 0,
      budgetState: { proCallsRemainingToday: 3 },
    }), { status: 200 })))

    const batch = await extractFreeformDrafts({
      markdown: 'line1\nline2\nline3\nline4',
      originDocUrl: 'https://example.com/lecture',
      lectureAttended: true,
      subDeckId: 'sd-1',
      courseId: 'course-1',
    })

    expect(batch.drafts).toHaveLength(1)
    const draft = batch.drafts[0]
    expect(draft.source).toEqual({
      type: 'lecture-paste-freeform',
      originDocUrl: 'https://example.com/lecture',
      lectureAttended: true,
    })
    expect(draft.groundingSnippets).toEqual(['L3-4: "ATP stores energy"'])
    expect(draft.warnings).toEqual(['low-confidence extraction — review carefully'])
    expect(draft.suggestedSubDeckId).toBe('sd-1')
  })
})
