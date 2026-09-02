'use strict';
/* ATHLETE settings v1 - professional profile, standards and backup controls.
   Persistence remains the existing fitness/state object. */
(function(){
 var legacyOpenSettings = openSettings;
 var settingsStart = '';
 var paceIds = ['rkFloor','rkL1','rkL2','rkL3','rkCap'];

 function resultLabel(count){ return count + ' result' + (count === 1 ? '' : 's'); }
 function valuesSignature(){
  return ['setBw'].concat(paceIds).map(function(id){ return el(id).value.trim(); }).join('|');
 }
 function currentRuckFromFields(){
  return {
   floor:parsePace(el('rkFloor').value),
   l1:parsePace(el('rkL1').value),
   l2:parsePace(el('rkL2').value),
   l3:parsePace(el('rkL3').value),
   cap:parsePace(el('rkCap').value)
  };
 }
 function isRecommendedRuck(r){
  return !!r && r.floor === DEFAULT_RUCK.floor && r.l1 === DEFAULT_RUCK.l1 && r.l2 === DEFAULT_RUCK.l2 && r.l3 === DEFAULT_RUCK.l3 && r.cap === DEFAULT_RUCK.cap;
 }
 function setStatus(message, kind){
  var node = el('setBackupStatus');
  node.textContent = message || '';
  node.className = 'settings-status' + (kind ? ' ' + kind : '');
 }
 function updateSettingsSummary(){
  var count = state.entries.length;
  var sync = el('syncState').textContent || 'Local';
  el('setSummaryCopy').textContent = resultLabel(count) + ' stored · ' + sync;
  el('setDataCount').textContent = resultLabel(count);
  el('setProfileState').textContent = state.bw ? 'Configured' : 'Optional';
  el('setProfileState').classList.toggle('custom', !!state.bw);
 }
 function updateSettingsChrome(){
  var dirty = settingsStart !== '' && valuesSignature() !== settingsStart;
  el('setSave').disabled = !dirty;
  el('setSaveState').textContent = dirty ? 'Unsaved' : 'Up to date';
  el('setSaveState').classList.toggle('dirty', dirty);
  var recommended = isRecommendedRuck(currentRuckFromFields());
  el('setRuckMode').textContent = recommended ? 'Recommended' : 'Custom';
  el('setRuckMode').classList.toggle('custom', !recommended);
  if (el('setErr').textContent) el('setErr').textContent = '';
 }
 function restoreRecommended(){
  el('rkFloor').value = fmtMS(DEFAULT_RUCK.floor);
  el('rkL1').value = fmtMS(DEFAULT_RUCK.l1);
  el('rkL2').value = fmtMS(DEFAULT_RUCK.l2);
  el('rkL3').value = fmtMS(DEFAULT_RUCK.l3);
  el('rkCap').value = fmtMS(DEFAULT_RUCK.cap);
  updateSettingsChrome();
  setStatus('Recommended Loaded March standard restored. Save changes to apply it.', 'ok');
 }

 openSettings = function(){
  legacyOpenSettings();
  el('ruckSettings').open = false;
  el('resetConfirm').hidden = true;
  el('setReset').hidden = false;
  setStatus('', '');
  settingsStart = valuesSignature();
  updateSettingsSummary();
  updateSettingsChrome();
 };

 ['setBw'].concat(paceIds).forEach(function(id){
  el(id).addEventListener('input', updateSettingsChrome);
 });
 paceIds.forEach(function(id){
  el(id).addEventListener('blur', function(){
   var pace = parsePace(el(id).value);
   if (pace !== null && pace > 0) el(id).value = fmtMS(pace);
   updateSettingsChrome();
  });
 });
 el('ruckDefaults').addEventListener('click', restoreRecommended);
 el('setCancel').addEventListener('click', function(){ closeModal('settings'); });

 /* Replace the legacy export button so its rich label stays intact. */
 var oldExport = el('setExport');
 var exportButton = oldExport.cloneNode(true);
 oldExport.parentNode.replaceChild(exportButton, oldExport);
 exportButton.addEventListener('click', function(){
  var packet = {
   app:'Athlete',
   schema:1,
   exportedAt:new Date().toISOString(),
   data:state
  };
  var text = JSON.stringify(packet, null, 2);
  function complete(){
   setStatus('Backup copied to your clipboard.', 'ok');
   announce('Athlete backup copied to clipboard.');
  }
  function fallback(){ fallbackCopy(text); complete(); }
  if (navigator.clipboard && navigator.clipboard.writeText){
   navigator.clipboard.writeText(text).then(complete, fallback);
  } else fallback();
 });

 function normaliseBackup(payload){
  var source = payload && typeof payload === 'object' ? (payload.data || payload.state || payload) : null;
  if (!source || !Array.isArray(source.entries)) throw new Error('This file is not a valid Athlete backup.');

  var bw = source.bw === null || source.bw === undefined || source.bw === '' ? null : Number(source.bw);
  if (bw !== null && (!isFinite(bw) || bw <= 0)) throw new Error('The backup contains an invalid bodyweight.');

  var rr = source.ruck || DEFAULT_RUCK;
  var ruck = { floor:Number(rr.floor), l1:Number(rr.l1), l2:Number(rr.l2), l3:Number(rr.l3), cap:Number(rr.cap) };
  var validRuck = Object.keys(ruck).every(function(key){ return isFinite(ruck[key]) && ruck[key] > 0; });
  if (!validRuck || !(ruck.floor > ruck.l1 && ruck.l1 > ruck.l2 && ruck.l2 > ruck.l3 && ruck.l3 > ruck.cap)){
   throw new Error('The backup contains an invalid Loaded March standard.');
  }

  var entries = source.entries.map(function(entry, index){
   if (!entry || !testById(entry.t) || !isFinite(Number(entry.v))) throw new Error('The backup contains an invalid result.');
   return {
    id:entry.id ? String(entry.id) : uid(),
    t:String(entry.t),
    d:entry.d ? String(entry.d) : todayStr(),
    v:Number(entry.v),
    load:entry.load === null || entry.load === undefined ? null : Number(entry.load),
    dist:entry.dist === null || entry.dist === undefined ? null : Number(entry.dist),
    raw:entry.raw === null || entry.raw === undefined ? String(entry.v) : String(entry.raw),
    ts:isFinite(Number(entry.ts)) ? Number(entry.ts) : Date.now() + index
   };
  });
  return { v:1, bw:bw === null ? null : Math.round(bw * 10) / 10, entries:entries, ruck:ruck };
 }

 var importInput = el('setImportFile');
 el('setImport').addEventListener('click', function(){
  importInput.value = '';
  importInput.click();
 });
 importInput.addEventListener('change', function(){
  var file = importInput.files && importInput.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024){ setStatus('That backup is larger than 2 MB and was not imported.', 'error'); return; }
  setStatus('Checking backup…', '');
  file.text().then(function(text){
   var next = normaliseBackup(JSON.parse(text));
   state = next;
   save();
   renderAll();
   openSettings();
   setStatus('Backup imported successfully. ' + resultLabel(state.entries.length) + ' restored.', 'ok');
   announce('Athlete backup imported.');
  }).catch(function(error){
   setStatus(error && error.message ? error.message : 'The backup could not be imported.', 'error');
  });
 });

 /* Replace the old double-click reset with an explicit confirmation panel. */
 var oldReset = el('setReset');
 var resetButton = oldReset.cloneNode(true);
 oldReset.parentNode.replaceChild(resetButton, oldReset);
 resetButton.addEventListener('click', function(){
  resetButton.hidden = true;
  el('resetConfirm').hidden = false;
  el('resetConfirm').focus();
 });
 el('resetCancel').addEventListener('click', function(){
  el('resetConfirm').hidden = true;
  resetButton.hidden = false;
 });
 el('resetConfirmBtn').addEventListener('click', function(){
  state = {
   v:1,
   bw:null,
   entries:[],
   ruck:{ floor:DEFAULT_RUCK.floor, l1:DEFAULT_RUCK.l1, l2:DEFAULT_RUCK.l2, l3:DEFAULT_RUCK.l3, cap:DEFAULT_RUCK.cap }
  };
  save();
  closeModal('settings');
  renderAll();
  announce('All athlete data cleared.');
 });
})();
