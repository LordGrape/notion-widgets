import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../timetable.html', import.meta.url);
let source = readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Patch anchor missing: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  '.nowline::before{content:"";position:absolute;top:1px;left:-2.5px;width:7px;height:7px;border-radius:50%;background:var(--accent-2);box-shadow:0 0 8px var(--accent-2)}\n\n/* ── Empty state',
  `.nowline::before{content:"";position:absolute;top:1px;left:-2.5px;width:7px;height:7px;border-radius:50%;background:var(--accent-2);box-shadow:0 0 8px var(--accent-2)}

.smart-tip{position:fixed;z-index:30;width:max-content;max-width:min(300px,calc(100vw - 24px));padding:12px 13px;border-radius:14px;background:linear-gradient(150deg,var(--surface),var(--surface-2));border:1px solid color-mix(in srgb,var(--tip-c) 30%,var(--line-strong));box-shadow:var(--shadow-lift),inset 0 1px 0 var(--highlight);backdrop-filter:blur(26px) saturate(1.35);-webkit-backdrop-filter:blur(26px) saturate(1.35);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(5px) scale(.98);transition:opacity .18s var(--ease),transform .22s var(--spring),visibility .18s}
.smart-tip.show{opacity:1;visibility:visible;transform:none}.tip-head{display:flex;align-items:flex-start;gap:8px}.tip-dot{width:7px;height:7px;margin-top:4px;border-radius:50%;flex:0 0 auto;background:var(--tip-c);box-shadow:0 0 10px color-mix(in srgb,var(--tip-c) 60%,transparent)}.tip-name{font-size:11.5px;font-weight:800;line-height:1.35;letter-spacing:-.1px}.tip-time{margin-top:6px;font:600 9px 'JetBrains Mono';color:var(--text-2)}.tip-detail{margin-top:5px;font-size:9.5px;font-weight:500;line-height:1.4;color:var(--text-2)}

/* ── Empty state`,
  'tooltip styles'
);

replaceOnce(
  '</div>\n\n<div class="overlay" id="overlay">',
  '</div>\n\n<div class="smart-tip" id="smartTip" role="tooltip" aria-hidden="true"></div>\n\n<div class="overlay" id="overlay">',
  'tooltip markup'
);

