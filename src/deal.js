// Pure helpers for the shop page's quick deal controls (credit, down, term, ZIP).
// No DOM access so they run in Node tests too.
import { TIERS, TERMS } from './quote.js?v=4384cec';
import { formatTaxPct } from './tax.js?v=4384cec';

/** Quick-pick down payment chips on the shop page. */
export const DOWN_CHIPS = [0, 1000, 2500, 5000];

const money0 = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Typed down payment -> whole dollars, never negative or absurd. */
export function normalizeDown(raw) {
  const n = parseFloat(String(raw ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), 1_000_000);
}

export function normalizeTier(t) {
  return TIERS.some((x) => x.id === t) ? t : 'Good';
}

export function normalizeTerm(t) {
  const n = Number(t);
  return TERMS.includes(n) ? n : 72;
}

/** Short tax label for the summary row: "VA 4.25%", "MD 6.6% (6.5% + VA 0.10%)", "Tax 7% (entered)". */
export function shortTaxLabel(jur) {
  if (!jur) return 'VA 4.25%';
  if (jur.taxSource === 'override') return `Tax ${formatTaxPct(jur.taxRate)}% (entered)`;
  if (!jur.outOfState) return `VA ${formatTaxPct(jur.taxRate)}%`;
  const st = jur.state || 'Out of state';
  if (jur.vaBusinessRate > 0) {
    const base = formatTaxPct(jur.baseTaxRate ?? jur.taxRate - jur.vaBusinessRate);
    return `${st} ${base}% + VA ${formatTaxPct(jur.vaBusinessRate)}%`;
  }
  return `${st} ${formatTaxPct(jur.taxRate)}%`;
}

/** Where-the-tax-comes-from part of the summary: "ZIP 20601 (MD)" or "VA tax". */
export function zipSummary(jur) {
  if (!jur) return 'VA tax';
  let out = jur.zip && jur.status !== 'invalid' && jur.status !== 'blank' ? `ZIP ${jur.zip} (${jur.state})` : 'VA tax';
  if (jur.taxSource === 'override') out += ` · ${formatTaxPct(jur.taxRate)}% tax`;
  return out;
}

/** One-line summary, e.g. "Good credit · $0 down · 72 mo · ZIP 20601 (MD)". */
export function dealSummary(d, jur) {
  const parts = [`${normalizeTier(d?.tier)} credit`, `${money0(d?.down)} down`, `${normalizeTerm(d?.term)} mo`];
  if (Number(d?.tradeValue) > 0) parts.push(`${money0(d.tradeValue)} trade`);
  parts.push(zipSummary(jur));
  return parts.join(' · ');
}

/** Hint under the filters; reflects the live settings. */
export function shopHintText(d, jur, processingFee) {
  const reg = `$${Number(jur?.registration ?? 153.5).toFixed(2)}`;
  const tax = jur && jur.taxSource === 'override'
    ? `${formatTaxPct(jur.taxRate)}% tax (entered), ${reg} registration`
    : jur && jur.outOfState
      ? `${shortTaxLabel(jur)} tax${jur.localMayApply ? ' (state rate only; local tax may apply)' : ''}, ${reg} out-of-state registration (ZIP ${jur.zip})`
      : `VA ${formatTaxPct(jur?.taxRate ?? 0.0425)}% tax, ${reg} registration`;
  const trade = Number(d?.tradeValue) > 0 ? `, ${money0(d.tradeValue)} trade (${money0(d.tradePayoff)} payoff)` : '';
  return `Prices are the Total Selling Price (incl. $${processingFee} processing fee). `
    + `Payments use ${normalizeTier(d?.tier)} credit, ${normalizeTerm(d?.term)} months, ${money0(d?.down)} down${trade}, ${tax}. `
    + 'Older vehicles may have a shorter maximum term.';
}
