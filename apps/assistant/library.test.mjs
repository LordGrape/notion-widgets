import test from "node:test";
import assert from "node:assert/strict";
import {
	esc, courseCode, courseSubject, examBankUrl, courseColour, statusMeta, readingStatusMeta, stationState, relativeTime,
	sortReadings, filterReadings, formatBytes, filesSummary, nameFromFiles, withCourseName, chunkCount, isAcceptedFile,
	joinParagraphs, paragraphOffsets, normaliseRange, makeHighlight, renderParagraphsHtml, findMatches, groupHighlights,
	briefMarkdown, slug, CATEGORIES, shelfModel, lectureParts, bookShortName, inboxSummary, inboxIsBusy,
} from "./library.mjs";

test("escape", () => {
	assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
	assert.equal(esc(null), "");
});

test("course code and ExamBank url", () => {
	assert.equal(courseCode("LAW 183: Property Law"), "LAW183");
	assert.equal(courseCode("LAW 183"), "LAW183");
	assert.equal(courseCode("Property"), "");
	assert.equal(courseSubject("LAW 183: Property Law"), "Property Law");
	assert.match(examBankUrl("LAW 183: Property Law"), /startsWith=LAW183$/);
	assert.match(examBankUrl("LAW 183"), /scope=cab1b9d2-6777-45cd-b56d-78c608468888&startsWith=LAW183/);
	assert.equal(examBankUrl("Property"), "");
});

test("course colour matching and validation", () => {
	const cs = [{ name: "LAW 183", colour: "#7c3aed" }, { name: "LAW 195: Torts", colour: "javascript:x" }];
	assert.equal(courseColour(cs, "LAW 183: Property Law"), "#7c3aed");
	assert.equal(courseColour(cs, "LAW 195: Torts"), "var(--accent)");
	assert.equal(courseColour(cs, "LAW 999"), "var(--accent)");
});

test("status labels and tones", () => {
	assert.deepEqual(statusMeta("uploading", 41.6), { label: "Uploading 42%", tone: "accent", busy: false });
	assert.equal(statusMeta("queued").label, "Queued");
	assert.equal(statusMeta("reading").busy, true);
	assert.equal(statusMeta("filed").tone, "good");
	assert.equal(statusMeta("attention").label, "Needs attention");
	assert.equal(statusMeta("failed").tone, "bad");
	assert.equal(readingStatusMeta("Checked").tone, "good");
	assert.equal(readingStatusMeta("Machine-read").label, "Machine-read");
});

test("station online logic", () => {
	const now = Date.parse("2026-10-03T15:00:00Z");
	const at = (min) => new Date(now - min * 60000).toISOString();
	const on = stationState({ at: at(3), reading: null }, now);
	assert.equal(on.online, true);
	assert.equal(on.detail, "last seen 3 min ago");
	assert.equal(stationState({ at: at(20), reading: null }, now).online, true);
	assert.equal(stationState({ at: at(21), reading: null }, now).online, false);
	const busy = stationState({ at: at(90), reading: "Property pp. 1-9" }, now);
	assert.equal(busy.online, true);
	assert.match(busy.detail, /Property/);
	assert.match(stationState({ at: at(90) }, now).detail, /^Offline since /);
	assert.equal(stationState(null, now).online, false);
	assert.equal(relativeTime(at(0), now), "just now");
	assert.equal(relativeTime(at(125), now), "2 h ago");
});

test("sorting and filtering readings", () => {
	const map = { a: "LAW 195: Torts", b: "LAW 183: Property Law" };
	const rs = [
		{ id: 1, title: "Z", courseId: "a", first: 10 },
		{ id: 2, title: "B", courseId: "b", first: 144 },
		{ id: 3, title: "A", courseId: "b", first: 9 },
	];
	assert.deepEqual(sortReadings(rs, map).map((r) => r.id), [3, 2, 1]);
	assert.deepEqual(filterReadings(rs, { courseId: "b" }).map((r) => r.id), [2, 3]);
	assert.deepEqual(filterReadings(rs, { courseId: "all", query: "z" }).map((r) => r.id), [1]);
});

