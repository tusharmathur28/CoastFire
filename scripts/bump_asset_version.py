#!/usr/bin/env python3
"""Rewrite styles.css?v=... and shared.js?v=... references in every HTML page to a
hash of that asset's current content, so a stale cached copy is never served after
an edit (styles.css/shared.js are cached with a 1-year immutable Cache-Control header,
keyed only by that query string).

Run manually with `python scripts/bump_asset_version.py`, or automatically via the
pre-commit hook in .git/hooks/pre-commit.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ["styles.css", "shared.js"]


def content_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def main():
    hashes = {}
    for name in ASSETS:
        path = ROOT / name
        if not path.exists():
            continue
        hashes[name] = content_hash(path)

    changed = []
    for html_path in ROOT.glob("**/*.html"):
        text = html_path.read_text(encoding="utf-8")
        original = text
        for name, digest in hashes.items():
            escaped = re.escape(name)
            text = re.sub(rf"{escaped}\?v=[A-Za-z0-9]+", f"{name}?v={digest}", text)
        if text != original:
            html_path.write_text(text, encoding="utf-8")
            changed.append(html_path.name)

    if changed:
        print(f"Updated asset version query strings in: {', '.join(sorted(changed))}")
    else:
        print("Asset versions already up to date.")
    return changed


if __name__ == "__main__":
    changed_files = main()
    sys.exit(0)
