#!/usr/bin/env node
/**
 * Phase V1 verification gate (ADR-0001, ADR-0002).
 *
 * Run from the studyengine/ directory:
 *   node scripts/verify-domain-extraction.mjs
 *
 * Checks:
 *   1. Every moved identifier is defined exactly once, inside src/domain/.
 *   2. Domain purity: no SyncEngine, fetch, document, window, or gsap
 *      references inside src/domain/ (tests excluded).
 *   3. No explicit `any` inside src/domain/.
 *   4. Domain modules stay within the 600-line cap (ADR-0002).
 *
 * Exits non-zero on any failure. Runs in CI (see .github/workflows/ci.yml).
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

const srcFiles = walk(join(root, 'src'));
const allFiles = [...srcFiles, join(root, 'studyengine.html')];

function definitionCount(name) {
  const pattern = new RegExp(`function ${name}\\b`, 'g');
  let count = 0;
  const locations = [];
  for (const file of allFiles) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
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

// 1. Moved identifiers are defined exactly once, inside src/domain/.
const MOVED = ['deriveLifecycleStage', 'setLifecycleStage', 'applyLearnStatusMigration'];
const DOMAIN_LIFECYCLE = join('src', 'domain', 'lifecycle.ts');
for (const name of MOVED) {
  const { count, locations } = definitionCount(name);
  if (count !== 1 || locations[0] !== DOMAIN_LIFECYCLE) {
    failures.push(
      `${name}: expected exactly one definition in ${DOMAIN_LIFECYCLE}, found ${count} in ${locations.join(', ') || 'nowhere'}`
    );
  }
}

const domainFiles = walk(join(root, 'src', 'domain')).filter((f) => f.endsWith('.ts'));

// 2. Domain purity (tests excluded: they may reference test harness globals).
const BANNED = [/\bSyncEngine\b/, /\bfetch\s*\(/, /\bdocument\b/, /\bwindow\b/, /\bgsap\b/];
for (const file of domainFiles.filter((f) => !f.endsWith('.test.ts'))) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of BANNED) {
    if (pattern.test(text)) {
      failures.push(`${relative(root, file)}: domain purity violated by ${pattern}`);
    }
  }
}

// 3. No explicit any in src/domain/.
for (const file of domainFiles) {
  const text = readFileSync(file, 'utf8');
  if (/:\s*any\b|\bas any\b/.test(text)) {
    failures.push(`${relative(root, file)}: explicit any found in domain layer`);
  }
}

// 4. File budget: domain modules within the 600-line cap.
for (const file of domainFiles) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (lines > 600) {
    failures.push(`${relative(root, file)}: ${lines} lines exceeds the 600-line cap`);
  }
}

if (failures.length) {
  console.error('verify-domain-extraction FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`verify-domain-extraction PASS (${domainFiles.length} domain files checked)`);
