import test from "node:test";
import assert from "node:assert/strict";
import {
	esc, courseCode, courseSubject, examBankUrl, courseColour, statusMeta, readingStatusMeta, stationState, relativeTime,
	sortReadings, filterReadings, formatBytes, filesSummary, nameFromFiles, withCourseName, chunkCount, isAcceptedFile,
	joinParagraphs, paragraphOffsets, normaliseRange, makeHighlight, renderParagraphsHtml, findMatches, groupHighlights,
	briefMarkdown, slug, CATEGORIES,
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
