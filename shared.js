// Shared utilities loaded by every page, before that page's own inline <script>.
// Kept deliberately DOM-independent where possible (compute/readStoredInputs/etc.) so any
// tool page can use them even though it only has its own fields in the DOM — every other
// tool's data comes from localStorage['ccfire:v2'] via readStoredInputs(), not from a shared
// script-level variable or a live DOM read into another page's markup.

// Cloudflare Web Analytics — injected here so every page gets it via this one shared script.
// Guarded so this file can also be `require()`d under Node (no `document`) for unit tests.
if (typeof document !== 'undefined') {
  (function () {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', '{"token": "023d624f5e7e4815b6172a9022bfbd68"}');
    document.head.appendChild(s);
  })();
}

const $ = id => document.getElementById(id);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Escape a value for safe interpolation into HTML text content and double-quoted attributes.
// Use for any string that did not originate from our own source code (user input, localStorage,
// imported JSON) before it goes into a template literal that's assigned to innerHTML.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

// Hardens a name field arriving from imported JSON (untrusted, unlike a same-origin form field
// that's already length-capped by the browser via maxlength). Strips control characters and caps
// length so a hostile export file can't smuggle either into localStorage.
function sanitizeImportedName(raw) {
  if (typeof raw !== 'string') return 'Untitled scenario';
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return cleaned.slice(0, 80) || 'Untitled scenario';
}

// Strips thousands-separator commas (and a stray currency symbol) before parsing, so a
// comma-formatted field like "60,000" reads as 60000, not 60 — see COMMA_FIELDS below.
// Safe to call on a value that never had commas; behaves exactly like parseFloat(...) || 0 then.
function parseNum(str) {
  if (typeof str === 'number') return str;
  if (str === undefined || str === null) return 0;
  const n = parseFloat(String(str).replace(/[,$]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
const num = id => parseNum($(id).value);
const fmt = (n, cur) => {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  return sign + (cur === 'CAD' ? 'CA$' : '$') + n.toLocaleString('en-US');
};

// ==================================================================
// Formatted currency inputs — dollar-amount fields (balances, contributions, benefit amounts)
// get thousands-separator commas for readability; age/year/rate/percentage fields don't (short
// values, commas add nothing there) and stay plain <input type="number">. A comma field is
// type="text" with inputmode="decimal" in its markup, since native <input type="number"> rejects
// commas outright.
//
// Mechanism is format-on-blur, not live-format-while-typing: cursor-position math for inserting
// commas as someone types is genuinely fiddly (each inserted/removed comma shifts every digit
// after it) with zero precedent elsewhere in this codebase, so building that untested across
// every comma field at once is a bigger risk than the polish is worth. Instead: focus strips
// back to plain digits (editing is always against a raw number), blur reformats with commas, and
// restoreInputs()/applyScenario()/applyQueryParams() run the same blur-formatter once after
// setting a value so a returning visitor sees "60,000" immediately, not after their first blur.
// ==================================================================
const COMMA_FIELDS = new Set([
  'monthlyExpenses', 'rrspBal', 'rrspContrib', 'rrspMatch', 'tfsaBal', 'tfsaContrib',
  'nonregCadBal', 'nonregCadContrib', 'k401Bal', 'k401Contrib', 'k401Match', 'iraBal', 'iraContrib',
  'rothBal', 'rothContrib', 'taxableUsdBal', 'taxableUsdContrib', 'fhsaBal', 'fhsaContrib',
  'respBal', 'respContrib', 'hsaBal', 'hsaContrib', 'cppMonthly', 'oasMonthly', 'ssMonthly',
  'dtNonregFmv', 'dtNonregAcb', 'dtOtherFmv', 'dtOtherAcb', 'rwRrspAtRetirement',
  'claimCppBase', 'claimOasBase', 'claimSsBase',
  'ddoRrspBal', 'ddoTfsaBal', 'ddoNonregCadBal', 'ddoK401Bal', 'ddoIraBal', 'ddoRothBal', 'ddoTaxableUsdBal',
  'mbNetWorth', 'mbTaxLiability'
]);
function formatCommaFieldValue(el) {
  const n = parseNum(el.value);
  el.value = n === 0 && el.value.trim() === '' ? '' : String(n.toLocaleString('en-US', { maximumFractionDigits: 2 }));
}
// Wires focus/blur formatting on every COMMA_FIELDS element present in the current page's DOM.
// Safe to call once per page on load — a page only has its own fields, so this naturally no-ops
// for every id not present here.
function initCurrencyInputFormatting() {
  COMMA_FIELDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    formatCommaFieldValue(el); // format whatever value is already in the DOM (page defaults)
    el.addEventListener('focus', () => { el.value = parseNum(el.value) === 0 && el.value.trim() === '' ? '' : String(parseNum(el.value)); });
    el.addEventListener('blur', () => formatCommaFieldValue(el));
  });
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---- Theme (dark mode) ----
const THEME_KEY = 'ccfire:theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('themeToggle');
  // innerHTML (not textContent) so the icon-only mobile layout's nested .btn-label survives a toggle.
  if (btn) {
    btn.innerHTML = theme === 'dark'
      ? '<span class="icon" data-icon="sun" aria-hidden="true">☀️</span><span class="btn-label"> Light mode</span>'
      : '<span class="icon" data-icon="moon" aria-hidden="true">🌙</span><span class="btn-label"> Dark mode</span>';
    hydrateChromeIcons();
  }
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

// Wires the header's mobile-only hamburger button — the full page-nav link list stays visible
// (and this button stays hidden) at desktop widths via CSS; this only toggles the collapsed
// dropdown state used below the 760px breakpoint.
function initMobileNav() {
  const btn = $('navToggleBtn');
  const nav = $('pageNav');
  if (!btn || !nav) return;
  function setOpen(open) {
    nav.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.innerHTML = open
      ? '<span class="icon" data-icon="x" aria-hidden="true">✕</span><span class="btn-label"> Close</span>'
      : '<span class="icon" data-icon="menu" aria-hidden="true">☰</span><span class="btn-label"> Menu</span>';
    hydrateChromeIcons();
  }
  btn.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', e => {
    if (nav.classList.contains('nav-open') && !nav.contains(e.target) && e.target !== btn) setOpen(false);
  });
}

// ---- Stale-data nudge ----
// Shows a dismissible banner (in a page's #staleBanner container, if present) when it's been a
// while since any tool page last wrote to ccfire:v2 — a reminder to refresh assumptions rather
// than an error state, so dismissing it just snoozes it instead of hiding it forever.
function initStaleBanner() {
  const el = $('staleBanner');
  if (!el || !hasStorage) return;
  let lastSaved, snoozeUntil;
  try {
    lastSaved = parseInt(localStorage.getItem(LAST_SAVED_KEY), 10);
    snoozeUntil = parseInt(localStorage.getItem(STALE_SNOOZE_KEY), 10) || 0;
  } catch (e) { return; }
  if (!lastSaved) return; // never saved anything yet — still on the shipped example, nothing to go stale
  const days = Math.floor((Date.now() - lastSaved) / 86400000);
  if (days < STALE_THRESHOLD_DAYS || Date.now() < snoozeUntil) return;

  const monthsAgo = Math.round(days / 30);
  el.innerHTML = `
    <div class="sb-icon"><span class="icon" data-icon="clock" aria-hidden="true">🕓</span></div>
    <div class="sb-text"><strong>Your numbers are getting stale.</strong> You last updated your inputs
      about ${monthsAgo} month${monthsAgo === 1 ? '' : 's'} ago (${days} days) — balances, contribution
      amounts, and benefit estimates likely need a refresh for accurate results.</div>
    <a href="/coastfire-calculator"><button type="button">Update my numbers</button></a>
    <button type="button" class="sb-dismiss" id="staleDismissBtn">Remind me later</button>`;
  hydrateChromeIcons();
  el.hidden = false;
  el.className = 'sample-banner stale-banner';
  $('staleDismissBtn').addEventListener('click', () => {
    try { localStorage.setItem(STALE_SNOOZE_KEY, String(Date.now() + STALE_SNOOZE_DAYS * 86400000)); } catch (e) { }
    el.hidden = true;
  });
}

