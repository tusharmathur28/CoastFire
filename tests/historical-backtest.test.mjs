// simulateHistoricalBacktest() is deterministic (no randomness, unlike simulateMonteCarlo()),
// so unlike monte-carlo.test.mjs this can use exact golden values on a small hand-verifiable
// synthetic series — never real market data, so the fixture stays self-checking without
// depending on SP500_REAL_RETURNS staying byte-identical. The bundled real dataset gets its
// own lightweight structural check below (length/range/no-gaps), not a value-by-value one —
// those values were already verified against known market history when the data was sourced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { simulateHistoricalBacktest, SP500_REAL_RETURNS } = shared;

// Hand-verifiable: a lone 1000-unit RRSP balance, no contributions, exchangeRate 1 (so
// convertToReport is a no-op) and monthlyExpenses 0 (so the CoastFIRE target is always 0,
// keeping this fixture about the return-sequencing math, not the target math already covered
// by golden-values.test.mjs).
const syntheticSeries = [
  { year: 2000, real: 0.10 }, { year: 2001, real: -0.10 }, { year: 2002, real: 0.20 },
  { year: 2003, real: 0.00 }, { year: 2004, real: 0.05 }
];
const baseOverrides = {
  contribFreq: 'annual', stopAtCoast: 'no', taxDragEnabled: 'no', reportCurrency: 'CAD', exchangeRate: 1,
  monthlyExpenses: 0, cppMonthly: 0, oasMonthly: 0, ssMonthly: 0,
  returnRate: 7, inflationRate: 0, withdrawalRate: 4, lifeEvents: '[]',
  rrspBal: 1000, tfsaBal: 0, nonregCadBal: 0, fhsaBal: 0, respBal: 0,
  k401Bal: 0, iraBal: 0, rothBal: 0, taxableUsdBal: 0, hsaBal: 0,
  rrspContrib: 0, rrspMatch: 0, tfsaContrib: 0, nonregCadContrib: 0, fhsaContrib: 0, respContrib: 0,
  k401Contrib: 0, k401Match: 0, iraContrib: 0, rothContrib: 0, taxableUsdContrib: 0, hsaContrib: 0,
  currentAge: 30, retireAge: 32, benefitsStartAge: 32
};

test('replays the exact historical windows: 3 windows, correct worst/best year and ending balances', () => {
  const res = simulateHistoricalBacktest(baseOverrides, syntheticSeries);
  // Window 2000: 1000 * 1.10 * 0.90 = 990. Window 2001: 1000 * 0.90 * 1.20 = 1080.
  // Window 2002: 1000 * 1.20 * 1.00 = 1200.
  assert.equal(res.n, 2);
  assert.equal(res.windowCount, 3);
  assert.equal(res.dataStartYear, 2000);
  assert.equal(res.dataEndYear, 2004);
  assert.equal(res.worstStartYear, 2000);
  assert.equal(res.bestStartYear, 2002);
});

test('bands are sorted ascending per year across the 3 windows', () => {
  const res = simulateHistoricalBacktest(baseOverrides, syntheticSeries);
  assert.equal(res.bands.length, 3);
  assert.deepEqual([res.bands[0].p10, res.bands[0].p50, res.bands[0].p90], [1000, 1000, 1000]);
  assert.deepEqual([res.bands[1].p10, res.bands[1].p50, res.bands[1].p90], [900, 1100, 1200]);
  assert.deepEqual([res.bands[2].p10, res.bands[2].p50, res.bands[2].p90], [990, 1080, 1200]);
});

test('returns null when the plan horizon is longer than the historical series', () => {
  const res = simulateHistoricalBacktest({ ...baseOverrides, retireAge: 36 }, syntheticSeries);
  assert.equal(res, null);
});

test('SP500_REAL_RETURNS: 98 years, 1928-2025, no gaps', () => {
  assert.equal(SP500_REAL_RETURNS.length, 98);
  assert.equal(SP500_REAL_RETURNS[0].year, 1928);
  assert.equal(SP500_REAL_RETURNS[SP500_REAL_RETURNS.length - 1].year, 2025);
  for (let i = 1; i < SP500_REAL_RETURNS.length; i++) {
    assert.equal(SP500_REAL_RETURNS[i].year, SP500_REAL_RETURNS[i - 1].year + 1);
  }
});
