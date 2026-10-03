import test from "node:test";
import assert from "node:assert/strict";
import { parseRanges, formatRanges, parseReadings, needsVerify, prepReadingLines, movedDate, courseLabel, readingCandidates } from "./readings-import.mjs";

/* Synthetic notes in the shapes the real lecture pages use. */

test("ranges merge, sort and format", () => {
	assert.deepEqual(parseRanges("5-8, 7-12, 20"), [[5, 12], [20, 20]]);
	assert.equal(formatRanges([[78, 98], [105, 105]]), "78–98, 105");
	assert.deepEqual(parseRanges("9-3"), []);
});

test("a plain READINGS bullet gives the source and pages", () => {
	const [r] = parseReadings("READINGS\n• Sample Casebook: Cases and Commentary, pp. 1–15");
	assert.equal(r.source, "Sample Casebook: Cases and Commentary");
	assert.deepEqual(r.ranges, [[1, 15]]);
	assert.equal(r.pages, 15);
});

test("an edition before the pages is dropped from the source", () => {
	const readings = parseReadings("READINGS\n• Smith, Sample Text, 6th ed., pp. 1–15\n• Appleby v Example");
	assert.equal(readings.length, 1);
	assert.equal(readings[0].source, "Smith, Sample Text");
});

test("several ranges in one bullet are kept together, including a trailing and", () => {
	const [r] = parseReadings("READINGS\n• Author/Other/Third, pp. 16–18, 23–26, and 30–33");
	assert.deepEqual(r.ranges, [[16, 18], [23, 26], [30, 33]]);
	assert.equal(r.pages, 3 + 4 + 4);
});

test("cases and other sections are not treated as readings", () => {
	const notes = "READINGS\n• CW, pp. 11–24\n\nCASES\n• Reference re Example, [1985] 1 SCR 721\n\nPREPARE\n• Read pages 3–9 of the syllabus";
	const readings = parseReadings(notes);
	assert.equal(readings.length, 1);
	assert.deepEqual(readings[0].ranges, [[11, 24]]);
});

const twoEditions = "READINGS\n• Acceptance (11th ed, pp 76–78; 12th ed, pp 71–73)";

test("with two editions the first is used and both are reported", () => {
	const [r] = parseReadings(twoEditions);
	assert.deepEqual(r.ranges, [[76, 78]]);
	assert.equal(r.edition, "11th");
	assert.deepEqual(r.editions, ["11th", "12th"]);
	assert.equal(r.source, "Acceptance");
});

test("the preferred edition wins when it is offered", () => {
	assert.deepEqual(parseReadings(twoEditions, { edition: "12th" })[0].ranges, [[71, 73]]);
	assert.deepEqual(parseReadings(twoEditions, { edition: "99th" })[0].ranges, [[76, 78]]);
});

test("edition numbers are never mistaken for pages", () => {
	const [r] = parseReadings("READINGS\n• Revocation (11th ed, pp 133–135 and 138–139; 12th ed, pp 119–122 and 123–125)");
	assert.deepEqual(r.ranges, [[133, 135], [138, 139]]);
	assert.deepEqual(parseReadings("READINGS\n• Revocation (11th ed, pp 133–135 and 138–139; 12th ed, pp 119–122 and 123–125)", { edition: "12th" })[0].ranges, [[119, 125]]);
});

test("notes that are only pages, or a page marker, still parse", () => {
	assert.deepEqual(parseReadings("17-18 & 26-27")[0].ranges, [[17, 18], [26, 27]]);
	assert.deepEqual(parseReadings("pg. 57-78")[0].ranges, [[57, 78]]);
	assert.deepEqual(parseReadings("Read pages 44-51.")[0].ranges, [[44, 51]]);
	assert.deepEqual(parseReadings("pp 18-30 & 33-44")[0].ranges, [[18, 30], [33, 44]]);
});

test("notes with no pages give nothing", () => {
	assert.deepEqual(parseReadings("READINGS\n• No substantive reading assigned"), []);
	assert.deepEqual(parseReadings("READINGS\nPartly just give it a gist"), []);
	assert.deepEqual(parseReadings(""), []);
	assert.deepEqual(parseReadings("PREPARE\n• Read the syllabus"), []);
});

