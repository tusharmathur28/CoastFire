// Regression guard for simulateDrawdown(), mirroring golden-values.test.mjs's own stated
// philosophy: this proves the four withdrawal-order strategies don't silently drift, not that
// their numbers are independently correct. simulateDrawdown() never touches the DOM (reads only
// from its `overrides` object per its own file comment), so no document-dependent fields to worry
// about here the way compute()/simulateMonteCarlo() have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { simulateDrawdown } = shared;

const overrides = {
  currentAge: 58, retireAge: 60, ddoPlanToAge: 90,
  returnRate: 6, inflationRate: 2.5, reportCurrency: 'USD', exchangeRate: 0.73,
  monthlyExpenses: 5000, cppMonthly: 900, oasMonthly: 700, ssMonthly: 1800,
  benefitsStartAge: 65, ddoFilingStatus: 'single', ddoCapGainsRate: 15, lifeEvents: '[]',
  ddoRrspBal: 400000, ddoTfsaBal: 100000, ddoK401Bal: 350000, ddoIraBal: 120000,
  ddoRothBal: 60000, ddoNonregCadBal: 50000, ddoTaxableUsdBal: 40000
};

const golden = {
  greedy: { totalTaxPaid: 118634.18, endingBalance: 2142420.70, depletionAge: null },
  taxableFirst: { totalTaxPaid: 104045.01, endingBalance: 2151956.40, depletionAge: null },
  rrspFirst: { totalTaxPaid: 84272.00, endingBalance: 2120025.14, depletionAge: null },
  proportional: { totalTaxPaid: 87220.75, endingBalance: 2162681.90, depletionAge: null }
};

const round2 = n => Math.round(n * 100) / 100;

for (const [strategyName, expected] of Object.entries(golden)) {
  test(`drawdown regression: ${strategyName}`, () => {
    const res = simulateDrawdown(overrides, strategyName);
    assert.equal(round2(res.totalTaxPaid), expected.totalTaxPaid);
    assert.equal(round2(res.endingBalance), expected.endingBalance);
    assert.equal(res.depletionAge, expected.depletionAge);
  });
}

test('rrspFirst pays the least total tax among the four strategies on this fixture', () => {
  // Not a universal claim about the strategy in general — just documents/locks in the relative
  // ordering this specific fixture already produces, since the PDF export picks "the best" by
  // exactly this comparison (see coastfire-calculator.html's buildPdfDocument()).
  const results = Object.keys(golden).map(name => ({ name, sim: simulateDrawdown(overrides, name) }));
  const best = results.reduce((a, b) => (b.sim.totalTaxPaid < a.sim.totalTaxPaid ? b : a));
  assert.equal(best.name, 'rrspFirst');
});
