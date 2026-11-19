// Motor-vehicle trade-in tax credit rules, verified against official 2026 sources.
// rule:
//   full      — state/local vehicle tax is on max(0, TSP − trade value)
//   none      — tax is on the full TSP (no trade credit)
//   n/a       — no statewide vehicle sales/excise tax to reduce
//   capped    — credit limited to `cap` dollars (Michigan 2026: $12,000)
//   split     — part of the rate (noCreditPacked) is on the full TSP; creditPacked is on the reduced amount
//   new-only  — full credit on new vehicles only (Ohio)
//   not-truck — full credit except when the purchased vehicle is a truck (Rhode Island)
// Trade VALUE, not equity, reduces the taxable base. Payoff does not change tax.
// Virginia's 0.10% business tax is always on the full TSP when it applies.

export const TRADE_CREDIT_AS_OF = '2026-11';

/** @type {Record<string, { rule: string, cap?: number, noCreditPacked?: number, creditPacked?: number, note?: string, source: string }>} */
export const TRADE_CREDIT = {
  AL: { rule: 'full', source: 'https://www.revenue.alabama.gov/ (motor vehicle sales tax on the net difference when a vehicle is taken in trade). Also Michigan Treasury Form 485 (Rev. 1-26) Sales Tax Table: 100% trade-in allowed.' },
  AK: { rule: 'n/a', note: 'No statewide vehicle sales tax. If a local ZIP rate is on file, the quote treats that local tax as a full trade credit; local rules may vary.', source: 'Alaska has no state sales tax. Michigan Form 485 lists Alaska as an exempt state with no sales tax on vehicles.' },
  AZ: { rule: 'full', source: 'https://azdor.gov/ — tax is calculated on the price after the trade-in. Michigan Form 485: 100% trade-in allowed.' },
  AR: { rule: 'full', source: 'https://www.dfa.arkansas.gov/ — trade-in of a motor vehicle, trailer, or semitrailer reduces the taxable price.' },
  CA: { rule: 'none', source: 'https://cdtfa.ca.gov/industry/vehicles-vessels-aircraft/vehicles.htm and CDTFA Publication 34: a trade-in is a form of payment and does not reduce the taxable selling price. Michigan Form 485: California NO.' },
  CO: { rule: 'full', source: 'https://tax.colorado.gov/ — trade-in of a vehicle subject to licensing reduces the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  CT: { rule: 'full', source: 'https://portal.ct.gov/dmv — full trade-in credit on dealer purchases. Michigan Form 485: 100% trade-in allowed.' },
  DC: { rule: 'none', note: 'DC excise tax is computed on NADA fair market value, not the negotiated price, so a trade-in allowance does not reduce the tax.', source: 'https://dmv.dc.gov/book/dmv-fees/dmv-fees-0 and DC DMV title/excise guidance: used-vehicle excise is based on NADA fair market value.' },
  DE: { rule: 'full', source: 'https://dmv.de.gov/VehicleServices/titles/index.shtml Delaware law allows the value of one traded-in motor vehicle or trailer to be deducted from the purchase price for the document fee.' },
  FL: { rule: 'full', source: 'https://floridarevenue.com/ — trade-in reduces the taxable sales price. Michigan Form 485: 100% trade-in allowed.' },
  GA: { rule: 'full', note: 'TAVT trade-in reduction applies to dealer sales; casual sales are not modeled (this tool is a dealer quote).', source: 'https://dor.georgia.gov/ — the trade-in reduces the TAVT taxable base when the vehicle is purchased from a dealer.' },
  HI: { rule: 'none', note: 'A Hawaii use-tax trade-in deduction (TIR 93-3) applies only when the trade-in is turned over to a local Hawaii dealer, which is not the case on a Virginia dealer sale.', source: 'Michigan Treasury Form 485 (Rev. 1-26) Sales Tax Table: Hawaii NO. Hawaii TIR 93-3 allows a trade-in subtraction from landed value only if the trade-in is turned over to a local automobile dealer.' },
  ID: { rule: 'full', source: 'https://tax.idaho.gov/ — a trade-in placed into resale inventory at the time of sale reduces the sales price. Michigan Form 485: 100% trade-in allowed.' },
  IL: { rule: 'full', note: 'A $10,000 cap applied only to 2020–2021 sales and was removed effective January 1, 2022.', source: 'https://tax.illinois.gov/ — qualified trade-ins reduce the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  IN: { rule: 'full', source: 'https://www.in.gov/ — like-kind motor vehicle trade-ins titled in the customer’s name reduce the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  IA: { rule: 'full', source: 'Iowa fee for new registration is computed on the price reduced by a qualifying trade-in. Michigan Form 485: 100% trade-in allowed.' },
  KS: { rule: 'full', source: 'https://www.ksrevenue.gov/ — a trade-in that becomes part of the dealer’s resale inventory reduces the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  KY: { rule: 'full', note: 'On used vehicles, taxable price cannot fall below 50% of the difference between the two vehicles’ book trade-in values. That floor is not modeled; enter a tax override if it applies.', source: 'https://revenue.ky.gov/Property/Motor-Vehicles/Pages/Motor-Vehicle-Usage-Tax.aspx — a qualifying trade-in reduces the taxable retail price. Michigan Form 485: Kentucky YES.' },
  LA: { rule: 'full', source: 'https://revenue.louisiana.gov/ — tax is calculated on the price after the trade-in. Michigan Form 485: 100% trade-in allowed.' },
  ME: { rule: 'full', source: 'https://www.maine.gov/ — like-kind motor vehicle trade-ins reduce the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  MD: { rule: 'full', note: 'The trade-in must be a non-leased vehicle. Down payments and manufacturer rebates do not reduce the taxable price.', source: 'MDOT MVA, Taxable Price bulletin (April 23, 2026), https://mva.maryland.gov/your-mva-guide/businesses/bulletins-businesses/taxable-price — total purchase price is the retail value less an allowance for trade-in of a non-leased vehicle.' },
  MA: { rule: 'full', source: 'https://www.mass.gov/ — dealer sales in the regular course of business get a trade-in reduction. Michigan Form 485: 100% trade-in allowed.' },
  MI: { rule: 'capped', cap: 12000, note: '2026 motor-vehicle cap is $12,000 (the lesser of agreed-upon value or $12,000). The cap rises $1,000 a year through 2028 and is removed in 2029. Recreational-vehicle trades are uncapped and are not modeled separately.', source: 'Michigan RAB 2026-11 and MCL 205.51(1)(d); Michigan Treasury Form 485 (Rev. 1-26): Motor Vehicles $12,000 or agreed-upon value, whichever is less, for calendar year 2026. https://www.michigan.gov/taxes/rep-legal/rab/2026-revenue-administrative-bulletins/revenue-administrative-bulletin-2026-11' },
  MN: { rule: 'full', source: 'https://www.revenue.state.mn.us/ — a motor vehicle taken in trade reduces the taxable price. Michigan Form 485: 100% trade-in allowed (6.875% vehicle rate).' },
  MS: { rule: 'full', source: 'https://www.dor.ms.gov/ — tax is calculated on the price after the trade-in.' },
  MO: { rule: 'full', source: 'https://dor.mo.gov/ — tax is calculated on the price after the trade-in. Michigan Form 485: 100% trade-in allowed.' },
  MT: { rule: 'n/a', note: 'Montana has no statewide sales or vehicle excise tax, so a trade-in does not change tax.', source: 'https://mtrevenue.gov/ — no statewide general sales tax. Michigan Form 485 lists Montana as an exempt state.' },
  NE: { rule: 'full', source: 'https://revenue.nebraska.gov/ — an allowance for another motor vehicle taken in trade reduces the taxable price.' },
  NV: { rule: 'full', source: 'https://tax.nv.gov/ — a qualifying trade-in reduces the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  NH: { rule: 'n/a', note: 'New Hampshire has no general sales tax on vehicle purchases.', source: 'Michigan Form 485 lists New Hampshire as an exempt state with no sales tax on vehicles.' },
  NJ: { rule: 'full', source: 'https://www.nj.gov/ — tax is calculated on the price after the trade-in. Michigan Form 485: 100% trade-in allowed.' },
  NM: { rule: 'full', source: 'https://www.tax.newmexico.gov/ — motor vehicle excise tax is calculated on the price after the trade-in.' },
  NY: { rule: 'full', source: 'https://www.tax.ny.gov/ — sales tax on a motor vehicle is computed on the purchase price reduced by the trade-in allowance. Michigan Form 485: 100% trade-in allowed.' },
  NC: { rule: 'full', source: 'N.C.G.S. Chapter 105, Article 5A, and https://www.ncdot.gov/dmv/title-registration/taxes/Pages/default.aspx — highway use tax is on the sales price minus the dealer’s trade-in allowance.' },
  ND: { rule: 'full', source: 'https://www.tax.nd.gov/ — a trade-in reduces the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  OH: { rule: 'new-only', note: 'Ohio allows the trade-in deduction on new-vehicle purchases from new-vehicle dealers only; used-vehicle sales are taxed on the full price.', source: 'Ohio Department of Taxation motor-vehicle sales tax guidance (new-vehicle purchases only). Michigan Form 485: YES — new motor vehicle purchases only.' },
  OK: { rule: 'split', noCreditPacked: 3250, creditPacked: 1250, note: 'From July 1, 2026, the 3.25% motor vehicle excise tax is on actual sales price before trade-in; the 1.25% sales tax is still on the difference.', source: 'Excise: Service Oklahoma bulletin “Excise Tax Change to Take Effect” (June 30, 2026) and 68 O.S. § 2104 as amended by Laws 2025, c. 252, effective July 1, 2026 — actual sales price is before any trade-in credit. Sales: 68 O.S. § 1355(2) — if the sale includes a trade-in, gross receipts for the 1.25% sales tax are the difference between the trade-in value and the actual sales price. https://content.govdelivery.com/accounts/OKSERVICE/bulletins/41cd9ff' },
  OR: { rule: 'n/a', note: 'Oregon has no statewide general sales tax on vehicle purchases.', source: 'Michigan Form 485 lists Oregon as an exempt state with no sales tax on vehicles.' },
  PA: { rule: 'full', source: 'https://www.pa.gov/ and Pennsylvania DOR motor vehicle sales tax guidance — tax is calculated on the price after the trade-in. Michigan Form 485: 100% trade-in allowed.' },
  RI: { rule: 'not-truck', note: 'Rhode Island allows the deduction for passenger vehicles, motorcycles, and motor homes; a truck given in trade or purchased may not qualify. This quote applies the credit unless the vehicle type is Truck.', source: 'https://dmv.ri.gov/ — trade-in deduction for passenger cars, motorcycles, and motor homes. Michigan Form 485: YES — passenger cars only.' },
  SC: { rule: 'full', note: 'The $500 infrastructure maintenance fee cap applies to the SC 5% portion after the trade-in is subtracted. The 0.10% VA business tax is still added on the full TSP, uncapped.', source: 'S.C. Code § 12-36-90 (gross proceeds exclude the value of secondhand property taken in trade) and § 56-3-627 (infrastructure maintenance fee).' },
  SD: { rule: 'full', source: 'https://dor.sd.gov/ — a qualifying vehicle trade-in reduces the taxable price (manufactured homes on initial licensing are an exception, not modeled).' },
  TN: { rule: 'full', source: 'https://www.tn.gov/ — a like-kind trade-in identified on the invoice reduces the taxable price, not above the sales price of the purchased vehicle. Michigan Form 485: 100% trade-in allowed.' },
  TX: { rule: 'full', source: 'https://comptroller.texas.gov/taxes/publications/96-254/trade-ins.php — the purchaser can deduct the value of a vehicle traded in as part of the same sales transaction. Michigan Form 485: 100% trade-in allowed.' },
  UT: { rule: 'full', source: 'Utah Tax Commission — the trade-in must be part of a single two-party transaction. Michigan Form 485: 100% trade-in allowed.' },
  VT: { rule: 'full', source: 'https://dmv.vermont.gov/ — tax is calculated on the price after the trade-in. Michigan Form 485: 100% trade-in allowed.' },
  VA: { rule: 'none', source: 'Code of Virginia § 58.1-2401 (sale price is the total price paid “without any allowance or deduction for trade-ins”) and https://www.dmv.virginia.gov/vehicles/taxes-fees/sut — gross sales price does not include credit for trade-ins. Michigan Form 485: Virginia NO.' },
  WA: { rule: 'full', source: 'https://dor.wa.gov/ — a like-kind motor vehicle trade-in reduces the taxable price. Michigan Form 485: 100% trade-in allowed.' },
  WV: { rule: 'full', note: 'West Virginia requires the trade-in to already be titled in West Virginia in the applicant’s name. That titling condition is not checked in this estimate.', source: 'https://transportation.wv.gov/dmv/ — a qualifying trade-in reduces the taxable price.' },
  WI: { rule: 'full', source: 'https://www.revenue.wi.gov/ — tax is calculated on the price after the trade-in. Michigan Form 485: 100% trade-in allowed.' },
  WY: { rule: 'full', source: 'The trade-in and the purchase must happen in one transaction. Michigan Form 485: 100% trade-in allowed.' },
};

export function applyTradeCredit(table) {
  table.tradeCredit = TRADE_CREDIT;
  table.source = table.source || {};
  table.source.tradeCredit = `Official 2026 state DMV/DOR/statute sources and Michigan Treasury Form 485 (Rev. 1-26) Sales Tax Table, as of ${TRADE_CREDIT_AS_OF}.`;
  return table;
}
