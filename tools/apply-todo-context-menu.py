from pathlib import Path
import re

path = Path("todo.html")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match, found {count}: {old[:90]!r}")
    text = text.replace(old, new, 1)


replace_once(
    ".chip.d.set{background:var(--accent-primary)}\n\n/* List */",
    ".chip.d.set{background:var(--accent-primary)}\n"
    ".chipmenu{position:fixed;z-index:10060;min-width:188px;padding:6px;background:var(--surface-3);border:1px solid var(--border-default);border-radius:var(--radius-md);box-shadow:var(--shadow-md);backdrop-filter:var(--blur-glass);-webkit-backdrop-filter:var(--blur-glass)}\n"
    ".chipmenu-title{padding:5px 8px 7px;color:var(--text-tertiary);font-size:.64rem;font-weight:750;letter-spacing:.06em;text-transform:uppercase}\n"
    ".chipmenu button{width:100%;min-height:36px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--text-secondary);font:inherit;font-size:.78rem;font-weight:650;text-align:left;padding:8px 30px 8px 10px;cursor:pointer;position:relative}\n"
    ".chipmenu button:hover,.chipmenu button:focus-visible{background:var(--surface-2);color:var(--text-primary);outline:none}\n"
    ".chipmenu button.on{color:var(--accent-primary)}\n"
    ".chipmenu button.on::after{content:'\\2713';position:absolute;right:10px;font-weight:800}\n"
    ".chipmenu-sep{height:1px;background:var(--border-subtle);margin:5px 4px}\n"
    ".chipmenu-date{display:flex;flex-direction:column;gap:5px;padding:6px 8px 8px;color:var(--text-tertiary);font-size:.66rem;font-weight:700}\n"
    ".chipmenu-date input{width:100%;min-height:38px;color:var(--text-primary);background:var(--surface-0);border:1px solid var(--border-default);border-radius:var(--radius-sm);padding:7px 8px;font:inherit;font-size:.78rem;outline:none;color-scheme:light dark}\n"
    ".chipmenu-date input:focus{border-color:var(--accent-primary);box-shadow:0 0 0 3px var(--accent-glow)}\n"
    ".e-due-date{min-height:32px;color-scheme:light dark}\n\n/* List */",
)

replace_once(
    "  var comp = { pri: 0, time: 0, due: 0 };",
    "  var comp = { pri: 0, time: 0, due: 0, dueKey: null };",
)

replace_once(
    "  var calibrationTimer = null;",
    "  var calibrationTimer = null;\n  var chooserEl = null, chooserOwner = null;",
)

replace_once(
    "  function tmrwKey() { var d = new Date(); d.setDate(d.getDate() + 1); return todayKey(d); }\n  function keyNum(k)",
    "  function tmrwKey() { var d = new Date(); d.setDate(d.getDate() + 1); return todayKey(d); }\n"
    "  function inputDateKey(d) { d = d || new Date(); return d.getFullYear() + \"-\" + (\"0\" + (d.getMonth() + 1)).slice(-2) + \"-\" + (\"0\" + d.getDate()).slice(-2); }\n"
    "  function normalizedDateKey(k) { var p = String(k || \"\").split(\"-\").map(Number); return p.length === 3 && p[0] && p[1] && p[2] ? p[0] + \"-\" + (\"0\" + p[1]).slice(-2) + \"-\" + (\"0\" + p[2]).slice(-2) : \"\"; }\n"
    "  function keyNum(k)",
)

replace_once(
    "  function add() {\n    var inp = $(\"inp\");\n    var v = inp.value.trim();\n    if (!v) return;\n    var due = DUE[comp.due];\n    tasks.unshift({\n      id: uid(), text: v, pri: PRI[comp.pri], time: TIME[comp.time], due: due,\n      dueKey: due === \"tomorrow\" ? tmrwKey() : (due === \"today\" ? todayKey() : null),",
    "  function add() {\n    var inp = $(\"inp\");\n    var v = inp.value.trim();\n    if (!v) return;\n    var due = DUE[comp.due];\n    var chosenDueKey = comp.dueKey || (due === \"tomorrow\" ? tmrwKey() : (due === \"today\" ? todayKey() : null));\n    if (chosenDueKey) due = keyNum(chosenDueKey) === keyNum(todayKey()) ? \"today\" : (keyNum(chosenDueKey) === keyNum(tmrwKey()) ? \"tomorrow\" : null);\n    tasks.unshift({\n      id: uid(), text: v, pri: PRI[comp.pri], time: TIME[comp.time], due: due,\n      dueKey: chosenDueKey,",
)