test("upload helpers", () => {
	assert.equal(formatBytes(1536), "2 KB");
	assert.equal(formatBytes(3 * 1048576), "3.0 MB");
	assert.equal(chunkCount(0), 1);
	assert.equal(chunkCount(20 * 1048576 + 1, 20 * 1048576), 2);
	assert.ok(isAcceptedFile({ name: "IMG_1.HEIC", type: "" }));
	assert.ok(isAcceptedFile({ name: "a.pdf", type: "application/pdf" }));
	assert.ok(!isAcceptedFile({ name: "a.docx", type: "" }));
	assert.equal(filesSummary([{ name: "a.pdf", size: 1048576 }]), "PDF · 1.0 MB");
	assert.equal(nameFromFiles([{ name: "Property_pp_144.pdf" }]), "Property pp 144");
	assert.equal(nameFromFiles([{ name: "Torts 01.jpg" }, { name: "Torts 02.jpg" }]), "Torts");
	assert.equal(withCourseName("Property pp. 1-9", "LAW 183: Property Law"), "LAW 183: Property Law Property pp. 1-9");
	assert.equal(withCourseName("LAW183 pp. 1-9", "LAW 183"), "LAW183 pp. 1-9");
	assert.equal(withCourseName("", "LAW 183"), "LAW 183 ");
});

test("highlight offsets and rendering", () => {
	const ps = ["[1] The owner may <b>exclude</b> others.", "[2] Second paragraph."];
	assert.equal(joinParagraphs(ps), ps.join("\n"));
	const offs = paragraphOffsets(ps);
	assert.equal(offs[1].start, ps[0].length + 1);
	const text = joinParagraphs(ps);
	assert.equal(normaliseRange(text, 3, 12).start, 4);
	assert.equal(normaliseRange(text, 5, 5), null);
	const start = text.indexOf("<b>exclude</b>");
	const h = makeHighlight({ id: "h1", page: 144, text, start, end: start + 14, category: "rule" });
	assert.equal(h.quote, "<b>exclude</b>");
	assert.equal(makeHighlight({ page: 1, text, start: 0, end: 5, category: "bogus" }), null);
	const html = renderParagraphsHtml(ps, [h]);
	assert.ok(!html.includes("<b>"));
	assert.match(html, /<mark class="lib-hl" data-hid="h1" data-cat="rule">&lt;b&gt;exclude&lt;\/b&gt;<\/mark>/);
	assert.match(html, /<span class="lib-pn">\[1\]<\/span>/);
	assert.equal(html.match(/<p /g).length, 2);
	// highlight spanning two paragraphs
	const span = renderParagraphsHtml(ps, [{ id: "x", category: "facts", start: text.indexOf("others"), end: text.indexOf("Second") + 6 }]);
	assert.equal(span.match(/<mark class="lib-hl"/g).length, 2);
	// search layer
	const f = renderParagraphsHtml(["abc abc"], [], [{ start: 4, end: 7, current: true }]);
	assert.match(f, /lib-find-current/);
	assert.equal(findMatches("Abc abc", "ABC").length, 2);
	assert.equal(findMatches("abc", "a").length, 0);
});

