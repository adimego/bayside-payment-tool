// Inventory helpers: website links, similar vehicles, payment-goal finder.
import { buildQuote, maxVautoPriceForPayment } from './quote.js';

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
  const maxPrice = maxVautoPriceForPayment(goal);
  const matches = inventory
    .filter((v) => v.price && v.price <= maxPrice)
    .filter((v) => !goal.type || goal.type === 'Any' || v.type === goal.type)
    .filter((v) => !goal.condition || goal.condition === 'Any' || v.condition === goal.condition)
    .map((vehicle) => {
      const quote = buildQuote({ ...goal, vautoPrice: vehicle.price });
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
