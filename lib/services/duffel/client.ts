const DUFFEL_BASE_URL = 'https://api.duffel.com'
const DUFFEL_API_VERSION = 'v2'
const MAX_RETRIES = 3
const TIMEOUT_MS = 8000

interface DuffelRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  retryCount?: number
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function duffelRequest<T>(
  path: string,
  options: DuffelRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, retryCount = 0 } = options

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${DUFFEL_BASE_URL}/${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${process.env.DUFFEL_API_TOKEN}`,
        'Duffel-Version': DUFFEL_API_VERSION,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify({ data: body }) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const error = await res.json().catch(() => ({ errors: [{ message: res.statusText }] }))
      const err = new Error(`Duffel API error ${res.status}: ${JSON.stringify(error)}`)

      // Only retry transient errors — 429 rate limit and 5xx server errors.
      // Never retry 4xx client errors (bad token, forbidden, not found) — retrying won't help.
      if (res.status === 429 && retryCount < MAX_RETRIES) {
        clearTimeout(timeout)
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10)
        await sleep(retryAfter * 1000)
        return duffelRequest<T>(path, { ...options, retryCount: retryCount + 1 })
      }
      if (res.status >= 500 && retryCount < MAX_RETRIES) {
        clearTimeout(timeout)
        await sleep(1000 * Math.pow(2, retryCount))
        return duffelRequest<T>(path, { ...options, retryCount: retryCount + 1 })
      }
      throw err
    }

    const json = await res.json()
    return json.data as T
  } catch (err) {
    clearTimeout(timeout)
    // Only retry on network/timeout errors, not on Duffel API errors (already handled above)
    if (err instanceof Error && err.name === 'AbortError' && retryCount < MAX_RETRIES) {
      await sleep(1000 * Math.pow(2, retryCount))
      return duffelRequest<T>(path, { ...options, retryCount: retryCount + 1 })
    }
    throw err
  }
}