test("markdown export", () => {
	const hs = [
		{ id: "2", page: 150, quote: "Line one\nLine two", category: "rule", note: "The test", start: 0, end: 5 },
		{ id: "1", page: 144, quote: "A fact", category: "facts", note: "", start: 0, end: 5 },
	];
	assert.equal(groupHighlights(hs)[0].id, "facts");
	const md = briefMarkdown({ title: "Property pp. 144-189", book: "Property Law", highlights: hs });
	assert.match(md, /^# Brief: Property pp\. 144-189/);
	assert.ok(md.indexOf("## Facts") < md.indexOf("## Rule"));
	assert.match(md, /> A fact \(Property Law, p\. 144\)/);
	assert.match(md, /> Line one\n> Line two \(Property Law, p\. 150\)/);
	assert.match(md, /\*\*State the governing rule in your own words\.\*\* The test/);
	assert.equal(slug("Property pp. 144-189!"), "property-pp-144-189");
	assert.equal(CATEGORIES.length, 6);
});

/* ----- shelf model ----- */

const NOW = new Date(2026, 9, 3, 12, 0).getTime();
const notesOf = (...lines) => `READINGS\n${lines.map((l) => "• " + l).join("\n")}`;
const courses = { c1: "LAW 183: Property Law", c2: "LAW 195: Torts" };
const lectures = [
	{ id: "L2", courseId: "c1", title: "W5A: Possession", start: "2026-10-06T14:00:00.000Z", end: "2026-10-06T15:20:00.000Z", notes: notesOf("Property: Cases and Commentary, pp. 144–188", "Course Pack: Adverse Possession, pp. 3–19") },
	{ id: "L1", courseId: "c1", title: "W4A: Capture", start: "2026-09-28", end: "2026-09-28", notes: notesOf("Property: Cases and Commentary, pp. 120–143") },
	{ id: "L3", courseId: "c1", title: "W6A: Finders", start: "2026-10-13", end: "2026-10-13", notes: notesOf("Property: Cases and Commentary, pp. 189–231") },
	{ id: "T1", courseId: "c2", title: "Duty of care", start: "2026-10-03", end: "2026-10-03", notes: "no readings here" },
];
const rd = (id, courseId, first, last, lectureIds = []) => ({ id, courseId, title: id, first, last, lectureIds });

test("lecture titles split into week and title", () => {
	assert.deepEqual(lectureParts("W5A: Possession and Possessory Title to Land"), { week: "W5A", title: "Possession and Possessory Title to Land" });
	assert.deepEqual(lectureParts("Duty of care"), { week: "", title: "Duty of care" });
	assert.equal(bookShortName("Property: Cases and Commentary"), "Property");
});

test("shelf: courses, lectures in date order, other and unfiled", () => {
	const readings = [rd("byId", "c1", "", "", ["L1"]), rd("byPages", "c1", 150, 160), rd("other", "c1", 300, 310), rd("loose", "", 1, 5)];
	const model = shelfModel({ readings, lectures, courses, now: NOW });
	assert.deepEqual(model.map((s) => s.id), ["c1", "c2", "unfiled"]);
	assert.deepEqual(model[0].groups.map((g) => g.id), ["L1", "L2", "L3", "c1:other"]);
	assert.deepEqual(model[0].groups[3].items.map((i) => i.reading.id), ["other"]);
	assert.equal(model[2].unfiled, true);
	assert.deepEqual(model[2].groups[0].items.map((i) => i.reading.id), ["loose"]);
});

test("shelf: matching by lectureIds, by page overlap, and ghosts", () => {
	const readings = [rd("byId", "c1", "", "", ["L1"]), rd("byPages", "c1", 150, 160)];
	const [prop] = shelfModel({ readings, lectures, courses, now: NOW });
	const [L1, L2, L3] = prop.groups;
	/* L1 is matched by lectureIds (the reading has no page range); its notes entry stays a ghost */
	assert.deepEqual(L1.items.map((i) => i.kind + ":" + (i.reading ? i.reading.id : "")), ["ghost:", "reading:byId"]);
	/* L2: the overlapping reading covers pp. 144-188; the course pack is not scanned */
	assert.deepEqual(L2.items.map((i) => i.kind + ":" + (i.reading ? i.reading.id : i.book)), ["ghost:Course Pack", "reading:byPages"]);
	const ghost = L2.items[0];
	assert.equal(ghost.prefill, "LAW 183 Course Pack pp. 3-19");
	assert.equal(ghost.pagesLabel, "pp. 3–19");
	assert.equal(ghost.pageCount, 17);
	assert.equal(L3.items[0].prefill, "LAW 183 Property pp. 189-231");
	assert.equal(prop.scanned, 2);
	assert.equal(prop.total, 5);
});

test("shelf: past, next and upcoming lectures", () => {
	const [prop, torts] = shelfModel({ readings: [], lectures, courses, now: NOW });
	assert.deepEqual(prop.groups.map((g) => g.state), ["past", "next", "upcoming"]);
	/* a date-only lecture today has not finished, so it is the next one; no READINGS means no items */
	assert.equal(torts.groups[0].state, "next");
	assert.deepEqual(torts.groups[0].items, []);
	assert.equal(torts.total, 0);
});

test("shelf: a reading in another course never matches by pages; empty input is fine", () => {
	const model = shelfModel({ readings: [rd("x", "c2", 144, 150)], lectures: lectures.slice(0, 1), courses, now: NOW });
	const prop = model.find((s) => s.id === "c1");
	assert.deepEqual(prop.groups[0].items.map((i) => i.kind), ["ghost", "ghost"]);
	assert.deepEqual(shelfModel({}), []);
});

test("inbox summary and busy state", () => {
	const rows = [{ status: "reading" }, { status: "queued" }];
	assert.equal(inboxSummary(rows), "1 reading, 1 queued");
	assert.equal(inboxSummary([{ status: "attention" }, { status: "attention" }, { status: "failed" }]), "2 need attention, 1 failed");
	assert.equal(inboxSummary([{ status: "filed" }]), "1 filed");
	assert.equal(inboxSummary([]), "Nothing waiting");
	assert.equal(inboxIsBusy(rows), true);
	assert.equal(inboxIsBusy([{ status: "filed" }]), false);
});

test("dark theme highlights keep text above 4.5:1", () => {
	const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
	const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const page = hex("#1b1824");
	const ink = hex("#fbf9ff");
	for (const c of CATEGORIES) {
		const bg = hex(c.colour).map((v, i) => v * 0.4 + page[i] * 0.6);
		const ratio = (lum(ink) + 0.05) / (lum(bg) + 0.05);
		assert.ok(ratio >= 4.5, `${c.id} ${ratio.toFixed(2)}`);
	}
});
