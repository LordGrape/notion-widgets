import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync, execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(
	await readFile(resolve(root, "studyengine/build-policy.json"), "utf8"),
);
const digest = (data) => createHash("sha256").update(data).digest("hex");
for (const [path, expected] of Object.entries(policy.protectedData)) {
	if (digest(await readFile(resolve(root, path))) !== expected)
		throw new Error(`Protected public data changed: ${path}`);
}
const build = spawnSync(
	process.execPath,
	[resolve(root, "studyengine/node_modules/vite/bin/vite.js"), "build"],
	{
		cwd: resolve(root, "studyengine"),
		stdio: "inherit",
	},
);
if (build.status !== 0) process.exit(build.status || 1);
const inputs = [
	"studyengine/app/index.html",
	"studyengine/app/styles.css",
	"studyengine/app/app.ts",
	"studyengine/app/presentation.ts",
	"studyengine/app/domain.ts",
	"studyengine/app/repository.ts",
	"studyengine/app/types.ts",
	"packages/study-evidence/protocol.ts",
	"studyengine/package-lock.json",
	"studyengine/vite.config.ts",
];
const source = createHash("sha256");
for (const path of inputs)
	source
		.update(path)
		.update("\0")
		.update(await readFile(resolve(root, path)));
const sourceDigest = source.digest("hex");
const compiled = (
	await readFile(resolve(root, "studyengine/build/index.html"), "utf8")
)
	.replaceAll("./__SHARED_ICONS__.js", "../widget-icons.js?v=20261001-duotone-b")
	.replaceAll("./__SHARED_CORE__.js", "../core.js")
	.replace(
		"</head>",
		`<meta name="study-engine-source-digest" content="${sourceDigest}" />\n</head>`,
	);
if (
	!compiled.includes("evidence-first-v2") ||
	compiled.includes("__SHARED_CORE__")
)
	throw new Error("Build is missing its stable runtime contract.");

if (process.argv.includes("--prune-obsolete")) {
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
	const obsolete = tracked.filter(
		(path) =>
			!retained.has(path) &&
			(policy.obsoleteFiles.includes(path) ||
				policy.obsoleteRoots.some((prefix) => path.startsWith(prefix))),
	);
	for (const path of obsolete) await rm(resolve(root, path), { force: true });
	console.log(
		`Retired ${obsolete.length} obsolete frontend files; protected shared data retained.`,
	);
}
for (const path of policy.entryPoints) {
	const target = resolve(root, path);
	if (process.argv.includes("--check")) {
		if ((await readFile(target, "utf8")) !== compiled)
			throw new Error(`Generated entry is stale: ${path}`);
	} else {
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, compiled);
	}
}
console.log(
	`${process.argv.includes("--check") ? "Verified" : "Built"} ${policy.entryPoints.length} stable entries · source ${sourceDigest.slice(0, 12)}`,
);
