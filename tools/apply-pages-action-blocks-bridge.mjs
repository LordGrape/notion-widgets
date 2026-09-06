import fs from 'node:fs';

const functionPath = 'functions/notion/action-blocks.js';
let functionSource = fs.readFileSync(functionPath, 'utf8');
const badEndpoint = 'fetch(`{{https://api.notion.com/v1${path}}}`,';
const goodEndpoint = 'fetch(`https://api.notion.com/v1${path}`,';
if (functionSource.includes(badEndpoint)) {
  functionSource = functionSource.replace(badEndpoint, goodEndpoint);
}
if (!functionSource.includes(goodEndpoint)) throw new Error('Pages Notion endpoint marker missing');
fs.writeFileSync(functionPath, functionSource);

const todoPath = 'todo-sync.html';
let todo = fs.readFileSync(todoPath, 'utf8');
const marker = '  function syncReadings(){\n';
if (!todo.includes('function installPagesNotionBridge(win)')) {
  const bridge = `  function installPagesNotionBridge(win){
    if(location.hostname!=="notion-widgets-93r.pages.dev")return;
    var sync=win.SyncEngine;
    if(!sync||sync.__pagesNotionBridge)return;
    function widgetKey(){try{return win.localStorage.getItem("_sync_passphrase")||""}catch(error){return""}}
    function request(method,items,from,to){
      var key=widgetKey();
      if(!key)return Promise.resolve({configured:false,items:[]});
      var endpoint="/notion/action-blocks",query=[];
      if(from)query.push("from="+encodeURIComponent(from));
      if(to)query.push("to="+encodeURIComponent(to));
      if(query.length)endpoint+="?"+query.join("&");
      var options={method:method,headers:{"X-Widget-Key":key}};
      if(method==="POST"){
        options.headers["Content-Type"]="application/json";
        options.body=JSON.stringify({items:Array.isArray(items)?items:[]});
      }
      return fetch(endpoint,options).then(function(response){
        if(!response.ok)throw new Error(String(response.status));
        return response.json();
      }).catch(function(){return{configured:false,items:[]}});
    }
    sync.fetchActionBlocks=function(from,to){return request("GET",null,from,to)};
    sync.syncActionBlocks=function(items){return request("POST",items)};
    sync.__pagesNotionBridge=true;
  }

`;
  if (!todo.includes(marker)) throw new Error('todo-sync insertion marker missing');
  todo = todo.replace(marker, bridge + marker);
}
const guard = '    installPayloadGuard(win);\n';
if (!todo.includes('    installPagesNotionBridge(win);\n')) {
  if (!todo.includes(guard)) throw new Error('todo-sync bridge marker missing');
  todo = todo.replace(guard, guard + '    installPagesNotionBridge(win);\n');
}
fs.writeFileSync(todoPath, todo);
