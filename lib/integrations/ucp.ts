export interface UCPMerchant {
  merchantId: string
  name: string
  endpointUrl: string
  categories: string[]
  currency: string
}

export interface UCPProduct {
  productId: string
  merchantId: string
  title: string
  price: { amount: number; currency: string }
  imageUrl?: string
  deepLinkUrl: string
  category: string
  inStock: boolean
}

export interface ShoppingIntentContext {
  categories: string[]
  query: string
  currency: string
  budgetSignal?: string
}

export class UCPClient {
  private registryUrl: string

  constructor(registryUrl: string) {
    this.registryUrl = registryUrl
  }

  async discoverMerchants(context: ShoppingIntentContext): Promise<UCPMerchant[]> {
    try {
      const res = await fetch(`${this.registryUrl}/merchants?categories=${context.categories.join(',')}&currency=${context.currency}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.merchants ?? []) as UCPMerchant[]
    } catch {
      return []
    }
  }

  async fetchProducts(merchant: UCPMerchant, query: string, budget?: string): Promise<UCPProduct[]> {
    try {
      const params = new URLSearchParams({ q: query, budget: budget ?? '' })
      const res = await fetch(`${merchant.endpointUrl}/products?${params}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.products ?? []) as UCPProduct[]
    } catch {
      return []
    }
  }

  async prepareCheckout(merchant: UCPMerchant, productId: string, qty: number = 1): Promise<string | null> {
    try {
      const res = await fetch(`${merchant.endpointUrl}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, qty }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return (data.checkoutToken as string) ?? null
    } catch {
      return null
    }
  }
}

let _ucpClient: UCPClient | null = null

export function getUCPClient(): UCPClient | null {
  const registryUrl = process.env.UCP_REGISTRY_URL
  if (!registryUrl) return null
  if (!_ucpClient) _ucpClient = new UCPClient(registryUrl)
  return _ucpClient
}
