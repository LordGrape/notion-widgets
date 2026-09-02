import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(path,oldStr,newStr,label){
  const src=read(path),count=src.split(oldStr).length-1;
  if(count!==1)throw new Error(`${label}: expected one match in ${path}, found ${count}`);
  write(path,src.replace(oldStr,newStr));
}
function addClient(path){
  const marker='<script src="action-blocks.js"></script>';
  if(read(path).includes(marker))return;
  replaceOnce(path,'<script src="core.js"></script>\n<script>','<script src="core.js"></script>\n<script src="action-blocks.js"></script>\n<script>',`Action Blocks client for ${path}`);
}

addClient('timetable.html');
addClient('todo.html');

if(!read('core.js').includes('syncActionBlocks: function(items)')){
  const bridge=`    /** Upsert dated Action Blocks through the authenticated Worker. */
    syncActionBlocks: function(items) {
      if (!online || !passphrase) return Promise.resolve({ configured: false, items: [] });
      return fetch(WORKER_URL + '/notion/action-blocks', {
        method: 'POST',
        headers: { 'X-Widget-Key': passphrase, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: Array.isArray(items) ? items : [] })
      })
      .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(function() { return { configured: false, items: [] }; });
    },

    /** Pull Action Blocks changed in Notion for a bounded date window. */
    fetchActionBlocks: function(from, to) {
      if (!online || !passphrase) return Promise.resolve({ configured: false, items: [] });
      let endpoint = WORKER_URL + '/notion/action-blocks';
      let qs = [];
      if (from) qs.push('from=' + encodeURIComponent(from));
      if (to) qs.push('to=' + encodeURIComponent(to));
      if (qs.length) endpoint += '?' + qs.join('&');
      return fetch(endpoint, { method: 'GET', headers: { 'X-Widget-Key': passphrase } })
      .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(function() { return { configured: false, items: [] }; });
    },

`;
  replaceOnce('core.js','    /** Fetch milestones from the Notion bridge (phase 2).',bridge+'    /** Fetch milestones from the Notion bridge (phase 2).','Core Action Blocks API');
}

if(!read('worker/src/index.ts').includes('handleActionBlocks')){
  replaceOnce('worker/src/index.ts','import { handleNotionMilestones } from "./routes/notion";','import { handleNotionMilestones } from "./routes/notion";\nimport { handleActionBlocks } from "./routes/action-blocks";','Worker Action Blocks import');
  replaceOnce(
    'worker/src/index.ts',
`        if (key === "milestones" && request.method === "GET") {
          return withCorsHeaders(await handleNotionMilestones(request, env));
        }
        return json({ error: "Unknown Notion resource" }, 404);`,
`        if (key === "milestones" && request.method === "GET") {
          return withCorsHeaders(await handleNotionMilestones(request, env));
        }
        if (key === "action-blocks" && (request.method === "GET" || request.method === "POST")) {
          return withCorsHeaders(await handleActionBlocks(request, env));
        }
        return json({ error: "Unknown Notion resource" }, 404);`,
    'Worker Action Blocks route'
  );
}

if(!read('worker/src/types.ts').includes('ACTION_BLOCKS_DB_ID')){
  replaceOnce('worker/src/types.ts','  NOTION_DB_ID?: string;','  NOTION_DB_ID?: string;\n  ACTION_BLOCKS_DB_ID?: string;','Worker Action Blocks environment');
}

console.log('Applied Action Blocks v1 integration.');