replaceOnce(
  'function nowMins(){var n=new Date();return n.getHours()*60+n.getMinutes()}\n\n/* ── Segmented control',
  `function nowMins(){var n=new Date();return n.getHours()*60+n.getMinutes()}
function compactLabel(c){
  var name=String(c&&c.name||'').trim(),match;
  match=name.match(/\\b([A-Z]{2,6})[\\s-]?(\\d{2,4}[A-Z]?)\\b/i);
  if(match)return(match[1]+' '+match[2]).toUpperCase();
  match=name.match(/^\\s*(\\d{2,4}[A-Z]?)\\s*[:\\-–|]/i);
  if(match)return match[1].toUpperCase();
  var rules=[[/\\b(gym|weight training|strength workout|lifting)\\b/i,'Gym'],[/\\b(ruck|rucking)\\b/i,'Ruck'],[/\\b(run|running|sprints?)\\b/i,'Run'],[/\\b(zone\\s*2)\\b/i,'Zone 2'],[/\\b(cardio)\\b/i,'Cardio'],[/\\b(mobility|stretching|recovery)\\b/i,'Recovery'],[/\\b(commute|travel)\\b/i,'Commute'],[/\\b(breakfast|lunch|dinner)\\b/i,function(m){return m[1].charAt(0).toUpperCase()+m[1].slice(1).toLowerCase()}]];
  for(var i=0;i<rules.length;i++){match=name.match(rules[i][0]);if(match)return typeof rules[i][1]==='function'?rules[i][1](match):rules[i][1]}
  name=name.split(/\\s*(?:[:|–]| - )\\s*/)[0].replace(/^introduction to\\s+/i,'').replace(/^intro to\\s+/i,'').trim();
  if(name.length<=15)return name;
  return name.split(/\\s+/).slice(0,2).join(' ');
}
var tipTimer=null;
function hideWeekTip(){clearTimeout(tipTimer);var tip=$('smartTip');if(!tip)return;tip.classList.remove('show');tip.setAttribute('aria-hidden','true')}
function showWeekTip(el,temporary){
  var day=+el.dataset.day,item=flatFor(day).find(function(x){return x.id===el.dataset.id}),tip=$('smartTip');if(!item||!tip)return;
  clearTimeout(tipTimer);tip.style.setProperty('--tip-c',item.color||COLORS[0]);
  tip.innerHTML='<div class="tip-head"><i class="tip-dot"></i><div class="tip-name">'+esc(item.name)+'</div></div><div class="tip-time">'+DAY_SHORT[day]+' · '+fmt(item.start)+'–'+fmt(item.end)+'</div>'+(item.location?'<div class="tip-detail">'+esc(item.location)+'</div>':'')+(item.description?'<div class="tip-detail">'+esc(item.description)+'</div>':'');
  tip.classList.add('show');tip.setAttribute('aria-hidden','false');
  requestAnimationFrame(function(){var r=el.getBoundingClientRect(),tr=tip.getBoundingClientRect(),left=Math.max(12,Math.min(innerWidth-tr.width-12,r.left+r.width/2-tr.width/2)),top=r.top-tr.height-9;if(top<12)top=Math.min(innerHeight-tr.height-12,r.bottom+9);tip.style.left=left+'px';tip.style.top=top+'px'});
  if(temporary)tipTimer=setTimeout(hideWeekTip,2800);
}

/* ── Segmented control`,
  'smart label and tooltip logic'
);

replaceOnce(
  `      html+='<div class="pill" style="--c:'+esc(c.color)+';left:'+l+'%;width:'+w+'%" title="'+esc(c.name)+' · '+fmt(c.start)+'\\u2013'+fmt(c.end)+(c.location?' · '+esc(c.location):'')+'">'+(w>9?esc(c.name):'')+'</div>';`,
  `      var full=c.name+' · '+fmt(c.start)+'\\u2013'+fmt(c.end)+(c.location?' · '+c.location:'');
      html+='<div class="pill" tabindex="0" role="button" data-id="'+esc(c.id)+'" data-day="'+d+'" style="--c:'+esc(c.color)+';left:'+l+'%;width:'+w+'%" aria-label="'+esc(full)+'">'+(w>5?esc(compactLabel(c)):'')+'</div>';`,
  'compact week labels'
);

replaceOnce(
  `  html+='</div>';
  main.innerHTML=html;
}

/* ── Render`,
  `  html+='</div>';
  main.innerHTML=html;
  main.querySelectorAll('.pill').forEach(function(pill){
    pill.addEventListener('mouseenter',function(){showWeekTip(pill,false)});
    pill.addEventListener('mouseleave',hideWeekTip);
    pill.addEventListener('focus',function(){showWeekTip(pill,false)});
    pill.addEventListener('blur',hideWeekTip);
    pill.addEventListener('click',function(){showWeekTip(pill,true)});
  });
}

/* ── Render`,
  'tooltip events'
);

replaceOnce(
  "function openPanel(editId){\n  if(!$('overlay').classList.contains('show'))sfx('open');",
  "function openPanel(editId){\n  hideWeekTip();\n  if(!$('overlay').classList.contains('show'))sfx('open');",
  'tooltip panel cleanup'
);

replaceOnce(
  "window.addEventListener('resize',syncSeg);",
  "window.addEventListener('resize',function(){syncSeg();hideWeekTip()});\nwindow.addEventListener('scroll',hideWeekTip,true);",
  'tooltip viewport cleanup'
);

writeFileSync(file, source);
console.log('Added smart timetable labels and styled detail tooltips.');
