// cppFactor/oasFactor/ssFactor are pure closed-form formulas (early-claim reduction / late-claim
// increase), used by Benefit Timing's own page and the CoastFIRE Calculator's PDF export. Expected
// values here are computed by hand from each function's actual formula in shared.js, not just
// "whatever it currently outputs" — a genuine correctness check, not a regression snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { cppFactor, oasFactor, ssFactor } = shared;

test('cppFactor: no adjustment at the standard age (65)', () => {
  assert.equal(cppFactor(65), 1);
});
test('cppFactor: reduced for early claiming (0.6%/month before 65)', () => {
  // 5 years early = 60 months * 0.6% = 36% reduction
  assert.ok(Math.abs(cppFactor(60) - 0.64) < 1e-9);
});
test('cppFactor: increased for late claiming (0.7%/month after 65)', () => {
  // 5 years late = 60 months * 0.7% = 42% increase
  assert.ok(Math.abs(cppFactor(70) - 1.42) < 1e-9);
});

test('oasFactor: no adjustment at or before the standard age (OAS has no early-claim option)', () => {
  assert.equal(oasFactor(65), 1);
  assert.equal(oasFactor(60), 1);
});
test('oasFactor: increased for late claiming (0.6%/month after 65)', () => {
  // 5 years late = 60 months * 0.6% = 36% increase
  assert.ok(Math.abs(oasFactor(70) - 1.36) < 1e-9);
});

test('ssFactor: no adjustment at full retirement age (67)', () => {
  assert.equal(ssFactor(67), 1);
});
test('ssFactor: reduced for early claiming, using the 5/9%-then-5/12% SSA tiered formula', () => {
  // 5 years early (62) = 60 months early: first 36 months at 5/9%, remaining 24 at 5/12%
  // reduction = 36*(5/9)/100 + 24*(5/12)/100 = 0.20 + 0.10 = 0.30
  assert.ok(Math.abs(ssFactor(62) - 0.70) < 1e-9);
});
test('ssFactor: increased for late claiming (2/3%/month after 67)', () => {
  // 3 years late = 36 months * (2/3)% = 24% increase
  assert.ok(Math.abs(ssFactor(70) - 1.24) < 1e-9);
});
test('ssFactor and cppFactor use distinct rates, not a shared constant', () => {
  assert.notEqual(ssFactor(70), cppFactor(70));
});
