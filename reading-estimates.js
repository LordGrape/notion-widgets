/* Shared reading planner. Estimates are editable planning defaults, not averages. */
(function (g) {
  const phases = { first: ['First pass', 6], analysis: ['Case analysis + notes', 9], review: ['Review', 3] };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parse(text) {
    text = String(text || '');
    const isReading = /\b(read|reading|review|brief)\b/i.test(text);
    if (!isReading) return null;
    const ranges = [...text.matchAll(/\b(?:pages?|pp?\.?)\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/gi)];
    if (ranges.length) {
      const intervals = ranges.map(m => [+m[1], +m[2]]);
      if (intervals.some(([a,b]) => a < 1 || b < a)) return { invalid: true };
      intervals.sort((a,b) => a[0]-b[0]);
      const merged = [];
      intervals.forEach(([a,b]) => { const last = merged.at(-1); if (last && a <= last[1]+1) last[1] = Math.max(last[1],b); else merged.push([a,b]); });
      return { pages: merged.reduce((n,[a,b]) => n+b-a+1,0), start: ranges.length === 1 ? +ranges[0][1] : null, end: ranges.length === 1 ? +ranges[0][2] : null };
    }
    const count = text.match(/\b(\d+)\s*pages?\b/i), single = text.match(/\b(?:page|p\.)\s*(\d+)\b/i);
    return count ? { pages: +count[1] } : single ? { pages: 1, start: +single[1], end: +single[1] } : { pages: null };
  }
  function estimate(text, data = {}) {
    const parsed = parse(text);
    if (!parsed) return null;
    let pages, start, end;
    if (data.pageMode === 'range') {
      start = +data.start; end = +data.end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return { invalid: true };
      pages = end-start+1;
    } else if (data.pageMode === 'count') pages = +data.pages;
    else { if (parsed.invalid) return parsed; ({pages,start,end} = parsed); }
    if (!Number.isInteger(pages) || pages < 1) return { pages: null };
    const phase = phases[data.phase] ? data.phase : 'first';
    const pace = +data.pace > 0 ? +data.pace : phases[phase][1];
    const minutes = Math.ceil(pages*pace);
    const splits = [];
    if (minutes > 90 && pages > 1) {
      const first = Math.ceil(pages/2), second = pages-first;
      splits.push({ text: start ? `Read pages ${start}–${start+first-1}` : `Read first ${first} pages`, minutes: Math.ceil(first*pace) });
      splits.push({ text: start ? `Read pages ${start+first}–${end}` : `Read remaining ${second} pages`, minutes: Math.ceil(second*pace) });
    }
    return {pages,start,end,phase,pace,minutes,splits};
  }
  function apply(task) {
    const reading = task.reading || {};
    const e = estimate(task.text,reading);
    if (reading.manual || task.time || (task.plannedMinutes && task.plannedMinutes !== reading.autoMinutes)) return task;
    if (e?.minutes) { task.plannedMinutes=e.minutes; task.reading={...reading,autoMinutes:e.minutes}; }
    else if (reading.autoMinutes) { task.plannedMinutes=null; task.reading={...reading,autoMinutes:null}; }
    return task;
  }
  function html(task) {
    const r = task.reading || {}, parsed = parse(task.text) || {}, phase = r.phase || 'first';
    return `<fieldset class="reading-fields"><legend>Reading estimate</legend><div class="reading-grid"><label>Pages<select data-reading="pageMode"><option value="text">From task title</option><option value="count" ${r.pageMode==='count'?'selected':''}>Page count</option><option value="range" ${r.pageMode==='range'?'selected':''}>Page range</option></select></label><label data-count>Number of pages<input type="number" min="1" step="1" data-reading="pages" value="${esc(r.pages || parsed.pages || '')}"></label><label data-range>First page<input type="number" min="1" step="1" data-reading="start" value="${esc(r.start || parsed.start || '')}"></label><label data-range>Last page<input type="number" min="1" step="1" data-reading="end" value="${esc(r.end || parsed.end || '')}"></label><label>Phase<select data-reading="phase">${Object.entries(phases).map(([k,[label]])=>`<option value="${k}" ${k===phase?'selected':''}>${label}</option>`).join('')}</select></label><label>Minutes per page<input type="number" min="0.25" max="60" step="0.25" data-reading="pace" value="${esc(r.pace || phases[phase][1])}"></label></div><p data-reading-summary aria-live="polite"></p><div class="reading-actions"><button type="button" data-use-estimate>Use estimate</button><button type="button" data-split-reading hidden>Add two session steps</button></div><details><summary>About these estimates</summary><p>First pass starts at 6 min/page, based on Cornell Law’s guidance that a beginner may take an hour for a ten-page case. Analysis (9) and review (3) are adjustable planning defaults, not measured averages. Breaks are extra.</p><a href="https://www.lawschool.cornell.edu/life-at-cornell-law/academic-support/" target="_blank" rel="noopener">Cornell Law academic support</a></details></fieldset>`;
  }
  function mount(host, task, options) {
    const box=host.querySelector('.reading-fields'), title=options.title, duration=options.duration;
    let r={...(task.reading || {})};
    if (!r.manual && (task.time || (task.plannedMinutes && task.plannedMinutes !== r.autoMinutes))) r.manual=true;
    function read() { box.querySelectorAll('[data-reading]').forEach(n=>r[n.dataset.reading]=n.value); return r; }
    function update() {
      const text=title.value, e=estimate(text,read());
      box.hidden=!parse(text);
      box.querySelectorAll('[data-count]').forEach(n=>n.hidden=r.pageMode!=='count');
      box.querySelectorAll('[data-range]').forEach(n=>n.hidden=r.pageMode!=='range');
      box.querySelector('[data-reading-summary]').textContent=e?.invalid?'Enter a valid page range.':e?.minutes?`${e.pages} pages × ${e.pace} min/page ≈ ${e.minutes} min${r.manual ? ' · Your duration is kept.' : ''}`:'Add a page count or range to estimate time.';
      box.querySelector('[data-split-reading]').hidden=!e?.splits?.length;
      if (!r.manual && (parse(text) || r.autoMinutes)) { duration.value=e?.minutes || ''; r.autoMinutes=e?.minutes || null; }
    }
    title.addEventListener('input',update);
    duration.addEventListener('input',()=>{r.manual=true; update();});
    box.addEventListener('input',event=>{if(event.target.dataset.reading==='phase')box.querySelector('[data-reading="pace"]').value=phases[event.target.value][1];update();});
    box.querySelector('[data-use-estimate]').onclick=()=>{r.manual=false;update();};
    box.querySelector('[data-split-reading]').onclick=()=>{const e=estimate(title.value,read());if(e?.splits?.length)options.split(e.splits.map(s=>`${s.text} (${s.minutes} min)`));};
    update();
    return ()=>({...read(),manual:!!r.manual});
  }
  g.ReadingEstimates={parse,estimate,apply,html,mount};
})(globalThis);
