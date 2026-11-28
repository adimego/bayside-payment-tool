// Staff, admin, and public shared-quote screens. Uses the existing brand styles.
import {
  currentProfile,
  isSignedIn,
  isApprovedStaff,
  isAdmin,
  requestAccount,
  signIn,
  signOut,
  requestPasswordReset,
  updatePassword,
  saveQuote,
  listMyQuotes,
  deleteQuote,
  getSharedQuote,
  adminListProfiles,
  adminListQuotes,
  adminSetStatus,
  adminDeactivate,
} from './staff.js?v=4384cec';
import { vehiclePhotoHtml } from './inventory.js?v=4384cec';
import { sharedQuoteUrl, customerFirstName, dealParamsFromSnapshot, formatSavedDate } from './share.js?v=4384cec';
import { customQuoteHash } from './custom-vehicle.js?v=4384cec';
import { LINKS } from './quote.js?v=4384cec';

const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function errText(error, fallback) {
  const m = error?.message || fallback || 'Something went wrong. Please try again.';
  if (/rate limit|over_request|429/i.test(m)) {
    return 'Too many emails were sent from this project this hour (the default built-in limit is 2 emails per hour). Please wait and try again, or ask an admin to add custom SMTP.';
  }
  return m;
}

function quoteOpenHref(row) {
  const dealQs = dealParamsFromSnapshot(row?.deal);
  if (row?.vehicle?.custom) return customQuoteHash(row.vehicle, dealQs);
  if (row?.stock) return `#/vehicle/${encodeURIComponent(row.stock)}?${dealQs}`;
  return '';
}

function formMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text || '';
  el.className = ok ? 'form-msg ok' : 'form-msg err';
}

export function updateStaffNav() {
  const staffTab = document.querySelector('.tabs a[data-tab="staff"]');
  const adminTab = document.querySelector('.tabs a[data-tab="admin"]');
  if (staffTab) {
    if (isApprovedStaff() && currentProfile()?.full_name) {
      staffTab.textContent = 'My quotes';
    } else if (isSignedIn()) {
      staffTab.textContent = 'Staff';
    } else {
      staffTab.textContent = 'Staff';
    }
  }
  if (adminTab) {
    adminTab.hidden = !isAdmin();
  }
}

export async function renderStaff(app, pathParts = []) {
  updateStaffNav();
  const sub = pathParts[1] || '';
  if (sub === 'request') return renderRequest(app);
  if (sub === 'requested') return renderRequested(app);
  if (sub === 'reset') return renderReset(app);
  if (sub === 'password') return renderNewPassword(app);

  if (!isSignedIn()) return renderSignIn(app);
  const p = currentProfile();
  if (!p || p.status === 'pending') return renderPending(app, p);
  if (p.status === 'denied') return renderDenied(app, p);
  return renderMyQuotes(app);
}

function renderSignIn(app) {
  app.innerHTML = `
    <h1>Staff sign in</h1>
    <div class="card auth-card">
      <form id="signin-form" class="auth-form">
        <div><label for="si-email">Email</label><input id="si-email" name="email" type="email" autocomplete="username" required></div>
        <div><label for="si-pass">Password</label><input id="si-pass" name="password" type="password" autocomplete="current-password" required></div>
        <p class="form-msg" id="si-msg" hidden></p>
        <button class="btn primary" type="submit">Sign in</button>
      </form>
      <p class="hint"><a href="#/staff/reset">Forgot your password?</a></p>
      <p class="hint">Need an account? <a href="#/staff/request">Request an account</a></p>
    </div>`;
  const msg = document.getElementById('si-msg');
  document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    msg.hidden = false;
    formMsg(msg, 'Signing in…', true);
    const { error } = await signIn({ email: fd.get('email'), password: fd.get('password') });
    if (error) formMsg(msg, errText(error, 'Could not sign in.'));
    else location.hash = '#/staff';
  });
}

