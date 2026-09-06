import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
let functionSource = fs.readFileSync(functionPath, 'utf8');
const badEndpoint = 'fetch(`{{https://api.notion.com/v1${path}}}`,';
const goodEndpoint = 'fetch(`https://api.notion.com/v1${path}`,';
if (functionSource.includes(badEndpoint)) functionSource = functionSource.replace(badEndpoint, goodEndpoint);
if (!functionSource.includes(goodEndpoint)) throw new Error('Pages Notion endpoint marker missing');
fs.writeFileSync(functionPath, functionSource);

const todoPath = 'todo-sync.html';
let todo = fs.readFileSync(todoPath, 'utf8');
if (!todo.includes('function installPagesNotionBridge(win)')) throw new Error('Pages bridge missing');
if (!todo.includes('    installPagesNotionBridge(win);\n')) throw new Error('Pages bridge is not installed');
fs.writeFileSync(todoPath, todo);