test("verify-before-class and prep-only reading are detected", () => {
	assert.equal(needsVerify("VERIFY BEFORE CLASS\n• Confirm the page range"), true);
	assert.equal(needsVerify("READINGS\n• pp. 1–5"), false);
	assert.deepEqual(prepReadingLines("PLENARY\n• A topic\n\nPREPARE\n• Smith et al., Chapter 11, with a skim of Section F\n• Bring your code"), ["Smith et al., Chapter 11, with a skim of Section F"]);
	assert.deepEqual(prepReadingLines("READINGS\n• pp. 1–5"), []);
});

test("a moved class is read from the schedule note", () => {
	assert.equal(movedDate("SCHEDULE\n• The updated reading schedule moves this class to Tuesday, 13 October 2026"), "2026-10-13");
	assert.equal(movedDate("SCHEDULE\n• It moves this review to Friday, 16 October 2026"), "2026-10-16");
	assert.equal(movedDate("READINGS\n• pp. 1–5"), null);
	assert.equal(movedDate("moves this class to Someday, 13 Octember 2026"), null);
});

test("course codes are trimmed from the name", () => {
	assert.equal(courseLabel("LAW 160 Criminal Law"), "Criminal Law");
	assert.equal(courseLabel("Criminal Law"), "Criminal Law");
	assert.equal(courseLabel("LAW-195: Torts (Section A)"), "Torts");
	assert.equal(courseLabel(""), "");
});

const lecture = (over = {}) => ({ id: "L1", url: "https://notion.so/L1", title: "W4A: Sample Lecture", start: "2026-10-05T18:30:00.000Z", notes: "READINGS\n• Sample Text, pp. 78–98", courseId: "C1", ...over });
const base = { courses: { C1: "LAW 160 Criminal Law" }, tasks: [], today: "2026-10-03" };

test("a lecture becomes one reading task named for its course", () => {
	const { items } = readingCandidates({ ...base, lectures: [lecture()] });
	assert.equal(items.length, 1);
	assert.equal(items[0].text, "Read Criminal Law pp. 78–98");
	assert.equal(items[0].classDate, "2026-10-05");
	assert.equal(items[0].pages, 21);
	assert.equal(items[0].exists, false);
});

test("due is the day before class, never in the past, or the class day", () => {
	assert.equal(readingCandidates({ ...base, lectures: [lecture()] }).items[0].dueKey, "2026-10-04");
	assert.equal(readingCandidates({ ...base, lectures: [lecture({ start: "2026-10-03T14:00:00.000Z" })] }).items[0].dueKey, "2026-10-03");
	assert.equal(readingCandidates({ ...base, dueMode: "class", lectures: [lecture()] }).items[0].dueKey, "2026-10-05");
});

test("a date-only start is used as it is", () => {
	assert.equal(readingCandidates({ ...base, lectures: [lecture({ start: "2026-10-09" })] }).items[0].classDate, "2026-10-09");
});

test("a moved class uses the new date and says so", () => {
	const notes = "READINGS\n• Sample Text, pp. 1–10\n\nSCHEDULE\n• The updated reading schedule moves this class to Tuesday, 13 October 2026";
	const [item] = readingCandidates({ ...base, lectures: [lecture({ start: "2026-10-09", notes })] }).items;
	assert.equal(item.classDate, "2026-10-13");
	assert.equal(item.dueKey, "2026-10-12");
	assert.deepEqual(item.moved, { from: "2026-10-09", to: "2026-10-13" });
});

test("priority is Must for the next two days, Should after that", () => {
	assert.equal(readingCandidates({ ...base, lectures: [lecture({ start: "2026-10-05" })] }).items[0].pri, "must");
	assert.equal(readingCandidates({ ...base, lectures: [lecture({ start: "2026-10-09" })] }).items[0].pri, "should");
});

