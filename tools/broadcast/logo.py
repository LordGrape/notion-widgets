"""Command Centre logo: Broadcast's CRT with the M on its screen. Run: python tools/broadcast/logo.py
Rewrites the inline badges in apps/assistant/index.html, the theme variables in styles.css and the SVG icons.
Then render the PNGs (see the Logo section of tools/broadcast/README.md)."""
import os, re, json
APP = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'assistant'))
LIGHT = dict(tileA='#f4efff', tileB='#d9ccff', tvA='#453d63', tvB='#1e1833', rim='#8a7bc4', scrA='#3b2085', scrB='#130a2c',
             m='#ffffff', glow='#b69cff', ant='#2b2640', orb='#7c3aed', knob='#b69cff')
DARK = dict(tileA='#2c2150', tileB='#0f0a1d', tvA='#ece6ff', tvB='#b5a6ef', rim='#ffffff', scrA='#3a1f80', scrB='#0e0624',
            m='#ffffff', glow='#b69cff', ant='#d9ccff', orb='#ffffff', knob='#6f50d1')
M = 'M19 44V29.5l10.5 10 10.5-10V44'

def body(id, c, tile_rx=18, animated=True):
    k = (lambda n: c(n))
    cls = (lambda n: f' class="{n}"') if animated else (lambda n: '')
    return (
        f'<defs><linearGradient id="{id}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:{k("tileA")}"/><stop offset="1" style="stop-color:{k("tileB")}"/></linearGradient>'
        f'<linearGradient id="{id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:{k("tvA")}"/><stop offset="1" style="stop-color:{k("tvB")}"/></linearGradient>'
        f'<radialGradient id="{id}s" cx=".5" cy=".4" r=".8"><stop offset="0" style="stop-color:{k("scrA")}"/><stop offset="1" style="stop-color:{k("scrB")}"/></radialGradient></defs>'
        f'<rect width="64" height="64"{f" rx={chr(34)}{tile_rx}{chr(34)}" if tile_rx else ""} fill="url(#{id}t)"/>'
        f'<g{cls("lg-ant")}><path d="M32 18 22 6M32 18 42 7" style="stroke:{k("ant")}" stroke-width="3.2" stroke-linecap="round" fill="none"/>'
        f'<circle{cls("lg-orb")} cx="22" cy="5.6" r="3.2" style="fill:{k("orb")}"/><circle{cls("lg-orb lg-orb2") if animated else ""} cx="42" cy="6.6" r="3.2" style="fill:{k("orb")}"/></g>'
        f'<rect x="6" y="17" width="52" height="41" rx="12" fill="url(#{id}b)"/>'
        f'<rect x="6.5" y="17.5" width="51" height="40" rx="11.5" fill="none" style="stroke:{k("rim")}" stroke-opacity=".5"/>'
        f'<path d="M11.5 27c0-5 3.5-9 8.5-9h14" stroke="#fff" stroke-opacity=".38" stroke-width="2" fill="none" stroke-linecap="round"/>'
        f'<rect x="12" y="23" width="35" height="29" rx="8" fill="url(#{id}s)"/>'
        f'<g{cls("lg-m")} fill="none" stroke-linejoin="round" stroke-linecap="round">'
        f'<path{cls("lg-glow")} d="{M}" style="stroke:{k("glow")}" stroke-width="9" stroke-opacity=".35"/>'
        + (f'<path{cls("lg-cyan")} d="{M}" stroke="#33e1ff" stroke-width="5.6"/><path{cls("lg-magenta")} d="{M}" stroke="#ff4fd0" stroke-width="5.6"/>' if animated else '')
        + f'<path{cls("lg-main")} d="{M}" style="stroke:{k("m")}" stroke-width="5.6"/></g>'
        f'<circle{cls("lg-knob")} cx="52.5" cy="32" r="2.4" style="fill:{k("knob")}"/><circle{cls("lg-knob lg-knob2") if animated else ""} cx="52.5" cy="41" r="2.4" style="fill:{k("knob")}"/>'
    )

var = lambda n: f'var(--lg-{n})'
static = lambda pal: (lambda n: pal[n])

def vars_css(pal, sel):
    return sel + '{' + ''.join(f'--lg-{k}:{v};' for k, v in pal.items()) + '}'

def inline(id):
    return f'<svg class="logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">{body(id, var)}</svg>'

# ---- index.html: both badges --------------------------------------------------
p = os.path.join(APP, 'index.html')
s = open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
a = s.replace('\r\n', '\n')
found = re.findall(r'<svg class="logo".*?</svg>', a, flags=re.S)
assert len(found) == 2, len(found)
for i, old in enumerate(found):
    a = a.replace(old, inline('lg' + 'ab'[i]), 1)
open(p, 'w', encoding='utf-8', newline='').write(a.replace('\n', '\r\n') if crlf else a)

# ---- styles.css: theme variables ----------------------------------------------
c = os.path.join(APP, 'styles.css')
t = open(c, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in t else '\n'
b = t.replace('\r\n', '\n')
b = re.sub(r'/\* logo theme start \*/.*?/\* logo theme end \*/\n?', '', b, flags=re.S)
b = b.rstrip() + '\n/* logo theme start */\n' + vars_css(LIGHT, '.brand-mark') + '\n' + vars_css(DARK, ':root[data-theme="dark"] .brand-mark') + '\n/* logo theme end */\n'
b = b.replace('''.logo .lg-orb { animation''', '''.logo .lg-orb { animation''')
open(c, 'w', encoding='utf-8', newline='').write(b.replace('\n', nl))

# ---- standalone icons ---------------------------------------------------------
themed = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Command Centre</title><style>'
          + vars_css(LIGHT, ':root') + '@media (prefers-color-scheme: dark){' + vars_css(DARK, ':root') + '}</style>'
          + body('ic', var, animated=False) + '</svg>\n')
open(os.path.join(APP, 'icon.svg'), 'w', encoding='utf-8', newline='\n').write(themed)
dark_static = static(DARK)
open(os.path.join(APP, 'icon-dark.svg'), 'w', encoding='utf-8', newline='\n').write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Command Centre</title>' + body('id', dark_static, animated=False) + '</svg>\n')
open(os.path.join(APP, 'icon-light.svg'), 'w', encoding='utf-8', newline='\n').write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Command Centre</title>' + body('il', static(LIGHT), animated=False) + '</svg>\n')
open(os.path.join(APP, 'icon-maskable.svg'), 'w', encoding='utf-8', newline='\n').write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Command Centre</title><rect width="64" height="64" fill="url(#imt)"/>'
    '<g transform="translate(7 7) scale(.78)">' + body('im', dark_static, tile_rx=0, animated=False).replace('<rect width="64" height="64" fill="url(#imt)"/>', '') + '</g></svg>\n')
print('built')