function renderRequest(app) {
  app.innerHTML = `
    <a class="back" href="#/staff">← Sign in</a>
    <h1>Request an account</h1>
    <div class="card auth-card">
      <p class="hint">Salespeople can request a staff login here. An admin approves each request before you can save quotes.</p>
      <form id="req-form" class="auth-form">
        <div><label for="rq-name">Full name</label><input id="rq-name" name="fullName" autocomplete="name" required></div>
        <div><label for="rq-email">Email</label><input id="rq-email" name="email" type="email" autocomplete="email" required></div>
        <div><label for="rq-phone">Phone <span class="optional">(optional)</span></label><input id="rq-phone" name="phone" type="tel" autocomplete="tel"></div>
        <div><label for="rq-pass">Password</label><input id="rq-pass" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
        <p class="form-msg" id="rq-msg" hidden></p>
        <button class="btn primary" type="submit">Send request</button>
      </form>
    </div>`;
  const msg = document.getElementById('rq-msg');
  document.getElementById('req-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    msg.hidden = false;
    formMsg(msg, 'Sending request…', true);
    const { error } = await requestAccount({
      fullName: fd.get('fullName'),
      email: fd.get('email'),
      password: fd.get('password'),
      phone: fd.get('phone'),
    });
    if (error) {
      formMsg(msg, errText(error, 'Could not send the request.'));
      return;
    }
    location.hash = '#/staff/requested';
  });
}

function renderRequested(app) {
  app.innerHTML = `
    <h1>Request sent, waiting for approval</h1>
    <div class="card auth-card">
      <p>Thanks. Your request has been sent. An admin will approve your account before you can save quotes.</p>
      <p class="hint">If you receive a confirmation email, tap the link, then <a href="#/staff">sign in</a>.</p>
    </div>`;
}

function renderReset(app) {
  app.innerHTML = `
    <a class="back" href="#/staff">← Sign in</a>
    <h1>Reset your password</h1>
    <div class="card auth-card">
      <form id="rs-form" class="auth-form">
        <div><label for="rs-email">Email</label><input id="rs-email" name="email" type="email" autocomplete="email" required></div>
        <p class="form-msg" id="rs-msg" hidden></p>
        <button class="btn primary" type="submit">Send reset link</button>
      </form>
    </div>`;
  const msg = document.getElementById('rs-msg');
  document.getElementById('rs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    msg.hidden = false;
    formMsg(msg, 'Sending…', true);
    const { error } = await requestPasswordReset(fd.get('email'));
    if (error) formMsg(msg, errText(error, 'Could not send a reset email.'));
    else formMsg(msg, 'If that email is on file, a reset link is on its way.', true);
  });
}

function renderNewPassword(app) {
  app.innerHTML = `
    <h1>Choose a new password</h1>
    <div class="card auth-card">
      <form id="pw-form" class="auth-form">
        <div><label for="pw-new">New password</label><input id="pw-new" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
        <p class="form-msg" id="pw-msg" hidden></p>
        <button class="btn primary" type="submit">Update password</button>
      </form>
    </div>`;
  const msg = document.getElementById('pw-msg');
  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    msg.hidden = false;
    formMsg(msg, 'Updating…', true);
    const { error } = await updatePassword(fd.get('password'));
    if (error) formMsg(msg, errText(error, 'Could not update the password.'));
    else {
      formMsg(msg, 'Password updated.', true);
      setTimeout(() => { location.hash = '#/staff'; }, 800);
    }
  });
}

function renderPending(app, p) {
  app.innerHTML = `
    <h1>Waiting for approval</h1>
    <div class="card auth-card">
      <p>Request sent, waiting for approval${p?.full_name ? `, ${esc(p.full_name)}` : ''}.</p>
      <p class="hint">An admin will review your request. You can close this page and sign in again later.</p>
      <button class="btn" type="button" id="so">Sign out</button>
    </div>`;
  document.getElementById('so').addEventListener('click', async () => {
    await signOut();
    location.hash = '#/staff';
  });
}

function renderDenied(app, p) {
  app.innerHTML = `
    <h1>Account not active</h1>
    <div class="card auth-card">
      <p>${esc(p?.full_name || 'This account')} is not approved to save quotes. If you think that's a mistake, talk to an admin.</p>
      <button class="btn" type="button" id="so">Sign out</button>
    </div>`;
  document.getElementById('so').addEventListener('click', async () => {
    await signOut();
    location.hash = '#/staff';
  });
}

