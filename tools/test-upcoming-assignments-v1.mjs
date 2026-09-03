import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const moduleSource = fs.readFileSync("upcoming-assignments.js", "utf8");
const document = {
  readyState: "loading",
  addEventListener() {},
  getElementById() {
    return null;
  },
  querySelector() {
    return null;
  },
};
const context = {
  document,
  console,
  setTimeout,
  clearTimeout,
  setInterval() {
    return 1;
  },
  clearInterval() {},
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(moduleSource, context);
const U = context.UpcomingAssignments;
assert.ok(U && U.phasePayload, "Upcoming assignment helpers should be exposed");
assert.equal(U.apiDateKey(new Date(2026, 8, 3, 12)), "2026-09-03");
assert.equal(
  U.daysBetween("2026-09-03", "2026-09-17"),
  14,
  "14-day boundary should be inclusive",
);
assert.equal(U.dateOnly("2026-09-10T15:00:00Z"), "2026-09-10");

const assignment = {
  id: "parent-1",
  title: "Case Brief Assignment",
  due: "2026-09-17",
};
const phase = {
  notionPageId: "phase-page",
  occurrenceId: "assignment:parent-1:draft",
  action: "Draft paper",
  status: "Scheduled",
  scheduledStart: "2026-09-08",
};
assert.deepEqual(U.phasePayload(assignment, phase), {
  notionPageId: "phase-page",
  occurrenceId: "assignment:parent-1:draft",
  scheduleId: "assignment:parent-1",
  contextPageId: "parent-1",
  action: "Draft paper",
  category: "Study",
  status: "Scheduled",
  scheduledStart: "2026-09-08",
  scheduledEnd: null,
  plannedMinutes: null,
  actualMinutes: null,
  priority: "Should",
  source: "Manual",
  notes: "Phase of Case Brief Assignment",
});
const task = U.taskFromPhase(assignment, phase, null);
assert.equal(task.assignmentPhase, true);
assert.equal(
  task.allDay,
  true,
  "dated phases should stay quiet and never act like timed reminders",
);
assert.equal(task.contextPageId, "parent-1");
assert.equal(task.text, "Draft paper");

const core = fs.readFileSync("core.js", "utf8");
const todo = fs.readFileSync("todo.html", "utf8");
const action = fs.readFileSync("action-blocks.js", "utf8");
const worker = fs.readFileSync("worker/src/routes/action-blocks.ts", "utf8");
const index = fs.readFileSync("worker/src/index.ts", "utf8");
assert.ok(
  core.includes("fetchUpcomingAssignments"),
  "SyncEngine should expose the bounded Notion read",
);
assert.ok(
  todo.includes("upcoming-assignments.js?v=20260903-v1"),
  "To-do should load the quiet Upcoming module",
);
assert.ok(todo.includes("UPCOMING ASSIGNMENTS v1"));
assert.ok(action.includes("UPCOMING ASSIGNMENT PHASES v1"));
assert.ok(
  action.includes("contextPageId:t.contextPageId||undefined"),
  "phase context should survive to-do synchronization",
);
assert.ok(
  action.includes("t.allDay"),
  "date-only phases must not fire timed reminders",
);
assert.ok(
  worker.includes("contextPageId?: string | null"),
  "Action Blocks should accept assignment relations",
);
assert.ok(
  worker.includes("item.scheduledStart ? { date:"),
  "unscheduled phases should be durable in Notion",
);
assert.ok(index.includes("handleUpcomingAssignments"));
console.log("Upcoming assignment and phase tests passed");
