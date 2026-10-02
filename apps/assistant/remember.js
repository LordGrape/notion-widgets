const REMEMBERED_ACCESS_KEY='command-centre-access-v1';
try{const remembered=localStorage.getItem(REMEMBERED_ACCESS_KEY);if(remembered&&!sessionStorage.getItem(REMEMBERED_ACCESS_KEY))sessionStorage.setItem(REMEMBERED_ACCESS_KEY,remembered)}catch(_){}
