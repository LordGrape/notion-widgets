import { describe, expect, it, vi } from 'vitest';
import { findSseEventSeparatorForTest, streamGemini } from '../src/gemini';

describe('Gemini streaming SSE parsing', () => {
  it('detects both LF and CRLF event separators', () => {
    expect(findSseEventSeparatorForTest('data: {}\n\n')?.length).toBe(2);
    expect(findSseEventSeparatorForTest('data: {}\r\n\r\n')?.length).toBe(4);
  });

  it('yields text chunks from CRLF-delimited Gemini SSE events', async () => {
    const encoder = new TextEncoder();
    const event = (payload: unknown) => `data: ${JSON.stringify(payload)}\r\n\r\n`;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode([
          event({ candidates: [{ content: { parts: [{ text: '{"segments":[' }] } }] }),
          event({ candidates: [{ content: { parts: [{ text: '{"id":"seg-1"}' }] } }] }),
          event({ candidates: [{ content: { parts: [{ text: ']}' }] } }], usageMetadata: { totalTokenCount: 3 } })
        ].join('')));
        controller.close();
      }
    });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body
    })));

    const env = {
      GEMINI_API_KEY: 'test-key',
      WIDGET_KV: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => undefined)
      }
    };

    const chunks: string[] = [];
    for await (const chunk of streamGemini('gemini-2.5-flash', 'system', 'user', {}, env as any)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('{"segments":[{"id":"seg-1"}]}');
    expect(env.WIDGET_KV.put).toHaveBeenCalled();
  });
});
