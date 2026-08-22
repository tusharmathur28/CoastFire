#!/usr/bin/env bash
# Thin wrapper so `bash scripts/lint_sinks.sh` keeps working as the CI entry point — the actual
# multiline-aware scan lives in lint_sinks.mjs (see its header for what changed and why: this
# used to be a single-line grep, which is exactly the shape of bug it would have missed —
# coastfire-calculator.html's scenario-select bug, fixed in the SEC-01 XSS-remediation pass,
# spanned two lines). This is now a hard CI gate, not just a warning: every currently-safe hit is
# allowlisted inline with a `lint-sinks-ok:` comment on the line above it.
set -euo pipefail
node "$(dirname "$0")/lint_sinks.mjs"
