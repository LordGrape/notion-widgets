(function (root) {
  "use strict";

  /* Smart Add stays dependency-free for reliable embedded and offline use.
     Its reference-date approach is informed by chrono-node (MIT). */
  var MONTHS = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, september: 8, sep: 8, sept: 8,
    october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
  };
  var WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  var settings = { enabled: true };
  var restoreStringify = null;
  var previewTimer = null;

  function pad(value) { return String(value).padStart(2, "0"); }
  function dateKey(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
  function parseList(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") try { var parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (error) {}
    return [];
  }
  function dueState(key, now) {
    var today = dateKey(now || new Date()), tomorrow = new Date(now || new Date());
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (key === today) return "today";
    if (key === dateKey(tomorrow)) return "tomorrow";
    return null;
  }
  function timeBand(minutes) { return minutes <= 20 ? "quick" : minutes <= 45 ? "m30" : minutes <= 90 ? "m60" : "deep"; }
  function normalText(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function localDate(key, time) {
    var d = String(key).split("-").map(Number), t = String(time || "09:00").split(":").map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, 0, 0);
  }
  function isoLocal(key, time) { return localDate(key, time).toISOString(); }
  function addMinutes(key, time, minutes) {
    var d = localDate(key, time); d.setMinutes(d.getMinutes() + minutes);
    return { iso: d.toISOString(), key: dateKey(d), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
  }
  function displayTime(value) {
    var p = String(value || "00:00").split(":"), h = Number(p[0]) || 0, m = pad(Number(p[1]) || 0), suffix = h >= 12 ? "PM" : "AM";
    return (h % 12 || 12) + ":" + m + " " + suffix;
  }
  function findTask(tasks, query, exclude) {
    var needle = normalText(query), best = null, bestScore = 0;
    if (!needle) return null;
    parseList(tasks).forEach(function (task) {
      if (!task || task === exclude || task.done) return;
      var text = normalText(task.text), score = 0;
      if (text === needle) score = 100;
      else if (text.indexOf(needle) >= 0 || needle.indexOf(text) >= 0) score = 80 - Math.abs(text.length - needle.length);
      else {
        var words = needle.split(" "), hits = words.filter(function (word) { return text.split(" ").indexOf(word) >= 0; }).length;
        score = words.length ? Math.round(hits / words.length * 60) : 0;
      }
      if (score > bestScore) { best = task; bestScore = score; }
    });
    return bestScore >= 35 ? best : null;
  }
  function removeRange(text, match) {
    if (!match || typeof match.index !== "number") return text;
    return text.slice(0, match.index) + " " + text.slice(match.index + match[0].length);
  }
  function cleanTitle(text) {
    var cleaned = String(text || "").replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/^(?:start|begin|schedule)\s+/i, "");
    cleaned = cleaned.replace(/[,:;\-]+$/g, "").replace(/\s+/g, " ").trim();
    return cleaned;
  }
  function parseClock(hour, minute, suffix) {
    hour = Number(hour); minute = Number(minute || 0);
    suffix = String(suffix || "").toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    return pad(hour) + ":" + pad(minute);
  }
  function parseCommand(raw, reference, existingTasks) {
    var now = reference instanceof Date ? new Date(reference.getTime()) : new Date();
    var original = String(raw || "").trim(), work = original;
    var result = {
      raw: original, text: original, recognized: false, dateKey: null,
      startTime: null, dueTime: null, duration: null, priority: null,
      dependencyText: null, dependencyId: null, scheduled: false,
      allDay: false, labels: []
    };
    if (!original) return result;

    var priority = work.match(/\b(must|urgent|important|should|could)\b/i);
    if (priority) {
      result.priority = /must|urgent|important/i.test(priority[1]) ? "must" : priority[1].toLowerCase();
      result.labels.push(result.priority.charAt(0).toUpperCase() + result.priority.slice(1));
      result.recognized = true;
    }

    var duration = work.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m|hours?|hrs?|hr|h)\b/i);
    if (duration) {
      var amount = Number(duration[1]), unit = duration[2].toLowerCase();
      result.duration = Math.max(1, Math.round(amount * (/^h/.test(unit) ? 60 : 1)));
      work = removeRange(work, duration);
      result.labels.push(result.duration + " min");
      result.recognized = true;
    }

    var dependency = work.match(/\s+after\s+(.+?)\s*$/i);
    if (dependency && !/^(?:@|at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i.test(dependency[1])) {
      result.dependencyText = dependency[1].trim();
      var linked = findTask(existingTasks, result.dependencyText, null);
      result.dependencyId = linked ? linked.id : null;
      work = removeRange(work, dependency);
      result.labels.push(linked ? "After " + linked.text : "After " + result.dependencyText);
      result.recognized = true;
    }

    var before = work.match(/\bbefore\s+(?:@|at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (before) {
      result.dueTime = parseClock(before[1], before[2], before[3]);
      work = removeRange(work, before);
      if (result.dueTime) { result.labels.push("Due " + displayTime(result.dueTime)); result.recognized = true; }
    }

    var monthPattern = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
    var monthDate = work.match(monthPattern), relativeDate = work.match(/\b(today|tomorrow)\b/i), isoDate = work.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/), weekday = work.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    var chosenDate = null, dateMatch = null;
    if (isoDate) { chosenDate = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 12); dateMatch = isoDate; }
    else if (monthDate) {
      var year = Number(monthDate[3]) || now.getFullYear();
      chosenDate = new Date(year, MONTHS[monthDate[1].toLowerCase()], Number(monthDate[2]), 12);
      if (!monthDate[3] && chosenDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) chosenDate.setFullYear(year + 1);
      dateMatch = monthDate;
    } else if (relativeDate) {
      chosenDate = new Date(now); chosenDate.setHours(12, 0, 0, 0);
      if (relativeDate[1].toLowerCase() === "tomorrow") chosenDate.setDate(chosenDate.getDate() + 1);
      dateMatch = relativeDate;
    } else if (weekday) {
      chosenDate = new Date(now); chosenDate.setHours(12, 0, 0, 0);
      var target = WEEKDAYS[weekday[1].toLowerCase()], distance = (target - chosenDate.getDay() + 7) % 7;
      if (distance === 0 || /^next\s/i.test(weekday[0])) distance += 7;
      chosenDate.setDate(chosenDate.getDate() + distance); dateMatch = weekday;
    }
    if (chosenDate && !Number.isNaN(chosenDate.getTime())) {
      result.dateKey = dateKey(chosenDate); work = removeRange(work, dateMatch);
      result.labels.push(chosenDate.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: chosenDate.getFullYear() !== now.getFullYear() ? "numeric" : undefined }));
      result.recognized = true;
    }

    var clock = work.match(/(?:@|\bat\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (!clock && result.dateKey) clock = work.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/i) || work.match(/\b(\d{1,2})\s*(am|pm)\b/i);
    if (clock) {
      var clockSuffix = clock[3] || (clock[2] && /am|pm/i.test(clock[2]) ? clock[2] : "");
      var clockMinute = clock[3] ? clock[2] : (/am|pm/i.test(clock[2] || "") ? "0" : clock[2]);
      var parsedClock = parseClock(clock[1], clockMinute, clockSuffix);
      if (parsedClock) {
        result.startTime = parsedClock; work = removeRange(work, clock);
        result.labels.push(displayTime(parsedClock)); result.recognized = true;
      }
    }

    var startVerb = /^(?:start|begin|schedule)\b/i.test(original);
    result.scheduled = !!(result.startTime && (startVerb || result.duration));
    if (!result.dateKey && (result.startTime || result.dueTime)) result.dateKey = dateKey(now);
    result.allDay = !!(result.dateKey && !result.startTime && !result.dueTime);
    result.text = cleanTitle(work) || cleanTitle(original);
    if (result.scheduled) result.labels.push("Timetable");
    return result;
  }

  root.TodoSmart = { parse: parseCommand, dateKey: dateKey, findTask: findTask };
  if (!root.document) return;

  function readSettings() {
    try {
      var stored = root.SyncEngine && root.SyncEngine.get("todo", "smartAddSettings");
      if (typeof stored === "string") stored = JSON.parse(stored);
      if (stored && typeof stored.enabled === "boolean") settings.enabled = stored.enabled;
    } catch (error) {}
  }
  function saveSettings() {
    try { if (root.SyncEngine) root.SyncEngine.set("todo", "smartAddSettings", JSON.stringify(settings)); } catch (error) {}
  }
  function currentTasks() {
    try { return parseList(root.SyncEngine && root.SyncEngine.get("todo", "tasks")); } catch (error) { return []; }
  }
  function stableToken(value) {
    var hash = 2166136261, text = String(value || "");
    for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function syncTimetable(task) {
    if (!task || !task.scheduledStart || !task.scheduledEnd || !root.SyncEngine) return;
    var start = new Date(task.scheduledStart), end = new Date(task.scheduledEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return;
    var courses = parseList(root.SyncEngine.get("timetable", "courses"));
    var blockId = "todo_action_" + stableToken(task.occurrenceId || task.id);
    courses = courses.filter(function (block) { return !block || (block.id !== blockId && block.todoTaskId !== task.id); });
    var colours = { must: "#be123c", should: "#c2410c", could: "#8b5cf6" };
    courses.push({
      id: blockId, name: task.text || "To-Do task", description: task.notes || "Timed To-Do task", location: "",
      color: colours[task.pri] || "#8b5cf6",
      days: [{ day: start.getDay(), start: pad(start.getHours()) + ":" + pad(start.getMinutes()), end: pad(end.getHours()) + ":" + pad(end.getMinutes()), location: "" }],
      category: task.category || "study", trackCompletion: false,
      startDate: dateKey(start), endDate: dateKey(start), source: "todo-action-block",
      todoTaskId: task.id, occurrenceId: task.occurrenceId || task.id
    });
    root.SyncEngine.set("timetable", "courses", courses);
  }
  function applyParsed(task, tasks, parsed) {
    var now = new Date(), linked = parsed.dependencyText ? findTask(tasks, parsed.dependencyText, task) : null;
    if (parsed.priority) task.pri = parsed.priority;
    if (parsed.duration) { task.plannedMinutes = parsed.duration; task.time = timeBand(parsed.duration); }
    if (parsed.dateKey) {
      task.dueKey = parsed.dateKey; task.due = dueState(parsed.dateKey, now); task.setKey = dateKey(now);
      task.allDay = parsed.allDay;
    }
    if (parsed.dependencyText) {
      task.dependencyText = parsed.dependencyText;
      task.dependsOn = linked ? linked.id : null;
      task.plan = "After " + (linked ? linked.text : parsed.dependencyText);
      if (linked && typeof linked.order === "number") task.order = linked.order + 0.01;
    }
    var scheduleKey = parsed.dateKey || dateKey(now), scheduleTime = parsed.startTime;
    if (!scheduleTime && linked && linked.scheduledEnd) {
      var linkedEnd = new Date(linked.scheduledEnd);
      if (Number.isFinite(linkedEnd.getTime())) { scheduleKey = dateKey(linkedEnd); scheduleTime = pad(linkedEnd.getHours()) + ":" + pad(linkedEnd.getMinutes()); parsed.scheduled = true; }
    }
    if (parsed.dueTime) task.reminderAt = isoLocal(scheduleKey, parsed.dueTime);
    else if (parsed.startTime && !parsed.scheduled) task.reminderAt = isoLocal(scheduleKey, parsed.startTime);
    else if (parsed.allDay) task.reminderAt = isoLocal(scheduleKey, "09:00");
    if (parsed.scheduled && scheduleTime) {
      var minutes = parsed.duration || task.plannedMinutes || 60, end = addMinutes(scheduleKey, scheduleTime, minutes);
      task.dueKey = scheduleKey; task.due = dueState(scheduleKey, now); task.allDay = false;
      task.scheduledStart = isoLocal(scheduleKey, scheduleTime); task.scheduledEnd = end.iso;
      task.plannedMinutes = minutes; task.time = timeBand(minutes); task.timeboxed = true;
      task.order = Date.parse(task.scheduledStart) || task.order;
    }
    task.smartParsed = true; task.updatedAt = Date.now();
    return task;
  }
  function patchNextAdd(parsed) {
    if (restoreStringify) restoreStringify();
    var original = JSON.stringify, active = true;
    function restore() { if (!active) return; active = false; if (JSON.stringify === wrapped) JSON.stringify = original; restoreStringify = null; }
    function wrapped(value) {
      if (active && Array.isArray(value)) {
        var candidate = null;
        value.forEach(function (task) { if (task && !task.done && (!candidate || Number(task.created || 0) > Number(candidate.created || 0))) candidate = task; });
        if (candidate && normalText(candidate.text) === normalText(parsed.text)) {
          applyParsed(candidate, value, parsed);
          var output = original.apply(JSON, arguments); restore();
          setTimeout(function () { try { syncTimetable(candidate); } catch (error) {} }, 0);
          return output;
        }
      }
      return original.apply(JSON, arguments);
    }
    JSON.stringify = wrapped; restoreStringify = restore; setTimeout(restore, 1500);
  }
  function prepareAdd() {
    if (!settings.enabled) return;
    var input = document.getElementById("inp"); if (!input || !input.value.trim()) return;
    var parsed = parseCommand(input.value, new Date(), currentTasks());
    if (!parsed.recognized) return;
    input.value = parsed.text; patchNextAdd(parsed);
  }
  function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var input = document.getElementById("inp"), row = document.getElementById("smartPreview");
      if (!input || !row) return;
      if (!settings.enabled || !input.value.trim()) { row.hidden = true; row.innerHTML = ""; return; }
      var parsed = parseCommand(input.value, new Date(), currentTasks());
      if (!parsed.recognized || !parsed.labels.length) { row.hidden = true; row.innerHTML = ""; return; }
      row.innerHTML = '<span class="smart-preview-label">Understood</span>' + parsed.labels.map(function (label) { return '<span class="smart-preview-chip">' + String(label).replace(/[&<>\"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }) + "</span>"; }).join("");
      row.hidden = false;
    }, 80);
  }
  function injectStyles() {
    if (document.getElementById("todoSmartStyles")) return;
    var style = document.createElement("style"); style.id = "todoSmartStyles";
    style.textContent = "@media (prefers-color-scheme:light){:root{--text-primary:#241a33!important;--text-secondary:#5e536e!important;--text-tertiary:#756a86!important;--todo-surface:rgba(255,255,255,.92)!important;--todo-surface-2:rgba(250,247,255,.86)!important;--todo-surface-3:rgba(124,58,237,.075)!important;--todo-line:rgba(91,33,182,.18)!important;--todo-line-strong:rgba(91,33,182,.28)!important}.card{box-shadow:0 16px 42px rgba(76,29,149,.11),0 2px 7px rgba(76,29,149,.06)!important}.tab:not(.on),.chip:not(.set),.date,.sync,.stats-label,.stats-sub,.empty,.empty .sub,.tag{color:#5e536e!important}.add input::placeholder,.e-title::placeholder,.e-notes::placeholder,.sub-add::placeholder{color:#756a86!important;opacity:1}.txt,.stats-num,.title,.ring-pct{font-weight:700}.composer .chip,.tabs,.add input,.item{background:rgba(255,255,255,.68)!important}}.smart-toggle.set{background:var(--accent-secondary)!important;color:#fff!important;border-color:transparent!important}.smart-preview{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-top:8px;min-height:24px;color:var(--text-secondary);font-size:.69rem}.smart-preview[hidden]{display:none}.smart-preview-label{font-weight:750;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-primary)}.smart-preview-chip{padding:3px 7px;border:1px solid var(--border-subtle);border-radius:999px;background:var(--surface-2);color:var(--text-secondary);font-weight:650}";
    document.head.appendChild(style);
  }
  function injectControls() {
    injectStyles();
    var composer = document.querySelector(".composer"), input = document.getElementById("inp");
    if (!composer || !input) return false;
    var toggle = document.getElementById("smartAddToggle");
    if (!toggle) {
      toggle = document.createElement("button"); toggle.type = "button"; toggle.id = "smartAddToggle"; toggle.className = "chip smart-toggle";
      toggle.title = "Understand dates, times, durations, and task dependencies";
      toggle.innerHTML = '<span class="k">Smart</span><span id="smartAddLabel">On</span>';
      composer.appendChild(toggle);
      var row = document.createElement("div"); row.id = "smartPreview"; row.className = "smart-preview"; row.hidden = true; row.setAttribute("aria-live", "polite");
      composer.insertAdjacentElement("afterend", row);
      toggle.addEventListener("click", function () { settings.enabled = !settings.enabled; saveSettings(); drawToggle(); preview(); });
    }
    input.addEventListener("input", preview);
    drawToggle(); preview(); return true;
  }
  function drawToggle() {
    var toggle = document.getElementById("smartAddToggle"), label = document.getElementById("smartAddLabel");
    if (!toggle || !label) return;
    toggle.classList.toggle("set", settings.enabled); toggle.setAttribute("aria-pressed", settings.enabled ? "true" : "false"); label.textContent = settings.enabled ? "On" : "Off";
  }
  function boot() {
    readSettings();
    if (!injectControls()) setTimeout(boot, 120);
  }

  document.addEventListener("keydown", function (event) { if (event.key === "Enter" && event.target && event.target.id === "inp") prepareAdd(); }, true);
  document.addEventListener("click", function (event) { if (event.target && event.target.closest && event.target.closest("#addbtn")) prepareAdd(); }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(typeof window !== "undefined" ? window : globalThis);
