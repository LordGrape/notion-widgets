import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../core.js', import.meta.url);
const marker = 'SYNCENGINE RESILIENCE LAYER v4';
const source = readFileSync(file, 'utf8');
if (source.includes(marker)) process.exit(0);
const layer = String.raw`
/* SYNCENGINE RESILIENCE LAYER v4
   Non-breaking reactive subscriptions, lifecycle flushing and reconnect recovery. */
(function enhanceSyncEngineV4(){
 if(typeof SyncEngine==='undefined'||SyncEngine.__resilienceV4)return;
 var listeners=[],snapshots=Object.create(null),rawSet=SyncEngine.set,rawMany=SyncEngine.setMany,rawRemove=SyncEngine.remove,rawPull=SyncEngine.pull;
 function id(ns,key){return ns+'::'+(key==null?'*':key)}
 function serialise(value){try{return JSON.stringify(value)}catch(e){return String(value)}}
 function emit(ns,key,value,source){
  snapshots[id(ns,key)]=serialise(value);
  listeners.slice().forEach(function(l){if(l.ns===ns&&(l.key==null||l.key===key))try{l.callback(value,{namespace:ns,key:key,source:source||'local'})}catch(e){}});
  if(typeof Core!=='undefined'&&Core.emit)Core.emit('sync-change',{namespace:ns,key:key,value:value,source:source||'local'});
 }
 function inspect(){listeners.forEach(function(l){if(l.key==null)return;var value=SyncEngine.get(l.ns,l.key),token=serialise(value),k=id(l.ns,l.key);if(!(k in snapshots))snapshots[k]=token;else if(snapshots[k]!==token)emit(l.ns,l.key,value,'remote')})}
 function reconnect(){var spaces=[];listeners.forEach(function(l){if(spaces.indexOf(l.ns)<0)spaces.push(l.ns)});Promise.all(spaces.map(function(ns){return rawPull?rawPull.call(SyncEngine,ns):Promise.resolve()})).then(function(){inspect();SyncEngine.flush()}).catch(function(){})}
 SyncEngine.set=function(ns,key,value){var result=rawSet.apply(SyncEngine,arguments);emit(ns,key,value,'local');return result};
 SyncEngine.setMany=function(ns,values){var result=rawMany.apply(SyncEngine,arguments);Object.keys(values||{}).forEach(function(key){emit(ns,key,values[key],'local')});return result};
 SyncEngine.remove=function(ns,key){var result=rawRemove.apply(SyncEngine,arguments);emit(ns,key,null,'local');return result};
 SyncEngine.pull=function(ns){return rawPull.apply(SyncEngine,arguments).then(function(result){inspect();return result})};
 SyncEngine.subscribe=function(ns,key,callback){if(typeof key==='function'){callback=key;key=null}if(typeof callback!=='function')return function(){};var l={ns:ns,key:key,callback:callback};listeners.push(l);if(key!=null)snapshots[id(ns,key)]=serialise(SyncEngine.get(ns,key));return function(){listeners=listeners.filter(function(x){return x!==l})}};
 SyncEngine.__resilienceV4=true;
 window.addEventListener('online',reconnect);window.addEventListener('focus',inspect);window.addEventListener('pagehide',function(){try{SyncEngine.flush()}catch(e){}});
 document.addEventListener('visibilitychange',function(){if(document.hidden)try{SyncEngine.flush()}catch(e){}else reconnect()});setInterval(inspect,2500);
})();`;
writeFileSync(file, source.replace(/\s*$/, '') + '\n\n' + layer + '\n');
console.log('Installed SyncEngine v4 resilience layer.');
