# SACRED ANCHORS (Run 7)

## Plan cache
- `PLAN_CACHE_VERSION`: `v4` (`worker/src/routes/learn-plan.ts:15`)
- Prefix: `learn-plan:v4:` via `PLAN_CACHE_KEY_PREFIX` (`worker/src/routes/learn-plan.ts:17`)
- Fingerprint composition inputs (in order) from `planCacheKey`: `cards[]` payload, `v`, `priorKnowledge`, `appendTransferQuestion`, `segmentLimit`, `planProfile`, `learnerModelFingerprint`, `targetLanguage`, `languageLevel` (`worker/src/routes/learn-plan.ts:502-511`).

## SSE
- Named segment event: `segment` (`worker/src/routes/learn-plan.ts:1065,1116,1140,1226,1247`).
- Current server emit count for `segment`: **5** (same callsites above).
- Current consumer count for `segment`: **2** in runtime flow:
  - Legacy parse loop forwarding segments (`studyengine/src/learn-mode.ts:491`).
  - SSE event dispatcher `eventName === 'segment'` (`studyengine/src/learn-mode.ts:527`).

## FSRS math
- `scheduleFsrs` bridge contract and usage in session flow (`studyengine/src/session-flow.ts:51,621`).
- `fsrsSeedForEntry` seed function (`studyengine/src/session-flow.ts:1277`).

## Fingerprints
- `fingerprintLearnInputs` (`studyengine/src/learn-mode.ts:137`).
- `fingerprintSubDeckCards` (`studyengine/src/learn-mode.ts:150`).
- `composeLearnerModelFingerprint` (`studyengine/src/learner-model/learner-model.ts:143`).

## Worker types contract
- `LearnTurnResponse` discriminated union (`worker/src/types.ts:506`).
- `LearnTurnErrorCode` (`worker/src/types.ts:498`).
- `LearnPlanRequest` / `LearnPlanResponse` (`worker/src/types.ts:384,448`).

## Module bridges
- `__studyEngineLearnMode` bridge install (`studyengine/src/learn-mode.ts:977`).
- `__studyEngineSessionFlow` bridge install (`studyengine/src/session-flow.ts:1486`).
- `__studyEngineStudyFlow` bridge consumption (`studyengine/src/study-flow.ts:17`).
- `__studyEngineLearnerModel` bridge install (`studyengine/src/learn-mode.ts:1007`).

## Sacred routes
- `worker/src/routes/tts.ts` (`handleTts` at line 80).
- `worker/src/routes/ingest-extract.ts` (`handleIngestExtract` at line 128).
- `worker/src/routes/learn-turn.ts` (`handleLearnTurn` at line 252).
- `worker/src/routes/learn-plan.ts` (`handleLearnPlan` at line 1043).
  - Sacred-region protected functions in `learn-plan.ts`: `planCacheKey`, `buildSystemPrompt`, `buildUserPrompt`, `verifySegmentGrounding`, `verifySegmentTeach`, `verifySegmentTutorPrompt`, `requestPlanOneShot`, `handleLearnPlan`.
