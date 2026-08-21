#!/usr/bin/env bash
# Asserts the Phase 3 security-header set is present on a deployed URL. Not wired into CI yet —
# Phase 3 hasn't landed, and the production hosting path (Worker vs. Cloudflare Pages) is still
# unconfirmed (see the security remediation plan, section 3.1). Run manually against a staging
# URL once that's settled: scripts/check_headers.sh https://your-staging-url
set -euo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Usage: $0 <url>" >&2
  exit 2
fi

headers=$(curl -sI "$URL")
fail=0

check() {
  local name="$1"
  if ! echo "$headers" | grep -qi "^${name}:"; then
    echo "MISSING: $name"
    fail=1
  fi
}

check "x-content-type-options"
check "referrer-policy"
check "permissions-policy"
check "x-frame-options"

if ! echo "$headers" | grep -qi '^content-security-policy'; then
  echo "MISSING: content-security-policy (or content-security-policy-report-only during staged rollout)"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "All required security headers present on $URL"
fi
exit $fail
