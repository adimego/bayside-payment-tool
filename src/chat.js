// Scripted guided-chat flow and vehicle matching.
// Pure functions only (no DOM, no storage APIs) so the same module runs in
// the browser and in Node tests. Payments always come from buildQuote /
// findByPaymentGoal — never reimplemented here.
//
// The UI (src/chat-ui.js) calls promptFor() and applyAnswer() for every
// turn. src/ai-hook.js#chatTurn is the seam for a later AI backend: if it
// returns a prompt, the UI uses that; otherwise it uses these scripted
// prompts. Match payments must still come from findMatches().

import { buildQuote, LINKS } from './quote.js';
import { findByPaymentGoal } from './inventory.js';
import { VEHICLE_TYPES } from './vauto-parse.js';
import { DOWN_CHIPS, normalizeDown, normalizeTier, dealSummary } from './deal.js';
import { lookupJurisdiction } from './tax.js';

export const CHAT_STORAGE_KEY = 'bayside.chat.v1';
export const PAGE_SIZE = 5;
export const DEFAULT_TERM = 72;
export const PAYMENT_CHIPS = [300, 400, 500, 600, 800, 1000];
export const BUDGET_CHIPS = [20000, 30000, 40000, 50000, 60000];
export { DOWN_CHIPS, LINKS };

export const GREETING = 'Hi! I can help you find a vehicle at Bayside Chrysler Dodge Jeep Ram and estimate a monthly payment. I\'ll ask a few questions — tap an answer or type one. These are estimates only, not a credit check or an offer of credit.';

export const DEALER_PHONE = '(540) 775-2277';
export const DEALER_TEL = 'tel:+15407752277';
export const DEALER_SITE = 'https://www.baysidecdjrva.com/';

/** All answer keys, in a stable order used when going back. */
export const ALL_STEPS = [
  'mode', 'payment', 'budget', 'condition', 'type', 'make',
  'tier', 'down', 'trade', 'tradeValue', 'tradePayoff', 'military', 'zip',
];

const money0 = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function freshState() {
  return { step: 'mode', answers: {}, history: [] };
}

/** Steps to ask, given answers so far (branches for mode, trade, military). */
export function stepsFor(answers = {}) {
  const steps = ['mode'];
  if (answers.mode === 'payment') steps.push('payment');
  else if (answers.mode === 'budget') steps.push('budget');
  steps.push('condition', 'type', 'make', 'tier', 'down', 'trade');
  if (answers.trade) steps.push('tradeValue', 'tradePayoff');
  if (answers.condition !== 'Used') steps.push('military');
  steps.push('zip', 'results');
  return steps;
}

/**
 * Next step after `fromStep` (or the first step if omitted).
 * Skips "make" when no makes exist in the filtered inventory.
 */
export function nextStep(answers, inventory, fromStep) {
  const steps = stepsFor(answers);
  let i = fromStep ? steps.indexOf(fromStep) + 1 : 0;
  if (fromStep && steps.indexOf(fromStep) < 0) i = 0;
  while (i < steps.length) {
    const s = steps[i];
    if (s === 'make' && availableMakes(inventory, answers).length === 0) {
      i += 1;
      continue;
    }
    return s;
  }
  return 'results';
}

export function availableTypes(inventory, answers = {}) {
  const cond = answers.condition;
  const list = (inventory || []).filter((v) => v.price && (!cond || cond === 'Any' || v.condition === cond));
  const present = new Set(list.map((v) => v.type).filter(Boolean));
  return VEHICLE_TYPES.filter((t) => present.has(t));
}

