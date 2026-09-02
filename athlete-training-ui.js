'use strict';
/* ATHLETE training v1 - Train, Progress, quick set logging and assessment promotion. */

var athleteAppView = 'profile';
var athleteProgressExercise = null;
var athleteDraftSaveTimer = null;

function trainingEscape(value){
 return String(value === null || value === undefined ? '' : value)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function trainingPlural(value, singular){ return value + ' ' + singular + (value === 1 ? '' : 's'); }
function trainingPersistSoon(){
 clearTimeout(athleteDraftSaveTimer);
 athleteDraftSaveTimer = setTimeout(function(){ save(); }, 220);
}
function trainingSetView(view){
 athleteAppView = view;
 ['profile','train','progress'].forEach(function(name){
  var panel = el(name + 'View');
  var button = document.querySelector('[data-app-view="' + name + '"]');
  if (panel) panel.hidden = name !== view;
  if (button){
   button.classList.toggle('on', name === view);
   button.setAttribute('aria-selected', name === view ? 'true' : 'false');
  }
 });
 if (view === 'train') renderTrainingDashboard();
 if (view === 'progress') renderProgressDashboard();
 hideTip();
}

function trainingNewWorkout(template){
 var exercises = template ? (template.exercises || []).map(function(exercise){
  return { id:uid(), exerciseId:exercise.exerciseId, name:exercise.name || null, sets:[] };
 }) : [];
 return {
  id:'w' + uid(),
  d:todayStr(),
  title:template && template.title ? template.title : 'Training session',
  startedAt:Date.now(),
  completedAt:null,
  exercises:exercises
 };
}
function trainingStartWorkout(template){
 ensureTrainingState();
 if (!state.activeWorkout) state.activeWorkout = trainingNewWorkout(template || null);
 save();
 renderWorkoutEditor();
 openModal('workoutSheet');
}
function trainingCurrentExercise(index){
 var workout = state.activeWorkout;
 return workout && workout.exercises ? workout.exercises[index] : null;
}
function trainingOpenPicker(){
 el('exerciseSearch').value = '';
 el('customExerciseName').value = '';
 el('customExerciseGroup').value = 'Other';
 el('exercisePickerErr').textContent = '';
 renderExercisePicker('');
 openModal('exercisePicker');
 setTimeout(function(){ el('exerciseSearch').focus(); }, 60);
}
function renderExercisePicker(query){
 var term = String(query || '').trim().toLowerCase();
 var list = trainingAllExercises().filter(function(exercise){
  return !term || exercise.name.toLowerCase().indexOf(term) >= 0 || exercise.group.toLowerCase().indexOf(term) >= 0;
 });
 var html = '';
 var group = null;
 list.forEach(function(exercise){
  if (exercise.group !== group){ group = exercise.group; html += '<div class="exercise-group-label">' + trainingEscape(group) + '</div>'; }
  html += '<button class="exercise-pick" data-exercise-id="' + trainingEscape(exercise.id) + '"><span>' + trainingEscape(exercise.name) + '</span><small>' + (exercise.kind === 'bodyweight' ? 'Bodyweight' : 'Weighted') + '</small></button>';
 });
 if (!html) html = '<div class="training-empty compact"><strong>No exercises found</strong><span>Create a custom exercise below.</span></div>';
 el('exercisePickerList').innerHTML = html;
}
function trainingAddExercise(exerciseId){
 var workout = state.activeWorkout;
 var def = trainingExerciseById(exerciseId);
 if (!workout || !def) return;
 for (var i=0;i<workout.exercises.length;i++){
  if (workout.exercises[i].exerciseId === exerciseId){
   closeModal('exercisePicker');
   renderWorkoutEditor();
   return;
  }
 }
 workout.exercises.push({ id:uid(), exerciseId:def.id, name:def.name, sets:[] });
 save();
 closeModal('exercisePicker');
 renderWorkoutEditor();
}

function trainingPreviousText(exerciseId){
 var previous = trainingLatestExercise(exerciseId);
 if (!previous) return 'No previous session';
 var top = previous.metrics.topSet;
 if (!top) return 'No previous working sets';
 return fmtDate(previous.workout.d) + ' · ' + trainingFormatLoad(top.loadKg) + ' × ' + top.reps + (top.rpe ? ' @ RPE ' + top.rpe : '');
}
function trainingSetRow(set, exerciseIndex, setIndex, kind){
 var loadValue = set.loadKg > 0 ? trainingFormatNumber(trainingKgToDisplay(set.loadKg)) : '';
 var rpeEnabled = state.preferences.rpeEnabled;
 return '<div class="workout-set-row' + (set.done === false ? '' : ' complete') + '" data-set-index="' + setIndex + '">' +
  '<button class="set-done" data-action="toggle-set" data-exercise-index="' + exerciseIndex + '" data-set-index="' + setIndex + '" aria-label="Toggle set complete">' + (set.done === false ? '○' : '✓') + '</button>' +
  '<span class="set-number">' + (setIndex + 1) + '</span>' +
  '<div class="set-input"><input data-set-field="load" data-exercise-index="' + exerciseIndex + '" data-set-index="' + setIndex + '" inputmode="decimal" value="' + trainingEscape(loadValue) + '" ' + (kind === 'bodyweight' ? 'placeholder="Added"' : 'placeholder="0"') + '><small>' + trainingUnit() + '</small></div>' +
  '<input class="set-reps" data-set-field="reps" data-exercise-index="' + exerciseIndex + '" data-set-index="' + setIndex + '" inputmode="numeric" value="' + trainingEscape(set.reps) + '" aria-label="Repetitions">' +
  (rpeEnabled ? '<input class="set-rpe" data-set-field="rpe" data-exercise-index="' + exerciseIndex + '" data-set-index="' + setIndex + '" inputmode="decimal" value="' + trainingEscape(set.rpe === null || set.rpe === undefined ? '' : set.rpe) + '" placeholder="—" aria-label="RPE">' : '') +
  '<select class="set-type" data-set-field="type" data-exercise-index="' + exerciseIndex + '" data-set-index="' + setIndex + '" aria-label="Set type"><option value="work"' + (set.type === 'work' ? ' selected' : '') + '>Work</option><option value="warmup"' + (set.type === 'warmup' ? ' selected' : '') + '>Warm-up</option><option value="drop"' + (set.type === 'drop' ? ' selected' : '') + '>Drop</option><option value="failure"' + (set.type === 'failure' ? ' selected' : '') + '>Failure</option></select>' +
  '<button class="set-remove" data-action="remove-set" data-exercise-index="' + exerciseIndex + '" data-set-index="' + setIndex + '" aria-label="Remove set">×</button>' +
 '</div>';
}
function trainingExerciseCard(exercise, index){
 var def = trainingExerciseById(exercise.exerciseId) || { kind:'weighted', group:'Other' };
 var previousSets = trainingPreviousSets(exercise.exerciseId);
 var quickLoad = previousSets.length && previousSets[0].loadKg > 0 ? trainingFormatNumber(trainingKgToDisplay(previousSets[0].loadKg)) : '';
 var quickReps = previousSets.length ? previousSets[0].reps : '';
 var html = '<article class="workout-exercise" data-exercise-index="' + index + '">';
 html += '<div class="workout-exercise-head"><div><strong>' + trainingEscape(trainingExerciseName(exercise)) + '</strong><span>' + trainingEscape(def.group || 'Other') + '</span></div><button data-action="remove-exercise" data-exercise-index="' + index + '" aria-label="Remove exercise">Remove</button></div>';
 html += '<div class="previous-set"><span>Previous</span><strong>' + trainingEscape(trainingPreviousText(exercise.exerciseId)) + '</strong>' + (previousSets.length ? '<button data-action="repeat-previous" data-exercise-index="' + index + '">Repeat</button>' : '') + '</div>';
 html += '<div class="quick-set"><div class="quick-field"><label>' + (def.kind === 'bodyweight' ? 'Added load' : 'Weight') + '</label><div class="quick-input"><input data-quick="load" inputmode="decimal" value="' + trainingEscape(quickLoad) + '" placeholder="0"><span>' + trainingUnit() + '</span></div></div><div class="quick-field"><label>Reps</label><input data-quick="reps" inputmode="numeric" value="' + trainingEscape(quickReps) + '" placeholder="8"></div><div class="quick-field quick-count"><label>Sets</label><input data-quick="count" inputmode="numeric" value="1"></div>' + (state.preferences.rpeEnabled ? '<div class="quick-field quick-rpe"><label>RPE</label><input data-quick="rpe" inputmode="decimal" placeholder="8"></div>' : '') + '<div class="quick-field quick-type"><label>Type</label><select data-quick="type"><option value="work">Work</option><option value="warmup">Warm-up</option><option value="drop">Drop</option><option value="failure">Failure</option></select></div><button class="quick-add" data-action="add-sets" data-exercise-index="' + index + '">Add sets</button></div>';
 if (exercise.sets.length){
  html += '<div class="set-table-head"><span></span><span>Set</span><span>Load</span><span>Reps</span>' + (state.preferences.rpeEnabled ? '<span>RPE</span>' : '') + '<span>Type</span><span></span></div><div class="workout-sets">';
  exercise.sets.forEach(function(set, setIndex){ html += trainingSetRow(set, index, setIndex, def.kind); });
  html += '</div>';
 } else html += '<div class="exercise-empty">Add a set group or repeat your previous working sets.</div>';
 html += '</article>';
 return html;
}
function renderWorkoutEditor(){
 ensureTrainingState();
 var workout = state.activeWorkout;
 if (!workout) return;
 el('workoutTitleInput').value = workout.title || 'Training session';
 el('workoutDateInput').value = workout.d || todayStr();
 var html = '';
 (workout.exercises || []).forEach(function(exercise,index){ html += trainingExerciseCard(exercise,index); });
 el('workoutExercises').innerHTML = html || '<div class="training-empty"><strong>Your workout is empty</strong><span>Add an exercise, then enter one set or a complete set group.</span></div>';
 renderWorkoutTotals();
}
function renderWorkoutTotals(){
 var metrics = trainingWorkoutMetrics(state.activeWorkout);
 el('workoutTotals').innerHTML = '<span><strong>' + metrics.exercises + '</strong> exercises</span><span><strong>' + metrics.workSets + '</strong> work sets</span><span><strong>' + trainingFormatVolume(metrics.volumeKg) + '</strong> volume</span>';
}

function renderTrainingDashboard(){
 ensureTrainingState();
 var week = trainingThisWeekMetrics();
 el('weekSessions').textContent = week.sessions;
 el('weekSets').textContent = week.workSets;
 el('weekVolume').textContent = trainingFormatVolume(week.volumeKg);
 var groups = Object.keys(week.groups).sort(function(a,b){ return week.groups[b] - week.groups[a]; });
 el('weekFocus').textContent = groups.length ? groups.slice(0,2).join(' + ') : 'No training yet';
 var active = el('activeWorkoutBanner');
 active.hidden = !state.activeWorkout;
 if (state.activeWorkout){
  var activeMetrics = trainingWorkoutMetrics(state.activeWorkout);
  el('activeWorkoutText').textContent = (state.activeWorkout.title || 'Training session') + ' · ' + trainingPlural(activeMetrics.workSets,'work set');
 }
 var workouts = trainingCompletedWorkouts().slice(0,6);
 var html = '';
 workouts.forEach(function(workout){
  var metrics = trainingWorkoutMetrics(workout);
  var exerciseNames = (workout.exercises || []).filter(function(exercise){ return trainingExerciseMetrics(exercise).workSets; }).slice(0,3).map(trainingExerciseName);
  var promotions = '';
  (workout.exercises || []).forEach(function(exercise){
   var candidate = trainingAssessmentCandidate(exercise);
   if (!candidate) return;
   var used = state.entries.some(function(entry){ return entry.sourceWorkoutId === workout.id && entry.t === candidate.testId; });
   if (!used) promotions += '<button class="promote-result" data-action="promote" data-workout-id="' + trainingEscape(workout.id) + '" data-exercise-id="' + trainingEscape(exercise.exerciseId) + '">Use ' + trainingEscape(trainingExerciseName(exercise)) + ' for Athlete Rating</button>';
  });
  html += '<article class="recent-workout" data-workout-id="' + trainingEscape(workout.id) + '"><div class="recent-workout-main"><div><span>' + trainingEscape(fmtDate(workout.d)) + '</span><strong>' + trainingEscape(workout.title || 'Training session') + '</strong><small>' + trainingEscape(exerciseNames.join(' · ') || 'No exercises') + '</small></div><div class="recent-workout-metrics"><strong>' + metrics.workSets + '</strong><span>sets</span><strong>' + trainingFormatVolume(metrics.volumeKg) + '</strong><span>volume</span></div></div>' + promotions + '<div class="recent-workout-actions"><button data-action="repeat-workout" data-workout-id="' + trainingEscape(workout.id) + '">Repeat workout</button><button data-action="delete-workout" data-workout-id="' + trainingEscape(workout.id) + '">Delete</button></div></article>';
 });
 el('recentWorkouts').innerHTML = html || '<div class="training-empty"><strong>No completed workouts</strong><span>Your first session will appear here with volume and progression data.</span></div>';
}

function trainingChartSvg(history, bodyweight){
 if (!history.length) return '<div class="training-empty compact"><strong>No trend yet</strong><span>Complete at least one working session for this exercise.</span></div>';
 var values = history.map(function(point){ return bodyweight ? Number(point.metrics.topSet && point.metrics.topSet.reps) || 0 : trainingKgToDisplay(point.metrics.e1rmKg || 0); });
 var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
 if (min === max){ min = Math.max(0,min - 1); max += 1; }
 var width = 420, height = 150, px = 22, py = 18;
 var points = values.map(function(value,index){
  var x = values.length === 1 ? width / 2 : px + index * (width - px*2) / (values.length - 1);
  var y = height - py - (value - min) / (max - min) * (height - py*2);
  return [trainingRound(x,1),trainingRound(y,1)];
 });
 var path = points.map(function(point,index){ return (index ? 'L' : 'M') + point[0] + ' ' + point[1]; }).join(' ');
 var circles = points.map(function(point,index){ return '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="3"><title>' + trainingEscape(history[index].workout.d + ': ' + trainingFormatNumber(values[index])) + '</title></circle>'; }).join('');
 return '<svg class="progress-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Exercise progress chart"><line x1="' + px + '" y1="' + (height-py) + '" x2="' + (width-px) + '" y2="' + (height-py) + '"></line><line x1="' + px + '" y1="' + (height/2) + '" x2="' + (width-px) + '" y2="' + (height/2) + '"></line><path d="' + path + '"></path>' + circles + '</svg>';
}
function renderProgressDashboard(){
 ensureTrainingState();
 var week = trainingThisWeekMetrics();
 var workouts = trainingCompletedWorkouts();
 var loggedIds = [];
 workouts.forEach(function(workout){ (workout.exercises || []).forEach(function(exercise){ if (trainingExerciseMetrics(exercise).workSets && loggedIds.indexOf(exercise.exerciseId) < 0) loggedIds.push(exercise.exerciseId); }); });
 el('progressSessions').textContent = workouts.length;
 el('progressWeekSets').textContent = week.workSets;
 el('progressWeekVolume').textContent = trainingFormatVolume(week.volumeKg);
 el('progressTracked').textContent = loggedIds.length;
 var select = el('progressExercise');
 var options = loggedIds.map(function(id){ var def = trainingExerciseById(id); return '<option value="' + trainingEscape(id) + '">' + trainingEscape(def ? def.name : id) + '</option>'; }).join('');
 select.innerHTML = options || '<option value="">No exercises yet</option>';
 if (!athleteProgressExercise || loggedIds.indexOf(athleteProgressExercise) < 0) athleteProgressExercise = loggedIds[0] || null;
 select.value = athleteProgressExercise || '';
 if (!athleteProgressExercise){
  el('progressChart').innerHTML = '<div class="training-empty"><strong>Progress begins with a workout</strong><span>Log working sets to unlock estimated 1RM, rep records, volume and exercise history.</span></div>';
  el('progressExerciseStats').innerHTML = '';
  el('progressHistory').innerHTML = '';
  return;
 }
 var def = trainingExerciseById(athleteProgressExercise) || { name:'Exercise', kind:'weighted' };
 var stats = trainingExerciseStats(athleteProgressExercise);
 el('progressChartTitle').textContent = def.kind === 'bodyweight' ? 'Best reps over time' : 'Estimated 1RM over time';
 el('progressChart').innerHTML = trainingChartSvg(stats.history, def.kind === 'bodyweight');
 el('progressExerciseStats').innerHTML = '<div><span>Best e1RM</span><strong>' + (stats.bestE1rmKg === null ? '—' : trainingFormatLoad(stats.bestE1rmKg)) + '</strong></div><div><span>Heaviest set</span><strong>' + (stats.bestLoadKg === null ? '—' : trainingFormatLoad(stats.bestLoadKg)) + '</strong></div><div><span>Best reps</span><strong>' + (stats.bestReps || '—') + '</strong></div><div><span>Work sets</span><strong>' + stats.workSets + '</strong></div>';
 var historyHtml = '';
 stats.history.slice(-6).reverse().forEach(function(point){
  var top = point.metrics.topSet;
  historyHtml += '<div class="progress-history-row"><span>' + trainingEscape(fmtDate(point.workout.d)) + '</span><strong>' + (top ? trainingEscape(trainingFormatLoad(top.loadKg) + ' × ' + top.reps) : '—') + '</strong><small>' + trainingFormatVolume(point.metrics.volumeKg) + '</small></div>';
 });
 el('progressHistory').innerHTML = historyHtml;
}

function trainingFindWorkout(id){
 for (var i=0;i<state.workouts.length;i++) if (state.workouts[i].id === id) return state.workouts[i];
 return null;
}
function trainingFinishWorkout(){
 var workout = state.activeWorkout;
 if (!workout) return;
 workout.title = el('workoutTitleInput').value.trim() || 'Training session';
 workout.d = el('workoutDateInput').value || todayStr();
 var metrics = trainingWorkoutMetrics(workout);
 if (!metrics.workSets){ el('workoutErr').textContent = 'Complete at least one working set before finishing.'; return; }
 var prior = state.workouts.slice();
 workout.completedAt = Date.now();
 var prs = trainingNewPRs(workout, prior);
 state.workouts.push(workout);
 state.activeWorkout = null;
 save();
 closeModal('workoutSheet');
 trainingSetView('train');
 renderAll();
 announce('Workout saved. ' + trainingPlural(metrics.workSets,'working set') + '.');
 if (prs.length){
  try { if (window.Core && Core.confetti) Core.confetti.launch('fx'); } catch(e) {}
  snd('chime');
  el('trainingNotice').textContent = 'New record: ' + prs.join(' · ');
  el('trainingNotice').hidden = false;
  setTimeout(function(){ el('trainingNotice').hidden = true; }, 6000);
 }
}

var athleteRenderAll = renderAll;
renderAll = function(){
 athleteRenderAll();
 renderTrainingDashboard();
 renderProgressDashboard();
};

Array.prototype.forEach.call(document.querySelectorAll('[data-app-view]'), function(button){
 button.addEventListener('click', function(){ trainingSetView(button.getAttribute('data-app-view')); });
});
el('profileStartWorkout').addEventListener('click', function(){ trainingStartWorkout(); });
el('startWorkoutBtn').addEventListener('click', function(){ trainingStartWorkout(); });
el('resumeWorkoutBtn').addEventListener('click', function(){ trainingStartWorkout(); });
el('addExerciseBtn').addEventListener('click', trainingOpenPicker);
el('workoutFinishBtn').addEventListener('click', trainingFinishWorkout);
el('workoutTitleInput').addEventListener('input', function(){ if (state.activeWorkout){ state.activeWorkout.title = this.value; trainingPersistSoon(); } });
el('workoutDateInput').addEventListener('change', function(){ if (state.activeWorkout){ state.activeWorkout.d = this.value || todayStr(); save(); } });
el('progressExercise').addEventListener('change', function(){ athleteProgressExercise = this.value || null; renderProgressDashboard(); });

el('exerciseSearch').addEventListener('input', function(){ renderExercisePicker(this.value); });
el('exercisePickerList').addEventListener('click', function(event){
 var button = event.target.closest('[data-exercise-id]');
 if (button) trainingAddExercise(button.getAttribute('data-exercise-id'));
});
el('createExerciseBtn').addEventListener('click', function(){
 var name = el('customExerciseName').value.trim();
 if (!name){ el('exercisePickerErr').textContent = 'Enter an exercise name.'; return; }
 var id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + Date.now().toString(36).slice(-4);
 state.customExercises.push({ id:id, name:name, group:el('customExerciseGroup').value || 'Other', kind:'weighted', custom:true });
 save();
 trainingAddExercise(id);
});

el('workoutExercises').addEventListener('click', function(event){
 var button = event.target.closest('[data-action]');
 if (!button || !state.activeWorkout) return;
 var action = button.getAttribute('data-action');
 var exerciseIndex = Number(button.getAttribute('data-exercise-index'));
 var exercise = trainingCurrentExercise(exerciseIndex);
 if (!exercise) return;
 if (action === 'add-sets'){
  var card = button.closest('.workout-exercise');
  var def = trainingExerciseById(exercise.exerciseId) || { kind:'weighted' };
  var loadText = card.querySelector('[data-quick="load"]').value;
  var reps = Math.floor(Number(card.querySelector('[data-quick="reps"]').value));
  var count = Math.floor(Number(card.querySelector('[data-quick="count"]').value));
  var rpeNode = card.querySelector('[data-quick="rpe"]');
  var rpe = rpeNode && rpeNode.value !== '' ? Number(rpeNode.value) : null;
  var type = card.querySelector('[data-quick="type"]').value;
  var loadKg = loadText === '' && def.kind === 'bodyweight' ? 0 : trainingLoadToKg(loadText);
  if (loadKg === null || loadKg < 0 || (def.kind !== 'bodyweight' && loadKg <= 0)){ el('workoutErr').textContent = 'Enter a valid load.'; return; }
  if (!isFinite(reps) || reps < 1 || reps > 100){ el('workoutErr').textContent = 'Repetitions must be between 1 and 100.'; return; }
  if (!isFinite(count) || count < 1 || count > 12){ el('workoutErr').textContent = 'Sets must be between 1 and 12.'; return; }
  if (rpe !== null && (!isFinite(rpe) || rpe < 1 || rpe > 10)){ el('workoutErr').textContent = 'RPE must be between 1 and 10.'; return; }
  for (var i=0;i<count;i++) exercise.sets.push({ id:uid(), loadKg:trainingRound(loadKg,4), reps:reps, rpe:rpe, type:type, done:true });
  el('workoutErr').textContent = '';
  save(); renderWorkoutEditor();
 } else if (action === 'repeat-previous'){
  var copied = trainingPreviousSets(exercise.exerciseId);
  exercise.sets = exercise.sets.concat(copied);
  save(); renderWorkoutEditor();
 } else if (action === 'toggle-set'){
  var setIndex = Number(button.getAttribute('data-set-index'));
  if (exercise.sets[setIndex]) exercise.sets[setIndex].done = exercise.sets[setIndex].done === false;
  save(); renderWorkoutEditor();
 } else if (action === 'remove-set'){
  exercise.sets.splice(Number(button.getAttribute('data-set-index')),1);
  save(); renderWorkoutEditor();
 } else if (action === 'remove-exercise'){
  if (button.getAttribute('data-armed') === '1'){
   state.activeWorkout.exercises.splice(exerciseIndex,1); save(); renderWorkoutEditor();
  } else {
   button.setAttribute('data-armed','1'); button.textContent = 'Confirm';
   setTimeout(function(){ if (button.isConnected){ button.removeAttribute('data-armed'); button.textContent = 'Remove'; } },2200);
  }
 }
});
function updateDraftSet(event){
 var input = event.target.closest('[data-set-field]');
 if (!input || !state.activeWorkout) return;
 var exercise = trainingCurrentExercise(Number(input.getAttribute('data-exercise-index')));
 var set = exercise && exercise.sets[Number(input.getAttribute('data-set-index'))];
 if (!set) return;
 var field = input.getAttribute('data-set-field');
 if (field === 'load'){
  var kg = trainingLoadToKg(input.value);
  if (kg !== null && kg >= 0) set.loadKg = trainingRound(kg,4);
 } else if (field === 'reps'){
  var reps = Math.floor(Number(input.value)); if (isFinite(reps) && reps >= 0) set.reps = reps;
 } else if (field === 'rpe'){
  set.rpe = input.value === '' ? null : Number(input.value);
 } else if (field === 'type') set.type = input.value;
 trainingPersistSoon(); renderWorkoutTotals();
}
el('workoutExercises').addEventListener('input', updateDraftSet);
el('workoutExercises').addEventListener('change', updateDraftSet);

var discardButton = el('workoutDiscardBtn');
discardButton.addEventListener('click', function(){
 if (discardButton.getAttribute('data-armed') === '1'){
  state.activeWorkout = null; save(); closeModal('workoutSheet'); renderAll(); discardButton.removeAttribute('data-armed'); discardButton.textContent = 'Discard';
 } else {
  discardButton.setAttribute('data-armed','1'); discardButton.textContent = 'Confirm discard';
  setTimeout(function(){ discardButton.removeAttribute('data-armed'); discardButton.textContent = 'Discard'; },2600);
 }
});

el('recentWorkouts').addEventListener('click', function(event){
 var button = event.target.closest('[data-action]');
 if (!button) return;
 var action = button.getAttribute('data-action');
 var workout = trainingFindWorkout(button.getAttribute('data-workout-id'));
 if (!workout) return;
 if (action === 'repeat-workout'){
  if (state.activeWorkout){ trainingStartWorkout(); return; }
  trainingStartWorkout(workout);
 } else if (action === 'delete-workout'){
  if (button.getAttribute('data-armed') === '1'){
   state.workouts = state.workouts.filter(function(item){ return item.id !== workout.id; }); save(); renderAll();
  } else {
   button.setAttribute('data-armed','1'); button.textContent = 'Confirm delete';
   setTimeout(function(){ if (button.isConnected){ button.removeAttribute('data-armed'); button.textContent = 'Delete'; } },2500);
  }
 } else if (action === 'promote'){
  var exerciseId = button.getAttribute('data-exercise-id');
  var exercise = (workout.exercises || []).filter(function(item){ return item.exerciseId === exerciseId; })[0];
  var candidate = exercise && trainingAssessmentCandidate(exercise);
  if (!candidate) return;
  state.entries.push({ id:uid(), t:candidate.testId, d:workout.d, v:candidate.value, load:candidate.load, dist:null, raw:candidate.raw, ts:Number(workout.completedAt) || Date.now(), sourceWorkoutId:workout.id });
  save(); renderAll(); announce('Workout result added to Athlete Rating.');
 }
});

document.addEventListener('keydown', function(event){
 if (event.key !== 'Escape') return;
 if (!el('exercisePicker').hidden) closeModal('exercisePicker');
 else if (!el('workoutSheet').hidden) closeModal('workoutSheet');
});

ensureTrainingState();
trainingSetView('profile');
setTimeout(function(){ renderTrainingDashboard(); renderProgressDashboard(); },0);
