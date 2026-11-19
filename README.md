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
| Tax | **4.25%** of the full TSP for a Virginia ZIP or a blank ZIP, with no trade-in tax credit. For a non-Virginia ZIP, the tool uses that state's **motor-vehicle** tax rate when it differs from general retail sales tax (for example Maryland's 6.5% titling excise tax, North Carolina's 3% highway use tax), **plus Virginia's 0.10% local business tax**. The breakdown shows the split, for example **Tax (MD 6.60%: MD 6.50% + VA business 0.10%)**. In states that add local tax to a vehicle purchase, the out-of-state portion is the combined state + local rate by ZIP when on file (NYC is 8.875%, so the quote is 8.975%). If no ZIP-level rate is on file, it uses the state rate plus 0.10% and labels it "state rate only; local tax may apply." Modeled caps (such as South Carolina's $500 infrastructure maintenance fee cap) apply only to the out-of-state portion after any trade-in credit; the 0.10% VA business tax is added on the **full** TSP, uncapped, because Virginia itself does not allow a trade-in credit. In states that tax only the price minus the trade-in, tax on the out-of-state portion is **rate × max(0, TSP − trade value)**; the trade **value** is used, not equity, and the loan payoff does not change the tax. The breakdown then shows **Taxable amount $X (trade credit applied)**. Virginia, California, Hawaii, and D.C. tax the full TSP. Michigan caps the credit at **$12,000** in 2026. Oklahoma splits the rate (3.25% excise on the full price, 1.25% sales tax on the difference). A manual tax-percent override replaces the **total** rate (it is not increased by 0.10%) and is applied to the same taxable base the state rule would use. Virginia quotes stay at **4.25%**, which already includes the business tax, with no trade-in credit. |
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

## Trade-in tax credit

Verified against official 2026 DMV, DOR, and statute sources, plus Michigan Treasury Form 485 (Rev. 1-26) for reciprocal-state trade-in allowances. The flags live in `data/tax-rates.json` (`tradeCredit`) and `scripts/trade-credit.mjs`.

**Full credit** (tax the out-of-state portion on TSP minus trade value): AL, AZ, AR, CO, CT, DE, FL, GA (dealer sales), ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MN, MS, MO, NE, NV, NJ, NM, NY, NC, ND, PA, SC, SD, TN, TX, UT, VT, WA, WV, WI, WY. Maryland is included: the MDOT MVA Taxable Price bulletin (April 23, 2026) subtracts a non-leased dealer trade-in from the titling-tax base.

**No credit** (tax the full TSP): **Virginia** (Code § 58.1-2401 and [VA DMV](https://www.dmv.virginia.gov/vehicles/taxes-fees/sut)), **California** ([CDTFA](https://cdtfa.ca.gov/industry/vehicles-vessels-aircraft/vehicles.htm)), **Hawaii** (Michigan Form 485 lists Hawaii as NO; TIR 93-3 allows a deduction only when the trade-in is turned over to a Hawaii dealer, which does not apply on a Virginia dealer sale), **District of Columbia** (excise is on NADA fair market value, so a trade-in does not reduce it).

**No statewide vehicle sales tax** (credit has no effect; rate is 0%): Alaska (local tax, if a ZIP rate is on file, is treated as a full credit; local rules may vary), Montana, New Hampshire, Oregon.

**Partial / special rules:**
- **Michigan:** credit capped at **$12,000** in 2026 (the lesser of agreed-upon value or $12,000). [RAB 2026-11](https://www.michigan.gov/taxes/rep-legal/rab/2026-revenue-administrative-bulletins/revenue-administrative-bulletin-2026-11) and MCL 205.51.
- **Oklahoma:** from July 1, 2026, **3.25% excise tax is on actual sales price before trade-in** ([Service Oklahoma bulletin](https://content.govdelivery.com/accounts/OKSERVICE/bulletins/41cd9ff), 68 O.S. § 2104); **1.25% sales tax remains on the difference** (68 O.S. § 1355(2)).
- **Ohio:** credit on **new** vehicles only.
- **Rhode Island:** credit for passenger vehicles, motorcycles, and motor homes; the quote applies it unless the vehicle type is Truck.
- **Kentucky:** full credit, but used vehicles have an unmodeled 50% book-value floor; enter an override if it applies.

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
- Any other recognized US ZIP: the state's motor-vehicle tax rate when one is on file, otherwise the combined local general sales rate for that ZIP (or the state base rate), **plus Virginia's 0.10% local business tax**, and **$753.50** registration. The breakdown shows the split, for example **Tax (MD 6.60%: MD 6.50% + VA business 0.10%)**.
- In states that add county or city tax to a vehicle purchase (for example New York), the out-of-state portion is the combined state + local rate for that ZIP when one is on file (NYC **8.875%**, quoted as **8.975%** with the VA business tax). If no ZIP-level rate is on file, the label includes **state rate only; local tax may apply** rather than a silent fallback.
- South Carolina's **$500** cap applies only to the 5% infrastructure maintenance fee, after any trade-in credit. The 0.10% VA business tax is added on the full Total Selling Price, uncapped.
- A tax percent typed in by hand replaces the **total** and is not increased by the 0.10%. It is applied to the same taxable base the state's trade-in rule would use (for Oklahoma's split rate, the override is applied to the full TSP).
- **Trade-in tax credit.** Most states tax only the price minus the trade-in value when the trade is part of the dealer deal. The quote uses the trade **value**, not equity. The 0.10% VA business tax stays on the full TSP. See `scripts/trade-credit.mjs` for the per-state flag and official source.
- Invalid input is treated like a blank ZIP (Virginia defaults). The tax percent can be typed in by hand. Typing a ZIP clears any manual tax override and fills the looked-up rate immediately.

The lookup table is bundled as `data/tax-rates.json` (a 3-digit ZIP-prefix-to-state map, state base rates, ZIP-level combined rates, and a motor-vehicle rate table) so the GitHub Pages site needs no API keys.

**Motor-vehicle rates (as of November 2026).** Many states tax a vehicle purchase differently from general retail sales. Where a distinct titling, excise, highway-use, or document-fee rate applies, the tool uses that rate and ignores ZIP-level general sales-tax overrides. Rules that can be applied as a single percentage (or a simple cap) are modeled; the rest are flagged in the data and described below so a customer can type the rate by hand.

| State | Rate used | Notes, including caps or fees not fully modeled |
| --- | --- | --- |
| Alabama | 2% state + local | State vehicle rate is 2% (general is 4%); local rates still apply. Estimated as the combined general rate minus 2 points when a ZIP row exists. |
| Hawaii | 4.50% | 4% GET plus a 0.5% county surcharge in all four counties. Dealers may pass on up to 4.712%. |
| Connecticut | 6.35% | A 7.75% rate may apply over $50,000; not modeled. |
| Delaware | 5.25% | DMV document fee (no sales tax), effective October 1, 2025. |
| District of Columbia | 6.00% estimate | Excise tax is 1%–11% by unladen weight and city MPG (EVs 1%–3%). Not modeled; enter the rate for the vehicle. |
| Florida | 6.00% state | County discretionary surtax applies only to the first $5,000 and is not included (at most about $75). |
| Georgia | 7.00% | Title Ad Valorem Tax (TAVT) in place of sales tax. |
| Indiana | 7.00% | Statewide; no local sales tax on vehicles. |
| Iowa | 5.00% | Fee for new registration; sales tax does not apply. |
| Kentucky | 6.00% | Motor vehicle usage tax; statewide. |
| Louisiana | 5% state + local | State rate is **5%** as of January 1, 2025 (was 4.45%). Local parish and city taxes also apply. If no ZIP row is on file, the quote uses 5% and says local tax may apply. |
| Maryland | 6.50% + 0.10% VA business | Titling excise tax (general sales tax is 6%). Quoted as **6.60%**. A non-leased dealer trade-in reduces the 6.50% base. |
| Minnesota | 6.875% | Motor vehicle sales tax; local sales tax does not apply. A few cities have a separate local vehicle excise tax that is not included. |
| Mississippi | 5.00% | Motor vehicles and light trucks 10,000 lbs or less (general rate is 7%). Heavier-truck rates are not modeled. |
| New York | 4% state + local by ZIP, + 0.10% VA business | Combined rate of the owner's resident jurisdiction (Pub 718), plus VA business tax. NYC is **8.875%** (4% + 4.875%), quoted as **8.975%**. An upstate example is Saratoga Springs **7%**, quoted as **7.10%**. A trade-in reduces the 8.875% (or other combined) base. ZIP-to-county is an estimate; official guidance is to look up the address, not the ZIP. |
| North Carolina | 3.00% | Highway use tax. A $2,000 cap applies only to Class A/B commercial vehicles and RVs, not typical cars, SUVs, or light trucks. |
| North Dakota | 5.00% | Motor vehicle excise tax. |
| New Mexico | 4.00% | Motor vehicle excise tax (not gross receipts tax). |
| Oklahoma | 4.50% | 3.25% excise + 1.25% sales tax; no local. |
| Pennsylvania | 6% state + local in two counties | **8%** in Philadelphia (6% + 2%) and **7%** in Allegheny County (6% + 1%); 6% elsewhere. |
| South Carolina | 5.00%, **capped at $500**, + 0.10% VA business uncapped | Infrastructure maintenance fee in place of sales tax. The $500 cap applies only to the SC 5% portion after any trade-in; the 0.10% VA business tax is added on the full TSP. |
| South Dakota | 4.00% | Motor vehicle excise tax (general sales tax is 4.2%). |
| Tennessee | 7.00% state (estimate) | Local option tax applies only to the first $1,600, plus a 2.75% state single-article tax from $1,600.01 to $3,200. Those extras are not included (typically under $100). The tool no longer uses the full general combined ZIP rate, which would overstate tax on a vehicle. |
| Texas | 6.25% | Motor vehicle sales tax; no local sales tax on vehicles. |
| Utah | 4.85% state + local | Official state rate is **4.85%** (the previous 6.10% figure was a combined floor, not the state rate). Local option taxes also apply; some special resort taxes do not. |
| Vermont | 6.00% | Purchase and use tax. A $2,486 cap on heavy trucks is not applied to typical cars or light trucks. |
| West Virginia | 6.00% | Statewide titling sales tax. A flat $30 fee when the net price is under $500 is not modeled. This tool does not apply a trade-in tax credit. |

Out-of-state tax and registration remain estimates; some states use a different taxable base than the Total Selling Price, and unmodeled local rules or floors may apply.

**Sources and as-of dates**

- **Motor-vehicle rates:** Official state DMV and department-of-revenue pages and statutes (Maryland Transportation Article § 13-809; North Carolina G.S. 105-187.3; South Carolina Code § 56-3-627 / SCDMV infrastructure maintenance fee; Georgia DOR TAVT; DC DMV excise tax schedule effective February 17, 2025; Delaware DMV document fee effective October 1, 2025; Louisiana Department of Revenue 5% state rate effective January 1, 2025; Hawaii GET plus county surcharge; Tennessee auto dealership / single-article manuals; and the others listed above), corroborated by the [Pennsylvania DOR Sales and Use Tax Credit Chart (REV-227)](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/sut/documents/rev-227.pdf), updated **September 12, 2026**, and Florida DOR TIP 26A01-01 / TIP 25A01-01 state vehicle-rate charts. Vehicle-rate table as of **November 2026**.
- **New York local rates:** [Publication 718](https://www.tax.ny.gov/pdf/publications/sales/pub718.pdf) (2/25), effective **March 1, 2025** (still the current edition as of November 2026), combined state+local rates by jurisdiction. ZIP-to-county from the [Census 2020 ZCTA-to-county relationship](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/) (largest land-area overlap). Yonkers ZIPs 10701–10705 and 10710 use the Yonkers 8.875% city rate. NYS official guidance is to look up the address, not the ZIP; these ZIP rates are estimates.
- **Pennsylvania local rates:** Pennsylvania DOR motor vehicle sales tax: 6% statewide, plus 2% for vehicles registered in Philadelphia and 1% in Allegheny County, mapped by the same Census ZCTA-to-county file (`data/ny-pa-local-zips.json`).
- **State base rates (general sales tax, used when no vehicle-specific rate is on file):** [ReceiptEdit US State Sales Tax Dataset 2026.1](https://github.com/receiptedit/us-sales-tax-2026) (MIT), last updated **June 17, 2026**, with two corrections: Louisiana **5.00%** (effective January 1, 2025) and Utah **4.85%** (official state rate; 6.10% was a combined floor).
- **ZIP-level combined general rates:** [DeepCalc US sales-tax ZIP table](https://deepcalc.com/data/us-sales-tax/zip), dominant combined rate, primarily **2026 Q3** (Ohio 2026 Q1, Iowa 2025 Q3, Nevada 2025 Q4). Used only in states that tax vehicles at the general combined rate (for example Ohio and Washington). These are estimates, not street-level compliance rates. States such as California, Arizona, Colorado, Illinois, and Louisiana that add local vehicle tax but are not in that ZIP file fall back to the state rate with an explicit "local tax may apply" label.
- **ZIP-to-state prefixes:** USPS ZIP Code prefixes via [alecperkins/zip-state](https://github.com/alecperkins/zip-state) (CC0). Prefixes 202–205 are mapped to DC (USPS unique/government ZIPs).

To rebuild `data/tax-rates.json` from those sources:

```sh
node scripts/build-tax-data.mjs
```

That script downloads the prefix list, the ReceiptEdit state file, and the DeepCalc ZIP table, then merges the motor-vehicle rates from `scripts/vehicle-tax-rates.mjs`, applies the Louisiana and Utah base-rate corrections, and merges the New York and Pennsylvania local ZIP tables from `data/ny-pa-local-zips.json`. Re-run it when a new quarter's general rates are published, or edit `scripts/vehicle-tax-rates.mjs` when a state changes its vehicle rate, then run `node --test` and commit the updated `data/tax-rates.json`.

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
scripts/vehicle-tax-rates.mjs  motor-vehicle titling/excise rates, local-tax flags, and unmodeled caps or fees
scripts/lib/xlsx.mjs    tiny dependency-free .xlsx reader
data/inventory.json     current inventory (from the Nov 19, 2026 sample report)
data/tax-rates.json     bundled ZIP-prefix, state, ZIP, and motor-vehicle tax table
data/ny-pa-local-zips.json  NY Pub 718 and PA local combined rates by ZIP
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
