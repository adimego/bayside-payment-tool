// Bayside payment tool UI (phase 1: static, reads data/inventory.json).
import { buildQuote, TIERS, TERMS, LINKS, DISCLAIMERS, PROCESSING_FEE, REGISTRATION, TAX_RATE, MILITARY_REBATE, isUsedVehicle, maxTermForYear, clampTerm, termCapNote } from './quote.js';
import { setTaxTable, lookupJurisdiction, zipHint, applyZipToDeal, applyTaxPercentToDeal, formatTaxInputPct } from './tax.js';
import { websiteUrl, similarVehicles, findByPaymentGoal, searchInventory, vehiclePhotoHtml } from './inventory.js';
import { VEHICLE_TYPES } from './vauto-parse.js';
import { rankSuggestions } from './ai-hook.js';
import { initStaffAuth, onStaffChange, isApprovedStaff } from './staff.js';
import { renderStaff, renderAdmin, renderSharedQuote, bindSaveQuote, updateStaffNav } from './staff-ui.js';
import { parseShareSlug } from './share.js';

const app = document.getElementById('app');
let inventory = [];

// ---------- helpers ----------
const money = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const money0 = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };

// ---------- deal settings (shared across pages, remembered on this device) ----------
const DEAL_KEY = 'bayside.deal.v1';
const DEFAULT_DEAL = { down: 0, tradeValue: 0, tradePayoff: 0, tier: 'Good', term: 72, military: false, zip: '', taxOverride: null };
function loadDeal() {
  try { return { ...DEFAULT_DEAL, ...JSON.parse(localStorage.getItem(DEAL_KEY) || '{}') }; } catch { return { ...DEFAULT_DEAL }; }
}
let deal = loadDeal();
function saveDeal() { try { localStorage.setItem(DEAL_KEY, JSON.stringify(deal)); } catch { /* private mode */ } }

function dealFromParams(params) {
  const d = { ...deal };
  if (params.has('down')) d.down = num(params.get('down'));
  if (params.has('trade')) d.tradeValue = num(params.get('trade'));
  if (params.has('payoff')) d.tradePayoff = num(params.get('payoff'));
  if (params.has('tier') && TIERS.some((t) => t.id === params.get('tier'))) d.tier = params.get('tier');
  if (params.has('term') && TERMS.includes(Number(params.get('term')))) d.term = Number(params.get('term'));
  if (params.has('mil')) d.military = params.get('mil') === '1';
  if (params.has('zip')) d.zip = params.get('zip') || '';
  if (params.has('tax')) {
    const t = parseFloat(params.get('tax'));
    d.taxOverride = Number.isFinite(t) ? t / 100 : null;
  }
  return d;
}
function dealParams(d) {
  const p = new URLSearchParams({ down: d.down, trade: d.tradeValue, payoff: d.tradePayoff, tier: d.tier, term: d.term, mil: d.military ? 1 : 0 });
  if (d.zip) p.set('zip', d.zip);
  if (d.taxOverride != null) p.set('tax', String(+(d.taxOverride * 100).toFixed(4)));
  return p.toString();
}

function jurFor(d) {
  return lookupJurisdiction(d.zip, { taxOverride: d.taxOverride });
}