// ==================================================================
// Glossary tooltips — a shared, accessible popover for cross-border jargon (PFIC, FBAR,
// deemed disposition, etc.). Any page marks up a term as
// `<button type="button" class="gterm" data-term="pfic">PFIC</button>` and calls
// initGlossaryTerms() once; one popover element is created lazily and reused for every term
// on the page, opened on click/hover/focus and closed on Escape, outside click, or scroll.
// ==================================================================
const GLOSSARY = {
  pfic: { label: 'PFIC', def: 'Passive Foreign Investment Company — how the IRS classifies most non-US mutual funds and ETFs, including most Canadian ones. Owning one as a US person can trigger punitive tax treatment and extra annual filing (Form 8621).' },
  fbar: { label: 'FBAR', def: 'A FinCEN report (not a tax form) that US persons must file if the combined balance of their non-US financial accounts exceeded $10,000 at any point in the year.' },
  fatca: { label: 'FATCA', def: 'Foreign Account Tax Compliance Act — requires foreign banks to report US-person account holders to the IRS, and requires those account holders to file Form 8938 above certain thresholds.' },
  deemedDisposition: { label: 'Deemed disposition', def: "Canada's departure-tax rule: when you cease Canadian tax residency, the CRA treats most of your property as sold at fair market value the day before you leave, even though you didn't actually sell it." },
  totalization: { label: 'Totalization', def: 'The Canada-US Social Security Agreement — lets you combine CPP/QPP and US Social Security credits to qualify for benefits you would not qualify for on either country\'s work history alone.' },
  withholdingTax: { label: 'Withholding tax', def: 'Tax withheld at source by Canada on RRSP/RRIF payments to a non-resident — 25% on a lump sum, 15% on periodic payments under the Canada-US tax treaty — before any additional US tax you may owe.' },
  rrif: { label: 'RRIF', def: 'Registered Retirement Income Fund — what an RRSP typically converts into to start mandatory minimum withdrawals, usually by the end of the year you turn 71.' },
  exitTax: { label: 'Exit tax (US)', def: "The US's own departure tax (IRC Section 877A) for certain long-term Green Card holders or citizens who expatriate — can deem worldwide assets sold on the way out, separate from Canada's deemed disposition." },
  longTermResident: { label: 'Long-Term Resident', def: 'A Green Card holder who has held it in 8 or more of the last 15 tax years — crossing this threshold can subject you to the US exit tax if you later give up the Green Card.' },
  section217: { label: 'Section 217 election', def: 'Lets a non-resident choose to be taxed on certain Canadian-source pension income (including RRSP/RRIF withdrawals) as if still a Canadian resident — can beat the flat withholding rate if total income is modest.' },
  rrsp: { label: 'RRSP', def: "Registered Retirement Savings Plan — Canada's tax-deferred retirement account, roughly analogous to a US Traditional 401(k)/IRA." },
  tfsa: { label: 'TFSA', def: "Tax-Free Savings Account — grows and withdraws tax-free in Canada, but the IRS doesn't recognize that status for US persons, so it's often treated as a PFIC-holding taxable account instead." }
};

let gtermPopoverEl = null;
let gtermHideTimer = null;
function closeGtermPopover() {
  clearTimeout(gtermHideTimer);
  if (!gtermPopoverEl || gtermPopoverEl.hidden) return;
  gtermPopoverEl.hidden = true;
  const openTrigger = document.querySelector('.gterm[aria-expanded="true"]');
  if (openTrigger) { openTrigger.setAttribute('aria-expanded', 'false'); openTrigger.removeAttribute('aria-describedby'); }
}
function scheduleGtermHide() { clearTimeout(gtermHideTimer); gtermHideTimer = setTimeout(closeGtermPopover, 250); }
function openGtermPopover(trigger) {
  clearTimeout(gtermHideTimer);
  const entry = GLOSSARY[trigger.dataset.term];
  if (!entry) return;
  if (!gtermPopoverEl) {
    gtermPopoverEl = document.createElement('div');
    gtermPopoverEl.className = 'gterm-popover';
    gtermPopoverEl.id = 'gtermPopover';
    gtermPopoverEl.setAttribute('role', 'tooltip');
    gtermPopoverEl.hidden = true;
    gtermPopoverEl.addEventListener('mouseenter', () => clearTimeout(gtermHideTimer));
    gtermPopoverEl.addEventListener('mouseleave', scheduleGtermHide);
    document.body.appendChild(gtermPopoverEl);
  }
  gtermPopoverEl.innerHTML = `<strong>${entry.label}</strong><br>${entry.def}`;
  gtermPopoverEl.hidden = false;
  const r = trigger.getBoundingClientRect();
  gtermPopoverEl.style.top = (window.scrollY + r.bottom + 6) + 'px';
  const maxLeft = window.scrollX + document.documentElement.clientWidth - gtermPopoverEl.offsetWidth - 8;
  gtermPopoverEl.style.left = Math.max(8, Math.min(window.scrollX + r.left, maxLeft)) + 'px';
  document.querySelectorAll('.gterm[aria-expanded="true"]').forEach(b => { if (b !== trigger) b.setAttribute('aria-expanded', 'false'); });
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-describedby', 'gtermPopover');
}
function initGlossaryTerms() {
  const triggers = document.querySelectorAll('.gterm[data-term]');
  if (!triggers.length) return;
  triggers.forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', e => { e.stopPropagation(); openGtermPopover(btn); });
    btn.addEventListener('mouseenter', () => openGtermPopover(btn));
    btn.addEventListener('mouseleave', scheduleGtermHide);
    btn.addEventListener('focus', () => openGtermPopover(btn));
    btn.addEventListener('blur', closeGtermPopover);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGtermPopover(); });
  document.addEventListener('click', e => { if (!e.target.closest('.gterm') && !e.target.closest('.gterm-popover')) closeGtermPopover(); });
  window.addEventListener('scroll', closeGtermPopover, true);
  window.addEventListener('resize', closeGtermPopover);
}

