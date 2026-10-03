import { describe, expect, it } from "vitest";
import { pageBlocks, richText, validateReading } from "../src/routes/source-library";

const page = { printed: 166, confidence: 91.4, status: "Machine-read" as const, flags: [], paragraphs: ["In Giouroukos, the Ontario Court of Appeal decided ..."], imageUploadId: "3ee3b905-3560-81b6-87dc-00b29e1e18fb" };

describe("source library", () => {
	it("splits long text into Notion-sized rich text", () => {
		const parts = richText("x".repeat(4000));
		expect(parts).toHaveLength(3);
		expect(parts.every((p) => p.text.content.length <= 1900)).toBe(true);
	});
	it("builds a cited page with its text and the photo folded away", () => {
		const blocks = pageBlocks("Property Law: Cases and Commentary", page);
		expect(blocks[0].callout.rich_text[0].text.content).toBe("Property Law: Cases and Commentary, p. 166. ");
		expect(blocks[0].callout.rich_text[1].text.content).toMatch(/OCR confidence 91/);
		expect(blocks[1].paragraph.rich_text[0].text.content).toMatch(/Giouroukos/);
		expect(blocks[2].toggle.children[0].image.file_upload.id).toBe(page.imageUploadId);
	});
	it("shows flags above the text", () => {
		const blocks = pageBlocks("Book", { ...page, flags: ["page number out of sequence"] });
		expect(blocks[1].callout.rich_text[0].text.content).toMatch(/page number out of sequence/);
	});
	it("validates and clamps what the station sends", () => {
		expect(() => validateReading({ title: "x", book: "y", pages: [] })).toThrow();
		const r = validateReading({ title: "Property pp. 144-188", book: "Property Law", courseId: "not-an-id", captured: "bad", pages: [{ printed: "166", confidence: 140, paragraphs: ["a"], imageUploadId: "nope" }] });
		expect(r.courseId).toBeNull();
		expect(r.pages[0]).toMatchObject({ printed: 166, confidence: 100, status: "Machine-read", imageUploadId: undefined });
		expect(r.captured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
