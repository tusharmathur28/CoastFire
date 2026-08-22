// simulateMonteCarlo() is randomized (uses randNormal() internally), so this is property-based
// rather than exact-value regression: shape/bounds invariants that must hold regardless of the
// random draws, plus a comparison proving the Phase 5 tax-drag toggle actually moves the output
// (mirrors the manual in-browser verification done when that toggle shipped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { simulateMonteCarlo } = shared;

// Same complete field set golden-values.json's fixtures use, so simulateMonteCarlo's raw()
// never falls through to $(id).value (which would throw outside a browser).
const baseOverrides = {
  contribFreq: 'annual', stopAtCoast: 'no', taxDragEnabled: 'no', reportCurrency: 'CAD', exchangeRate: 0.73,
  monthlyExpenses: 4000, cppMonthly: 1200, oasMonthly: 700, ssMonthly: 1500,
  returnRate: 7, inflationRate: 2.5, withdrawalRate: 4, lifeEvents: '[]',
  rrspBal: 220000, tfsaBal: 95000, nonregCadBal: 40000, fhsaBal: 0, respBal: 0,
  k401Bal: 180000, iraBal: 60000, rothBal: 30000, taxableUsdBal: 0, hsaBal: 0,
  rrspContrib: 12000, rrspMatch: 0, tfsaContrib: 7000, nonregCadContrib: 0, fhsaContrib: 0, respContrib: 0,
  k401Contrib: 15000, k401Match: 6000, iraContrib: 6000, rothContrib: 0, taxableUsdContrib: 0, hsaContrib: 0,
  currentAge: 45, retireAge: 62, benefitsStartAge: 65
};

test('successProb is always within [0, 1]', () => {
  const res = simulateMonteCarlo(baseOverrides, 200, 0.12);
  assert.ok(res.successProb >= 0 && res.successProb <= 1);
});

test('bands has one entry per year (n + 1) and each is internally ordered p10<=p25<=p50<=p75<=p90', () => {
  const res = simulateMonteCarlo(baseOverrides, 200, 0.12);
  assert.equal(res.bands.length, res.n + 1);
  for (const b of res.bands) {
    assert.ok(b.p10 <= b.p25);
    assert.ok(b.p25 <= b.p50);
    assert.ok(b.p50 <= b.p75);
    assert.ok(b.p75 <= b.p90);
  }
});

test('tax-drag toggle lowers the median ending balance and success probability', () => {
  const trials = 600; // high enough that the comparison isn't just noise
  const off = simulateMonteCarlo({ ...baseOverrides, taxDragEnabled: 'no' }, trials, 0.10);
  const on = simulateMonteCarlo({ ...baseOverrides, taxDragEnabled: 'yes' }, trials, 0.10);
  const lastOff = off.bands[off.bands.length - 1], lastOn = on.bands[on.bands.length - 1];
  assert.ok(lastOn.p50 < lastOff.p50, `expected drag-on median (${lastOn.p50}) < drag-off median (${lastOff.p50})`);
  assert.ok(on.successProb <= off.successProb, `expected drag-on success prob (${on.successProb}) <= drag-off (${off.successProb})`);
});
