import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
const functionSource = fs.readFileSync(functionPath, 'utf8');
if (!functionSource.includes('PRIVATE_WIDGET_KEY_HASH')) throw new Error('Private passcode verifier missing');

const todoPath = 'todo-sync.html';
const todo = fs.readFileSync(todoPath, 'utf8');
if (!todo.includes('function installPagesNotionBridge(win)')) throw new Error('Pages bridge missing');
if (todo.includes('Waiting for widget sync before importing Action Blocks.')) throw new Error('Worker sync gate remains');

const v2Path = 'todo-v2.html';
let v2 = fs.readFileSync(v2Path, 'utf8');
const oldLoader = 'source=source.replace("<head>",\'<head><base href="./">\');document.getElementById("app").srcdoc=source';
const newLoader = 'source=source.replace("<head>",\'<head><base href="./">\');source=source.replace(\'<script src="core.js"></script>\',\'<script src="core.js"></script><script src="todo-action-import.js?v=20260906-direct-v1"></script>\');document.getElementById("app").srcdoc=source';
if (v2.includes(oldLoader)) v2 = v2.replace(oldLoader, newLoader);
if (!v2.includes('todo-action-import.js?v=20260906-direct-v1')) throw new Error('Direct importer was not installed');
fs.writeFileSync(v2Path, v2);
