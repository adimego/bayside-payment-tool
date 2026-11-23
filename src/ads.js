// Promotional cards shown in the shop grid and on vehicle quote pages.
// Add a new entry to ADS (and its logo under assets/ads/) to show another ad.
// Copy and colors for Zurich Shield come from https://www.zurichshield.com/
// (see comments on that entry). Do not invent prices, coverage terms, or claims.
//
// Compact cards match the vehicle-card layout. The full benefits, ask line,
// and external CTA open in an accessible dialog.

export const AD_INTERVAL = 6;
export const AD_OPEN_LABEL = 'Learn more';

export const ADS = [
  {
    id: 'zurich-shield',
    name: 'Zurich Shield',
    theme: 'zurich',
    logo: 'assets/ads/zurich-shield-logo.png',
    logoAlt: 'Zurich Shield Advanced Environmental Protection',
    logoWidth: 3010,
    logoHeight: 674,
    headline: 'Protection for the road ahead',
    // Official tagline and overview from https://www.zurichshield.com/
    body: 'Designed to help keep your vehicle looking good inside and out for years to come, Zurich Shield protects your car from harmful environmental elements and stains.',
    // Short line for the compact card, taken from the official overview.
    teaser: 'Protects your car from harmful elements and stains.',
    benefits: [
      // From the Benefits of Zurich Shield section on zurichshield.com
      'Provides lasting exterior protection from harmful UV rays, bird waste, tree sap, road salts, and other environmental damage.',
      'Increase your vehicle\'s resale value by transferring the product warranty to the new owner.',
    ],
    ask: 'Ask us about Zurich Shield',
    cta: 'Learn more',
    url: 'https://www.zurichshield.com/',
    // Hex values from zurichshield.com CSS: #005CB9 is used for text;
    // #384AD3 is rgb(56,74,211) (--color_18 / --wst-color-action, primary buttons);
    // #595959 is rgb(89,89,89) (--color_14, secondary text).
    colors: {
      bg: '#FFFFFF',
      text: '#000000',
      muted: '#595959',
      accent: '#005CB9',
      ctaBg: '#384AD3',
      ctaText: '#FFFFFF',
      border: '#005CB9',
    },
    logoPlate: false,
    showInGrid: true,
    showOnQuote: true,
  },
  {
    id: 'bayside-maintenance',
    name: 'Bayside Maintenance',
    theme: 'bayside',
    logo: 'assets/bayside-wordmark@2x.png',
    logoAlt: 'Bayside Chrysler Dodge Jeep Ram',
    logoWidth: 258,
    logoHeight: 112,
    headline: 'Maintenance made easy',
    body: 'Keep upkeep simple with Bayside\'s oil change and tire rotation plans, handled right here at our King George store.',
    teaser: 'Oil change and tire rotation plans at Bayside.',
    benefits: [
      'Oil change plans, handled at Bayside',
      'Tire rotation plans, kept simple',
      'Easy to use, all in one place',
    ],
    ask: 'Ask us about Bayside Maintenance',
    cta: 'Ask about plans',
    // Confirmed service page listing oil change and tire rotation:
    // https://www.baysidecdjrva.com/service/service-mopar.htm
    url: 'https://www.baysidecdjrva.com/service/service-mopar.htm',
    // Bayside brand colors already used on this site (logo red and black).
    colors: {
      bg: '#BC2028',
      text: '#FFFFFF',
      muted: '#F5F4F4',
      accent: '#BC2028',
      ctaBg: '#231F20',
      ctaText: '#FFFFFF',
      border: '#9A1A21',
    },
    logoPlate: true,
    showInGrid: true,
    showOnQuote: true,
  },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function enabledAds(ads = ADS) {
  return (ads || []).filter((ad) => ad && ad.enabled !== false);
}

export function gridAds(ads = ADS) {
  return enabledAds(ads).filter((ad) => ad.showInGrid !== false);
}

export function quoteAds(ads = ADS) {
  return enabledAds(ads).filter((ad) => ad.showOnQuote !== false);
}

export function findAd(id, ads = ADS) {
  return enabledAds(ads).find((ad) => ad.id === id) || null;
}

/** One-line compact-card text: teaser, or the first sentence of the body. */
export function adTeaser(ad) {
  if (ad?.teaser) return String(ad.teaser);
  const body = String(ad?.body || '').trim();
  const cut = body.match(/^[^.!?]*[.!?]/);
  return (cut ? cut[0] : body).trim();
}

/**
 * Build a shop-grid list that inserts an ad after every `interval` vehicles.
 * Ads are not vehicles: the input length is the vehicle count, and callers
 * should keep using that for "N vehicles" labels, filters, and sorting.
 * When several ads are in the catalog they rotate in catalog order, starting
 * at `offset`.
 */
export function interleaveAds(vehicles, ads = ADS, { interval = AD_INTERVAL, offset = 0 } = {}) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const step = Number(interval);
  const pool = gridAds(ads);
  if (!list.length || !pool.length || !Number.isFinite(step) || step < 1) {
    return list.map((vehicle) => ({ kind: 'vehicle', vehicle }));
  }
  const start = ((Number(offset) || 0) % pool.length + pool.length) % pool.length;
  const out = [];
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    out.push({ kind: 'vehicle', vehicle: list[i] });
    if ((i + 1) % step === 0) {
      out.push({ kind: 'ad', ad: pool[(start + n) % pool.length] });
      n += 1;
    }
  }
  return out;
}

function colorStyle(ad) {
  const c = ad?.colors || {};
  const keys = [
    ['bg', 'bg'],
    ['text', 'text'],
    ['muted', 'muted'],
    ['accent', 'accent'],
    ['ctaBg', 'cta-bg'],
    ['ctaText', 'cta-text'],
    ['border', 'border'],
  ];
  return keys.filter(([k]) => c[k]).map(([k, css]) => `--ad-${css}:${c[k]}`).join(';');
}