function dealFormHtml(d, { idPrefix = 'd', allowMilitary = true, year = null, capTerms = false } = {}) {
  const maxTerm = capTerms ? maxTermForYear(year) : 84;
  const selected = clampTerm(d.term, capTerms ? year : null);
  const note = capTerms ? termCapNote(year) : '';
  return `
  <div class="deal-grid">
    <div><label for="${idPrefix}-down">Down payment</label><input id="${idPrefix}-down" name="down" inputmode="decimal" value="${d.down || ''}" placeholder="$0"></div>
    <div><label for="${idPrefix}-tier">Credit</label><select id="${idPrefix}-tier" name="tier">${TIERS.map((t) => `<option ${t.id === d.tier ? 'selected' : ''}>${t.id}</option>`).join('')}</select></div>
    <div><label for="${idPrefix}-trade">Trade-in value</label><input id="${idPrefix}-trade" name="tradeValue" inputmode="decimal" value="${d.tradeValue || ''}" placeholder="$0"></div>
    <div><label for="${idPrefix}-payoff">Trade loan payoff</label><input id="${idPrefix}-payoff" name="tradePayoff" inputmode="decimal" value="${d.tradePayoff || ''}" placeholder="$0"></div>
    <div><label for="${idPrefix}-zip">Customer ZIP (optional)</label><input id="${idPrefix}-zip" name="zip" inputmode="numeric" maxlength="10" value="${esc(d.zip || '')}" placeholder="e.g. 22485" autocomplete="postal-code"></div>
    <div><label for="${idPrefix}-tax">Tax rate (%)</label><input id="${idPrefix}-tax" name="taxPercent" inputmode="decimal" value="${formatTaxInputPct(jurFor(d).taxRate)}"></div>
    <div class="wide"><p class="hint zip-hint" id="${idPrefix}-zip-hint">${esc(zipHint(jurFor(d)))}</p></div>
    <div class="wide"><label>Term</label><div class="seg" role="group" aria-label="Term">${TERMS.map((t) => `<button type="button" data-term="${t}" aria-pressed="${t === selected}" ${t > maxTerm ? 'disabled' : ''}>${t} mo</button>`).join('')}</div>${note ? `<p class="hint term-note">${esc(note)}</p>` : ''}</div>
    <div class="wide" id="${idPrefix}-military-row" ${allowMilitary ? '' : 'hidden'}><label class="check"><input type="checkbox" name="military" ${d.military ? 'checked' : ''}> Military or First Responder ($${MILITARY_REBATE} rebate)</label></div>
    <div class="wide"><p class="hint">Not sure what your trade is worth? <a href="${LINKS.valueMyTrade}" target="_blank" rel="noopener">Value My Trade</a></p></div>
  </div>`;
}

function fillTaxFromZip(root, d) {
  const taxInput = root.querySelector('input[name="taxPercent"]');
  const hint = root.querySelector('.zip-hint');
  const jur = jurFor(d);
  if (taxInput && d.taxOverride == null) taxInput.value = formatTaxInputPct(jur.taxRate);
  if (hint) hint.textContent = zipHint(jur);
}

/** Fire on typing, paste, blur, and browser autofill (webkit animation hook). */
function watchField(el, handler) {
  if (!el) return;
  const fire = () => handler(el.value);
  for (const ev of ['input', 'change', 'keyup']) el.addEventListener(ev, fire);
  el.addEventListener('paste', () => setTimeout(fire, 0));
  el.addEventListener('animationstart', (e) => {
    if (e.animationName === 'bayside-autofill') fire();
  });
}

function bindDealForm(root, d, onChange, { onTerm } = {}) {
  root.querySelectorAll('input[name], select[name]').forEach((el) => {
    if (el.name === 'zip' || el.name === 'taxPercent') return;
    el.addEventListener('input', () => {
      const k = el.name;
      if (k === 'military') d.military = el.checked;
      else if (k === 'tier') d.tier = el.value;
      else d[k] = num(el.value);
      onChange();
    });
  });
  const zipInput = root.querySelector('input[name="zip"]');
  const taxInput = root.querySelector('input[name="taxPercent"]');
  watchField(zipInput, () => {
    applyZipToDeal(d, zipInput.value);
    fillTaxFromZip(root, d);
    onChange();
  });
  watchField(taxInput, () => {
    applyTaxPercentToDeal(d, taxInput.value);
    const hint = root.querySelector('.zip-hint');
    if (hint) hint.textContent = zipHint(jurFor(d));
    onChange();
  });
  root.querySelectorAll('[data-term]').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    d.term = Number(b.dataset.term);
    if (onTerm) onTerm(d.term);
    root.querySelectorAll('[data-term]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange();
  }));
}

function badges(v) {
  return `<span class="badge ${v.condition === 'Used' ? 'used' : ''}">${v.condition}</span>${v.certified ? '<span class="badge cert">Certified</span>' : ''}`;
}

