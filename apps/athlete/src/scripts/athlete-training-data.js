'use strict';
/* ATHLETE training v1 - backward-compatible workout state and analytics.
   Loads after athlete-data.js and keeps the existing fitness/state SyncEngine key. */

var TRAINING_KG_PER_LB = 0.45359237;
var TRAINING_EXERCISES = [
 { id:'bench', name:'Bench Press', group:'Chest', kind:'weighted', attr:'UPS' },
 { id:'squat', name:'Back Squat', group:'Legs', kind:'weighted', attr:'LWS' },
 { id:'deadlift', name:'Deadlift', group:'Posterior chain', kind:'weighted', attr:'LWS' },
 { id:'ohp', name:'Overhead Press', group:'Shoulders', kind:'weighted', attr:'UPS' },
 { id:'row', name:'Barbell Row', group:'Back', kind:'weighted', attr:'UPS' },
 { id:'rdl', name:'Romanian Deadlift', group:'Posterior chain', kind:'weighted', attr:'LWS' },
 { id:'dbbench', name:'Dumbbell Bench Press', group:'Chest', kind:'weighted', attr:'UPS' },
 { id:'legpress', name:'Leg Press', group:'Legs', kind:'weighted', attr:'LWS' },
 { id:'latpulldown', name:'Lat Pulldown', group:'Back', kind:'weighted', attr:'UPS' },
 { id:'pullup', name:'Pull-up', group:'Back', kind:'bodyweight', attr:'UPS' },
 { id:'pushup', name:'Push-up', group:'Chest', kind:'bodyweight', attr:'UPS' },
 { id:'dip', name:'Dip', group:'Chest', kind:'bodyweight', attr:'UPS' },
 { id:'split-squat', name:'Bulgarian Split Squat', group:'Legs', kind:'weighted', attr:'LWS' },
 { id:'curl', name:'Biceps Curl', group:'Arms', kind:'weighted', attr:'UPS' },
 { id:'triceps', name:'Triceps Extension', group:'Arms', kind:'weighted', attr:'UPS' },
 { id:'lateral-raise', name:'Lateral Raise', group:'Shoulders', kind:'weighted', attr:'UPS' },
 { id:'calf-raise', name:'Calf Raise', group:'Legs', kind:'weighted', attr:'LWS' },
 { id:'plank', name:'Plank', group:'Core', kind:'bodyweight', attr:'COR' }
];

function ensureTrainingState(){
 if (!state || typeof state !== 'object') state = { v:1, bw:null, entries:[], ruck:DEFAULT_RUCK };
 if (!Array.isArray(state.workouts)) state.workouts = [];
 if (!Array.isArray(state.customExercises)) state.customExercises = [];
 if (!state.preferences || typeof state.preferences !== 'object') state.preferences = {};
 if (state.preferences.units !== 'kg' && state.preferences.units !== 'lb') state.preferences.units = 'lb';
 if (typeof state.preferences.rpeEnabled !== 'boolean') state.preferences.rpeEnabled = true;
 if (state.activeWorkout && typeof state.activeWorkout !== 'object') state.activeWorkout = null;
 state.v = Math.max(Number(state.v) || 1, 2);
 return state;
}

var athleteBaseLoadState = loadState;
loadState = function(){ athleteBaseLoadState(); ensureTrainingState(); };
var athleteBaseSave = save;
save = function(){ ensureTrainingState(); athleteBaseSave(); };

function trainingUnit(){ ensureTrainingState(); return state.preferences.units; }
function trainingLoadToKg(value){
 var n = Number(value);
 if (!isFinite(n)) return null;
 return trainingUnit() === 'lb' ? n * TRAINING_KG_PER_LB : n;
}
function trainingKgToDisplay(valueKg){
 var n = Number(valueKg);
 if (!isFinite(n)) return null;
 return trainingUnit() === 'lb' ? n / TRAINING_KG_PER_LB : n;
}
function trainingRound(value, decimals){
 var power = Math.pow(10, decimals === undefined ? 1 : decimals);
 return Math.round(value * power) / power;
}
function trainingFormatNumber(value){
 if (!isFinite(Number(value))) return '0';
 var rounded = trainingRound(Number(value), 1);
 return String(rounded).replace(/\.0$/, '');
}
function trainingFormatLoad(valueKg, bodyweightLabel){
 var n = Number(valueKg);
 if (!isFinite(n) || n <= 0) return bodyweightLabel || 'Bodyweight';
 return trainingFormatNumber(trainingKgToDisplay(n)) + ' ' + trainingUnit();
}
function trainingFormatVolume(valueKg){
 var shown = trainingKgToDisplay(Number(valueKg) || 0);
 if (shown >= 1000) return trainingFormatNumber(shown / 1000) + 'k ' + trainingUnit();
 return trainingFormatNumber(shown) + ' ' + trainingUnit();
}

