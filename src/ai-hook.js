// AI hooks for the payment-goal finder and the guided chat.
//
// Phase 1: both functions are no-ops. rankSuggestions returns the
// rule-based matches unchanged; chatTurn returns null so the scripted
// flow in src/chat.js handles every turn.
//
// TODO (AI phase): call a Supabase Edge Function that holds the AI key
// server-side (never in this repo). The AI may re-rank or draft a reply;
// every payment shown still comes from src/quote.js / findMatches().

/**
 * @param {Array<{vehicle, quote, gap}>} matches
 * @param {object} goal
 * @returns {Promise<Array<{vehicle, quote, gap, reason?: string}>>}
 */
export async function rankSuggestions(matches, goal) { // eslint-disable-line no-unused-vars
  return matches;
}

/**
 * Optional chat backend. Phase 1 returns null so the scripted guided
 * flow handles the turn.
 *
 * TODO (AI phase): POST {SUPABASE_URL}/functions/v1/chat
 *   body: { messages, answers, step }
 * Return { text, chips?, input?, cards? } to replace the scripted
 * prompt, or null to use src/chat.js. If you include cards, payments
 * on those cards must still come from findMatches() / buildQuote().
 *
 * @param {{ state: object, inventory: object[], messages: object[], scripted: object }} context
 * @returns {Promise<object|null>}
 */
export async function chatTurn(context) { // eslint-disable-line no-unused-vars
  return null;
}