async function renderMyQuotes(app) {
  const p = currentProfile();
  app.innerHTML = `
    <div class="staff-head">
      <h1>My quotes</h1>
      <div class="staff-user">
        <span>${esc(p.full_name)}</span>
        ${isAdmin() ? '<a class="btn small" href="#/admin">Admin</a>' : ''}
        <button class="btn small" type="button" id="so">Sign out</button>
      </div>
    </div>
    <div class="card">
      <label for="mq-search">Search</label>
      <input id="mq-search" type="search" placeholder="Customer, stock, vehicle">
      <div id="mq-list" class="quote-list"><p class="hint">Loading…</p></div>
    </div>`;
  document.getElementById('so').addEventListener('click', async () => {
    await signOut();
    location.hash = '#/staff';
  });
  const { data, error } = await listMyQuotes();
  const list = document.getElementById('mq-list');
  if (error) {
    list.innerHTML = `<p class="form-msg err">${esc(errText(error, 'Could not load quotes.'))}</p>`;
    return;
  }
  const draw = (q) => {
    const rows = data.filter((row) => {
      const hay = `${row.customer_name} ${row.stock || ''} ${row.vehicle?.name || ''} ${row.vehicle?.make || ''} ${row.vehicle?.model || ''}`.toLowerCase();
      return hay.includes(q);
    });
    if (!rows.length) {
      list.innerHTML = '<p class="empty">No quotes yet. Open a vehicle and tap Save quote.</p>';
      return;
    }
    list.innerHTML = rows.map((row) => {
      const title = row.vehicle?.name || `Stock ${row.stock || '—'}`;
      const pay = row.results?.payment != null ? money(row.results.payment) + '/mo' : '';
      return `<article class="qrow">
        <div>
          <strong>${esc(row.customer_name)}</strong>
          <div class="meta">${esc(title)}${row.stock ? ' · Stock ' + esc(row.stock) : ''}${pay ? ' · ' + esc(pay) : ''} · ${esc(formatSavedDate(row.created_at))}</div>
        </div>
        <div class="qactions">
          ${quoteOpenHref(row) ? `<a class="btn small" href="${esc(quoteOpenHref(row))}">Open</a>` : ''}
          <button class="btn small" type="button" data-copy="${esc(row.slug)}">Copy quote link</button>
          <button class="btn small danger" type="button" data-del="${esc(row.id)}">Delete</button>
        </div>
      </article>`;
    }).join('');
  };
  draw('');
  document.getElementById('mq-search').addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
  list.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    const del = e.target.closest('[data-del]');
    if (copy) {
      const url = sharedQuoteUrl(copy.dataset.copy);
      try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; }
      catch { prompt('Copy this link:', url); }
      setTimeout(() => { copy.textContent = 'Copy quote link'; }, 2000);
    }
    if (del) {
      if (!confirm('Delete this saved quote? The share link will stop working.')) return;
      const { error: delErr } = await deleteQuote(del.dataset.del);
      if (delErr) { alert(errText(delErr, 'Could not delete the quote.')); return; }
      const i = data.findIndex((r) => r.id === del.dataset.del);
      if (i >= 0) data.splice(i, 1);
      draw(document.getElementById('mq-search').value.trim().toLowerCase());
    }
  });
}

