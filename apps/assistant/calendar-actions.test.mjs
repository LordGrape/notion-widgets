import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { changeCalendar, undoCalendar } from "./calendar-actions.mjs";
const source = fs.readFileSync(
	new URL("../../timetable.html", import.meta.url),
	"utf8",
);
const context = {
	Date,
	schedule: [],
	hasOwn: (o, k) => Object.hasOwn(o, k),
	clean: (v) => v || "",
	mins: (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
};
vm.createContext(context);
vm.runInContext(
	source.slice(
		source.indexOf("function scheduleDateKey("),
		source.indexOf("function flatFor("),
	),
	context,
);
vm.runInContext(
	source.slice(
		source.indexOf("function decorateBlock("),
		source.indexOf("function readVault("),
	),
	context,
);
const occurrences = (blocks, key) => {
	context.schedule = blocks;
	return JSON.parse(
		JSON.stringify(context.occurrencesForDate(new Date(key + "T12:00:00"))),
	);
};
const blocks = [
	{
		id: "seminar",
		name: "Sample seminar",
		category: "class",
		color: "#9461e9",
		days: [
			{ day: 4, start: "10:00", end: "11:00" },
			{ day: 2, start: "10:00", end: "11:00" },
		],
		overrides: [],
		privateMetadata: { retain: true },
	},
];
const event = occurrences(blocks, "2026-10-01")[0];
test("skip uses real timetable expansion: only the selected week and day disappears", () => {
	const next = changeCalendar(blocks, [], event, "skip");
	assert.equal(occurrences(next.blocks, "2026-10-01").length, 0);
	assert.equal(occurrences(next.blocks, "2026-10-08").length, 1);
	assert.equal(occurrences(next.blocks, "2026-10-06").length, 1);
	assert.equal(blocks[0].overrides.length, 0);
});
test("edit and skip a moved occurrence keep its original identity and other weeks", () => {
	const edited = changeCalendar(blocks, [], event, "edit", {
		date: "2026-10-02",
		start: "14:00",
		end: "15:00",
	});
	const moved = occurrences(edited.blocks, "2026-10-02")[0];
	assert.equal(moved.sourceDate, "2026-10-01");
	assert.equal(moved.start, "14:00");
	assert.equal(occurrences(edited.blocks, "2026-10-01").length, 0);
	assert.equal(occurrences(edited.blocks, "2026-10-08")[0].start, "10:00");
	const skipped = changeCalendar(edited.blocks, [], moved, "skip");
	assert.equal(occurrences(skipped.blocks, "2026-10-02").length, 0);
	assert.equal(occurrences(skipped.blocks, "2026-10-01").length, 0);
});
test("manual task keeps notes, subtasks, and priority when unscheduled; history stays intact", () => {
	const mirrored = [
		{ ...blocks[0], todoTaskId: "manual", occurrenceId: "sample" },
	];
	const tasks = [
		{
			id: "manual",
			text: "Read sample",
			pri: "could",
			notes: "Keep me",
			subs: [{ text: "Step" }],
			occurrenceId: "sample",
			scheduledStart: "2026-10-01T14:00:00Z",
			dueKey: "2026-10-01",
		},
		{
			id: "generated",
			source: "timetable",
			scheduleId: "seminar",
			sourceDate: "2026-10-01",
			done: false,
		},
		{
			id: "history",
			source: "timetable",
			scheduleId: "seminar",
			sourceDate: "2026-09-24",
			done: true,
		},
	];
	const next = changeCalendar(mirrored, tasks, event, "remove");
	assert.equal(next.blocks.length, 0);
	const manual = next.tasks.find((t) => t.id === "manual");
	assert.equal(manual.scheduledStart, null);
	assert.equal(manual.notes, "Keep me");
	assert.equal(manual.pri, "could");
	assert.equal(manual.subs.length, 1);
	assert(!next.tasks.some((t) => t.id === "generated"));
	assert(next.tasks.find((t) => t.id === "history").done);
});
test("edit updates only the matching task occurrence, and normalisation preserves links", () => {
	const tasks = [
		{
			id: "current",
			scheduleId: "seminar",
			sourceDate: "2026-10-01",
			notes: "Keep me",
		},
		{ id: "next", scheduleId: "seminar", sourceDate: "2026-10-08" },
	];
	const next = changeCalendar(blocks, tasks, event, "edit", {
		date: "2026-10-02",
		start: "14:00",
		end: "14:30",
	});
	assert.equal(next.tasks[0].plannedMinutes, 30);
	assert.equal(next.tasks[0].sourceDate, "2026-10-01");
	assert.deepEqual(next.tasks[1], tasks[1]);
	const normalized = context.normaliseBlocks([
		{ ...blocks[0], todoTaskId: "manual", source: "todo-action-block" },
	]);
	assert.equal(normalized[0].todoTaskId, "manual");
	assert(normalized[0].privateMetadata.retain);
});
test("invalid edits do not mutate state", () => {
	for (const patch of [
		{ date: "2026-02-30", start: "10:00", end: "11:00" },
		{ date: "2026-10-01", start: "10:99", end: "11:00" },
		{ date: "2026-10-01", start: "13:00", end: "12:00" },
	])
		assert.throws(
			() => changeCalendar(blocks, [], event, "edit", patch),
			/valid/,
		);
	assert.equal(blocks[0].overrides.length, 0);
});
test("undo restores just touched records, tolerates object-key ordering, and rejects newer edits", () => {
	const before = { blocks, tasks: [] },
		after = changeCalendar(blocks, [], event, "remove");
	const unrelated = { id: "other", name: "Unrelated" };
	const restored = undoCalendar(before, after, {
		blocks: [unrelated],
		tasks: [],
	});
	assert(restored.blocks.some((b) => b.id === "seminar"));
	assert.deepEqual(
		restored.blocks.find((b) => b.id === "other"),
		unrelated,
	);
	const edited = changeCalendar(blocks, [], event, "edit", {
		date: "2026-10-01",
		start: "11:00",
		end: "12:00",
	});
	assert.doesNotThrow(() =>
		undoCalendar(before, edited, {
			blocks: edited.blocks.map((b) =>
				Object.fromEntries(Object.entries(b).reverse()),
			),
			tasks: [],
		}),
	);
	const newer = structuredClone(edited);
	newer.blocks[0].name = "Newer edit";
	assert.throws(() => undoCalendar(before, edited, newer), /changed/);
});

// The existing completion bridge must not recreate a block explicitly removed from the calendar.
test("completed task history does not resurrect an explicitly removed timebox", () => {
 const bridge = fs.readFileSync(new URL('../../todo-completion-sync.js', import.meta.url), 'utf8');
 const c = {Date}; vm.createContext(c);
 vm.runInContext(bridge.slice(bridge.indexOf('  function list('),bridge.indexOf('  function reconcile(')),c);
 const removed = {id:'mirror',source:'todo-action-block',todoTaskId:'task',todoDone:true};
 assert.equal(c.decorate([], [{id:'task',done:true,calendarDetached:true}], [removed], false).courses.length,0);
 assert.equal(c.decorate([], [{id:'task',done:true}], [removed], false).courses.length,1);
});
