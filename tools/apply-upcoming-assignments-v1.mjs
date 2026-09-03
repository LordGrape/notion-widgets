import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(source,oldStr,newStr,label){
  const count=source.split(oldStr).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(oldStr,newStr);
}

let core=read('core.js');
if(!core.includes('fetchUpcomingAssignments: function')){
  core=replaceOnce(core,
`    /** Fetch milestones from the Notion bridge (phase 2).`,
`    /** Pull the next 14 days of assignment deadlines and their user-authored phases. */
    fetchUpcomingAssignments: function(from, to) {
      if (!online || !passphrase) return Promise.resolve({ configured: false, assignments: [] });
      let endpoint = WORKER_URL + '/notion/upcoming';
      let qs = [];
      if (from) qs.push('from=' + encodeURIComponent(from));
      if (to) qs.push('to=' + encodeURIComponent(to));
      if (qs.length) endpoint += '?' + qs.join('&');
      return fetch(endpoint, { method: 'GET', headers: { 'X-Widget-Key': passphrase } })
        .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .catch(function() { return { configured: false, assignments: [] }; });
    },

    /** Fetch milestones from the Notion bridge (phase 2).`,
'Upcoming SyncEngine client');
}
write('core.js',core);

let workerTypes=read('worker/src/types.ts');
if(!workerTypes.includes('UPCOMING_DB_ID?: string;')){
  workerTypes=replaceOnce(workerTypes,'  ACTION_BLOCKS_DB_ID?: string;','  ACTION_BLOCKS_DB_ID?: string;\n  UPCOMING_DB_ID?: string;','Upcoming database environment type');
}
write('worker/src/types.ts',workerTypes);

let workerIndex=read('worker/src/index.ts');
if(!workerIndex.includes('handleUpcomingAssignments')){
  workerIndex=replaceOnce(workerIndex,'import { handleActionBlocks } from "./routes/action-blocks";','import { handleActionBlocks } from "./routes/action-blocks";\nimport { handleUpcomingAssignments } from "./routes/upcoming-assignments";','Upcoming route import');
  workerIndex=replaceOnce(workerIndex,
`        if (key === "action-blocks" && (request.method === "GET" || request.method === "POST")) {
          return withCorsHeaders(await handleActionBlocks(request, env));
        }
        return json({ error: "Unknown Notion resource" }, 404);`,
`        if (key === "action-blocks" && (request.method === "GET" || request.method === "POST")) {
          return withCorsHeaders(await handleActionBlocks(request, env));
        }
        if (key === "upcoming" && request.method === "GET") {
          return withCorsHeaders(await handleUpcomingAssignments(request, env));
        }
        return json({ error: "Unknown Notion resource" }, 404);`,
'Upcoming route registration');
}
write('worker/src/index.ts',workerIndex);

let actionRoute=read('worker/src/routes/action-blocks.ts');
if(!actionRoute.includes('contextPageId?: string | null;')){
  actionRoute=replaceOnce(actionRoute,
`  scheduledStart: string;
  scheduledEnd?: string | null;`,
`  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  contextPageId?: string | null;`,
'Action Block phase input');
  actionRoute=replaceOnce(actionRoute,
`    Scheduled: { date: { start: item.scheduledStart, end: item.scheduledEnd || null } },`,
`    Scheduled: item.scheduledStart ? { date: { start: item.scheduledStart, end: item.scheduledEnd || null } } : { date: null },`,
'Optional phase date');
  actionRoute=replaceOnce(actionRoute,
`  if (item.priority) properties.Priority = { select: { name: item.priority } };`,
`  if (item.contextPageId !== undefined) {
    properties.Context = { relation: item.contextPageId ? [{ id: item.contextPageId }] : [] };
  }
  if (item.priority) properties.Priority = { select: { name: item.priority } };`,
'Assignment relation write');
  actionRoute=replaceOnce(actionRoute,
`    scheduleId: text(p["Schedule ID"]) || null,
    action: text(p.Action),`,
`    scheduleId: text(p["Schedule ID"]) || null,
    contextPageId: p.Context?.relation?.[0]?.id || null,
    action: text(p.Action),`,
'Assignment relation read');
  actionRoute=replaceOnce(actionRoute,
`        if (!item?.occurrenceId || !item?.action || !item?.scheduledStart) continue;`,
`        if (!item?.occurrenceId || !item?.action) continue;
        if (!item.scheduledStart && !item.contextPageId) continue;`,
'Allow unscheduled linked phases');
}
write('worker/src/routes/action-blocks.ts',actionRoute);

