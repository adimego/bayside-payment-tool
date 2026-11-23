// Promotional cards shown in the shop grid and on vehicle quote pages.
// Add a new entry to ADS (and its logo under assets/ads/) to show another ad.
// Copy and colors for Zurich Shield come from https://www.zurichshield.com/
// (see comments on that entry). Do not invent prices, coverage terms, or claims.

export const AD_INTERVAL = 6;

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

export function adCardHtml(ad, { variant = 'grid' } = {}) {
  if (!ad) return '';
  const benefits = (ad.benefits || []).map((b) => `<li>${esc(b)}</li>`).join('');
  const logo = ad.logo
    ? `<img class="ad-logo" src="${esc(ad.logo)}" alt="${esc(ad.logoAlt || ad.name)}" width="${Number(ad.logoWidth) || ''}" height="${Number(ad.logoHeight) || ''}">`
    : `<span class="ad-name">${esc(ad.name)}</span>`;
  const brand = ad.logoPlate ? `<div class="ad-plate">${logo}</div>` : logo;
  return `
  <aside class="ad-card ad-${esc(ad.theme || ad.id)}" data-ad="${esc(ad.id)}" data-variant="${esc(variant)}" style="${colorStyle(ad)}">
    <div class="ad-brand">${brand}</div>
    <h3 class="ad-headline">${esc(ad.headline || ad.name)}</h3>
    ${ad.body ? `<p class="ad-body">${esc(ad.body)}</p>` : ''}
    ${benefits ? `<ul class="ad-benefits">${benefits}</ul>` : ''}
    <a class="ad-cta" href="${esc(ad.url)}" target="_blank" rel="noopener">${esc(ad.cta || 'Learn more')}</a>
    ${ad.ask ? `<p class="ad-ask">${esc(ad.ask)}</p>` : ''}
  </aside>`;
}
