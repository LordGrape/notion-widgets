/* Broadcast's voice: a Big Law partner. Terse, demanding, billing-obsessed,
   pressure on the work and never on the person. Pure: a moment and the week's
   numbers go in; a line, a next step and a review come out. Lines use {gap},
   {ahead}, {billable}, {target}, {streak}, {left}. */

export const LINES = {
	happy: [
		"Thirty-five billed. That's the standard, not the ceiling.",
		"Target met. Now do it again next week. That's how you make partner.",
		"{billable} hours. The client is happy. I'm satisfied. Don't get used to hearing it.",
		"Good week. I won't say it twice.",
		"You hit the number. Keep this up and your review writes itself.",
		"Target cleared. Every hour from here is a statement.",
		"That's a partner's week. Bank it and keep moving.",
		"Numbers like these get noticed upstairs.",
	],
	smug: [
		"{ahead} hours ahead. The other associates are taking notes.",
		"Ahead of pace. Spend the lead on practice questions, not on your couch.",
		"You're outbilling the floor. Keep your foot down.",
		"{ahead} hours of cushion. Cushions are for people who plan to stop.",
		"Ahead. I noticed. So did the client.",
		"This is what partner track looks like. Don't get comfortable.",
		"A lead is a loan. Pay it forward with another block.",
		"Ahead of schedule. Now make it look easy.",
	],
	approve: [
		"On pace. That's the minimum. Beat it.",
		"Steady numbers. Steady is how careers are built.",
		"Right where you should be. Now surprise me.",
		"The docket is clean. Keep the file moving.",
		"On schedule. I want ahead of schedule.",
		"Good. Next block. No victory laps.",
		"Consistent. Clients pay for consistent.",
		"Holding the line. Now push it.",
	],
	stern: [
		"{gap} hours behind. I don't want explanations. I want hours.",
		"The docket is light. Fix it before Friday.",
		"We're {gap} short. The client doesn't pay for intentions.",
		"Behind pace. Close the door, phone face down, and bill.",
		"{gap} hours. That's one long session and zero excuses.",
		"I've seen your calendar. I've seen your docket. One of them is lying.",
		"You're behind. The week isn't over. Act like it.",
		"Every hour you don't bill, someone else does.",
	],
	panic: [
		"{gap} hours behind. This is not a drill.",
		"My office. Now. We have a {gap}-hour problem.",
		"The deadline doesn't move. You do. Start now.",
		"{gap} hours to recover. One block at a time, starting this minute.",
		"Every associate has one bad week. This is yours. End it today.",
		"We're bleeding hours. Stop the bleeding.",
		"I need a plan and I need it billed. Go.",
	],
	monday: [
		"New week. Thirty-five hours don't bill themselves.",
		"Monday. Set the tone or the week sets it for you.",
		"Fresh docket. I want the first entry before lunch.",
		"Clean slate. Last week is closed. This one is billable.",
		"New week, same standard. Let's go.",
	],
	morning: [
		"Morning. The first block before ten sets the whole day.",
		"Coffee's done. So is your excuse. First entry, now.",
		"Early hours are the cheapest hours. Bill them.",
		"Get one block in before the day gets ideas.",
	],
	empty: [
		"Zero hours on the docket. I'm going to assume that's a typo.",
		"Nothing billed yet. The clock is already running.",
		"An empty docket is a choice. Make a different one.",
		"Blank page. Put a number on it.",
	],
	late: [
		"It's late. Billing at one in the morning is how mistakes get filed. Sleep.",
		"Go home. Tired hours are bad hours.",
		"Even I log off. Sleep, and be sharp tomorrow.",
		"Burnout isn't billable. Close the file for tonight.",
	],
	streakRisk: [
		"Your {streak}-day streak dies at midnight without two hours on the books.",
		"{streak} days running. Don't let today be the gap in the record.",
		"Two hours tonight keeps {streak} days alive. Your call.",
		"I don't break streaks. Neither do you. Two hours.",
	],
	comeback: [
		"Back on the docket. That's the move that matters: coming back.",
		"Welcome back. One missed day is noise. Two is a pattern. You broke it.",
		"You returned. Partners remember who shows up after a bad day.",
		"Day one again, and you showed up for it. Keep going.",
	],
	ceiling: [
		"{billable} hours. That's past your ceiling. Rest is part of the job.",
		"Enough for this week. Tired associates make expensive mistakes.",
		"You've cleared the ceiling. Bank it and recover.",
		"Over the line. Close the laptop and come back sharp.",
	],
	plan: [
		"Your plan: {plan}. You wrote it. Now bill it.",
		"{plan}. That's the commitment. Hold to it.",
		"Remember what you decided last night: {plan}.",
		"The plan is set: {plan}. No renegotiating.",
	],
	milestone: [
		"{streak} days straight. That's a pattern of conduct.",
		"A {streak}-day streak. That's precedent.",
		"{streak} days. Partners notice consistency. I'm noticing.",
		"{streak} days without a gap. That's the associate I hired.",
	],
	almost: [
		"{left} hours to target. Finish it.",
		"{left} hours and the week is closed. Don't leave it open.",
		"So close I can taste it. {left} hours.",
		"The finish line is {left} hours away. Sprint.",
	],
	tomorrow: [
		"What's on your calendar at nine tomorrow? Book it now.",
		"Tomorrow's first hour decides the day. Put it on the calendar.",
		"Don't walk in tomorrow and decide. Decide now.",
		"Book tomorrow's first block before you leave tonight.",
	],
};

