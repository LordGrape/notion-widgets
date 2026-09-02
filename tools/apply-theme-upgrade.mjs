import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const widgets = ['clock.html', 'todo.html', 'timetable.html', 'quotes.html', 'athlete.source.html'];
const link = '<link rel="stylesheet" href="theme-upgrade.css?v=20260817-royal-violet">';

for (const file of widgets) {
  if (!existsSync(file)) continue;
  let html = readFileSync(file, 'utf8');
  html = html.replace(/<link rel="stylesheet" href="theme-upgrade\.css[^>]*>\n?/g, '');
  const settingsLink = /<link rel="stylesheet" href="athlete-settings\.css[^>]*>/;
  if (file === 'athlete.source.html' && settingsLink.test(html)) {
    html = html.replace(settingsLink, `${link}\n$&`);
  } else {
    html = html.replace('</head>', `${link}\n</head>`);
  }
  writeFileSync(file, html);
}

let css = readFileSync('theme-upgrade.css', 'utf8');
const marker = '/* FORCEFUL ROYAL VIOLET ROLLOUT */';
const forceful = `${marker}
:root {
  --lg-canvas: #f7f3ff;
  --lg-surface: rgba(255, 255, 255, 0.66);
  --lg-surface-raised: rgba(255, 255, 255, 0.86);
  --lg-surface-soft: rgba(139, 92, 246, 0.105);
  --lg-ink: #24182f;
  --lg-ink-muted: rgba(36, 24, 47, 0.68);
  --lg-ink-faint: rgba(36, 24, 47, 0.46);
  --lg-violet: #7c3aed;
  --lg-violet-2: #a855f7;
  --lg-violet-3: #c084fc;
  --lg-border: rgba(124, 58, 237, 0.22);
  --lg-border-strong: rgba(124, 58, 237, 0.42);
  --lg-glow: rgba(124, 58, 237, 0.22);
  --lg-shadow: 0 18px 54px rgba(42, 23, 76, 0.16);
  --lg-shadow-hover: 0 24px 72px rgba(42, 23, 76, 0.22);
}
@media (prefers-color-scheme: dark) {
  :root {
    --lg-canvas: #0f0b15;
    --lg-surface: rgba(27, 20, 38, 0.72);
    --lg-surface-raised: rgba(35, 27, 50, 0.90);
    --lg-surface-soft: rgba(167, 139, 250, 0.13);
    --lg-ink: rgba(255, 255, 255, 0.94);
    --lg-ink-muted: rgba(255, 255, 255, 0.68);
    --lg-ink-faint: rgba(255, 255, 255, 0.46);
    --lg-violet: #c4b5fd;
    --lg-violet-2: #a78bfa;
    --lg-violet-3: #8b5cf6;
    --lg-border: rgba(196, 181, 253, 0.24);
    --lg-border-strong: rgba(196, 181, 253, 0.46);
    --lg-glow: rgba(167, 139, 250, 0.24);
    --lg-shadow: 0 18px 60px rgba(0, 0, 0, 0.46);
    --lg-shadow-hover: 0 26px 82px rgba(0, 0, 0, 0.58);
  }
}
html, body {
  background:
    radial-gradient(75% 65% at 85% 4%, rgba(168, 85, 247, 0.24), transparent 58%),
    radial-gradient(60% 55% at 10% 95%, rgba(124, 58, 237, 0.16), transparent 60%),
    linear-gradient(145deg, var(--lg-canvas), color-mix(in srgb, var(--lg-canvas) 88%, var(--lg-violet) 12%)) !important;
}
.container, .card {
  background:
    linear-gradient(145deg, rgba(255,255,255,0.20), transparent 36%),
    linear-gradient(180deg, var(--lg-surface-raised), var(--lg-surface)) !important;
  border: 1px solid var(--lg-border-strong) !important;
  border-radius: 22px !important;
  box-shadow: var(--lg-shadow), 0 0 44px var(--lg-glow), inset 0 1px 0 rgba(255,255,255,0.18) !important;
  backdrop-filter: blur(28px) saturate(1.55) !important;
  -webkit-backdrop-filter: blur(28px) saturate(1.55) !important;
}
.container::after, .card::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(135deg, rgba(255,255,255,.26), transparent 28%, rgba(168,85,247,.12) 72%, transparent),
    repeating-radial-gradient(circle at 20% 30%, rgba(255,255,255,.16) 0 1px, transparent 1px 6px);
  opacity: .42;
  mix-blend-mode: overlay;
}
.container:hover, .card:hover {
  box-shadow: var(--lg-shadow-hover), 0 0 70px var(--lg-glow), inset 0 1px 0 rgba(255,255,255,0.22) !important;
}
.title, .time-display, .session-time, .quote .word, .forecast-now-temp, .break-timer-display {
  background: linear-gradient(135deg, var(--lg-ink) 0%, var(--lg-violet) 36%, var(--lg-violet-2) 54%, var(--lg-violet-3) 72%, var(--lg-ink) 100%) !important;
  background-size: 180% 180% !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
}
.label, .greeting, .date, .clock-countdown, .presence-stat, .focus-stats, .book, .class-meta, .status, .footer-text, .stats-label, .sync, .tag, .meta {
  color: var(--lg-ink-faint) !important;
}
.author, .stats-num, .txt, .class-name, .panel-title, .week-detail-name, .forecast-now-cond, .s-item-val, .weather-temp {
  color: var(--lg-ink) !important;
}
.stats, .item, .class-block, .week-track, .course-item, .add-form, .s-item, .forecast-now, .tabs, .view-toggle, .mode-toggle, .presets, .weather, .chip, .tag, input, textarea {
  background: var(--lg-surface-soft) !important;
  border-color: var(--lg-border) !important;
}
.item, .class-block, .stats, .week-track, .course-item, .add-form, .s-item, .forecast-now, input, textarea {
  border-radius: 15px !important;
}
.tab.on, .mode-btn.active, .view-btn.active, .ctrl-primary, .preset-chip.active, .add button, .day-dot.active, .chip.set, .form-btn-primary, .s-btn.add, .box.on {
  background: linear-gradient(135deg, var(--lg-violet), var(--lg-violet-2)) !important;
  color: white !important;
  box-shadow: 0 10px 28px var(--lg-glow) !important;
}
.class-block.active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--course-color, var(--lg-violet)) 20%, var(--lg-surface-soft)), var(--lg-surface-soft)) !important;
  border-color: color-mix(in srgb, var(--course-color, var(--lg-violet)) 55%, var(--lg-border)) !important;
  box-shadow: 0 0 34px color-mix(in srgb, var(--course-color, var(--lg-violet)) 32%, transparent) !important;
}
button:hover, .item:hover, .class-block:hover, .week-pill:hover, .chip:hover, .tag:hover {
  transform: translateY(-1px) !important;
}
@media (prefers-reduced-motion: no-preference) {
  .container, .card { transition: transform 220ms var(--lg-ease), box-shadow 220ms var(--lg-ease), border-color 220ms var(--lg-ease) !important; }
  .class-block.active { animation-duration: 4.8s !important; }
}
`;
if (css.includes(marker)) {
  css = css.slice(0, css.indexOf(marker)).trimEnd() + '\n\n' + forceful;
} else {
  css = css.trimEnd() + '\n\n' + forceful;
}
writeFileSync('theme-upgrade.css', css + '\n');
