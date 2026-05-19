// iAM Browser Extension — Content Script (Manifest V3)
// Injects "Open in iAM" button on product, hotel, and flight pages.
// Extracts structured data from OG/schema.org meta tags + DOM.

const IAM_HOST = 'https://iam.app'  // updated per deployment

;(function () {
  if (document.getElementById('iam-open-button')) return  // already injected

  const context = extractPageContext()
  if (!hasUsefulData(context)) return

  injectButton(context)
})()

// ─── Page context extraction ──────────────────────────────────────────────────

function extractPageContext() {
  const og = extractOGTags()
  const schema = extractSchemaOrg()
  const meta = extractMetaTags()

  return {
    sourceUrl: window.location.href,
    pageTitle: document.title,
    capturedData: {
      productName: og['og:title'] ?? schema.name ?? document.title,
      price: schema.price ?? extractPriceFromDOM(),
      currency: schema.priceCurrency ?? meta.currency,
      imageUrl: og['og:image'] ?? schema.image,
      hotelName: schema['@type'] === 'LodgingBusiness' ? schema.name : undefined,
      checkIn: extractCheckInFromDOM(),
      checkOut: extractCheckOutFromDOM(),
      origin: extractFlightOrigin(),
      destination: extractFlightDestination(),
      departureDate: extractDepartureDate(),
      rawText: document.body.innerText.slice(0, 500),
      structuredData: { ...og },
    },
  }
}

function extractOGTags() {
  const og = {}
  document.querySelectorAll('meta[property^="og:"]').forEach(el => {
    og[el.getAttribute('property')] = el.getAttribute('content')
  })
  return og
}

function extractSchemaOrg() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent)
      if (data && typeof data === 'object') return data
    } catch {}
  }
  return {}
}

function extractMetaTags() {
  const currency = document.querySelector('meta[itemprop="priceCurrency"]')?.getAttribute('content')
  return { currency }
}

function extractPriceFromDOM() {
  const selectors = [
    '[class*="price"]', '[id*="price"]',
    '[class*="cost"]', '[data-price]',
    '[itemprop="price"]',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.match(/[\d.,]+/)) {
      return el.textContent.trim().slice(0, 20)
    }
  }
  return undefined
}

function extractCheckInFromDOM() {
  const el = document.querySelector('[name*="checkin"],[id*="checkin"],[class*="checkin"]')
  return el?.value ?? undefined
}

function extractCheckOutFromDOM() {
  const el = document.querySelector('[name*="checkout"],[id*="checkout"],[class*="checkout"]')
  return el?.value ?? undefined
}

function extractFlightOrigin() {
  const el = document.querySelector('[class*="origin"],[id*="origin"],[aria-label*="From"]')
  return el?.value ?? el?.textContent?.trim().slice(0, 30) ?? undefined
}

function extractFlightDestination() {
  const el = document.querySelector('[class*="destination"],[id*="destination"],[aria-label*="To"]')
  return el?.value ?? el?.textContent?.trim().slice(0, 30) ?? undefined
}

function extractDepartureDate() {
  const el = document.querySelector('[name*="departure"],[id*="departure"],[class*="departure"]')
  return el?.value ?? undefined
}

function hasUsefulData(context) {
  const d = context.capturedData
  return !!(d.productName || d.hotelName || (d.origin && d.destination) || d.price)
}

// ─── Button injection ─────────────────────────────────────────────────────────

function injectButton(context) {
  const btn = document.createElement('button')
  btn.id = 'iam-open-button'
  btn.textContent = '⚡ Open in iAM'
  btn.style.cssText = [
    'position:fixed', 'bottom:24px', 'right:24px', 'z-index:2147483647',
    'background:#6366f1', 'color:#fff', 'border:none', 'border-radius:24px',
    'padding:12px 20px', 'font-size:14px', 'font-weight:600', 'cursor:pointer',
    'box-shadow:0 4px 20px rgba(99,102,241,.4)', 'transition:transform .15s',
  ].join(';')

  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)' })
  btn.addEventListener('mouseleave', () => { btn.style.transform = '' })
  btn.addEventListener('click', () => openInIAM(context))
  document.body.appendChild(btn)
}

async function openInIAM(context) {
  // Post to extension background script to handle the capture API call
  chrome.runtime.sendMessage({ type: 'CAPTURE_PAGE', payload: context }, (response) => {
    if (response?.stageUrl) {
      window.open(`${IAM_HOST}${response.stageUrl}`, '_blank')
    } else {
      // Fallback: open iAM with intent pre-filled
      const intent = encodeURIComponent(context.pageTitle)
      window.open(`${IAM_HOST}/?intent=${intent}`, '_blank')
    }
  })
}