// ==================================================================
// Ctrl/Cmd+K tool search — a small overlay listing every tool on the site, filtered by
// substring match on name + description. Lazily built the first time it's opened, same
// pattern as the glossary popover above. Tools-only in this first version — no glossary terms.
// ==================================================================
// Same small line-icon set used by the homepage tool-directory cards and each tool page's own
// <h2> — kept as raw SVG strings here (rather than emoji) so the search modal stays visually
// consistent with those other two surfaces.
const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  compass: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="9"/><polygon points="12,7 13.5,12 12,17 10.5,12" fill="currentColor" stroke="none"/></svg>`,
  checkSquare: `<svg ${SVG_ATTRS}><rect x="3" y="3" width="18" height="18" rx="3"/><polyline points="7,12.5 10.5,16 17,8"/></svg>`,
  departure: `<svg ${SVG_ATTRS}><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M20 12H10"/><path d="M15 7l5 5-5 5"/></svg>`,
  landmark: `<svg ${SVG_ATTRS}><path d="M3 10l9-6 9 6"/><path d="M4 10v9"/><path d="M9 10v9"/><path d="M15 10v9"/><path d="M20 10v9"/><path d="M2 21h20"/></svg>`,
  calendar: `<svg ${SVG_ATTRS}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>`,
  barChart: `<svg ${SVG_ATTRS}><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/><path d="M2 20h20"/></svg>`,
  leaf: `<svg ${SVG_ATTRS}><path d="M6 20C6 11 12 4 20 4c0 8-7 14-16 16z"/><path d="M6 20l6-6"/></svg>`,
  columns: `<svg ${SVG_ATTRS}><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></svg>`,
  home: `<svg ${SVG_ATTRS}><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>`,
  lock: `<svg ${SVG_ATTRS}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  search: `<svg ${SVG_ATTRS}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`,
  moon: `<svg ${SVG_ATTRS}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
  sun: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`,
  menu: `<svg ${SVG_ATTRS}><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>`,
  x: `<svg ${SVG_ATTRS}><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>`,
  clock: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  link: `<svg ${SVG_ATTRS}><path d="M9 17H7a5 5 0 0 1 0-10h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><path d="M8 12h8"/></svg>`,
  printer: `<svg ${SVG_ATTRS}><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M6 17v4h12v-4"/></svg>`,
  download: `<svg ${SVG_ATTRS}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>`,
  save: `<svg ${SVG_ATTRS}><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`
};

// Populates every `<span class="icon" data-icon="name">emoji</span>` placeholder with the
// matching ICONS entry, replacing the emoji fallback content. The fallback stays in the markup
// (not an empty span) so a bootstrap failure upstream of this call degrades to today's emoji
// rather than a blank icon slot.
function hydrateChromeIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const icon = ICONS[el.dataset.icon];
    if (icon) el.innerHTML = icon;
  });
}

const SEARCH_TOOLS = [
  { icon: ICONS.compass, title: 'CoastFIRE Calculator', desc: 'The core cross-border retirement calculator — see when your portfolio can coast.', href: '/coastfire-calculator' },
  { icon: ICONS.checkSquare, title: 'Your Action Items', desc: "A prioritized checklist of deadlines and to-dos based on what you've entered.", href: '/action-items' },
  { icon: ICONS.departure, title: 'Departure Tax Estimator', desc: 'Leaving Canada? Estimate the one-time deemed-disposition tax bill.', href: '/departure-tax' },
  { icon: ICONS.landmark, title: 'RRSP Withholding Tax', desc: 'See how much Canada withholds when you draw down your RRSP as a US resident.', href: '/rrsp-withholding' },
  { icon: ICONS.calendar, title: 'Benefit Claiming-Age Optimizer', desc: 'Compare claiming CPP, OAS & Social Security early vs. late.', href: '/benefit-timing' },
  { icon: ICONS.barChart, title: 'Drawdown-Order Optimizer', desc: 'Sequence RRSP, TFSA, 401(k)/IRA, Roth & taxable withdrawals to minimize tax in retirement.', href: '/drawdown-optimizer' },
  { icon: ICONS.leaf, title: 'Moving Back to Canada', desc: 'Re-entering Canada? See what happens to each account and whether exit-tax rules apply.', href: '/moving-back' },
  { icon: ICONS.columns, title: 'Compare Scenarios', desc: 'Put two saved scenarios side by side — key numbers and portfolio path, without touching your current inputs.', href: '/compare-scenarios' },
  { icon: ICONS.home, title: 'All Tools (Home)', desc: 'Your snapshot, the "where do I start" quiz, and the full tool directory.', href: '/' }
];

let toolSearchEl = null, toolSearchInputEl = null, toolSearchResultsEl = null,
  toolSearchActiveIndex = 0, toolSearchFiltered = [];

function buildToolSearchModal() {
  toolSearchEl = document.createElement('div');
  toolSearchEl.className = 'tool-search-overlay';
  toolSearchEl.hidden = true;
  toolSearchEl.innerHTML = `
    <div class="tool-search-modal" role="dialog" aria-modal="true" aria-label="Search tools">
      <input type="text" id="toolSearchInput" placeholder="Search tools by name..." autocomplete="off">
      <ul class="tool-search-results" id="toolSearchResults"></ul>
    </div>`;
  document.body.appendChild(toolSearchEl);
  toolSearchInputEl = document.getElementById('toolSearchInput');
  toolSearchResultsEl = document.getElementById('toolSearchResults');

  toolSearchEl.addEventListener('click', e => { if (e.target === toolSearchEl) closeToolSearch(); });
  toolSearchResultsEl.addEventListener('click', e => {
    const item = e.target.closest('.tsr-item');
    if (item && item.dataset.href) window.location.href = item.dataset.href;
  });
  toolSearchInputEl.addEventListener('input', renderToolSearchResults);
  toolSearchInputEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveToolSearchSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveToolSearchSelection(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const t = toolSearchFiltered[toolSearchActiveIndex];
      if (t) window.location.href = t.href;
    } else if (e.key === 'Escape') { closeToolSearch(); }
  });
}

function renderToolSearchResults() {
  const q = toolSearchInputEl.value.trim().toLowerCase();
  toolSearchFiltered = !q ? SEARCH_TOOLS : SEARCH_TOOLS.filter(t =>
    t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q));
  toolSearchActiveIndex = 0;
  toolSearchResultsEl.innerHTML = toolSearchFiltered.length
    ? toolSearchFiltered.map((t, i) => `
        <li class="tsr-item${i === 0 ? ' active' : ''}" data-href="${escapeHtml(t.href)}">
          <span class="tsr-icon">${t.icon}</span>
          <span class="tsr-text"><span class="tsr-title">${escapeHtml(t.title)}</span><span class="tsr-desc">${escapeHtml(t.desc)}</span></span>
        </li>`).join('')
    : `<li class="tsr-empty">No tools match "${escapeHtml(toolSearchInputEl.value)}".</li>`;
}

function moveToolSearchSelection(delta) {
  if (!toolSearchFiltered.length) return;
  toolSearchActiveIndex = (toolSearchActiveIndex + delta + toolSearchFiltered.length) % toolSearchFiltered.length;
  [...toolSearchResultsEl.children].forEach((el, i) => el.classList.toggle('active', i === toolSearchActiveIndex));
  const activeEl = toolSearchResultsEl.children[toolSearchActiveIndex];
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function openToolSearch() {
  if (!toolSearchEl) buildToolSearchModal();
  toolSearchEl.hidden = false;
  toolSearchInputEl.value = '';
  renderToolSearchResults();
  toolSearchInputEl.focus();
}
function closeToolSearch() {
  if (toolSearchEl) toolSearchEl.hidden = true;
}

// Wires the header's search button (if present) plus the global Ctrl/Cmd+K shortcut. Safe to
// call on every page even before the modal itself exists, since it's built lazily on first open.
function initToolSearch() {
  const btn = $('searchToolsBtn');
  if (btn) btn.addEventListener('click', openToolSearch);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (toolSearchEl && !toolSearchEl.hidden) closeToolSearch(); else openToolSearch();
    }
  });
}

