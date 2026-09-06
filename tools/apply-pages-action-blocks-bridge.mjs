import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
const functionSource = fs.readFileSync(functionPath, 'utf8');
const validEndpoint = '  const response = await fetch("https:" + "//api.notion.com/v1" + path, {';
if (!functionSource.includes(validEndpoint)) throw new Error('Valid Notion endpoint missing');

const todoPath = 'todo-sync.html';
let todo = fs.readFileSync(todoPath, 'utf8');
const keyReader = '    function widgetKey(){try{var hashKey=new URLSearchParams(location.hash.slice(1)).get("key");if(hashKey)return hashKey;return win.localStorage.getItem("_sync_passphrase")||""}catch(error){return""}}';
if (!todo.includes(keyReader)) throw new Error('Hash-aware widget key reader missing');
const onlineGate = '    if(!sync.isOnline||!sync.isOnline()){\n      showStatus("Waiting for widget sync before importing Action Blocks.");\n      return;\n    }\n';
if (todo.includes(onlineGate)) todo = todo.replace(onlineGate, '    showStatus("Loading scheduled tasks...");\n');
if (todo.includes('Waiting for widget sync before importing Action Blocks.')) throw new Error('Worker sync gate remains');
todo = todo.replace('pollTimer=setInterval(syncReadings,60000);', 'pollTimer=setInterval(syncReadings,15000);');
fs.writeFileSync(todoPath, todo);
