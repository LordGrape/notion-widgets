const WORKER='https://widget-sync.lordgrape-widgets.workers.dev';
const SESSION_KEY='command-centre-access-v1';
const THEME_KEY='command-centre-theme-v1';
const TODO_URL='https://notion-widgets-93r.pages.dev/todo-smart-shell.html?v=20260907-command-theme-v1';
const TIMETABLE_URL='https://notion-widgets-93r.pages.dev/timetable-shell.html?v=20260907-command-wide-v1&mode=command';
const $=selector=>document.querySelector(selector);
let accessKey='';
let theme=localStorage.getItem(THEME_KEY)||((matchMedia('(prefers-color-scheme:light)').matches)?'light':'dark');
function applyTheme(next,reload=true){theme=next==='light'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem(THEME_KEY,theme);const toggle=$('#themeToggle'),label=$('#themeLabel'),icon=$('#themeIcon');if(toggle){const target=theme==='dark'?'light':'dark';toggle.title=`Switch to ${target} mode · Ctrl Alt L`;toggle.setAttribute('aria-label',`Switch to ${target} mode`);toggle.setAttribute('aria-pressed',theme==='light'?'true':'false')}if(label)label.textContent=theme==='dark'?'Light':'Dark';if(icon)icon.textContent=theme==='dark'?'☀':'☾';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#15111b':'#f5f2f8';if(reload&&accessKey)loadWidgets()}
function toggleTheme(){applyTheme(theme==='dark'?'light':'dark')}
async function authorize(value){const key=String(value||'').trim();if(!key)throw new Error('unauthorized');const response=await fetch(`${WORKER}/state/user`,{headers:{'X-Widget-Key':key},cache:'no-store'});if(response.status===401)throw new Error('unauthorized');if(!response.ok)throw new Error('unavailable');accessKey=key;sessionStorage.setItem(SESSION_KEY,key)}
function widgetUrl(base){const url=new URL(base);url.searchParams.set('theme',theme);return`${url.toString()}#key=${encodeURIComponent(accessKey)}`}
function loadWidgets(){const todo=widgetUrl(TODO_URL),timetable=widgetUrl(TIMETABLE_URL);$('#todoFrame').src=todo;$('#todoOpen').href=todo;$('#timetableFrame').src=timetable;$('#timetableOpen').href=timetable}
function unlock(){$('#lockScreen').hidden=true;$('#appShell').setAttribute('aria-hidden','false');document.body.classList.remove('locked');loadWidgets()}
function lock(){accessKey='';sessionStorage.removeItem(SESSION_KEY);$('#todoFrame').src='about:blank';$('#timetableFrame').src='about:blank';$('#accessKey').value='';$('#lockScreen').hidden=false;$('#appShell').setAttribute('aria-hidden','true');document.body.classList.add('locked');setTimeout(()=>$('#accessKey').focus(),0)}
async function submit(event){event.preventDefault();const status=$('#unlockStatus');status.classList.remove('error');status.textContent='Verifying private access…';try{await authorize($('#accessKey').value);unlock()}catch(error){status.classList.add('error');status.textContent=error.message==='unauthorized'?'That key was not accepted.':'Private sync is temporarily unavailable.'}}
async function init(){applyTheme(theme,false);$('#unlockForm').addEventListener('submit',submit);$('#lockButton').addEventListener('click',lock);$('#themeToggle').addEventListener('click',toggleTheme);document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.altKey&&event.key.toLowerCase()==='l'){event.preventDefault();toggleTheme()}});const saved=sessionStorage.getItem(SESSION_KEY);if(saved)try{await authorize(saved);unlock()}catch(error){lock()}else lock();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js?v=5').catch(()=>{})}
init();
