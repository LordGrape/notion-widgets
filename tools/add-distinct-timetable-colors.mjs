import fs from 'node:fs';

const file='timetable.html';
let source=fs.readFileSync(file,'utf8');
function replaceOnce(oldStr,newStr,label){
  const count=source.split(oldStr).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  source=source.replace(oldStr,newStr);
}

if(!source.includes('DISTINCT TIMETABLE PALETTE v2')){
  replaceOnce(
    "/* DISTINCT TIMETABLE PALETTE v1: twelve balanced hues, no near-duplicate light variants. */\nvar COLORS=['#8b5cf6','#c026d3','#db2777','#e11d48','#b91c1c','#ea580c','#b45309','#65a30d','#15803d','#0f766e','#0284c7','#4f46e5'];\nvar COLOR_NAMES=['Violet','Fuchsia','Pink','Rose','Red','Orange','Amber','Lime','Green','Teal','Sky','Indigo'];",
    "/* DISTINCT TIMETABLE PALETTE v2: eleven evenly separated hues. */\nvar COLORS=['#8b5cf6','#a21caf','#be123c','#991b1b','#c2410c','#a16207','#4d7c0f','#047857','#0e7490','#1d4ed8','#4338ca'];\nvar COLOR_NAMES=['Violet','Fuchsia','Rose','Red','Orange','Gold','Olive','Emerald','Cyan','Blue','Indigo'];",
    'Diverse eleven-colour palette'
  );
  replaceOnce(
    "if(selColor&&palette.indexOf(selColor)<0)palette.unshift(selColor);",
    "if(selColor&&palette.indexOf(selColor)<0)palette[palette.length-1]=selColor;",
    'Fixed-size legacy colour support'
  );
}

if(!source.includes('DISTINCT TIMETABLE PALETTE v2'))throw new Error('Palette v2 marker missing');
if(!source.includes('selColor=nextAvailableColor()'))throw new Error('Automatic colour selection missing');
if(source.includes("palette.unshift(selColor)"))throw new Error('Legacy colours can still expand the palette');
fs.writeFileSync(file,source);
console.log('Applied more diverse eleven-colour timetable palette');