export function bindSaveQuote(root, { vehicle, deal, results, getResults }) {
  if (!isApprovedStaff() || !root || (!results && typeof getResults !== 'function')) return;
  if (root.querySelector('.save-quote')) return;
  const box = document.createElement('div');
  box.className = 'save-quote';
  box.innerHTML = `
    <button class="btn primary" type="button" id="sq-open">Save quote</button>
    <form id="sq-form" class="auth-form" hidden>
      <div><label for="sq-name">Customer name</label><input id="sq-name" name="customerName" required></div>
      <div><label for="sq-notes">Notes <span class="optional">(optional, not shown on the customer link)</span></label><textarea id="sq-notes" name="notes" rows="2"></textarea></div>
      <p class="form-msg" id="sq-msg" hidden></p>
      <div class="btns">
        <button class="btn primary" type="submit">Save</button>
        <button class="btn" type="button" id="sq-copy" hidden>Copy quote link</button>
      </div>
    </form>`;
  root.appendChild(box);
  const form = box.querySelector('#sq-form');
  const msg = box.querySelector('#sq-msg');
  const copyBtn = box.querySelector('#sq-copy');
  let savedSlug = null;
  box.querySelector('#sq-open').addEventListener('click', () => {
    form.hidden = false;
    box.querySelector('#sq-name').focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    msg.hidden = false;
    formMsg(msg, 'Saving…', true);
    const snap = typeof getResults === 'function' ? getResults() : results;
    const { data, error } = await saveQuote({
      customerName: fd.get('customerName'),
      notes: fd.get('notes'),
      stock: vehicle?.stock,
      vehicle,
      deal,
      results: snap,
    });
    if (error) { formMsg(msg, errText(error, 'Could not save the quote.')); return; }
    savedSlug = data.slug;
    formMsg(msg, 'Quote saved.', true);
    copyBtn.hidden = false;
  });
  copyBtn.addEventListener('click', async (e) => {
    if (!savedSlug) return;
    const url = sharedQuoteUrl(savedSlug);
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Copied'; }
    catch { prompt('Copy this link:', url); }
    setTimeout(() => { e.target.textContent = 'Copy quote link'; }, 2000);
  });
}

