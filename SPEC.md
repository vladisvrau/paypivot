# PayPivot — Functional Spec

A Chrome extension popup that converts a pay figure from a job description between pay periods and between currencies.

## 1. Core behaviour

- The popup shows a table of amounts: pay periods (hourly, daily, weekly, monthly, yearly) against one to four currencies.
- **Any field is an input.** Typing in one field recalculates all the others immediately.
- The last field typed in is the **anchor**. It is highlighted, and it is the value held fixed when anything else changes (hours per week, currencies, exchange rates).
- Amount parsing is forgiving so figures can be pasted straight from a job post: `50`, `$50.00`, `120,000`, `120k`, `1.2m`, `1.234,56`.
- Computed fields show two decimals with thousands separators.

## 2. Period conversion

Three calibration settings, all editable in the popup:

| Setting | Default | Range |
|---|---|---|
| Hours per week | 40 | 1–168 |
| Days per week | 5 | 1–7 |
| Weeks per year | 52 | 1–52 |

Formulas, from the hourly rate `h`:

- Daily = `h × hoursPerWeek ÷ daysPerWeek`
- Weekly = `h × hoursPerWeek`
- Yearly = `h × hoursPerWeek × weeksPerYear`
- Monthly = `Yearly ÷ 12`

Lowering weeks per year models unpaid time off (e.g. 48 for a contractor taking four weeks off).

## 3. Customising the table

- **Pin.** Each pay period has a pin toggle. Hourly, monthly and yearly are pinned by default.
- **Collapse.** The Collapse button hides every period that is not pinned; Show all brings them back. If nothing is pinned, the anchor's period is shown. A hidden anchor still drives the visible values.
- **Flip table.** Swaps rows and columns: currencies become the rows and pay periods the columns. The popup widens to fit (Chrome limits popups to 800px).

## 4. Currencies

- **Convert switch.** When off, the table shows a single currency (the anchor's) with no rates and no network requests — a plain list of what your time is worth. The currency can still be changed, which only relabels the amounts.
- **Add / remove.** With conversion on, "+ Currency" adds a column (up to four) and × removes one. A currency appears at most once. Removing the anchor's currency moves the anchor to a remaining one at the same worth.
- **Rates.** The first currency is the base; every other currency shows an editable "1 BASE = x" rate. Rates come from the Frankfurter API (European Central Bank daily reference rates, free, no API key), as does the currency list.
- Rates are cached and re-fetched when older than 12 hours or when a currency is added or changed. ↻ forces a fetch.
- A typed rate is marked with a dashed border and kept until ↻ is pressed or that currency is changed.
- If the fetch fails and no rate is cached, that currency's amounts stay empty and the popup asks for a manual rate. Period conversion still works.

## 5. Persistence

Everything is restored when the popup is reopened: the anchor amount, the currencies, pins, collapsed/flipped/convert switches, the three calibration settings, and cached rates. Data is stored locally in `chrome.storage.local`; nothing is sent anywhere except the rate request (which carries only currency codes).

## 6. Permissions

- `storage` — to remember settings.
- Host access to `https://api.frankfurter.dev/*` — to fetch rates.

## 7. Out of scope (for now)

- Taxes, benefits, or net-pay estimates.
- Reading salaries from the page (e.g. right-click a selected figure).
- Reordering currencies or periods.
- Biweekly / semi-monthly periods.
