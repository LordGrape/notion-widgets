# Custom Notion Widgets

## About This Project

A collection of custom, self-hosted HTML widgets designed to transform a Notion workspace into a modern, aesthetically cohesive environment. Each widget is a single HTML file hosted on GitHub Pages and embedded into Notion via `/embed` blocks.

### Philosophy

Notion is a powerful workspace, but its default components can feel utilitarian. These widgets fill the visual gaps: a live clock, a daily quote, a focus timer. They make the workspace feel intentional and personal without sacrificing function.

Every widget follows a strict, unified design system so they look like they belong together, not like five different tools stitched onto a page.

### Design System

All widgets share the following design tokens. Any new widget must use these exact values to maintain visual consistency.

**Colour Scheme (Notion-Native)**

| Token | Light Mode | Dark Mode | Purpose |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#191919` | Background (matches Notion) |
| `--text` | `#37352f` | `#ffffffcf` | Primary text |
| `--sub` | `#787774` | `#ffffff73` | Secondary/muted text |
| `--accent` | `#d3d1cb` | `#ffffff1a` | Dividers, progress bars, subtle UI |

These colours are applied via CSS custom properties in `:root` and toggled automatically with `@media (prefers-color-scheme: dark)`. Widgets seamlessly match Notion's light and dark modes with zero manual switching.

**Typography**

- Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` (matches Notion's native font)
- Responsive sizing via `clamp()` so widgets scale within any embed size
- `font-variant-numeric: tabular-nums` for any numerical displays (prevents layout jitter)
- Uppercase `letter-spacing: 0.03-0.05em` for secondary/label text

**Shared Patterns**

- CSS reset: `*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }`
- Flexbox centring: `display: flex; align-items: center; justify-content: center; min-height: 100vh;`
- Fade-in on load: `opacity: 0; animation: fadeIn 1s ease forwards;`
- No text selection: `user-select: none; -webkit-user-select: none;`
- 2px accent divider/progress bar as a subtle visual anchor

### Guidelines for New Widgets

1. **Use the design tokens above.** Copy the `:root` and `@media (prefers-color-scheme: dark)` block verbatim into every new widget.
2. **Single-file only.** Each widget must be one self-contained `.html` file. No external CSS, JS, or image dependencies.
3. **Responsive.** Use `clamp()` for font sizes and percentage-based widths. Widgets must look good at any aspect ratio since Notion embeds are freely resizable.
4. **Minimal.** Favour clean negative space over dense UI. These are dashboard accents, not full applications.
5. **No frameworks.** Vanilla HTML, CSS, and JavaScript only. Keeps files small, fast, and dependency-free.
6. **Test in both modes.** Always verify light and dark appearance before committing.
