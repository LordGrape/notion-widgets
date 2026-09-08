(function(root){
  "use strict";
  var installed=false,pushing=false,pending=false;
  function engine(){try{return typeof SyncEngine!=="undefined"?SyncEngine:root.SyncEngine}catch(error){return root.SyncEngine}}
  function announce(status){try{root.top.postMessage({type:status||"command-centre:timetable-updated",sentAt:Date.now()},"*")}catch(error){}}
  function pushNow(){if(pushing){pending=true;return}pushing=true;var job,sync=engine();try{job=sync&&sync.push?sync.push("timetable"):sync&&sync.flush?sync.flush():Promise.resolve()}catch(error){job=Promise.resolve()}Promise.resolve(job).then(function(){announce("command-centre:timetable-updated")}).catch(function(){announce("command-centre:timetable-updated")}).then(function(){pushing=false;if(pending){pending=false;pushNow()}})}
  function install(){if(installed)return;var sync=engine();if(!sync||typeof sync.set!=="function"){setTimeout(install,120);return}installed=true;var rawSet=sync.set;sync.set=function(namespace,key,value){var result=rawSet.apply(sync,arguments);if(namespace==="timetable"&&key==="courses")pushNow();return result};sync.__seamlessTimetablePush=true}
  install();
})(window);