replace_once(
    "    comp = { pri: 0, time: 0, due: 0 };",
    "    comp = { pri: 0, time: 0, due: 0, dueKey: null };",
)

replace_once(
    "  function setField(t, field, v) {\n    v = v || \"\";",
    "  function setCustomDue(t, key) {\n"
    "    key = normalizedDateKey(key);\n"
    "    t.dueKey = key || null;\n"
    "    t.due = key ? (keyNum(key) === keyNum(todayKey()) ? \"today\" : (keyNum(key) === keyNum(tmrwKey()) ? \"tomorrow\" : null)) : null;\n"
    "    t.setKey = todayKey();\n"
    "    snd(\"playClick\"); save();\n"
    "    if (t.due === \"today\") capCheck();\n"
    "  }\n"
    "  function setField(t, field, v) {\n    v = v || \"\";",
)

replace_once(
    "  function esc(s) { return String(s).replace(/[&<>\"]/g, function (c) { return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", '\"': \"&quot;\" }[c]; }); }\n  function tagHtml(t) {",
    "  function esc(s) { return String(s).replace(/[&<>\"]/g, function (c) { return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", '\"': \"&quot;\" }[c]; }); }\n"
    "  function dueDateLabel(key) {\n"
    "    var value = normalizedDateKey(key); if (!value) return \"\";\n"
    "    if (keyNum(value) === keyNum(todayKey())) return \"Today\";\n"
    "    if (keyNum(value) === keyNum(tmrwKey())) return \"Tomorrow\";\n"
    "    var p = value.split(\"-\").map(Number), d = new Date(p[0], p[1] - 1, p[2], 12);\n"
    "    try { return d.toLocaleDateString(\"en-CA\", { month: \"short\", day: \"numeric\", year: p[0] !== new Date().getFullYear() ? \"numeric\" : undefined }); } catch (e) { return value; }\n"
    "  }\n"
    "  function tagHtml(t) {",
)

replace_once(
    "      else if (t.due === \"tomorrow\") h += '<span class=\"tag tmrw\">Tomorrow</span>';",
    "      else if (t.due === \"tomorrow\" || (t.dueKey && keyNum(t.dueKey) === keyNum(tmrwKey()))) h += '<span class=\"tag tmrw\">Tomorrow</span>';\n"
    "      else if (t.dueKey) h += '<span class=\"tag\">' + esc(dueDateLabel(t.dueKey)) + \"</span>\";",
)

replace_once(
    "  function editorHtml(t){var pri=[{v:\"\",l:\"None\"},{v:\"must\",l:\"Must\"},{v:\"should\",l:\"Should\"},{v:\"could\",l:\"Could\"}],time=[{v:\"\",l:\"None\"},{v:\"quick\",l:\"Quick\"},{v:\"m30\",l:\"~30m\"},{v:\"m60\",l:\"~60m\"},{v:\"deep\",l:\"Deep\"}],due=[{v:\"\",l:\"None\"},{v:\"today\",l:\"Today\"},{v:\"tomorrow\",l:\"Tomorrow\"}];return'<div class=\"editor\"><input class=\"e-title e-title-main\" aria-label=\"Task title\" value=\"'+esc(t.text)+'\"><input class=\"e-title e-outcome\" aria-label=\\\"Task target\\\" placeholder=\"Target for this task (optional)\" value=\"'+esc(t.outcomeGoal||\"\")+'\">'+eoptRow(\"Priority\",\"pri\",pri,t.pri)+(t.pri===\"must\"?'<input class=\"e-title e-plan\" aria-label=\"Plan: when and where\" placeholder=\"Plan: after ___ , at ___\" value=\"'+esc(t.plan||\"\")+'\">':\"\")+eoptRow(\"Time\",\"time\",time,t.time)+eoptRow(\"Due\",\"due\",due,t.due)+subsHtml(t)+",
    "  function editorHtml(t){var pri=[{v:\"\",l:\"None\"},{v:\"must\",l:\"Must\"},{v:\"should\",l:\"Should\"},{v:\"could\",l:\"Could\"}],time=[{v:\"\",l:\"None\"},{v:\"quick\",l:\"Quick\"},{v:\"m30\",l:\"~30m\"},{v:\"m60\",l:\"~60m\"},{v:\"deep\",l:\"Deep\"}],due=[{v:\"\",l:\"None\"},{v:\"today\",l:\"Today\"},{v:\"tomorrow\",l:\"Tomorrow\"}];return'<div class=\"editor\"><input class=\"e-title e-title-main\" aria-label=\"Task title\" value=\"'+esc(t.text)+'\"><input class=\"e-title e-outcome\" aria-label=\\\"Task target\\\" placeholder=\"Target for this task (optional)\" value=\"'+esc(t.outcomeGoal||\"\")+'\">'+eoptRow(\"Priority\",\"pri\",pri,t.pri)+(t.pri===\"must\"?'<input class=\"e-title e-plan\" aria-label=\"Plan: when and where\" placeholder=\"Plan: after ___ , at ___\" value=\"'+esc(t.plan||\"\")+'\">':\"\")+eoptRow(\"Time\",\"time\",time,t.time)+eoptRow(\"Due\",\"due\",due,t.due)+'<div class=\"erow\"><span class=\"elab\">Date</span><input class=\"e-title e-due-date\" type=\"date\" min=\"'+inputDateKey()+'\" value=\"'+normalizedDateKey(t.dueKey)+'\" aria-label=\"Specific due date\"></div>'+subsHtml(t)+",
)

