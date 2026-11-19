// Pure helpers for saved-quote share links and customer-safe display.
// No DOM, no Supabase — these run in the browser and in Node tests.

export const SITE_URL = 'https://adimego.github.io/bayside-payment-tool';

/** Public share URL for a saved quote slug, e.g. https://…/#/q/aB3dE5fG7h */
export function sharedQuoteUrl(slug, origin = SITE_URL) {
  const base = String(origin || SITE_URL).replace(/\/$/, '');
  const clean = String(slug || '').trim();
  if (!clean) return `${base}/#/q/`;
  return `${base}/#/q/${encodeURIComponent(clean)}`;
}

/** First word of a customer name; used on the public share page. */
export function customerFirstName(fullName) {
  const t = String(fullName || '').trim();
  if (!t) return '';
  return t.split(/\s+/)[0];
}

/**
 * Pull a share slug from a hash route (#/q/slug) or a ?q= query
 * on either the search string or the hash.
 */
export function parseShareSlug(hash = '', search = '') {
  const path = String(hash || '').replace(/^#/, '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'q' && parts[1]) {
    try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
  }
  const fromSearch = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('q');
  if (fromSearch) return fromSearch;
  const hashQuery = String(hash || '').includes('?') ? String(hash).split('?')[1] : '';
  return new URLSearchParams(hashQuery).get('q') || null;
}

// Same rule as cleanPhotoUrl in vauto-parse.js (kept local so this file has no imports).
function safeSnapshotPhoto(p) {
  const s = String(p ?? '').trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^assets\/thumbs\/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/i.test(s)) return s;
  return null;
}

export function quoteVehicleSnapshot(v) {
  if (!v) return {};
  return {
    year: v.year ?? null,
    make: v.make ?? null,
    model: v.model ?? null,
    trim: v.trim ?? null,
    name: v.name ?? null,
    price: v.price ?? null,
    condition: v.condition ?? null,
    stock: v.stock ?? null,
    photo: safeSnapshotPhoto(v.photo),
  };
}

export function quoteDealSnapshot(d) {
  if (!d) return {};
  return {
    down: d.down ?? 0,
    tradeValue: d.tradeValue ?? 0,
    tradePayoff: d.tradePayoff ?? 0,
    tier: d.tier ?? 'Good',
    term: d.term ?? 72,
    military: Boolean(d.military),
    zip: d.zip || '',
    taxOverride: d.taxOverride ?? null,
  };
}

export function quoteResultsSnapshot(q) {
  if (!q) return {};
  return {
    totalSellingPrice: q.totalSellingPrice,
    tax: q.tax,
    taxRate: q.taxRate,
    taxLabel: q.taxLabel,
    taxableLabel: q.taxableLabel || '',
    registration: q.registration,
    outOfState: Boolean(q.outOfState),
    militaryRebate: q.militaryRebate || 0,
    outTheDoor: q.outTheDoor,
    down: q.down,
    tradeEquity: q.tradeEquity,
    amountFinanced: q.amountFinanced,
    payment: q.payment,
    apr: q.apr,
    term: q.term,
    tier: q.tier,
    disclaimers: q.disclaimers || [],
  };
}

export function dealParamsFromSnapshot(deal) {
  const d = quoteDealSnapshot(deal);
  const p = new URLSearchParams({
    down: String(d.down ?? 0),
    trade: String(d.tradeValue ?? 0),
    payoff: String(d.tradePayoff ?? 0),
    tier: d.tier || 'Good',
    term: String(d.term || 72),
    mil: d.military ? '1' : '0',
  });
  if (d.zip) p.set('zip', d.zip);
  if (d.taxOverride != null) p.set('tax', String(+(d.taxOverride * 100).toFixed(4)));
  return p.toString();
}

export function formatSavedDate(iso, timeZone = 'America/New_York') {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
}
