// Shared utilities loaded by every page, before that page's own inline <script>.
// Kept deliberately DOM-independent where possible (compute/readStoredInputs/etc.) so any
// tool page can use them even though it only has its own fields in the DOM — every other
// tool's data comes from localStorage['ccfire:v2'] via readStoredInputs(), not from a shared
// script-level variable or a live DOM read into another page's markup.

// Cloudflare Web Analytics — injected here so every page gets it via this one shared script.
(function () {
  const s = document.createElement('script');
  s.type = 'module';
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', '{"token": "023d624f5e7e4815b6172a9022bfbd68"}');
  document.head.appendChild(s);
})();

const $ = id => document.getElementById(id);
const num = id => parseFloat($(id).value) || 0;
const fmt = (n, cur) => {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  return sign + (cur === 'CAD' ? 'CA$' : '$') + n.toLocaleString('en-US');
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---- Theme (dark mode) ----
const THEME_KEY = 'ccfire:theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode';
}
function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch (e) { }
  if (!theme) theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(theme);
}
// Wires the header's dark-mode button on every page. A page that needs to redraw something
// CSS-color-dependent (a canvas chart) after a theme flip should set window.onThemeChange
// before calling this; pages with nothing to redraw can leave it unset.
function initThemeToggle() {
  const btn = $('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { }
    if (typeof window.onThemeChange === 'function') window.onThemeChange(next);
  });
}

// ==================================================================
// Storage: the single cross-tool source of truth
// ==================================================================
const STORAGE_KEY = 'ccfire:v2';
const FIELD_IDS = ['currentAge', 'retireAge', 'contribFreq', 'rrspBal', 'rrspContrib', 'rrspMatch', 'tfsaBal', 'tfsaContrib',
  'nonregCadBal', 'nonregCadContrib', 'fhsaBal', 'fhsaContrib', 'respBal', 'respContrib',
  'k401Bal', 'k401Contrib', 'k401Match', 'iraBal', 'iraContrib', 'rothBal', 'rothContrib',
  'taxableUsdBal', 'taxableUsdContrib', 'hsaBal', 'hsaContrib', 'exchangeRate', 'reportCurrency', 'stopAtCoast', 'returnRate', 'inflationRate',
  'withdrawalRate', 'monthlyExpenses', 'cppMonthly', 'oasYears', 'oasMonthly', 'ssMonthly', 'benefitsStartAge',
  // Departure Tax Estimator
  'dtNonregFmv', 'dtNonregAcb', 'dtOtherFmv', 'dtOtherAcb', 'dtMarginalRate',
  // Claiming-Age Optimizer
  'claimCppBase', 'claimOasBase', 'claimSsBase', 'claimCppAge', 'claimOasAge', 'claimSsAge', 'claimPlanToAge',
  // Moving Back to Canada
  'mbIsCitizen', 'mbHasGreenCard', 'mbGreenCardYears', 'mbNetWorth', 'mbTaxLiability',
  // RRSP Withholding Tax
  'rwWithdrawalType', 'rwRrspAtRetirement'];

// The shipped example scenario's values, one per FIELD_IDS entry. Extracted directly from the
// original single-page HTML's `value="..."` attributes (captured before any prefill/JS could
// touch them). This used to be computed at runtime via captureCurrentScenario() against the
// live DOM — that only worked because every field lived on the one page. Now that fields are
// split across pages, no single page's DOM has all of them, so this has to be a static table.
const DEFAULT_FIELD_VALUES = {
  currentAge: '34', retireAge: '60', contribFreq: 'monthly', rrspBal: '60000', rrspContrib: '400', rrspMatch: '0',
  tfsaBal: '25000', tfsaContrib: '200', nonregCadBal: '10000', nonregCadContrib: '100', fhsaBal: '0', fhsaContrib: '0',
  respBal: '0', respContrib: '0', k401Bal: '45000', k401Contrib: '500', k401Match: '0', iraBal: '8000', iraContrib: '50',
  rothBal: '12000', rothContrib: '150', taxableUsdBal: '15000', taxableUsdContrib: '200', hsaBal: '0', hsaContrib: '0',
  exchangeRate: '0.73', reportCurrency: 'USD', stopAtCoast: 'no', returnRate: '7', inflationRate: '2.5',
  withdrawalRate: '4', monthlyExpenses: '5000', cppMonthly: '900', oasYears: '18', oasMonthly: '334', ssMonthly: '2000',
  benefitsStartAge: '65',
  dtNonregFmv: '10000', dtNonregAcb: '7000', dtOtherFmv: '0', dtOtherAcb: '0', dtMarginalRate: '35',
  claimCppBase: '900', claimOasBase: '334', claimSsBase: '2000', claimCppAge: '65', claimOasAge: '65', claimSsAge: '67', claimPlanToAge: '90',
  mbIsCitizen: 'no', mbHasGreenCard: 'no', mbGreenCardYears: '0', mbNetWorth: '0', mbTaxLiability: '0',
  rwWithdrawalType: '0.25', rwRrspAtRetirement: '0'
};

