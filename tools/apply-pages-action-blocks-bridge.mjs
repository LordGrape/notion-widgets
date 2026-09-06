import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
const functionSource = fs.readFileSync(functionPath, 'utf8');
if (!functionSource.includes('PRIVATE_WIDGET_KEY_HASH')) throw new Error('Private passcode verifier missing');

const todoPath = 'todo-sync.html';
let todo = fs.readFileSync(todoPath, 'utf8');
if (!todo.includes('function installPagesNotionBridge(win)')) throw new Error('Pages bridge missing');
const shellMarker = '  var shell=document.getElementById("todo");\n';
const hashBridge = '  var childHash=location.hash||"";\n  if(childHash&&shell.src.indexOf("#")<0)shell.src=shell.src+childHash;\n';
if (!todo.includes(hashBridge)) {
  if (!todo.includes(shellMarker)) throw new Error('Shell marker missing');
  todo = todo.replace(shellMarker, shellMarker + hashBridge);
}
todo = todo.replace('todo-v2.html?source=20260906-stable-loader-v2', 'todo-v2.html?source=20260906-encrypted-feed-v3');
fs.writeFileSync(todoPath, todo);

const importerSource = fs.readFileSync('todo-action-import.js', 'utf8');
const importerV2 = importerSource.replace('/action-blocks-feed.enc.json?cache=20260906-v1', 'https://cdn.jsdelivr.net/gh/LordGrape/notion-widgets@a06d8b3df72b612a8b2f428ec16e920fc33b6188/action-blocks-feed.enc.json');
if (importerV2 === importerSource) throw new Error('Encrypted feed marker missing');
fs.writeFileSync('todo-action-import-v2.js', importerV2);

const appPath = 'todo.html';
let app = fs.readFileSync(appPath, 'utf8');
const actionScript = '<script src="action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2&targets=20260903-v1&upcoming=20260903-v1"></script>';
const importerScript = '<script src="todo-action-import.js?v=20260906-encrypted-fallback-v2"></script>';
if (!app.includes(importerScript)) {
  if (!app.includes(actionScript)) throw new Error('Action Blocks script marker missing');
  app = app.replace(actionScript, actionScript + '\n' + importerScript);
}
fs.writeFileSync(appPath, app);

const v2Path = 'todo-v2.html';
const v2 = fs.readFileSync(v2Path, 'utf8');
if (v2.includes('todo-action-import.js?v=20260906-direct-v1')) throw new Error('Broken srcdoc injection remains');