function trainingExerciseById(id){
 var all = TRAINING_EXERCISES.concat((state && state.customExercises) || []);
 for (var i=0;i<all.length;i++) if (all[i].id === id) return all[i];
 return null;
}
function trainingAllExercises(){
 ensureTrainingState();
 return TRAINING_EXERCISES.concat(state.customExercises).slice().sort(function(a,b){
  if (a.group === b.group) return a.name.localeCompare(b.name);
  return a.group.localeCompare(b.group);
 });
}
function trainingExerciseName(item){
 var def = trainingExerciseById(item.exerciseId || item.id);
 return (item && item.name) || (def && def.name) || 'Exercise';
}
function trainingIsWorkingSet(set){ return !!set && set.done !== false && set.type !== 'warmup'; }
function trainingEstimate1RMKg(set){
 if (!trainingIsWorkingSet(set)) return null;
 var load = Number(set.loadKg), reps = Number(set.reps);
 if (!isFinite(load) || load <= 0 || !isFinite(reps) || reps < 1 || reps > 12) return null;
 return load * (1 + reps / 30);
}
function trainingExerciseMetrics(exercise){
 var out = { completedSets:0, workSets:0, reps:0, volumeKg:0, topSet:null, e1rmKg:null };
 (exercise.sets || []).forEach(function(set){
  if (set.done === false) return;
  out.completedSets++;
  var reps = Math.max(0, Number(set.reps) || 0);
  if (trainingIsWorkingSet(set)){
   out.workSets++;
   out.reps += reps;
   out.volumeKg += Math.max(0, Number(set.loadKg) || 0) * reps;
   var e1 = trainingEstimate1RMKg(set);
   if (e1 !== null && (out.e1rmKg === null || e1 > out.e1rmKg)){
    out.e1rmKg = e1;
    out.topSet = set;
   } else if (!out.topSet || (Number(set.reps) || 0) > (Number(out.topSet.reps) || 0)){
    out.topSet = set;
   }
  }
 });
 return out;
}
function trainingWorkoutMetrics(workout){
 var out = { exercises:0, completedSets:0, workSets:0, reps:0, volumeKg:0 };
 (workout && workout.exercises || []).forEach(function(exercise){
  var m = trainingExerciseMetrics(exercise);
  if (m.completedSets) out.exercises++;
  out.completedSets += m.completedSets;
  out.workSets += m.workSets;
  out.reps += m.reps;
  out.volumeKg += m.volumeKg;
 });
 return out;
}
function trainingCompletedWorkouts(list){
 ensureTrainingState();
 return (list || state.workouts).slice().sort(function(a,b){
  var ad = a.d || '', bd = b.d || '';
  if (ad === bd) return (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0);
  return ad < bd ? 1 : -1;
 });
}
function trainingExerciseHistory(exerciseId, workouts){
 var history = [];
 trainingCompletedWorkouts(workouts).slice().reverse().forEach(function(workout){
  (workout.exercises || []).forEach(function(exercise){
   if (exercise.exerciseId !== exerciseId) return;
   var metrics = trainingExerciseMetrics(exercise);
   if (!metrics.workSets) return;
   history.push({ workout:workout, exercise:exercise, metrics:metrics });
  });
 });
 return history;
}
function trainingExerciseStats(exerciseId, workouts){
 var stats = { sessions:0, workSets:0, volumeKg:0, bestE1rmKg:null, bestLoadKg:null, bestReps:0, bestSet:null, history:[] };
 stats.history = trainingExerciseHistory(exerciseId, workouts);
 stats.history.forEach(function(point){
  stats.sessions++;
  stats.workSets += point.metrics.workSets;
  stats.volumeKg += point.metrics.volumeKg;
  if (point.metrics.e1rmKg !== null && (stats.bestE1rmKg === null || point.metrics.e1rmKg > stats.bestE1rmKg)){
   stats.bestE1rmKg = point.metrics.e1rmKg;
   stats.bestSet = point.metrics.topSet;
  }
  (point.exercise.sets || []).forEach(function(set){
   if (!trainingIsWorkingSet(set)) return;
   var load = Number(set.loadKg) || 0, reps = Number(set.reps) || 0;
   if (stats.bestLoadKg === null || load > stats.bestLoadKg) stats.bestLoadKg = load;
   if (reps > stats.bestReps) stats.bestReps = reps;
  });
 });
 return stats;
}
function trainingLatestExercise(exerciseId){
 var history = trainingExerciseHistory(exerciseId);
 return history.length ? history[history.length - 1] : null;
}
function trainingPreviousSets(exerciseId){
 var latest = trainingLatestExercise(exerciseId);
 if (!latest) return [];
 return (latest.exercise.sets || []).filter(trainingIsWorkingSet).map(function(set){
  return { id:uid(), loadKg:Number(set.loadKg) || 0, reps:Number(set.reps) || 0, rpe:set.rpe === null || set.rpe === undefined ? null : Number(set.rpe), type:set.type || 'work', done:true };
 });
}

