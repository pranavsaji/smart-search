const RAINFOREST_BASE = 'https://api.rainforestapi.com'

export interface RainforestProduct {
  asin: string
  title: string
  image: string
  link: string
  price?: {
    value: number
    currency: string
    symbol: string
    raw: string
  }
  rating?: number
  ratings_total?: number
  is_prime?: boolean
  brand?: string
  categories_flat?: string
}

interface RainforestSearchResponse {
  request_info: { success: boolean; message?: string }
  search_results: RainforestProduct[]
}

// Derives a concise product search term from raw intent text.
// Strips trip-planning language so Amazon gets a focused query.
export function extractSearchTerm(rawPrompt: string): string {
  // Drop clarify-appended metadata ("destination: Madrid (MAD), departing: …") —
  // trip context only dilutes the product query.
  const withoutMeta = rawPrompt.split(/,\s*(?:destination|from|departing|returning|travelers|preferred time):/i)[0]
  const stripped = withoutMeta
    .replace(/["'“”‘’]/g, ' ') // users paste quoted prompts — quotes poison Amazon phrase matching
    .replace(/@(\w+)/g, '$1') // "@adidas" → "adidas" — the brand is the strongest search signal
    .replace(/\b(?:next|this)\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/gi, ' ')
    .replace(/\b\d+\s*(?:nights?|days?|people)\b/gi, ' ')
    .replace(/\b(?:plan|trip|visit|book|find|get|need|want|help|show|looking|for|me|my|a|an|the|flying|from|to)\b/gi, ' ')
    .replace(/[.,]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return stripped.slice(0, 100) // Rainforest caps query length
}

export async function searchAmazon(
  searchTerm: string,
  domain = 'amazon.com'
): Promise<RainforestProduct[]> {
  const params = new URLSearchParams({
    api_key: process.env.RAINFOREST_API_KEY!,
    type: 'search',
    amazon_domain: domain,
    search_term: searchTerm,
    output: 'json',
    sort_by: 'featured',
  })

  const res = await fetch(`${RAINFOREST_BASE}/request?${params}`, {
    next: { revalidate: 0 }, // never cache at the HTTP layer — Redis handles this
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Rainforest API ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as RainforestSearchResponse
  if (!data.request_info?.success) {
    throw new Error(`Rainforest error: ${data.request_info?.message ?? 'unknown'}`)
  }

  return (data.search_results ?? []).slice(0, 6)
}
