import { isoDate, localDate } from "./domain.mjs";

/* Turns the READINGS in a lecture's Notion notes into reading tasks. Pure: it never reads or writes
   anything, so the preview can be tested and nothing happens until the user confirms. */

const NUM = String.raw`\d+(?!\d|st\b|nd\b|rd\b|th\b)`;
const RANGE = String.raw`${NUM}(?:\s*[–—-]\s*${NUM})?`;
const MARK = String.raw`(?:\bpp?\.?|\bpgs?\.?|\bpages?)`;
const SEP = String.raw`(?:,\s*(?:and\s+)?|&|;|\band\b|\+)`;
const LIST = new RegExp(String.raw`${MARK}\s*(${RANGE}(?:\s*${SEP}\s*(?:${MARK}\s*)?${RANGE})*)`, "gi");
const BARE = new RegExp(String.raw`^(?:read\s+)?(${RANGE}(?:\s*${SEP}\s*${RANGE})*)\.?$`, "i");
const EDITION = /\b(\d+(?:st|nd|rd|th))\s*ed\b/gi;
const HEADING = /^[A-Z][A-Z &/]+$/;
const BULLET = /^\s*(?:[•●*-]\s+)/;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/* "78-98, 105" -> [[78, 98], [105, 105]], merged and sorted. */
export function parseRanges(text) {
	const found = [...String(text).matchAll(/(\d+)(?:\s*[–—-]\s*(\d+))?/g)].map((m) => [+m[1], +(m[2] || m[1])]);
	if (!found.length || found.some(([a, b]) => a < 1 || b < a)) return [];
	found.sort((a, b) => a[0] - b[0]);
	const merged = [];
	for (const [a, b] of found) {
		const last = merged.at(-1);
		if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
		else merged.push([a, b]);
	}
	return merged;
}

export const pageCount = (ranges) => ranges.reduce((n, [a, b]) => n + b - a + 1, 0);
export const formatRanges = (ranges) => ranges.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");

