import fs from 'node:fs';

const file='timetable.html';
let source=fs.readFileSync(file,'utf8');
function replaceOnce(oldStr,newStr,label){
  const count=source.split(oldStr).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  source=source.replace(oldStr,newStr);
}

if(!source.includes('DISTINCT TIMETABLE PALETTE v1')){
  replaceOnce(
    "var COLORS=['#8b5cf6','#a855f7','#6366f1','#0ea5e9','#10b981','#84cc16','#f59e0b','#ef4444','#ec4899','#c084fc'];",
    "/* DISTINCT TIMETABLE PALETTE v1: twelve balanced hues, no near-duplicate light variants. */\nvar COLORS=['#8b5cf6','#c026d3','#db2777','#e11d48','#b91c1c','#ea580c','#b45309','#65a30d','#15803d','#0f766e','#0284c7','#4f46e5'];\nvar COLOR_NAMES=['Violet','Fuchsia','Pink','Rose','Red','Orange','Amber','Lime','Green','Teal','Sky','Indigo'];",
    'Colour palette'
  );
  replaceOnce(
    "function durStr(a,b){var d=mins(b)-mins(a),h=Math.floor(d/60),m=d%60;return h?(h+'h'+(m?' '+m+'m':'')):(m+'m')}",
    "function durStr(a,b){var d=mins(b)-mins(a),h=Math.floor(d/60),m=d%60;return h?(h+'h'+(m?' '+m+'m':'')):(m+'m')}\nfunction colourName(c){var i=COLORS.indexOf(c);return i>=0?COLOR_NAMES[i]:'Current colour'}\nfunction nextAvailableColor(){var use=COLORS.map(function(){return 0});schedule.forEach(function(block){var i=COLORS.indexOf(block&&block.color);if(i>=0)use[i]++});var least=Math.min.apply(null,use);return COLORS[use.indexOf(least)]}",
    'Automatic distinct colour selection'
  );
  const resets=source.split('editingId=null;selDays={};selColor=COLORS[0];').length-1;
  if(resets!==3)throw new Error(`Colour resets: expected three matches, found ${resets}`);
  source=source.replaceAll('editingId=null;selDays={};selColor=COLORS[0];','editingId=null;selDays={};selColor=nextAvailableColor();');
  replaceOnce(
    "    var sw=$('fSw');\n    sw.innerHTML=COLORS.map(function(c){return '<button type=\"button\" class=\"sw'+(c===selColor?' on':'')+'\" style=\"background:'+c+';--c:'+c+'\" data-c=\"'+c+'\" aria-label=\"Colour '+c+'\"></button>'}).join('');",
    "    var sw=$('fSw'),palette=COLORS.slice();\n    if(selColor&&palette.indexOf(selColor)<0)palette.unshift(selColor);\n    sw.innerHTML=palette.map(function(c){var label=colourName(c);return '<button type=\"button\" class=\"sw'+(c===selColor?' on':'')+'\" style=\"background:'+c+';--c:'+c+'\" data-c=\"'+c+'\" aria-label=\"'+esc(label)+'\" title=\"'+esc(label)+'\"></button>'}).join('');",
    'Named colour swatches with legacy colour support'
  );
}

if(!source.includes('DISTINCT TIMETABLE PALETTE v1'))throw new Error('Palette marker missing');
if(!source.includes('selColor=nextAvailableColor()'))throw new Error('Automatic colour selection missing');
fs.writeFileSync(file,source);
console.log('Applied distinct timetable colour palette');
