'use strict';

const API = 'https://api.frankfurter.dev/v1';
const RATE_TTL_MS = 12 * 60 * 60 * 1000;
const STORAGE_KEY = 'state2';
const MAX_CURRENCIES = 4;

// Layout widths in px. Chrome caps popups at 800px wide.
const LABEL_W = 84;
const CUR_W = 130;
const PERIOD_W = 108;
const ADD_W = 28;
const GAP = 8;
const BODY_PAD = 28;
const MIN_BODY_W = 300;
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

// ---------- storage (chrome.storage in the extension, localStorage otherwise) ----------

const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

async function loadState() {
  try {
    if (hasChromeStorage) return (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveState() {
  try {
    if (hasChromeStorage) chrome.storage.local.set({ [STORAGE_KEY]: state });
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the calculator still works, it just won't remember */
  }
}

// ---------- maths ----------

/** Parses "50", "$50.00", "120,000", "120k", "1.2m", "1.234,56". Returns NaN if not a number. */
function parseAmount(text) {
  let s = String(text).toLowerCase().replace(/[^0-9.,km]/g, '');
  const suffix = s.match(/[km]$/);
  const scale = suffix ? (suffix[0] === 'k' ? 1e3 : 1e6) : 1;
  s = s.replace(/[km]/g, '');
  if (!s) return NaN;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal separator.
    const [dec, thou] = lastDot > lastComma ? ['.', ','] : [',', '.'];
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (s.indexOf('.') !== lastDot) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n * scale : NaN;
}

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
  const { body } = document;
  const grid = $('grid');

  // Where everything is now (mid-animation positions included, so interruptions stay smooth).
  const before = new Map();
  for (const node of keyedElements()) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0) before.set(node.dataset.key, { node, rect });
  }
  const old = { w: body.offsetWidth, h: body.offsetHeight };
  if (bodyAnimation) bodyAnimation.cancel();

  buildGrid();
  const next = { w: body.offsetWidth, h: body.offsetHeight };
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

  if (next.w !== old.w || next.h !== old.h) {
    bodyAnimation = body.animate(
      { width: [`${old.w}px`, `${next.w}px`], height: [`${old.h}px`, `${next.h}px`] },
      ANIM,
    );
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
  document.body.style.width = `${Math.max(MIN_BODY_W, width + BODY_PAD)}px`;

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
  const saved = await loadState();
  if (saved && typeof saved === 'object' && Array.isArray(saved.codes) && saved.codes.length) {
    state = { ...structuredClone(DEFAULTS), ...saved, anchor: { ...DEFAULTS.anchor, ...saved.anchor } };
  }
  if (!state.codes.includes(state.anchor.cur)) state.anchor.cur = base();
  if (state.ratesBase !== base()) resetRates();

  wireControls();
  buildGrid();
  const { period, cur } = state.anchor;
  const first = amountInputs.find((i) => i.dataset.period === period && i.dataset.cur === cur) || amountInputs[0];
  if (first) first.focus();
  ensureNames();
  ensureRates();
}

init();
