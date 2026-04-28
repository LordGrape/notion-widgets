# L1b-alpha diagnosis and read-pass notes

## R1: SAMPA to IPA read pass

- Source selection path is `parseLexique3(...)` + `selectTopByFreqfilms2(entries, 2000)` in `pipeline.ts`.
- In this execution environment, the full Lexique corpus could not be downloaded (`ENETUNREACH`), so exhaustive top-2000 enumeration was not possible here.
- Implemented mapping table covers all SAMPA symbols used in the existing top-frequency sample and fixtures (`a e i o u y @ E O A 2 9 S Z N R H 8` plus nasal digraphs `a~ e~ o~ 9~` and uppercase variants seen in Lexique-style strings).
- No currently observed unmappable code in fixture/sample corpus.

## R2: LLM gloss endpoint read pass

- Existing Worker had no dedicated `/studyengine/gloss` route.
- Worker already has Gemini wiring (`GEMINI_API_KEY`) and robust JSON parsing (`parseLlmJson`).
- Added dedicated route `POST /studyengine/gloss` and build-side cache pipeline.
- Budget estimate for 2000 lemmas with batches of 30:
  - Input approx 80 tokens/lemma and output approx 20 tokens/lemma.
  - Total approx 200,000 tokens (well under 3,000,000 threshold).

## R3: first-class import surface read pass

- The lowest cohesion-risk path is Settings data panel import, using existing Import modal pipeline (`m_import` -> preview -> commit).
- Implemented a registry-based curated deck list (`CURATED_DECKS`) rendered in one loop, with no language-specific styling branches.

## Environment limits observed in this run

- `npm run fetch:lexique3` failed due network unreachable.
- `npm run build:french-2000` requires `WORKER_URL` and `WIDGET_SECRET` env vars for gloss generation; command fails without these values.
