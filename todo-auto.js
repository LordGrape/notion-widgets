(function(root){
  "use strict";
  function enableAutomatic(){
    var toggle=document.getElementById("smartAddToggle"),label=document.getElementById("smartAddLabel");
    if(toggle&&label&&String(label.textContent).trim().toLowerCase()==="off") toggle.click();
    if(toggle) toggle.remove();
    try{if(root.SyncEngine)root.SyncEngine.set("todo","smartAddSettings",JSON.stringify({enabled:true}))}catch(error){}
  }
  function boot(){enableAutomatic();new MutationObserver(enableAutomatic).observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})(window);
