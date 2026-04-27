/**
 * Phase L1a — French Core 2000 ingest pipeline types.
 *
 * Locked decisions (Language Domain spec §7.3, §9):
 * - Frequency rank + linguistic metadata: Lexique 3 (CC BY-SA), top 2000 by
 *   `freqlemfilms2` (per-lemma aggregated film-subtitle frequency).
 * - Example sentences: Tatoeba en-fr pairs (CC BY 2.0), French side ≤ 80 chars.
 * - English glosses: hand-written for L1a (top 50 lemmas); LLM-generated for L1b.
 * - Audio: deferred to L1b. L1a emits cards without audio (no slot in card
 *   chrome today — see L1a read-pass diagnosis).
 *
 * The pipeline is build-time only. None of these types or functions are
 * imported by the runtime bundle; they are exercised by vitest and by the
 * Node script `studyengine/scripts/build-french-core-sample.ts`.
 */

/**
 * One row of `Lexique383.tsv` after parsing. Lexique 3 has ~30 columns; we
 * retain only the eight relevant to L1a/L1b. `phon` is SAMPA-style, NOT IPA
 * — SAMPA→IPA conversion is L1b territory (no IPA card-chrome slot today).
 */
export interface Lexique3Entry {
  /** Surface form (one per inflection). */
  ortho: string;
  /** Phonemic transcription, SAMPA-style (e.g. `s@`, `setR`). */
  phon: string;
  /** Lemma / dictionary form. Multiple `Lexique3Entry` rows can share a lemma. */
  lemme: string;
  /** Lexique 3 POS code (`NOM`, `VER`, `ADJ`, `ADV`, `DET:ART`, …). */
  cgram: string;
  /** Grammatical gender for nouns/adjectives: `'m' | 'f' | ''` (empty for non-applicable POS). */
  genre: string;
  /** Number: `'s' | 'p' | ''`. */
  nombre: string;
  /** Per-lemma aggregated frequency in the film-subtitle subcorpus (occurrences/million). */
  freqlemfilms2: number;
  /** Per-form frequency. Retained for diagnostic / fallback use; ranking uses `freqlemfilms2`. */
  freqfilms2: number;
}

/** A single en↔fr Tatoeba sentence pair, joined via `links.csv`. */
export interface TatoebaPair {
  /** Tatoeba sentence id of the French side. */
  fraId: number;
  /** French sentence text. */
  fra: string;
  /** Tatoeba sentence id of the English side. */
  engId: number;
  /** English sentence text. */
  eng: string;
}

export interface ParseTatoebaInput {
  /** Raw contents of `fra_sentences.tsv` (id\tlang\ttext lines). */
  fraSentencesTsv: string;
  /** Raw contents of `eng_sentences.tsv`. */
  engSentencesTsv: string;
  /** Raw contents of `links.csv` (`sentence_id,translation_id`). */
  linksCsv: string;
  /**
   * Maximum allowed length of the French side, in characters. Pairs whose
   * French sentence exceeds this are dropped. Default 80 (i+1 calibration —
   * A1 cards must not show 200-char examples).
   */
  maxFraLength?: number;
}

/**
 * Card import shape consumed by the existing studyengine.html `commitImport`
 * path. Mirrors the validated import contract:
 *
 * - Required: `prompt`, `modelAnswer`.
 * - Optional fields persisted as-is into `state.items[id]`.
 * - `fsrs` deliberately omitted so `commitImport` seeds it
 *   (`state: 'new'`, due ≈ 24h).
 *
 * For L1a: gender + IPA + example are packed into `modelAnswer` markdown
 * (no dedicated chrome slots today — flagged as L1b dependency).
 */
export interface CardJson {
  prompt: string;
  modelAnswer: string;
  course: string;
  subDeck: string;
  topic: string;
  tier: 'quickfire';
  targetLanguage: string;
  languageLevel: 1 | 2 | 3 | 4 | 5 | 6;
  planProfile: 'language';
  tags: string[];
}

export interface BuildCardInput {
  lemma: Lexique3Entry;
  /** English gloss (hand-written for L1a, LLM-generated for L1b). */
  gloss: string;
  /** Optional Tatoeba pair. Cards without an example are valid; the example block is just omitted. */
  pair?: TatoebaPair;
  /**
   * L1a: always `null` (no audio integration, no chrome slot).
   * L1b: Forvo URL or Google Cloud TTS fallback.
   */
  audioUrl?: string | null;
}
