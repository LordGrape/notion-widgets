import fs from 'node:fs';

const path='tools/apply-adaptive-weekly-targets-v1.mjs';
let source=fs.readFileSync(path,'utf8');

function replaceCall(variable,label,oldStr,newStr){
  const endToken=`'${label}');`;
  const labelAt=source.indexOf(endToken);
  if(labelAt<0)throw new Error(`Installer call not found: ${label}`);
  const startToken=`\n  ${variable}=replaceOnce`;
  const startAt=source.lastIndexOf(startToken,labelAt);
  if(startAt<0)throw new Error(`Installer call start not found: ${label}`);
  const endAt=labelAt+endToken.length;
  const statement=`\n  ${variable}=replaceOnce(${variable},${JSON.stringify(oldStr)},${JSON.stringify(newStr)},${JSON.stringify(label)});`;
  source=source.slice(0,startAt)+statement+source.slice(endAt);
}

replaceCall('action','Default target placeholder','Optional, e.g. brief cases 4–6','Optional fallback');
replaceCall('action','Default target helper id','class="ab-plan-help">Leave blank if it changes.','class="ab-plan-help" id="fOutcomeHelp">Leave blank if it changes.');
replaceCall('timetable','Week tooltip target',
  "+(item.description?'<div class=\"tip-detail\">'+esc(item.description)+'</div>':'');",
  "+(item.outcomeGoal?'<div class=\"tip-detail\"><b>Target</b> · '+esc(item.outcomeGoal)+'</div>':'')+(item.description?'<div class=\"tip-detail\">'+esc(item.description)+'</div>':'');"
);
replaceCall('timetable','Day card target',
  "+(c.description?'<span class=\"d-item\">'+esc(c.description)+'</span>':'')",
  "+(c.outcomeGoal?'<span class=\"d-item\">Target <b>'+esc(c.outcomeGoal)+'</b></span>':'')\n      +(c.description?'<span class=\"d-item\">'+esc(c.description)+'</span>':'')"
);
replaceCall('timetable','Session target field',
  'placeholder="Optional"></div><div class="occ-warning" id="occWarning">',
  'placeholder="Optional"></div>\'+(actionable?\'<div class="occ-target"><label class="f-label">Session target</label><input class="f-input" id="occTarget" value="\'+esc(target)+\'" placeholder="e.g. Brief cases 4–6"><div class="occ-help">Only this dated task changes. The weekly activity stays the same.</div></div>\':\'\')+\'<div class="occ-warning" id="occWarning">'
);

fs.writeFileSync(path,source);
try{fs.unlinkSync('deployments/adaptive-target-debug.txt')}catch(e){if(e&&e.code!=='ENOENT')throw e}
console.log('Repaired adaptive target installer matching');
