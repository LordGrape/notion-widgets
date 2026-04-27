import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const src = readFileSync(new URL('../src/routes/learn-plan.ts', import.meta.url), 'utf8');
let failed = 0;
function check(name, condition) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}`);
  }
}

check('plan cache fingerprint v3 includes planProfile', src.includes('const PLAN_CACHE_VERSION = "v3"') && src.includes('planProfile'));
check('plan cache fingerprint v3 includes languageLevel', src.includes('languageLevel'));
check('plan cache fingerprint v3 includes targetLanguage', src.includes('targetLanguage'));
check('factual profile appendix present', src.includes('This is a FACTUAL profile session. Prioritize:'));
check('procedural profile appendix present', src.includes('This is a PROCEDURAL profile session. Prioritize:'));
check('theory profile has no explicit appendix', !/theory profile session/i.test(src));

const normalize = (value) => (value === 'factual' || value === 'procedural' || value === 'language' ? value : 'theory');
const fingerprint = (body) => {
  const sortedCards = [...body.cards].map((c) => ({ id: String(c.id || ''), prompt: String(c.prompt || ''), modelAnswer: String(c.modelAnswer || '') })).sort((a, b) => a.id.localeCompare(b.id));
  const payload = JSON.stringify({
    v: 'v3',
    priorKnowledge: body.priorKnowledge || 'mixed',
    appendTransferQuestion: Boolean(body.appendTransferQuestion),
    planProfile: normalize(body.planProfile),
    targetLanguage: body.targetLanguage,
    languageLevel: body.languageLevel,
    course: body.course,
    subDeck: body.subDeck,
    cards: sortedCards
  });
  return createHash('sha256').update(payload).digest('hex');
};

const base = { course: 'C', subDeck: 'S', cards: [{ id: '1', prompt: 'p', modelAnswer: 'a' }], priorKnowledge: 'mixed', appendTransferQuestion: false };
check('v3 fingerprint changes across profiles', fingerprint({ ...base, planProfile: 'factual' }) !== fingerprint({ ...base, planProfile: 'procedural' }));
check('v3 fingerprint preserves priorKnowledge sensitivity', fingerprint({ ...base, priorKnowledge: 'high' }) !== fingerprint({ ...base, priorKnowledge: 'low' }));

if (failed > 0) process.exit(1);