// ==================================================================
// Soft (non-blocking) sanity warnings — distinct from a page's own hard-error validation.
// Renders into the given container using the same visual language as the stale-data banner,
// so a typo'd rate or an out-of-range percentage gets flagged without stopping the user.
// ==================================================================
function renderSoftWarning(containerId, checks) {
  const el = $(containerId);
  if (!el) return;
  const messages = checks.filter(c => c.condition).map(c => c.message);
  if (!messages.length) { el.hidden = true; return; }
  el.innerHTML = `<div class="sb-icon">⚠️</div><div class="sb-text">${messages.join(' ')}</div>`;
  el.className = 'sample-banner warn-banner';
  el.hidden = false;
}

// ==================================================================
// Live FX rate — network call only; each page owns its own UI state (hint text, button
// labels, caching) around this, same as before the CoastFIRE Calculator's own fetch flow.
// ==================================================================
async function fetchLiveFxRate() {
  const response = await fetch('https://api.frankfurter.dev/v1/latest?from=CAD&to=USD');
  if (!response.ok) throw new Error('API response not OK');
  const data = await response.json();
  const rate = data.rates.USD;
  if (!rate || typeof rate !== 'number') throw new Error('Invalid rate format');
  return rate;
}

// Timestamp of the last time a live-fetched rate was actually applied to exchangeRate — distinct
// from a rate the user typed in by hand, which leaves no stamp. Read by renderFxIndicator() and
// the CoastFIRE Calculator's own fxHint so both can show "(as of ...)" instead of a bare number.
const FX_FETCHED_AT_KEY = 'ccfire:fxFetchedAt';
function stampFxFetched() {
  if (!hasStorage) return;
  try { localStorage.setItem(FX_FETCHED_AT_KEY, String(Date.now())); } catch (e) { }
}
function fxFetchedAtLabel() {
  if (!hasStorage) return '';
  let ts;
  try { ts = parseInt(localStorage.getItem(FX_FETCHED_AT_KEY), 10); } catch (e) { return ''; }
  if (!ts) return '';
  return ' (as of ' + new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')';
}

// For a genuinely first-ever visitor (nothing saved yet under ccfire:v2) landing on any page
// other than the calculator — which already runs its own richer live-fetch flow on load — seed
// a live rate in place of the static 0.73 default. No-ops silently if a rate was ever saved
// (by the user or a prior seed) or if the fetch fails.
function seedLiveFxRateIfNeeded(onSeeded) {
  if (!hasStorage) return;
  if (readRawStore().exchangeRate !== undefined) return;
  fetchLiveFxRate().then(rate => {
    writeStoredInputs({ exchangeRate: rate.toFixed(4) });
    stampFxFetched();
    if (typeof onSeeded === 'function') onSeeded(rate);
  }).catch(() => { /* stays on DEFAULT_FIELD_VALUES.exchangeRate */ });
}

// Renders a small read-only "Using 1 CAD = X USD" line for pages that consume exchangeRate
// but, unlike the CoastFIRE Calculator, don't expose their own field for it.
function renderFxIndicator(containerId) {
  const el = $(containerId);
  if (!el) return;
  const rate = parseFloat(readStoredInputs().exchangeRate) || 0.73;
  el.innerHTML = `Using 1 CAD = ${rate.toFixed(4)} USD${fxFetchedAtLabel()} · <a href="/coastfire-calculator#exchangeRate">edit on the CoastFIRE Calculator</a>`;
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
  'rwWithdrawalType', 'rwRrspAtRetirement',
  // Drawdown-Order Optimizer
  'ddoPlanToAge', 'ddoFilingStatus', 'ddoCapGainsRate',
  'ddoRrspBal', 'ddoTfsaBal', 'ddoK401Bal', 'ddoIraBal', 'ddoRothBal', 'ddoNonregCadBal', 'ddoTaxableUsdBal',
  // One-time life events (CoastFIRE Calculator) — JSON-encoded array, see parseLifeEvents()
  'lifeEvents'];

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
  rwWithdrawalType: '0.25', rwRrspAtRetirement: '0',
  ddoPlanToAge: '90', ddoFilingStatus: 'single', ddoCapGainsRate: '15',
  ddoRrspBal: '0', ddoTfsaBal: '0', ddoK401Bal: '0', ddoIraBal: '0', ddoRothBal: '0', ddoNonregCadBal: '0', ddoTaxableUsdBal: '0',
  lifeEvents: '[]'
};

// Compact 2-stat "your plan so far" strip for the non-CoastFIRE tool pages — a smaller sibling
// of the homepage snapshot (#snapshotCard), reusing the same hasUserData()/compute() pipeline.
// Stays hidden for a first-time visitor, exactly like the homepage version.
function renderCompactSnapshot(containerId, statIds) {
  const container = $(containerId);
  if (!container || !hasUserData()) return;
  const res = compute(readStoredInputs());
  const first = res.rows[0];
  if (statIds.portfolio) $(statIds.portfolio).textContent = fmt(first.combined, res.reportCurrency);
  if (statIds.status) {
    $(statIds.status).textContent = res.coastYearIndex !== null
      ? (res.coastYearIndex === 0 ? 'Already there' : `In ~${res.coastYearIndex} yrs (age ${res.currentAge + res.coastYearIndex})`)
      : 'Not yet on track';
  }
  container.hidden = false;
}

// Timestamp of the last time any tool page actually wrote to ccfire:v2 — used to nudge users
// whose numbers have gone stale, separately from SNOOZE_KEY which mutes that nudge for a while.
const LAST_SAVED_KEY = 'ccfire:lastSaved';
const STALE_SNOOZE_KEY = 'ccfire:staleSnoozeUntil';
const STALE_THRESHOLD_DAYS = 90;
const STALE_SNOOZE_DAYS = 30;
function markSaved() {
  if (!hasStorage) return;
  try { localStorage.setItem(LAST_SAVED_KEY, String(Date.now())); } catch (e) { }
}

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

// True once the user has actually changed at least one tracked field from its shipped-example
// default — distinct from "has ccfire:v2 been written at all" (LAST_SAVED_KEY), since
// seedLiveFxRateIfNeeded() silently writes an exchangeRate for every first-time visitor to any
// page, regardless of whether they've touched anything else. Pages that need to tell "a real
// visitor with their own numbers" apart from "someone who just landed here" should use this,
// not LAST_SAVED_KEY.
function hasUserData() {
  if (!hasStorage) return false;
  const stored = readStoredInputs();
  return FIELD_IDS.some(id => id !== 'exchangeRate' && stored[id] !== DEFAULT_FIELD_VALUES[id]);
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); markSaved(); } catch (e) { /* ignore quota/availability errors */ }
}

// Live "Saved" pulse for the #saveIndicator element (if a page has one), debounced so a burst
// of keystrokes doesn't flash it repeatedly — one 600ms-delayed show, held for 1.5s, per pause.
let saveIndicatorTimer = null, saveIndicatorHideTimer = null;
function showSaveIndicator() {
  const el = $('saveIndicator');
  if (!el) return;
  clearTimeout(saveIndicatorTimer);
  saveIndicatorTimer = setTimeout(() => {
    clearTimeout(saveIndicatorHideTimer);
    el.classList.add('show');
    saveIndicatorHideTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }, 600);
}