export function availableMakes(inventory, answers = {}) {
  const cond = answers.condition;
  const type = answers.type;
  const list = (inventory || []).filter((v) => (
    v.price
    && (!cond || cond === 'Any' || v.condition === cond)
    && (!type || type === 'Any' || v.type === type)
  ));
  return [...new Set(list.map((v) => v.make).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Typed money → whole dollars, or null if empty/invalid. */
export function parseMoney(raw, { allowZero = false } = {}) {
  const n = parseFloat(String(raw ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return allowZero ? 0 : null;
  return Math.min(Math.round(n), 10_000_000);
}

/** 5-digit ZIP, or { ok:false }. */
export function parseZip(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 5) return { ok: false };
  return { ok: true, zip: digits.slice(0, 5) };
}

/** Chat answers → the same deal object the shop and vehicle pages use. */
export function answersToDeal(answers = {}) {
  return {
    down: normalizeDown(answers.down ?? 0),
    tradeValue: answers.trade ? Math.max(0, Number(answers.tradeValue) || 0) : 0,
    tradePayoff: answers.trade ? Math.max(0, Number(answers.tradePayoff) || 0) : 0,
    tier: normalizeTier(answers.tier),
    term: DEFAULT_TERM,
    military: answers.condition === 'Used' ? false : Boolean(answers.military),
    zip: answers.zip || '',
    taxOverride: null,
  };
}

/**
 * Rank matching vehicles. Payments come from buildQuote / findByPaymentGoal.
 * @returns {{ total: number, matches: Array<{vehicle, quote, gap}>, deal: object }}
 */
export function findMatches(inventory, answers, { limit = PAGE_SIZE, offset = 0 } = {}) {
  const deal = answersToDeal(answers);
  const condition = answers.condition || 'Any';
  const type = answers.type && answers.type !== 'Any' ? answers.type : 'Any';
  const make = answers.make && answers.make !== 'Any' ? answers.make : null;

  let pool = (inventory || []).filter((v) => v.price);
  if (make) pool = pool.filter((v) => v.make === make);

  let ranked;
  if (answers.mode === 'payment' && Number(answers.payment) > 0) {
    const { matches } = findByPaymentGoal(pool, {
      ...deal,
      payment: Number(answers.payment),
      type,
      condition,
    });
    ranked = matches;
  } else {
    if (condition && condition !== 'Any') pool = pool.filter((v) => v.condition === condition);
    if (type && type !== 'Any') pool = pool.filter((v) => v.type === type);
    ranked = pool.map((vehicle) => {
      const quote = buildQuote({
        ...deal,
        vautoPrice: vehicle.price,
        condition: vehicle.condition,
        year: vehicle.year,
        name: vehicle.name,
        type: vehicle.type,
      });
      const gap = answers.mode === 'budget' && Number(answers.budget) > 0
        ? Math.round((Number(answers.budget) - quote.outTheDoor) * 100) / 100
        : null;
      return { vehicle, quote, gap };
    });
    if (answers.mode === 'budget' && Number(answers.budget) > 0) {
      ranked = ranked.filter((m) => m.quote.outTheDoor <= Number(answers.budget))
        .sort((a, b) => a.gap - b.gap);
    } else {
      ranked.sort((a, b) => a.quote.payment - b.quote.payment || a.vehicle.price - b.vehicle.price);
    }
  }

  const total = ranked.length;
  return { total, matches: ranked.slice(offset, offset + limit), deal };
}

export function resultsIntro({ total, shown, answers, more = false }) {
  const deal = answersToDeal(answers);
  const who = dealSummary(deal, lookupJurisdiction(deal.zip));
  if (total === 0) {
    return 'Nothing in stock fits those settings yet. Try a higher payment or budget, a different type, or a larger down payment. You can change an answer or start over.';
  }
  const mil = deal.military ? ' · military rebate on new vehicles' : '';
  const n = `${total} vehicle${total === 1 ? '' : 's'}`;
  if (more) return `Here ${shown === 1 ? 'is' : 'are'} ${shown} more that fit.`;
  let goal = '';
  if (answers.mode === 'payment') goal = ` a ${money0(answers.payment)}/mo goal and`;
  else if (answers.mode === 'budget') goal = ` a ${money0(answers.budget)} out-the-door budget and`;
  const slice = shown < total ? `${shown} of ${n}` : n;
  return `I found ${n} that fit${goal} ${who}${mil}. Showing ${slice}, closest first. Payments are estimates at ${DEFAULT_TERM} months; older vehicles may use a shorter term.`;
}

function chip(value, label) {
  return { value: String(value), label };
}

/** Scripted prompt for the current step (chips, optional typed input, links). */
export function promptFor(state, inventory = []) {
  const { step, answers } = state;
  switch (step) {
    case 'mode':
      return {
        id: 'mode',
        text: 'How would you like to shop today?',
        chips: [
          chip('payment', 'By monthly payment'),
          chip('budget', 'By total budget'),
          chip('browse', 'Browse a type'),
        ],
      };
    case 'payment':
      return {
        id: 'payment',
        text: 'What monthly payment would you like to stay around?',
        chips: PAYMENT_CHIPS.map((n) => chip(n, money0(n))),
        input: { kind: 'money', placeholder: 'Or type an amount', label: 'Monthly payment' },
      };
    case 'budget':
      return {
        id: 'budget',
        text: 'What\'s the most you want to spend, out the door? That includes tax, fees, and registration.',
        chips: BUDGET_CHIPS.map((n) => chip(n, money0(n))),
        input: { kind: 'money', placeholder: 'Or type an amount', label: 'Out-the-door budget' },
      };
    case 'condition':
      return {
        id: 'condition',
        text: 'Are you looking for a new vehicle, a used vehicle, or either?',
        chips: [
          chip('New', 'New'),
          chip('Used', 'Used'),
          chip('Any', 'Either'),
        ],
      };
    case 'type': {
      const types = availableTypes(inventory, answers);
      return {
        id: 'type',
        text: 'What body style are you interested in?',
        chips: [chip('Any', 'Any style'), ...types.map((t) => chip(t, t))],
      };
    }
    case 'make': {
      const makes = availableMakes(inventory, answers);
      return {
        id: 'make',
        text: 'Any particular make?',
        chips: [chip('Any', 'Any make'), ...makes.map((m) => chip(m, m))],
      };
    }
    case 'tier':
      return {
        id: 'tier',
        text: 'Which credit tier is closest to yours? This only affects the estimated payment — it is not a credit check.',
        chips: ['Poor', 'Fair', 'Good', 'Great', 'Excellent'].map((t) => chip(t, t)),
      };
    case 'down':
      return {
        id: 'down',
        text: 'How much can you put down?',
        chips: DOWN_CHIPS.map((n) => chip(n, n >= 1000 ? money0(n) : '$0')),
        input: { kind: 'money', placeholder: 'Or type an amount', label: 'Down payment', allowZero: true },
      };
    case 'trade':
      return {
        id: 'trade',
        text: 'Do you have a vehicle to trade in?',
        chips: [chip('yes', 'Yes'), chip('no', 'No')],
      };
    case 'tradeValue':
      return {
        id: 'tradeValue',
        text: 'What is your trade-in worth, roughly?',
        chips: [chip('0', 'Not sure')],
        input: { kind: 'money', placeholder: 'Estimated value', label: 'Trade-in value', allowZero: true },
        links: [{ href: LINKS.valueMyTrade, label: 'Value My Trade on our website' }],
      };
    case 'tradePayoff':
      return {
        id: 'tradePayoff',
        text: 'Is there a loan payoff on the trade?',
        chips: [chip('0', 'No payoff')],
        input: { kind: 'money', placeholder: 'Payoff amount', label: 'Trade loan payoff', allowZero: true },
      };
    case 'military':
      return {
        id: 'military',
        text: 'Are you a Military member or First Responder? A $500 rebate applies to new vehicles only, after tax.',
        chips: [chip('yes', 'Yes'), chip('no', 'No')],
      };
    case 'zip':
      return {
        id: 'zip',
        text: 'What\'s your ZIP code? I\'ll use it for tax and registration. You can skip this if you\'re in Virginia.',
        chips: [chip('skip', 'Skip — I\'m in Virginia')],
        input: { kind: 'zip', placeholder: 'e.g. 22485', label: 'ZIP code' },
      };
    case 'results':
      return { id: 'results', text: null, results: true };
    default:
      return { id: step, text: 'Let\'s start over.', chips: [chip('restart', 'Start over')] };
  }
}

/**
 * Apply an answer for the current step.
 * @returns {{ state } | { error: string }}
 */
export function applyAnswer(state, raw, inventory = []) {
  const step = state.step;
  if (step === 'results') return { error: 'Choose an option below, or start over.' };

  const parsed = parseStepAnswer(step, raw);
  if (parsed.error) return { error: parsed.error };

  const answers = { ...state.answers, [step]: parsed.value };
  if (step === 'trade' && !parsed.value) {
    answers.tradeValue = 0;
    answers.tradePayoff = 0;
  }
  if (step === 'condition' && parsed.value === 'Used') answers.military = false;
  if (step === 'mode') {
    if (parsed.value !== 'payment') delete answers.payment;
    if (parsed.value !== 'budget') delete answers.budget;
  }

  return {
    state: {
      step: nextStep(answers, inventory, step),
      answers,
      history: [...state.history, step],
    },
  };
}

export function parseStepAnswer(step, raw) {
  const v = raw == null ? '' : raw;
  switch (step) {
    case 'mode': {
      const id = String(v).toLowerCase();
      if (id === 'payment' || id === 'budget' || id === 'browse') return { value: id };
      return { error: 'Choose monthly payment, total budget, or browse a type.' };
    }
    case 'payment': {
      const n = parseMoney(v);
      if (n == null || n < 50 || n > 10000) return { error: 'Enter a monthly payment between $50 and $10,000.' };
      return { value: n };
    }
    case 'budget': {
      const n = parseMoney(v);
      if (n == null || n < 1000 || n > 10_000_000) return { error: 'Enter an out-the-door budget of at least $1,000.' };
      return { value: n };
    }
    case 'condition': {
      const c = String(v);
      if (c === 'New' || c === 'Used' || c === 'Any') return { value: c };
      const low = c.toLowerCase();
      if (low === 'either' || low === 'any' || low === 'both') return { value: 'Any' };
      if (low === 'new') return { value: 'New' };
      if (low === 'used') return { value: 'Used' };
      return { error: 'Choose New, Used, or Either.' };
    }
    case 'type': {
      const t = String(v);
      if (t === 'Any' || VEHICLE_TYPES.includes(t)) return { value: t };
      return { error: 'Choose a body style, or Any style.' };
    }
    case 'make': {
      const m = String(v).trim();
      if (!m) return { error: 'Choose a make, or Any make.' };
      return { value: m };
    }
    case 'tier': {
      const hit = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'].find((x) => x.toLowerCase() === String(v).toLowerCase());
      if (!hit) return { error: 'Choose Poor, Fair, Good, Great, or Excellent.' };
      return { value: hit };
    }
    case 'down': {
      // normalizeDown already treats blank as 0
      if (String(v).trim() === '') return { value: 0 };
      return { value: normalizeDown(v) };
    }
    case 'trade':
    case 'military': {
      const s = String(v).trim().toLowerCase();
      if (s === 'yes' || s === 'true' || s === '1') return { value: true };
      if (s === 'no' || s === 'false' || s === '0') return { value: false };
      return { error: 'Choose Yes or No.' };
    }
    case 'tradeValue':
    case 'tradePayoff': {
      if (String(v).trim() === '') return { value: 0 };
      const n = parseMoney(v, { allowZero: true });
      if (n == null) return { error: 'Enter a dollar amount, or 0.' };
      return { value: n };
    }
    case 'zip': {
      const s = String(v).trim().toLowerCase();
      if (s === '' || s === 'skip') return { value: '' };
      const z = parseZip(v);
      if (!z.ok) return { error: 'Enter a 5-digit ZIP code, or skip to use Virginia tax.' };
      return { value: z.zip };
    }
    default:
      return { error: 'Please choose one of the options.' };
  }
}

/** Label to show in the transcript for a chosen chip or typed value. */
export function answerLabel(step, raw, prompt) {
  const str = String(raw ?? '');
  const hit = (prompt?.chips || []).find((c) => c.value === str);
  if (hit) return hit.label;
  if (step === 'payment' || step === 'budget' || step === 'down' || step === 'tradeValue' || step === 'tradePayoff') {
    const n = parseMoney(raw, { allowZero: true });
    if (n != null) return money0(n);
  }
  if (step === 'zip') {
    const z = parseZip(raw);
    if (String(raw).trim().toLowerCase() === 'skip' || raw === '') return 'Skip — I\'m in Virginia';
    if (z.ok) return z.zip;
  }
  return str;
}

/** Go back one question and drop answers from that point on. */
export function goBack(state) {
  if (!state.history.length) return state;
  const step = state.history[state.history.length - 1];
  const history = state.history.slice(0, -1);
  const answers = { ...state.answers };
  const idx = ALL_STEPS.indexOf(step);
  const toClear = idx >= 0 ? ALL_STEPS.slice(idx) : [step];
  for (const s of toClear) delete answers[s];
  return { step, answers, history };
}

export function canGoBack(state) {
  return Boolean(state?.history?.length);
}

/** Persistable snapshot. Messages are opaque JSON-safe objects from the UI. */
export function serializeChat(payload) {
  const state = payload.state || freshState();
  return JSON.stringify({
    v: 1,
    step: state.step,
    answers: state.answers || {},
    history: Array.isArray(state.history) ? state.history : [],
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    offset: Number(payload.offset) || 0,
    open: Boolean(payload.open),
  });
}

export function deserializeChat(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || o.v !== 1 || typeof o.step !== 'string') return null;
    return {
      state: {
        step: o.step,
        answers: o.answers && typeof o.answers === 'object' ? o.answers : {},
        history: Array.isArray(o.history) ? o.history : [],
      },
      messages: Array.isArray(o.messages) ? o.messages : [],
      offset: Number(o.offset) || 0,
      open: Boolean(o.open),
    };
  } catch {
    return null;
  }
}
