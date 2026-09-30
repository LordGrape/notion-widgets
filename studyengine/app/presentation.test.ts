import { describe, expect, it } from "vitest";
import { checklistHtml } from "./presentation";

describe("readable, untrusted checklist presentation", () => {
	it("turns numbered points into a list and repeated citation URLs into compact accessible references", () => {
		const raw =
			"Draft checklist, not an official rubric.\n1. The mission landed in 1969 (landing timeline).\n[^https://www.nasa.gov/mission/apollo-11/]\n2. Check the exact timeline. [^https://www.nasa.gov/mission/apollo-11/]";
		const rendered = checklistHtml(raw);
		expect(rendered).toContain(
			"<p>Draft checklist, not an official rubric.</p>",
		);
		expect(rendered).toContain('<ol class="checklist-points">');
		expect(rendered.match(/<li>/g)).toHaveLength(2);
		expect(rendered.match(/Open source reference 1/g)).toHaveLength(2);
		expect(rendered).not.toContain("[^https");
		expect(rendered).toContain("landing timeline");
		expect(raw).toContain("[^https");
	});
	it("escapes markup and never turns unsafe or insecure references into links", () => {
		const html = checklistHtml(
			"1. <img src=x onerror=alert(1)> [bad](javascript:alert(1)) [^http://example.com] [^https://example.com/?q=<script>]",
		);
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<script>");
		expect(html).not.toContain('href="http:');
		expect(html).not.toContain('href="javascript:');
		expect(html).toContain("&lt;img");
	});
	it("keeps source labels, pinpoints, multiline text and non-list passages intact", () => {
		const html = checklistHtml(
			"A short qualification.\n\n- Expected point (section 2). [Public source](https://example.com/source)\n  Its necessary exception.\n- Another point.",
		);
		expect(html).toContain("A short qualification.");
		expect(html).toContain("section 2");
		expect(html).toContain("Its necessary exception.");
		expect(html).toContain(">Public source</a>");
		expect(html.match(/<li>/g)).toHaveLength(2);
	});
});
