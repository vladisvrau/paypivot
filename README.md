# PayPivot

A Chrome extension for job hunting. It turns one pay figure into all the others, adds up total compensation, and fills application forms with your details and résumé.

Built for reading job descriptions: "$50 an hour" and "€90k a year" become comparable in a couple of keystrokes.

## Features

### Pay

- **Type anywhere.** Hourly, daily, weekly, monthly and yearly fields are all inputs; the last one you typed in drives the rest.
- **Forgiving input.** `50`, `$50.00`, `120,000`, `120k`, `1.2m` and `1.234,56` all work.
- **Read it from the page.** Select a salary on a job post, right-click, and choose **Convert with PayPivot**. The currency, period and range are worked out from the text.
- **Your working pattern.** Set hours per week, days per week and weeks per year.
- **Currencies.** Show up to four side by side, with daily European Central Bank rates you can override by hand.
- **Total compensation.** Add bonus, equity, sign-on, benefits, paid time off and costs to see total pay and an effective hourly rate.
- **Shape the table.** Pin the periods you care about and collapse the rest, flip the table, or switch currencies off.

### Apply

- **Profile.** Name, contact details, LinkedIn, GitHub, portfolio, work authorisation, notice period and salary expectation, each one click to copy.
- **Snippets.** Reusable answers you can copy, or insert into any field with right-click → **Insert snippet**.
- **Résumés.** Store several files (PDF, DOC, DOCX) and pick a default.
- **Help on application pages** (off until you turn it on). Fields PayPivot can fill get a small button; résumé uploads get a menu of your files; **Fill with PayPivot** fills the whole form, with Undo. It never submits anything and never fills passwords or payment fields.
- **Backup.** Export everything to one file and import it on another computer.

Everything is remembered between openings.

## Install

PayPivot is on the [Chrome Web Store](https://chromewebstore.google.com/detail/lnmchmcjlhnlelcbomoahpolnjpmmfdj). To load it from source instead:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Pin PayPivot and click its icon.

## Privacy

Everything is stored locally in your browser: settings and your profile in Chrome's extension storage, résumé files in the extension's own database. The only network request goes to the [Frankfurter API](https://frankfurter.dev) for exchange rates, and it contains nothing but currency codes.

Your profile and files are only written into a page when you click one of PayPivot's buttons there. The page helper needs Chrome's access to all sites, which PayPivot asks for only when you turn the helper on, and gives back when you turn it off.

## How the numbers are calculated

From the hourly rate `h`:

| Period | Formula |
|---|---|
| Daily | `h × hours per week ÷ days per week` |
| Weekly | `h × hours per week` |
| Yearly | `h × hours per week × weeks per year` |
| Monthly | `yearly ÷ 12` |

Total compensation is yearly base + bonus + equity ÷ vesting years + sign-on ÷ its years + benefits − costs. The effective hourly rate divides that by the hours actually worked once paid time off is taken.

Figures are gross pay. Taxes are not included.

See [SPEC.md](SPEC.md) for the full functional spec.

## Project layout

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (Manifest V3) |
| `popup.html`, `popup.css` | Popup markup and styles, light and dark |
| `popup.js` | Pay tab: calculator, rates, total compensation, animations |
| `apply.js` | Apply tab: profile, snippets, résumés, backup, helper switch |
| `background.js` | Right-click menus, figures sent from pages, page helper registration |
| `content/helper.js` | Page helper: field detection, fill buttons, résumé upload |
| `shared/storage.js` | Every read and write of saved data, ready for sync later |
| `shared/parse.js` | Amount parsing and reading pay figures from selected text |
| `shared/files.js` | Résumé storage in IndexedDB |
| `test/form.html` | A sample application form for trying the page helper |
| `store/` | Chrome Web Store screenshots, promo tile and listing text |

There is no build step and there are no dependencies.

## Licence

[MIT](LICENSE)