function storageAvailable() {
  try { const k = '__t__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
  catch (e) { return false; }
}
const hasStorage = storageAvailable();

function readRawStore() {
  if (!hasStorage) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

// What every tool page uses to read another tool's saved inputs instead of reaching into
// that tool's DOM (which doesn't exist on this page). Always returns every FIELD_IDS key,
// falling back to the shipped example value for anything never saved yet.
function readStoredInputs() {
  const stored = readRawStore();
  const out = {};
  FIELD_IDS.forEach(id => { out[id] = stored[id] !== undefined ? stored[id] : DEFAULT_FIELD_VALUES[id]; });
  return out;
}

// Read-modify-write a specific set of fields into ccfire:v2 without touching the DOM — for
// writes that target fields that don't exist on the current page (e.g. Benefit Timing's
// "Apply to my CoastFIRE plan" button updating the calculator's cppMonthly/oasMonthly/etc.
// from a different page).
function writeStoredInputs(patch) {
  if (!hasStorage) return;
  const stored = readRawStore();
  FIELD_IDS.forEach(id => { if (stored[id] === undefined) stored[id] = DEFAULT_FIELD_VALUES[id]; });
  Object.assign(stored, patch);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch (e) { /* ignore quota/availability errors */ }
}

// Saves this page's own fields into ccfire:v2. Merges with whatever's already stored rather
// than replacing it outright — each tool page only has its own fields in the DOM, so a plain
// "build data fresh from FIELD_IDS" would silently drop every other tool's saved values.
function saveInputs() {
  if (!hasStorage) return;
  try {
    const data = readRawStore();
    FIELD_IDS.forEach(id => { const el = $(id); if (el) data[id] = el.value; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* ignore quota/availability errors */ }
}
// Restores whichever of this page's own fields have a saved value. Safe as-is post-split:
// it only ever touches elements that exist in the current DOM.
function restoreInputs() {
  if (!hasStorage) return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    FIELD_IDS.forEach(id => { const el = $(id); if (el && data[id] !== undefined) el.value = data[id]; });
    return true;
  } catch (e) { return false; }
}

// ==================================================================
// Named scenarios (separate from the single autosave slot above)
// ==================================================================
const SCENARIOS_KEY = 'ccfire:scenarios';
function loadScenariosStore() {
  if (!hasStorage) return {};
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveScenariosStore(store) {
  if (!hasStorage) return;
  try { localStorage.setItem(SCENARIOS_KEY, JSON.stringify(store)); } catch (e) { }
}

// ==================================================================
// CoastFIRE projection engine — accepts a snapshot object (e.g. from readStoredInputs()) so
// it never needs the calculator's own DOM to be present.
// ==================================================================
function convertToReport(cadAmt, usdAmt, reportCurrency, rate) {
  if (rate <= 0) rate = 0.0001;
  return reportCurrency === 'USD' ? (cadAmt * rate + usdAmt) : (usdAmt / rate + cadAmt);
}

function compute(overrides) {
  overrides = overrides || {};
  const raw = id => (overrides[id] !== undefined ? overrides[id] : $(id).value);
  const val = id => parseFloat(raw(id)) || 0;

  const currentAge = val('currentAge');
  const retireAge = val('retireAge');
  const n = Math.max(0, Math.round(retireAge - currentAge));
  const freqMult = raw('contribFreq') === 'monthly' ? 12 : 1;
  const returnRate = val('returnRate') / 100;
  const inflationRate = val('inflationRate') / 100;
  const withdrawalRate = Math.max(0.001, val('withdrawalRate') / 100);
  const stopAtCoast = raw('stopAtCoast');
  const reportCurrency = raw('reportCurrency');
  const exchangeRate = val('exchangeRate') || 0.73;
  const monthlyExpenses = val('monthlyExpenses');
  const cppMonthly = val('cppMonthly'), oasMonthly = val('oasMonthly'), ssMonthly = val('ssMonthly');
  const benefitsStartAge = val('benefitsStartAge');

  const bal = {
    rrsp: val('rrspBal'), tfsa: val('tfsaBal'), nonregCad: val('nonregCadBal'), fhsa: val('fhsaBal'), resp: val('respBal'),
    k401: val('k401Bal'), ira: val('iraBal'), roth: val('rothBal'), taxableUsd: val('taxableUsdBal'), hsa: val('hsaBal')
  };
  const contribAnnual = {
    rrsp: (val('rrspContrib') + val('rrspMatch')) * freqMult, tfsa: val('tfsaContrib') * freqMult,
    nonregCad: val('nonregCadContrib') * freqMult, fhsa: val('fhsaContrib') * freqMult, resp: val('respContrib') * freqMult,
    k401: (val('k401Contrib') + val('k401Match')) * freqMult, ira: val('iraContrib') * freqMult,
    roth: val('rothContrib') * freqMult, taxableUsd: val('taxableUsdContrib') * freqMult, hsa: val('hsaContrib') * freqMult
  };
  const startBal = { ...bal };

  const futureMonthlyExpense = monthlyExpenses * Math.pow(1 + inflationRate, n);
  const futureAnnualExpense = futureMonthlyExpense * 12;

  // Government benefits, converted to the reporting currency (treated as already
  // being in "retirement-year" dollars, since CPP/OAS/SS are indexed and typically
  // entered as the amount you'd expect when you claim them).
  const annualGovBenefit = convertToReport((cppMonthly + oasMonthly) * 12, ssMonthly * 12, reportCurrency, exchangeRate);
  const annualGapAfterBenefits = Math.max(0, futureAnnualExpense - annualGovBenefit);
  const bridgeYears = Math.max(0, benefitsStartAge - retireAge);

  // Bridge years (retirement -> benefits start): portfolio funds 100% of expenses.
  const pvBridge = bridgeYears > 0
    ? (returnRate > 0
      ? futureAnnualExpense * (1 - Math.pow(1 + returnRate, -bridgeYears)) / returnRate
      : futureAnnualExpense * bridgeYears)
    : 0;
  // After benefits start: portfolio only needs to cover the gap, valued back to retirement age.
  const pvPostBenefit = (annualGapAfterBenefits / withdrawalRate) / Math.pow(1 + returnRate, bridgeYears);

  const requiredAtRetirement = pvBridge + pvPostBenefit;
  const coastNumberAt = yrsRemaining => requiredAtRetirement / Math.pow(1 + returnRate, Math.max(0, yrsRemaining));

  const currentYear = new Date().getFullYear();
  let coastedFlag = false, coastYearIndex = null;
  const rows = [];

  for (let i = 0; i <= n; i++) {
    const age = currentAge + i;
    const yrsRemaining = n - i;
    const cadTotal = bal.rrsp + bal.tfsa + bal.nonregCad + bal.fhsa + bal.resp;
    const usdTotal = bal.k401 + bal.ira + bal.roth + bal.taxableUsd + bal.hsa;
    const combined = convertToReport(cadTotal, usdTotal, reportCurrency, exchangeRate);
    const coastNum = coastNumberAt(yrsRemaining);

    let notes = '';
    if (!coastedFlag && combined >= coastNum) {
      coastedFlag = true;
      coastYearIndex = i;
      notes = 'Reached CoastFIRE number';
    } else if (coastedFlag && stopAtCoast === 'yes') {
      notes = 'Coasting — contributions paused';
    } else if (coastedFlag) {
      notes = 'Past CoastFIRE number';
    }

    rows.push({
      year: currentYear + i, age,
      rrsp: bal.rrsp, tfsa: bal.tfsa, nonregCad: bal.nonregCad, fhsa: bal.fhsa, resp: bal.resp, cadTotal,
      k401: bal.k401, ira: bal.ira, roth: bal.roth, taxableUsd: bal.taxableUsd, hsa: bal.hsa, usdTotal,
      combined, coastNum, notes, isCoastRow: notes === 'Reached CoastFIRE number'
    });

    if (i < n) {
      const mult = (stopAtCoast === 'yes' && coastedFlag) ? 0 : 1;
      bal.rrsp = bal.rrsp * (1 + returnRate) + contribAnnual.rrsp * mult;
      bal.tfsa = bal.tfsa * (1 + returnRate) + contribAnnual.tfsa * mult;
      bal.nonregCad = bal.nonregCad * (1 + returnRate) + contribAnnual.nonregCad * mult;
      bal.fhsa = bal.fhsa * (1 + returnRate) + contribAnnual.fhsa * mult;
      bal.resp = bal.resp * (1 + returnRate) + contribAnnual.resp * mult;
      bal.k401 = bal.k401 * (1 + returnRate) + contribAnnual.k401 * mult;
      bal.ira = bal.ira * (1 + returnRate) + contribAnnual.ira * mult;
      bal.roth = bal.roth * (1 + returnRate) + contribAnnual.roth * mult;
      bal.taxableUsd = bal.taxableUsd * (1 + returnRate) + contribAnnual.taxableUsd * mult;
      bal.hsa = bal.hsa * (1 + returnRate) + contribAnnual.hsa * mult;
    }
  }

  return {
    currentAge, retireAge, n, reportCurrency, exchangeRate, requiredAtRetirement,
    coastNumberToday: coastNumberAt(n), rows, coastYearIndex, currentYear, stopAtCoast,
    annualGovBenefit, annualGapAfterBenefits, bridgeYears, futureAnnualExpense,
    cppMonthly, oasMonthly, ssMonthly, returnRate, withdrawalRate, benefitsStartAge,
    cadTotalToday: rows[0].cadTotal, usdTotalToday: rows[0].usdTotal, startBal
  };
}

// Recompute the two headline totals at an arbitrary exchange rate, holding every
// other input fixed — used for the sensitivity table.
function computeAtRate(res, rate) {
  const combined = convertToReport(res.cadTotalToday, res.usdTotalToday, res.reportCurrency, rate);
  const annualGov = convertToReport((res.cppMonthly + res.oasMonthly) * 12, res.ssMonthly * 12, res.reportCurrency, rate);
  const annualGap = Math.max(0, res.futureAnnualExpense - annualGov);
  const pvBridge = res.bridgeYears > 0
    ? (res.returnRate > 0
      ? res.futureAnnualExpense * (1 - Math.pow(1 + res.returnRate, -res.bridgeYears)) / res.returnRate
      : res.futureAnnualExpense * res.bridgeYears)
    : 0;
  const pvPostBenefit = (annualGap / res.withdrawalRate) / Math.pow(1 + res.returnRate, res.bridgeYears);
  const required = pvBridge + pvPostBenefit;
  const coastNumber = required / Math.pow(1 + res.returnRate, res.n);
  return { combined, coastNumber };
}

// ==================================================================
// Benefit claiming-age factors — used by Benefit Timing's own page and by the
// calculator's PDF export.
// ==================================================================
function cppFactor(age) {
  if (age < 65) return 1 - 0.006 * (65 - age) * 12;
  if (age > 65) return 1 + 0.007 * (age - 65) * 12;
  return 1;
}
function oasFactor(age) {
  if (age > 65) return 1 + 0.006 * (age - 65) * 12;
  return 1;
}
function ssFactor(age) {
  const FRA = 67;
  if (age < FRA) {
    const monthsEarly = (FRA - age) * 12;
    const first36 = Math.min(monthsEarly, 36);
    const extra = Math.max(0, monthsEarly - 36);
    return 1 - (first36 * (5 / 9) / 100 + extra * (5 / 12) / 100);
  }
  if (age > FRA) return 1 + (age - FRA) * 12 * (2 / 3) / 100;
  return 1;
}
function breakevenAge(ageEarly, amtEarly, ageLate, amtLate) {
  if (amtLate <= amtEarly) return null;
  return (amtLate * ageLate - amtEarly * ageEarly) / (amtLate - amtEarly);
}
