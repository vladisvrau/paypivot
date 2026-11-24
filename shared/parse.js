'use strict';

// Parsing of typed amounts and of pay figures selected on web pages.
// Loaded by the popup (<script>) and the background worker (importScripts).

(function (root) {
  const PayPivot = (root.PayPivot = root.PayPivot || {});

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

  // ---------- pay figures on pages ----------

  // Currencies the Frankfurter API knows; three-letter codes outside this list are ignored.
  const KNOWN_CODES = [
    'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR',
    'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK',
    'SGD', 'THB', 'TRY', 'USD', 'ZAR',
  ];

  // Longest first, so "R$" wins over "$".
  const SYMBOLS = [
    ['US$', 'USD'], ['CA$', 'CAD'], ['AU$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'], ['MX$', 'MXN'],
    ['R$', 'BRL'], ['C$', 'CAD'], ['A$', 'AUD'], ['S$', 'SGD'],
    ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['₹', 'INR'], ['₩', 'KRW'], ['₺', 'TRY'], ['₱', 'PHP'],
    ['zł', 'PLN'],
  ];

  const WORDS = [
    [/\breais\b|\breal brasileiro\b/, 'BRL'],
    [/\beuros?\b/, 'EUR'],
    [/\bpounds?( sterling)?\b|\blibras?\b/, 'GBP'],
    [/\bdollars?\b|\bdolares\b/, 'USD'],
  ];

  // What a bare "$" means, by page language.
  const DOLLAR_BY_LANG = { 'en-ca': 'CAD', 'fr-ca': 'CAD', 'en-au': 'AUD', 'en-nz': 'NZD', 'es-mx': 'MXN' };

  // Period words, matched against lower-cased text without accents.
  const PERIOD_PATTERNS = {
    hour: /\/\s*(h|hr|hrs|hour|hora)\b|\b(per|an|a|each)\s+(hour|hr)\b|\bhourly\b|\bp\/h\b|\bpor hora\b|\bla hora\b|\bper hora\b/,
    day: /\/\s*(d|day|dia)\b|\b(per|a)\s+day\b|\bdaily\b|\bday rate\b|\bpor dia\b|\bal dia\b|\bdiaria\b/,
    week: /\/\s*(wk|week|semana)\b|\b(per|a)\s+week\b|\bweekly\b|\bpor semana\b|\bsemanal\b|\ba la semana\b/,
    month: /\/\s*(mo|mth|month|mes)\b|\b(per|a)\s+month\b|\bmonthly\b|\bpor mes\b|\bao mes\b|\bal mes\b|\bmensal\b|\bmensual\b/,
    year: /\/\s*(yr|year|ano)\b|\b(per|a)\s+(year|annum)\b|\bp\.?\s?a\.?(?![a-z])|\bannual(ly)?\b|\byearly\b|\bpor ano\b|\bao ano\b|\bal ano\b|\banual\b/,
  };

  const RANGE_JOINER = /^\s*(-|–|—|to|a|ate|até|hasta|and|e|y)\s*$/i;

  const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

  const codesPattern = new RegExp(`(?<![A-Za-z])(${KNOWN_CODES.join('|')})(?![A-Za-z])`, 'g');

  /** Removes currency symbols and codes, leaving the words around them. */
  function withoutCurrency(text) {
    let out = text.replace(codesPattern, ' ');
    for (const [symbol] of SYMBOLS) out = out.split(symbol).join(' ');
    return out.replace(/\$/g, ' ');
  }

  const hasCurrencyMark = (text) => withoutCurrency(text) !== text;

  /** Finds the currency of a selection, or '' if none is named. */
  function detectCurrency(text, lang) {
    const upper = text.toUpperCase();
    for (const match of upper.matchAll(/(?<![A-Z])([A-Z]{3})(?![A-Z])/g)) {
      if (KNOWN_CODES.includes(match[1])) return match[1];
    }
    for (const [symbol, code] of SYMBOLS) {
      if (text.includes(symbol)) return code;
    }
    const plain = stripAccents(text.toLowerCase());
    for (const [pattern, code] of WORDS) {
      if (pattern.test(plain)) return code;
    }
    if (text.includes('$')) return DOLLAR_BY_LANG[String(lang || '').toLowerCase()] || 'USD';
    return '';
  }

  /** Finds the pay period named in a selection (the earliest mention wins), or ''. */
  function detectPeriod(text) {
    const plain = stripAccents(text.toLowerCase());
    let best = '';
    let bestIndex = Infinity;
    for (const [period, pattern] of Object.entries(PERIOD_PATTERNS)) {
      const match = plain.match(pattern);
      if (match && match.index < bestIndex) {
        best = period;
        bestIndex = match.index;
      }
    }
    return best;
  }

  // A number with optional thousands groups and decimals, then an optional k / m / mil suffix.
  const NUMBER = /(\d{1,3}(?:[.,   ]\d{3}(?!\d))+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?)(?:\s?(k|m|mil)(?![a-z]))?/gi;

  /** Turns one matched number into a value, reading "8.000" as eight thousand. */
  function numberValue(digits, suffix) {
    let s = digits.replace(/[   ]/g, ',');
    // A single dot followed by exactly three digits is a thousands separator ("R$ 8.000").
    if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '');
    const s2 = (suffix || '').toLowerCase();
    const unit = s2 === 'm' ? 1e6 : s2 ? 1e3 : 1;
    return { value: parseAmount(s) * unit, unit };
  }

  /**
   * Reads a pay figure from selected text.
   * Returns { amount, low, high, currency, period, periodGuessed } or null if no amount is found.
   * For a range, `amount` is the low end.
   */
  function parseSalary(text, lang) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    if (!source) return null;

    const numbers = [];
    for (const match of source.matchAll(NUMBER)) {
      const { value, unit } = numberValue(match[1], match[2]);
      if (Number.isFinite(value) && value > 0) {
        numbers.push({ value, unit, start: match.index, end: match.index + match[0].length });
      }
    }
    if (numbers.length === 0) return null;

    // Prefer amounts written next to a currency ("40 hours a week, $30/hr" → 30).
    const marked = numbers.findIndex((n) => hasCurrencyMark(source.slice(Math.max(0, n.start - 4), n.start)) ||
      hasCurrencyMark(source.slice(n.end, n.end + 5)));
    const joined = (a, b) => RANGE_JOINER.test(
      withoutCurrency(source.slice(a.end, b.start)).replace(/[^\p{L}\-–—]/gu, ' '));
    let startAt = Math.max(0, marked);
    // "50-60 USD/hour": the currency follows the range, so start from the range's first number.
    if (startAt > 0 && joined(numbers[startAt - 1], numbers[startAt])) startAt -= 1;
    const [first, second] = numbers.slice(startAt);
    let low = first.value;
    let high = low;
    if (second) {
      // Two amounts joined by "-", "to", "a", "até"… (currency symbols in between are fine).
      if (joined(first, second)) {
        high = second.value;
        // "$120-150k": the suffix on the second number applies to the first.
        if (second.unit > 1 && first.unit === 1 && first.value < 1000) low = first.value * second.unit;
        if (high < low) [low, high] = [high, low];
      }
    }

    const currency = detectCurrency(source, lang);
    // A period word after the amount is about the amount; one before it may be about something else.
    let period = detectPeriod(source.slice(first.start)) || detectPeriod(source);
    const periodGuessed = !period;
    if (!period) {
      if (low < 1000) period = 'hour';
      else if (currency === 'BRL' && low < 100000) period = 'month'; // Brazilian pay is quoted monthly
      else period = 'year';
    }
    return { amount: low, low, high, currency, period, periodGuessed };
  }

  PayPivot.parseAmount = parseAmount;
  PayPivot.parseSalary = parseSalary;
  PayPivot.KNOWN_CODES = KNOWN_CODES;
})(globalThis);
