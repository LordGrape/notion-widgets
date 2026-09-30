import { safeUrl } from "./domain";

export function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] ?? c,
	);
}

/** Present imported text without treating it as HTML or changing the saved source. */
export function checklistHtml(value: string): string {
	const references = new Map<string, number>();
	const inline = (text: string): string => {
		const pattern =
			/\[\^(https?:\/\/[^\s\]]+)\]|\[([^\]\r\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
		let result = "",
			cursor = 0;
		for (const match of text.matchAll(pattern)) {
			const url = match[1] ?? match[3] ?? "";
			result += escapeHtml(text.slice(cursor, match.index));
			if (safeUrl(url)) {
				if (!references.has(url)) references.set(url, references.size + 1);
				const label = match[1]
					? `[${references.get(url)}]`
					: (match[2] ?? "Source");
				result += `<a class="citation-ref" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(match[1] ? `Open source reference ${references.get(url)}` : label)}">${escapeHtml(label)}</a>`;
			} else result += escapeHtml(match[0]);
			cursor = match.index + match[0].length;
		}
		return result + escapeHtml(text.slice(cursor));
	};
	const blocks: { list: boolean; text: string }[] = [];
	for (const line of value.replace(/\r\n?/g, "\n").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			blocks.push({ list: false, text: "" });
			continue;
		}
		const point = /^(?:\d+[.)]|[-*•])\s+(.+)$/.exec(trimmed);
		if (point) blocks.push({ list: true, text: point[1]! });
		else if (blocks.at(-1)?.list)
			blocks[blocks.length - 1]!.text += `\n${trimmed}`;
		else blocks.push({ list: false, text: trimmed });
	}
	let result = "",
		inList = false;
	for (const block of blocks) {
		if (!block.text) continue;
		if (block.list && !inList) {
			result += '<ol class="checklist-points">';
			inList = true;
		}
		if (!block.list && inList) {
			result += "</ol>";
			inList = false;
		}
		result += block.list
			? `<li>${inline(block.text)}</li>`
			: `<p>${inline(block.text)}</p>`;
	}
	return result + (inList ? "</ol>" : "");
}
