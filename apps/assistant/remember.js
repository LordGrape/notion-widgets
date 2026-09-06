const REMEMBERED_ACCESS_KEY='command-centre-access-v1';
try{const remembered=localStorage.getItem(REMEMBERED_ACCESS_KEY);if(remembered&&!sessionStorage.getItem(REMEMBERED_ACCESS_KEY))sessionStorage.setItem(REMEMBERED_ACCESS_KEY,remembered)}catch(_){}
window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('unlockForm')?.addEventListener('submit',()=>setTimeout(()=>{try{const key=sessionStorage.getItem(REMEMBERED_ACCESS_KEY);if(key)localStorage.setItem(REMEMBERED_ACCESS_KEY,key)}catch(_){}},250));
  document.getElementById('lockButton')?.addEventListener('click',()=>{try{localStorage.removeItem(REMEMBERED_ACCESS_KEY)}catch(_){}},{capture:true});
});
