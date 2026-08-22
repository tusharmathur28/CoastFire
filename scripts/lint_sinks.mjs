#!/usr/bin/env node
// XSS-sink tripwire — CI gate, not just a warning. Flags any `X.innerHTML = ...` /
// `X.innerHTML += ...` assignment that interpolates a template literal (`${...}`) without
// escapeHtml() appearing in the same statement, unless the line immediately before the
// assignment carries a `lint-sinks-ok:` marker explaining why the interpolated value can only
// ever be internal/numeric.
//
// Multiline-aware on purpose: the very first regression this tripwire would have caught
// (coastfire-calculator.html's scenario-select bug, fixed in the SEC-01 XSS-remediation pass)
// spanned two lines — a single-line grep missed it. See tests/fixtures aside, this is deliberately
// a heuristic, not a proof; pair it with a manual sweep after any renderer refactor.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', '.tmp_split']);
const EXTS = new Set(['.html', '.js']);
// How far past `innerHTML =` to look for a `${` — generous enough to span a multi-line template
// literal (the longest real one found in this repo is ~260 chars) without matching unrelated code.
const WINDOW = 500;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

const ASSIGNMENT_RE = /\.innerHTML\s*\+?=/g;
const failures = [];

for (const file of walk(ROOT)) {
  const content = readFileSync(file, 'utf8');
  let match;
  ASSIGNMENT_RE.lastIndex = 0;
  while ((match = ASSIGNMENT_RE.exec(content))) {
    const windowEnd = Math.min(content.length, match.index + WINDOW);
    const context = content.slice(match.index, windowEnd);
    // Bound to this statement's own closing `;` (if one falls inside the window) *before*
    // checking for `${` or escapeHtml() — otherwise a short static-string assignment right
    // before a real interpolated one borrows the next statement's contents (false positive),
    // or a real interpolated one borrows the next statement's escapeHtml() call (false negative).
    const semiIdx = context.indexOf(';');
    const statement = semiIdx === -1 ? context : context.slice(0, semiIdx + 1);
    if (!statement.includes('${')) continue;
    if (statement.includes('escapeHtml(')) continue;

    const lineNum = content.slice(0, match.index).split('\n').length;
    const lines = content.split('\n');
    const precedingLine = lines[lineNum - 2] || '';
    if (/lint-sinks-ok:/.test(precedingLine)) continue;

    const snippet = statement.split('\n')[0].trim().slice(0, 120);
    failures.push(`${relative(ROOT, file)}:${lineNum}: ${snippet}`);
  }
}

if (failures.length) {
  console.error('Unescaped template-literal interpolation into innerHTML (no escapeHtml() in the statement, no lint-sinks-ok marker on the preceding line):');
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
console.log('lint_sinks: clean — no unescaped innerHTML interpolation found.');
