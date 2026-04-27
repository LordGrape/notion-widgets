import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __ttsClientInternals, playLearnSegmentAudio, prefetchAudio } from './tts-client';

describe('tts-client', () => {
  const nativeAtob = globalThis.atob.bind(globalThis);
  const fetchMock = vi.fn();
  const playMock = vi.fn().mockResolvedValue(undefined);
  const audioCtor = vi.fn(() => ({ play: playMock }));
  const createObjectURL = vi.fn(() => 'blob:tts-1');
  const revokeObjectURL = vi.fn();
  const warningSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', audioCtor as any);
    vi.stubGlobal('atob', (value: string) => nativeAtob(value));
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL } as any);
    (globalThis as any).__studyEngineReportTtsWarning = warningSpy;
    __ttsClientInternals.clearCache();
    fetchMock.mockReset();
    audioCtor.mockClear();
    playMock.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    warningSpy.mockClear();
  });

  afterEach(() => {
    delete (globalThis as any).__studyEngineReportTtsWarning;
    __ttsClientInternals.clearCache();
  });

  it('plays audio successfully', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audioContent: 'YWJj' }) });
    await playLearnSegmentAudio({ text: 'hola', languageCode: 'es-ES' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(audioCtor).toHaveBeenCalledWith('blob:tts-1');
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('decodes base64 audio into blob URL', () => {
    const blobUrl = __ttsClientInternals.decodeAudioContent('bXAz');
    expect(blobUrl).toBe('blob:tts-1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('maps voices for known languages and fallback', () => {
    expect(__ttsClientInternals.defaultVoiceForLanguage('en-US')).toBe('en-US-Studio-O');
    expect(__ttsClientInternals.defaultVoiceForLanguage('es-ES')).toBe('es-ES-Studio-F');
    expect(__ttsClientInternals.defaultVoiceForLanguage('fr-FR')).toBe('fr-FR-Studio-D');
    expect(__ttsClientInternals.defaultVoiceForLanguage('de-DE')).toBe('de-DE-Studio-B');
    expect(__ttsClientInternals.defaultVoiceForLanguage('ja-JP')).toBe('ja-JP-Standard-A');
    expect(__ttsClientInternals.defaultVoiceForLanguage('zh-CN')).toBe('cmn-CN-Standard-A');
    expect(__ttsClientInternals.defaultVoiceForLanguage('it-IT')).toBeUndefined();
  });

  it('evicts oldest blob URL when LRU exceeds 50', () => {
    for (let i = 0; i < 51; i += 1) {
      __ttsClientInternals.rememberBlobUrl(`k-${i}`, `blob:${i}`);
    }
    expect(__ttsClientInternals.getCacheSize()).toBe(50);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:0');
  });

  it('gracefully degrades on 5xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await playLearnSegmentAudio({ text: 'bonjour', languageCode: 'fr-FR' });
    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(audioCtor).not.toHaveBeenCalled();
  });

  it('prefetches and caches audio without playing', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audioContent: 'YWJj' }) });
    await prefetchAudio({ text: 'guten tag', languageCode: 'de-DE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(audioCtor).not.toHaveBeenCalled();
    expect(__ttsClientInternals.getCacheSize()).toBe(1);
  });
});