function vehicleCard(v, d, extra = '') {
  const q = v.price ? buildQuote({ ...d, vautoPrice: v.price, condition: v.condition, year: v.year, name: v.name }) : null;
  const miles = v.condition === 'Used' && v.odometer ? ` · ${v.odometer.toLocaleString()} mi` : '';
  return `
  <a class="vcard" href="#/vehicle/${encodeURIComponent(v.stock)}">
    ${vehiclePhotoHtml(v)}
    <div class="vbody">
      <div class="top"><span class="title">${esc(v.name)}</span></div>
      <div class="meta">${badges(v)} ${esc(v.type ?? '')} · ${esc(v.color ?? '')}${miles} · Stock ${esc(v.stock)}</div>
      <div class="nums">
        ${q ? `<span class="price">${money0(q.totalSellingPrice)}</span><span class="pay">${money0(q.payment)}<small>/mo est.</small></span>`
            : '<span class="cfp">Call for Price</span><span></span>'}
      </div>
      ${extra}
    </div>
  </a>`;
}

// ---------- views ----------
function setTab(tab) {
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

const shopState = { text: '', type: 'Any', condition: 'Any', sort: 'price-asc' };

function renderShop() {
  setTab('shop');
  app.innerHTML = `
    <h1>In-stock vehicles</h1>
    <div class="card">
      <div class="filters">
        <div class="wide filter-search"><label for="f-text">Search</label><input id="f-text" type="search" placeholder="Model, trim, color, stock #" value="${esc(shopState.text)}"></div>
        <div><label for="f-type">Type</label><select id="f-type"><option>Any</option>${VEHICLE_TYPES.map((t) => `<option ${t === shopState.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label for="f-cond">New / used</label><select id="f-cond">${['Any', 'New', 'Used'].map((t) => `<option ${t === shopState.condition ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="wide"><label for="f-sort">Sort</label><select id="f-sort">
          ${[['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['year-desc', 'Newest year'], ['miles-asc', 'Lowest miles']].map(([v, l]) => `<option value="${v}" ${v === shopState.sort ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      </div>
      <p class="hint">Prices shown are the Total Selling Price (includes the $${PROCESSING_FEE} processing fee). Monthly estimates use your deal settings: ${esc(deal.tier)} credit, ${deal.term} months, ${money0(deal.down)} down. Older vehicles may have a shorter maximum term. Tax and registration follow the ZIP in your deal settings, if you entered one.</p>
    </div>
    <p class="count" id="count"></p>
    <div class="grid" id="list"></div>`;
  const draw = () => {
    const list = searchInventory(inventory, shopState);
    document.getElementById('count').textContent = `${list.length} vehicle${list.length === 1 ? '' : 's'}`;
    document.getElementById('list').innerHTML = list.length ? list.map((v) => vehicleCard(v, deal)).join('') : '<p class="empty">No vehicles match. Try a different search.</p>';
  };
  document.getElementById('f-text').addEventListener('input', (e) => { shopState.text = e.target.value; draw(); });
  document.getElementById('f-type').addEventListener('input', (e) => { shopState.type = e.target.value; draw(); });
  document.getElementById('f-cond').addEventListener('input', (e) => { shopState.condition = e.target.value; draw(); });
  document.getElementById('f-sort').addEventListener('input', (e) => { shopState.sort = e.target.value; draw(); });
  draw();
}

function breakdownHtml(q) {
  const eq = q.tradeEquity;
  return `
  <div class="big-pay"><div class="amt">${money(q.payment)}<span class="per">/mo</span></div>
    <div class="sub">${q.term} months at ${(Number(q.apr) || 0).toFixed(1)}% APR (${esc(q.tier || '')} credit)</div></div>
  <table class="breakdown">
    <tr><td>Total Selling Price <span class="hint">(incl. $${PROCESSING_FEE} processing fee)</span></td><td>${money(q.totalSellingPrice)}</td></tr>
    <tr class="plus"><td>${esc(q.taxLabel || ('Tax (' + (q.taxRate * 100).toFixed(2) + '%)'))}${q.taxableLabel ? `<span class="hint">${esc(q.taxableLabel)}</span>` : ''}</td><td>+${money(q.tax)}</td></tr>
    <tr class="plus"><td>Registration${q.outOfState ? ' (out of state)' : ''}</td><td>+${money(q.registration)}</td></tr>
    ${q.militaryRebate ? `<tr class="minus"><td>Military / First Responder rebate</td><td>−${money(q.militaryRebate)}</td></tr>` : ''}
    <tr class="total"><td>Out-the-door price</td><td>${money(q.outTheDoor)}</td></tr>
    ${q.down ? `<tr class="minus"><td>Down payment</td><td>−${money(q.down)}</td></tr>` : ''}
    ${eq > 0 ? `<tr class="minus"><td>Trade equity</td><td>−${money(eq)}</td></tr>` : ''}
    ${eq < 0 ? `<tr class="plus"><td>Negative trade equity</td><td>+${money(-eq)}</td></tr>` : ''}
    <tr class="total"><td>Amount financed</td><td>${money(q.amountFinanced)}</td></tr>
  </table>
  <div class="disclaimer">${DISCLAIMERS.map((t) => `<p>${esc(t)}</p>`).join('')}<p>Estimate only, not an offer of credit.</p></div>`;
}

function breakdownFromSaved(results, publicDeal = {}) {
  const q = { ...(results || {}) };
  if (q.down == null && publicDeal.down != null) q.down = Number(publicDeal.down) || 0;
  if (q.term == null && publicDeal.term != null) q.term = Number(publicDeal.term) || 0;
  if (!q.tier && publicDeal.tier) q.tier = publicDeal.tier;
  if (!q.payment && q.payment !== 0) return '<p class="empty">This saved quote is missing payment details.</p>';
  return breakdownHtml(q);
}

function renderVehicle(stock, params) {
  setTab('shop');
  const v = inventory.find((x) => x.stock === stock);
  if (!v) {
    app.innerHTML = `<a class="back" href="#/">← All vehicles</a><p class="empty">Stock # ${esc(stock)} isn't in today's inventory. It may have sold. Call <a href="tel:+15407752277">(540) 775-2277</a>.</p>`;
    return;
  }
  let preferredTerm = deal.term;
  const d = dealFromParams(params);
  d.term = clampTerm(d.term, v.year);
  const sims = similarVehicles(v, inventory);
  const cardDeal = { ...d, term: preferredTerm };
  app.innerHTML = `
    <a class="back" href="#/">← All vehicles</a>
    <div class="quote-layout">
      <div class="quote-main">
        <div class="card vhead">
          <div class="vhead-top">
            ${vehiclePhotoHtml(v, { className: 'vphoto', eager: true })}
            <div class="vhead-title">
              <h1>${esc(v.name)}</h1>
              <div class="sub">${badges(v)} ${esc(v.body ?? '')} · Stock ${esc(v.stock)}</div>
            </div>
          </div>
          <dl class="specs">
            <dt>Exterior</dt><dd>${esc(v.color ?? '—')}</dd>
            <dt>Interior</dt><dd>${esc(v.interiorColor ?? '—')}</dd>
            <dt>Mileage</dt><dd>${v.odometer != null ? v.odometer.toLocaleString() + ' mi' : '—'}</dd>
            <dt>VIN</dt><dd class="vin">${esc(v.vin ?? '—')}</dd>
            <dt>Total Selling Price</dt><dd>${v.price ? money0(v.price + PROCESSING_FEE) : '<span class="cfp">Call for Price</span>'}</dd>
          </dl>
          <p class="site-link"><a class="btn small" href="${websiteUrl(v.stock)}" target="_blank" rel="noopener">See photos and options on baysidecdjrva.com</a></p>
        </div>
        ${v.price ? `
        <div class="card" id="deal-form"><h2>Your deal</h2>${dealFormHtml(d, { allowMilitary: !isUsedVehicle(v.condition), year: v.year, capTerms: true })}</div>` : `
        <div class="card"><h2>Call for Price</h2><p>This vehicle doesn't have a listed price yet, so we can't show a payment. Call <a href="tel:+15407752277">(540) 775-2277</a> for a quote.</p>
          <div class="btns"><a class="btn primary" href="${LINKS.applyForFinancing}" target="_blank" rel="noopener">Apply for Financing</a><a class="btn" href="${LINKS.valueMyTrade}" target="_blank" rel="noopener">Value My Trade</a></div></div>`}
      </div>
      ${v.price ? `
      <aside class="card quote-summary">
        <h2>Your quote</h2>
        <div id="quote"></div>
        <div class="btns">
          <a class="btn primary" href="${LINKS.applyForFinancing}" target="_blank" rel="noopener">Apply for Financing</a>
          <a class="btn" href="${LINKS.valueMyTrade}" target="_blank" rel="noopener">Value My Trade</a>
          <button class="btn" id="share" type="button">Copy quote link</button>
        </div>
      </aside>` : ''}
    </div>
    <h2 class="similar-heading">Similar vehicles</h2>
    <div class="grid">${sims.length ? sims.map((s) => vehicleCard(s, cardDeal)).join('') : '<p class="empty">No close matches in stock right now.</p>'}</div>`;

  if (!v.price) return;
  const draw = () => {
    document.getElementById('quote').innerHTML = breakdownHtml(buildQuote({ ...d, vautoPrice: v.price, condition: v.condition, year: v.year, name: v.name }));
    deal = { ...d, term: preferredTerm }; saveDeal();
    history.replaceState(null, '', `#/vehicle/${encodeURIComponent(v.stock)}?${dealParams(d)}`);
  };
  bindDealForm(document.getElementById('deal-form'), d, draw, { onTerm: (t) => { preferredTerm = t; } });
  document.getElementById('share').addEventListener('click', async (e) => {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; }
    catch { prompt('Copy this link:', url); }
    setTimeout(() => { e.target.textContent = 'Copy quote link'; }, 2000);
  });
  draw();
  if (isApprovedStaff()) {
    const aside = document.querySelector('.quote-summary');
    bindSaveQuote(aside, {
      vehicle: v,
      deal: d,
      getResults() { return buildQuote({ ...d, vautoPrice: v.price, condition: v.condition, year: v.year, name: v.name }); },
    });
  }
}

const goalState = { payment: 600, type: 'SUV', condition: 'Any' };

function renderGoal() {
  setTab('goal');
  const d = { ...deal };
  app.innerHTML = `
    <h1>Find a vehicle by monthly payment</h1>
    <div class="quote-layout">
      <div class="card" id="goal-form">
        <div class="deal-grid">
          <div class="wide"><label for="g-pay">Monthly payment goal</label><input id="g-pay" inputmode="decimal" value="${goalState.payment}"></div>
          <div class="wide"><label>Vehicle type</label><div class="seg" role="group" aria-label="Vehicle type">${['Any', ...VEHICLE_TYPES].map((t) => `<button type="button" data-type="${t}" aria-pressed="${t === goalState.type}">${t}</button>`).join('')}</div></div>
          <div class="wide"><label for="g-cond">New / used</label><select id="g-cond">${['Any', 'New', 'Used'].map((t) => `<option ${t === goalState.condition ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>
        <hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">
        ${dealFormHtml(d, { idPrefix: 'g', allowMilitary: !isUsedVehicle(goalState.condition) })}
      </div>
      <div>
        <div class="ceiling" id="ceiling"></div>
        <p class="count" id="count"></p>
        <div class="grid" id="list" style="grid-template-columns:1fr"></div>
      </div>
    </div>`;
  let seq = 0;
  const draw = async () => {
    deal = { ...d }; saveDeal();
    const goal = { ...d, payment: goalState.payment, type: goalState.type, condition: goalState.condition };
    const { maxPrice, matches } = findByPaymentGoal(inventory, goal);
    const mySeq = ++seq;
    const ranked = await rankSuggestions(matches, goal); // AI hook (later phase); phase 1 returns matches as-is
    if (mySeq !== seq) return;
    document.getElementById('ceiling').innerHTML = maxPrice > 0
      ? `A ${money0(goalState.payment)}/mo payment fits a vehicle priced up to <strong>${money0(maxPrice + PROCESSING_FEE)}</strong><br><span style="font-size:.85rem;opacity:.85">Total Selling Price, with ${esc(d.tier)} credit over ${d.term} months. Older vehicles may be quoted at a shorter term.</span>`
      : 'Enter a monthly payment goal to see what fits.';
    document.getElementById('count').textContent = `${ranked.length} match${ranked.length === 1 ? '' : 'es'}, closest to your goal first`;
    document.getElementById('list').innerHTML = ranked.length
      ? ranked.slice(0, 30).map((m) => vehicleCard(m.vehicle, d, `<div class="fit">${money(m.gap)} under your goal${m.reason ? ' · ' + esc(m.reason) : ''}</div>`)).join('')
      : '<p class="empty">Nothing in stock fits that payment yet. Try a longer term, a bigger down payment, or a different type.</p>';
  };
  document.getElementById('g-pay').addEventListener('input', (e) => { goalState.payment = num(e.target.value); draw(); });
  document.getElementById('g-cond').addEventListener('input', (e) => {
    goalState.condition = e.target.value;
    const row = document.getElementById('g-military-row');
    if (row) row.hidden = isUsedVehicle(goalState.condition);
    draw();
  });
  document.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    goalState.type = b.dataset.type;
    document.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  }));
  bindDealForm(document.getElementById('goal-form'), d, draw);
  draw();
}

// ---------- router ----------
function route() {
  updateStaffNav();
  const shareSlug = parseShareSlug(location.hash, location.search);
  if (shareSlug && !(location.hash.replace(/^#/, '').split('?')[0].startsWith('/vehicle'))) {
    // Prefer an explicit #/q/slug or a ?q= param, but don't steal a vehicle page.
    const hashPath = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    const hashParts = hashPath.split('/').filter(Boolean);
    if (hashParts[0] === 'q' || (!hashParts[0] && shareSlug) || (location.search && new URLSearchParams(location.search).get('q'))) {
      if (hashParts[0] !== 'q' && !hashParts[0]) {
        history.replaceState(null, '', `#/q/${encodeURIComponent(shareSlug)}`);
      }
      setTab('');
      renderSharedQuote(app, shareSlug, { breakdownFromSaved });
      return;
    }
  }
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'vehicle' && parts[1]) renderVehicle(decodeURIComponent(parts[1]), params);
  else if (parts[0] === 'goal') renderGoal();
  else if (parts[0] === 'staff') { setTab('staff'); renderStaff(app, parts); }
  else if (parts[0] === 'admin') { setTab('admin'); renderAdmin(app); }
  else if (parts[0] === 'q' && parts[1]) { setTab(''); renderSharedQuote(app, decodeURIComponent(parts[1]), { breakdownFromSaved }); }
  else renderShop();
}

