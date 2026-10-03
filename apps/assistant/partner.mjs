/* Broadcast's voice. Pure: a moment and the week's numbers go in; a line, a
   next step and a review come out. Dry, law-flavoured, teasing rather than
   shaming. Lines use {gap}, {ahead}, {billable}, {target}, {streak}, {next}. */

export const LINES = {
	happy: [
		"Target met, counsel. The firm notices.",
		"{billable} hours. Bill it, frame it, keep going.",
		"Exceeds expectations. I may even smile on purpose.",
	],
	smug: [
		"{ahead} hours ahead. Do not let it go to your head. Let it go to your docket.",
		"Ahead of pace. The other associates are nervous.",
		"Comfortably ahead. Spend the lead on practice questions, not on rest.",
	],
	approve: [
		"Right on pace. Hold the line.",
		"Steady billing. That is how partners are made.",
		"On schedule, counsel. Keep the file moving.",
	],
	stern: [
		"{gap} hours behind pace. Close it before Sunday.",
		"The docket is light, counsel. One long session fixes it.",
		"We are {gap} hours short. I trust you can account for that.",
	],
	panic: [
		"{gap} hours behind. This is not a drill.",
		"The court will note your absence, counsel. Start now.",
		"Sound the alarm: {gap} hours to recover. One block at a time.",
	],
	monday: [
		"New billing week. Thirty-five hours do not bill themselves.",
		"Monday, counsel. Set the tone early.",
	],
	streakRisk: [
		"Your {streak}-day streak ends at midnight without two hours on the books.",
		"{streak} days running. Do not let today be the gap in the record.",
	],
	milestone: [
		"{streak} days straight. That is a pattern of conduct.",
		"A {streak}-day streak. Precedent, set.",
	],
};

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 100];

const hash = (text) => [...String(text)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function fill(line, vars) {
	return line.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? "").toString());
}

/* Which moment matters most right now. */
export function momentFor({ mood, day, hour, streak, todayActive, milestone }) {
	if (milestone) return "milestone";
	if (streak > 0 && !todayActive && hour >= 19 && day !== 0 && day !== 6) return "streakRisk";
	if (day === 1 && hour < 12 && mood !== "happy") return "monday";
	return mood;
}

/* Picks a line for the moment, varied by date and never repeating one already
   used today while an alternative exists. */
export function pickLine(moment, vars, { date = "", used = [] } = {}) {
	const pool = LINES[moment] || LINES.approve;
	const start = hash(date + moment) % pool.length;
	for (let i = 0; i < pool.length; i++) {
		const line = pool[(start + i) % pool.length];
		if (!used.includes(line)) return { id: line, text: fill(line, vars) };
	}
	const line = pool[start];
	return { id: line, text: fill(line, vars) };
}

/* The single next step under his line. */
export function nextStep({ task, moment, hasOpenTasks }) {
	if (moment === "monday" || (!task && hasOpenTasks)) return { kind: "plan", label: "Plan my day" };
	if (task) return { kind: "focus", id: task.id, label: `Focus on ${task.text.length > 34 ? task.text.slice(0, 33) + "…" : task.text}` };
	return { kind: "log", label: "Log time" };
}

/* Newly reached streak milestone, if any, that has not been celebrated. */
export function milestoneReached(streak, celebrated = 0) {
	const hit = [...STREAK_MILESTONES].reverse().find((m) => streak >= m);
	return hit && hit > celebrated ? hit : 0;
}

/* Last week's performance review. */
export function weeklyReview(summary, { streak = 0 } = {}) {
	const ratio = summary.target ? summary.billable / summary.target : 0;
	const verdict = ratio >= 1 ? "Exceeds expectations" : ratio >= 0.8 ? "Meets expectations" : ratio >= 0.5 ? "Needs improvement" : "We need to talk";
	const tone = ratio >= 1 ? "happy" : ratio >= 0.8 ? "approve" : ratio >= 0.5 ? "stern" : "panic";
	const kinds = ["reading", "study", "writing"];
	const top = kinds.slice().sort((a, b) => summary.byKind[b] - summary.byKind[a])[0];
	const low = kinds.slice().sort((a, b) => summary.byKind[a] - summary.byKind[b])[0];
	const notes = [];
	if (summary.byKind[top] > 0) notes.push(`Most of your independent time went to ${top}.`);
	if (summary.billable > 0 && summary.byKind[low] === 0) notes.push(`No ${low} at all. Put some on the calendar this week.`);
	if (streak >= 3) notes.push(`You carried a ${streak}-day streak into this week.`);
	return { verdict, tone, pct: Math.round(ratio * 100), notes };
}
