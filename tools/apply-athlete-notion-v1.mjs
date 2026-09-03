import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,content){fs.writeFileSync(path,content)}
function replaceOnce(source,oldText,newText,label){
 const count=source.split(oldText).length-1;
 if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
 return source.replace(oldText,newText);
}

let core=read('core.js');
if(!core.includes('ATHLETE NOTION BRIDGE v1')){
 const anchor='    /** Fetch milestones from the Notion bridge (phase 2).';
 const methods=`    /** ATHLETE NOTION BRIDGE v1: assessment records through the authenticated Worker. */
    syncFitnessTests: function(items) {
      if (!online || !passphrase) return Promise.resolve({ configured: false, items: [] });
      return fetch(WORKER_URL + '/notion/fitness-tests', {
        method: 'POST',
        headers: { 'X-Widget-Key': passphrase, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: Array.isArray(items) ? items : [] })
      })
      .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(function() { return { configured: false, items: [] }; });
    },

    fetchFitnessTests: function() {
      if (!online || !passphrase) return Promise.resolve({ configured: false, items: [] });
      return fetch(WORKER_URL + '/notion/fitness-tests', {
        method: 'GET',
        headers: { 'X-Widget-Key': passphrase }
      })
      .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(function() { return { configured: false, items: [] }; });
    },

    removeFitnessTests: function(ids) {
      if (!online || !passphrase) return Promise.resolve({ configured: false, removed: [] });
      return fetch(WORKER_URL + '/notion/fitness-tests', {
        method: 'DELETE',
        headers: { 'X-Widget-Key': passphrase, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.isArray(ids) ? ids : [] })
      })
      .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(function() { return { configured: false, removed: [] }; });
    },

`;
 core=replaceOnce(core,anchor,methods+anchor,'SyncEngine fitness helpers');
 write('core.js',core);
}

let source=read('athlete.source.html');
if(!source.includes('athlete-notion.js')){
 source=replaceOnce(source,'<script src="athlete-training-ui.js?v=1"></script>\n</body>','<script src="athlete-training-ui.js?v=1"></script>\n<script src="athlete-notion.js?v=1"></script>\n</body>','Athlete bridge script');
 write('athlete.source.html',source);
}

let build=read('tools/build-athlete.mjs');
if(!build.includes("'athlete-notion.js'")){
 const sourceList="const sourceNames=['athlete.source.html','athlete.css','theme-upgrade.css','athlete-settings.css','athlete-training.css','core.js','athlete-body.js','athlete-data.js','athlete-training-data.js','athlete-render.js','athlete-flow.js','athlete-settings.js','athlete-training-ui.js'];";
 const scriptList="const scriptNames=['core.js','athlete-body.js','athlete-data.js','athlete-training-data.js','athlete-render.js','athlete-flow.js','athlete-settings.js','athlete-training-ui.js'];";
 build=replaceOnce(build,sourceList,sourceList.replace("'athlete-training-ui.js']","'athlete-training-ui.js','athlete-notion.js']"),'Athlete build source list');
 build=replaceOnce(build,scriptList,scriptList.replace("'athlete-training-ui.js']","'athlete-training-ui.js','athlete-notion.js']"),'Athlete build script list');
 write('tools/build-athlete.mjs',build);
}

let workerIndex=read('worker/src/index.ts');
if(!workerIndex.includes('handleFitnessTests')){
 workerIndex=replaceOnce(workerIndex,'import { handleUpcomingAssignments } from "./routes/upcoming-assignments";','import { handleUpcomingAssignments } from "./routes/upcoming-assignments";\nimport { handleFitnessTests } from "./routes/fitness-tests";','Worker fitness import');
 const route=`        if (key === "upcoming" && request.method === "GET") {
          return withCorsHeaders(await handleUpcomingAssignments(request, env));
        }`;
 workerIndex=replaceOnce(workerIndex,route,route+`
        if (
          key === "fitness-tests" &&
          (request.method === "GET" || request.method === "POST" || request.method === "DELETE")
        ) {
          return withCorsHeaders(await handleFitnessTests(request, env));
        }`,'Worker fitness route');
 write('worker/src/index.ts',workerIndex);
}

let types=read('worker/src/types.ts');
if(!types.includes('FITNESS_TEST_DB_ID')){
 types=replaceOnce(types,'  UPCOMING_DB_ID?: string;\n','  UPCOMING_DB_ID?: string;\n  FITNESS_TEST_DB_ID?: string;\n','Worker fitness environment type');
 write('worker/src/types.ts',types);
}

let apps=read('apps/README.md');
if(!apps.includes('`athlete/`')){
 apps=replaceOnce(apps,'| `timetable/` | `../timetable.html` | Schedule, week view, milestone radar |\n','| `timetable/` | `../timetable.html` | Schedule, week view, milestone radar |\n| `athlete/` | `../athlete.html` | Assessments and training, with important test results mirrored to Notion |\n','Athlete app map');
 write('apps/README.md',apps);
}

execFileSync(process.execPath,['tools/build-athlete.mjs'],{stdio:'inherit'});
console.log('Applied Athlete Notion bridge v1.');
