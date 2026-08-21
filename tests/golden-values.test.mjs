// Regression guard: security-remediation phases must not change calculation output.
// Recomputes compute() for 3 fixed scenarios and diffs against the pre-security-baseline
// snapshot in fixtures/golden-values.json. See tag `pre-security-baseline`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import shared from '../shared.js';

const { compute } = shared;
const __dirname = dirname(fileURLToPath(import.meta.url));
const { overrides, golden } = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'golden-values.json'), 'utf8')
);

const round2 = n => Math.round(n * 100) / 100;

for (const [name, scenarioOverrides] of Object.entries(overrides)) {
  test(`golden value regression: ${name}`, () => {
    const res = compute(scenarioOverrides);
    const last = res.rows[res.rows.length - 1];
    const expected = golden[name];

    assert.equal(res.n, expected.n);
    assert.equal(res.coastYearIndex, expected.coastYearIndex);
    assert.equal(round2(res.requiredAtRetirement), expected.requiredAtRetirement);
    assert.equal(round2(res.coastNumberToday), expected.coastNumberToday);
    assert.equal(round2(res.cadTotalToday), expected.cadTotalToday);
    assert.equal(round2(res.usdTotalToday), expected.usdTotalToday);
    assert.equal(round2(last.combined), expected.lastRowCombined);
    assert.equal(last.age, expected.lastRowAge);
  });
}
