const WORKER = 'https://widget-sync.lordgrape-widgets.workers.dev';
const widgets = [
  { id: 'todo', name: 'Tasks', symbol: '✓', description: 'Priorities, reminders, and action blocks', path: '../../todo-v2.html' },
  { id: 'timetable', name: 'Timetable', symbol: '▦', description: 'Schedule, targets, and weekly planning', path: '../../timetable.html' },
  { id: 'study', name: 'Study Engine', symbol: 'A', description: 'Active recall and review sessions', path: '../../studyengine/' },
  { id: 'athlete', name: 'Athlete', symbol: '△', description: 'Training, assessments, and performance', path: '../../athlete.html' },
  { id: 'clock', name: 'Clock', symbol: '◷', description: 'Time, focus, timer, and weather', path: '../../clock.html' },
  { id: 'quotes', name: 'Quotes', symbol: '“', description: 'A quiet idea for the day', path: '../../quotes.html' }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let tasks = [];
let deferredInstall;

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
  }
  return [];
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getTasks() {
  try { return parseList(window.SyncEngine?.get('todo', 'tasks')); } catch (_) { return []; }
}

function isDueToday(task) {
  return task.due === 'today' || task.dueKey === dayKey() || (!task.due && !task.dueKey);
}

function priorityRank(task) {
  const rank = { must: 0, should: 1, could: 2 };
  return rank[task.pri] ?? 3;
}

function activeTasks() {
  return tasks.filter(task => !task.done).sort((a, b) => priorityRank(a) - priorityRank(b) || Number(a.order ?? 999) - Number(b.order ?? 999) || Number(a.created ?? 0) - Number(b.created ?? 0));
}

function renderTaskList() {
  const list = $('#taskList');
  const active = activeTasks().slice(0, 5);
  if (!active.length) {
    list.innerHTML = '<div class="empty-state">No active tasks found.</div>';
    return;
  }
  list.innerHTML = active.map(task => {
    const meta = [task.pri ? `<span class="priority">${escapeHtml(task.pri)}</span>` : '', task.dueKey ? `<span>${escapeHtml(task.dueKey)}</span>` : task.due ? `<span>${escapeHtml(task.due)}</span>` : '', task.time ? `<span>${escapeHtml(task.time)}</span>` : ''].filter(Boolean).join('');
    return `<div class="task-row"><span class="task-check" aria-hidden="true"></span><div><div class="task-title">${escapeHtml(task.text || 'Untitled task')}</div><div class="task-meta">${meta}</div></div><span class="task-time">${task.notes ? 'Notes' : ''}</span></div>`;
  }).join('');
}

function renderSummary() {
  const active = activeTasks();
  const today = active.filter(isDueToday);
  const completedToday = tasks.filter(task => task.done && task.doneAt && new Date(task.doneAt).toDateString() === new Date().toDateString()).length;
  let focusSeconds = 0;
  try { focusSeconds = Number(window.SyncEngine?.get('clock', `focus_${dayKey()}`) || 0); } catch (_) {}
  $('#openCount').textContent = today.length;
  $('#openDetail').textContent = active.length ? `${active.length} active overall` : 'Queue is clear';
  $('#doneCount').textContent = completedToday;
  $('#focusMinutes').textContent = `${Math.floor(focusSeconds / 60)}m`;
  const next = today[0] || active[0];
  if (next) {
    $('#focusTitle').textContent = next.text || 'Review the next task';
    $('#focusReason').textContent = next.pri === 'must' ? 'This is the highest-priority unfinished item in your current queue.' : 'This is the strongest available next action based on your current task order.';
  } else {
    $('#focusTitle').textContent = 'Your action queue is clear';
    $('#focusReason').textContent = 'Use the timetable or Study Engine to decide whether anything should be planned next.';
  }
}

function refreshData() {
  tasks = getTasks();
  renderTaskList();
  renderSummary();
  $('#syncDot').classList.toggle('ready', Boolean(window.SyncEngine));
  $('#syncLabel').textContent = window.SyncEngine ? 'Synchronized' : 'Local preview';
}

