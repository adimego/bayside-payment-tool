import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTaxTable, applyZipToDeal, lookupJurisdiction } from '../src/tax.js';
import { buildQuote } from '../src/quote.js';
import {
  freshState, stepsFor, nextStep, applyAnswer, goBack, canGoBack,
  promptFor, parseMoney, parseZip, parseStepAnswer, answerLabel,
  answersToDeal, findMatches, resultsIntro, availableTypes, availableMakes,
  serializeChat, deserializeChat, PAGE_SIZE, DEFAULT_TERM, PAYMENT_CHIPS,
  BUDGET_CHIPS, ALL_STEPS,
} from '../src/chat.js';
import { DOWN_CHIPS } from '../src/deal.js';

setTaxTable(JSON.parse(readFileSync(new URL('../data/tax-rates.json', import.meta.url))));
const inventory = JSON.parse(readFileSync(new URL('../data/inventory.json', import.meta.url))).vehicles;

const priced = inventory.filter((v) => v.price);
const compass = inventory.find((v) => v.stock === 'ST508330A');

function answerAll(path, inv = inventory) {
  let state = freshState();
  for (const [step, value] of path) {
    assert.equal(state.step, step, `expected step ${step}, at ${state.step}`);
    const res = applyAnswer(state, value, inv);
    assert.ok(!res.error, res.error);
    state = res.state;
  }
  return state;
}

test('payment, budget, and browse flows ask the right questions and skip unused ones', () => {
  // Payment path, no trade, used (skips military)
  const pay = answerAll([
    ['mode', 'payment'],
    ['payment', '400'],
    ['condition', 'Used'],
    ['type', 'SUV'],
    ['make', 'Jeep'],
    ['tier', 'Excellent'],
    ['down', '5000'],
    ['trade', 'no'],
    ['zip', '22485'],
  ]);
  assert.equal(pay.step, 'results');
  assert.equal(pay.answers.payment, 400);
  assert.equal(pay.answers.military, false);
  assert.ok(!stepsFor(pay.answers).includes('budget'));
  assert.ok(!stepsFor(pay.answers).includes('military'));
  assert.ok(!stepsFor(pay.answers).includes('tradeValue'));

  // Budget path, new, with trade, military
  const bud = answerAll([
    ['mode', 'budget'],
    ['budget', '40000'],
    ['condition', 'New'],
    ['type', 'Any'],
    ['make', 'Any'],
    ['tier', 'Good'],
    ['down', '0'],
    ['trade', 'yes'],
    ['tradeValue', '8000'],
    ['tradePayoff', '2000'],
    ['military', 'yes'],
    ['zip', 'skip'],
  ]);
  assert.equal(bud.step, 'results');
  assert.equal(bud.answers.budget, 40000);
  assert.equal(bud.answers.trade, true);
  assert.equal(bud.answers.tradeValue, 8000);
  assert.equal(bud.answers.tradePayoff, 2000);
  assert.equal(bud.answers.military, true);
  assert.equal(bud.answers.zip, '');
  assert.ok(!stepsFor(bud.answers).includes('payment'));

  // Browse path skips payment and budget
  const browse = answerAll([
    ['mode', 'browse'],
    ['condition', 'Any'],
    ['type', 'Truck'],
    ['make', 'Ram'],
    ['tier', 'Fair'],
    ['down', '1000'],
    ['trade', 'no'],
    ['military', 'no'],
    ['zip', '20601'],
  ]);
  assert.equal(browse.step, 'results');
  assert.equal(browse.answers.mode, 'browse');
  assert.equal(browse.answers.zip, '20601');
  assert.ok(!('payment' in browse.answers));
  assert.ok(!('budget' in browse.answers));
});

test('going back clears later answers and restart is a fresh state', () => {
  let state = answerAll([
    ['mode', 'payment'],
    ['payment', '500'],
    ['condition', 'New'],
  ]);
  assert.equal(state.step, 'type');
  assert.ok(canGoBack(state));
  state = goBack(state);
  assert.equal(state.step, 'condition');
  assert.ok(!('condition' in state.answers));
  assert.equal(state.answers.payment, 500);
  state = goBack(state);
  state = goBack(state);
  assert.equal(state.step, 'mode');
  assert.deepEqual(state.answers, {});
  assert.equal(canGoBack(state), false);
  assert.equal(goBack(state).step, 'mode');
  const fresh = freshState();
  assert.equal(fresh.step, 'mode');
  assert.deepEqual(fresh.history, []);
});

