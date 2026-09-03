import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('timetable.html','utf8');
const paletteMatch=html.match(/var COLORS=(\[[^;]+\]);\nvar COLOR_NAMES=(\[[^;]+\]);/);
assert.ok(paletteMatch,'palette and colour names should be present');
const COLORS=vm.runInNewContext(paletteMatch[1]);
const NAMES=vm.runInNewContext(paletteMatch[2]);
assert.equal(COLORS.length,11,'palette should contain exactly eleven colours');
assert.equal(new Set(COLORS).size,COLORS.length,'every palette colour should be unique');
assert.equal(NAMES.length,COLORS.length,'every colour should have a name');
assert.ok(!NAMES.includes('Pink'),'the overlapping pink option should be removed');

function rgb(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
function distance(a,b){const x=rgb(a),y=rgb(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])}
let closest=Infinity;
for(let i=0;i<COLORS.length;i++)for(let j=i+1;j<COLORS.length;j++)closest=Math.min(closest,distance(COLORS[i],COLORS[j]));
assert.ok(closest>=45,`palette colours should remain visually separated, closest RGB distance was ${closest.toFixed(1)}`);
assert.ok(html.includes('function nextAvailableColor()'),'new blocks should choose the least-used colour');
assert.ok(html.includes("palette[palette.length-1]=selColor"),'older saved colours should remain editable without adding a swatch');
assert.equal((html.match(/selColor=nextAvailableColor\(\)/g)||[]).length,3,'new, cleared, and post-save forms should rotate colours');
console.log('Diverse eleven-colour timetable tests passed');