function generateBriefing() {
  const active = activeTasks();
  const today = active.filter(isDueToday);
  const must = active.filter(task => task.pri === 'must');
  if (!active.length) return 'Your task queue is clear. Check the timetable before adding work simply to fill the space.';
  const lead = today[0] || active[0];
  const parts = [`You have ${today.length} item${today.length === 1 ? '' : 's'} in today’s queue and ${active.length} active overall.`];
  if (must.length) parts.push(`${must.length} ${must.length === 1 ? 'is' : 'are'} marked must-do.`);
  parts.push(`Start with “${lead.text || 'Untitled task'}”.`);
  parts.push('Reassess after completing it rather than planning the entire day in advance.');
  return parts.join(' ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function widgetCard(widget, expanded = false) {
  return `<button class="widget-card" data-open-widget="${widget.id}"><span class="widget-symbol">${widget.symbol}</span><span><strong>${widget.name}</strong>${expanded ? `<small>${widget.description}</small>` : ''}</span></button>`;
}

function renderWidgets() {
  $('#quickGrid').innerHTML = widgets.slice(0, 4).map(widget => widgetCard(widget)).join('');
  $('#widgetGrid').innerHTML = widgets.map(widget => widgetCard(widget, true)).join('');
  $$('[data-open-widget]').forEach(button => button.addEventListener('click', () => openWidget(button.dataset.openWidget)));
}

function openWidget(id) {
  const widget = widgets.find(item => item.id === id);
  if (!widget) return;
  $('#widgetModalTitle').textContent = widget.name;
  $('#widgetFrame').src = widget.path;
  $('#widgetStandalone').href = widget.path;
  $('#widgetOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeWidget() {
  $('#widgetOverlay').hidden = true;
  $('#widgetFrame').src = 'about:blank';
  document.body.style.overflow = '';
}

function setView(id) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === id));
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === id));
  $('.sidebar').classList.remove('open');
  history.replaceState(null, '', `#${id}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function openCommand(prefill = '') {
  $('#commandOverlay').hidden = false;
  $('#commandInput').value = prefill;
  $('#commandInput').focus();
}

function closeCommand() { $('#commandOverlay').hidden = true; }

function answerCommand(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return;
  const widget = widgets.find(item => normalized.includes(item.id) || normalized.includes(item.name.toLowerCase()));
  if (normalized.includes('brief') || normalized.includes('next') || normalized.includes('attention') || normalized.includes('priority')) {
    $('#commandResponse').innerHTML = `<strong>Current briefing</strong><p>${escapeHtml(generateBriefing())}</p>`;
  } else if (widget && (normalized.includes('open') || normalized === widget.id || normalized === widget.name.toLowerCase())) {
    closeCommand(); openWidget(widget.id);
  } else if (normalized.includes('widget')) {
    closeCommand(); setView('widgets');
  } else {
    $('#commandResponse').innerHTML = '<strong>Not connected to an AI service yet</strong><p>This first version can navigate widgets and interpret synchronized task data. A secure conversational service belongs in the next phase.</p>';
  }
}

function bindEvents() {
  $$('.nav-item').forEach(item => item.addEventListener('click', event => { event.preventDefault(); setView(item.dataset.view); }));
  $$('[data-view-link]').forEach(item => item.addEventListener('click', event => { event.preventDefault(); setView(item.dataset.viewLink); }));
  $('#menuButton').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  $('#commandButton').addEventListener('click', () => openCommand());
  $('#closeCommand').addEventListener('click', closeCommand);
  $('#commandOverlay').addEventListener('click', event => { if (event.target === $('#commandOverlay')) closeCommand(); });
  $('#commandInput').addEventListener('keydown', event => { if (event.key === 'Enter') answerCommand(event.currentTarget.value); });
  $('#closeWidget').addEventListener('click', closeWidget);
  $('#widgetOverlay').addEventListener('click', event => { if (event.target === $('#widgetOverlay')) closeWidget(); });
  $('#refreshButton').addEventListener('click', refreshData);
  $('#briefingButton').addEventListener('click', () => { $('#briefing').textContent = generateBriefing(); });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommand(); }
    if (event.key === 'Escape') { closeCommand(); if (!$('#widgetOverlay').hidden) closeWidget(); }
  });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1) === 'widgets' ? 'widgets' : 'today'));
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; $('#installButton').hidden = false; });
  $('#installButton').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#installButton').hidden = true; });
}

async function initSync() {
  if (!window.SyncEngine?.init) return refreshData();
  try {
    await Promise.race([window.SyncEngine.init({ worker: WORKER, namespaces: ['todo', 'timetable', 'clock', 'user'] }), new Promise(resolve => setTimeout(resolve, 3500))]);
    window.SyncEngine.subscribe?.('todo', 'tasks', refreshData);
  } catch (error) { console.warn('[Command Centre] Sync initialization failed', error); }
  refreshData();
}

function init() {
  const now = new Date();
  $('#dateLabel').textContent = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const hour = now.getHours();
  $('#greeting').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, Musbah`;
  renderWidgets(); bindEvents(); setView(location.hash.slice(1) === 'widgets' ? 'widgets' : 'today'); initSync();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('[Command Centre] Service worker unavailable', error));
}

init();