export async function renderSharedQuote(app, slug, { breakdownFromSaved }) {
  app.innerHTML = '<p class="loading">Loading quote…</p>';
  let data, error;
  try {
    ({ data, error } = await getSharedQuote(slug));
  } catch (err) {
    error = err;
  }
  if (error || !data) {
    app.innerHTML = `
      <a class="back" href="#/">← All vehicles</a>
      <div class="card"><h1>Quote not found</h1><p>This link may be expired or incorrect. Call <a href="tel:+15407752277">(540) 775-2277</a>.</p></div>`;
    return;
  }
  try {
  const first = data.customer_first_name || customerFirstName(data.vehicle?.name) || 'Customer';
  const v = data.vehicle || {};
  const title = v.name || [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Saved quote';
  const saved = formatSavedDate(data.created_at);
  app.innerHTML = `
    <div class="quote-layout">
      <div class="quote-main">
        <div class="card vhead">
          <div class="vhead-top">
            ${vehiclePhotoHtml({ ...v, name: title }, { className: 'vphoto', eager: true })}
            <div class="vhead-title">
              <h1>${esc(title)}</h1>
              <div class="sub">${v.condition ? `<span class="badge ${v.condition === 'Used' ? 'used' : ''}">${esc(v.condition)}</span>` : ''}${v.custom ? '<span class="badge custom">Custom vehicle</span>' : ''}
                ${data.stock ? 'Stock ' + esc(data.stock) : (v.stock ? 'Stock ' + esc(v.stock) : '')} · Quote for ${esc(first)}</div>
            </div>
          </div>
        </div>
      </div>
      <aside class="card quote-summary">
        <h2>Your quote</h2>
        <div id="quote">${breakdownFromSaved(data.results || {}, data.public_deal || {})}</div>
        <p class="hint">Prices and rates subject to change${saved ? '. Saved ' + esc(saved) : ''}.</p>
        <div class="btns">
          <a class="btn primary" href="${LINKS.applyForFinancing}" target="_blank" rel="noopener">Apply for Financing</a>
          <a class="btn" href="${LINKS.valueMyTrade}" target="_blank" rel="noopener">Value My Trade</a>
        </div>
      </aside>
    </div>`;
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <a class="back" href="#/">← All vehicles</a>
      <div class="card"><h1>Quote not found</h1><p>This link may be expired or incorrect. Call <a href="tel:+15407752277">(540) 775-2277</a>.</p></div>`;
  }
}

export async function renderAdmin(app) {
  updateStaffNav();
  if (!isAdmin()) {
    app.innerHTML = '<div class="card"><h1>Admin</h1><p>You need an approved admin account to open this page.</p><p><a href="#/staff">Staff sign in</a></p></div>';
    return;
  }
  app.innerHTML = `
    <a class="back" href="#/staff">← My quotes</a>
    <h1>Admin</h1>
    <div class="card">
      <h2>Pending requests</h2>
      <div id="ad-pending"><p class="hint">Loading…</p></div>
    </div>
    <div class="card">
      <h2>Staff</h2>
      <div id="ad-staff"></div>
    </div>
    <div class="card">
      <h2>All quotes</h2>
      <div id="ad-quotes"></div>
    </div>`;

  const [{ data: profiles, error: pErr }, { data: quotes, error: qErr }] = await Promise.all([
    adminListProfiles(),
    adminListQuotes(),
  ]);
  const pendingEl = document.getElementById('ad-pending');
  const staffEl = document.getElementById('ad-staff');
  const quotesEl = document.getElementById('ad-quotes');
  if (pErr) {
    pendingEl.innerHTML = `<p class="form-msg err">${esc(errText(pErr))}</p>`;
    return;
  }
  const pending = profiles.filter((r) => r.status === 'pending');
  pendingEl.innerHTML = pending.length ? pending.map((r) => `
    <article class="qrow">
      <div><strong>${esc(r.full_name)}</strong><div class="meta">${esc(r.email)}${r.phone ? ' · ' + esc(r.phone) : ''} · requested ${esc(formatSavedDate(r.created_at))}</div></div>
      <div class="qactions">
        <button class="btn small primary" type="button" data-approve="${esc(r.id)}">Approve</button>
        <button class="btn small danger" type="button" data-deny="${esc(r.id)}">Deny</button>
      </div>
    </article>`).join('') : '<p class="hint">No pending requests.</p>';

  staffEl.innerHTML = profiles.map((r) => `
    <article class="qrow">
      <div><strong>${esc(r.full_name)}</strong><div class="meta">${esc(r.email)} · ${esc(r.role)} · ${esc(r.status)}</div></div>
      <div class="qactions">
        ${r.status === 'approved' && r.role !== 'admin' ? `<button class="btn small danger" type="button" data-off="${esc(r.id)}">Deactivate</button>` : ''}
      </div>
    </article>`).join('') || '<p class="hint">No staff yet.</p>';

  if (qErr) quotesEl.innerHTML = `<p class="form-msg err">${esc(errText(qErr))}</p>`;
  else {
    quotesEl.innerHTML = quotes.length ? quotes.map((row) => {
      const staff = profiles.find((p) => p.id === row.staff_id);
      return `<article class="qrow">
        <div><strong>${esc(customerFirstName(row.customer_name) || row.customer_name)}</strong>
          <div class="meta">${esc(row.vehicle?.name || row.stock || 'Quote')} · ${esc(staff?.full_name || 'Staff')} · ${esc(formatSavedDate(row.created_at))}</div>
        </div>
        <div class="qactions">
          <button class="btn small" type="button" data-copy="${esc(row.slug)}">Copy quote link</button>
          <button class="btn small danger" type="button" data-qdel="${esc(row.id)}">Delete</button>
        </div>
      </article>`;
    }).join('') : '<p class="hint">No saved quotes yet.</p>';
  }

  app.addEventListener('click', async (e) => {
    const approve = e.target.closest('[data-approve]');
    const deny = e.target.closest('[data-deny]');
    const off = e.target.closest('[data-off]');
    const copy = e.target.closest('[data-copy]');
    const qdel = e.target.closest('[data-qdel]');
    if (approve) {
      const { error } = await adminSetStatus(approve.dataset.approve, 'approved');
      if (error) alert(errText(error)); else location.reload();
    }
    if (deny) {
      const { error } = await adminSetStatus(deny.dataset.deny, 'denied');
      if (error) alert(errText(error)); else location.reload();
    }
    if (off) {
      if (!confirm('Deactivate this staff account? They will no longer be able to save quotes.')) return;
      const { error } = await adminDeactivate(off.dataset.off);
      if (error) alert(errText(error)); else location.reload();
    }
    if (copy) {
      const url = sharedQuoteUrl(copy.dataset.copy);
      try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; }
      catch { prompt('Copy this link:', url); }
      setTimeout(() => { copy.textContent = 'Copy quote link'; }, 2000);
    }
    if (qdel) {
      if (!confirm('Delete this saved quote? The share link will stop working.')) return;
      const { error } = await deleteQuote(qdel.dataset.qdel);
      if (error) alert(errText(error)); else location.reload();
    }
  }, { once: false });
}
