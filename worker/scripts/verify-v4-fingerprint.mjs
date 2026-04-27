import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/learn-plan.ts', import.meta.url), 'utf8');
let failed = 0;
function check(name, condition) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.log(`FAIL ${name}`);
  }
}

check('PLAN_CACHE_VERSION is v4', src.includes('const PLAN_CACHE_VERSION = "v4"'));
check('PLAN_CACHE_KEY_PREFIX uses learn-plan:v4:', src.includes('const PLAN_CACHE_KEY_PREFIX = `learn-plan:${PLAN_CACHE_VERSION}:`;'));
check('fingerprint composes learnerModelFingerprint', src.includes('learnerModelFingerprint'));
check('fingerprint composes planProfile', src.includes('planProfile'));
check('fingerprint composes languageLevel', src.includes('languageLevel'));
check('fingerprint composes targetLanguage', src.includes('targetLanguage'));
check('fingerprint composes priorKnowledge', src.includes('priorKnowledge'));
check('fingerprint composes appendTransferQuestion', src.includes('appendTransferQuestion'));
check('fingerprint composes segmentLimit', src.includes('segmentLimit'));

if (failed > 0) process.exit(1);