test('invalid typed input stays on the same step with an error', () => {
  let state = applyAnswer(freshState(), 'payment', inventory).state;
  const badPay = applyAnswer(state, 'nope', inventory);
  assert.match(badPay.error, /monthly payment/);
  const tooSmall = applyAnswer(state, '10', inventory);
  assert.match(tooSmall.error, /monthly payment/);
  const ok = applyAnswer(state, '$450', inventory);
  assert.equal(ok.state.answers.payment, 450);

  state = applyAnswer(freshState(), 'budget', inventory).state;
  assert.match(applyAnswer(state, '50', inventory).error, /budget/);

  let zipState = freshState();
  for (const [s, v] of [['mode', 'browse'], ['condition', 'Used'], ['type', 'Any'], ['make', 'Any'], ['tier', 'Good'], ['down', '0'], ['trade', 'no']]) {
    zipState = applyAnswer(zipState, v, inventory).state;
  }
  assert.equal(zipState.step, 'zip');
  assert.match(applyAnswer(zipState, '12', inventory).error, /ZIP/);
  assert.equal(applyAnswer(zipState, '22485-1234', inventory).state.answers.zip, '22485');
});

test('types and makes are derived from inventory and respect earlier filters', () => {
  const types = availableTypes(inventory, {});
  assert.deepEqual(types, ['Car', 'Truck', 'SUV', 'Van']);
  const usedMakes = availableMakes(inventory, { condition: 'Used', type: 'SUV' });
  assert.ok(usedMakes.includes('Jeep'));
  assert.ok(usedMakes.every((m) => inventory.some((v) => v.price && v.condition === 'Used' && v.type === 'SUV' && v.make === m)));
  const prompt = promptFor({ step: 'type', answers: { condition: 'New' }, history: [] }, inventory);
  assert.ok(prompt.chips.some((c) => c.value === 'Any'));
  assert.ok(prompt.chips.some((c) => c.value === 'SUV'));
  const makePrompt = promptFor({ step: 'make', answers: { condition: 'Used', type: 'SUV' }, history: [] }, inventory);
  assert.ok(makePrompt.chips[0].value === 'Any');
  assert.ok(makePrompt.chips.some((c) => c.value === 'Jeep'));
});

test('findMatches payments equal buildQuote for the same vehicle and deal', () => {
  assert.ok(compass && compass.price);
  const answers = {
    mode: 'browse', condition: 'Used', type: 'SUV', make: 'Jeep',
    tier: 'Excellent', down: 5000, trade: false, zip: '20601',
  };
  const { matches, deal } = findMatches(inventory, answers, { limit: 20 });
  const row = matches.find((m) => m.vehicle.stock === 'ST508330A');
  assert.ok(row, 'Compass should be in used Jeep SUV matches');
  const direct = buildQuote({
    ...deal,
    vautoPrice: compass.price,
    condition: compass.condition,
    year: compass.year,
    name: compass.name,
  });
  assert.equal(row.quote.payment, direct.payment);
  assert.equal(row.quote.outTheDoor, direct.outTheDoor);
  assert.equal(deal.term, DEFAULT_TERM);
  assert.equal(deal.tier, 'Excellent');
  assert.equal(deal.down, 5000);
  assert.equal(deal.zip, '20601');
});

test('payment-goal matches stay at or under the goal and match findByPaymentGoal order', () => {
  const answers = {
    mode: 'payment', payment: 400, condition: 'Used', type: 'SUV', make: 'Any',
    tier: 'Good', down: 0, trade: false, zip: '',
  };
  const { matches, total } = findMatches(inventory, answers, { limit: PAGE_SIZE });
  assert.ok(total >= matches.length);
  assert.ok(matches.length <= PAGE_SIZE);
  assert.ok(matches.length >= 1);
  for (const m of matches) {
    assert.ok(m.quote.payment <= 400, `${m.vehicle.stock} payment ${m.quote.payment} over 400`);
    assert.equal(m.vehicle.type, 'SUV');
    assert.equal(m.vehicle.condition, 'Used');
    const direct = buildQuote({
      ...answersToDeal(answers),
      vautoPrice: m.vehicle.price,
      condition: m.vehicle.condition,
      year: m.vehicle.year,
      name: m.vehicle.name,
    });
    assert.equal(m.quote.payment, direct.payment);
  }
  // Closest fit first (smallest gap under the goal)
  for (let i = 1; i < matches.length; i++) {
    assert.ok(matches[i].gap >= matches[i - 1].gap);
  }
  // See more is just an offset into the same list
  const page2 = findMatches(inventory, answers, { limit: PAGE_SIZE, offset: PAGE_SIZE });
  assert.equal(page2.total, total);
  if (total > PAGE_SIZE) {
    assert.notEqual(page2.matches[0].vehicle.stock, matches[0].vehicle.stock);
  }
});

test('budget matches are at or under the out-the-door cap, closest first', () => {
  const answers = {
    mode: 'budget', budget: 30000, condition: 'Any', type: 'Any', make: 'Any',
    tier: 'Good', down: 0, trade: false, zip: '',
  };
  const { matches, total } = findMatches(inventory, answers, { limit: 10 });
  assert.ok(total >= 1);
  for (const m of matches) {
    assert.ok(m.quote.outTheDoor <= 30000, `${m.vehicle.stock} OTD ${m.quote.outTheDoor}`);
  }
  for (let i = 1; i < matches.length; i++) {
    assert.ok(matches[i].gap >= matches[i - 1].gap);
  }
});

