(function(root){
  "use strict";
  var started=false;
  function pad(value){return String(value).padStart(2,"0")}
  function dateKey(date){date=date||new Date();return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())}
  function range(days){var date=new Date();date.setDate(date.getDate()+days);return dateKey(date)}
  function parseList(value){if(Array.isArray(value))return value;if(typeof value==="string")try{var parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}catch(error){}return[]}
  function passcode(){
    try{
      var hash=(root.parent&&root.parent!==root?root.parent.location.hash:root.location.hash)||"";
      var value=new URLSearchParams(hash.slice(1)).get("key");
      if(value)return value;
    }catch(error){}
    try{return root.localStorage.getItem("_sync_passphrase")||""}catch(error){return""}
  }
  function dueState(key){if(key===dateKey())return"today";if(key===range(1))return"tomorrow";return null}
  function timeBand(minutes){return minutes<=20?"quick":minutes<=45?"m30":minutes<=90?"m60":"deep"}
  function bytes(value){var raw=atob(value),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
  function decryptFeed(payload,keyText){
    var encoder=new TextEncoder();
    return crypto.subtle.importKey("raw",encoder.encode(keyText),"PBKDF2",false,["deriveKey"]).then(function(material){
      return crypto.subtle.deriveKey({name:"PBKDF2",salt:bytes(payload.salt),iterations:payload.iterations||100000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["decrypt"]);
    }).then(function(key){return crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(payload.iv)},key,bytes(payload.ciphertext))}).then(function(clear){return JSON.parse(new TextDecoder().decode(clear))});
  }
  function merge(items){
    var tasks=parseList(root.SyncEngine.get("todo","tasks")),changed=false;
    parseList(items).forEach(function(item){
      if(!item||!item.scheduledStart)return;
      var occurrence=item.occurrenceId||("notion:"+item.notionPageId);
      var task=tasks.find(function(candidate){return candidate&&((candidate.occurrenceId&&candidate.occurrenceId===occurrence)||(candidate.notionPageId&&candidate.notionPageId===item.notionPageId))});
      var allDay=/^\d{4}-\d{2}-\d{2}$/.test(String(item.scheduledStart));
      var key=allDay?String(item.scheduledStart):dateKey(new Date(item.scheduledStart));
      var planned=Math.max(1,Number(item.plannedMinutes)||30),done=item.status==="Done"||item.status==="Skipped";
      if(!task){
        tasks.push({id:occurrence,text:item.action||"Notion action",pri:String(item.priority||"").toLowerCase()||null,time:timeBand(planned),due:dueState(key),dueKey:key,setKey:key,done:done,doneAt:done?Date.now():null,created:Date.parse(item.scheduledStart)||Date.now(),updatedAt:Date.now(),order:Date.parse(item.scheduledStart)||Date.now(),notes:item.notes||"",category:String(item.category||"Personal").toLowerCase(),source:"notion",occurrenceId:occurrence,notionPageId:item.notionPageId||null,scheduledStart:item.scheduledStart,scheduledEnd:item.scheduledEnd||null,allDay:allDay,contextPageId:item.contextPageId||null,plannedMinutes:planned,outcome:item.status==="Skipped"?"skipped":null});
        changed=true;
      }else{
        var next={text:item.action||task.text,pri:String(item.priority||"").toLowerCase()||null,time:timeBand(planned),due:dueState(key),dueKey:key,setKey:key,done:done,notes:item.notes||task.notes||"",category:String(item.category||"Personal").toLowerCase(),notionPageId:item.notionPageId||task.notionPageId||null,scheduledStart:item.scheduledStart,scheduledEnd:item.scheduledEnd||null,allDay:allDay,contextPageId:item.contextPageId||task.contextPageId||null,plannedMinutes:planned};
        Object.keys(next).forEach(function(name){if(task[name]!==next[name]){task[name]=next[name];changed=true}});
        if(changed)task.updatedAt=Date.now();
      }
    });
    if(changed){root.SyncEngine.set("todo","tasks",JSON.stringify(tasks));setTimeout(function(){try{root.dispatchEvent(new Event("focus"))}catch(error){}},0)}
    return tasks.length;
  }
  function encryptedFallback(key){
    return fetch("/action-blocks-feed.enc.json?cache=20260906-v1",{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json()}).then(function(payload){return decryptFeed(payload,key)}).then(function(feed){merge(feed.items||[]);return true});
  }
  function load(){
    var key=passcode();if(!key)return;
    var endpoint="/notion/action-blocks?from="+encodeURIComponent(range(-1))+"&to="+encodeURIComponent(range(14));
    fetch(endpoint,{cache:"no-store",headers:{"X-Widget-Key":key}}).then(function(response){if(!response.ok)throw new Error(String(response.status));return response.json()}).then(function(result){if(!result||result.configured===false||!Array.isArray(result.items)||!result.items.length)throw new Error("empty");merge(result.items)}).catch(function(){return encryptedFallback(key)}).catch(function(error){console.error("Action Block import failed",error)});
  }
  function boot(){
    if(started)return;
    if(!root.SyncEngine||typeof root.SyncEngine.onReady!=="function"){setTimeout(boot,100);return}
    started=true;root.SyncEngine.onReady(function(){load();setInterval(load,15000)});
  }
  boot();
})(window);
