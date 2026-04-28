// L1b-alpha-hotfix: shared French Core 2000 worker build pipeline primitives.


export interface Lexique3Entry {
  ortho: string;
  phon: string;
  lemme: string;
  cgram: string;
  genre: string;
  nombre: string;
  freqlemfilms2: number;
  freqfilms2: number;
}

export interface TatoebaPair {
  fraId: number;
  fra: string;
  engId: number;
  eng: string;
}

export const BUILD_KEYS = {
  lexique: 'studyengine:build:french-core-2000:lexique3-top2000',
  lexiqueMeta: 'studyengine:build:french-core-2000:lexique3-meta',
  tatoeba: 'studyengine:build:french-core-2000:tatoeba-index',
  tatoebaMeta: 'studyengine:build:french-core-2000:tatoeba-meta',
  glosses: 'studyengine:build:french-core-2000:glosses',
  tokenBudget: 'studyengine:build:french-core-2000:token-budget',
  deck: 'studyengine:decks:french-core-2000',
  deckMeta: 'studyengine:decks:french-core-2000:meta',
} as const;

export const LEXIQUE_URL =
  'https://raw.githubusercontent.com/chrplr/openlexicon/master/datasets-info/Lexique383/Lexique383.tsv';
export const LEXIQUE_SHA256 = '';

export const TATOEBA_URLS = {
  fra: 'https://raw.githubusercontent.com/LordGrape/notion-widgets/main/studyengine/src/decks/french-core-2000/fixtures/fra_sentences.tsv',
  eng: 'https://raw.githubusercontent.com/LordGrape/notion-widgets/main/studyengine/src/decks/french-core-2000/fixtures/eng_sentences.tsv',
  links: 'https://raw.githubusercontent.com/LordGrape/notion-widgets/main/studyengine/src/decks/french-core-2000/fixtures/links.csv',
};
export const TATOEBA_SHA256 = '';

export const SAMPLE_GLOSSES: Record<string, string> = {
  de: 'of, from', la: 'the (fem.); her, it', le: 'the (masc.); him, it', être: 'to be', et: 'and', à: 'to, at, in',
  il: 'he, it', avoir: 'to have', ne: 'not (negation marker, paired with pas/jamais/etc.)', je: 'I',
  son: 'his, her, its (masc. sing.)', que: 'that, which; what; than', se: 'oneself, himself, herself (reflexive)',
  qui: 'who, which', ce: 'this, that; it', dans: 'in, into', en: 'in, of it, some (pronoun and preposition)',
  un: 'a, an, one', tu: 'you (singular, informal)', pas: 'not (negation)', vouloir: 'to want', pour: 'for, in order to',
  faire: 'to do, to make', me: 'me, myself', plus: 'more; no longer (when negated)', dire: 'to say, to tell',
  pouvoir: 'to be able to, can', mais: 'but', y: 'there; of it / about it (pronoun)', on: 'one, we, people (impersonal subject)',
  nous: 'we, us', tout: 'all, every, everything', te: 'you, yourself (informal singular object)', aller: 'to go',
  votre: 'your (formal or plural)', avec: 'with', au: 'to the, at the (à + le)', comme: 'like, as; how',
  ça: 'that, it (informal)', moi: 'me (stressed pronoun)', autre: 'other, another', lui: 'him, her (indirect object); to him/her',
  très: 'very', là: 'there', vous: 'you (formal or plural)', ou: 'or', sur: 'on, on top of, about',
  quoi: 'what (interrogative / relative)', si: 'if; so; yes (in response to a negative)', mon: 'my (masc. sing.)',
};

