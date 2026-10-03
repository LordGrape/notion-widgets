import { minutes, timeString } from "./domain.mjs";

/* Pure helpers for drag interactions: nothing here touches the DOM or storage. */

const SNAP = 15;
export const snap = (minute) => Math.round(minute / SNAP) * SNAP;

/* New order of a group's task ids after `id` is dropped before `beforeId`
   (or at the end when there is no target). Other ids keep their order. */
export function reorderIds(ids, id, beforeId = null) {
	const rest = ids.filter((x) => x !== id);
	const at = beforeId == null ? -1 : rest.indexOf(beforeId);
	if (at === -1) return [...rest, id];
	return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/* Where a pointer at `y` falls among rows described by their vertical midpoints. */
export function insertionIndex(midpoints, y) {
	const i = midpoints.findIndex((m) => y < m);
	return i === -1 ? midpoints.length : i;
}

/* A block dragged so its top edge sits at `dropMinute`: keeps its length, snaps to 15 minutes
   and stays inside the day. */
export function movedTimes(start, end, dropMinute, dayStart = 0, dayEnd = 1439) {
	const length = Math.max(SNAP, minutes(end) - minutes(start));
	let from = snap(dropMinute);
	from = Math.max(dayStart, Math.min(from, dayEnd - length));
	from = Math.max(dayStart, Math.floor(from / SNAP) * SNAP);
	return { start: timeString(from), end: timeString(from + length), minutes: length };
}

/* A block's bottom edge dragged to `rawEnd`: at least 15 minutes long, snapped, inside the day. */
export function resizedEnd(start, rawEnd, dayEnd = 1439) {
	const from = minutes(start);
	return timeString(Math.min(dayEnd, Math.max(from + SNAP, snap(rawEnd))));
}