/* Steady intensity: the same partner, without the pressure, for weeks that
   need support more than a push. Only the high-pressure moments change. */
export const STEADY_LINES = {
	stern: [
		"{gap} hours behind. One focused block is a good start.",
		"A bit behind. Pick the smallest next step and take it.",
		"The week isn't over. One session at a time.",
		"Behind is just information. Plan the next hour.",
	],
	panic: [
		"{gap} hours behind. Let's make a realistic plan, not a heroic one.",
		"Rough week. Start with one block and see how it feels.",
		"Recovering hours starts with the next one. Keep it simple.",
		"No need to catch up all at once. One block.",
	],
	empty: [
		"Nothing billed yet. A short first session counts.",
		"Fresh docket. Start small.",
		"Begin with twenty-five minutes. That's enough to start.",
		"An empty docket is easy to fix. One block.",
	],
	streakRisk: [
		"Two hours tonight would keep your {streak}-day streak. Only if you have it in you.",
		"Your streak is still alive. A short session keeps it.",
		"{streak} days so far. Tonight is optional; tomorrow still counts.",
		"If tonight's not possible, your recess day may cover it.",
	],
};

/* Focus events: what he says when you start, pause, finish or take a break. */
export const EVENT_LINES = {
	start: [
		"The clock is running. Make it count.",
		"Billing. Door closed, phone down.",
		"Six-minute increments add up. Go.",
		"Good. I'll be watching the docket.",
		"On the clock. Show me what an hour looks like.",
	],
	pause: [
		"Meter's stopped.",
		"Take your minute. Just one.",
		"Paused. The work doesn't pause with you.",
		"Stretch, then back to the file.",
	],
	finish: [
		"Filed.",
		"Done. Next matter.",
		"That's billed.",
		"Closed. That's how it's done.",
	],
	break: [
		"Recess. Even partners step out. Five minutes, not fifty.",
		"Break. Water, not your phone.",
		"Step away. Come back sharper.",
	],
	flow: [
		"Fifteen more? That's the attitude.",
		"Staying on. Momentum is billable.",
		"Good. Ride it while it lasts.",
	],
};

export function pickEventLine(state, random = Math.random) {
	const pool = EVENT_LINES[state] || EVENT_LINES.start;
	return pool[Math.floor(random() * pool.length) % pool.length];
}

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 100];

const hash = (text) => [...String(text)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function fill(line, vars) {
	return line.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? "").toString());
}

/* Which moment matters most right now. */
export function momentFor({ mood, day, hour, streak, todayActive, milestone, pct = 0, tomorrowBooked = true, billable = null, comeback = false, overCeiling = false, plan = "" }) {
	if (milestone) return "milestone";
	if (hour >= 23 || hour < 4) return "late";
	if (overCeiling) return "ceiling";
	if (comeback) return "comeback";
	if (plan && hour < 14) return "plan";
	if (streak > 0 && !todayActive && hour >= 19 && day !== 0 && day !== 6) return "streakRisk";
	if (hour >= 18 && !tomorrowBooked) return "tomorrow";
	if (pct >= 80 && pct < 100) return "almost";
	if (day === 1 && hour < 12 && mood !== "happy") return "monday";
	if (billable === 0) return "empty";
	if (hour < 10 && day !== 0 && day !== 6) return "morning";
	return mood;
}

/* Picks a line for the moment, varied by date and never repeating one already
   used today while an alternative exists. */
export function pickLine(moment, vars, { date = "", used = [], intensity = "intense" } = {}) {
	const pool = (intensity === "steady" && STEADY_LINES[moment]) || LINES[moment] || LINES.approve;
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
	if (moment === "tomorrow") return { kind: "book", label: "Book tomorrow's first block" };
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
	const kinds = ["reading", "study", "practice", "writing"];
	const amount = (k) => summary.byKind[k] || 0;
	const top = kinds.slice().sort((a, b) => amount(b) - amount(a))[0];
	const low = kinds.slice().sort((a, b) => amount(a) - amount(b))[0];
	const notes = [];
	if (amount(top) > 0) notes.push(`Most of your independent time went to ${top}.`);
	if (summary.billable > 0 && amount(low) === 0) notes.push(`No ${low} at all. Put some on the calendar this week.`);
	if (streak >= 3) notes.push(`You carried a ${streak}-day streak into this week.`);
	return { verdict, tone, pct: Math.round(ratio * 100), notes };
}
