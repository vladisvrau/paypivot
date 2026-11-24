# PayPivot — Functional Spec

A Chrome extension that helps with a job search: it converts pay figures from job posts between pay periods and currencies, works out total compensation, and speeds up filling in applications.

Version 1.0 is the calculator (parts 1–5). Version 2.0 adds parts 6–9.

## 1. Calculator: core behaviour

- The popup shows a table of amounts: pay periods (hourly, daily, weekly, monthly, yearly) against one to four currencies.
- **Any field is an input.** Typing in one field recalculates all the others immediately.
- The last field typed in is the **anchor**. It is highlighted, and it is the value held fixed when anything else changes (hours per week, currencies, exchange rates).
- Amount parsing is forgiving so figures can be pasted straight from a job post: `50`, `$50.00`, `120,000`, `120k`, `1.2m`, `1.234,56`.
- Computed fields show two decimals with thousands separators.

### Period conversion

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

## 2. Calculator: customising the table

- **Pin.** Each pay period has a pin toggle. Hourly, monthly and yearly are pinned by default.
- **Collapse.** The Collapse button hides every period that is not pinned; Show all brings them back. If nothing is pinned, the anchor's period is shown. A hidden anchor still drives the visible values.
- **Flip table.** Swaps rows and columns: currencies become the rows and pay periods the columns. The popup widens to fit (Chrome limits popups to 800px).

## 3. Calculator: currencies

- **Convert switch.** When off, the table shows a single currency (the anchor's) with no rates and no network requests — a plain list of what your time is worth. The currency can still be changed, which only relabels the amounts.
- **Add / remove.** With conversion on, "+" adds a currency (up to four) and × removes one. A currency appears at most once. Removing the anchor's currency moves the anchor to a remaining one at the same worth.
- **Rates.** The first currency is the base; every other currency shows an editable "1 BASE = x" rate. Rates come from the Frankfurter API (European Central Bank daily reference rates, free, no API key), as does the currency list.
- Rates are cached and re-fetched when older than 12 hours or when a currency is added or changed. ↻ forces a fetch.
- A typed rate is marked with a dashed border and kept until ↻ is pressed or that currency is changed.
- If the fetch fails and no rate is cached, that currency's amounts stay empty and the popup asks for a manual rate. Period conversion still works.

## 4. Calculator: persistence

Everything is restored when the popup is reopened: the anchor amount, the currencies, pins, collapsed/flipped/convert switches, the three calibration settings, and cached rates.

## 5. Popup layout (v2)

The popup gets two tabs at the top, remembered between openings, as is which groups are open:

- **Pay** — the calculator (parts 1–4) and total compensation (part 7).
- **Apply** — the profile, snippets and résumé (part 8), with the page helper switch (part 9).

## 6. Read salary from page (v2)

- Select a pay figure on any page, right-click, and choose **Convert with PayPivot**.
- The selection is parsed for:
  - **Amount**, with the existing forgiving parser. When the selection has several numbers, the first one written next to a currency wins ("40 hours a week, $30/hr" → 30). A lone `8.000` is read as eight thousand. Ranges such as `$120k – $150k` or `120,000-150,000` take the **low end** by default; a note above the table quotes the selection and offers Low, Mid and High buttons.
  - **Currency** from a symbol or code: `$` → USD, `€` → EUR, `£` → GBP, `R$` → BRL, `US$`, `CA$`, `A$`, plus any three-letter code PayPivot knows. A bare `$` is USD unless the page language suggests otherwise (e.g. CAD for `en-CA`, AUD for `en-AU`).
  - **Period** from words such as `/hr`, `per hour`, `an hour`, `hourly`, `/day`, `daily`, `/wk`, `weekly`, `/mo`, `monthly`, `/yr`, `per annum`, `a year`, `annual`, `salary`, also in Portuguese and Spanish (`por hora`, `por mês`, `al año`, …). With no period word, amounts under 1,000 are taken as hourly, Brazilian real amounts under 100,000 as monthly (pay in Brazil is quoted monthly), and the rest as yearly; the note says the period was guessed.
- The parsed figure becomes the anchor and the popup opens on the Pay tab. If the currency isn't in the table, it replaces the last column (or is added if there's room). Conversion is switched on if a currency was detected that differs from the current one.
- If Chrome can't open the popup programmatically, the extension shows a badge on its icon and applies the figure the next time the popup is opened.
- If nothing parseable is found, the badge shows "?" and the popup explains that no amount was found in the selection.