replace_once(
    "      var notesI = el.querySelector(\".e-notes\");",
    "      var dueDateI = el.querySelector(\".e-due-date\");\n"
    "      if (dueDateI) dueDateI.addEventListener(\"change\", function () { setCustomDue(t, this.value); });\n"
    "      var notesI = el.querySelector(\".e-notes\");",
)

replace_once(
    "  function syncComposer() {\n    var p = PRI[comp.pri], t = TIME[comp.time], d = DUE[comp.due];\n    $(\"cPri\").className = \"chip \" + (p ? \"p-\" + p + \" set\" : \"p-could\");\n    $(\"cPriL\").textContent = p ? PRIL[p] : \"Set\";\n    $(\"cTime\").className = \"chip t\" + (t ? \" set\" : \"\");\n    $(\"cTimeL\").textContent = t ? TIMEL[t] : \"Set\";\n    $(\"cDue\").className = \"chip d\" + (d ? \" set\" : \"\");\n    $(\"cDueL\").textContent = d ? DUEL[d] : \"None\";\n  }",
    "  function syncComposer() {\n    var p = PRI[comp.pri], t = TIME[comp.time], d = DUE[comp.due], dueLabel = comp.dueKey ? dueDateLabel(comp.dueKey) : (d ? DUEL[d] : \"None\");\n    $(\"cPri\").className = \"chip \" + (p ? \"p-\" + p + \" set\" : \"p-could\");\n    $(\"cPriL\").textContent = p ? PRIL[p] : \"Set\";\n    $(\"cTime\").className = \"chip t\" + (t ? \" set\" : \"\");\n    $(\"cTimeL\").textContent = t ? TIMEL[t] : \"Set\";\n    $(\"cDue\").className = \"chip d\" + ((d || comp.dueKey) ? \" set\" : \"\");\n    $(\"cDueL\").textContent = dueLabel;\n  }\n\n"
    "  function closeChooser() { if (chooserEl && chooserEl.parentNode) chooserEl.parentNode.removeChild(chooserEl); chooserEl = null; chooserOwner = null; }\n"
    "  function composerChoice(kind, value) {\n"
    "    if (kind === \"pri\") comp.pri = Math.max(0, PRI.indexOf(value || null));\n"
    "    else if (kind === \"time\") comp.time = Math.max(0, TIME.indexOf(value || null));\n"
    "    else if (kind === \"due\") { comp.dueKey = null; comp.due = Math.max(0, DUE.indexOf(value || null)); }\n"
    "    syncComposer(); snd(\"playClick\"); closeChooser();\n"
    "  }\n"
    "  function openComposerChooser(kind, anchor) {\n"
    "    closeChooser(); chooserOwner = anchor;\n"
    "    var labels = { pri: \"Priority\", time: \"Time estimate\", due: \"Due date\" };\n"
    "    var options = kind === \"pri\" ? [{v:\"\",l:\"None\"},{v:\"must\",l:\"Must\"},{v:\"should\",l:\"Should\"},{v:\"could\",l:\"Could\"}] : (kind === \"time\" ? [{v:\"\",l:\"None\"},{v:\"quick\",l:\"Quick\"},{v:\"m30\",l:\"~30m\"},{v:\"m60\",l:\"~60m\"},{v:\"deep\",l:\"Deep\"}] : [{v:\"\",l:\"None\"},{v:\"today\",l:\"Today\"},{v:\"tomorrow\",l:\"Tomorrow\"}]);\n"
    "    var current = kind === \"pri\" ? PRI[comp.pri] : (kind === \"time\" ? TIME[comp.time] : (comp.dueKey ? \"custom\" : DUE[comp.due]));\n"
    "    var menu = document.createElement(\"div\"); menu.className = \"chipmenu\"; menu.setAttribute(\"role\", \"menu\"); menu.setAttribute(\"aria-label\", labels[kind]);\n"
    "    menu.innerHTML = '<div class=\"chipmenu-title\">' + labels[kind] + \"</div>\" + options.map(function (o) { return '<button role=\"menuitem\" data-value=\"' + o.v + '\" class=\"' + ((current || \"\") === o.v ? \"on\" : \"\") + '\">' + o.l + \"</button>\"; }).join(\"\") + (kind === \"due\" ? '<div class=\"chipmenu-sep\"></div><label class=\"chipmenu-date\">Choose a future date<input type=\"date\" min=\"' + inputDateKey() + '\" value=\"' + (comp.dueKey ? normalizedDateKey(comp.dueKey) : \"\") + '\" aria-label=\"Choose a future due date\"></label>' : \"\");\n"
    "    document.body.appendChild(menu); chooserEl = menu;\n"
    "    [].forEach.call(menu.querySelectorAll(\"button[data-value]\"), function (b) { b.addEventListener(\"click\", function () { composerChoice(kind, this.getAttribute(\"data-value\")); }); });\n"
    "    var dateInput = menu.querySelector('input[type=\"date\"]'); if (dateInput) dateInput.addEventListener(\"change\", function () { if (!this.value) return; comp.dueKey = normalizedDateKey(this.value); comp.due = keyNum(comp.dueKey) === keyNum(todayKey()) ? 1 : (keyNum(comp.dueKey) === keyNum(tmrwKey()) ? 2 : 0); syncComposer(); snd(\"playClick\"); closeChooser(); });\n"
    "    var r = anchor.getBoundingClientRect(), mr = menu.getBoundingClientRect(), left = Math.min(window.innerWidth - mr.width - 8, Math.max(8, r.left)), top = r.bottom + 6;\n"
    "    if (top + mr.height > window.innerHeight - 8) top = Math.max(8, r.top - mr.height - 6); menu.style.left = left + \"px\"; menu.style.top = top + \"px\";\n"
    "    var first = menu.querySelector(\"button\"); if (first) first.focus();\n"
    "  }\n"
    "  function wireComposerChooser(id, kind) { var el = $(id); el.addEventListener(\"contextmenu\", function (e) { e.preventDefault(); openComposerChooser(kind, el); }); }",
)

