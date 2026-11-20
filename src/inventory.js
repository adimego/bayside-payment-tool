// Inventory helpers: website links, similar vehicles, payment-goal finder.
import { buildQuote, maxVautoPriceForPayment } from './quote.js?v=d95aa26';
import { cleanPhotoUrl } from './vauto-parse.js?v=d95aa26';

export const SITE = 'https://www.baysidecdjrva.com';

/**
 * Link to the vehicle on baysidecdjrva.com by stock number.
 * Dealer.com detail URLs end in a hash we can't derive from the feed, but the
 * inventory search accepts a stock number and returns that one vehicle
 * (checked Nov 19, 2026: ?search=VR623278 -> totalCount 1, the 2027 Charger).
 */
export function websiteUrl(stock) {
  return `${SITE}/all-inventory/index.htm?search=${encodeURIComponent(stock)}`;
}

/**
 * Similar vehicles: same type, priced within +/- band (default 15%) of the
 * vehicle, same make ranked first, then same model, then closest price.
 */
export function similarVehicles(vehicle, inventory, { band = 0.15, limit = 6 } = {}) {
  if (!vehicle || !vehicle.price) {
    // No price: fall back to same type and model.
    return inventory
      .filter((v) => v.stock !== vehicle?.stock && v.price && v.type === vehicle?.type && v.model === vehicle?.model)
      .slice(0, limit);
  }
  const lo = vehicle.price * (1 - band);
  const hi = vehicle.price * (1 + band);
  return inventory
    .filter((v) => v.stock !== vehicle.stock && v.price && v.type === vehicle.type && v.price >= lo && v.price <= hi)
    .map((v) => ({
      v,
      score: (v.make === vehicle.make ? 0 : 2) + (v.model === vehicle.model ? 0 : 1),
      gap: Math.abs(v.price - vehicle.price),
    }))
    .sort((a, b) => a.score - b.score || a.gap - b.gap)
    .slice(0, limit)
    .map((x) => x.v);
}

/**
 * Payment-goal finder (rule-based). Works the quote backward to a max vAuto
 * price, keeps vehicles of the chosen type at or under it, and sorts by
 * closest fit (smallest gap under the goal first).
 *
 * @param {object[]} inventory
 * @param {object} goal {payment, type, down, tradeValue, tradePayoff, tier, term, military, condition?}
 * @returns {{maxPrice:number, matches:Array<{vehicle, quote, gap}>}}
 */
export function findByPaymentGoal(inventory, goal) {
  // Display ceiling: the most a vehicle could cost and still fit, using the
  // selected term. New (or mixed "Any") inventory uses the lower new APR, so
  // the ceiling is higher; a Used-only search uses used rates. Age caps are
  // applied per vehicle below, never to this optimistic ceiling.
  const ceilingCondition = goal.condition === 'Used' || goal.condition === 'U' ? 'Used' : 'New';
  const maxPrice = maxVautoPriceForPayment({ ...goal, condition: ceilingCondition, year: undefined, name: undefined, vehicle: undefined });
  const matches = inventory
    .filter((v) => v.price)
    .filter((v) => !goal.type || goal.type === 'Any' || v.type === goal.type)
    .filter((v) => !goal.condition || goal.condition === 'Any' || v.condition === goal.condition)
    .map((vehicle) => {
      const quote = buildQuote({ ...goal, vautoPrice: vehicle.price, condition: vehicle.condition, year: vehicle.year, name: vehicle.name });
      return { vehicle, quote, gap: Math.round((goal.payment - quote.payment) * 100) / 100 };
    })
    .filter((m) => m.quote.payment <= goal.payment)
    .sort((a, b) => a.gap - b.gap);
  return { maxPrice, matches };
}

export function searchInventory(inventory, { text = '', type = 'Any', condition = 'Any', sort = 'price-asc' } = {}) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const list = inventory.filter((v) => {
    if (type !== 'Any' && v.type !== type) return false;
    if (condition !== 'Any' && v.condition !== condition) return false;
    const hay = `${v.name} ${v.stock} ${v.vin} ${v.color} ${v.body}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const priceKey = (v) => v.price ?? Infinity;
  const sorters = {
    'price-asc': (a, b) => priceKey(a) - priceKey(b),
    'price-desc': (a, b) => (b.price ?? -1) - (a.price ?? -1),
    'year-desc': (a, b) => (b.year ?? 0) - (a.year ?? 0) || priceKey(a) - priceKey(b),
    'miles-asc': (a, b) => (a.odometer ?? 0) - (b.odometer ?? 0),
  };
  return list.sort(sorters[sort] ?? sorters['price-asc']);
}

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Safe photo URL for a vehicle (or saved-quote snapshot), or null. */
export function vehiclePhoto(v) {
  return cleanPhotoUrl(v?.photo);
}

/**
 * 3:2 thumbnail markup. Vehicles without a photo get a neutral placeholder
 * with the make and model so every card lines up the same way.
 */
export function vehiclePhotoHtml(v, { className = 'vthumb', eager = false } = {}) {
  const name = v?.name || [v?.year, v?.make, v?.model, v?.trim].filter(Boolean).join(' ') || 'Vehicle';
  const src = vehiclePhoto(v);
  if (src) {
    return `<div class="${className}"><img src="${escHtml(src)}" alt="${escHtml(name)}" width="134" height="90" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></div>`;
  }
  const label = [v?.make, v?.model].filter(Boolean).join(' ') || name;
  return `<div class="${className} no-photo" role="img" aria-label="${escHtml(name)}, photo coming soon"><span class="np-name">${escHtml(label)}</span><span class="np-note">Photo coming soon</span></div>`;
}
