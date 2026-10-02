import {
	isoDate,
	localDate,
	normalizeDateKey,
	minutes,
	validateSlot,
} from "./domain.mjs";
const copy = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) =>
	Array.isArray(value)
		? value.map(canonical)
		: value && typeof value === "object"
			? Object.fromEntries(
					Object.keys(value)
						.sort()
						.map((key) => [key, canonical(value[key])]),
				)
			: value;
const same = (a, b) =>
	JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const dateValid = (key) =>
	/^\d{4}-\d{2}-\d{2}$/.test(key || "") && isoDate(localDate(key)) === key;

// Keep the timetable's sourceDate identity when an occurrence has been moved.
export function changeCalendar(
	blocks,
	tasks,
	event,
	action,
	patch = {},
	now = Date.now(),
) {
	const next = { blocks: copy(blocks), tasks: copy(tasks) };
	const block = next.blocks.find((b) => b.id === event.id);
	if (!block) throw Error("This block is no longer on the schedule.");
	if (!dateValid(event.sourceDate) || !dateValid(event.dateKey))
		throw Error("This occurrence is no longer available.");
	if (!["edit", "skip", "remove"].includes(action))
		throw Error("Choose a calendar action.");
	if (action === "remove")
		next.blocks = next.blocks.filter((b) => b.id !== block.id);
	else {
		const previous = (block.overrides || []).find(
			(o) => o.sourceDate === event.sourceDate,
		);
		const override = {
			...previous,
			sourceDate: event.sourceDate,
			date: event.dateKey,
			skipped: action === "skip",
		};
		if (action === "edit") {
			if (
				!dateValid(patch.date) ||
				!/^\d{2}:\d{2}$/.test(patch.start || "") ||
				!/^\d{2}:\d{2}$/.test(patch.end || "") ||
				+patch.start.slice(3) > 59 ||
				+patch.end.slice(3) > 59
			)
				throw Error("Choose a valid date and time range.");
			validateSlot([], minutes(patch.start), minutes(patch.end));
			Object.assign(override, {
				date: patch.date,
				start: patch.start,
				end: patch.end,
			});
		}
		block.overrides = (block.overrides || [])
			.filter((o) => o.sourceDate !== event.sourceDate)
			.concat(override);
	}
	next.tasks = next.tasks.flatMap((t) => {
		const linked =
			(block.todoTaskId && t.id === block.todoTaskId) ||
			(block.occurrenceId && t.occurrenceId === block.occurrenceId) ||
			t.scheduleId === block.id;
		const selected =
			block.todoTaskId === t.id ||
			normalizeDateKey(t.sourceDate || t.dueKey) === event.sourceDate ||
			normalizeDateKey(t.dueKey) === event.dateKey;
		if (!linked || (action !== "remove" && !selected)) return [t];
		// Completed records stay as history when removing calendar time.
		if (action !== "edit" && t.done) return [{ ...t, calendarDetached: true, updatedAt: now }];
		if (action === "edit") {
			Object.assign(t, {
				dueKey: patch.date,
				due: patch.date === isoDate(new Date(now)) ? "today" : null,
				scheduledStart: new Date(`${patch.date}T${patch.start}`).toISOString(),
				scheduledEnd: new Date(`${patch.date}T${patch.end}`).toISOString(),
				calendarDetached: false,
				allDay: false,
				timeboxed: true,
				plannedMinutes: minutes(patch.end) - minutes(patch.start),
				sourceDate: event.sourceDate,
				updatedAt: now,
			});
		} else {
			// A generated occurrence disappears with its block; user-authored tasks become unscheduled.
			if (t.source === "timetable") return [];
			Object.assign(t, {
				scheduledStart: null,
				scheduledEnd: null,
				scheduleId: null,
				sourceDate: null,
				calendarDetached: true,
				timeboxed: false,
				allDay: true,
				updatedAt: now,
			});
		}
		return [t];
	});
	return next;
}

// Undo only records touched by this action, preserving unrelated edits and additions.
export function undoCalendar(before, after, current) {
	const next = copy(current);
	for (const key of ["blocks", "tasks"]) {
		const oldById = new Map(before[key].map((v) => [v.id, v]));
		const savedById = new Map(after[key].map((v) => [v.id, v]));
		const changed = [
			...new Set([...oldById.keys(), ...savedById.keys()]),
		].filter((id) => !same(oldById.get(id), savedById.get(id)));
		for (const id of changed) {
			if (
				!same(
					next[key].find((v) => v.id === id),
					savedById.get(id),
				)
			)
				throw Error(
					"This block or task has changed since then. Undo is no longer available.",
				);
			const index = next[key].findIndex((v) => v.id === id),
				original = oldById.get(id);
			if (!original) next[key] = next[key].filter((v) => v.id !== id);
			else if (index >= 0) next[key][index] = copy(original);
			else next[key].push(copy(original));
			if (original && key === "tasks")
				next[key].find((v) => v.id === id).updatedAt = Date.now();
		}
	}
	return next;
}
