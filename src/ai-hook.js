// AI ranking hook for the payment-goal finder.
//
// Phase 1: returns the rule-based matches unchanged (closest fit first) with
// no explanation text.
//
// TODO (AI phase): call a Supabase Edge Function, e.g.
//   POST {SUPABASE_URL}/functions/v1/suggest-vehicles
//   body: { goal, candidates: matches.map(m => ({ stock, name, type, price, payment })) }
// The function holds the AI key server-side (never in this repo), re-ranks the
// candidates by fit and features, and returns [{ stock, reason }]. The AI only
// orders and explains; every payment shown still comes from src/quote.js.

/**
 * @param {Array<{vehicle, quote, gap}>} matches
 * @param {object} goal
 * @returns {Promise<Array<{vehicle, quote, gap, reason?: string}>>}
 */
export async function rankSuggestions(matches, goal) { // eslint-disable-line no-unused-vars
  return matches;
}
