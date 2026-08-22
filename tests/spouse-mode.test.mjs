// Spouse/partner mode — see the plan's "core design decision: computeCoastNumber()" section for
// the segment semantics being locked in here. The existing suite (golden-values.test.mjs,
// drawdown.test.mjs, monte-carlo.test.mjs, decumulation-bridge.test.mjs, historical-backtest.test.mjs)
// must keep passing byte-for-byte unmodified — this file only adds new coverage, it never touches
// an existing fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import shared from '../shared.js';

const {
  compute, computeAtRate, computeCoastNumber, simulateDrawdown,
  simulateMonteCarlo, simulateHistoricalBacktest, SP500_REAL_RETURNS,
  buildDecumulationOverrides, analyzeConversionWindow
} = shared;

const __dirname = dirname(fileURLToPath(import.meta.url));
const { overrides: goldenOverrides, golden } = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'golden-values.json'), 'utf8')
);
const round2 = n => Math.round(n * 100) / 100;

// Same complete field set golden-values.json's fixtures use, so raw()/val() in compute() /
// simulateMonteCarlo() / simulateHistoricalBacktest() never fall through to $(id).value (which
// would throw outside a browser — see rawOrDefault's file comment in shared.js).
const base = {
  contribFreq: 'annual', stopAtCoast: 'no', taxDragEnabled: 'no', reportCurrency: 'CAD', exchangeRate: 0.73,
  monthlyExpenses: 4000, cppMonthly: 1200, oasMonthly: 700, ssMonthly: 1500,
  returnRate: 7, inflationRate: 2.5, withdrawalRate: 4, lifeEvents: '[]',
  rrspBal: 220000, tfsaBal: 95000, nonregCadBal: 40000, fhsaBal: 0, respBal: 0,
  k401Bal: 180000, iraBal: 60000, rothBal: 30000, taxableUsdBal: 0, hsaBal: 0,
  rrspContrib: 12000, rrspMatch: 0, tfsaContrib: 7000, nonregCadContrib: 0, fhsaContrib: 0, respContrib: 0,
  k401Contrib: 15000, k401Match: 6000, iraContrib: 6000, rothContrib: 0, taxableUsdContrib: 0, hsaContrib: 0,
  currentAge: 45, retireAge: 62, benefitsStartAge: 65
};

// ---------------------------------------------------------------------------
// 1. hasSpouse omitted entirely -> byte-identical to the existing golden fixtures
// ---------------------------------------------------------------------------
for (const [name, scenarioOverrides] of Object.entries(goldenOverrides)) {
  test(`spouse mode inert (hasSpouse omitted): golden fixture ${name} unchanged`, () => {
    const res = compute(scenarioOverrides);
    const expected = golden[name];
    assert.equal(round2(res.requiredAtRetirement), expected.requiredAtRetirement);
    assert.equal(round2(res.coastNumberToday), expected.coastNumberToday);
  });
}

// ---------------------------------------------------------------------------
// 2. hasSpouse:'no' WITH nonzero leftover spouse fields -> still byte-identical.
// This is the realistic toggle-off case (fields persist in storage after a user disables spouse
// mode) and the test that catches a missing `hasSpouse &&` guard anywhere in the pipeline.
// ---------------------------------------------------------------------------
for (const [name, scenarioOverrides] of Object.entries(goldenOverrides)) {
  test(`spouse mode inert (hasSpouse:'no', leftover nonzero fields): golden fixture ${name} unchanged`, () => {
    const res = compute({
      ...scenarioOverrides,
      hasSpouse: 'no', spouseCurrentAge: 40, spouseCppMonthly: 900, spouseOasMonthly: 334,
      spouseSsMonthly: 2000, spouseBenefitsStartAge: 62
    });
    const expected = golden[name];
    assert.equal(round2(res.requiredAtRetirement), expected.requiredAtRetirement);
    assert.equal(round2(res.coastNumberToday), expected.coastNumberToday);
  });
}

