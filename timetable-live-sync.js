(function(root){
  "use strict";
  var POLL_MS=3000,lastPull=0,pulling=false,timer=null;
  function engine(){try{return typeof SyncEngine!=="undefined"?SyncEngine:root.SyncEngine}catch(error){return root.SyncEngine}}
  function announce(){try{root.top.postMessage({type:"command-centre:timetable-synced",receivedAt:Date.now()},"*")}catch(error){}}
  function refresh(force){var sync=engine();if(document.hidden||pulling||!sync||typeof sync.pull!=="function")return;if(!force&&Date.now()-lastPull<1200)return;pulling=true;lastPull=Date.now();Promise.resolve(sync.pull("timetable")).catch(function(){}).then(function(){pulling=false;announce()})}
  function boot(){var sync=engine();if(!sync||typeof sync.pull!=="function"){setTimeout(boot,150);return}refresh(true);clearInterval(timer);timer=setInterval(function(){refresh(false)},POLL_MS);root.addEventListener("message",function(event){if(event.data&&event.data.type==="command-centre:refresh-timetable")refresh(true)});root.addEventListener("focus",function(){refresh(true)});document.addEventListener("visibilitychange",function(){if(!document.hidden)refresh(true)})}
  boot();
})(window);
