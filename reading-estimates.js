/* Shared reading planner. Estimates are editable planning defaults, not averages. */
(function (g) {
  const DEFAULT_PACE = 6;let learnedPace=null;
  // Preserve saved pace choices from older task payloads without showing phases.
  const paceFor = data => +data.pace > 0 ? +data.pace : (learnedPace?.pace || ({first:6,analysis:9,review:3}[data.phase] || DEFAULT_PACE));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parse(text) {
    text = String(text || '');
    const isReading = /\b(?:reads?|readings?|reviews?|briefs?)\b/i.test(text);
    if (!isReading) return null;
    const count = text.match(/\b(\d+)\s*pages?\b/i);
    if (count) return { pages: +count[1] };
    // A page marker starts a list; later entries can omit it.
    const lists = [...text.matchAll(/\b(?:pages?|pp?\.?|read|reading)\s*:?\s*(\d+(?:\s*(?:[-–—]|to)\s*\d+)?(?:\s*(?:,|&|and|\+)\s*(?:(?:pages?|pp?\.?)\s*)?\d+(?:\s*(?:[-–—]|to)\s*\d+)?)*)/gi)];
    const intervals = lists.flatMap(m => [...m[1].matchAll(/(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?/gi)].map(n => [+n[1], +(n[2] || n[1])]));
    if (!intervals.length) return { pages: null };
    if (intervals.some(([a,b]) => a < 1 || b < a)) return { invalid: true };
    intervals.sort((a,b) => a[0]-b[0]);
    const merged = [];
    intervals.forEach(([a,b]) => { const last = merged.at(-1); if (last && a <= last[1]+1) last[1] = Math.max(last[1],b); else merged.push([a,b]); });
    return { pages: merged.reduce((n,[a,b]) => n+b-a+1,0), start: merged.length === 1 ? merged[0][0] : null, end: merged.length === 1 ? merged[0][1] : null };
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
    const pace = paceFor(data);
    const minutes = Math.ceil(pages*pace);
    const splits = [];
    if (minutes > 90 && pages > 1) {
      const first = Math.ceil(pages/2), second = pages-first;
      splits.push({ text: start ? `Read pages ${start}–${start+first-1}` : `Read first ${first} pages`, minutes: Math.ceil(first*pace) });
      splits.push({ text: start ? `Read pages ${start+first}–${end}` : `Read remaining ${second} pages`, minutes: Math.ceil(second*pace) });
    }
    return {pages,start,end,pace,minutes,splits};
  }
  function apply(task) {
    const reading = task.reading || {};
    const e = estimate(task.text,reading);
    if (reading.manual || task.time || (task.plannedMinutes && task.plannedMinutes !== reading.autoMinutes)) return task;
    if (e?.minutes) { task.plannedMinutes=e.minutes; task.reading={...reading,autoMinutes:e.minutes}; }
    else if (reading.autoMinutes) { task.plannedMinutes=null; task.reading={...reading,autoMinutes:null}; }
    return task;
  }
  function learn(tasks,sessions){
    const history=typeof sessions==='string'?(()=>{try{return JSON.parse(sessions)}catch{return[]}})():sessions||[],totals=new Map();
    if(!Array.isArray(history))return learnedPace;
    history.forEach(s=>{if(s&&s.taskId&&Number(s.seconds)>0)totals.set(String(s.taskId),(totals.get(String(s.taskId))||0)+Number(s.seconds));});
    const samples=(tasks||[]).filter(t=>t&&t.done&&t.id&&estimate(t.text,t.reading||{})?.pages).map(t=>({pages:estimate(t.text,t.reading||{}).pages,seconds:totals.get(String(t.id))||0})).filter(x=>x.seconds>=180).map(x=>x.seconds/60/x.pages).filter(x=>x>=.5&&x<=30).sort((a,b)=>a-b);
    if(samples.length<3){learnedPace=null;return null;}
    const n=samples.length,i=Math.floor(n/2),pace=Math.round((n%2?samples[i]:(samples[i-1]+samples[i])/2)*4)/4;
    learnedPace={pace,sampleCount:n};return learnedPace;
  }
  const editorState = new Map();
  const timeLabel = minutes => minutes >= 60
    ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
    : `${minutes} min`;
  function html(task) {
    const r = task.reading || {}, parsed = parse(task.text) || {};
    const mode = r.pageMode || (!parsed.pages && r.pages ? 'count' : 'text');
    const open = editorState.get(task.id)?.open ?? !parsed.pages;
    return `<section class="reading-fields" aria-label="Reading estimate"><div class="reading-overview"><div><span class="reading-label">Reading</span><p data-reading-summary aria-live="polite"></p></div><button type="button" class="reading-time" data-manual-duration aria-label="Change reading duration"></button></div><details class="reading-options" ${open ? 'open' : ''}><summary>Adjust reading</summary><div class="reading-grid"><label>Pages<select data-reading="pageMode"><option value="text" ${mode==='text'?'selected':''}>From title</option><option value="count" ${mode==='count'?'selected':''}>Page count</option><option value="range" ${mode==='range'?'selected':''}>Page range</option></select></label><label data-count>Pages<input type="number" min="1" step="1" data-reading="pages" value="${esc(r.pages || parsed.pages || '')}" placeholder="e.g. 16"></label><label data-range>From page<input type="number" min="1" step="1" data-reading="start" value="${esc(r.start || parsed.start || '')}" placeholder="15"></label><label data-range>To page<input type="number" min="1" step="1" data-reading="end" value="${esc(r.end || parsed.end || '')}" placeholder="30"></label></div><details class="reading-advanced" ${editorState.get(task.id)?.pace ? 'open' : ''}><summary>Reading pace</summary><label><span data-pace-label>Minutes per page</span><input type="number" min="0.25" max="60" step="0.25" data-reading="pace" value="${esc(r.pace || paceFor(r))}"></label><p>Adjust this to your pace. <a href="https://sass.queensu.ca/resources/online/reading" target="_blank" rel="noopener">Queen’s reading guidance</a></p></details></details><div class="reading-actions"><button type="button" data-use-estimate hidden>Use suggested time</button><button type="button" data-split-reading hidden></button></div></section>`;
  }
  function mount(host, task, options) {
    const box=host.querySelector('.reading-fields'), title=options.title, duration=options.duration;
    const durationField=duration.closest('label');
    const details=box.querySelector('.reading-options'), paceDetails=box.querySelector('.reading-advanced');
    if(task.id) [details,paceDetails].forEach(node=>node.addEventListener('toggle',()=>editorState.set(task.id,{open:details.open,pace:paceDetails.open})));
    let r={...(task.reading || {})}, editingDuration=false, paceOverride=Number(task.reading?.pace)>0;
    if (!r.manual && (task.time || (task.plannedMinutes && task.plannedMinutes !== r.autoMinutes))) r.manual=true;
    function read() { box.querySelectorAll('[data-reading]').forEach(n=>{if(n.dataset.reading!=='pace')r[n.dataset.reading]=n.value;});if(paceOverride)r.pace=box.querySelector('[data-reading="pace"]').value;else delete r.pace;return r; }
    function update() {
      const text=title.value, e=estimate(text,read());
      box.hidden=!parse(text);
      box.querySelectorAll('[data-count]').forEach(n=>n.hidden=r.pageMode!=='count');
      box.querySelectorAll('[data-range]').forEach(n=>n.hidden=r.pageMode!=='range');
      box.querySelector('[data-reading-summary]').textContent=e?.invalid?'Check the page range':e?.minutes?`${e.pages} pages`:'How many pages?';
      const shownMinutes = r.manual ? Number(duration.value) : e?.minutes;
      const paceLabel=box.querySelector('[data-pace-label]');if(paceLabel)paceLabel.textContent=learnedPace?`Your pace · ${learnedPace.pace} min/page from ${learnedPace.sampleCount} completed readings`:'Minutes per page';
      box.querySelector('[data-manual-duration]').textContent=shownMinutes ? timeLabel(shownMinutes) : 'Set time';
      box.querySelector('[data-manual-duration]').setAttribute('aria-label',`${shownMinutes ? timeLabel(shownMinutes) + '. ' : ''}Change reading duration`);
      if(durationField) durationField.hidden=!!parse(text) && !editingDuration;
      box.querySelector('[data-use-estimate]').hidden=!r.manual || !e?.minutes;
      const split=box.querySelector('[data-split-reading]');
      split.hidden=!e?.splits?.length || (r.manual && Number(duration.value)>0 && Number(duration.value)<=90);
      split.textContent=e?.splits?.length?`Split into 2 sessions · ${e.splits.map(s=>timeLabel(s.minutes)).join(' + ')}`:'';
      if (!r.manual && (parse(text) || r.autoMinutes)) { duration.value=e?.minutes || ''; r.autoMinutes=e?.minutes || null; }
    }
    title.addEventListener('input',update);
    duration.addEventListener('input',()=>{r.manual=true; update();});
    duration.addEventListener('blur',()=>{editingDuration=false;update();});
    box.querySelector('[data-reading="pace"]').addEventListener('input',()=>{paceOverride=true;update();});
    box.addEventListener('input',update);
    box.querySelector('[data-manual-duration]').onclick=()=>{editingDuration=true;r.manual=true;update();duration.focus();duration.select();};
    box.querySelector('[data-use-estimate]').onclick=()=>{r.manual=false;update();};
    box.querySelector('[data-split-reading]').onclick=()=>{const e=estimate(title.value,read());if(e?.splits?.length)options.split(e.splits.map(s=>`${s.text} (${s.minutes} min)`));};
    update();
    return ()=>{ const value={...read(),manual:!!r.manual}; delete value.phase; return value; };
  }
  g.ReadingEstimates={parse,estimate,apply,learn,html,mount};
})(globalThis);