// ---------------------------------------------------------------------------
// 3. Zero-amount spouse stream is a no-op regardless of its start age.
// Locks in the fix in computeCoastNumber(): only the primary's event (index 0) always creates a
// boundary; every additional (spouse) event only creates one when its amount is nonzero. Without
// that filter, a zero-amount spouse event landing after the primary's own benefitsStartAge would
// still split the perpetuity-approximated "forever" segment into an annuity segment plus a
// shorter perpetuity segment — two different formulas that don't sum to the same total.
// ---------------------------------------------------------------------------
test('zero-amount spouse benefit is a true no-op at every start age (before, at, and after the primary\'s own)', () => {
  const noSpouse = compute(base);
  for (const spouseBenefitsStartAge of [55, 60, 65, 70, 90]) {
    const withSpouse = compute({
      ...base, hasSpouse: 'yes', spouseCurrentAge: 40,
      spouseCppMonthly: 0, spouseOasMonthly: 0, spouseSsMonthly: 0, spouseBenefitsStartAge
    });
    assert.equal(withSpouse.requiredAtRetirement, noSpouse.requiredAtRetirement,
      `requiredAtRetirement should be unaffected at spouseBenefitsStartAge=${spouseBenefitsStartAge}`);
    assert.equal(withSpouse.bridgeYears, noSpouse.bridgeYears,
      `bridgeYears should be unaffected at spouseBenefitsStartAge=${spouseBenefitsStartAge}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Equal ages / equal start age / doubled amounts -> matches a separate no-spouse compute()
// call with the primary's own amounts doubled at the same benefitsStartAge. Provable identity
// under the merge rule: two same-boundary events summing to 2A produce, by construction, the
// exact same running activeBenefit sequence as one 2A event at that boundary.
// ---------------------------------------------------------------------------
test('equal-age, equal-start, doubled-amount spouse sums to the same PV as a doubled single stream', () => {
  const doubled = compute({ ...base, cppMonthly: 2400, oasMonthly: 1400, ssMonthly: 3000 });
  const spouseEqual = compute({
    ...base, hasSpouse: 'yes', spouseCurrentAge: 45,
    spouseCppMonthly: 1200, spouseOasMonthly: 700, spouseSsMonthly: 1500, spouseBenefitsStartAge: 65
  });
  assert.equal(spouseEqual.requiredAtRetirement, doubled.requiredAtRetirement);
});

// ---------------------------------------------------------------------------
// 5. Two distinct properties — NOT a "mirror-image ages give equal totals" claim (that's false:
// the middle segment's gap genuinely depends on which amount arrives first; e.g. $100k expense, a
// $40k benefit at year 5 and a $30k benefit at year 10 gives a middle-segment gap of 100-40=60,
// but swapping which amount lands at year 5 gives 100-30=70 instead — correctly unequal totals).
// ---------------------------------------------------------------------------
test('computeCoastNumber() event-order invariance: same two events, either list order, deep-equal result', () => {
  const eventsForward = [{ startYears: 3, annualAmount: 20000 }, { startYears: 8, annualAmount: 15000 }];
  const eventsReversed = [{ startYears: 8, annualAmount: 15000 }, { startYears: 3, annualAmount: 20000 }];
  const forward = computeCoastNumber({ futureAnnualExpense: 80000, returnRate: 0.06, withdrawalRate: 0.035, benefitEvents: eventsForward });
  const reversed = computeCoastNumber({ futureAnnualExpense: 80000, returnRate: 0.06, withdrawalRate: 0.035, benefitEvents: eventsReversed });
  assert.equal(reversed.requiredAtRetirement, forward.requiredAtRetirement);
  assert.equal(reversed.bridgeYears, forward.bridgeYears);
});

test('computeCoastNumber() ordering fixtures: hand-verified PV, deliberately unequal in each direction', () => {
  // Fixture A: the larger amount ($40k) arrives first (year 5), smaller ($30k) second (year 10).
  // Segment [0,5): gap=100000, annuity-PV(5yr,5%) = 100000*(1-1.05^-5)/0.05 = 432947.667...
  // Segment [5,10): gap=100000-40000=60000, annuity-PV(5yr,5%) discounted back 5yr = 203553.9...
  // Tail [10,inf): gap=100000-70000=30000, capitalized at 4% = 750000, discounted back 10yr = 460416.5...
  const A = computeCoastNumber({
    futureAnnualExpense: 100000, returnRate: 0.05, withdrawalRate: 0.04,
    benefitEvents: [{ startYears: 5, annualAmount: 40000 }, { startYears: 10, annualAmount: 30000 }]
  });
  assert.equal(round2(A.requiredAtRetirement), 1096918.10);

  // Fixture B: the genuine opposite — smaller amount ($30k) arrives first, larger ($40k) second.
  // Middle segment's gap is now 100000-30000=70000 (not 60000) — a real economic difference, so
  // the total is correctly higher than fixture A, not equal to it.
  const B = computeCoastNumber({
    futureAnnualExpense: 100000, returnRate: 0.05, withdrawalRate: 0.04,
    benefitEvents: [{ startYears: 5, annualAmount: 30000 }, { startYears: 10, annualAmount: 40000 }]
  });
  assert.equal(round2(B.requiredAtRetirement), 1130840.69);
  assert.notEqual(B.requiredAtRetirement, A.requiredAtRetirement);
});

// ---------------------------------------------------------------------------
// 6. computeCoastNumber() unit tests, independent of compute() — 1-event, 2-event, returnRate===0.
// ---------------------------------------------------------------------------
test('computeCoastNumber(): single event degenerates to the original 2-segment formula exactly', () => {
  const futureAnnualExpense = 60000, returnRate = 0.06, withdrawalRate = 0.04, bridgeYears = 6;
  const pvBridge = futureAnnualExpense * (1 - Math.pow(1 + returnRate, -bridgeYears)) / returnRate;
  const gap = Math.max(0, futureAnnualExpense - 25000);
  const pvPostBenefit = (gap / withdrawalRate) / Math.pow(1 + returnRate, bridgeYears);
  const result = computeCoastNumber({
    futureAnnualExpense, returnRate, withdrawalRate,
    benefitEvents: [{ startYears: bridgeYears, annualAmount: 25000 }]
  });
  assert.equal(result.requiredAtRetirement, pvBridge + pvPostBenefit);
  assert.equal(result.bridgeYears, bridgeYears);
});

test('computeCoastNumber(): returnRate === 0 branch (the ternary\'s other arm)', () => {
  // Segment [0,4): gap=50000, r=0 branch => 50000*4 = 200000. Tail: gap=30000/0.04=750000. Total 950000.
  const result = computeCoastNumber({
    futureAnnualExpense: 50000, returnRate: 0, withdrawalRate: 0.04,
    benefitEvents: [{ startYears: 4, annualAmount: 20000 }]
  });
  assert.equal(result.requiredAtRetirement, 950000);
  assert.equal(result.bridgeYears, 4);
});

test('computeCoastNumber(): 2-event fixture matches the hand-verified fixture A above', () => {
  const result = computeCoastNumber({
    futureAnnualExpense: 100000, returnRate: 0.05, withdrawalRate: 0.04,
    benefitEvents: [{ startYears: 5, annualAmount: 40000 }, { startYears: 10, annualAmount: 30000 }]
  });
  assert.equal(round2(result.requiredAtRetirement), 1096918.10);
});

// ---------------------------------------------------------------------------
// 7. simulateDrawdown(): per-year govBenefit sums across the before-both/between/after-both
// windows, plus a golden-value regression lock on totalTaxPaid/endingBalance for one fixed
// spouse fixture — same "locks in this run's numbers, not an independent correctness proof"
// philosophy as the existing drawdown.test.mjs.
// ---------------------------------------------------------------------------
const spouseDrawdownOverrides = {
  currentAge: 58, retireAge: 60, ddoPlanToAge: 90,
  returnRate: 6, inflationRate: 2.5, reportCurrency: 'USD', exchangeRate: 0.73,
  monthlyExpenses: 5000, cppMonthly: 900, oasMonthly: 700, ssMonthly: 1800,
  benefitsStartAge: 65, ddoFilingStatus: 'mfj', ddoCapGainsRate: 15, lifeEvents: '[]',
  ddoRrspBal: 400000, ddoTfsaBal: 100000, ddoK401Bal: 350000, ddoIraBal: 120000,
  ddoRothBal: 60000, ddoNonregCadBal: 50000, ddoTaxableUsdBal: 40000,
  hasSpouse: 'yes', spouseCurrentAge: 55, spouseCppMonthly: 600, spouseOasMonthly: 500,
  spouseSsMonthly: 1200, spouseBenefitsStartAge: 63
};

test('simulateDrawdown(): govBenefit sums two independently-gated streams across before/between/after windows', () => {
  const res = simulateDrawdown(spouseDrawdownOverrides, 'greedy');
  // ageGap = currentAge(58) - spouseCurrentAge(55) = 3, so spouseAge = age - 3.
  // Primary starts at 65 (govBenefit alone); spouse starts once spouseAge >= 63, i.e. age >= 66.
  const before = res.years.find(y => y.age === 60);
  const primaryOnly = res.years.find(y => y.age === 65);
  const both = res.years.find(y => y.age === 66);
  assert.equal(before.govBenefit, 0, 'before either benefit starts, govBenefit is 0');
  assert.equal(round2(primaryOnly.govBenefit), 35616.00, 'primary-only window: (900+700)*12*0.73 + 1800*12');
  assert.equal(round2(both.govBenefit), 59652.00, 'both-claiming window: primary + spouse (600+500)*12*0.73 + 1200*12');
});

test('simulateDrawdown(): spouse-mode golden-value regression lock', () => {
  const res = simulateDrawdown(spouseDrawdownOverrides, 'greedy');
  assert.equal(round2(res.totalTaxPaid), 18207.38);
  assert.equal(round2(res.endingBalance), 3780348.59);
  assert.equal(res.depletionAge, null);
});

// ---------------------------------------------------------------------------
// 8. analyzeConversionWindow() needs zero code changes — proved with a test, not just inspection.
// A hand-built years[] array with an already-two-stream-summed govBenefit must produce a window
// ending at the EARLIER of the two start ages, not the later — the regression net for "a Math.max
// collapse across two people would have been wrong here."
// ---------------------------------------------------------------------------
test('analyzeConversionWindow(): bridge window ends at the earlier of two independently-gated benefit starts', () => {
  // Primary benefit starts at age 65, spouse's at age 63 (spouse starts first) — govBenefit here
  // is exactly what simulateDrawdown() would produce: 0 until age 63, nonzero from 63 onward.
  const years = [60, 61, 62, 63, 64, 65, 66].map(age => ({
    age,
    govBenefit: age >= 63 ? 20000 : 0,
    depleted: false,
    withdrawals: { k401: 30000, ira: 10000, rrsp: 5000 }
  }));
  const result = analyzeConversionWindow(years, 'mfj');
  assert.equal(result.windowStartAge, 60);
  assert.equal(result.windowEndAge, 62, 'window must end at 62 (the year before the EARLIER of the two starts, age 63) — a Math.max collapse using the later age (65) would have wrongly extended this to 64');
});

// ---------------------------------------------------------------------------
// 9. Drift guard: simulateMonteCarlo(), simulateHistoricalBacktest(), and computeAtRate() must
// all agree with compute()'s requiredAtRetirement for identical spouse-mode inputs. This is what
// stops the multi-site duplication (5 call sites total, see the plan) from silently drifting
// apart again in the future.
// ---------------------------------------------------------------------------
const driftGuardOverrides = { ...base, hasSpouse: 'yes', spouseCurrentAge: 43, spouseCppMonthly: 800, spouseOasMonthly: 300, spouseSsMonthly: 1000, spouseBenefitsStartAge: 63 };

test('drift guard: simulateMonteCarlo() requiredAtRetirement matches compute()', () => {
  const res = compute(driftGuardOverrides);
  const mc = simulateMonteCarlo(driftGuardOverrides, 50, 0.0001);
  assert.equal(mc.requiredAtRetirement, res.requiredAtRetirement);
});

test('drift guard: simulateHistoricalBacktest() requiredAtRetirement matches compute()', () => {
  const res = compute(driftGuardOverrides);
  const hist = simulateHistoricalBacktest(driftGuardOverrides, SP500_REAL_RETURNS);
  assert.equal(hist.requiredAtRetirement, res.requiredAtRetirement);
});

test('drift guard: computeAtRate() at the original rate reproduces compute()\'s own coastNumberToday', () => {
  const res = compute(driftGuardOverrides);
  const atOrigRate = computeAtRate(res, res.exchangeRate);
  assert.equal(atOrigRate.coastNumber, res.coastNumberToday);
});

test('drift guard: computeAtRate() at a different rate independently reconstructs the spouse-aware PV', () => {
  // Higher expenses than driftGuardOverrides so the post-benefit gap stays positive (and thus
  // rate-sensitive) at both exchange rates tested — otherwise gov benefits alone could cover
  // expenses at both rates, making the comparison a false positive (see the investigation that
  // caught this: at $4,000/mo expenses, both 0.73 and 1.20 clamp the post-benefit gap to 0).
  const fxOverrides = { ...driftGuardOverrides, monthlyExpenses: 9000 };
  const res = compute(fxOverrides);
  const newRate = 1.20;
  const atNewRate = computeAtRate(res, newRate);

  // Manual reconstruction, independent of computeAtRate()'s own internals.
  const { convertToReport } = shared;
  const annualGov = convertToReport((res.cppMonthly + res.oasMonthly) * 12, res.ssMonthly * 12, res.reportCurrency, newRate);
  const spouseAnnualGov = convertToReport((res.spouseCppMonthly + res.spouseOasMonthly) * 12, res.spouseSsMonthly * 12, res.reportCurrency, newRate);
  const events = [
    { startYears: Math.max(0, res.benefitsStartAge - res.retireAge), annualAmount: annualGov },
    { startYears: Math.max(0, res.spouseBenefitsStartAge - (res.spouseCurrentAge + res.n)), annualAmount: spouseAnnualGov }
  ];
  const { requiredAtRetirement } = computeCoastNumber({
    futureAnnualExpense: res.futureAnnualExpense, returnRate: res.returnRate, withdrawalRate: res.withdrawalRate, benefitEvents: events
  });
  const expectedCoastNumber = requiredAtRetirement / Math.pow(1 + res.returnRate, res.n);

  assert.notEqual(atNewRate.coastNumber, res.coastNumberToday, 'sanity: the new rate must actually change the result, or this test proves nothing');
  assert.equal(atNewRate.coastNumber, expectedCoastNumber);
});

// ---------------------------------------------------------------------------
// 10. buildDecumulationOverrides(): spouse-mode compute() result -> bridge -> all 6 spouse fields
// present and correctly typed -> feeds into simulateDrawdown() without throwing, and the spouse's
// benefit is actually counted (regression lock for the boolean/string hasSpouse mismatch found
// during implementation: compute() returns hasSpouse as a real JS boolean, but simulateDrawdown()
// reads it with strict `=== 'yes'` string equality like every other FIELD_IDS field).
// ---------------------------------------------------------------------------
test('buildDecumulationOverrides(): bridges all 6 spouse fields, hasSpouse re-stringified to \'yes\'/\'no\'', () => {
  const res = compute(driftGuardOverrides);
  const bridged = buildDecumulationOverrides(res, { ddoPlanToAge: '90', ddoFilingStatus: 'mfj', ddoCapGainsRate: '15', monthlyExpenses: '4000', lifeEvents: '[]' });
  assert.equal(bridged.hasSpouse, 'yes');
  assert.equal(bridged.spouseCurrentAge, res.spouseCurrentAge);
  assert.equal(bridged.spouseCppMonthly, res.spouseCppMonthly);
  assert.equal(bridged.spouseOasMonthly, res.spouseOasMonthly);
  assert.equal(bridged.spouseSsMonthly, res.spouseSsMonthly);
  assert.equal(bridged.spouseBenefitsStartAge, res.spouseBenefitsStartAge);
});

test('buildDecumulationOverrides(): hasSpouse:false correctly re-stringifies to \'no\'', () => {
  const res = compute(base); // hasSpouse omitted -> false
  const bridged = buildDecumulationOverrides(res, { ddoPlanToAge: '90', ddoFilingStatus: 'single', ddoCapGainsRate: '15', monthlyExpenses: '4000', lifeEvents: '[]' });
  assert.equal(bridged.hasSpouse, 'no');
});

test('buildDecumulationOverrides(): bridged spouse-mode overrides feed simulateDrawdown() without throwing, and the spouse benefit is actually counted', () => {
  const res = compute(driftGuardOverrides);
  const bridged = buildDecumulationOverrides(res, { ddoPlanToAge: '90', ddoFilingStatus: 'mfj', ddoCapGainsRate: '15', monthlyExpenses: '4000', lifeEvents: '[]' });
  const dd = simulateDrawdown(bridged, 'greedy');
  assert.ok(dd.years.length > 0);
  const lastYear = dd.years[dd.years.length - 1];
  assert.ok(lastYear.age >= res.spouseBenefitsStartAge + (res.spouseCurrentAge < res.currentAge ? 0 : 0), 'sanity: the simulation runs long enough to reach spouse-claiming ages');
  const yearsWithSpouseBenefit = dd.years.filter(y => {
    const spouseAge = y.age - (res.currentAge - res.spouseCurrentAge);
    return spouseAge >= res.spouseBenefitsStartAge;
  });
  assert.ok(yearsWithSpouseBenefit.length > 0, 'the fixture must actually reach spouse-claiming age for this test to mean anything');
  assert.ok(yearsWithSpouseBenefit.every(y => y.govBenefit > 0), 'once the spouse is claiming, govBenefit must reflect it (regression net for the boolean/string mismatch)');
});

// ---------------------------------------------------------------------------
// 11. Edge case — spouse older than primary. spouseAge = age - (currentAge - spouseCurrentAge)
// does NOT go negative when the spouse is older (it just stays greater than age throughout,
// correctly). What CAN go negative is startYears = spouseBenefitsStartAge - spouseAgeAtRetirement
// — an older spouse may already be past their own claiming age by the time the household
// retires. The caller must clamp that to 0 before it reaches computeCoastNumber(), and a
// 0-boundary event must merge correctly with any other event already at boundary 0.
// ---------------------------------------------------------------------------
test('edge case: spouse older than primary, already past their own claiming age at retirement', () => {
  const overrides = {
    ...base, currentAge: 50, retireAge: 60, benefitsStartAge: 65,
    hasSpouse: 'yes', spouseCurrentAge: 58, spouseCppMonthly: 500, spouseOasMonthly: 200, spouseSsMonthly: 800,
    spouseBenefitsStartAge: 63
  };
  // n = 10, spouseAgeAtRetirement = 58+10 = 68, already 5 years past spouseBenefitsStartAge (63)
  // -> spouse's startYears must clamp to 0, not -5.
  const res = compute(overrides);
  assert.equal(res.bridgeYears, 0, 'spouse already claiming at retirement -> the earlier boundary (0) wins');
  assert.ok(Number.isFinite(res.requiredAtRetirement) && res.requiredAtRetirement > 0);
});

test('edge case: simulateDrawdown() with an older spouse already claiming at year 0 of retirement', () => {
  const overrides = {
    currentAge: 50, retireAge: 60, ddoPlanToAge: 65,
    returnRate: 6, inflationRate: 2.5, reportCurrency: 'USD', exchangeRate: 0.73,
    monthlyExpenses: 4000, cppMonthly: 0, oasMonthly: 0, ssMonthly: 0, benefitsStartAge: 60,
    ddoFilingStatus: 'single', ddoCapGainsRate: 15, lifeEvents: '[]',
    ddoRrspBal: 0, ddoTfsaBal: 0, ddoK401Bal: 200000, ddoIraBal: 0, ddoRothBal: 0, ddoNonregCadBal: 0, ddoTaxableUsdBal: 0,
    hasSpouse: 'yes', spouseCurrentAge: 58, spouseCppMonthly: 500, spouseOasMonthly: 200, spouseSsMonthly: 800, spouseBenefitsStartAge: 63
  };
  const res = simulateDrawdown(overrides, 'greedy');
  assert.ok(res.years.length > 0, 'must not throw and must produce years');
  // Primary claims at 60 (retirement, amount 0 here); spouse's own age at retirement is 68,
  // already 5 years past their spouseBenefitsStartAge of 63 -> spouse benefit active from year 0.
  assert.ok(res.years[0].govBenefit > 0, 'spouse benefit must already be active in the first year');
});

// ---------------------------------------------------------------------------
// 12. Edge case — benefits already flowing at retirement (retireAge >= benefitsStartAge), legal
// today and common once a spouse can be older. startYears must clamp to exactly 0, and a
// 0-boundary event must merge correctly with any other 0-boundary event (both spouses already
// collecting at retirement).
// ---------------------------------------------------------------------------
test('edge case: both primary and spouse already claiming at the moment of retirement', () => {
  const overrides = {
    ...base, currentAge: 65, retireAge: 65, benefitsStartAge: 60, // primary already claiming (60 < 65)
    hasSpouse: 'yes', spouseCurrentAge: 66, spouseCppMonthly: 500, spouseOasMonthly: 200, spouseSsMonthly: 800,
    spouseBenefitsStartAge: 60 // spouse also already claiming
  };
  const res = compute(overrides);
  assert.equal(res.bridgeYears, 0, 'both boundaries clamp to 0 and merge into a single boundary');
  // No finite bridge segment at all -> the whole requiredAtRetirement is the single perpetuity
  // tail with both benefits already active from year 0.
  const expectedGap = Math.max(0, res.futureAnnualExpense - res.householdAnnualGovBenefit);
  assert.equal(round2(res.requiredAtRetirement), round2(expectedGap / res.withdrawalRate));
});
