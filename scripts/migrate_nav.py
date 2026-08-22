#!/usr/bin/env python3
"""One-time migration: replace the old flat page-nav header with the new sticky site-bar +
mobile drawer (Phase 3 menu redesign). Rewrites every page's <header> block and, on tool/guide
pages, promotes the tool-header's <h2> to <h1> (the site-bar now carries the brand, so the tool
name becomes the page's real heading). Asserts success per file rather than silently skipping one.

Usage: python scripts/migrate_nav.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DRAWER_HTML = '''
    <div id="mobileDrawer" class="drawer-root" hidden>
      <div class="drawer-backdrop"></div>
      <div class="drawer" role="dialog" aria-modal="true" aria-label="Site menu" tabindex="-1"></div>
    </div>
'''

BAR_INNER = '''      <a class="brand" href="/" aria-label="Two Currencies, One Number — home">
        <span class="chip ca">CA</span><span class="brand-plus">+</span><span class="chip us">US</span>
        <span class="brand-name">Two&nbsp;Currencies</span>
      </a>

      <nav class="site-nav" aria-label="Main">
        <div class="nav-dd">
          <button type="button" id="toolsMenuBtn" class="nav-item" aria-expanded="false" aria-controls="toolsPanel">Tools ▾</button>
          <div id="toolsPanel" class="mega-panel" hidden></div>
        </div>
        <a class="nav-item" href="/guides">Guides</a>
      </nav>

      <div class="bar-actions">
        <button type="button" class="bar-btn" id="searchToolsBtn" title="Search tools (Ctrl/Cmd+K)"><span class="icon" data-icon="search" aria-hidden="true">\U0001F50D</span><span class="btn-search-label"> Search</span> <kbd>⌘K</kbd></button>
        <button type="button" class="bar-btn icon-btn" id="themeToggle" aria-label="Switch to dark mode"><span class="icon" data-icon="moon" aria-hidden="true">\U0001F319</span></button>
        <button type="button" class="bar-btn icon-btn nav-toggle" id="navToggleBtn" aria-expanded="false" aria-controls="mobileDrawer" aria-label="Menu"><span class="icon" data-icon="menu" aria-hidden="true">☰</span></button>
      </div>
'''

COMPACT_HEADER_RE = re.compile(r'[ \t]*<header class="compact">.*?</header>\n?', re.DOTALL)
TOOL_H2_RE = re.compile(r'<h2><span class="tool-icon">(.*?)</h2>')

def build_compact_bar():
    return f'    <header class="site-bar site-bar-inner">\n{BAR_INNER}    </header>\n{DRAWER_HTML}'

def migrate_compact_page(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    new_text, n = COMPACT_HEADER_RE.subn(build_compact_bar(), text, count=1)
    if n != 1:
        raise SystemExit(f'FAILED (header not matched exactly once): {path}')
    new_text, hn = TOOL_H2_RE.subn(lambda m: f'<h1><span class="tool-icon">{m.group(1)}</h1>', new_text, count=1)
    if hn != 1:
        raise SystemExit(f'FAILED (tool-header h2 not matched exactly once): {path}')
    path.write_text(new_text, encoding='utf-8')
    print(f'OK   {path.relative_to(ROOT)}')

def migrate_homepage(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    old_header_re = re.compile(r'    <header>.*?</header>\n', re.DOTALL)
    m = old_header_re.search(text)
    if not m:
        raise SystemExit(f'FAILED (homepage <header> not found): {path}')
    hero = (
        '    <section class="hero">\n'
        '      <div class="eyebrow">\n'
        '        <span class="chip ca">CA</span><span>+</span><span class="chip us">US</span>\n'
        '        <span>&nbsp;·&nbsp;Cross-border planning</span>\n'
        '      </div>\n'
        '      <h1>Two Currencies,<br>One Number</h1>\n'
        '      <p class="sub">Financial planning tools for Canadians living and investing in the United States — CoastFIRE\n'
        '        retirement math, departure tax, RRSP withholding, benefit timing, and moving back, all tracking your\n'
        '        accounts in their native currencies.</p>\n'
        '      <div class="hero-steps">\n'
        '        <div class="hs-step">\n'
        '          <span class="hs-num">1</span>\n'
        '          <span class="hs-text">Enter your CAD + USD accounts</span>\n'
        '        </div>\n'
        '        <span class="hs-arrow">→</span>\n'
        '        <div class="hs-step">\n'
        '          <span class="hs-num">2</span>\n'
        '          <span class="hs-text">See one retirement number</span>\n'
        '        </div>\n'
        '        <span class="hs-arrow">→</span>\n'
        '        <div class="hs-step">\n'
        '          <span class="hs-num">3</span>\n'
        '          <span class="hs-text">Get your action items</span>\n'
        '        </div>\n'
        '      </div>\n'
        '      <a href="/coastfire-calculator" class="hero-cta">Calculate your CoastFIRE number →</a>\n'
        '      <div class="trust-badges">\n'
        '        <span class="trust-badge">Local-only</span>\n'
        '        <span class="trust-badge">Open-source</span>\n'
        '        <span class="trust-badge">No account</span>\n'
        '        <span class="trust-badge">No ads</span>\n'
        '      </div>\n'
        '    </section>\n'
    )
    new_bar = f'    <header class="site-bar site-bar-inner">\n{BAR_INNER}    </header>\n{DRAWER_HTML}'
    text = text[:m.start()] + new_bar + text[m.end():]
    # Insert the hero section as the first thing inside <main>.
    main_re = re.compile(r'(<main>\n)')
    text, mn = main_re.subn(lambda m2: m2.group(1) + hero, text, count=1)
    if mn != 1:
        raise SystemExit(f'FAILED (homepage <main> not found for hero insertion): {path}')
    path.write_text(text, encoding='utf-8')
    print(f'OK   {path.relative_to(ROOT)}  (homepage variant)')

def main():
    compact_pages = [
        'action-items.html', 'benefit-timing.html', 'coastfire-calculator.html',
        'compare-scenarios.html', 'departure-tax.html', 'drawdown-optimizer.html',
        'moving-back.html', 'rrsp-withholding.html',
        'guides/index.html', 'guides/canada-departure-tax-explained.html',
        'guides/coastfire-cross-border-canadians.html', 'guides/cpp-oas-social-security-cross-border.html',
        'guides/moving-back-to-canada-from-us-taxes.html', 'guides/retirement-drawdown-order-rrsp-401k.html',
        'guides/rrsp-withholding-tax-us-resident.html',
    ]
    migrate_homepage(ROOT / 'index.html')
    for rel in compact_pages:
        migrate_compact_page(ROOT / rel)
    print(f'\nMigrated {1 + len(compact_pages)} pages.')

if __name__ == '__main__':
    main()
