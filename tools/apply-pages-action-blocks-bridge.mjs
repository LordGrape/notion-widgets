import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
const functionSource = fs.readFileSync(functionPath, 'utf8');
const validEndpoint = '  const response = await fetch("https:" + "//api.notion.com/v1" + path, {';
if (!functionSource.includes(validEndpoint)) throw new Error('Valid Notion endpoint missing');

const todoPath = 'todo-sync.html';
let todo = fs.readFileSync(todoPath, 'utf8');
const oldKeyReader = '    function widgetKey(){try{return win.localStorage.getItem("_sync_passphrase")||""}catch(error){return""}}';
const newKeyReader = '    function widgetKey(){try{var hashKey=new URLSearchParams(location.hash.slice(1)).get("key");if(hashKey)return hashKey;return win.localStorage.getItem("_sync_passphrase")||""}catch(error){return""}}';
if (todo.includes(oldKeyReader)) todo = todo.replace(oldKeyReader, newKeyReader);
if (!todo.includes(newKeyReader)) throw new Error('Hash-aware widget key reader missing');
if (!todo.includes('function installPagesNotionBridge(win)')) throw new Error('Pages bridge missing');
fs.writeFileSync(todoPath, todo);
