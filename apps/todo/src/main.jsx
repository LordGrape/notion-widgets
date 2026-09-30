import React, { useState, useLayoutEffect, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createPortal, flushSync } from "react-dom";
import {
	AnimatePresence,
	motion,
	MotionConfig,
	useReducedMotion,
} from "motion/react";
import {
	Check,
	SquareCheckBig,
	Pencil,
	X,
	GripVertical,
	Plus,
	ArrowUp,
	ArrowDown,
	Timer,
	CalendarDays,
	Flag,
	ChevronDown,
	SlidersHorizontal,
} from "lucide-react";
import {
	DndContext,
	PointerSensor,
	KeyboardSensor,
	useSensor,
	useSensors,
	closestCenter,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Button,
	Tabs,
	TabsList,
	TabsTrigger,
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuItem,
	DropdownMenuLabel,
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "./components/ui/index.jsx";
import { dailyGoal, dateKey } from "./daily-goal.mjs";
const priLabels = { must: "Must Do", should: "Should Do", could: "Could Do" },
	timeLabels = { quick: "Quick", m30: "~30m", m60: "~60m", deep: "Deep" };
let updateUI, legacyCustom;
const bridge = () => window.TodoUIBridge;
function GoalCard({ goal, target, onTarget }) {
	const reduce = useReducedMotion(),
		circumference = 2 * Math.PI * 22;
	return (
		<>
			<div className="ring-wrap">
				<svg
					className="ring"
					width="52"
					height="52"
					viewBox="0 0 52 52"
					aria-hidden="true"
				>
					<defs>
						<linearGradient id="ringGrad">
							<stop stopColor="var(--accent-primary)" />
							<stop offset="1" stopColor="var(--accent-secondary)" />
						</linearGradient>
					</defs>
					<circle className="ring-bg" cx="26" cy="26" r="22" />
					<motion.circle
						className="ring-fg"
						id="ringFg"
						cx="26"
						cy="26"
						r="22"
						strokeDasharray={circumference}
						initial={false}
						animate={{ strokeDashoffset: circumference * (1 - goal.pct / 100) }}
						transition={{ duration: reduce ? 0 : 0.45 }}
					/>
				</svg>
				<span className="ring-pct" id="ringPct">
					{goal.pct}%
				</span>
			</div>
			<div className="stats-txt" aria-live="polite">
				<div className="stats-num" id="statsNum">
					{goal.complete ? "You're done for today." : "Daily target"}
				</div>
				<div className="stats-label" id="statsLabel">
					{goal.total
						? `${goal.mustDone}/${goal.mustTotal} Must · ${Math.min(goal.shouldDone, goal.shouldTarget)}/${goal.shouldTarget} Should`
						: "Choose what matters today."}
				</div>
				<div className="stats-sub" id="capLine" />
			</div>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						className="goal-settings"
						aria-label="Set daily target"
					>
						<SlidersHorizontal size={15} />
					</Button>
				</PopoverTrigger>
				<PopoverContent>
					<b>Today's finish line</b>
					<p>
						Complete your Must Do tasks and your chosen number of Should Do
						tasks. Could Do is always optional.
					</p>
					<label className="goal-field">
						Should Do target
						<select
							aria-label="Should Do target"
							value={target}
							onChange={(e) => onTarget(Number(e.target.value))}
						>
							{[0, 1, 2, 3, 4, 5].map((n) => (
								<option key={n} value={n}>
									{n}
								</option>
							))}
						</select>
					</label>
					<small>
						If fewer Should Do tasks are planned, those are your target. Tasks
						without a priority count as commitments.
					</small>
				</PopoverContent>
			</Popover>
		</>
	);
}
function Composer({ comp, onCustom }) {
	return (
		<>
			{[
				["pri", "Priority", Flag, priLabels],
				["time", "Time", Timer, timeLabels],
				["due", "Due", CalendarDays, { today: "Today", tomorrow: "Tomorrow" }],
			].map(([kind, label, Icon, labels]) => (
				<DropdownMenu key={kind}>
					<DropdownMenuTrigger asChild>
						<Button
							id={{ pri: "cPri", time: "cTime", due: "cDue" }[kind]}
							className={`chip ${kind === "pri" ? "p-" + (comp.pri || "could") : kind === "time" ? "t" : "d"} ${comp[kind] || (kind === "due" && comp.dueKey) ? "set" : ""}`}
						>
							<Icon size={12} />
							<span className="k">{label}</span>
							<span id={{ pri: "cPriL", time: "cTimeL", due: "cDueL" }[kind]}>
								{kind === "due" && comp.dueKey
									? comp.dueKey
									: labels[comp[kind]] || (kind === "due" ? "None" : "Set")}
							</span>
							<ChevronDown size={10} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuLabel>{label}</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={comp[kind] || ""}
							onValueChange={(value) => bridge().choose(kind, value)}
						>
							{[["", "None"], ...Object.entries(labels)].map(
								([value, text]) => (
									<DropdownMenuRadioItem key={value} value={value}>
										{text}
									</DropdownMenuRadioItem>
								),
							)}
						</DropdownMenuRadioGroup>
						{kind !== "pri" && (
							<DropdownMenuItem onSelect={() => onCustom(kind)}>
								Custom {kind === "due" ? "date" : "time"}…
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			))}
		</>
	);
}
function TaskRow({ task, revision, sortable = true }) {
	const holder = useRef(null),
		[slots, setSlots] = useState([]),
		reduce = useReducedMotion();
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: task.id, disabled: !sortable });
	useLayoutEffect(() => {
		const node = bridge().itemNode(task);
		holder.current.replaceChildren(node);
		const mapping = [
			[".box", Check],
			[".manage", Pencil],
			[".del", X],
			['.emove[data-dir="-1"]', ArrowUp],
			['.emove[data-dir="1"]', ArrowDown],
			[".tbox-toggle", Timer],
		];
		const targets = mapping.flatMap(([selector, Icon]) => {
			const el = node.querySelector(selector);
			if (!el) return [];
			el.replaceChildren();
			return [{ el, Icon }];
		});
		const grip = node.querySelector(".grip");
		if (grip) {
			grip.removeAttribute("aria-hidden");
			grip.replaceChildren();
			targets.push({ el: grip, handle: true });
		}
		setSlots(targets);
	}, [task, revision]);
	return (
		<div
			ref={setNodeRef}
			className={`ui-task-row${isDragging ? " ui-dragging" : ""}`}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				zIndex: isDragging ? 2 : undefined,
			}}
		>
			<motion.div
				layout={reduce ? false : "position"}
				initial={{ opacity: reduce ? 1 : 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0, height: 0, marginBottom: 0 }}
				transition={{ duration: reduce ? 0 : 0.16 }}
			>
				<div ref={holder} />
				{slots.map(({ el, Icon, handle }, i) =>
					createPortal(
						handle ? (
							<button
								ref={setActivatorNodeRef}
								type="button"
								className="ui-drag-handle"
								{...attributes}
								{...listeners}
								aria-label={`Reorder ${task.text}`}
							>
								<GripVertical size={15} />
							</button>
						) : (
							<Icon size={15} />
						),
						el,
						String(i),
					),
				)}
			</motion.div>
		</div>
	);
}
function OpenTasks({ snapshot, revision, goal }) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
			scrollBehavior: "auto",
		}),
	);
	function onDragEnd({ active, over }) {
		if (!over || active.id === over.id) return;
		const rows = snapshot.visible;
		// Preserve the established priority/date grouping; reorder within a group.
		const from = rows.find((t) => t.id === active.id),
			to = rows.find((t) => t.id === over.id);
		if (
			!from ||
			!to ||
			from.pri !== to.pri ||
			(snapshot.tab === "upcoming" && from.dueKey !== to.dueKey)
		)
			return;
		const ids = rows.map((t) => t.id),
			a = ids.indexOf(active.id),
			b = ids.indexOf(over.id);
		ids.splice(b, 0, ids.splice(a, 1)[0]);
		bridge().reorder(ids);
	}
	return (
		<>
			{snapshot.tab === "today" && goal.complete && (
				<motion.div
					className="day-complete"
					role="status"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<SquareCheckBig size={30} />
					<b>Enjoy your time guilt-free.</b>
					<span>Today's commitments are complete.</span>
					{snapshot.visible.length > 0 && (
						<small>Anything below is optional.</small>
					)}
				</motion.div>
			)}
			{!snapshot.visible.length &&
				!(snapshot.tab === "today" && goal.complete) && (
					<div className="empty">
						<SquareCheckBig size={34} />
						<div>
							{snapshot.tab === "today"
								? "Plan a manageable day."
								: snapshot.tab === "upcoming"
									? "Nothing scheduled ahead"
									: "No open tasks"}
						</div>
						<div className="sub">
							{snapshot.tab === "today"
								? "Add your Must Do, Should Do, and Could Do tasks."
								: "Add a task above when you need one."}
						</div>
					</div>
				)}
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={onDragEnd}
			>
				<SortableContext items={snapshot.visible.map((t) => t.id)}>
					<AnimatePresence initial={false}>
						{snapshot.visible.map((task) => (
							<TaskRow key={task.id} task={task} revision={revision} />
						))}
					</AnimatePresence>
				</SortableContext>
			</DndContext>
		</>
	);
}
function App({ mounts }) {
	const [revision, setRevision] = useState(0),
		[custom, setCustom] = useState(null),
		[target, setTarget] = useState(readTarget),
		[dialogMarkup, setDialogMarkup] = useState(null);
	updateUI = () => {
		setRevision((x) => x + 1);
		setTarget(readTarget());
	};
	window.TodoUI.openCustom = setCustom;
	const snapshot = bridge().snapshot(),
		goal = dailyGoal(snapshot.tasks, target);
	const done = snapshot.tasks
		.filter((t) => t.done)
		.sort((a, b) => b.doneAt - a.doneAt);
	useLayoutEffect(() => {
		document.getElementById("doneN").textContent = done.length;
		document.getElementById("doneSec").style.display = done.length
			? ""
			: "none";
		bridge().updateCapLine();
		bridge().renderTomorrow();
	}, [revision, target]);
	// Keep existing custom time/date behaviour; Radix supplies focus trapping,
	// Escape, overlay dismissal, accessible titles and focus restoration.
	useLayoutEffect(() => {
		if (!custom) return;
		const focus = document.activeElement;
		legacyCustom?.[custom === "due" ? "openDue" : "openTime"]();
		const overlay = document.getElementById("todoCustomOverlay");
		if (!overlay) return;
		const panel = overlay.firstElementChild;
		overlay.remove();
		panel.removeAttribute("role");
		panel.removeAttribute("aria-modal");
		panel.removeAttribute("aria-labelledby");
		panel.querySelector(".todo-custom-head")?.remove();
		overlay.addEventListener("click", () => {
			queueMicrotask(() => {
				if (!overlay.isConnected) setCustom(null);
			});
		});
		// The legacy handler uses the overlay as its query root, so retain it offscreen
		// until its panel is mounted in the accessible dialog.
		overlay.hidden = true;
		document.body.appendChild(overlay);
		setDialogMarkup({ panel, overlay, focus, kind: custom });
		return () => {
			overlay.remove();
		};
	}, [custom]);
	function chooseTarget(value) {
		const setting = { date: dateKey(), count: value };
		window.SyncEngine.set("todo", "dailyGoal", JSON.stringify(setting));
		setTarget(value);
	}
	useEffect(() => {
		let day = dateKey();
		const timer = setInterval(() => {
			if (day !== dateKey()) {
				day = dateKey();
				bridge().refresh();
			}
			setTarget(readTarget());
		}, 12000);
		return () => clearInterval(timer);
	}, []);
	return (
		<MotionConfig reducedMotion="user">
			{createPortal(
				<GoalCard goal={goal} target={target} onTarget={chooseTarget} />,
				mounts.stats,
			)}
			{createPortal(
				<Tabs
					value={snapshot.tab}
					onValueChange={(value) => bridge().selectTab(value)}
				>
					<TabsList aria-label="Task filter">
						{["today", "upcoming", "all"].map((value) => (
							<TabsTrigger key={value} value={value} data-tab={value}>
								{value[0].toUpperCase() + value.slice(1)}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>,
				mounts.tabs,
			)}
			{createPortal(
				<Composer comp={snapshot.comp} onCustom={setCustom} />,
				mounts.composer,
			)}
			{createPortal(
				<OpenTasks snapshot={snapshot} revision={revision} goal={goal} />,
				mounts.list,
			)}
			{createPortal(
				<AnimatePresence initial={false}>
					{done.map((task) => (
						<TaskRow
							key={task.id}
							task={task}
							revision={revision}
							sortable={false}
						/>
					))}
				</AnimatePresence>,
				mounts.doneList,
			)}
			{createPortal(<Plus size={22} />, mounts.addbtn)}
			<Dialog
				open={!!custom}
				onOpenChange={(open) => {
					if (!open) setCustom(null);
				}}
			>
				<DialogContent
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						document
							.getElementById(dialogMarkup?.kind === "due" ? "cDue" : "cTime")
							?.focus();
					}}
				>
					<DialogTitle>
						{custom === "due" ? "Choose due date" : "Custom time"}
					</DialogTitle>
					<DialogDescription>
						{custom === "due"
							? "Choose a date for this task."
							: "Choose a duration or place it on your timetable."}
					</DialogDescription>
					<LegacyPanel content={dialogMarkup} />
				</DialogContent>
			</Dialog>
		</MotionConfig>
	);
}
function LegacyPanel({ content }) {
	const ref = useRef(null);
	useLayoutEffect(() => {
		if (content && ref.current) {
			content.overlay.hidden = false;
			content.overlay.className = "ui-custom-host";
			content.overlay.style.cssText =
				"position:static;background:none;padding:0;display:block;backdrop-filter:none";
			content.overlay.replaceChildren(content.panel);
			ref.current.replaceChildren(content.overlay);
		}
	}, [content]);
	return <div ref={ref} />;
}
function readTarget() {
	try {
		const value = window.SyncEngine.get("todo", "dailyGoal");
		const setting = typeof value === "string" ? JSON.parse(value) : value;
		return setting?.date === dateKey()
			? Math.min(5, Math.max(0, Number(setting.count) || 0))
			: 1;
	} catch {
		return 1;
	}
}
function boot() {
	if (!bridge() || !window.SyncEngine) return;
	const stats = document.querySelector(".stats"),
		tabs = document.querySelector(".tabs"),
		composer = document.querySelector(".composer"),
		list = document.getElementById("list"),
		doneList = document.getElementById("doneList"),
		addbtn = document.getElementById("addbtn");
	if (!stats || !tabs || !composer || !list || !doneList || !addbtn) return;
	const tabHost = document.createElement("div");
	tabs.replaceWith(tabHost);
	[stats, composer, list, doneList, addbtn].forEach((el) =>
		el.replaceChildren(),
	);
	const host = document.createElement("div");
	host.id = "todo-ui-root";
	document.body.appendChild(host);
	const root = createRoot(host);
	legacyCustom = { ...window.TodoCustom };
	if (window.TodoCustom) {
		window.TodoCustom.openTime = () => window.TodoUI.openCustom("time");
		window.TodoCustom.openDue = () => window.TodoUI.openCustom("due");
	}
	window.TodoUI = {
		render() {
			if (updateUI) flushSync(updateUI);
		},
	};
	flushSync(() =>
		root.render(
			<App
				mounts={{ stats, tabs: tabHost, composer, list, doneList, addbtn }}
			/>,
		),
	);
	// Refresh promptly for imports and remote changes, preserving the same store.
	window.addEventListener("schedule-paste:refresh", () => bridge().refresh());
	window.SyncEngine.subscribe?.("todo", "dailyGoal", () =>
		window.TodoUI.render(),
	);
}
if (document.readyState === "loading")
	document.addEventListener("DOMContentLoaded", boot);
else boot();
