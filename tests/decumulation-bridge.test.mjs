// Regression guard for buildDecumulationOverrides() — the function that turns a compute() result
// into simulateDrawdown() input. Two things matter here: the mapping itself (balances/rates/ages
// land in the right shape) and that feeding the result into simulateDrawdown() doesn't throw and
// produces a sane, stable simulation — mirroring drawdown.test.mjs's own golden-value philosophy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { compute, buildDecumulationOverrides, simulateDrawdown } = shared;

const computeOverrides = {
  contribFreq: 'annual', stopAtCoast: 'no', taxDragEnabled: 'no', reportCurrency: 'USD', exchangeRate: 0.73,
  monthlyExpenses: 4000, cppMonthly: 1200, oasMonthly: 700, ssMonthly: 1500,
  returnRate: 6, inflationRate: 2.5, withdrawalRate: 4, lifeEvents: '[]',
  rrspBal: 400000, tfsaBal: 100000, nonregCadBal: 50000, fhsaBal: 5000, respBal: 0,
  k401Bal: 350000, iraBal: 120000, rothBal: 60000, taxableUsdBal: 40000, hsaBal: 0,
  rrspContrib: 0, rrspMatch: 0, tfsaContrib: 0, nonregCadContrib: 0, fhsaContrib: 0, respContrib: 0,
  k401Contrib: 0, k401Match: 0, iraContrib: 0, rothContrib: 0, taxableUsdContrib: 0, hsaContrib: 0,
  currentAge: 58, retireAge: 60, benefitsStartAge: 65
};
const storedInputs = { ddoPlanToAge: 90, ddoFilingStatus: 'single', ddoCapGainsRate: 15, monthlyExpenses: 4000, lifeEvents: '[]' };

test('buildDecumulationOverrides maps the live retirement-age balances, not stored ddo*Bal fields', () => {
  const res = compute(computeOverrides);
  const last = res.rows[res.rows.length - 1];
  const bridged = buildDecumulationOverrides(res, storedInputs);

  assert.equal(bridged.currentAge, res.currentAge);
  assert.equal(bridged.retireAge, res.retireAge);
  assert.equal(bridged.ddoRrspBal, last.rrsp);
  assert.equal(bridged.ddoTfsaBal, last.tfsa);
  assert.equal(bridged.ddoNonregCadBal, last.nonregCad);
  assert.equal(bridged.ddoK401Bal, last.k401);
  assert.equal(bridged.ddoIraBal, last.ira);
  assert.equal(bridged.ddoRothBal, last.roth);
  assert.equal(bridged.ddoTaxableUsdBal, last.taxableUsd);
  // FHSA is real money in this fixture (5000 at retirement) but has no ddo* counterpart —
  // confirms it's dropped, not silently folded into another account.
  assert.equal('fhsa' in bridged, false);

  // Percentages round-trip through compute()'s /100 and back correctly.
  assert.equal(bridged.returnRate, 6);
  assert.equal(bridged.inflationRate, 2.5);
});

test('bridged overrides feed simulateDrawdown() into a stable simulation (drawdown regression)', () => {
  const res = compute(computeOverrides);
  const bridged = buildDecumulationOverrides(res, storedInputs);
  const sim = simulateDrawdown(bridged, 'rrspFirst');

  assert.equal(sim.years[0].age, res.retireAge);
  assert.ok(sim.years.length > 1);
  assert.equal(sim.years[sim.years.length - 1].age <= storedInputs.ddoPlanToAge, true);

  const round2 = n => Math.round(n * 100) / 100;
  assert.equal(round2(sim.totalTaxPaid), 58751.69);
  assert.equal(round2(sim.endingBalance), 3985253.17);
  assert.equal(sim.depletionAge, null);
});
