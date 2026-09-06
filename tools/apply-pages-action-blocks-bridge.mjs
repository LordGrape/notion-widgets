import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
let source = fs.readFileSync(functionPath, 'utf8');
const badLine = '  const response = await fetch(`{{https://api.notion.com/v1${path}}}`, {';
const goodLine = '  const response = await fetch("https:" + "//api.notion.com/v1" + path, {';
if (source.includes(badLine)) source = source.replace(badLine, goodLine);
if (!source.includes(goodLine)) throw new Error('Valid Notion endpoint missing');
fs.writeFileSync(functionPath, source);

const todo = fs.readFileSync('todo-sync.html', 'utf8');
if (!todo.includes('function installPagesNotionBridge(win)')) throw new Error('Pages bridge missing');
if (!todo.includes('    installPagesNotionBridge(win);\n')) throw new Error('Pages bridge is not installed');
