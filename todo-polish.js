(function(root){
  "use strict";
  function injectStyles(){
    if(document.getElementById("todoPolishStyles"))return;
    var style=document.createElement("style");style.id="todoPolishStyles";
    style.textContent='.item.editing{padding:11px!important}.item.editing>.acts{display:none!important}.item.editing>.body{width:100%}.editor{gap:7px!important;margin-top:9px!important;padding-top:9px!important}.editor .e-outcome,.editor .e-plan,.editor .subs,.editor .e-notes,.editor .emove[data-dir],.editor .tbox-toggle,.editor .tbox{display:none!important}.item.todo-advanced .editor .e-outcome,.item.todo-advanced .editor .e-plan,.item.todo-advanced .editor .subs,.item.todo-advanced .editor .e-notes{display:block!important}.item.todo-advanced .editor .tbox-toggle{display:inline-flex!important}.item.todo-advanced .editor .tbox.open{display:flex!important}.editor .erow{display:grid!important;grid-template-columns:48px minmax(0,1fr);align-items:start!important;gap:6px!important}.editor .elab{width:auto!important;padding-top:7px}.editor .eopts{gap:5px!important}.editor .eopt{min-height:32px;padding:5px 10px!important}.editor .e-title{min-height:40px;padding:9px 11px!important}.editor .eactions{margin-top:2px}.todo-more{border:1px solid var(--border-default);background:var(--surface-0);color:var(--text-secondary);font:700 .72rem var(--font);min-height:34px;padding:6px 11px;border-radius:10px;cursor:pointer}.todo-more:hover{border-color:var(--border-accent);color:var(--accent-primary)}.editor .edone{min-height:34px;padding:7px 17px!important}@media(max-width:360px){.editor .erow{grid-template-columns:1fr}.editor .elab{padding-top:0}.editor .eopt{padding:5px 8px!important}}';
    document.head.appendChild(style);
  }
  function enhanceEditor(item){
    if(!item||item.querySelector(".todo-more"))return;
    var editor=item.querySelector(".editor"),actions=editor&&editor.querySelector(".eactions");if(!actions)return;
    var button=document.createElement("button");button.type="button";button.className="todo-more";button.textContent="More options";button.setAttribute("aria-expanded","false");
    actions.insertBefore(button,actions.firstChild);button.addEventListener("click",function(){var open=item.classList.toggle("todo-advanced");button.textContent=open?"Fewer options":"More options";button.setAttribute("aria-expanded",open?"true":"false")});
  }
  function scan(){document.querySelectorAll(".item.editing").forEach(enhanceEditor)}
  function customMenu(event){var chip=event.target.closest&&event.target.closest("#cPri,#cTime,#cDue");if(!chip)return;event.preventDefault();event.stopPropagation();if(chip.id==="cPri"){chip.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));return}if(!root.TodoCustom)return;if(chip.id==="cTime")root.TodoCustom.openTime();else root.TodoCustom.openDue()}
  function boot(){injectStyles();scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});document.addEventListener("contextmenu",customMenu,true)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})(window);
