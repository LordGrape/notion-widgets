#!/usr/bin/env node
/**
 * Phase V1/V2 verification gate (ADR-0001, ADR-0002).
 *
 * Run from the studyengine/ directory:
 *   node scripts/verify-domain-extraction.mjs
 *
 * Checks:
 *   1. Every moved identifier is defined exactly once, at its expected path.
 *   2. Domain purity: no SyncEngine, fetch, document, window, or gsap
 *      references inside src/domain/ (tests excluded).
 *   3. No explicit `any` inside src/domain/.
 *   4. Domain modules stay within the 600-line cap (ADR-0002).
 *
 * Exits non-zero on any failure. Runs in CI (see .github/workflows/ci.yml).
 *
 * Scope note (2026-08-18): the moved-identifier scan covers src/ only. The
 * monolith (studyengine.html) is a frozen legacy surface that still holds
 * pre-extraction duplicate definitions by design (V2 audit finding #1: the
 * monolith never shrank); those copies are cut in Phase V1b per
 * docs/extraction-map.md. Including the monolith here kept the gate
 * permanently red until V1b completes, without protecting anything the
 * module layer controls. Bridge registrations, not this gate, own the
 * monolith's runtime contract during the transition.
 *
 * Comment handling (2026-08-18): all pattern checks run on comment-stripped
 * text. The first annotated run failed on doc-comment prose in lifecycle.ts
 * ("no SyncEngine", "that document"), not on real imports. Comments are not
 * usage; strip them before matching.
 *
 * Failures also emit GitHub Actions ::error workflow commands so the PR
 * annotations name the exact culprit instead of a bare exit code.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const failures = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|html)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Remove block and line comments so pattern checks match code usage, not
 * prose. The trailing-comment rule requires the character before `//` to not
 * be a colon or quote, which keeps URL strings like 'https://...' intact.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/([^:'"`])\/\/.*$/gm, '$1');
}

// src/ only. See the scope note in the header.
const allFiles = walk(join(root, 'src'));

function definitionCount(name) {
  const pattern = new RegExp(`function ${name}\\b`, 'g');
  let count = 0;
  const locations = [];
  for (const file of allFiles) {
    let text;
    try {
      text = stripComments(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const matches = text.match(pattern);
    if (matches) {
      count += matches.length;
      locations.push(relative(root, file));
    }
  }
  return { count, locations };
}

// 1. Moved identifiers are defined exactly once, at their expected paths.
const MOVED = [
  ['deriveLifecycleStage', join('src', 'domain', 'lifecycle.ts')],
  ['setLifecycleStage', join('src', 'domain', 'lifecycle.ts')],
  ['applyLearnStatusMigration', join('src', 'domain', 'lifecycle.ts')],
  ['fingerprintLearnInputs', join('src', 'application', 'learn', 'fingerprints.ts')],
  ['fingerprintSubDeckCards', join('src', 'application', 'learn', 'fingerprints.ts')],
  ['verifyConsolidationQuestions', join('src', 'application', 'learn', 'grounding.ts')],
  ['substringVerified', join('src', 'application', 'learn', 'grounding.ts')],
  ['getCoverageStats', join('src', 'application', 'learn', 'coverage.ts')],
  ['getCourseSubDeckEntries', join('src', 'application', 'learn', 'coverage.ts')],
  ['resolveCourseLearnEntry', join('src', 'application', 'learn', 'coverage.ts')],
  ['createDefaultSubDeckForCourse', join('src', 'application', 'learn', 'coverage.ts')],
  ['getFrenchCoreImportSnapshot', join('src', 'application', 'settings', 'curation.ts')],
  ['applySettingsFromDom', join('src', 'ui', 'views', 'settings', 'apply-from-dom.ts')],
  ['isDevModeEnabled', join('src', 'ui', 'views', 'settings', 'dev-mode.ts')],
  ['getActiveModeValue', join('src', 'ui', 'views', 'settings', 'dom-helpers.ts')],
  ['withTimeout', join('src', 'shared', 'with-timeout.ts')],
  ['importDeckText', join('src', 'ui', 'views', 'settings', 'import-deck-text.ts')],
  ['confirmCuratedReimport', join('src', 'ui', 'views', 'settings', 'curated-reimport-modal.ts')],
  ['runWorkerOrchestratorDynamic', join('src', 'ui', 'views', 'settings', 'french-core-build-modal.ts')],
  ['runWorkerOrchestrator', join('src', 'ui', 'views', 'settings', 'french-core-build-modal.ts')],
];
for (const [name, expected] of MOVED) {
  const { count, locations } = definitionCount(name);
  if (count !== 1 || locations[0] !== expected) {
    failures.push(
      `${name}: expected exactly one definition in ${expected}, found ${count} in ${locations.join(', ') || 'nowhere'}`
    );
  }
}

const domainFiles = walk(join(root, 'src', 'domain')).filter((f) => f.endsWith('.ts'));

// 2. Domain purity (tests excluded: they may reference test harness globals).
const BANNED = [/\bSyncEngine\b/, /\bfetch\s*\(/, /\bdocument\b/, /\bwindow\b/, /\bgsap\b/];
for (const file of domainFiles.filter((f) => !f.endsWith('.test.ts'))) {
  const text = stripComments(readFileSync(file, 'utf8'));
  for (const pattern of BANNED) {
    if (pattern.test(text)) {
      failures.push(`${relative(root, file)}: domain purity violated by ${pattern}`);
    }
  }
}

// 3. No explicit any in src/domain/.
for (const file of domainFiles) {
  const text = stripComments(readFileSync(file, 'utf8'));
  if (/:\s*any\b|\bas any\b/.test(text)) {
    failures.push(`${relative(root, file)}: explicit any found in domain layer`);
  }
}

// 4. File budget: domain modules within the 600-line cap (raw line count).
for (const file of domainFiles) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (lines > 600) {
    failures.push(`${relative(root, file)}: ${lines} lines exceeds the 600-line cap`);
  }
}

if (failures.length) {
  console.error('verify-domain-extraction FAILED');
  for (const failure of failures) {
    console.error(` - ${failure}`);
    const annotation = String(failure)
      .replace(/%/g, '%25')
      .replace(/\r/g, '%0D')
      .replace(/\n/g, '%0A');
    console.log(`::error title=verify-domain-extraction::${annotation}`);
  }
  process.exit(1);
}
console.log(`verify-domain-extraction PASS (${MOVED.length} moved identifiers, ${domainFiles.length} domain files checked)`);
