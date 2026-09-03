'use strict';
/* ATHLETE NOTION BRIDGE v1
   Assessments mirror into the existing JTF2 Test Log through the authenticated
   Worker. Workouts and settings stay in SyncEngine to avoid Notion clutter. */
(function initAthleteNotionBridge(){
 if(typeof window==='undefined'||typeof SyncEngine==='undefined'||typeof state==='undefined'||typeof save!=='function')return;
 if(window.AthleteNotionBridge&&window.AthleteNotionBridge.ready)return;

 var baseSave=save;
 var baseLoadState=typeof loadState==='function'?loadState:null;
 var known=Object.create(null);
 var queue=Promise.resolve();
 var reconciling=false;
 var lastReconcile=0;
 var api={ready:true};

 function entries(){return Array.isArray(state.entries)?state.entries:[]}
 function ensureBridgeState(){
  if(!Array.isArray(state.entries))state.entries=[];
  if(!Array.isArray(state.notionTombstones))state.notionTombstones=[];
 }
 function numberKey(value){return value==null?'':Number(value).toFixed(4)}
 function fingerprint(entry){return [entry.t||'',entry.d||'',numberKey(entry.v),numberKey(entry.load),numberKey(entry.dist)].join('|')}
 function signature(entry){
  return fingerprint(entry)+'|'+String(entry.raw||'')+'|'+String(entry.ts||0)+'|'+String(entry.sourceWorkoutId||'');
 }
 function snapshot(list){
  var out=Object.create(null);
  (list||[]).forEach(function(entry){if(entry&&entry.id)out[entry.id]=signature(entry)});
  return out;
 }
 function uniqueStrings(list){
  var seen=Object.create(null),out=[];
  (list||[]).forEach(function(value){value=String(value||'');if(value&&!seen[value]){seen[value]=1;out.push(value)}});
  return out;
 }
 function stateEntry(item){
  var out={id:String(item.id),t:String(item.t),d:String(item.d),v:Number(item.v),load:item.load==null?null:Number(item.load),dist:item.dist==null?null:Number(item.dist),raw:String(item.raw||''),ts:Number(item.ts)||Date.now()};
  if(item.sourceWorkoutId)out.sourceWorkoutId=String(item.sourceWorkoutId);
  return out;
 }
 function payload(entry){
  var test=typeof testById==='function'?testById(entry.t):null;
  if(!test)return null;
  var level=typeof levelOf==='function'?levelOf(test,entry.v,entry):0;
  var score=typeof scoreOf==='function'?scoreOf(test,entry.v,entry):10;
  return {
   id:String(entry.id),t:String(entry.t),d:String(entry.d),v:Number(entry.v),
   load:entry.load==null?null:Number(entry.load),dist:entry.dist==null?null:Number(entry.dist),
   raw:String(entry.raw||''),ts:Number(entry.ts)||Date.now(),score:Number(score),
   level:level>0?'L'+level:'Below L1',
   sourceWorkoutId:entry.sourceWorkoutId?String(entry.sourceWorkoutId):undefined
  };
 }
 function mergeEntries(localList,remoteList,tombstones){
  var blocked=Object.create(null),localById=Object.create(null),localByPrint=Object.create(null),remoteIds=Object.create(null);
  uniqueStrings(tombstones).forEach(function(id){blocked[id]=1});
  var merged=[];
  (localList||[]).forEach(function(entry){
   if(!entry||!entry.id||blocked[entry.id])return;
   var clean=stateEntry(entry);
   localById[clean.id]=clean;
   if(!localByPrint[fingerprint(clean)])localByPrint[fingerprint(clean)]=clean;
   merged.push(clean);
  });
  (remoteList||[]).forEach(function(item){
   if(!item||!item.id||blocked[item.id])return;
   var remote=stateEntry(item);
   remoteIds[remote.id]=1;
   if(localById[remote.id]){
    for(var i=0;i<merged.length;i++)if(merged[i].id===remote.id){merged[i]=remote;break}
    localById[remote.id]=remote;
    localByPrint[fingerprint(remote)]=remote;
    return;
   }
   if(localByPrint[fingerprint(remote)])return;
   merged.push(remote);
   localById[remote.id]=remote;
   localByPrint[fingerprint(remote)]=remote;
  });
  var backfill=merged.filter(function(entry){return !remoteIds[entry.id]&&!blocked[entry.id]});
  return {entries:merged,backfill:backfill};
 }
 function setStatus(label){try{if(typeof setSync==='function')setSync(label)}catch(e){}}
 function remember(){known=snapshot(entries())}
 function persistBridgeState(){try{baseSave()}catch(e){}}
 function chunked(list,size){var out=[];for(var i=0;i<list.length;i+=size)out.push(list.slice(i,i+size));return out}
 function enqueue(work){
  queue=queue.then(work,work).catch(function(){setStatus('Local')});
  return queue;
 }
 function syncEntries(list){
  var batches=chunked((list||[]).map(payload).filter(Boolean),25);
  if(!batches.length||typeof SyncEngine.syncFitnessTests!=='function')return Promise.resolve({configured:false});
  var configured=false;
  return batches.reduce(function(chain,batch){
   return chain.then(function(){return SyncEngine.syncFitnessTests(batch)}).then(function(result){configured=configured||!!(result&&result.configured)});
  },Promise.resolve()).then(function(){setStatus(configured?'Synced':'Local');return {configured:configured}});
 }
 function removeEntries(ids){
  ids=uniqueStrings(ids);
  if(!ids.length||typeof SyncEngine.removeFitnessTests!=='function')return Promise.resolve({configured:false,removed:[]});
  return SyncEngine.removeFitnessTests(ids).then(function(result){
   if(result&&result.configured){
    var removed=Object.create(null);(result.removed||ids).forEach(function(id){removed[id]=1});
    state.notionTombstones=uniqueStrings(state.notionTombstones).filter(function(id){return !removed[id]});
    persistBridgeState();remember();setStatus('Synced');
   }else setStatus('Local');
   return result;
  });
 }

 save=function(){
  ensureBridgeState();
  var before=known;
  var result=baseSave.apply(this,arguments);
  var after=snapshot(entries()),changed=[],removed=[];
  entries().forEach(function(entry){if(entry&&entry.id&&before[entry.id]!==after[entry.id])changed.push(entry)});
  Object.keys(before).forEach(function(id){if(!after[id])removed.push(id)});
  if(changed.length){
   var revived=Object.create(null);changed.forEach(function(entry){revived[entry.id]=1});
   state.notionTombstones=uniqueStrings(state.notionTombstones).filter(function(id){return !revived[id]});
  }
  if(removed.length)state.notionTombstones=uniqueStrings(state.notionTombstones.concat(removed));
  if(changed.length||removed.length)persistBridgeState();
  remember();
  if(changed.length||removed.length){
   setStatus('Saving');
   enqueue(function(){return removeEntries(removed).then(function(){return syncEntries(changed)})});
  }
  return result;
 };

 if(baseLoadState){
  loadState=function(){var result=baseLoadState.apply(this,arguments);ensureBridgeState();remember();return result};
 }

 function reconcile(force){
  ensureBridgeState();
  var now=Date.now();
  if(reconciling||(!force&&now-lastReconcile<60000))return Promise.resolve();
  if(!SyncEngine.isOnline||!SyncEngine.isOnline()||typeof SyncEngine.fetchFitnessTests!=='function')return Promise.resolve();
  reconciling=true;lastReconcile=now;setStatus('Syncing');
  var pending=uniqueStrings(state.notionTombstones);
  return removeEntries(pending).then(function(){
   return SyncEngine.fetchFitnessTests();
  }).then(function(result){
   if(!result||!result.configured){setStatus('Local');return}
   var merged=mergeEntries(entries(),result.items||[],state.notionTombstones);
   state.entries=merged.entries;
   persistBridgeState();remember();
   try{if(typeof renderAll==='function')renderAll()}catch(e){}
   return syncEntries(merged.backfill);
  }).then(function(){setStatus('Synced')}).catch(function(){setStatus('Local')}).then(function(){reconciling=false},function(){reconciling=false});
 }

 api.fingerprint=fingerprint;
 api.payload=payload;
 api.mergeEntries=mergeEntries;
 api.reconcile=reconcile;
 window.AthleteNotionBridge=api;
 ensureBridgeState();remember();
 try{SyncEngine.onReady(function(){reconcile(true)})}catch(e){}
 document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(function(){reconcile(false)},350)});
})();
