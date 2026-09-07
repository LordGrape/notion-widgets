export const PHASES = [
  { id: 'retrieve', label: 'Retrieve', interval: 1, minutes: 5 },
  { id: 'explain', label: 'Explain', interval: 4, minutes: 7 },
  { id: 'apply', label: 'Apply', interval: 10, minutes: 12 },
  { id: 'distinguish', label: 'Distinguish', interval: 21, minutes: 10 },
  { id: 'integrate', label: 'Integrate', interval: 30, minutes: 15 },
  { id: 'perform', label: 'Perform', interval: 14, minutes: 25 },
];
const DAY = 86_400_000;
const pad = (value) => String(value).padStart(2, '0');
export function dateKey(value = new Date()) { const d = value instanceof Date ? value : new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function shiftDate(key, days) { const [year, month, day] = String(key).split('-').map(Number); const value = new Date(year, month - 1, day, 12); value.setDate(value.getDate() + days); return dateKey(value); }
export function parseList(value) { if (Array.isArray(value)) return value; if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
export function phaseFor(item) { return PHASES.find((phase) => phase.id === item.phase) || PHASES[0]; }
export function isDue(item, today = dateKey()) { return !item.archived && (!item.nextReview || item.nextReview <= today); }
function examPressure(item, today) { if (!item.examDate) return 0; const days = Math.ceil((new Date(`${item.examDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / DAY); if (days <= 7) return 45; if (days <= 21) return 25; if (days <= 45) return 10; return 0; }
function dueScore(item, today) { const overdue = item.nextReview ? Math.max(0, Math.floor((new Date(`${today}T12:00:00`) - new Date(`${item.nextReview}T12:00:00`)) / DAY)) : 7; const importance = { critical: 35, high: 22, medium: 10, low: 0 }[item.priority] ?? 10; const weakness = Math.max(0, 4 - Number(item.lastRating || 0)) * 9; return overdue * 3 + importance + weakness + examPressure(item, today); }
export function buildDailyPlan(state, options = {}) {
  const today = options.today || dateKey(); const budget = Math.max(10, Number(options.minutes || state.settings?.sessionMinutes || 40));
  const items = Object.values(state.items || {}).filter((item) => isDue(item, today));
  items.sort((a, b) => dueScore(b, today) - dueScore(a, today) || String(a.course).localeCompare(String(b.course)));
  const plan = []; let used = 0; const seenCourses = new Set();
  for (const item of items) { const phase = phaseFor(item); const minutes = Math.max(3, Number(item.minutes || phase.minutes)); if (plan.length && used + minutes > budget) continue; const interleavedBonus = seenCourses.has(item.course) ? 0 : 8; plan.push({ id: `plan:${today}:${item.id}`, itemId: item.id, course: item.course || 'General', topic: item.topic || item.prompt, phase: phase.id, phaseLabel: phase.label, prompt: item.prompt, answer: item.answer || item.modelAnswer || '', minutes, score: dueScore(item, today) + interleavedBonus }); used += minutes; seenCourses.add(item.course); if (used >= budget) break; }
  return { date: today, minutes: used, budget, steps: plan, remainingDue: Math.max(0, items.length - plan.length) };
}
export function rateItem(item, rating, today = dateKey()) {
  const index = Math.max(0, PHASES.findIndex((phase) => phase.id === phaseFor(item).id)); let nextIndex = index; let delay = 1;
  if (rating === 1) { nextIndex = Math.max(0, index - 1); delay = 1; }
  if (rating === 2) { nextIndex = index; delay = Math.max(1, Math.ceil(PHASES[index].interval / 2)); }
  if (rating === 3) { nextIndex = Math.min(PHASES.length - 1, index + 1); delay = PHASES[index].interval; }
  if (rating === 4) { nextIndex = Math.min(PHASES.length - 1, index + 1); delay = Math.max(2, Math.round(PHASES[index].interval * 1.5)); }
  const event = { at: new Date().toISOString(), rating, phase: PHASES[index].id };
  return { ...item, phase: PHASES[nextIndex].id, lastRating: rating, lastReview: today, nextReview: shiftDate(today, delay), reviews: [...(item.reviews || []), event].slice(-100), modified: new Date().toISOString() };
}
export function planToTodoTasks(plan, existing = []) {
  const list = parseList(existing); const byId = new Map(list.map((task) => [task.id, task]));
  for (const step of plan.steps) { const id = `studyengine:${plan.date}:${step.itemId}:${step.phase}`; const previous = byId.get(id) || {}; byId.set(id, { ...previous, id, text: `${step.course}: ${step.phaseLabel} — ${step.topic}`, title: `${step.course}: ${step.topic}`, notes: step.prompt, dueKey: plan.date, date: plan.date, priority: step.score >= 55 ? 'must' : 'should', category: 'study', source: 'studyengine', studyItemId: step.itemId, studyPhase: step.phase, estimatedMinutes: step.minutes, done: Boolean(previous.done), createdAt: previous.createdAt || Date.now(), updatedAt: Date.now() }); }
  return [...byId.values()];
}
export function syncCompletions(state, tasks) { const items = { ...(state.items || {}) }; let changed = false; for (const task of parseList(tasks)) { if (task.source !== 'studyengine' || !task.studyItemId || !task.done || !items[task.studyItemId]) continue; const item = items[task.studyItemId]; if (item.todoCompletedAt === task.doneAt || (!task.doneAt && item.todoCompleted)) continue; items[task.studyItemId] = { ...item, todoCompleted: true, todoCompletedAt: task.doneAt || task.updatedAt || Date.now() }; changed = true; } return changed ? { ...state, items } : state; }
export function nextStudyWindow(timetable, now = new Date()) { const blocks = parseList(timetable).filter((block) => block && (block.category === 'study' || /study|review|exam|reading/i.test(`${block.name || ''} ${block.description || ''}`))); if (!blocks.length) return null; const todayName = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()]; const minutesNow = now.getHours() * 60 + now.getMinutes(); const toMinutes = (value) => { const [h, m] = String(value || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : 9999; }; return blocks.filter((block) => !block.days || block.days.includes(todayName) || block.days.includes(now.getDay())).sort((a, b) => toMinutes(a.start) - toMinutes(b.start)).find((block) => toMinutes(block.end) >= minutesNow) || null; }
export function initialState() { return { version: 1, items: {}, courses: {}, sessions: [], settings: { sessionMinutes: 40 }, createdAt: new Date().toISOString() }; }