replace_once(
    "    $(\"cPri\").addEventListener(\"click\", function () { comp.pri = (comp.pri + 1) % PRI.length; syncComposer(); snd(\"playClick\"); });\n    $(\"cTime\").addEventListener(\"click\", function () { comp.time = (comp.time + 1) % TIME.length; syncComposer(); snd(\"playClick\"); });\n    $(\"cDue\").addEventListener(\"click\", function () { comp.due = (comp.due + 1) % DUE.length; syncComposer(); snd(\"playClick\"); });",
    "    $(\"cPri\").addEventListener(\"click\", function () { comp.pri = (comp.pri + 1) % PRI.length; syncComposer(); snd(\"playClick\"); });\n    $(\"cTime\").addEventListener(\"click\", function () { comp.time = (comp.time + 1) % TIME.length; syncComposer(); snd(\"playClick\"); });\n    $(\"cDue\").addEventListener(\"click\", function () { comp.dueKey = null; comp.due = (comp.due + 1) % DUE.length; syncComposer(); snd(\"playClick\"); });\n    wireComposerChooser(\"cPri\", \"pri\"); wireComposerChooser(\"cTime\", \"time\"); wireComposerChooser(\"cDue\", \"due\");\n    document.addEventListener(\"pointerdown\", function (e) { if (chooserEl && !chooserEl.contains(e.target) && e.target !== chooserOwner) closeChooser(); });\n    document.addEventListener(\"keydown\", function (e) { if (e.key === \"Escape\") closeChooser(); });\n    window.addEventListener(\"resize\", closeChooser); window.addEventListener(\"scroll\", closeChooser, true);",
)

path.write_text(text, encoding="utf-8")

required = [
    "openComposerChooser",
    "Choose a future date",
    "e-due-date",
    "comp.dueKey = null",
    "else if (t.dueKey) h +=",
]
for marker in required:
    if marker not in text:
        raise SystemExit(f"Missing marker after patch: {marker}")

scripts = re.findall(r"<script(?:\\s[^>]*)?>([\\s\\S]*?)</script>", text)
if not scripts:
    raise SystemExit("No inline script found")
Path("/tmp/todo-inline.js").write_text("\n".join(scripts), encoding="utf-8")
print(f"Patched {path} ({len(text)} bytes); inline JS extracted for syntax check")
