# Bayside Payment Tool

Out-the-door quotes and monthly payment estimates on in-stock vehicles at
**Bayside Chrysler Dodge Jeep Ram**, King George, VA · (540) 775-2277.

Live site: https://adimego.github.io/bayside-payment-tool/

Mobile-first and static (plain HTML, CSS and JavaScript modules, no build step), hosted on GitHub Pages.
Pages serves the `gh-pages` branch. Work goes to `main`, and the GitHub Actions workflow copies `main` to `gh-pages` after the tests pass, so only tested code goes live.
This is **phase 1**. It covers the quote math, inventory search, vehicle quote pages, similar vehicles, and a rule-based
"find by monthly payment" tool, all running on the sample vAuto report. The back end, staff features and AI come in later phases (see below).

## Quote rules

| Step | Rule |
| --- | --- |
| Start | vAuto price. New-vehicle prices in the feed already have manufacturer rebates taken off. Used vehicles follow the same rules. |
| Total Selling Price (TSP) | vAuto price + **$995** processing fee (the feed leaves it out) |
| Tax | **4.25%** of the full TSP for a Virginia ZIP or a blank ZIP, with no trade-in tax credit. For a non-Virginia ZIP, the tool looks up the combined local sales tax rate (ZIP-level if present, otherwise the state base rate). The customer can override the tax percent. |
| Registration | **$153.50** for Virginia or a blank ZIP; **$753.50** for any out-of-state ZIP |
| Military / First Responder | optional **−$500** on **new** vehicles only, applied **after** tax. Used vehicles are not eligible. |
| Out-the-door (OTD) | TSP + tax + registration − $500 (if a new vehicle and the rebate is picked) |
| Trade equity | trade value − loan payoff. Positive equity comes off and negative equity is added. |
| Amount financed | OTD − down payment − trade equity, never below $0 |
| Payment | standard amortization: `P = A·r / (1 − (1 + r)^−n)`, where r = APR/12 |

**APR by credit tier.** The table below is the 36-month rate for **used / pre-owned** vehicles, plus 0.5% for every extra 12 months. **New** vehicles are 0.5 percentage points lower at every term (9.5% Good at 36 months, 11.0% at 72 months, and so on). The rate reference is the `TIERS` table in `src/quote.js`.

Used / pre-owned:

| Credit | 36 | 48 | 60 | 72 | 84 |
| --- | --- | --- | --- | --- | --- |
| Poor | 20.0% | 20.5% | 21.0% | 21.5% | 22.0% |
| Fair | 16.0% | 16.5% | 17.0% | 17.5% | 18.0% |
| Good | 10.0% | 10.5% | 11.0% | 11.5% | 12.0% |
| Great | 8.0% | 8.5% | 9.0% | 9.5% | 10.0% |
| Excellent | 6.0% | 6.5% | 7.0% | 7.5% | 8.0% |

New:

| Credit | 36 | 48 | 60 | 72 | 84 |
| --- | --- | --- | --- | --- | --- |
| Poor | 19.5% | 20.0% | 20.5% | 21.0% | 21.5% |
| Fair | 15.5% | 16.0% | 16.5% | 17.0% | 17.5% |
| Good | 9.5% | 10.0% | 10.5% | 11.0% | 11.5% |
| Great | 7.5% | 8.0% | 8.5% | 9.0% | 9.5% |
| Excellent | 5.5% | 6.0% | 6.5% | 7.0% | 7.5% |

**Term caps by vehicle age.** Age is the current model year minus the vehicle's model year (the year at the start of the Vehicle string). The current model year is the constant `CURRENT_MODEL_YEAR = 2026` in `src/quote.js`, not derived from the calendar (a September model-year rollover would already be 2027 in November 2026 and would shift these boundaries).

| Model year | Age in 2026 | Max term |
| --- | --- | --- |
| 2021 and newer | 5 or less | 84 months (no cap) |
| 2017–2020 | 6 to 9 | 72 months |
| 2016 and older | 10 or more | 60 months |

If the selected term is longer than the cap, the tool auto-selects the maximum and disables the longer term buttons, with a short note such as "Max term for 2016 and older: 60 months." Inventory card estimates and Find by payment use each vehicle's own cap and new/used rate.

**Worked example**, checked by hand and covered in `tests/quote.test.js`: a $39,005 vAuto price on a **used** vehicle with Good credit, 72 months and $3,000 down.
TSP $40,000.00 → tax $1,700.00 → registration $153.50 → OTD $41,853.50 → financed $38,853.50 → 11.5% APR → **$749.53/mo**. The same deal on a new vehicle would use 11.0% APR.

