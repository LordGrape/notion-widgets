import { describe, expect, it } from "vitest";
import { CHUNK_BYTES, newItem, pageContent, readingRow } from "../src/routes/library-shelf";

const rich = (text: string) => [{ plain_text: text }];

describe("library shelf", () => {
	it("reads a Readings row", () => {
		const row = readingRow({
			id: "r1",
			url: "https://www.notion.so/r1",
			properties: {
				Reading: { title: rich("Property Law, pp. 144–189") },
				Book: { rich_text: rich("Property Law: Cases and Commentary") },
				Course: { relation: [{ id: "c1" }] },
				Lectures: { relation: [{ id: "l1" }, { id: "l2" }] },
				"First page": { number: 144 },
				"Last page": { number: 189 },
				Captured: { date: { start: "2026-10-03" } },
			},
		});
		expect(row).toMatchObject({ title: "Property Law, pp. 144–189", courseId: "c1", lectureCount: 2, first: 144, last: 189, status: "Machine-read", captured: "2026-10-03" });
	});

	it("takes text, flags and the photo out of a page body", () => {
		const out = pageContent([
			{ type: "callout", callout: { rich_text: rich("Property Law, p. 166. Machine-read text.") } },
			{ type: "callout", callout: { rich_text: rich("Check against the photo: unsure of “possessio”; page number inferred from its neighbours.") } },
			{ type: "paragraph", paragraph: { rich_text: rich("[1] Can private landowners gain title over parkland?") } },
			{ type: "paragraph", paragraph: { rich_text: rich("  ") } },
			{ type: "toggle", id: "t1", has_children: true, toggle: { rich_text: rich("Photo of p. 166") } },
		]);
		expect(out.paragraphs).toEqual(["[1] Can private landowners gain title over parkland?"]);
		expect(out.flags).toEqual(["unsure of “possessio”", "page number inferred from its neighbours"]);
		expect(out.toggles).toEqual(["t1"]);
		expect(out.photo).toBeNull();
	});

	it("opens an upload with chunk counts and refuses empty or huge files", () => {
		const item = newItem({ name: "Property pp. 144-188", files: [{ name: "scan.pdf", type: "application/pdf", size: CHUNK_BYTES * 2 + 1 }] });
		expect(item).toMatchObject({ name: "Property pp. 144-188", status: "uploading" });
		expect(item.files[0].chunks).toBe(3);
		expect(() => newItem({ files: [] })).toThrow();
		expect(() => newItem({ files: [{ name: "x.pdf", size: 500 * 1024 * 1024 }] })).toThrow();
		expect(newItem({ files: [{ name: "a/b:c.pdf", size: 10 }] }).name).toBe("a b c");
	});
});
