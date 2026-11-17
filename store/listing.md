# Chrome Web Store listing — PayPivot

Text to paste into the Developer Dashboard. Images are in this folder.

## Store listing tab

**Name** (taken from the manifest)

PayPivot — Salary & Currency Converter

**Summary** (taken from the manifest description, 132 characters max)

Convert a salary between hourly, daily, weekly, monthly and yearly, and between currencies.

**Category**

Tools

**Language**

English

**Description**

PayPivot turns one pay figure into all the others. Type an hourly rate, a monthly salary or a yearly package, in any currency, and see the rest instantly.

It's built for reading job descriptions: "$50 an hour" and "€90k a year" become comparable in a couple of keystrokes.

WHAT IT DOES

• Type anywhere. Hourly, daily, weekly, monthly and yearly are all inputs. The last one you typed in drives the rest.
• Forgiving input. 50, $50.00, 120,000, 120k, 1.2m and 1.234,56 all work, so you can paste straight from a job post.
• Your working pattern. Set hours per week, days per week and weeks per year.
• Currencies. Show up to four side by side, with daily European Central Bank reference rates you can override by hand.
• No-conversion mode. Switch currencies off for a plain list of what your time is worth.
• Shape the table. Pin the periods you care about and collapse the rest, or flip the table so periods run across and currencies run down.
• Remembers everything. Your figure, currencies and layout are restored next time.

PRIVACY

Everything is stored locally in your browser. The only network request fetches exchange rates from the Frankfurter API, and it contains nothing but currency codes. With conversion switched off, no requests are made. No account, no tracking, no ads.

GOOD TO KNOW

Figures are gross pay. Taxes and benefits are not included. Exchange rates are daily reference rates, not live market rates.

PayPivot is open source: https://github.com/vladisvrau/paypivot

**Images**

| Slot | File | Size |
|---|---|---|
| Store icon | `../icons/icon128.png` | 128×128 |
| Screenshot 1 | `screenshot-1.png` | 1280×800 |
| Screenshot 2 | `screenshot-2.png` | 1280×800 |
| Screenshot 3 | `screenshot-3.png` | 1280×800 |
| Small promo tile | `promo-tile-440x280.png` | 440×280 |

**Homepage URL**

https://github.com/vladisvrau/paypivot

**Support URL**

https://github.com/vladisvrau/paypivot/issues

## Privacy tab

**Single purpose**

PayPivot converts a pay figure between pay periods (hourly, daily, weekly, monthly, yearly) and between currencies.

**Justification for `storage`**

Saves the user's last entered amount, chosen currencies, table layout, working-hours settings and cached exchange rates locally, so the popup reopens as they left it.

**Justification for host permission `https://api.frankfurter.dev/*`**

Fetches daily currency exchange rates and the list of currency names from the Frankfurter API. The requests contain only currency codes. No user data is sent.

**Remote code**

No, I am not using remote code. All JavaScript is packaged in the extension. The API returns JSON data only.

**Data usage**

Tick none of the data categories: PayPivot does not collect or transmit user data.

Certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**

Not required when no user data is collected. If the dashboard asks for one, the Privacy section of the README can serve:
https://github.com/vladisvrau/paypivot#privacy

## Distribution tab

- Payments: free of charge.
- Visibility: Public (or Unlisted to test the flow first).
- Regions: all regions.

## Regenerating the images

Serve the repository root locally, then capture `store/stage.html?shot=1` (2, 3) at 1280×800 and `store/promo.html` at 440×280, for example with headless Chrome's `--screenshot` flag.
