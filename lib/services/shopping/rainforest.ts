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
  const stripped = rawPrompt
    .replace(/plan|trip|visit|book|find|get|need|want|looking for|help|me|a|an|the/gi, ' ')
    .replace(/@\w+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return stripped.slice(0, 100) // Rainforest caps query length
}

export async function searchAmazon(
  searchTerm: string,
  domain = 'amazon.co.uk'
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