let action=read('action-blocks.js');
if(!action.includes('UPCOMING ASSIGNMENT PHASES v1')){
  action=replaceOnce(action,'/* ADAPTIVE WEEKLY TARGETS v1 */','/* ADAPTIVE WEEKLY TARGETS v1 */\n/* UPCOMING ASSIGNMENT PHASES v1 */','Action phase marker');
  action=replaceOnce(action,
`return{notionPageId:t.notionPageId||undefined,occurrenceId:t.occurrenceId,`,
`return{notionPageId:t.notionPageId||undefined,contextPageId:t.contextPageId||undefined,occurrenceId:t.occurrenceId,`,
'Preserve assignment context');
  action=replaceOnce(action,
`parseList(tasks).some(function(t){if(!t||t.done||!t.scheduledStart)return false;`,
`parseList(tasks).some(function(t){if(!t||t.done||!t.scheduledStart||t.allDay)return false;`,
'Keep date-only phases quiet');
  action=replaceOnce(action,
`dueKey:dateKey(new Date(r.scheduledStart)),setKey:dateKey(new Date(r.scheduledStart)),`,
`dueKey:/^\\d{4}-\\d{2}-\\d{2}$/.test(String(r.scheduledStart))?r.scheduledStart:dateKey(new Date(r.scheduledStart)),setKey:/^\\d{4}-\\d{2}-\\d{2}$/.test(String(r.scheduledStart))?r.scheduledStart:dateKey(new Date(r.scheduledStart)),`,
'Date-only phase key');
  action=replaceOnce(action,
`notionPageId:r.notionPageId,scheduledStart:r.scheduledStart,scheduledEnd:r.scheduledEnd,outcome:`,
`notionPageId:r.notionPageId,scheduledStart:r.scheduledStart,scheduledEnd:r.scheduledEnd,allDay:/^\\d{4}-\\d{2}-\\d{2}$/.test(String(r.scheduledStart)),contextPageId:r.contextPageId||null,assignmentPhase:String(oid).indexOf('assignment:')===0,outcome:`,
'Phase task metadata');
  action=replaceOnce(action,
`if(r.notionPageId&&t.notionPageId!==r.notionPageId){t.notionPageId=r.notionPageId;changed=true}if((r.status==='Done'||r.status==='Skipped')&&!t.done){`,
`if(r.notionPageId&&t.notionPageId!==r.notionPageId){t.notionPageId=r.notionPageId;changed=true}if(r.contextPageId&&t.contextPageId!==r.contextPageId){t.contextPageId=r.contextPageId;t.assignmentPhase=String(oid).indexOf('assignment:')===0;changed=true}var remoteAllDay=/^\\d{4}-\\d{2}-\\d{2}$/.test(String(r.scheduledStart)),remoteDue=remoteAllDay?r.scheduledStart:dateKey(new Date(r.scheduledStart));if(t.allDay!==remoteAllDay){t.allDay=remoteAllDay;changed=true}if(t.dueKey!==remoteDue){t.dueKey=remoteDue;t.due=remoteDue===dateKey()?'today':(remoteDue===range(1)?'tomorrow':t.due);changed=true}if(r.action&&t.text!==r.action){t.text=r.action;changed=true}if(t.scheduledStart!==r.scheduledStart){t.scheduledStart=r.scheduledStart;changed=true}if((r.status==='Done'||r.status==='Skipped')&&!t.done){`,
'Update planned phases from Notion');
}
write('action-blocks.js',action);

let todo=read('todo.html');
if(!todo.includes('UPCOMING ASSIGNMENTS v1')){
  todo=replaceOnce(todo,'/* ADAPTIVE WEEKLY TARGETS v1 */','/* ADAPTIVE WEEKLY TARGETS v1 */\n/* UPCOMING ASSIGNMENTS v1 */','To-do upcoming marker');
  todo=replaceOnce(todo,
`<script src="action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2&targets=20260903-v1"></script>`,
`<script src="action-blocks.js?v=20260902-editor-v2&planning=20260903-v1&copy=20260903-v2&targets=20260903-v1&upcoming=20260903-v1"></script>
<script src="upcoming-assignments.js?v=20260903-v1"></script>`,
'Upcoming module load');
}
write('todo.html',todo);

let readme=read('apps/todo/README.md');
if(!readme.includes('## Upcoming assignments'))readme+=`\n## Upcoming assignments\n- A quiet section reads up to five incomplete records tagged \`assignment 📑\` from the next 14 calendar days in Domains and HQ.\n- The section is collapsed by default and does not affect daily workload, completion, or notifications.\n- The assignment remains the overall outcome. User-authored phases are stored as linked Action Blocks through the existing \`Context\` relation.\n- A phase enters Today or Tomorrow only after the user assigns that phase a date. Date-only phases remain flexible and do not trigger timed reminders.\n`;
write('apps/todo/README.md',readme);

if(!core.includes('fetchUpcomingAssignments')||!workerIndex.includes('handleUpcomingAssignments'))throw new Error('Upcoming Notion bridge missing');
if(!actionRoute.includes('contextPageId?: string | null')||!action.includes('UPCOMING ASSIGNMENT PHASES v1'))throw new Error('Assignment phase persistence missing');
if(!todo.includes('upcoming-assignments.js?v=20260903-v1'))throw new Error('Upcoming interface missing');
console.log('Applied upcoming assignments and phases');
