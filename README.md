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
| Tax | **4.25%** of the full TSP, with no trade-in tax credit |
| Registration | **$153.50** flat |
| Military / First Responder | optional **−$500** on **new** vehicles only, applied **after** tax. Used vehicles are not eligible. |
| Out-the-door (OTD) | TSP + tax + $153.50 − $500 (if a new vehicle and the rebate is picked) |
| Trade equity | trade value − loan payoff. Positive equity comes off and negative equity is added. |
| Amount financed | OTD − down payment − trade equity, never below $0 |
| Payment | standard amortization: `P = A·r / (1 − (1 + r)^−n)`, where r = APR/12 |

**APR by credit tier.** The 36-month rate is the base, plus 0.5% for every extra 12 months.

| Credit | 36 | 48 | 60 | 72 | 84 |
| --- | --- | --- | --- | --- | --- |
| Poor | 20.0% | 20.5% | 21.0% | 21.5% | 22.0% |
| Fair | 16.0% | 16.5% | 17.0% | 17.5% | 18.0% |
| Good | 10.0% | 10.5% | 11.0% | 11.5% | 12.0% |
| Great | 8.0% | 8.5% | 9.0% | 9.5% | 10.0% |
| Excellent | 6.0% | 6.5% | 7.0% | 7.5% | 8.0% |

**Worked example**, checked by hand and covered in `tests/quote.test.js`: a $39,005 vAuto price with Good credit, 72 months and $3,000 down.
TSP $40,000.00 → tax $1,700.00 → registration $153.50 → OTD $41,853.50 → financed $38,853.50 → 11.5% APR → **$749.53/mo**.

Every quote shows: *Rates are subject to credit approval. Taxes may vary on rebate amounts.*
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

## Project layout

```
index.html              page shell (header, tabs, footer)
styles.css              mobile-first styles
favicon.svg
src/quote.js            quote and payment math, pure functions (browser, Node, Deno)
src/vauto-parse.js      vAuto rows → vehicle records, body → type, name → year/make/model/trim, CSV parser
src/inventory.js        website link, similar vehicles, payment-goal finder, search
src/ai-hook.js          rankSuggestions(): pass-through today; the AI phase plugs in here
src/app.js              UI: shop list, vehicle quote page, find-by-payment
scripts/import-vauto.mjs  report (.xlsx/.csv) → data/inventory.json
scripts/lib/xlsx.mjs    tiny dependency-free .xlsx reader
data/inventory.json     current inventory (from the Nov 19, 2026 sample report)
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