// Saves this page's own fields into ccfire:v2. Merges with whatever's already stored rather
// than replacing it outright — each tool page only has its own fields in the DOM, so a plain
// "build data fresh from FIELD_IDS" would silently drop every other tool's saved values.
function saveInputs() {
  if (!hasStorage) return;
  try {
    const data = readRawStore();
    // Comma-formatted fields persist their clean numeric string, never the display string with
    // commas in it — fail-safe rather than fail-silent if some future read site forgets parseNum().
    FIELD_IDS.forEach(id => { const el = $(id); if (el) data[id] = COMMA_FIELDS.has(id) ? String(parseNum(el.value)) : el.value; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    markSaved();
    showSaveIndicator();
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
    FIELD_IDS.forEach(id => {
      const el = $(id);
      if (!el || data[id] === undefined) return;
      el.value = data[id];
      if (COMMA_FIELDS.has(id)) formatCommaFieldValue(el);
    });
    return true;
  } catch (e) { return false; }
}

// ==================================================================
// Animated count-up/down for headline numbers — cancel-safe per element via a WeakMap, so a
// rapid re-render (e.g. the user dragging a slider) cancels any in-flight tween for that element
// instead of stacking requestAnimationFrame loops. Pass fromNumber = undefined/NaN on a page's
// very first render so it sets the value directly with no tween ("slot machine" effect avoided).
//
// requestAnimationFrame is throttled to near-zero in a background/non-visible tab (e.g. a page
// opened in a background tab, or this project's own automated test tooling) — a pure-rAF tween
// would leave the element frozen mid-animation indefinitely in that case, silently showing a
// stale number even though the underlying calculation is correct. A generation counter plus a
// setTimeout fallback guarantees the element reaches the correct final text either way: the
// rAF path animates smoothly when frames are actually being delivered, and the timeout forces
// the exact final value once `durationMs` has passed regardless of whether any frame ran.
// ==================================================================
const animateValueState = new WeakMap(); // el -> { generation, rafId, timeoutId }
function animateValue(el, fromNumber, toNumber, formatFn, durationMs) {
  if (!el) return;
  const existing = animateValueState.get(el);
  if (existing) { cancelAnimationFrame(existing.rafId); clearTimeout(existing.timeoutId); }
  if (!Number.isFinite(fromNumber) || fromNumber === toNumber || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = formatFn(toNumber);
    animateValueState.delete(el);
    return;
  }
  const generation = (existing ? existing.generation : 0) + 1;
  const start = performance.now();
  const duration = durationMs || 500;
  const state = { generation, rafId: null, timeoutId: null };
  function tick(now) {
    if (animateValueState.get(el) !== state) return; // superseded by a newer call
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = formatFn(fromNumber + (toNumber - fromNumber) * eased);
    if (t < 1) { state.rafId = requestAnimationFrame(tick); }
    else { clearTimeout(state.timeoutId); animateValueState.delete(el); }
  }
  state.rafId = requestAnimationFrame(tick);
  state.timeoutId = setTimeout(() => {
    if (animateValueState.get(el) !== state) return; // already finished/superseded
    cancelAnimationFrame(state.rafId);
    el.textContent = formatFn(toNumber);
    animateValueState.delete(el);
  }, duration + 50);
  animateValueState.set(el, state);
}

// ==================================================================
// Shareable scenario link — encodes every FIELD_IDS value present in the current page's DOM
// into a query string, and reads it back the same way. Generic over whatever subset of fields
// a given page actually has, so every tool page can use the same two functions.
// ==================================================================
function buildShareUrl() {
  const params = new URLSearchParams();
  FIELD_IDS.forEach(id => { const el = $(id); if (el) params.set(id, COMMA_FIELDS.has(id) ? String(parseNum(el.value)) : el.value); });
  return window.location.origin + window.location.pathname + '?' + params.toString();
}
function applyQueryParams() {
  const params = new URLSearchParams(window.location.search);
  let applied = false;
  FIELD_IDS.forEach(id => {
    if (params.has(id)) {
      const el = $(id);
      if (el) {
        el.value = params.get(id);
        if (COMMA_FIELDS.has(id)) formatCommaFieldValue(el);
        applied = true;
      }
    }
  });
  return applied;
}
// Shared opacity-fade feedback element, used by both the share-link button and (elsewhere)
// named-scenario saves — each caller owns its own element id/message.
function showTransientFeedback(elId, msg, durationMs) {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(() => { el.style.opacity = 0; }, durationMs || 2500);
}
function initShareLinkButton(btnId, feedbackId) {
  const btn = $(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      showTransientFeedback(feedbackId, 'Link copied — paste it anywhere to share this exact scenario.');
    } catch (e) {
      window.prompt('Copy this link to share your scenario:', url);
    }
  });
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

const ACCOUNT_KEYS = ['rrsp', 'tfsa', 'nonregCad', 'fhsa', 'resp', 'k401', 'ira', 'roth', 'taxableUsd', 'hsa'];
const ACCOUNT_LABELS = {
  rrsp: 'RRSP', tfsa: 'TFSA', nonregCad: 'Non-Registered (CAD)', fhsa: 'FHSA', resp: 'RESP',
  k401: '401(k)/403(b)', ira: 'Traditional IRA', roth: 'Roth IRA', taxableUsd: 'Taxable (USD)', hsa: 'HSA'
};
const CAD_ACCOUNT_KEYS = ['rrsp', 'tfsa', 'nonregCad', 'fhsa', 'resp'];

// One year's compounding step for every account, shared by the deterministic compute() loop
// and the Monte Carlo engine below so the two never drift out of sync with each other.
function stepAccounts(bal, contribAnnual, returnRate, mult) {
  const next = {};
  for (const k of ACCOUNT_KEYS) next[k] = bal[k] * (1 + returnRate) + contribAnnual[k] * mult;
  return next;
}

// ==================================================================
// One-time life events — dated, signed, account-targeted lump sums (house down payment,
// inheritance, relocation costs, tuition) layered on top of the steady-state contribution/growth
// model. Stored as one JSON-encoded FIELD_IDS entry (see 'lifeEvents' above) so autosave, named
// scenarios, share links, and JSON export/import all pick it up automatically like every other
// field, with no dedicated persistence code of its own.
// ==================================================================
function parseLifeEvents(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.filter(e => e && Number.isFinite(e.age) && Number.isFinite(e.amount) && ACCOUNT_LABELS[e.account]);
  } catch (e) { return []; }
}

// Mutates `bal` in place for every event scheduled at `age`. `usdConverted` is true when the
// caller's `bal` already holds CAD-native accounts converted to USD (simulateDrawdown) rather
// than kept in native currency (compute()/simulateMonteCarlo()) — the event amount (always
// entered in the account's native currency) needs the same conversion in that case. Floors at
// zero rather than going negative — an event larger than the account's balance just empties it.
function applyLifeEventsForAge(bal, events, age, exchangeRate, usdConverted) {
  events.forEach(ev => {
    if (ev.age !== age || !Object.prototype.hasOwnProperty.call(bal, ev.account)) return;
    const amt = (usdConverted && CAD_ACCOUNT_KEYS.includes(ev.account)) ? ev.amount * exchangeRate : ev.amount;
    bal[ev.account] = Math.max(0, bal[ev.account] + amt);
  });
}

