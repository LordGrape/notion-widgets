import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'athlete.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const shellOnly = html
  .replace(/<script data-athlete-inline="[^"]+">[\s\S]*?<\/script>/g, '<script></script>')
  .replace(/<style data-athlete-inline="[^"]+">[\s\S]*?<\/style>/g, '<style></style>');

assert(Buffer.byteLength(html) > 80_000, 'athlete.html is unexpectedly small.');
assert(
  html.includes('<meta name="athlete-build" content="single-file-v2.2">'),
  'The single-file build marker is missing.',
);
assert(!/@import\b/i.test(html), 'The build contains a CSS @import.');
assert(
  !/(?:src|href)=["'](?:\.\/)?(?:core\.js|athlete(?:-body|-data|-render|-flow|-settings)?\.js|athlete(?:-settings)?\.css|theme-upgrade\.css)/i.test(shellOnly),
  'The build contains a local asset reference.',
);

for (const id of [
  'app',
  'ovrNum',
  'bodyWrap',
  'radar',
  'attrList',
  'logBtn',
  'logSheet',
  'detail',
  'settings',
  'setBw',
  'ruckSettings',
  'rkFloor',
  'rkL1',
  'rkL2',
  'rkL3',
  'rkCap',
  'ruckDefaults',
  'setExport',
  'setImport',
  'setImportFile',
  'setReset',
  'resetConfirm',
  'setSave',
]) {
  assert(new RegExp(`id=["']${id}["']`).test(shellOnly), `Required element #${id} is missing.`);
}
assert(shellOnly.includes('Loaded march scoring'), 'The professional settings layout is missing.');
assert(!shellOnly.includes('Loaded march pace anchors (min/km, mm:ss)'), 'The legacy settings copy is still present.');

const scripts = [...html.matchAll(/<script data-athlete-inline="([^"]+)">\n?([\s\S]*?)<\/script>/g)];
const expectedScripts = [
  'core.js',
  'athlete-body.js',
  'athlete-data.js',
  'athlete-render.js',
  'athlete-flow.js',
  'athlete-settings.js',
];
assert(scripts.length === expectedScripts.length, `Expected ${expectedScripts.length} inline scripts, found ${scripts.length}.`);
for (let index = 0; index < expectedScripts.length; index += 1) {
  assert(scripts[index][1] === expectedScripts[index], `Script order mismatch at ${expectedScripts[index]}.`);
  new vm.Script(scripts[index][2], { filename: `inline:${scripts[index][1]}` });
}

const bodySource = await readFile(join(root, 'athlete-body.js'), 'utf8');
const dataSource = await readFile(join(root, 'athlete-data.js'), 'utf8');
const context = {
  console,
  SyncEngine: { get: () => null, set: () => undefined },
};
context.window = context;
vm.createContext(context);
vm.runInContext(bodySource, context, { filename: 'athlete-body.js' });
vm.runInContext(dataSource, context, { filename: 'athlete-data.js' });

const invalidRegions = vm.runInContext(
  `Object.keys(BODY_DATA.regions).flatMap(function(code) {
    return BODY_DATA.regions[code].filter(function(region) {
      return !BODY_DATA.polys[region[0]] || !BODY_DATA.polys[region[0]][region[1]];
    }).map(function(region) { return code + ':' + region.join('/'); });
  })`,
  context,
);
assert(invalidRegions.length === 0, `Invalid body regions: ${invalidRegions.join(', ')}`);
assert(vm.runInContext('TESTS.length', context) === 12, 'The test catalogue should contain 12 tests.');
assert(vm.runInContext('ATTRS.length', context) === 8, 'The athlete model should contain eight attributes.');
assert(vm.runInContext("parsePace('12:30')", context) === 750, 'Pace parsing failed.');
assert(
  vm.runInContext("scoreOf(testById('run2400'), 500, { v:500 })", context) === 70,
  '2400 m scoring regression: 8:20 should score 70.',
);
assert(
  vm.runInContext("levelOf(testById('run2400'), 500, { v:500 })", context) === 1,
  '2400 m level regression: 8:20 should be Entry Level 1.',
);
vm.runInContext(
  `state.entries = [{ id:'qa', t:'run2400', d:'2026-09-01', v:500, load:null, dist:null, raw:'8:20', ts:1 }];`,
  context,
);
const model = vm.runInContext('computeModel()', context);
assert(model.ovr === 70 && model.testedCount === 1, 'The aggregate model failed its seeded-state check.');

console.log(`Verified athlete.html: ${scripts.length} scripts, professional settings, 12 tests, 8 attributes, scoring and body map valid.`);
