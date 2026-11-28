// Guided chat window: floating button, transcript, chips, and results cards.
// All questions and matches come from src/chat.js (scripted). src/ai-hook.js
// chatTurn() is the seam for a later AI backend — if it returns a prompt,
// that prompt is shown; otherwise the scripted one is. Payments still come
// from findMatches() / buildQuote().

import {
  CHAT_STORAGE_KEY, PAGE_SIZE, GREETING, DEALER_PHONE, DEALER_TEL, DEALER_SITE,
  LINKS, freshState, promptFor, applyAnswer, goBack, canGoBack, answerLabel,
  findMatches, resultsIntro, answersToDeal, serializeChat, deserializeChat,
} from './chat.js?v=4384cec';
import { chatTurn, rankSuggestions } from './ai-hook.js?v=4384cec';
import { vehiclePhotoHtml } from './inventory.js?v=4384cec';
import { dealParamsFromSnapshot } from './share.js?v=4384cec';

const money = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const money0 = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true" width="26" height="26"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 1 0-1.4 1.4L10.6 12l-4.9 4.9a1 1 0 1 0 1.4 1.4L12 13.4l4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z"/></svg>';

function loadStored() {
  try {
    return deserializeChat(sessionStorage.getItem(CHAT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function staffRoute() {
  const top = ((location.hash.replace(/^#/, '') || '/').split('?')[0]).split('/').filter(Boolean)[0];
  return top === 'staff' || top === 'admin';
}

function greetingMessages() {
  const state = freshState();
  const prompt = promptFor(state, []);
  return [
    { role: 'bot', text: GREETING },
    { role: 'bot', text: prompt.text, step: 'mode' },
  ];
}

export function initChat({ getInventory, setDeal }) {
  if (document.getElementById('chat-root')) return;

  const stored = loadStored();
  let state = stored?.state || freshState();
  let messages = stored?.messages?.length ? stored.messages : greetingMessages();
  let offset = stored?.offset || 0;
  let open = Boolean(stored?.open);
  let lastFocus = null;
  let busy = false;

  const root = document.createElement('div');
  root.id = 'chat-root';
  root.innerHTML = `
    <button type="button" class="chat-launch" id="chat-launch" aria-controls="chat-panel" aria-expanded="false" aria-label="Open payment chat">
      ${ICON_CHAT}<span class="chat-launch-label">Chat</span>
    </button>
    <section class="chat-panel" id="chat-panel" role="dialog" aria-modal="true" aria-labelledby="chat-title" hidden>
      <header class="chat-head">
        <div class="chat-head-text">
          <h2 id="chat-title">Bayside assistant</h2>
          <p class="chat-sub">Payment estimates, not a credit check</p>
        </div>
        <div class="chat-head-actions">
          <button type="button" class="chat-icon-btn" id="chat-back" aria-label="Go back one question">Back</button>
          <button type="button" class="chat-icon-btn chat-close" id="chat-close" aria-label="Close chat">${ICON_CLOSE}</button>
        </div>
      </header>
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      <form class="chat-composer" id="chat-composer" autocomplete="off">
        <div class="chat-links" id="chat-links" hidden></div>
        <div class="chat-chips" id="chat-chips" role="group" aria-label="Suggested answers"></div>
        <p class="chat-error" id="chat-error" hidden></p>
        <div class="chat-input-row" id="chat-input-row" hidden>
          <label class="visually-hidden" for="chat-input">Your answer</label>
          <input id="chat-input" name="answer" enterkeyhint="send">
          <button type="submit" class="chat-send" id="chat-send">Send</button>
        </div>
      </form>
    </section>`;
  document.body.appendChild(root);

  const panel = root.querySelector('#chat-panel');
  const launch = root.querySelector('#chat-launch');
  const logEl = root.querySelector('#chat-log');
  const chipsEl = root.querySelector('#chat-chips');
  const inputRow = root.querySelector('#chat-input-row');
  const input = root.querySelector('#chat-input');
  const errEl = root.querySelector('#chat-error');
  const linksEl = root.querySelector('#chat-links');
  const backBtn = root.querySelector('#chat-back');
  const closeBtn = root.querySelector('#chat-close');
  const form = root.querySelector('#chat-composer');

  function persist() {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, serializeChat({ state, messages, offset, open }));
    } catch { /* private mode */ }
  }

  function setError(msg) {
    if (!msg) {
      errEl.hidden = true;
      errEl.textContent = '';
      return;
    }
    errEl.hidden = false;
    errEl.textContent = msg;
  }

  function cardHtml(m, deal) {
    const v = m.vehicle;
    const q = m.quote;
    const href = `#/vehicle/${encodeURIComponent(v.stock)}?${dealParamsFromSnapshot(deal)}`;
    const miles = v.condition === 'Used' && v.odometer ? ` · ${v.odometer.toLocaleString()} mi` : '';
    const gap = m.gap != null && m.gap >= 0 ? `<div class="fit">${money(m.gap)} under your goal</div>` : '';
    return `
      <a class="chat-card" href="${esc(href)}" data-stock="${esc(v.stock)}">
        ${vehiclePhotoHtml(v, { className: 'vthumb' })}
        <div class="vbody">
          <div class="title">${esc(v.name)}</div>
          <div class="meta">${esc(v.condition)} · ${esc(v.type ?? '')}${miles} · Stock ${esc(v.stock)}</div>
          <div class="nums"><span class="price">${money0(q.totalSellingPrice)}</span><span class="pay">${money(q.payment)}<small>/mo est.</small></span></div>
          ${gap}
        </div>
      </a>`;
  }

  function contactHtml() {
    return `<div class="chat-contact">
      <a class="btn primary" href="${DEALER_TEL}">Call ${esc(DEALER_PHONE)}</a>
      <a class="btn" href="${esc(LINKS.applyForFinancing)}" target="_blank" rel="noopener">Apply for Financing</a>
      <a class="btn" href="${esc(DEALER_SITE)}" target="_blank" rel="noopener">Visit our website</a>
    </div>`;
  }

  function messageHtml(msg) {
    if (msg.role === 'user') {
      return `<div class="chat-msg user"><p>${esc(msg.text)}</p></div>`;
    }
    const cards = msg.cards?.length
      ? `<div class="chat-cards">${msg.cards.map((c) => c.html).join('')}</div>`
      : '';
    const more = msg.actions?.length
      ? `<div class="chat-actions">${msg.actions.map((a) => `<button type="button" class="chip" data-action="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div>`
      : '';
    const contact = msg.contact ? contactHtml() : '';
    const text = msg.text ? `<p>${esc(msg.text)}</p>` : '';
    return `<div class="chat-msg bot">${text}${cards}${more}${contact}</div>`;
  }

  function renderLog() {
    logEl.innerHTML = messages.map(messageHtml).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function resultActions(total, shownOffset, shownCount) {
    const actions = [];
    if (shownOffset + shownCount < total) actions.push({ id: 'more', label: 'Show more matches' });
    actions.push({ id: 'back', label: 'Change an answer' });
    actions.push({ id: 'restart', label: 'Start over' });
    return actions;
  }

  async function matchesPayload(fromOffset, more) {
    const inv = getInventory() || [];
    const page = findMatches(inv, state.answers, { limit: PAGE_SIZE, offset: fromOffset });
    const ranked = await rankSuggestions(page.matches, { ...page.deal, payment: state.answers.payment, type: state.answers.type, condition: state.answers.condition });
    const cards = ranked.map((m) => ({ stock: m.vehicle.stock, payment: m.quote.payment, html: cardHtml(m, page.deal) }));
    const text = resultsIntro({ total: page.total, shown: cards.length, answers: state.answers, more });
    return {
      total: page.total,
      cards,
      text,
      actions: resultActions(page.total, fromOffset, cards.length),
      contact: true,
    };
  }

  async function scriptedPrompt() {
    const inv = getInventory() || [];
    const prompt = promptFor(state, inv);
    if (prompt.results) return { ...prompt, ...(await matchesPayload(0, false)) };
    return prompt;
  }

  async function currentPrompt() {
    const scripted = await scriptedPrompt();
    try {
      const ai = await chatTurn({ state, inventory: getInventory() || [], messages, scripted });
      if (ai && (ai.text || ai.chips || ai.results || ai.cards)) return { ...scripted, ...ai };
    } catch { /* fall back to scripted */ }
    return scripted;
  }

  function renderComposer(prompt) {
    setError('');
    backBtn.disabled = !canGoBack(state);
    backBtn.hidden = !canGoBack(state);

    const chips = prompt.results
      ? []
      : (prompt.chips || []);
    chipsEl.innerHTML = chips.map((c) => `<button type="button" class="chip" data-chip="${esc(c.value)}">${esc(c.label)}</button>`).join('');
    chipsEl.hidden = chips.length === 0;

    if (prompt.links?.length) {
      linksEl.hidden = false;
      linksEl.innerHTML = prompt.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' · ');
    } else {
      linksEl.hidden = true;
      linksEl.innerHTML = '';
    }

    if (prompt.input) {
      inputRow.hidden = false;
      input.placeholder = prompt.input.placeholder || '';
      input.setAttribute('aria-label', prompt.input.label || 'Your answer');
      input.inputMode = prompt.input.kind === 'zip' ? 'numeric' : 'decimal';
      if (prompt.input.kind === 'zip') input.maxLength = 10;
      else input.removeAttribute('maxlength');
      input.value = '';
    } else {
      inputRow.hidden = true;
      input.value = '';
    }
    // Actions for results live in the transcript; hide the empty composer.
    form.hidden = chips.length === 0 && !prompt.input;
  }

  async function refreshComposer() {
    const prompt = await currentPrompt();
    // If we just landed on results and the last bot message has no cards, append them.
    if (state.step === 'results') {
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'bot' || !last.cards) {
        offset = 0;
        messages = [...messages, {
          role: 'bot',
          text: prompt.text,
          cards: prompt.cards,
          actions: prompt.actions,
          contact: true,
          step: 'results',
        }];
        persist();
        renderLog();
      }
      renderComposer({ results: true, chips: [], input: null });
      return prompt;
    }
    renderComposer(prompt);
    return prompt;
  }

  function focusables() {
    return [...panel.querySelectorAll('button, a[href], input, select, textarea')].filter((el) => !el.disabled && !el.hidden && el.closest('[hidden]') == null);
  }

  function openPanel() {
    open = true;
    lastFocus = document.activeElement;
    panel.hidden = false;
    launch.setAttribute('aria-expanded', 'true');
    launch.setAttribute('aria-label', 'Close payment chat');
    document.body.classList.add('chat-open');
    renderLog();
    refreshComposer().then(() => {
      panel.focus();
      const field = !inputRow.hidden ? input : focusables().find((el) => el.id !== 'chat-close') || closeBtn;
      field?.focus();
      logEl.scrollTop = logEl.scrollHeight;
    });
    persist();
    updateVisibility();
  }

  function closePanel() {
    open = false;
    panel.hidden = true;
    launch.setAttribute('aria-expanded', 'false');
    launch.setAttribute('aria-label', 'Open payment chat');
    document.body.classList.remove('chat-open');
    persist();
    const backTo = lastFocus && document.body.contains(lastFocus) ? lastFocus : launch;
    backTo.focus();
    updateVisibility();
  }

  function togglePanel() {
    if (open) closePanel();
    else openPanel();
  }

  function updateVisibility() {
    const hide = staffRoute();
    root.hidden = hide;
    if (hide) {
      document.body.classList.remove('chat-open');
    } else if (open) {
      document.body.classList.add('chat-open');
    }
  }

  function applyDealAndClose(stock) {
    setDeal(answersToDeal(state.answers));
    closePanel();
    // If the card's href already includes deal params, the vehicle page will
    // read them. setDeal keeps the shared shop settings in sync too.
    if (stock && !location.hash.includes(`/vehicle/${encodeURIComponent(stock)}`)) {
      const qs = dealParamsFromSnapshot(answersToDeal(state.answers));
      location.hash = `#/vehicle/${encodeURIComponent(stock)}?${qs}`;
    }
  }

  async function restart() {
    state = freshState();
    messages = greetingMessages();
    offset = 0;
    persist();
    renderLog();
    await refreshComposer();
  }

  async function handleBack() {
    if (!canGoBack(state)) return;
    state = goBack(state);
    offset = 0;
    // Drop trailing result / bot prompt messages until the prior user turn.
    while (messages.length && messages[messages.length - 1].role === 'bot') messages.pop();
    if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
    // If we went all the way back, keep the greeting.
    if (!messages.length) messages = [{ role: 'bot', text: GREETING }];
    const prompt = promptFor(state, getInventory() || []);
    const last = messages[messages.length - 1];
    // The prior bot question for this step is usually still in the log;
    // only re-add it when it's missing (e.g. we popped back to the start).
    if (state.step !== 'results' && prompt.text && !(last && last.role === 'bot' && last.step === state.step)) {
      messages = [...messages, { role: 'bot', text: prompt.text, step: state.step }];
    }
    persist();
    renderLog();
    await refreshComposer();
  }

  async function handleMore() {
    const last = messages.filter((m) => m.role === 'bot' && m.cards).pop();
    const from = offset + (last?.cards?.length || PAGE_SIZE);
    offset = from;
    const page = await matchesPayload(from, true);
    messages = [...messages, {
      role: 'bot',
      text: page.text,
      cards: page.cards,
      actions: page.actions,
      contact: true,
      step: 'results',
    }];
    persist();
    renderLog();
    await refreshComposer();
  }

  async function submitAnswer(raw, prompt) {
    if (busy) return;
    const value = String(raw ?? '').trim();
    if (!value && state.step !== 'down' && state.step !== 'tradeValue' && state.step !== 'tradePayoff') {
      setError('Choose an option or type an answer.');
      return;
    }
    busy = true;
    const label = answerLabel(state.step, value, prompt || promptFor(state, getInventory() || []));
    const res = applyAnswer(state, value, getInventory() || []);
    if (res.error) {
      setError(res.error);
      busy = false;
      return;
    }
    setError('');
    state = res.state;
    offset = 0;
    messages = [...messages, { role: 'user', text: label }];
    if (state.step !== 'results') {
      const next = promptFor(state, getInventory() || []);
      if (next.text) messages = [...messages, { role: 'bot', text: next.text, step: state.step }];
    }
    persist();
    renderLog();
    await refreshComposer();
    if (!inputRow.hidden) input.focus();
    busy = false;
  }

  launch.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', closePanel);
  backBtn.addEventListener('click', () => { handleBack(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open && !root.hidden) {
      e.preventDefault();
      closePanel();
    }
  });

  panel.tabIndex = -1;
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !open) return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const prompt = promptFor(state, getInventory() || []);
    submitAnswer(input.value, prompt);
  });

  chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chip]');
    if (!btn) return;
    const prompt = promptFor(state, getInventory() || []);
    submitAnswer(btn.dataset.chip, prompt);
  });

  logEl.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) {
      const id = action.dataset.action;
      if (id === 'more') handleMore();
      else if (id === 'back') handleBack();
      else if (id === 'restart') restart();
      return;
    }
    const card = e.target.closest('a.chat-card[data-stock]');
    if (card) {
      applyDealAndClose(card.dataset.stock);
    }
  });

  window.addEventListener('hashchange', updateVisibility);

  updateVisibility();
  if (open && !root.hidden) openPanel();
  persist();
}