function logoHtml(ad) {
  if (!ad?.logo) return `<span class="ad-name">${esc(ad?.name)}</span>`;
  const w = Number(ad.logoWidth) || '';
  const h = Number(ad.logoHeight) || '';
  const img = `<img class="ad-logo" src="${esc(ad.logo)}" alt="${esc(ad.logoAlt || ad.name)}" width="${w}" height="${h}">`;
  return ad.logoPlate ? `<div class="ad-plate">${img}</div>` : img;
}

/** Compact card: same shape as a vehicle card (thumb, headline, one line, Learn more). */
export function adCardHtml(ad, { variant = 'grid' } = {}) {
  if (!ad) return '';
  const id = esc(ad.id);
  return `
  <article class="ad-card ad-${esc(ad.theme || ad.id)}" data-ad="${id}" data-variant="${esc(variant)}" style="${colorStyle(ad)}">
    <div class="ad-thumb">${logoHtml(ad)}</div>
    <div class="ad-copy">
      <div class="top"><span class="title ad-headline">${esc(ad.headline || ad.name)}</span></div>
      <p class="ad-teaser">${esc(adTeaser(ad))}</p>
      <div class="nums"><button type="button" class="ad-open" data-ad-open="${id}" aria-haspopup="dialog" aria-controls="ad-dialog">${esc(AD_OPEN_LABEL)}</button></div>
    </div>
  </article>`;
}

/** Full copy for the dialog: body, benefits, ask line, and the external CTA. */
export function adDetailHtml(ad) {
  if (!ad) return '';
  const benefits = (ad.benefits || []).map((b) => `<li>${esc(b)}</li>`).join('');
  return `
    <div class="ad-dialog-brand">${logoHtml(ad)}</div>
    <h2 class="ad-dialog-title" id="ad-dialog-title">${esc(ad.headline || ad.name)}</h2>
    ${ad.body ? `<p class="ad-body">${esc(ad.body)}</p>` : ''}
    ${benefits ? `<ul class="ad-benefits">${benefits}</ul>` : ''}
    ${ad.ask ? `<p class="ad-ask">${esc(ad.ask)}</p>` : ''}
    <a class="ad-cta" href="${esc(ad.url)}" target="_blank" rel="noopener">${esc(ad.cta || AD_OPEN_LABEL)}</a>`;
}

// ---------- accessible dialog ----------
let rootEl = null;
let lastOpener = null;
let bound = false;

function dialogPanel() {
  return rootEl?.querySelector('.ad-dialog') || null;
}

function focusables(scope) {
  if (!scope) return [];
  return [...scope.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}

export function isAdDialogOpen() {
  return Boolean(rootEl && !rootEl.hasAttribute('hidden'));
}

export function closeAdDialog() {
  if (!isAdDialogOpen()) return;
  rootEl.setAttribute('hidden', '');
  document.body.classList.remove('ad-dialog-open');
  const opener = lastOpener;
  lastOpener = null;
  if (opener && typeof opener.focus === 'function') {
    try { opener.focus(); } catch { /* unmounted */ }
  }
}

export function openAdDialog(ad, opener) {
  if (!ad || typeof document === 'undefined') return;
  ensureAdDialog();
  const panel = dialogPanel();
  const content = rootEl.querySelector('.ad-dialog-body');
  content.innerHTML = adDetailHtml(ad);
  rootEl.className = `ad-dialog-root ad-${ad.theme || ad.id}`;
  rootEl.style.cssText = colorStyle(ad);
  rootEl.removeAttribute('hidden');
  document.body.classList.add('ad-dialog-open');
  lastOpener = opener || document.activeElement;
  const closeBtn = rootEl.querySelector('.ad-dialog-close');
  (closeBtn || panel).focus();
}

function ensureAdDialog() {
  if (rootEl || typeof document === 'undefined') return rootEl;
  rootEl = document.createElement('div');
  rootEl.id = 'ad-dialog-root';
  rootEl.className = 'ad-dialog-root';
  rootEl.setAttribute('hidden', '');
  rootEl.innerHTML = `
    <div class="ad-backdrop" data-ad-close tabindex="-1"></div>
    <div class="ad-dialog" id="ad-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-dialog-title" tabindex="-1">
      <button type="button" class="ad-dialog-close" data-ad-close aria-label="Close">Close</button>
      <div class="ad-dialog-body"></div>
    </div>`;
  document.body.appendChild(rootEl);
  return rootEl;
}

function onDocClick(e) {
  const closeBtn = e.target.closest('[data-ad-close]');
  if (closeBtn && isAdDialogOpen()) {
    e.preventDefault();
    closeAdDialog();
    return;
  }
  if (e.target.closest('.ad-dialog')) return;
  const opener = e.target.closest('[data-ad-open], .ad-card');
  if (!opener) return;
  const card = opener.closest('.ad-card') || opener;
  const ad = findAd(card.dataset.ad || opener.getAttribute('data-ad-open'));
  if (!ad) return;
  e.preventDefault();
  openAdDialog(ad, opener.matches('button, [data-ad-open]') ? opener : card.querySelector('[data-ad-open]') || card);
}

function onDocKey(e) {
  if (!isAdDialogOpen()) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeAdDialog();
    return;
  }
  if (e.key !== 'Tab') return;
  const panel = dialogPanel();
  const list = focusables(panel);
  if (!list.length) {
    e.preventDefault();
    panel?.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
    e.preventDefault();
    first.focus();
  }
}

/** Bind once. Compact cards open the shared dialog; Escape, backdrop, and Close dismiss it. */
export function initAds() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  ensureAdDialog();
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);
}
