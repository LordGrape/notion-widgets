import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(
	await readFile(resolve(root, "studyengine/build-policy.json"), "utf8"),
);
const html = await readFile(resolve(root, policy.entryPoints[0]), "utf8");
const assertions = [
	[html.includes("evidence-first-v2"), "release marker"],
	[html.includes("study-engine-source-digest"), "source digest"],
	[html.includes('src="../core.js"'), "unchanged shared runtime"],
	[!html.includes("__SHARED_CORE__"), "resolved runtime path"],
	[
		!html.includes("practice-apollo") && !html.includes("Public history"),
		"test data excluded from production",
	],
	[
		!html.includes("/studyengine/grade") &&
			!html.includes("/studyengine/tutor"),
		"no paid AI runtime",
	],
	[
		!html.includes("recentAccuracy") && !html.includes("lastRating"),
		"legacy score model removed",
	],
	[
		html.includes("prefers-reduced-motion") &&
			html.includes("prefers-color-scheme"),
		"accessible theme and motion",
	],
];
for (const id of [
	"gate",
	"appShell",
	"todayView",
	"evidenceView",
	"libraryView",
	"practiceView",
	"dataGuard",
]) {
	assertions.push([html.includes(`id="${id}"`), `required view ${id}`]);
}
for (const path of policy.entryPoints)
	assertions.push([
		(await readFile(resolve(root, path), "utf8")) === html,
		`consistent entry ${path}`,
	]);
for (const [path, expected] of Object.entries(policy.protectedData)) {
	assertions.push([
		createHash("sha256")
			.update(await readFile(resolve(root, path)))
			.digest("hex") === expected,
		`protected public data ${path}`,
	]);
}
const retained = new Set([
	...Object.keys(policy.protectedData),
	...policy.currentDocumentation,
]);
const tracked = execFileSync("git", ["ls-files", "-z", "--", "studyengine"], {
	cwd: root,
})
	.toString()
	.split("\0")
	.filter(Boolean);
for (const path of tracked.filter(
	(path) =>
		!retained.has(path) &&
		(policy.obsoleteFiles.includes(path) ||
			policy.obsoleteRoots.some((prefix) => path.startsWith(prefix))),
)) {
	try {
		await readFile(resolve(root, path));
		assertions.push([false, `obsolete file remains: ${path}`]);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
}
for (const path of [
	"studyengine/app/app.ts",
	"studyengine/app/domain.ts",
	"studyengine/app/repository.ts",
	"packages/study-evidence/protocol.ts",
]) {
	const text = await readFile(resolve(root, path), "utf8");
	assertions.push([
		!/(?:\bas\s+any\b|:\s*any\b|<any>)/.test(text),
		`strict types in ${path}`,
	]);
}
const failures = assertions.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length)
	throw new Error(`Study Engine verification failed:\n${failures.join("\n")}`);
console.log(`Study Engine verification passed (${assertions.length} checks).`);