test('military rebate applies only to new vehicles in chat matches', () => {
  const base = { mode: 'browse', type: 'Any', make: 'Any', tier: 'Good', down: 0, trade: false, zip: '' };
  const withMil = answersToDeal({ ...base, condition: 'Any', military: true });
  assert.equal(withMil.military, true);
  assert.equal(answersToDeal({ ...base, condition: 'Used', military: true }).military, false);

  const newCar = priced.find((v) => v.condition === 'New');
  const usedCar = priced.find((v) => v.condition === 'Used');
  const deal = answersToDeal({ ...base, condition: 'Any', military: true });
  const qNew = buildQuote({ ...deal, vautoPrice: newCar.price, condition: newCar.condition, year: newCar.year, name: newCar.name });
  const qUsed = buildQuote({ ...deal, vautoPrice: usedCar.price, condition: usedCar.condition, year: usedCar.year, name: usedCar.name });
  assert.equal(qNew.militaryRebate, 500);
  assert.equal(qUsed.militaryRebate, 0);

  const { matches } = findMatches(inventory, { ...base, condition: 'Any', military: true }, { limit: 1000, offset: 0 });
  const n = matches.find((m) => m.vehicle.stock === newCar.stock);
  const u = matches.find((m) => m.vehicle.stock === usedCar.stock);
  assert.equal(n.quote.militaryRebate, 500);
  assert.equal(u.quote.militaryRebate, 0);
});

test('trade equity and ZIP tax change the payment the same way the vehicle page would', () => {
  const car = { vautoPrice: compass.price, condition: compass.condition, year: compass.year, name: compass.name };
  const answers = {
    mode: 'browse', condition: 'Used', type: 'SUV', make: 'Jeep',
    tier: 'Good', down: 0, trade: true, tradeValue: 5000, tradePayoff: 1000, zip: '20601',
  };
  const deal = answersToDeal(answers);
  assert.equal(deal.tradeValue, 5000);
  assert.equal(deal.tradePayoff, 1000);
  const md = { ...deal };
  applyZipToDeal(md, '20601');
  const page = buildQuote({ ...md, ...car });
  const { matches } = findMatches(inventory, answers, { limit: 20 });
  const row = matches.find((m) => m.vehicle.stock === 'ST508330A');
  assert.equal(row.quote.payment, page.payment);
  assert.ok(row.quote.outOfState);
  assert.equal(row.quote.tradeEquity, 4000);

  const va = buildQuote({ ...answersToDeal({ ...answers, zip: '' }), ...car });
  assert.ok(page.payment !== va.payment);
});

test('parse helpers, prompt chips, labels, and session snapshot', () => {
  assert.equal(parseMoney('$2,500'), 2500);
  assert.equal(parseMoney('0', { allowZero: true }), 0);
  assert.equal(parseMoney('abc'), null);
  assert.deepEqual(parseZip('22485-6789'), { ok: true, zip: '22485' });
  assert.equal(parseZip('123').ok, false);
  assert.equal(parseStepAnswer('down', '').value, 0);
  assert.equal(parseStepAnswer('tier', 'great').value, 'Great');
  assert.ok(PAYMENT_CHIPS.includes(400) && BUDGET_CHIPS.includes(40000));
  assert.deepEqual(DOWN_CHIPS, [0, 1000, 2500, 5000]);
  assert.ok(ALL_STEPS.includes('military'));

  const p = promptFor({ step: 'payment', answers: { mode: 'payment' }, history: ['mode'] });
  assert.equal(answerLabel('payment', '400', p), '$400');
  assert.equal(answerLabel('zip', 'skip', promptFor({ step: 'zip', answers: {}, history: [] })), 'Skip — I\'m in Virginia');

  const state = applyAnswer(freshState(), 'browse', inventory).state;
  const raw = serializeChat({ state, messages: [{ role: 'bot', text: 'Hi' }], offset: 0, open: true });
  const back = deserializeChat(raw);
  assert.equal(back.state.step, 'condition');
  assert.equal(back.state.answers.mode, 'browse');
  assert.equal(back.messages[0].text, 'Hi');
  assert.equal(back.open, true);
  assert.equal(deserializeChat('not-json'), null);
  assert.equal(deserializeChat('{}'), null);

  const intro = resultsIntro({ total: 0, shown: 0, answers: { mode: 'payment', payment: 200, tier: 'Good' } });
  assert.match(intro, /Nothing in stock/);
  const intro2 = resultsIntro({ total: 4, shown: 4, answers: { mode: 'payment', payment: 400, tier: 'Good', down: 0 } });
  assert.match(intro2, /\$400\/mo/);
  assert.match(intro2, /4 vehicles/);
});

test('make is skipped when the filtered inventory has no makes', () => {
  const tiny = [{ stock: 'X', name: '2024 Test', year: 2024, make: '', model: 'X', type: 'Car', condition: 'New', price: 20000 }];
  const answers = { mode: 'browse', condition: 'New', type: 'Car' };
  assert.deepEqual(availableMakes(tiny, answers), []);
  assert.equal(nextStep(answers, tiny, 'type'), 'tier');
});
