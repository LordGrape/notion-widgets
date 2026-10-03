import { minutes, timeString } from "./domain.mjs";

/* What to do when a block is moved, stretched or added on top of others. Pure: events in,
   proposed occurrence changes out; nothing here touches the DOM or storage.

   push     - blocks starting inside the new time move later by just enough, and anything
              they then run into moves along with them; a block the new time starts inside
              ends where the new time begins.
   shorten  - blocks the new time covers lose the covered part (start later or end sooner).
   overlap  - nothing else changes.
   Classes and reminders never move. A mode that would need to move one, push a block past
   midnight or shrink one under MIN minutes is unavailable, with the reason. */

const MIN = 5;
export const isFixed = (e) => String(e.category || "").toLowerCase() === "class" || e.eventType === "reminder";
const span = (e) => [minutes(e.start), minutes(e.end)];
const same = (a, b) => b && a.id === b.id && (b.sourceDate == null || a.sourceDate === b.sourceDate);

export function conflicts(events, start, end, self = null) {
	return events
		.filter((e) => !same(e, self) && e.eventType !== "reminder")
		.filter((e) => {
			const [s, f] = span(e);
			return f > s && s < end && f > start;
		})
		.sort((a, b) => minutes(a.start) - minutes(b.start));
}

export function resolveOverlap(events, start, end, mode, self = null) {
	const hits = conflicts(events, start, end, self);
	if (mode === "overlap" || !hits.length) return { changes: [], blocked: "" };
	const changes = [];
	const fail = (e, why) => ({ changes: [], blocked: `${e.name || "A block"} ${why}` });
	const change = (e, s, f) => changes.push({ event: e, from: { start: e.start, end: e.end }, start: timeString(s), end: timeString(f) });
	if (mode === "shorten") {
		for (const e of hits) {
			if (isFixed(e)) return fail(e, "is a class and stays put.");
			const [s, f] = span(e);
			const [ns, nf] = s >= start ? [end, f] : [s, start];
			if (nf - ns < MIN) return fail(e, "would be covered completely. Push it later instead.");
			change(e, ns, nf);
		}
		return { changes, blocked: "" };
	}
	/* push */
	const others = events
		.filter((e) => !same(e, self) && e.eventType !== "reminder" && minutes(e.end) > minutes(e.start))
		.sort((a, b) => minutes(a.start) - minutes(b.start));
	for (const e of others) {
		const [s, f] = span(e);
		if (s < start && f > start) {
			if (isFixed(e)) return fail(e, "is a class and stays put.");
			if (start - s < MIN) return fail(e, "would be squeezed to nothing.");
			change(e, s, start);
		}
	}
	let cursor = end;
	for (const e of others) {
		const [s, f] = span(e);
		if (s < start) continue;
		if (s >= cursor) {
			cursor = Math.max(cursor, f);
			continue;
		}
		if (isFixed(e)) return fail(e, "is a class and stays put.");
		const ns = cursor, nf = cursor + (f - s);
		if (nf > 1439) return fail(e, "would be pushed past midnight.");
		change(e, ns, nf);
		cursor = nf;
	}
	return { changes, blocked: "" };
}
