import { readFileSync } from 'node:fs'

const routeSrc = readFileSync(new URL('../src/routes/ingest-extract.ts', import.meta.url), 'utf8')
const indexSrc = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const typesSrc = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8')

let failed = 0
function check(name, condition) {
  if (condition) {
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.log(`FAIL ${name}`)
  }
}

check('route file exists and exports handleIngestExtract', routeSrc.includes('export async function handleIngestExtract'))
check('route enforces POST /studyengine/ingest-extract wiring', indexSrc.includes('"/studyengine/ingest-extract"') && indexSrc.includes('handleIngestExtract'))
check('types include IngestExtractRequest', typesSrc.includes('export interface IngestExtractRequest'))
check('types include ExtractedDraft', typesSrc.includes('export interface ExtractedDraft'))
check('types include IngestExtractResponse', typesSrc.includes('export interface IngestExtractResponse'))
check('combined pro budget cap 5/day', routeSrc.includes('PRO_DAILY_CAP = 5') && routeSrc.includes('tier2:plan-pro:') && routeSrc.includes('tier2:ingest:'))
check('budget exhausted path returns 429 pro_budget_exhausted', routeSrc.includes('pro_budget_exhausted') && routeSrc.includes('429'))
check('schema_invalid retry path present', routeSrc.includes('runExtraction(true, 8192)') && routeSrc.includes('schema_invalid'))
check('gemini request uses pro model + json schema + responseMimeType', routeSrc.includes('PLAN_ESCALATION_MODEL') && routeSrc.includes('responseMimeType: "application/json"') && routeSrc.includes('responseSchema: EXTRACTED_DRAFTS_SCHEMA'))

if (failed > 0) process.exit(1)
