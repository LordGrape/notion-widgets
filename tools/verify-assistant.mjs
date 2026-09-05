import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const app = join(root, 'apps', 'assistant');
const required = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-maskable.svg', 'README.md'];
for (const file of required) await access(join(app, file));

const html = await readFile(join(app, 'index.html'), 'utf8');
const script = await readFile(join(app, 'app.js'), 'utf8');
const manifest = JSON.parse(await readFile(join(app, 'manifest.webmanifest'), 'utf8'));

const assertions = [
  [html.includes('rel="manifest"'), 'index links the web manifest'],
  [html.includes('aria-label="Primary navigation"'), 'navigation has an accessible label'],
  [html.includes('../../core.js'), 'application uses the shared runtime'],
  [script.includes("SyncEngine?.get('todo', 'tasks')"), 'application reads the existing task boundary'],
  [script.includes('serviceWorker.register'), 'application registers its service worker'],
  [manifest.display === 'standalone', 'manifest uses standalone display'],
  [Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest provides standard and maskable icons']
];

const failures = assertions.filter(([pass]) => !pass).map(([, message]) => message);
if (failures.length) {
  console.error(`Command Centre verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Command Centre verification passed (${assertions.length} checks).`);
