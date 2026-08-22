// Regression guard for analyzeConversionWindow() — a read-only bracket-headroom detector, not
// a ladder simulator (see shared.js for why: the engine has no age-59½/penalty modeling to
// simulate against yet). Golden-value style, same as drawdown.test.mjs, reusing that file's
// exact fixture so the two tests are provably looking at the same underlying withdrawal path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { simulateDrawdown, analyzeConversionWindow } = shared;

const overrides = {
  currentAge: 58, retireAge: 60, ddoPlanToAge: 90,
  returnRate: 6, inflationRate: 2.5, reportCurrency: 'USD', exchangeRate: 0.73,
  monthlyExpenses: 5000, cppMonthly: 900, oasMonthly: 700, ssMonthly: 1800,
  benefitsStartAge: 65, ddoFilingStatus: 'single', ddoCapGainsRate: 15, lifeEvents: '[]',
  ddoRrspBal: 400000, ddoTfsaBal: 100000, ddoK401Bal: 350000, ddoIraBal: 120000,
  ddoRothBal: 60000, ddoNonregCadBal: 50000, ddoTaxableUsdBal: 40000
};

const round2 = n => Math.round(n * 100) / 100;

test('windows to the 5 pre-benefits years (retireAge 60 to benefitsStartAge 65) and stays in the 22% bracket', () => {
  const sim = simulateDrawdown(overrides, 'rrspFirst');
  const win = analyzeConversionWindow(sim.years, 'single');
  assert.equal(win.windowStartAge, 60);
  assert.equal(win.windowEndAge, 64);
  assert.equal(win.rows.length, 5);
  for (const r of win.rows) assert.equal(r.marginalRate, 0.22);
});

test('tightest row and per-year headroom match the golden run', () => {
  const sim = simulateDrawdown(overrides, 'rrspFirst');
  const win = analyzeConversionWindow(sim.years, 'single');
  assert.equal(win.tightestRow.age, 60);
  assert.equal(round2(win.tightestRow.headroom), 47638.25);
  assert.equal(round2(win.rows[4].headroom), 51800.08); // age 64, a lighter withdrawal year
});

test('RRSP withdrawals count toward the taxable-income baseline (not just k401/ira)', () => {
  // rrspFirst draws heavily from RRSP first — if analyzeConversionWindow() only looked at
  // k401/ira it would show far more headroom than actually exists once RRSP income is counted.
  const sim = simulateDrawdown(overrides, 'rrspFirst');
  const win = analyzeConversionWindow(sim.years, 'single');
  const y = sim.years[0];
  assert.ok(y.withdrawals.rrsp > 0, 'fixture sanity: rrspFirst should draw RRSP in year 1');
  const k401IraOnly = Math.max(0, y.withdrawals.k401 + y.withdrawals.ira - 16100);
  assert.ok(win.rows[0].taxableOrdinaryIncome > k401IraOnly,
    'taxableOrdinaryIncome should exceed a k401/ira-only baseline once RRSP is counted');
});

test('governs off years already receiving benefits or already depleted', () => {
  const sim = simulateDrawdown(overrides, 'rrspFirst');
  const win = analyzeConversionWindow(sim.years, 'single');
  const windowAges = win.rows.map(r => r.age);
  const postBenefitYears = sim.years.filter(y => y.govBenefit > 0);
  assert.ok(postBenefitYears.length > 0, 'fixture sanity: plan should run past benefitsStartAge');
  for (const y of postBenefitYears) assert.ok(!windowAges.includes(y.age));
});