function compute(overrides) {
  overrides = overrides || {};
  const raw = id => (overrides[id] !== undefined ? overrides[id] : $(id).value);
  const val = id => parseNum(raw(id));

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
  const lifeEvents = parseLifeEvents(raw('lifeEvents'));

  let bal = {
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
    applyLifeEventsForAge(bal, lifeEvents, age, exchangeRate, false);
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
      bal = stepAccounts(bal, contribAnnual, returnRate, mult);
    }
  }

  return {
    currentAge, retireAge, n, reportCurrency, exchangeRate, requiredAtRetirement,
    coastNumberToday: coastNumberAt(n), rows, coastYearIndex, currentYear, stopAtCoast,
    annualGovBenefit, annualGapAfterBenefits, bridgeYears, futureAnnualExpense,
    cppMonthly, oasMonthly, ssMonthly, returnRate, withdrawalRate, benefitsStartAge, inflationRate,
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
// Monte Carlo / sequence-of-returns simulation — reuses compute()'s setup and stepAccounts()
// so the stochastic path never diverges from the deterministic model's semantics. Only the
// *portfolio path* is randomized each trial; the CoastFIRE target line (coastNumberAt) stays
// on the single deterministic returnRate, matching how most retail Monte Carlo tools treat the
// liability side of the plan.
// ==================================================================
function randNormal() {
  let u1 = Math.random(), u2 = Math.random();
  if (u1 === 0) u1 = Number.EPSILON;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function simulateMonteCarlo(overrides, trials, stdevReturn) {
  overrides = overrides || {};
  const raw = id => (overrides[id] !== undefined ? overrides[id] : $(id).value);
  const val = id => parseNum(raw(id));

  const currentAge = val('currentAge');
  const retireAge = val('retireAge');
  const n = Math.max(0, Math.round(retireAge - currentAge));
  const freqMult = raw('contribFreq') === 'monthly' ? 12 : 1;
  const meanReturn = val('returnRate') / 100;
  const inflationRate = val('inflationRate') / 100;
  const withdrawalRate = Math.max(0.001, val('withdrawalRate') / 100);
  const stopAtCoast = raw('stopAtCoast');
  const reportCurrency = raw('reportCurrency');
  const exchangeRate = val('exchangeRate') || 0.73;
  const monthlyExpenses = val('monthlyExpenses');
  const cppMonthly = val('cppMonthly'), oasMonthly = val('oasMonthly'), ssMonthly = val('ssMonthly');
  const benefitsStartAge = val('benefitsStartAge');
  const lifeEvents = parseLifeEvents(raw('lifeEvents'));

  const startBal = {
    rrsp: val('rrspBal'), tfsa: val('tfsaBal'), nonregCad: val('nonregCadBal'), fhsa: val('fhsaBal'), resp: val('respBal'),
    k401: val('k401Bal'), ira: val('iraBal'), roth: val('rothBal'), taxableUsd: val('taxableUsdBal'), hsa: val('hsaBal')
  };
  const contribAnnual = {
    rrsp: (val('rrspContrib') + val('rrspMatch')) * freqMult, tfsa: val('tfsaContrib') * freqMult,
    nonregCad: val('nonregCadContrib') * freqMult, fhsa: val('fhsaContrib') * freqMult, resp: val('respContrib') * freqMult,
    k401: (val('k401Contrib') + val('k401Match')) * freqMult, ira: val('iraContrib') * freqMult,
    roth: val('rothContrib') * freqMult, taxableUsd: val('taxableUsdContrib') * freqMult, hsa: val('hsaContrib') * freqMult
  };

  const futureAnnualExpense = monthlyExpenses * Math.pow(1 + inflationRate, n) * 12;
  const annualGovBenefit = convertToReport((cppMonthly + oasMonthly) * 12, ssMonthly * 12, reportCurrency, exchangeRate);
  const annualGapAfterBenefits = Math.max(0, futureAnnualExpense - annualGovBenefit);
  const bridgeYears = Math.max(0, benefitsStartAge - retireAge);
  const pvBridge = bridgeYears > 0
    ? (meanReturn > 0
      ? futureAnnualExpense * (1 - Math.pow(1 + meanReturn, -bridgeYears)) / meanReturn
      : futureAnnualExpense * bridgeYears)
    : 0;
  const pvPostBenefit = (annualGapAfterBenefits / withdrawalRate) / Math.pow(1 + meanReturn, bridgeYears);
  const requiredAtRetirement = pvBridge + pvPostBenefit;
  const coastNumberAt = yrsRemaining => requiredAtRetirement / Math.pow(1 + meanReturn, Math.max(0, yrsRemaining));

  const currentYear = new Date().getFullYear();
  const paths = []; // trials x (n+1) combined-balance series
  let coastHits = 0;

  for (let t = 0; t < trials; t++) {
    let bal = { ...startBal };
    let coastedFlag = false;
    const path = [];
    for (let i = 0; i <= n; i++) {
      applyLifeEventsForAge(bal, lifeEvents, currentAge + i, exchangeRate, false);
      const cadTotal = bal.rrsp + bal.tfsa + bal.nonregCad + bal.fhsa + bal.resp;
      const usdTotal = bal.k401 + bal.ira + bal.roth + bal.taxableUsd + bal.hsa;
      const combined = convertToReport(cadTotal, usdTotal, reportCurrency, exchangeRate);
      const coastNum = coastNumberAt(n - i);
      if (!coastedFlag && combined >= coastNum) coastedFlag = true;
      path.push(combined);
      if (i < n) {
        const r = Math.max(meanReturn + randNormal() * stdevReturn, -0.95);
        const mult = (stopAtCoast === 'yes' && coastedFlag) ? 0 : 1;
        bal = stepAccounts(bal, contribAnnual, r, mult);
      }
    }
    if (coastedFlag) coastHits++;
    paths.push(path);
  }

  const bands = [];
  for (let i = 0; i <= n; i++) {
    const yearVals = paths.map(p => p[i]).sort((a, b) => a - b);
    const pick = p => yearVals[Math.min(yearVals.length - 1, Math.floor(p / 100 * yearVals.length))];
    bands.push({
      age: currentAge + i, year: currentYear + i,
      p10: pick(10), p25: pick(25), p50: pick(50), p75: pick(75), p90: pick(90),
      coastNum: coastNumberAt(n - i)
    });
  }

  return {
    n, currentAge, retireAge, currentYear, reportCurrency, trials,
    successProb: coastHits / trials, bands, requiredAtRetirement
  };
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

// ==================================================================
// Drawdown-order optimizer — US federal tax data + the year-by-year decumulation engine.
// Everything in this section runs in USD, regardless of the calculator's reportCurrency
// setting, because the US bracket data below is only meaningful in USD: CAD-native balances
// (RRSP/TFSA/non-registered CAD) are converted at the top of simulateDrawdown() using the same
// static exchangeRate the rest of the site already holds fixed for a given scenario.
// ==================================================================

// 2026 tax year, per IRS Revenue Procedure 2025-32 (published Oct 2025).
const US_TAX_BRACKETS_2026 = {
  single: [
    { upTo: 12400, rate: 0.10 }, { upTo: 50400, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 }, { upTo: 256225, rate: 0.32 }, { upTo: 640600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 }
  ],
  mfj: [
    { upTo: 24800, rate: 0.10 }, { upTo: 100800, rate: 0.12 }, { upTo: 211400, rate: 0.22 },
    { upTo: 403550, rate: 0.24 }, { upTo: 512450, rate: 0.32 }, { upTo: 768700, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 }
  ]
};
const US_STANDARD_DEDUCTION_2026 = { single: 16100, mfj: 32200 };

// Canada-US tax treaty non-resident RRSP/RRIF withholding rates — promoted here from the
// rwWithdrawalType <select> literals in rrsp-withholding.html so both pages share one source.
const RRSP_WITHHOLDING_RATES = { lumpSum: 0.25, periodic: 0.15, resident: 0 };

function progressiveTax(taxableIncome, brackets) {
  let tax = 0, prevCap = 0;
  for (const b of brackets) {
    if (taxableIncome <= prevCap) break;
    tax += (Math.min(taxableIncome, b.upTo) - prevCap) * b.rate;
    prevCap = b.upTo;
  }
  return tax;
}
function topOfBracket(rate, brackets) {
  const b = brackets.find(b => b.rate === rate);
  return b ? b.upTo : brackets[brackets.length - 1].upTo;
}
// The taxable-income point above which the next dollar of ordinary income costs more than the
// flat capital-gains rate — i.e. where it becomes cheaper to fund the rest of the year's
// spending from taxable brokerage (or preserve tax-free accounts) than to keep drawing
// ordinary-taxed accounts. Because each year's taxable income resets with a fresh standard
// deduction (this model doesn't carry any "bracket creep" across years — only within a year),
// this rate comparison, not a fixed bracket ceiling, is what actually minimizes total tax.
function ordinaryIncomeCeiling(capGainsRate, brackets) {
  let cap = 0;
  for (const b of brackets) {
    if (b.rate > capGainsRate) break;
    cap = b.upTo;
  }
  return cap;
}
function toUsd(amt, reportCurrency, rate) {
  return reportCurrency === 'USD' ? amt : amt * rate;
}

// Account "pools" grouped by tax treatment. TFSA/Roth are always drawn last across every
// strategy below, since preserving tax-free compounding as long as possible is the one rule
// of thumb that's true regardless of ordering philosophy.
const DRAWDOWN_POOLS = {
  ordinaryCheap: ['k401', 'ira'],   // US ordinary income, no extra withholding layer
  ordinaryRrsp: ['rrsp'],           // US ordinary income + Canadian non-resident withholding
  taxable: ['nonregCad', 'taxableUsd'], // flat simplified capital-gains treatment
  taxFree: ['tfsa', 'roth']
};

// Each strategy is just a priority order over the pools above, run through the identical
// tax/compounding engine — matching the site's existing "enumerate named, explainable
// strategies" style (see strategyTableHtml in benefit-timing.html) rather than a black-box
// solver. `greedy` additionally caps ordinary withdrawals at a bracket-creep ceiling each year
// before spilling into cheaper sources. None of these is guaranteed optimal for every possible
// set of balances/spending — the page that calls simulateDrawdown() for all four should treat
// whichever comes out cheapest as "Recommended" for that user's numbers, rather than assuming
// greedy always wins (labels here deliberately don't claim "Recommended" themselves).
const DRAWDOWN_STRATEGIES = {
  greedy: { label: 'Bracket-filling', order: ['ordinaryCheap', 'ordinaryRrsp', 'taxable', 'taxFree'], capOrdinary: true },
  taxableFirst: { label: 'Taxable first', order: ['taxable', 'ordinaryCheap', 'ordinaryRrsp', 'taxFree'], capOrdinary: false },
  rrspFirst: { label: 'RRSP first', order: ['ordinaryRrsp', 'ordinaryCheap', 'taxable', 'taxFree'], capOrdinary: false },
  proportional: { label: 'Proportional', order: ['ordinaryCheap', 'ordinaryRrsp', 'taxable', 'taxFree'], capOrdinary: false, proportional: true }
};

function drawFromAccounts(accounts, amount, bal, withdrawals) {
  let remaining = amount;
  for (const acc of accounts) {
    if (remaining <= 0) break;
    const take = Math.min(bal[acc], remaining);
    if (take > 0) {
      bal[acc] -= take;
      withdrawals[acc] += take;
      remaining -= take;
    }
  }
  return amount - remaining;
}
function drawProportional(accounts, amount, bal, withdrawals) {
  const totalBal = accounts.reduce((s, a) => s + Math.max(0, bal[a]), 0);
  if (totalBal <= 0) return 0;
  let drawn = 0;
  for (const acc of accounts) {
    const take = Math.min(bal[acc], amount * Math.max(0, bal[acc]) / totalBal);
    if (take > 0) {
      bal[acc] -= take;
      withdrawals[acc] += take;
      drawn += take;
    }
  }
  return drawn;
}

// One retirement year's withdrawal decision for a given strategy. Returns the amount taken
// from each account plus any unmet need (a depletion year).
function drawdownYear(bal, netNeed, strategy, grossOrdinaryCeiling) {
  const withdrawals = { rrsp: 0, tfsa: 0, k401: 0, ira: 0, roth: 0, nonregCad: 0, taxableUsd: 0 };
  let remaining = netNeed;

  if (strategy.proportional) {
    remaining -= drawProportional(['k401', 'ira', 'rrsp', 'nonregCad', 'taxableUsd'], remaining, bal, withdrawals);
    if (remaining > 0) remaining -= drawFromAccounts(DRAWDOWN_POOLS.taxFree, remaining, bal, withdrawals);
  } else {
    let ordinaryDrawnSoFar = 0;
    for (const poolKey of strategy.order) {
      if (remaining <= 0) break;
      const isOrdinaryPool = poolKey === 'ordinaryCheap' || poolKey === 'ordinaryRrsp';
      let allowance = remaining;
      if (strategy.capOrdinary && isOrdinaryPool) {
        allowance = Math.min(allowance, Math.max(0, grossOrdinaryCeiling - ordinaryDrawnSoFar));
      }
      const drawn = drawFromAccounts(DRAWDOWN_POOLS[poolKey], allowance, bal, withdrawals);
      if (isOrdinaryPool) ordinaryDrawnSoFar += drawn;
      remaining -= drawn;
    }
    // The ordinary-income ceiling is a soft target, not a hard wall. If it's still unmet once
    // every pool has been visited (typically because taxable ran dry while ordinary stayed
    // capped), cover the rest as cheaply as possible per this model's own math: a tax-free
    // withdrawal always beats paying any positive rate, so a modest tax-free "top-up" once the
    // cheap brackets and taxable are used up is genuinely tax-efficient here — flat-rate taxable
    // (if it somehow still has room) comes next, and pushing further into higher ordinary
    // brackets is the last resort.
    if (remaining > 0) {
      const fallbackOrder = ['taxFree', 'taxable', 'ordinaryCheap', 'ordinaryRrsp'];
      for (const poolKey of fallbackOrder) {
        if (remaining <= 0) break;
        remaining -= drawFromAccounts(DRAWDOWN_POOLS[poolKey], remaining, bal, withdrawals);
      }
    }
  }
  return { withdrawals, shortfall: Math.max(0, remaining) };
}

// Tax on a given set of withdrawals — pulled out of the simulation loop so it can be called
// against trial withdrawals (for grossing up) without touching real balances.
function taxOnWithdrawals(withdrawals, standardDeduction, brackets, capGainsRate) {
  const ordinaryGross = withdrawals.k401 + withdrawals.ira + withdrawals.rrsp;
  const taxableOrdinaryIncome = Math.max(0, ordinaryGross - standardDeduction);
  const usTaxOnOrdinary = progressiveTax(taxableOrdinaryIncome, brackets);
  // FTC simplification: the RRSP "slice" of ordinary income is taxed at whichever is
  // higher of its marginal US rate or the flat Canadian withholding — modeling a foreign
  // tax credit that fully absorbs the smaller of the two. Real FTC mechanics (basket
  // limits, carryovers) are out of scope; flagged as a consideration-item on the page.
  const taxableIncomeExRrsp = Math.max(0, taxableOrdinaryIncome - withdrawals.rrsp);
  const usTaxExRrsp = progressiveTax(taxableIncomeExRrsp, brackets);
  const rrspMarginalUsTax = usTaxOnOrdinary - usTaxExRrsp;
  const cdnWithholding = withdrawals.rrsp * RRSP_WITHHOLDING_RATES.periodic;
  const effectiveOrdinaryTax = usTaxExRrsp + Math.max(rrspMarginalUsTax, cdnWithholding);
  const capGainsTax = (withdrawals.nonregCad + withdrawals.taxableUsd) * capGainsRate;
  return { usTaxOnOrdinary, cdnWithholding, totalTax: effectiveOrdinaryTax + capGainsTax };
}

// Full year-by-year retirement simulation for one withdrawal-order strategy. `overrides` is a
// flat {fieldId: value} snapshot (e.g. from readStoredInputs(), plus the ddo* fields) — never
// reads the DOM directly so it can run for any strategy without a live page.
function simulateDrawdown(overrides, strategyName) {
  overrides = overrides || {};
  const raw = id => overrides[id];
  const val = id => parseNum(raw(id));

  const currentAge = val('currentAge');
  const retireAge = val('retireAge');
  const planToAge = val('ddoPlanToAge') || 90;
  const n = Math.max(0, Math.round(planToAge - retireAge));
  const returnRate = val('returnRate') / 100;
  const inflationRate = val('inflationRate') / 100;
  const reportCurrency = raw('reportCurrency');
  const exchangeRate = val('exchangeRate') || 0.73;
  const monthlyExpenses = val('monthlyExpenses');
  const cppMonthly = val('cppMonthly'), oasMonthly = val('oasMonthly'), ssMonthly = val('ssMonthly');
  const benefitsStartAge = val('benefitsStartAge');
  const filingStatus = raw('ddoFilingStatus') === 'mfj' ? 'mfj' : 'single';
  const capGainsRate = Math.max(0, val('ddoCapGainsRate')) / 100;
  const lifeEvents = parseLifeEvents(raw('lifeEvents'));

  const brackets = US_TAX_BRACKETS_2026[filingStatus];
  const standardDeduction = US_STANDARD_DEDUCTION_2026[filingStatus];
  const grossOrdinaryCeiling = ordinaryIncomeCeiling(capGainsRate, brackets) + standardDeduction;

  // Retirement-date balances, converted to USD up front (see file-header note above).
  let bal = {
    rrsp: val('ddoRrspBal') * exchangeRate, tfsa: val('ddoTfsaBal') * exchangeRate,
    nonregCad: val('ddoNonregCadBal') * exchangeRate,
    k401: val('ddoK401Bal'), ira: val('ddoIraBal'), roth: val('ddoRothBal'), taxableUsd: val('ddoTaxableUsdBal')
  };

  const futureAnnualExpenseReport = monthlyExpenses * 12 * Math.pow(1 + inflationRate, Math.max(0, retireAge - currentAge));
  const annualGovBenefitReport = convertToReport((cppMonthly + oasMonthly) * 12, ssMonthly * 12, reportCurrency, exchangeRate);
  const futureAnnualExpense = toUsd(futureAnnualExpenseReport, reportCurrency, exchangeRate);
  const annualGovBenefit = toUsd(annualGovBenefitReport, reportCurrency, exchangeRate);

  const strategy = DRAWDOWN_STRATEGIES[strategyName] || DRAWDOWN_STRATEGIES.greedy;
  const currentYear = new Date().getFullYear();
  const years = [];
  let totalTaxPaid = 0, depletionAge = null;

  for (let i = 0; i <= n; i++) {
    const age = retireAge + i;
    applyLifeEventsForAge(bal, lifeEvents, age, exchangeRate, true);
    const govBenefit = age >= benefitsStartAge ? annualGovBenefit : 0;
    const netNeed = Math.max(0, futureAnnualExpense - govBenefit);

    // The withdrawal itself is taxed, so pulling exactly `netNeed` would leave less than
    // netNeed in pocket after tax. Solve for the grossed-up withdrawal that nets netNeed
    // after tax by iterating against a trial copy of the balances — tax depends on which
    // accounts the money comes from, which depends on the amount, so this converges rather
    // than being solvable in one step. Real balances are only touched once, after convergence,
    // which is also why (and how) ending balances end up differing by strategy: strategies
    // that owe more tax pull more out of the real accounts to cover it.
    let grossTarget = netNeed;
    let withdrawals, shortfall, taxResult;
    for (let iter = 0; iter < 12; iter++) {
      const trialBal = { ...bal };
      const trial = drawdownYear(trialBal, grossTarget, strategy, grossOrdinaryCeiling);
      withdrawals = trial.withdrawals;
      shortfall = trial.shortfall;
      taxResult = taxOnWithdrawals(withdrawals, standardDeduction, brackets, capGainsRate);
      const nextTarget = netNeed + taxResult.totalTax;
      if (Math.abs(nextTarget - grossTarget) < 0.5) { grossTarget = nextTarget; break; }
      grossTarget = nextTarget;
    }
    // Apply the converged withdrawal to the real balances (single mutation for the year).
    ({ withdrawals, shortfall } = drawdownYear(bal, grossTarget, strategy, grossOrdinaryCeiling));
    taxResult = taxOnWithdrawals(withdrawals, standardDeduction, brackets, capGainsRate);
    const totalTax = taxResult.totalTax;
    totalTaxPaid += totalTax;

    const depleted = shortfall > 0.01;
    if (depleted && depletionAge === null) depletionAge = age;

    years.push({
      age, year: currentYear + i, spend: futureAnnualExpense, govBenefit, netNeed,
      withdrawals: { ...withdrawals }, usTax: taxResult.usTaxOnOrdinary, cdnWithholding: taxResult.cdnWithholding, totalTax,
      endBalances: { ...bal }, depleted
    });

    if (depleted) break;
    const next = {};
    for (const k of Object.keys(bal)) next[k] = bal[k] * (1 + returnRate);
    bal = next;
  }

  const endingBalance = Object.values(bal).reduce((s, v) => s + v, 0);
  return { years, totalTaxPaid, endingBalance, depletionAge, strategyName, filingStatus };
}

// Node-testable exports of the pure helpers (no `document`/`window` dependency once called with
// a complete `overrides` object). Browser behavior is unaffected — `module` is undefined there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml, sanitizeImportedName, parseNum, parseLifeEvents,
    compute, stepAccounts, convertToReport, simulateDrawdown,
  };
}
