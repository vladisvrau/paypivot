'use strict';

const API = 'https://api.frankfurter.dev/v1';
const RATE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_CURRENCIES = 4;

// Layout widths in px. Chrome caps popups at 800px wide.
const LABEL_W = 84;
const CUR_W = 130;
const PERIOD_W = 108;
const ADD_W = 28;
const GAP = 8;
const BODY_PAD = 28;
const MIN_BODY_W = 300;
const APPLY_W = 420;
const ANIM_MS = 320;

const PERIODS = [
  { id: 'hour', label: 'Hourly' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
];

const SETTINGS = {
  hoursPerWeek: { min: 1, max: 168 },
  daysPerWeek: { min: 1, max: 7 },
  weeksPerYear: { min: 1, max: 52 },
};

const FALLBACK_NAMES = {
  AUD: 'Australian Dollar', BRL: 'Brazilian Real', CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc', EUR: 'Euro', GBP: 'British Pound', INR: 'Indian Rupee',
  JPY: 'Japanese Yen', MXN: 'Mexican Peso', USD: 'United States Dollar',
};

// Order in which "+ Currency" suggests currencies.
const SUGGESTED = ['USD', 'EUR', 'GBP', 'BRL', 'CAD', 'AUD', 'JPY', 'CHF'];

const REGION_CURRENCY = {
  AU: 'AUD', BR: 'BRL', CA: 'CAD', CH: 'CHF', GB: 'GBP', IN: 'INR', JP: 'JPY', MX: 'MXN',
};

function defaultTarget() {
  try {
    return REGION_CURRENCY[new Intl.Locale(navigator.language).region] || 'EUR';
  } catch {
    return 'EUR';
  }
}

const DEFAULTS = {
  codes: ['USD', defaultTarget()], // codes[0] is the base that rates are quoted against
  convert: true,
  transposed: false,
  collapsed: false,
  pinned: ['hour', 'month', 'year'],
  hoursPerWeek: 40,
  daysPerWeek: 5,
  weeksPerYear: 52,
  anchor: { period: 'hour', cur: 'USD', text: '' },
  rates: {},   // code -> units of that currency per 1 base
  manual: {},  // code -> true when the rate was typed by the user
  ratesBase: '',
  rateDate: '',
  ratesFetchedAt: 0,
  names: null, // code -> currency name, from the API
  comp: {
    cur: '',            // currency of the amounts below; follows the table
    bonus: '', bonusType: 'amount',
    equity: '', vest: 4,
    signon: '', signonYears: 1,
    benefits: '', pto: '', costs: '',
  },
  fromPage: null, // the figure last read from a page (not saved)
};

let state = structuredClone(DEFAULTS);
let rateError = '';
let amountInputs = [];
let rateInputs = [];

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---------- storage ----------

const { store } = PayPivot;
const { parseAmount } = PayPivot;

const loadState = () => store.get('calculator');

function saveState() {
  // The figure read from a page is only shown while this popup is open.
  const { fromPage, ...saved } = state;
  store.set('calculator', saved);
}

// ---------- maths ----------

/** How many hourly rates fit in one unit of the period. */
function multiplier(period) {
  const { hoursPerWeek: h, daysPerWeek: d, weeksPerYear: w } = state;
  return { hour: 1, day: h / d, week: h, month: (h * w) / 12, year: h * w }[period];
}

const base = () => state.codes[0];

/** Units of `code` per 1 base currency, or null if unknown. */
function rateOf(code) {
  if (code === base()) return 1;
  return state.rates[code] > 0 ? state.rates[code] : null;
}

/** Returns a function giving the hourly rate in a currency (null = unknown). */
function hourlyRates() {
  const amount = parseAmount(state.anchor.text);
  if (!Number.isFinite(amount)) return () => null;
  const { cur, period } = state.anchor;
  const hourly = amount / multiplier(period);
  const anchorRate = rateOf(cur);
  return (code) => {
    if (code === cur) return hourly;
    const rate = rateOf(code);
    return anchorRate && rate ? (hourly / anchorRate) * rate : null;
  };
}

/** Moves the anchor to another currency, keeping its worth (used before a currency disappears). */
function reanchor(code) {
  const hourly = hourlyRates()(code);
  const { period } = state.anchor;
  state.anchor = {
    period,
    cur: code,
    text: hourly === null ? '' : String(+(hourly * multiplier(period)).toFixed(4)),
  };
}

// ---------- what is shown ----------

function visibleCodes() {
  if (state.convert) return state.codes;
  return [state.codes.includes(state.anchor.cur) ? state.anchor.cur : base()];
}

function visiblePeriods() {
  if (!state.collapsed) return PERIODS;
  const pinned = PERIODS.filter((p) => state.pinned.includes(p.id));
  return pinned.length ? pinned : PERIODS.filter((p) => p.id === state.anchor.period);
}

// ---------- table ----------

function periodCell({ id, label }) {
  const pinned = state.pinned.includes(id);
  const pin = el('button', {
    type: 'button',
    className: 'pin',
    textContent: '📌',
    title: pinned ? `Unpin ${label.toLowerCase()}` : `Pin ${label.toLowerCase()} (keeps it when collapsed)`,
  });
  pin.setAttribute('aria-pressed', String(pinned));
  pin.addEventListener('click', () => {
    state.pinned = pinned ? state.pinned.filter((p) => p !== id) : [...state.pinned, id];
    rebuild();
    saveState();
  });
  const cell = el('div', { className: 'period' }, pin, el('span', { textContent: label }));
  cell.dataset.key = `period-${id}`;
  return cell;
}

function currencyCell(code) {
  const index = state.codes.indexOf(code);
  const names = state.names || FALLBACK_NAMES;

  const select = el('select', { title: names[code] || code });
  select.setAttribute('aria-label', 'Currency');
  for (const [c, name] of Object.entries({ [code]: code, ...names })) {
    // A currency can only appear once, so hide the ones other columns use.
    if (c !== code && state.codes.includes(c)) continue;
    select.append(el('option', { value: c, textContent: c, title: name }));
  }
  select.value = code;
  select.addEventListener('change', () => changeCurrency(index, select.value));

  const top = el('div', { className: 'cur-top' }, select);
  const cell = el('div', { className: 'cur' }, top);
  cell.dataset.key = `cur-${code}`;
  if (!state.convert) return cell;

  if (state.codes.length > 1) {
    const remove = el('button', {
      type: 'button', className: 'remove', textContent: '×', title: `Remove ${code}`,
    });
    remove.setAttribute('aria-label', `Remove ${code}`);
    remove.addEventListener('click', () => removeCurrency(index));
    top.append(remove);
  }

  if (index > 0) {
    const input = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off' });
    input.dataset.cur = code;
    input.setAttribute('aria-label', `${code} per 1 ${base()}`);
    input.addEventListener('input', () => {
      const rate = parseAmount(input.value);
      if (!(rate > 0)) return;
      state.rates[code] = rate;
      state.manual[code] = true;
      rateError = '';
      update(input);
      saveState();
    });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('blur', () => update());
    rateInputs.push(input);
    cell.append(el('div', { className: 'cur-rate' }, `1 ${base()} =`, input));
  }
  return cell;
}

function amountInput({ id, label }, code) {
  const input = el('input', {
    type: 'text', inputMode: 'decimal', autocomplete: 'off', className: 'amount',
  });
  input.dataset.period = id;
  input.dataset.cur = code;
  input.dataset.key = `amount-${id}-${code}`;
  input.setAttribute('aria-label', `${label} in ${code}`);
  input.addEventListener('input', () => {
    state.anchor = { period: id, cur: code, text: input.value };
    update(input);
    saveState();
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('blur', () => update());
  amountInputs.push(input);
  return input;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const ANIM = { duration: ANIM_MS, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' };
let bodyAnimation = null;

/** Rebuilds the table after a change of shape, animated unless the user prefers reduced motion. */
function rebuild() {
  if (reducedMotion.matches) buildGrid();
  else animatedRebuild();
}

/** Everything that takes part in the animation, by its stable key. */
const keyedElements = () => [...document.querySelectorAll('[data-key]')];

/**
 * Swaps in the new table and animates everything at once, in step with the window:
 *   - the popup (the window follows the body) resizes from the old size to the new one,
 *   - cells that are in both tables glide from their old position to the new one,
 *   - new cells slide and fade in, removed cells slide and fade out.
 */
function animatedRebuild() {
  const grid = $('grid');

  // Where everything is now (mid-animation positions included, so interruptions stay smooth).
  const before = new Map();
  for (const node of keyedElements()) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0) before.set(node.dataset.key, { node, rect });
  }
  const old = bodySize();
  if (bodyAnimation) bodyAnimation.cancel();

  buildGrid();
  const next = bodySize();
  const horizontal = next.w !== old.w;
  const offset = horizontal ? 'translateX(-32px)' : 'translateY(-12px)';

  for (const node of keyedElements()) {
    const was = before.get(node.dataset.key);
    if (!was) {
      node.animate({ opacity: [0, 1], transform: [offset, 'none'] }, ANIM);
      continue;
    }
    before.delete(node.dataset.key);
    const rect = node.getBoundingClientRect();
    const dx = was.rect.left - rect.left;
    const dy = was.rect.top - rect.top;
    if (dx || dy) node.animate({ transform: [`translate(${dx}px, ${dy}px)`, 'none'] }, ANIM);
  }

  // Removed cells stay as ghosts at their old spot while they slide out.
  const gridRect = grid.getBoundingClientRect();
  for (const { node, rect } of before.values()) {
    if (document.contains(node)) continue; // not a table cell (e.g. the rates note being hidden)
    node.removeAttribute('data-key');
    node.inert = true;
    Object.assign(node.style, {
      position: 'absolute',
      left: `${rect.left - gridRect.left}px`,
      top: `${rect.top - gridRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    grid.append(node);
    node.animate({ opacity: [1, 0], transform: ['none', offset] }, ANIM)
      .finished.then(() => node.remove(), () => node.remove());
  }

  animateBody(old, next);
}

const bodySize = () => ({ w: document.body.offsetWidth, h: document.body.offsetHeight });

/**
 * Animates the popup from an old size to its current one (the window follows the body).
 * `then` runs when the animation ends or is replaced.
 */
function animateBody(old, next = bodySize(), then) {
  const { body, documentElement: html } = document;
  if (bodyAnimation) bodyAnimation.cancel();
  bodyAnimation = null;
  if (reducedMotion.matches || (next.w === old.w && next.h === old.h)) {
    html.classList.remove('animating');
    if (then) then();
    return;
  }
  updateScrollbar(true); // the layout is already at its new size: fade the scrollbar alongside
  html.classList.add('animating');
  const animation = body.animate(
    { width: [`${old.w}px`, `${next.w}px`], height: [`${old.h}px`, `${next.h}px`] },
    ANIM,
  );
  bodyAnimation = animation;
  const done = () => {
    if (bodyAnimation === animation) {
      bodyAnimation = null;
      html.classList.remove('animating');
      updateScrollbar();
    }
    if (then) then();
  };
  animation.finished.then(done, done);
}

// ---------- scrollbar ----------

/**
 * Fades the body's scrollbar in only while there is something to scroll (set by watchScrollbar).
 * Animations call it with `now` at their start, while the layout is at its final size, so the fade
 * runs alongside the resize; other calls are ignored until the resize ends.
 */
let updateScrollbar = () => {};

/**
 * The body scrolls once it reaches Chrome's 600px limit, inside a gutter that is always reserved
 * (see popup.css). This measures the gutter, and marks the body .scrollable while it overflows.
 * Mid-animation overflow doesn't count: the thumb fades from the start of a resize to where it ends.
 */
function watchScrollbar() {
  const { body, documentElement: html } = document;
  html.style.setProperty('--gutter', `${Math.max(0, body.offsetWidth - body.clientWidth)}px`);
  updateScrollbar = (now = false) => {
    if (!now && (html.classList.contains('animating') || body.querySelector('details.sliding'))) return;
    body.classList.toggle('scrollable', body.scrollHeight > body.clientHeight + 1);
  };
  // The body stops resizing once it is capped, so watch what is inside it.
  const observer = new ResizeObserver(() => updateScrollbar());
  for (const child of body.children) if (child.tagName !== 'SCRIPT') observer.observe(child);
  observer.observe(body);
  addEventListener('resize', () => updateScrollbar());
  updateScrollbar();
}

const groupAnimations = new WeakMap();

/** Whether a group is open, or opening (a closing group is still [open] until it finishes). */
const groupIsOpen = (details) => details.open && !details.classList.contains('closing');

/**
 * Opens or closes a collapsible group by sliding its own height. The popup follows the layout,
 * and the slide stays visible even when the popup is at Chrome's maximum height and scrolls.
 */
function toggleGroup(details, open = !groupIsOpen(details)) {
  if (groupIsOpen(details) === open) return;
  const from = details.getBoundingClientRect().height; // mid-slide if one is running
  const running = groupAnimations.get(details);
  if (running) running.forEach((a) => a.cancel());
  groupAnimations.delete(details);

  // Let the body take its natural size, so the window follows the group frame by frame.
  if (bodyAnimation) bodyAnimation.cancel();
  bodyAnimation = null;
  document.documentElement.classList.remove('animating');

  details.classList.remove('closing', 'sliding');
  details.open = open;
  details.dispatchEvent(new CustomEvent('group-toggle', { detail: { open } }));
  if (reducedMotion.matches) return;

  const to = details.getBoundingClientRect().height;
  updateScrollbar(true); // measured at the final size, so the fade starts with the slide
  if (!open) {
    details.open = true; // keep the content in place while it slides shut
    details.classList.add('closing');
  }
  details.classList.add('sliding');
  const content = [...details.children].filter((child) => child.tagName !== 'SUMMARY');
  const animations = [
    details.animate({ height: [`${from}px`, `${to}px`] }, ANIM),
    ...content.map((child) => child.animate(
      open ? { opacity: [0, 1], transform: ['translateY(-6px)', 'none'] }
           : { opacity: [1, 0], transform: ['none', 'translateY(-6px)'] },
      { ...ANIM, duration: open ? ANIM_MS : ANIM_MS * 0.6 },
    )),
  ];
  groupAnimations.set(details, animations);
  animations[0].finished.then(() => {
    groupAnimations.delete(details);
    details.classList.remove('sliding', 'closing');
    if (!open) details.open = false;
    updateScrollbar();
  }, () => {});
}

// ---------- tabs ----------

let ui = { tab: 'pay', open: {} };
let payWidth = MIN_BODY_W;

/** Sets the popup width for the tab that is showing. */
function sizeBody() {
  document.body.style.width = `${ui.tab === 'apply' ? APPLY_W : payWidth}px`;
}

function showTab(tab, animate = true) {
  if (tab !== 'pay' && tab !== 'apply') tab = 'pay';
  const old = bodySize();
  ui.tab = tab;
  for (const name of ['pay', 'apply']) {
    $(`view-${name}`).hidden = name !== tab;
    $(`tab-${name}`).setAttribute('aria-selected', String(name === tab));
  }
  sizeBody();
  if (animate) {
    animateBody(old);
    if (!reducedMotion.matches) $(`view-${tab}`).animate({ opacity: [0, 1] }, ANIM);
  }
  store.set('ui', ui);
}

function wireGroups() {
  for (const details of document.querySelectorAll('details.group')) {
    if (ui.open[details.id]) details.open = true;
    details.querySelector('summary').addEventListener('click', (event) => {
      event.preventDefault();
      toggleGroup(details);
    });
    details.addEventListener('group-toggle', (event) => {
      ui.open[details.id] = event.detail.open;
      store.set('ui', ui);
    });
  }
}

/** Builds the table from the current state and sizes the popup to it. */
function buildGrid() {
  const grid = $('grid');
  const periods = visiblePeriods();
  const codes = visibleCodes();
  amountInputs = [];
  rateInputs = [];

  // Top-left corner: collapse / show all.
  const collapse = el('button', {
    type: 'button',
    className: 'collapse',
    textContent: state.collapsed ? 'Show all' : 'Collapse',
    title: state.collapsed ? 'Show every pay period' : 'Show only pinned pay periods',
  });
  collapse.dataset.key = 'collapse';
  collapse.setAttribute('aria-pressed', String(state.collapsed));
  collapse.addEventListener('click', () => {
    state.collapsed = !state.collapsed;
    rebuild();
    saveState();
  });
  grid.replaceChildren(collapse);

  // After the last currency: add another one.
  const add = state.convert && el('button', {
    type: 'button',
    className: 'add',
    textContent: '+',
    title: state.codes.length >= MAX_CURRENCIES ? `Up to ${MAX_CURRENCIES} currencies` : 'Add a currency',
    disabled: state.codes.length >= MAX_CURRENCIES,
  });
  if (add) {
    add.dataset.key = 'add';
    add.setAttribute('aria-label', 'Add a currency');
    add.addEventListener('click', addCurrency);
  }

  let width;
  if (state.transposed) {
    // Currencies down the side, pay periods across the top; "+" sits below the last currency.
    grid.style.gridTemplateColumns = `${CUR_W}px repeat(${periods.length}, ${PERIOD_W}px)`;
    grid.append(...periods.map(periodCell));
    for (const code of codes) {
      grid.append(currencyCell(code), ...periods.map((p) => amountInput(p, code)));
    }
    if (add) grid.append(add);
    width = CUR_W + periods.length * (PERIOD_W + GAP);
  } else {
    // "+" gets its own narrow column to the right of the last currency.
    grid.style.gridTemplateColumns =
      `${LABEL_W}px repeat(${codes.length}, ${CUR_W}px)${add ? ` ${ADD_W}px` : ''}`;
    grid.append(...codes.map(currencyCell));
    if (add) grid.append(add);
    for (const period of periods) {
      grid.append(periodCell(period), ...codes.map((code) => amountInput(period, code)));
      if (add) grid.append(el('span'));
    }
    width = LABEL_W + codes.length * (CUR_W + GAP) + (add ? ADD_W + GAP : 0);
  }
  payWidth = Math.max(MIN_BODY_W, width + BODY_PAD);
  sizeBody();
  renderFromPage();

  $('flip').setAttribute('aria-pressed', String(state.transposed));
  $('convert').checked = state.convert;
  $('refresh').hidden = !state.convert || state.codes.length < 2;

  update();
}

/** Refreshes every value except `skip` (the field being typed in). */
function update(skip) {
  const hourly = hourlyRates();
  const hasAnchor = state.anchor.text.trim() !== '';
  for (const input of amountInputs) {
    const { period, cur } = input.dataset;
    const isAnchor = period === state.anchor.period && cur === state.anchor.cur;
    input.classList.toggle('anchor', isAnchor && hasAnchor);
    if (input === skip) continue;
    const h = hourly(cur);
    input.value = h === null ? '' : fmt.format(h * multiplier(period));
  }

  for (const input of rateInputs) {
    const code = input.dataset.cur;
    input.classList.toggle('manual', Boolean(state.manual[code]));
    input.title = state.manual[code] ? 'Typed by you — ↻ restores the live rate' : '';
    if (input === skip) continue;
    const rate = rateOf(code);
    input.value = rate ? String(+rate.toPrecision(6)) : '';
  }

  const info = $('rateInfo');
  const others = state.codes.slice(1);
  info.hidden = !state.convert || others.length === 0;
  info.classList.toggle('error', Boolean(rateError));
  if (rateError) info.textContent = rateError;
  else if (others.some((c) => !rateOf(c))) info.textContent = 'Loading rates…';
  else if (others.every((c) => state.manual[c])) info.textContent = 'Using the rates you typed';
  else {
    info.textContent = `ECB rates from ${state.rateDate}` +
      (others.some((c) => state.manual[c]) ? ' · dashed ones typed by you' : '');
  }

  for (const id of Object.keys(SETTINGS)) {
    if ($(id) !== skip) $(id).value = state[id];
  }

  renderComp(skip);
}

// ---------- total compensation ----------

const COMP_FIELDS = {
  'c-bonus': 'bonus', 'c-bonusType': 'bonusType', 'c-equity': 'equity', 'c-vest': 'vest',
  'c-signon': 'signon', 'c-signonYears': 'signonYears', 'c-benefits': 'benefits',
  'c-pto': 'pto', 'c-costs': 'costs',
};

const numberIn = (text) => {
  const n = parseAmount(text);
  return Number.isFinite(n) ? n : 0;
};

/** Converts an amount between two currencies of the table, or null if a rate is missing. */
function convertAmount(amount, from, to) {
  if (!amount || from === to) return amount;
  const rf = rateOf(from);
  const rt = rateOf(to);
  return rf && rt ? (amount / rf) * rt : null;
}

/** Hours actually worked in a year once paid time off is taken. */
function hoursWorked() {
  const { hoursPerWeek: h, daysPerWeek: d, weeksPerYear: w } = state;
  const ptoWeeks = Math.min(numberIn(state.comp.pto) / d, w - 1);
  return h * (w - Math.max(0, ptoWeeks));
}

/** Base, total and effective hourly pay in one currency, or null if it can't be worked out. */
function compIn(code, hourly) {
  const h = hourly(code);
  if (h === null) return null;
  const c = state.comp;
  const base = h * multiplier('year');
  const cash = (field) => convertAmount(numberIn(c[field]), c.cur, code);
  const extras = {
    bonus: c.bonusType === 'percent' ? (base * numberIn(c.bonus)) / 100 : cash('bonus'),
    equity: cash('equity'),
    signon: cash('signon'),
    benefits: cash('benefits'),
    costs: cash('costs'),
  };
  if (Object.values(extras).some((v) => v === null)) return null;
  const total = base + extras.bonus + extras.benefits - extras.costs +
    extras.equity / Math.max(1, numberIn(c.vest) || 4) +
    extras.signon / Math.max(1, numberIn(c.signonYears) || 1);
  return { base, total, hourly: total / hoursWorked() };
}

function renderComp(skip) {
  const c = state.comp;
  const codes = visibleCodes();
  if (!codes.includes(c.cur)) c.cur = codes.includes(state.anchor.cur) ? state.anchor.cur : codes[0];

  const select = $('c-cur');
  if ([...select.options].map((o) => o.value).join() !== codes.join()) {
    select.replaceChildren(...codes.map((code) => el('option', { value: code, textContent: code })));
  }
  select.value = c.cur;
  for (const [id, key] of Object.entries(COMP_FIELDS)) {
    if ($(id) !== skip) $(id).value = c[key];
  }

  const out = $('compOut');
  const hourly = hourlyRates();
  if (!Number.isFinite(parseAmount(state.anchor.text))) {
    out.style.gridTemplateColumns = '1fr';
    out.replaceChildren(el('div', { className: 'note', textContent: 'Type a pay figure above to see totals.' }));
    return;
  }
  out.style.gridTemplateColumns = `96px repeat(${codes.length}, minmax(0, 1fr))`;
  const results = codes.map((code) => compIn(code, hourly));
  const value = (r, key) => el('div', { className: 'value', textContent: r ? fmt.format(r[key]) : '—' });
  out.replaceChildren(
    el('div'), ...codes.map((code) => el('div', { className: 'head', textContent: code })),
    el('div', { className: 'label', textContent: 'Base / year' }), ...results.map((r) => value(r, 'base')),
    el('div', { className: 'label', textContent: 'Total / year' }), ...results.map((r) => value(r, 'total')),
    el('div', { className: 'label', textContent: 'Effective hourly' }), ...results.map((r) => value(r, 'hourly')),
    el('div', {
      className: 'note',
      textContent: `Effective hourly is total pay over ${fmt.format(hoursWorked()).replace(/\.00$/, '')} hours worked a year` +
        (numberIn(c.pto) ? `, after ${numberIn(c.pto)} days off.` : '.'),
    }),
  );
}

function wireComp() {
  for (const [id, key] of Object.entries(COMP_FIELDS)) {
    const input = $(id);
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      state.comp[key] = input.value;
      renderComp(input);
      saveState();
    });
    input.addEventListener('blur', () => renderComp());
  }
  $('c-cur').addEventListener('change', () => {
    state.comp.cur = $('c-cur').value;
    renderComp();
    saveState();
  });
  $('c-clear').addEventListener('click', () => {
    state.comp = { ...structuredClone(DEFAULTS.comp), cur: state.comp.cur };
    renderComp();
    saveState();
  });
}

// ---------- a figure read from a page ----------

function renderFromPage() {
  const box = $('fromPage');
  const fp = state.fromPage;
  box.hidden = !fp;
  if (!fp) return;

  const quoted = fp.text.length > 60 ? `${fp.text.slice(0, 57)}…` : fp.text;
  const close = el('button', { type: 'button', textContent: '×', title: 'Dismiss' });
  close.setAttribute('aria-label', 'Dismiss');
  close.addEventListener('click', () => {
    state.fromPage = null;
    rebuild();
  });

  box.classList.toggle('error', Boolean(fp.error));
  if (fp.error) {
    box.replaceChildren(el('span', {}, 'No pay figure found in ', el('q', { textContent: quoted }), '.'),
      el('span', { className: 'actions' }, close));
    return;
  }

  const periodName = (PERIODS.find((p) => p.id === fp.period) || PERIODS[0]).label.toLowerCase();
  const actions = el('span', { className: 'actions' });
  if (fp.high !== fp.low) {
    for (const [which, label] of [['low', 'Low'], ['mid', 'Mid'], ['high', 'High']]) {
      const button = el('button', { type: 'button', textContent: label, title: `Use the ${label.toLowerCase()} end of the range` });
      button.setAttribute('aria-pressed', String(fp.used === which));
      button.addEventListener('click', () => useFromPage(which));
      actions.append(button);
    }
  }
  actions.append(close);
  box.replaceChildren(
    el('span', {}, el('q', { textContent: quoted }), ` → ${periodName} ${fp.cur}${fp.guessed ? ' (period guessed)' : ''}`),
    actions,
  );
}

function useFromPage(which) {
  const fp = state.fromPage;
  const amount = { low: fp.low, high: fp.high, mid: (fp.low + fp.high) / 2 }[which];
  fp.used = which;
  state.anchor = { period: fp.period, cur: fp.cur, text: String(+amount.toFixed(2)) };
  renderFromPage();
  update();
  saveState();
}

/** Puts a figure sent from a page (right-click → Convert with PayPivot) into the calculator. */
function applyPending(pending) {
  if (!pending) return;
  store.remove('pending');
  if (typeof chrome !== 'undefined' && chrome.action) chrome.action.setBadgeText({ text: '' });
  if (ui.tab !== 'pay') showTab('pay');

  const result = pending.result;
  if (!result) {
    state.fromPage = { text: pending.text, error: true };
    rebuild();
    return;
  }

  const known = Object.keys(state.names || FALLBACK_NAMES).concat(PayPivot.KNOWN_CODES);
  const cur = result.currency && known.includes(result.currency) ? result.currency : state.anchor.cur;
  if (!state.codes.includes(cur)) {
    if (state.codes.length < MAX_CURRENCIES) {
      state.codes.push(cur);
    } else {
      const old = state.codes[state.codes.length - 1];
      state.codes[state.codes.length - 1] = cur;
      delete state.rates[old];
      delete state.manual[old];
    }
  }
  const shown = visibleCodes()[0];
  if (!state.convert && result.currency && cur !== shown) state.convert = true;

  state.anchor = { period: result.period, cur, text: String(result.amount) };
  state.fromPage = {
    text: pending.text, low: result.low, high: result.high, used: 'low',
    period: result.period, cur, guessed: result.periodGuessed,
  };
  rateError = '';
  rebuild();
  saveState();
  ensureRates();
}

// ---------- currencies ----------

function resetRates() {
  state.rates = {};
  state.manual = {};
  state.ratesBase = base();
  state.ratesFetchedAt = 0;
}

function changeCurrency(index, code) {
  const old = state.codes[index];
  state.codes[index] = code;
  if (state.anchor.cur === old) state.anchor.cur = code; // the typed number stays as typed
  if (index === 0) {
    resetRates();
  } else {
    delete state.rates[old];
    delete state.manual[old];
  }
  rateError = '';
  rebuild();
  saveState();
  ensureRates();
}

function addCurrency() {
  if (state.codes.length >= MAX_CURRENCIES) return;
  const all = [...SUGGESTED, ...Object.keys(state.names || FALLBACK_NAMES)];
  const code = all.find((c) => !state.codes.includes(c));
  if (!code) return;
  state.codes.push(code);
  rebuild();
  saveState();
  ensureRates();
}

function removeCurrency(index) {
  if (state.codes.length < 2) return;
  const code = state.codes[index];
  if (state.anchor.cur === code) reanchor(state.codes[index === 0 ? 1 : 0]);

  if (index === 0) {
    // The base is going away: re-quote the remaining rates against the new base.
    const newBase = state.codes[1];
    const pivot = rateOf(newBase);
    if (pivot) {
      for (const c of state.codes.slice(2)) {
        if (state.rates[c] > 0) state.rates[c] /= pivot;
      }
    } else {
      state.rates = {};
      state.manual = {};
      state.ratesFetchedAt = 0;
    }
    state.ratesBase = newBase;
    delete state.rates[newBase];
    delete state.manual[newBase];
  }
  state.codes.splice(index, 1);
  delete state.rates[code];
  delete state.manual[code];

  rateError = '';
  rebuild();
  saveState();
  ensureRates();
}

// ---------- exchange rates ----------

async function ensureRates(force = false) {
  const others = state.codes.slice(1);
  if (!state.convert || others.length === 0) return;

  const from = base();
  const want = force ? others : others.filter((c) => !state.manual[c]);
  const stale = Date.now() - state.ratesFetchedAt >= RATE_TTL_MS;
  if (want.length === 0 || (!force && !stale && want.every((c) => rateOf(c)))) return;

  rateError = '';
  try {
    const res = await fetch(`${API}/latest?base=${from}&symbols=${want.join(',')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (base() !== from) return; // base changed while we were waiting
    for (const code of want) {
      const rate = data.rates && data.rates[code];
      if (rate > 0 && state.codes.includes(code)) {
        state.rates[code] = rate;
        delete state.manual[code];
      }
    }
    state.rateDate = data.date;
    state.ratesFetchedAt = Date.now();
    saveState();
  } catch {
    if (base() !== from) return;
    rateError = state.codes.slice(1).every((c) => rateOf(c))
      ? 'Offline — using saved rates'
      : 'Could not fetch rates — type them in';
  }
  update(document.activeElement);
}

async function ensureNames() {
  if (state.names) return;
  try {
    const res = await fetch(`${API}/currencies`);
    if (!res.ok) return;
    state.names = await res.json();
    saveState();
    if (!document.activeElement || document.activeElement.tagName !== 'SELECT') buildGrid();
  } catch {
    /* keep the built-in list */
  }
}

// ---------- wiring ----------

function wireControls() {
  const toggle = (key) => () => {
    state[key] = !state[key];
    rebuild();
    saveState();
    ensureRates();
  };
  $('flip').addEventListener('click', toggle('transposed'));
  $('convert').addEventListener('change', toggle('convert'));
  $('refresh').addEventListener('click', () => ensureRates(true));

  for (const [id, { min, max }] of Object.entries(SETTINGS)) {
    const input = $(id);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      if (!(value >= min && value <= max)) return; // ignore until valid
      state[id] = value;
      update(input);
      saveState();
    });
    input.addEventListener('blur', () => update());
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  if (params.get('page')) document.body.classList.add('page');

  const [saved, savedUi] = await Promise.all([loadState(), store.get('ui')]);
  if (saved && typeof saved === 'object' && Array.isArray(saved.codes) && saved.codes.length) {
    state = {
      ...structuredClone(DEFAULTS),
      ...saved,
      anchor: { ...DEFAULTS.anchor, ...saved.anchor },
      comp: { ...DEFAULTS.comp, ...saved.comp },
      fromPage: null,
    };
  }
  if (!state.codes.includes(state.anchor.cur)) state.anchor.cur = base();
  if (state.ratesBase !== base()) resetRates();
  if (savedUi && typeof savedUi === 'object') ui = { ...ui, ...savedUi, open: { ...savedUi.open } };

  wireControls();
  wireComp();
  watchScrollbar();
  wireGroups();
  $('tab-pay').addEventListener('click', () => showTab('pay'));
  $('tab-apply').addEventListener('click', () => showTab('apply'));

  buildGrid();
  showTab(params.get('tab') || ui.tab, false);

  applyPending(await store.get('pending'));
  store.onChange('pending', applyPending);
  if (typeof chrome !== 'undefined' && chrome.action) chrome.action.setBadgeText({ text: '' });

  if (ui.tab === 'pay') {
    const { period, cur } = state.anchor;
    const first = amountInputs.find((i) => i.dataset.period === period && i.dataset.cur === cur) || amountInputs[0];
    if (first) first.focus();
  }
  ensureNames();
  ensureRates();
}

// apply.js waits for this before reading the shared `ui` preferences.
const popupReady = init();