## 7. Total compensation (v2)

A collapsible **Total compensation** section under the calculator. Every field is optional; empty means zero.

| Field | Input | Counts as |
|---|---|---|
| Bonus | amount per year, or % of base | yearly cash |
| Equity | value of the grant and vesting years (default 4) | grant ÷ years per year |
| Sign-on | one-off amount | spread over a chosen number of years (default 1) |
| Benefits | yearly value (health, pension match, allowances) | yearly |
| Paid time off | days per year | lowers worked hours (see below) |
| Costs | yearly amount (commute, equipment, coworking) | subtracted |

- Amounts are entered in one of the table's currencies, chosen under the fields (the anchor's by default).
- The section shows, in every currency of the table:
  - **Base per year**, from the calculator.
  - **Total compensation per year** = base + bonus + equity per year + sign-on per year + benefits − costs.
  - **Effective hourly rate** = total per year ÷ hours actually worked, where hours worked = `hoursPerWeek × (weeksPerYear − PTO days ÷ daysPerWeek)`.
- Base pay still comes from the anchor, so changing the calculator updates the totals.
- The extras are saved with the rest of the state. A **Clear** button empties them for the next offer.

## 8. Application helper: profile, snippets and résumé (v2)

### Profile

Fixed fields for the information most application forms ask for:

- First name, last name, preferred name
- Email, phone
- City, country
- LinkedIn, GitHub, portfolio / website
- Current title, current company, years of experience
- Work authorisation (free text, e.g. "EU citizen, no sponsorship needed")
- Notice period, salary expectation (free text)

Each field has a **copy** button. Copying shows a short "Copied" confirmation.

Like the pay periods, profile fields can be **pinned** (📌), and the profile's **Collapse** button hides every unpinned field; **Show all (n more)** brings them back. Email, phone, LinkedIn, GitHub and portfolio are pinned by default. A section heading is hidden when none of its fields are showing, and if nothing is pinned the collapsed profile suggests pinning. Rows glide, fade in and fade out with the popup resizing, as in the table. Pins and the collapsed state are remembered.

### Snippets

Free-form, reusable text: a short bio, "why I'm looking", a cover letter opening, answers to common questions. Each snippet has a title, a body, and a copy button. Snippets can be added, edited, reordered by drag, and deleted.

### Résumé

- Upload one or more files (PDF, DOC, DOCX; up to 5 MB each) from the Apply tab, each with a label (e.g. "Résumé — English", "CV — Português"). One is marked default.
- "Open in a tab" opens the Apply tab as a full page, for longer editing or if the popup closes when the file picker opens.
- Files are stored locally in the extension's IndexedDB, not in `chrome.storage`, so they don't count against its size limit.
- Each file can be replaced, renamed, downloaded or deleted.

## 9. Application helper: on the page (v2)

### Turning it on

The page helper is **off by default**. A switch in the Apply tab, "Help me on application pages", asks Chrome for permission to read and change all sites (shown by Chrome as a separate prompt). The helper starts straight away, in tabs that are already open as well as new ones, so an application page you're on gets its buttons without a reload. Turning it off removes the permission and the buttons from open tabs. Pages Chrome protects (such as `chrome://` pages and the Web Store) and tabs Chrome has put to sleep are skipped; a sleeping tab gets the helper when it reloads. Without the helper, everything in parts 1–8 still works.

### Field detection

The helper looks for form fields it can fill and classifies them from, in order: the `autocomplete` attribute, the field's label text, `name` / `id`, placeholder, and `aria-label`. Matching covers English, Portuguese and Spanish wording. Recognised kinds map to profile fields, e.g.:

| Field on the page | Filled with |
|---|---|
| `autocomplete="given-name"`, "First name", "Nome" | First name |
| "Email", `type="email"` | Email |
| "LinkedIn", "LinkedIn profile URL" | LinkedIn |
| "GitHub" | GitHub |
| "Portfolio", "Website", "Personal site" | Portfolio / website |
| "Salary expectation", "Pretensão salarial" | Salary expectation |
| `type="file"` with label "Resume", "CV", "Currículo" | Default résumé |

Fields inside cross-origin iframes (some job boards embed their forms this way) are handled by the same script running in that frame.

### Filling

- Each recognised, empty field gets a small **PayPivot chip** at its right edge, if the profile has a value for it. Clicking the chip fills that field. Fields that already have a value are left alone and get no chip.
- A **résumé field** gets a chip that opens a small menu listing the stored files; picking one attaches it. When the file input is hidden behind a styled drop zone, the chip sits on the drop zone and the file is still given to the hidden input. Drop zones with no file input behind them aren't supported.
- A floating **Fill all** button appears at the bottom-right when the page has at least three recognised fields. It fills every recognised empty field and attaches the default résumé, then reports "Filled 7 fields" with an Undo for 8 seconds. Its × hides it on that page.
- Filling triggers the same events as typing (`input`, `change`, `blur`) so that sites built with React, Angular or Vue notice the value.
- The helper never submits a form, never clicks "Next" or "Apply", and never fills passwords or payment fields.
- Nothing is filled without a click. There is no automatic filling on page load, and clicks generated by the page's own scripts are ignored.
- Fields that look like passwords or identity and payment numbers (card, CVV, IBAN, SSN, CPF, passport…) are never filled, whatever their label.

### Unrecognised fields

Free-text questions the helper can't classify (e.g. "Why do you want to work here?") get no chip. Snippets are inserted with the right-click menu: **Insert snippet → (title)**, available on any editable field. This works without the page helper being on.

## 10. Storage and sync

- **Now:** everything is stored on this device. Settings and the profile in `chrome.storage.local`; résumé files in IndexedDB.
- **Room for sync later:** all reads and writes go through one storage module with named areas (`calculator`, `profile`, `snippets`, `files`). Adding sync means switching the first three to `chrome.storage.sync` behind a setting, with no changes elsewhere. Files can't sync through Chrome (its sync storage is limited to about 100 KB in total), so they stay local; a sync version would show "stored on another device" for missing files.
- An **Export / Import** button in the Apply tab saves or restores everything (profile, snippets, settings and files) as one JSON file, as a backup and a manual way to move between devices until sync exists.

## 11. Permissions

| Permission | Why | When |
|---|---|---|
| `storage` | Remember settings and the profile | Always |
| `https://api.frankfurter.dev/*` | Exchange rates | Always |
| `contextMenus` | "Convert with PayPivot" and "Insert snippet" | Always |
| `activeTab`, `scripting` | Read the selected text and insert snippets on the page you right-clicked | Always (no install warning) |
| `<all_urls>` (optional) | Show chips and Fill all on application pages | Only after the switch in part 9 is turned on |

Keeping all-sites access optional means installing or updating to v2 shows no new warning, and the Web Store review stays light.

## 12. Privacy

- Nothing typed into PayPivot leaves the browser. The only network request is still the exchange-rate request, carrying only currency codes.
- The profile and files are only ever written into a page's form fields when the user clicks a chip, Fill all, or a menu item.
- The Web Store privacy answers need updating for v2: the extension now *handles* personally identifiable information (the profile) and files on the user's device. Whether that counts as "collected" under the store's definitions must be checked against the dashboard's wording before submitting.

## 13. Out of scope (for now)

- Taxes, benefits rules, or net-pay estimates.
- Saving and comparing several offers side by side (the data model in part 7 is per offer, so this can be added later).
- An application tracker (statuses, follow-ups).
- Generating answers or cover letters with AI.
- Parsing the résumé to fill the profile automatically.
- Reordering currencies or periods; biweekly and semi-monthly periods.