const REQUIRED_COLUMNS = ['ortho', 'phon', 'lemme', 'cgram', 'genre', 'nombre', 'freqlemfilms2', 'freqfilms2'] as const;
const FRENCH_TOKEN_RE = /[\p{L}'’-]+/gu;

function parseFloatSafe(value: string): number { const n = Number(value.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }

export async function sha256Text(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

export function parseLexique3(tsvText: string): Lexique3Entry[] {
  if (!tsvText.trim()) return [];
  const lines = tsvText.split(/\r?\n/);
  const header = lines.find((line) => line.trim());
  if (!header) return [];
  const cols = header.split('\t').map((h) => h.trim());
  const idx: Record<string, number> = {};
  for (const c of REQUIRED_COLUMNS) {
    idx[c] = cols.indexOf(c);
    if (idx[c] < 0) throw new Error(`Lexique 3 parse: required column "${c}" not found in header`);
  }
  const out: Lexique3Entry[] = [];
  for (const line of lines.slice(lines.indexOf(header) + 1)) {
    if (!line.trim()) continue;
    const row = line.split('\t');
    const lemme = (row[idx.lemme] || '').trim();
    if (!lemme) continue;
    out.push({
      ortho: (row[idx.ortho] || '').trim(), phon: (row[idx.phon] || '').trim(), lemme,
      cgram: (row[idx.cgram] || '').trim(), genre: (row[idx.genre] || '').trim(), nombre: (row[idx.nombre] || '').trim(),
      freqlemfilms2: parseFloatSafe(row[idx.freqlemfilms2] || '0'), freqfilms2: parseFloatSafe(row[idx.freqfilms2] || '0'),
    });
  }
  return out;
}

export function selectTopByFreqfilms2(entries: Lexique3Entry[], n: number): Lexique3Entry[] {
  const groups = new Map<string, Lexique3Entry[]>();
  for (const e of entries) groups.set(e.lemme, [...(groups.get(e.lemme) || []), e]);
  const reps = [...groups.values()].map((rows) => rows.find((r) => r.ortho === r.lemme) || rows[0]);
  reps.sort((a, b) => b.freqlemfilms2 - a.freqlemfilms2 || a.lemme.localeCompare(b.lemme, 'fr'));
  return reps.slice(0, Math.max(0, n));
}

function parseSentenceTsv(tsv: string, expectedLang: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const line of tsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [idRaw, lang, text] = line.split('\t');
    const id = Number(idRaw);
    if (!Number.isFinite(id) || lang?.trim() !== expectedLang || !text) continue;
    out[id] = text;
  }
  return out;
}

export function parseTatoebaPairs(input: { fraSentencesTsv: string; engSentencesTsv: string; linksCsv: string; maxFraLength?: number }): TatoebaPair[] {
  const fra = parseSentenceTsv(input.fraSentencesTsv, 'fra');
  const eng = parseSentenceTsv(input.engSentencesTsv, 'eng');
  const out: TatoebaPair[] = [];
  const seen = new Set<string>();
  const maxLen = input.maxFraLength ?? 80;
  for (const line of input.linksCsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [aRaw, bRaw] = line.split(',');
    const a = Number(aRaw); const b = Number(bRaw);
    let fraId = -1; let engId = -1;
    if (fra[a] && eng[b]) { fraId = a; engId = b; }
    else if (fra[b] && eng[a]) { fraId = b; engId = a; }
    else continue;
    const key = `${fraId}-${engId}`; if (seen.has(key)) continue; seen.add(key);
    if (fra[fraId].length > maxLen) continue;
    out.push({ fraId, fra: fra[fraId], engId, eng: eng[engId] });
  }
  return out;
}

export function indexPairsByLemma(pairs: TatoebaPair[]): Record<string, TatoebaPair[]> {
  const out: Record<string, TatoebaPair[]> = {};
  for (const pair of pairs) {
    const seen = new Set<string>();
    for (const token of (pair.fra.match(FRENCH_TOKEN_RE) || []).map((t) => t.toLowerCase())) {
      if (seen.has(token)) continue;
      seen.add(token);
      out[token] = out[token] || [];
      out[token].push(pair);
    }
  }
  return out;
}

const SAMPA: Record<string, string> = { 'a~': 'ɑ̃', 'e~': 'ɛ̃', 'o~': 'ɔ̃', '9~': 'œ̃', 'S': 'ʃ', 'Z': 'ʒ', 'N': 'ɲ', 'R': 'ʁ', 'H': 'ɥ', '2': 'ø', '9': 'œ', '@': 'ə', '8': 'ɥ', 'A': 'ɑ', 'E': 'ɛ', 'O': 'ɔ' };
export function sampaToIpa(raw: string): string {
  let s = raw || '';
  for (const d of ['a~', 'e~', 'o~', '9~']) s = s.split(d).join(SAMPA[d]);
  return s.split('').map((ch) => SAMPA[ch] || ch).join('');
}

export function buildCardJson(input: { lemma: Lexique3Entry; gloss: string; pair?: TatoebaPair; rank: number; exampleHint?: string }): Record<string, unknown> {
  const { lemma, gloss, pair, rank, exampleHint } = input;
  const ipa = lemma.phon ? `\`/${sampaToIpa(lemma.phon)}/\`` : '';
  const gender = lemma.cgram.startsWith('NOM') ? (lemma.genre === 'm' ? '**masc.**' : lemma.genre === 'f' ? '**fem.**' : '') : '';
  const head = [gender, ipa].filter(Boolean).join(' · ');
  const exFra = pair?.fra || exampleHint || '';
  const exEng = pair?.eng || '';
  const band = rank <= 500 ? 'A1' : rank <= 1500 ? 'A2' : 'B1';
  return {
    prompt: lemma.lemme,
    modelAnswer: [head, gloss, exFra ? `> ${exFra}${exEng ? `\n> ${exEng}` : ''}` : ''].filter(Boolean).join('\n\n'),
    topic: band,
    metadata: { pos: lemma.cgram, rank, cefrBand: band }
  };
}

export async function kvGetJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  return (await kv.get(key, 'json')) as T | null;
}