let lastPath = null;
window.addEventListener('hashchange', () => {
  const path = location.hash.split('?')[0];
  if (path !== lastPath) { lastPath = path; route(); window.scrollTo(0, 0); }
});

async function start() {
  await initStaffAuth();
  updateStaffNav();
  onStaffChange(() => {
    updateStaffNav();
    const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    const top = path.split('/').filter(Boolean)[0];
    if (top === 'staff' || top === 'admin') route();
    else if (top === 'vehicle' && isApprovedStaff() !== Boolean(document.querySelector('.save-quote'))) route();
  });
  try {
    const res = await fetch('data/inventory.json', { cache: 'no-cache' });
    const data = await res.json();
    inventory = data.vehicles;
    try {
      const taxRes = await fetch('data/tax-rates.json', { cache: 'no-cache' });
      setTaxTable(await taxRes.json());
    } catch (taxErr) {
      console.error(taxErr);
    }
    const when = new Date(data.generatedAt);
    document.getElementById('inv-date').textContent = `Inventory updated ${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`;
  } catch (err) {
    const top = ((location.hash.replace(/^#/, '') || '/').split('?')[0]).split('/').filter(Boolean)[0];
    if (top !== 'staff' && top !== 'admin' && top !== 'q') {
      app.innerHTML = '<p class="empty">Inventory could not be loaded. Please call (540) 775-2277.</p>';
      console.error(err);
      return;
    }
    console.error(err);
  }
  lastPath = location.hash.split('?')[0];
  route();
}
start();
