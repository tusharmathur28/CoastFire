#!/usr/bin/env python3
"""One-time migration: add the PWA manifest <link> and theme-color <meta> to every real page
(Phase 6). Anchored on the <link rel="apple-touch-icon" ...> line, which is identical across every
real page. google31da07b5b71e19d0.html (Search Console verification, not a real page) is excluded.
Asserts exactly one match per file rather than silently skipping one, matching migrate_nav.py.

Usage: python scripts/add_pwa_meta.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDE = {'google31da07b5b71e19d0.html'}

ANCHOR_RE = re.compile(r'(  <link rel="apple-touch-icon" href="/?apple-touch-icon\.png">\n)')
INSERT = '  <link rel="manifest" href="/manifest.json">\n  <meta name="theme-color" content="#F6F1E4">\n'


def migrate(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    if 'rel="manifest"' in text:
        print(f'SKIP (already has manifest link): {path.relative_to(ROOT)}')
        return
    new_text, n = ANCHOR_RE.subn(lambda m: m.group(1) + INSERT, text, count=1)
    if n != 1:
        raise SystemExit(f'FAILED (anchor not matched exactly once): {path}')
    path.write_text(new_text, encoding='utf-8')
    print(f'OK   {path.relative_to(ROOT)}')


def main():
    pages = [p for p in ROOT.glob('**/*.html') if p.name not in EXCLUDE]
    for p in sorted(pages):
        migrate(p)
    print(f'\n{len(pages)} pages processed.')


if __name__ == '__main__':
    main()