function trainingDateValue(text){
 var d = new Date((text || todayStr()) + 'T12:00:00');
 return isNaN(d.getTime()) ? new Date() : d;
}
function trainingWeekStart(date){
 var d = new Date(date || Date.now());
 d.setHours(0,0,0,0);
 var day = d.getDay();
 d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
 return d;
}
function trainingThisWeekMetrics(){
 var start = trainingWeekStart();
 var out = { sessions:0, workSets:0, reps:0, volumeKg:0, groups:{} };
 trainingCompletedWorkouts().forEach(function(workout){
  if (trainingDateValue(workout.d) < start) return;
  var metrics = trainingWorkoutMetrics(workout);
  out.sessions++;
  out.workSets += metrics.workSets;
  out.reps += metrics.reps;
  out.volumeKg += metrics.volumeKg;
  (workout.exercises || []).forEach(function(exercise){
   var m = trainingExerciseMetrics(exercise);
   if (!m.workSets) return;
   var def = trainingExerciseById(exercise.exerciseId);
   var group = (def && def.group) || 'Other';
   out.groups[group] = (out.groups[group] || 0) + m.workSets;
  });
 });
 return out;
}
function trainingNewPRs(workout, priorWorkouts){
 var messages = [];
 (workout.exercises || []).forEach(function(exercise){
  var current = trainingExerciseMetrics(exercise);
  if (!current.workSets) return;
  var previous = trainingExerciseStats(exercise.exerciseId, priorWorkouts || []);
  var name = trainingExerciseName(exercise);
  if (current.e1rmKg !== null && (previous.bestE1rmKg === null || current.e1rmKg > previous.bestE1rmKg + 0.05)){
   messages.push(name + ' estimated 1RM');
   return;
  }
  if (current.topSet && (Number(current.topSet.reps) || 0) > previous.bestReps) messages.push(name + ' rep record');
 });
 return messages;
}

function trainingAssessmentCandidate(exercise){
 var map = {
  bench:{ testId:'bench', loads:[55,65,75] },
  squat:{ testId:'squat', loads:[72,80,90] },
  pullup:{ testId:'pullups', bodyweight:true },
  pushup:{ testId:'pushups', bodyweight:true }
 };
 var config = map[exercise.exerciseId];
 if (!config) return null;
 var candidates = [];
 (exercise.sets || []).forEach(function(set){
  if (!trainingIsWorkingSet(set)) return;
  var reps = Math.floor(Number(set.reps) || 0);
  if (reps < 0) return;
  if (config.bodyweight){ candidates.push({ set:set, reps:reps, load:null }); return; }
  var loadKg = Number(set.loadKg) || 0;
  config.loads.forEach(function(allowed){
   if (Math.abs(loadKg - allowed) <= 0.6) candidates.push({ set:set, reps:reps, load:allowed });
  });
 });
 if (!candidates.length) return null;
 var test = testById(config.testId);
 candidates.sort(function(a,b){ return scoreOf(test, b.reps, b) - scoreOf(test, a.reps, a); });
 var best = candidates[0];
 return {
  testId:config.testId,
  value:best.reps,
  load:best.load,
  raw:best.load === null ? best.reps + ' reps' : best.reps + ' × ' + best.load + ' kg'
 };
}
