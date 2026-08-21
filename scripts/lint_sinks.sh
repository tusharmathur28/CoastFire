#!/usr/bin/env bash
# Dependency-free tripwire against XSS regressions: flags any innerHTML assignment that
# interpolates a template literal without going through escapeHtml() on the same line.
# This is a single-line heuristic, not a proof — it will not catch a sink that spans multiple
# lines (see git history: coastfire-calculator.html's scenario-select bug was exactly that
# shape) and it will flag interpolations that are actually safe (numbers, internal constants).
# Treat every hit as something to read, not something to silence: either wrap it in
# escapeHtml()/convert it to textContent, or leave a comment explaining why the value can only
# ever be internal/numeric so the next reader doesn't have to re-derive that from scratch.
set -euo pipefail
hits=$(grep -rnE 'innerHTML[[:space:]]*[+]?=[^;]*\$\{' \
        --include='*.html' --include='*.js' . \
      | grep -v 'escapeHtml(' || true)
if [ -n "$hits" ]; then
  echo "::warning::innerHTML interpolation without escapeHtml() on the same line — review each, this is a single-line heuristic:"
  echo "$hits"
fi
exit 0