const cleanSource = (before) =>
	before
		.replace(/\(?\b\d+(?:st|nd|rd|th)\s*ed\b\.?,?\)?/gi, "")
		.replace(/^\s*read\s+/i, "")
		.replace(/[\s,;:(]+$/g, "")
		.replace(/\s{2,}/g, " ")
		.trim();

const hasHeadings = (notes) => String(notes || "").split(/\r?\n/).some((l) => HEADING.test(l.trim()));

function readingsLines(notes) {
	const lines = String(notes || "").split(/\r?\n/);
	if (!hasHeadings(notes)) return lines.map((l) => l.replace(BULLET, "").trim()).filter(Boolean);
	const out = [];
	let inside = false;
	for (const line of lines) {
		const t = line.trim();
		if (!t) continue;
		if (HEADING.test(t) && !BULLET.test(line)) {
			inside = /^READINGS?\b/.test(t);
			continue;
		}
		if (inside) out.push(t.replace(BULLET, "").trim());
	}
	return out;
}

/* One reading per bullet: { source, ranges, pages, edition, editions }. When a bullet gives pages for
   more than one edition ("11th ed, pp 76-78; 12th ed, pp 71-73") the preferred edition is used, or the
   first one listed; `editions` says which were offered. */
export function parseReadings(notes, { edition = "" } = {}) {
	const readings = [];
	for (const line of readingsLines(notes)) {
		const matches = [...line.matchAll(LIST)];
		if (!matches.length) {
			/* A note that is nothing but page numbers, such as "17-18 & 26-27". */
			const bare = !hasHeadings(notes) && line.match(BARE);
			if (bare) {
				const ranges = parseRanges(bare[1]);
				if (ranges.length) readings.push({ source: "", ranges, pages: pageCount(ranges), edition: "", editions: [] });
			}
			continue;
		}
		const markers = [...line.matchAll(EDITION)].map((m) => ({ at: m.index, name: m[1].toLowerCase() }));
		const editionOf = (match) => markers.filter((m) => m.at < match.index).at(-1)?.name || "";
		const tagged = matches.map((match) => ({ match, ed: editionOf(match) }));
		const editions = [...new Set(tagged.map((t) => t.ed).filter(Boolean))];
		const want = edition && editions.includes(edition.toLowerCase()) ? edition.toLowerCase() : editions[0] || "";
		const used = editions.length > 1 ? tagged.filter((t) => t.ed === want) : tagged;
		const ranges = parseRanges(used.map((t) => t.match[1]).join(", "));
		if (!ranges.length) continue;
		readings.push({ source: cleanSource(line.slice(0, matches[0].index)), ranges, pages: pageCount(ranges), edition: editions.length ? want : "", editions });
	}
	return readings;
}

/* Lectures whose notes ask you to confirm the readings before class. */
export const needsVerify = (notes) => /\bVERIFY BEFORE CLASS\b/i.test(String(notes || ""));

/* Prep bullets that name reading but give no pages, e.g. "McCallum, Chapter 11, with a skim of Section F". */
export function prepReadingLines(notes) {
	const lines = String(notes || "").split(/\r?\n/);
	const out = [];
	let inside = false;
	for (const line of lines) {
		const t = line.trim();
		if (!t) continue;
		if (HEADING.test(t) && !BULLET.test(line)) {
			inside = /^PREPARE\b/.test(t);
			continue;
		}
		if (inside && /\b(chapter|read|skim|reading)/i.test(t)) out.push(t.replace(BULLET, "").trim());
	}
	return out;
}

/* A note such as "The updated reading schedule moves this class to Tuesday, 13 October 2026". */
export function movedDate(notes) {
	const m = String(notes || "").match(/moves? this (?:class|review|lecture|tutorial|session)\s+to\s+(?:\w+,?\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
	if (!m) return null;
	const month = MONTHS.indexOf(m[2].toLowerCase());
	if (month < 0) return null;
	return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

/* "LAW 160 Criminal Law" -> "Criminal Law". */
export function courseLabel(name) {
	const cleaned = String(name || "")
		.replace(/^\s*[A-Z]{2,5}[\s-]?\d{3,4}[A-Z]?\s*[:–—-]?\s*/, "")
		.replace(/\s*\([^)]*\)\s*$/, "")
		.trim();
	return cleaned || String(name || "").trim();
}

const normalize = (text) =>
	String(text || "")
		.toLowerCase()
		.replace(/[–—]/g, "-")
		.replace(/\bread\b/g, "")
		.replace(/[^a-z0-9 .\-,&]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const words = (text) => new Set(String(text || "").toLowerCase().match(/[a-z]{4,}/g) || []);
const STOP = new Set(["read", "reading", "readings", "pages", "class", "lecture", "with", "from", "that", "this", "and", "the"]);

/* A task you wrote yourself counts as this reading when it names every page range and shares a word with
   the class, so "Read Criminal Law pp. 78-98" matches a class on pp. 78-98 of Criminal Law. */
function coversReading(taskText, ranges, labels) {
	const text = String(taskText || "").replace(/[–—]/g, "-").replace(/\s*-\s*/g, "-");
	const every = ranges.every(([a, b]) => new RegExp(String.raw`(?<![\d-])${a === b ? a : `${a}-${b}`}(?![\d-])`).test(text));
	if (!every) return false;
	const mine = words(text);
	return labels.some((l) => [...words(l)].some((w) => !STOP.has(w) && mine.has(w)));
}

const classDay = (start) => (/^\d{4}-\d{2}-\d{2}$/.test(start) ? start : isoDate(new Date(start)));
const addDays = (key, n) => {
	const d = localDate(key);
	d.setDate(d.getDate() + n);
	return isoDate(d);
};

/* Candidate tasks for the preview: one per lecture, with every reading bullet's pages merged.
   dueMode "before" is the day before class (never in the past); "class" is the day of class.
   `edition` picks which edition's pages to use when notes list several. */
export function readingCandidates({ lectures, courses = {}, tasks = [], today, dueMode = "before", edition = "", estimate = () => null }) {
	const existing = new Set(tasks.map((t) => normalize(t.text)));
	const imported = new Set(tasks.filter((t) => t.lectureId).map((t) => t.lectureId));
	const items = [];
	const unclear = [];
	const editions = new Set();
	for (const lecture of lectures) {
		const readings = parseReadings(lecture.notes, { edition });
		const original = classDay(lecture.start);
		const moved = movedDate(lecture.notes);
		const day = moved || original;
		if (!readings.length) {
			const prep = prepReadingLines(lecture.notes);
			if (needsVerify(lecture.notes) || prep.length)
				unclear.push({ id: lecture.id, title: lecture.title, url: lecture.url, classDate: day, reason: needsVerify(lecture.notes) ? "Confirm the readings in Notion" : prep[0] });
			continue;
		}
		/* Only a reading that lists pages for more than one edition needs the student to say which they have. */
		readings.forEach((r) => r.editions.length > 1 && r.editions.forEach((e) => editions.add(e)));
		const ranges = parseRanges(readings.flatMap((r) => r.ranges.map(([a, b]) => `${a}-${b}`)).join(", "));
		const parts = [...new Set(readings.map((r) => r.source).filter(Boolean))];
		const course = courseLabel(courses[lecture.courseId] || "");
		const label = course || parts[0] || "reading";
		const text = `Read ${label} pp. ${formatRanges(ranges)}`;
		const before = addDays(day, -1);
		const dueKey = dueMode === "class" ? day : before < today ? today : before;
		const daysAway = Math.round((localDate(day) - localDate(today)) / 864e5);
		items.push({
			key: lecture.id,
			lectureId: lecture.id,
			url: lecture.url,
			lectureTitle: lecture.title,
			course,
			parts,
			text,
			pages: pageCount(ranges),
			edition: readings.find((r) => r.editions.length > 1)?.edition || "",
			classDate: day,
			moved: moved && moved !== original ? { from: original, to: moved } : null,
			dueKey,
			pri: daysAway <= 2 ? "must" : "should",
			minutes: estimate(text)?.minutes ?? null,
			exists: imported.has(lecture.id) || existing.has(normalize(text)) || tasks.some((t) => coversReading(t.text, ranges, [course, ...parts, lecture.title])),
		});
	}
	return { items, unclear, editions: [...editions].sort() };
}
