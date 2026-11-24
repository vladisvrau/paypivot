# Chrome Web Store listing — PayPivot

Text to paste into the Developer Dashboard. Images are in this folder.

## Store listing tab

**Name** (taken from the manifest)

PayPivot — Salary Converter & Job Application Helper

**Summary** (taken from the manifest description, 132 characters max)

Convert salaries between pay periods and currencies, add up total compensation, and fill job applications faster.

**Category**

Tools

**Language**

English

**Description**

PayPivot is a small companion for job hunting. It turns any pay figure into every other, adds up what an offer is really worth, and keeps your details ready for application forms.

PAY

• One figure, every period. Hourly, daily, weekly, monthly and yearly are all inputs. Type in any of them and the rest fill in.
• Straight from the job post. Select "$120k – $150k a year" or "R$ 8.000 por mês" on any page, right-click and choose Convert with PayPivot. The amount, range, currency and pay period are read for you.
• Currencies. Show up to four side by side, with daily European Central Bank reference rates you can override by hand, or switch conversion off for a plain list.
• Total compensation. Add bonus, equity, sign-on, benefits, paid time off and costs to see the yearly total and the effective hourly rate of an offer.
• Your working pattern. Set hours per week, days per week and weeks per year.
• Shape the table. Pin the periods you care about and collapse the rest, or flip rows and columns.

APPLY

• Profile. Keep your name, contact details, links, current role, work authorisation and salary expectation in one place, each a click away from the clipboard. Pin the ones you use most.
• Snippets. Save reusable answers like a short bio or "why I'm looking", and insert them into any text field from the right-click menu.
• Résumés. Store several versions and pick a default.
• Fill forms on the page (optional). Turn on "Help me on application pages" and PayPivot recognises fields such as name, email, LinkedIn, salary expectation and résumé upload. A small button on each fills it, or Fill all does the lot, with Undo. Nothing is filled until you click, forms are never submitted, and password and payment fields are never touched.
• Backup. Export everything to one file and import it on another computer.

PRIVACY

Everything you enter stays in your browser. Your profile, snippets and résumés are never sent anywhere; they are only written into a page's form when you click one of PayPivot's buttons. The only network request fetches exchange rates from the Frankfurter API and contains nothing but currency codes. The page helper is off until you turn it on, and Chrome asks for your permission first. No account, no tracking, no ads.

GOOD TO KNOW

Figures are gross pay; taxes are not included. Exchange rates are daily reference rates, not live market rates. Some application sites build their forms in unusual ways, so a field may not be recognised; copying from the Apply tab always works.

PayPivot is open source: https://github.com/vladisvrau/paypivot

**Images**

| Slot | File | Size |
|---|---|---|
| Store icon | `../icons/icon128.png` | 128×128 |
| Screenshot 1 | `screenshot-1.png` (every pay period) | 1280×800 |
| Screenshot 2 | `screenshot-2.png` (convert from a job post) | 1280×800 |
| Screenshot 3 | `screenshot-3.png` (total compensation) | 1280×800 |
| Screenshot 4 | `screenshot-4.png` (profile and snippets) | 1280×800 |
| Screenshot 5 | `screenshot-5.png` (filling a form) | 1280×800 |
| Small promo tile | `promo-tile-440x280.png` | 440×280 |

**Homepage URL**

https://github.com/vladisvrau/paypivot

**Support URL**

https://github.com/vladisvrau/paypivot/issues

## Privacy tab

**Single purpose**

PayPivot helps with job applications: it converts pay figures between pay periods and currencies, adds up total compensation, and fills application forms with the user's own saved details.

**Justification for `storage`**

Saves the user's calculator settings, profile, snippets and cached exchange rates locally, so the extension reopens as they left it.

**Justification for `contextMenus`**

Adds two right-click items: "Convert with PayPivot" for selected text, and "Insert snippet" for editable fields.

**Justification for `activeTab`**

When the user picks a right-click item, PayPivot reads the page's language (to tell which dollar a "$" means) and inserts the chosen snippet into the field they right-clicked. Nothing happens on a page until the user picks an item.

**Justification for `scripting`**

Used with activeTab to insert a snippet into the field the user right-clicked, and to register the optional application-form helper once the user turns it on.

**Justification for host permission `https://api.frankfurter.dev/*`**

Fetches daily currency exchange rates and the list of currency names from the Frankfurter API. The requests contain only currency codes. No user data is sent.

**Justification for optional host permission `<all_urls>`**

Requested only when the user turns on "Help me on application pages". It lets PayPivot show fill buttons on job application forms, on whichever site the employer uses. Fields are filled only when the user clicks a button; forms are never submitted, and password and payment fields are never touched. Turning the switch off gives the permission back.

**Remote code**

No, I am not using remote code. All JavaScript is packaged in the extension. The API returns JSON data only.

**Data usage**

> Check this section against the dashboard's own definitions before submitting version 2.0.

PayPivot now handles personally identifiable information (name, email, phone, links) and files the user chooses to store, but keeps them on the user's device and never sends them to the developer or any server. They are only written into a web page's form when the user clicks one of PayPivot's buttons on that page. If the dashboard counts data as "collected" only when it leaves the device, tick none of the categories; if it counts local handling, tick **Personally identifiable information** and describe the local-only use.

Certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**

https://github.com/vladisvrau/paypivot#privacy

## Distribution tab

- Payments: free of charge.
- Visibility: Public (or Unlisted to test the flow first).
- Regions: all regions.

## Regenerating the images

Serve the repository root locally, then capture `store/stage.html?shot=1` (2 to 5) at 1280×800 and `store/promo.html` at 440×280, for example with headless Chrome's `--screenshot` flag.