test("several reading bullets in one lecture become one task with merged pages", () => {
	const notes = "READINGS\n• First Section (11th ed, pp 161–169; 12th ed, pp 143–151)\n• Notes and Questions 2\n• Second Section (11th ed, pp 175–180; 12th ed, pp 156–160)\n• Third Section (11th ed, pp 180–187; 12th ed, pp 160–166)";
	const { items, editions } = readingCandidates({ ...base, lectures: [lecture({ notes })] });
	assert.equal(items.length, 1);
	assert.equal(items[0].text, "Read Criminal Law pp. 161–169, 175–187");
	assert.deepEqual(items[0].parts, ["First Section", "Second Section", "Third Section"]);
	assert.equal(items[0].edition, "11th");
	assert.deepEqual(editions, ["11th", "12th"]);
	const twelfth = readingCandidates({ ...base, edition: "12th", lectures: [lecture({ notes })] }).items[0];
	assert.equal(twelfth.text, "Read Criminal Law pp. 143–151, 156–166");
});

test("without a course name the source stands in", () => {
	assert.equal(readingCandidates({ ...base, courses: {}, lectures: [lecture()] }).items[0].text, "Read Sample Text pp. 78–98");
	assert.equal(readingCandidates({ ...base, courses: {}, lectures: [lecture({ notes: "pg. 5-9" })] }).items[0].text, "Read reading pp. 5–9");
});

test("a task you already added by hand is recognised, dash style aside", () => {
	const tasks = [{ id: "t1", text: "Read Criminal Law pp. 78-98" }];
	assert.equal(readingCandidates({ ...base, tasks, lectures: [lecture()] }).items[0].exists, true);
});

test("a lecture already imported is recognised even if the task was renamed", () => {
	const tasks = [{ id: "t1", text: "Something renamed", lectureId: "L1" }];
	assert.equal(readingCandidates({ ...base, tasks, lectures: [lecture()] }).items[0].exists, true);
});

test("lectures needing a check, or with chapter-only prep, are listed but create nothing", () => {
	const lectures = [
		lecture({ id: "L2", title: "W5A: Lecture", notes: "VERIFY BEFORE CLASS\n• Confirm the page range" }),
		lecture({ id: "L3", title: "W5: Writing", notes: "PLENARY\n• A topic\n\nPREPARE\n• Smith, Chapter 11, with a skim of Section F" }),
		lecture({ id: "L4", title: "W5A: No Class", notes: "NO CLASS\n• Holiday" }),
	];
	const { items, unclear } = readingCandidates({ ...base, lectures });
	assert.equal(items.length, 0);
	assert.deepEqual(unclear.map((u) => u.title), ["W5A: Lecture", "W5: Writing"]);
	assert.match(unclear[1].reason, /Chapter 11/);
});

test("the estimate is passed through when provided", () => {
	const { items } = readingCandidates({ ...base, lectures: [lecture()], estimate: (text) => (/pp\./.test(text) ? { minutes: 126 } : null) });
	assert.equal(items[0].minutes, 126);
});

test("a hand-made task with the same pages and a word in common counts as already added", () => {
	const noCourse = { ...base, courses: {} };
	const sameClass = lecture({ title: "W4A: The Role of Case Law in Criminal Law", notes: "READINGS\n• Smith/Jones/Lee, pp. 78–98" });
	assert.equal(readingCandidates({ ...noCourse, tasks: [{ id: "t", text: "Read Criminal Law pp. 78-98" }], lectures: [sameClass] }).items[0].exists, true);
	const comma = lecture({ title: "W5A: Possession of Land", notes: "READINGS\n• Property: Cases and Commentary, pp. 144–188" });
	assert.equal(readingCandidates({ ...noCourse, tasks: [{ id: "t", text: "Read Property: Cases and Commentary, pp. 144–188" }], lectures: [comma] }).items[0].exists, true);
});

test("different pages, or no word in common, are not mistaken for the same reading", () => {
	const noCourse = { ...base, courses: {} };
	const l = lecture({ title: "W4A: Criminal Law", notes: "READINGS\n• Smith, pp. 78–98" });
	assert.equal(readingCandidates({ ...noCourse, tasks: [{ id: "t", text: "Read Criminal Law pp. 78-97" }], lectures: [l] }).items[0].exists, false);
	assert.equal(readingCandidates({ ...noCourse, tasks: [{ id: "t", text: "Read Criminal Law pp. 178-98" }], lectures: [l] }).items[0].exists, false);
	assert.equal(readingCandidates({ ...noCourse, tasks: [{ id: "t", text: "Read Torts pp. 78-98" }], lectures: [l] }).items[0].exists, false);
});
