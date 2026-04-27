const TTS_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/tts';
const MAX_CACHE = 50;

const audioCache = new Map<string, string>();

function cacheKey(text: string, languageCode: string, voiceName?: string): string {
  return `${languageCode}::${voiceName || ''}::${text}`;
}

function rememberBlobUrl(key: string, blobUrl: string): void {
  if (audioCache.has(key)) audioCache.delete(key);
  audioCache.set(key, blobUrl);
  while (audioCache.size > MAX_CACHE) {
    const oldest = audioCache.keys().next().value as string | undefined;
    if (!oldest) break;
    const oldUrl = audioCache.get(oldest);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    audioCache.delete(oldest);
  }
}

function decodeAudioContent(audioContent: string): string {
  const binary = atob(audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

function defaultVoiceForLanguage(languageCode: string): string | undefined {
  const normalized = String(languageCode || '').trim().toLowerCase();
  if (normalized.startsWith('en-us')) return 'en-US-Studio-O';
  if (normalized.startsWith('es-es')) return 'es-ES-Studio-F';
  if (normalized.startsWith('fr-fr')) return 'fr-FR-Studio-D';
  if (normalized.startsWith('de-de')) return 'de-DE-Studio-B';
  if (normalized.startsWith('ja-jp')) return 'ja-JP-Standard-A';
  if (normalized.startsWith('zh-cn')) return 'cmn-CN-Standard-A';
  return undefined;
}

function reportTtsWarning(message: string): void {
  try {
    const w = globalThis as any;
    if (typeof w.__studyEngineReportTtsWarning === 'function') w.__studyEngineReportTtsWarning(message);
  } catch (_e) {}
}

async function fetchAudio(args: { text: string; languageCode: string; voiceName?: string }): Promise<string | null> {
  const text = String(args.text || '').trim();
  const languageCode = String(args.languageCode || '').trim() || 'en-US';
  if (!text) return null;
  const voiceName = args.voiceName || defaultVoiceForLanguage(languageCode);
  const key = cacheKey(text, languageCode, voiceName);
  const cached = audioCache.get(key);
  if (cached) {
    audioCache.delete(key);
    audioCache.set(key, cached);
    return cached;
  }

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, languageCode, voiceName })
  });
  if (!res.ok) {
    reportTtsWarning('Audio unavailable right now. Continuing without audio.');
    return null;
  }
  const body = await res.json() as { audioContent?: string };
  if (!body.audioContent) {
    reportTtsWarning('Audio unavailable right now. Continuing without audio.');
    return null;
  }
  const blobUrl = decodeAudioContent(body.audioContent);
  rememberBlobUrl(key, blobUrl);
  return blobUrl;
}

export async function prefetchAudio(args: { text: string; languageCode: string; voiceName?: string }): Promise<void> {
  try {
    await fetchAudio(args);
  } catch (_e) {
    reportTtsWarning('Audio unavailable right now. Continuing without audio.');
  }
}

export async function playLearnSegmentAudio(args: { text: string; languageCode: string; voiceName?: string }): Promise<void> {
  try {
    const blobUrl = await fetchAudio(args);
    if (!blobUrl) return;
    const audio = new Audio(blobUrl);
    await audio.play();
  } catch (_e) {
    reportTtsWarning('Audio unavailable right now. Continuing without audio.');
  }
}

export const __ttsClientInternals = {
  cacheKey,
  decodeAudioContent,
  defaultVoiceForLanguage,
  rememberBlobUrl,
  getCacheSize: (): number => audioCache.size,
  clearCache: (): void => {
    for (const url of audioCache.values()) URL.revokeObjectURL(url);
    audioCache.clear();
  }
};
