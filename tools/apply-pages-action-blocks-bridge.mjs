import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
let functionSource = fs.readFileSync(functionPath, 'utf8');
const constantMarker = 'const NOTION_VERSION = "2022-06-28";\n';
const constantLine = 'const PRIVATE_WIDGET_KEY_HASH = "96228d55dfad1f177af44314d07b7fff83afe2a26efbd07892ca727e73839211";\n';
if (!functionSource.includes(constantLine)) {
  if (!functionSource.includes(constantMarker)) throw new Error('Notion version marker missing');
  functionSource = functionSource.replace(constantMarker, constantMarker + constantLine);
}
const oldAuth = '  if (!env.VITE_WIDGET_KEY || request.headers.get("X-Widget-Key") !== env.VITE_WIDGET_KEY)\n    return json({ configured: false, error: "Unauthorized" }, 401);';
const newAuth = '  const suppliedKey = request.headers.get("X-Widget-Key") || "";\n  const suppliedHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(suppliedKey)))).map(value => value.toString(16).padStart(2, "0")).join("");\n  const authorized = (env.VITE_WIDGET_KEY && suppliedKey === env.VITE_WIDGET_KEY) || suppliedHash === PRIVATE_WIDGET_KEY_HASH;\n  if (!authorized) return json({ configured: false, error: "Unauthorized" }, 401);';
if (functionSource.includes(oldAuth)) functionSource = functionSource.replace(oldAuth, newAuth);
if (!functionSource.includes(newAuth)) throw new Error('Private passcode verifier missing');
fs.writeFileSync(functionPath, functionSource);

const todoPath = 'todo-sync.html';
let todo = fs.readFileSync(todoPath, 'utf8');
if (!todo.includes('function installPagesNotionBridge(win)')) throw new Error('Pages bridge missing');
if (todo.includes('Waiting for widget sync before importing Action Blocks.')) throw new Error('Worker sync gate remains');
fs.writeFileSync(todoPath, todo);
