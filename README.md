# PayPivot

A Chrome extension that turns one pay figure into all the others. Type an hourly rate, a monthly salary or a yearly package — in any currency — and see the rest instantly.

Built for reading job descriptions: "$50 an hour" and "€90k a year" become comparable in a couple of keystrokes.

## Features

- **Type anywhere.** Hourly, daily, weekly, monthly and yearly fields are all inputs; the last one you typed in drives the rest.
- **Forgiving input.** `50`, `$50.00`, `120,000`, `120k`, `1.2m` and `1.234,56` all work.
- **Your working pattern.** Set hours per week, days per week and weeks per year.
- **Currencies.** Show up to four side by side, with live European Central Bank rates you can override by hand.
- **No conversion mode.** Switch currencies off for a plain list of what your time is worth.
- **Shape the table.** Pin the periods you care about and collapse the rest, or flip the table so periods run across and currencies run down.
- **Remembers everything.** Your figure, currencies and layout are restored next time.

## Install

PayPivot is not on the Chrome Web Store yet. To load it from source:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Pin PayPivot and click its icon.

## Privacy

Everything is stored locally in your browser. The only network request goes to the [Frankfurter API](https://frankfurter.dev) for exchange rates, and it contains nothing but currency codes. With conversion switched off, no requests are made.

## How the numbers are calculated

From the hourly rate `h`:

| Period | Formula |
|---|---|
| Daily | `h × hours per week ÷ days per week` |
| Weekly | `h × hours per week` |
| Yearly | `h × hours per week × weeks per year` |
| Monthly | `yearly ÷ 12` |

Figures are gross pay. Taxes and benefits are not included.

See [SPEC.md](SPEC.md) for the full functional spec.

## Project layout

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (Manifest V3) |
| `popup.html` | Popup markup |
| `popup.css` | Styles, light and dark |
| `popup.js` | All logic: parsing, maths, rates, table and animations |

There is no build step and there are no dependencies.
