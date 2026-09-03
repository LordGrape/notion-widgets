import fs from 'node:fs';

const file = 'todo.html';
let source = fs.readFileSync(file, 'utf8');
const link = '<link rel="stylesheet" href="theme-upgrade.css?v=20260817-royal-violet">';
const marker = 'TODO SCHEDULE-MATCHED GLASS v1';

const override = `${link}
<style id="todo-schedule-visual-v1">
/* TODO SCHEDULE-MATCHED GLASS v1
   Clean royal-violet glass, intentionally matching timetable.html. */
:root{
  --todo-canvas:#faf8ff;
  --todo-surface:rgba(255,255,255,.72);
  --todo-surface-2:rgba(250,247,255,.55);
  --todo-surface-3:rgba(124,58,237,.05);
  --todo-line:rgba(124,58,237,.10);
  --todo-line-strong:rgba(124,58,237,.18);
  --todo-highlight:rgba(255,255,255,.5);
  --todo-shadow:0 20px 55px rgba(76,29,149,.13),0 2px 8px rgba(76,29,149,.05);
  --todo-shadow-lift:0 28px 70px rgba(76,29,149,.17),0 4px 12px rgba(76,29,149,.06);
}
@media (prefers-color-scheme:dark){
  :root{
    --todo-canvas:#0a0713;
    --todo-surface:rgba(26,19,41,.66);
    --todo-surface-2:rgba(36,26,56,.45);
    --todo-surface-3:rgba(167,139,250,.07);
    --todo-line:rgba(167,139,250,.11);
    --todo-line-strong:rgba(167,139,250,.20);
    --todo-highlight:rgba(255,255,255,.07);
    --todo-shadow:0 22px 60px rgba(0,0,0,.45),0 2px 10px rgba(0,0,0,.25);
    --todo-shadow-lift:0 30px 80px rgba(0,0,0,.55),0 4px 14px rgba(0,0,0,.3);
  }
}
html,body{
  font-family:'Inter',system-ui,sans-serif!important;
  background:
    radial-gradient(60% 45% at 15% -5%,rgba(139,92,246,.16),transparent 60%),
    radial-gradient(50% 40% at 95% 10%,rgba(168,85,247,.10),transparent 60%),
    radial-gradient(70% 60% at 50% 110%,rgba(124,58,237,.08),transparent 65%),
    var(--todo-canvas)!important;
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;opacity:.5;
  background-image:radial-gradient(rgba(139,92,246,.10) .6px,transparent .6px);
  background-size:24px 24px;
  -webkit-mask-image:radial-gradient(70% 70% at 50% 45%,#000,transparent);
  mask-image:radial-gradient(70% 70% at 50% 45%,#000,transparent);
}
#card{
  background:linear-gradient(160deg,var(--todo-surface),var(--todo-surface-2))!important;
  border:1px solid var(--todo-line)!important;
  border-radius:26px!important;
  box-shadow:var(--todo-shadow),inset 0 1px 0 var(--todo-highlight)!important;
  backdrop-filter:blur(26px) saturate(1.35)!important;
  -webkit-backdrop-filter:blur(26px) saturate(1.35)!important;
}
#card::before,#card::after{
  content:none!important;display:none!important;background:none!important;
}
#card:hover{
  border-color:var(--todo-line-strong)!important;
  box-shadow:var(--todo-shadow-lift),inset 0 1px 0 var(--todo-highlight)!important;
}
.stats,.item,.tabs,.add input,.composer .chip,.editor,.e-title,.e-notes,.eopt,.emove,.sub-add,.tbox select,.tbox input,.tag{
  background:var(--todo-surface-3)!important;
  border-color:var(--todo-line)!important;
}
.item.editing{background:var(--todo-surface)!important;border-color:var(--todo-line-strong)!important}
</style>`;

if (!source.includes(marker)) {
  if (!source.includes(link)) throw new Error('Theme link was not found in todo.html');
  source = source.replace(link, override);
}

const animatedBackground = '    if (window.initBackground) try { initBackground("bg", {}); } catch (e) {}\n';
if (source.includes(animatedBackground)) {
  source = source.replace(animatedBackground, '    /* Static schedule-matched backdrop replaces the continuous texture animation. */\n');
}

if (!source.includes(marker)) throw new Error('Visual consistency marker missing');
if (!source.includes('#card::before,#card::after')) throw new Error('Texture overlay override missing');
if (source.includes('initBackground("bg"')) throw new Error('Continuous textured background is still enabled');

fs.writeFileSync(file, source);
console.log('Applied clean schedule-matched styling to todo.html');