Every quote shows: *Rates are subject to credit approval. Taxes may vary on rebate amounts.*
Out-of-state quotes also show: *Out-of-state tax and registration are estimates; your state may calculate them differently.*
Every quote also has [Apply for Financing](https://www.baysidecdjrva.com/apply-for-financing.htm) and
[Value My Trade](https://www.baysidecdjrva.com/trade-in-form.htm) buttons.

## Inventory

- The source is the daily vAuto report. Its columns are Stock #, Vehicle, Certified, VIN, New/Used, Odometer, Body, Color, Interior Color and Price.
- **Vehicle type** comes from the Body column:
  - SUV: Sport Utility
  - Truck: Crew Cab or Double Cab
  - Car: Sedan, Coupe or Hatchback
  - Van: Passenger Van
- A vehicle with **no price** shows **Call for Price** and no quote.
- The report has no photos or options, so each vehicle links to the dealer website by stock number:
  `https://www.baysidecdjrva.com/all-inventory/index.htm?search=<STOCK>`. That Dealer.com inventory search returns the single matching vehicle.
- **Similar vehicles** are the same type, priced within ±15%. The same make ranks first, then the same model, then the closest price.
- **Find by payment** works the quote math backward from a monthly goal to the highest vAuto price that fits. It filters by type (and new/used if picked) and sorts the matches by closest fit under the goal.

To refresh `data/inventory.json` from a new report:

```sh
node scripts/import-vauto.mjs path/to/report.xlsx   # .csv also works
```

## Sales tax data

An optional customer ZIP on the quote page and in Find by payment sets the tax and registration:

- Virginia ZIP (for example 22485) or a blank ZIP: **4.25%** tax and **$153.50** registration.
- Any other recognized US ZIP: the combined local rate for that ZIP, or the state base rate if no ZIP-level rate is on file, and **$753.50** registration.
- Invalid input is treated like a blank ZIP (Virginia defaults). The tax percent can be typed in by hand.

The lookup table is bundled as `data/tax-rates.json` (a 3-digit ZIP-prefix-to-state map, state base rates, and ZIP-level rates only where they differ from the state rate) so the GitHub Pages site needs no API keys.

**Sources and as-of dates**

- **State base rates:** [ReceiptEdit US State Sales Tax Dataset 2026.1](https://github.com/receiptedit/us-sales-tax-2026) (MIT), last updated **June 17, 2026**. The District of Columbia 6.00% statewide rate is from the [DC Office of Tax and Revenue](https://otr.cfo.dc.gov/).
- **ZIP-level combined rates:** [DeepCalc US sales-tax ZIP table](https://deepcalc.com/data/us-sales-tax/zip), dominant combined rate, primarily **2026 Q3** (Ohio 2026 Q1, Iowa 2025 Q3, Nevada 2025 Q4). States without a ZIP row fall back to the state base rate. These are estimates, not street-level compliance rates.
- **ZIP-to-state prefixes:** USPS ZIP Code prefixes via [alecperkins/zip-state](https://github.com/alecperkins/zip-state) (CC0). Prefixes 202–205 are mapped to DC (USPS unique/government ZIPs).

To rebuild `data/tax-rates.json` from those sources:

```sh
node scripts/build-tax-data.mjs
```

That script downloads the prefix list, the ReceiptEdit state file, and the DeepCalc ZIP table, then writes a compact JSON file. Re-run it when a new quarter's rates are published, then run `node --test` and commit the updated `data/tax-rates.json`.

## Project layout

```
index.html              page shell (header, tabs, footer)
styles.css              mobile-first styles
favicon.svg
src/quote.js            quote and payment math, pure functions (browser, Node, Deno)
src/tax.js              ZIP lookup, tax rate, and out-of-state registration
src/vauto-parse.js      vAuto rows → vehicle records, body → type, name → year/make/model/trim, CSV parser
src/inventory.js        website link, similar vehicles, payment-goal finder, search
src/ai-hook.js          rankSuggestions(): pass-through today; the AI phase plugs in here
src/app.js              UI: shop list, vehicle quote page, find-by-payment
scripts/import-vauto.mjs  report (.xlsx/.csv) → data/inventory.json
scripts/build-tax-data.mjs  rebuild data/tax-rates.json from the public sources below
scripts/lib/xlsx.mjs    tiny dependency-free .xlsx reader
data/inventory.json     current inventory (from the Nov 19, 2026 sample report)
data/tax-rates.json     bundled ZIP-prefix, state, and ZIP sales-tax table
tests/                  node --test unit tests (+ sample report fixture)
.github/workflows/test.yml  runs the tests on every push and PR, then publishes main to gh-pages
```

## Run locally

```sh
node --test                  # unit tests (Node 20+)
python3 -m http.server 8080  # then open http://localhost:8080
```

## Upcoming phases

1. **Supabase back end.** Supabase provides the database, auth and Edge Functions. Keys live in Supabase project settings and GitHub secrets, never in this repo.
2. **Daily vAuto import by email.** vAuto emails the scheduled report every morning to a Postmark inbound address. Postmark posts the attachment to a Supabase Edge Function, which reuses `src/vauto-parse.js` and loads the inventory table. The site then reads inventory from Supabase instead of `data/inventory.json`.
3. **Staff accounts.** Salespeople fill out an account request form, and Adam approves or declines each request on an admin screen. Each salesperson gets their own login.
4. **Saved quotes.** Staff save a quote tagged with their name and get a **Copy Link** button to paste into the CRM's texting platform. This means no separate texting service, and opt-in stays with the CRM. Phase 1 already puts the deal inputs in the vehicle page URL (`#/vehicle/<stock>?down=…&tier=…`), so a link reproduces the quote.
5. **AI vehicle suggestions.** A Supabase Edge Function ranks the payment-goal matches by fit and explains each pick in plain words. It plugs in at `rankSuggestions()` in `src/ai-hook.js`. Payments always come from `src/quote.js`, never from the AI.
6. **Launch.** Add a custom domain and link the tool from baysidecdjrva.com.

## Notes

- No secrets belong in this repo. It is public and served by GitHub Pages.
- All figures are estimates, not an offer of credit.
