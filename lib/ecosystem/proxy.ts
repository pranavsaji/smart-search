import { AbstractServiceAdapter } from '@/lib/services/base/adapter'
import type { ServiceResult } from '@/lib/services/types'
import type { CartItem, OrderConfirmation, ShippingAddress } from '@/lib/checkout/types'
import type { SearchContext, ActivityType } from '@/lib/intent/types'
import type { AdapterManifest } from './types'
import { recordApiCall } from './metering'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

const PROXY_TIMEOUT_MS = 5_000

function signRequest(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

async function callEndpoint<T>(
  url: string,
  payload: unknown,
  auth: AdapterManifest['auth'],
  timeoutMs = PROXY_TIMEOUT_MS
): Promise<T> {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  } else if (auth.type === 'hmac' && auth.secret) {
    headers['X-Smart Search-Signature'] = signRequest(body, auth.secret)
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) throw new Error(`Adapter returned HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export class DynamicAdapterProxy extends AbstractServiceAdapter {
  readonly id: string
  readonly type: ActivityType
  readonly displayName: string
  readonly iconName: string
  readonly cacheTTL: number
  readonly genieCapable = false

  constructor(private readonly manifest: AdapterManifest, type: ActivityType) {
    super()
    this.id = `ecosystem:${manifest.adapterId}`
    this.type = type
    this.displayName = manifest.name
    this.iconName = 'Puzzle'
    this.cacheTTL = 300  // 5 min — external adapters cached conservatively
  }

  override isProdEnabled(): boolean { return this.manifest.status === 'approved' }

  override async search(ctx: SearchContext): Promise<ServiceResult> {
    try {
      const result = await callEndpoint<ServiceResult>(
        this.manifest.endpoints.search,
        ctx,
        this.manifest.auth
      )
      recordApiCall(this.manifest.developerId, this.manifest.adapterId, 'search').catch(() => {})
      return { ...result, serviceType: this.type }
    } catch (err) {
      logger.warn('[DynamicAdapterProxy] search failed', { adapterId: this.manifest.adapterId, err })
      return this.errorResult(err instanceof Error ? err.message : 'External adapter error')
    }
  }

  override async createOrder(item: CartItem, address?: ShippingAddress): Promise<OrderConfirmation> {
    try {
      const result = await callEndpoint<OrderConfirmation>(
        this.manifest.endpoints.createOrder,
        { item, address },
        this.manifest.auth
      )
      recordApiCall(this.manifest.developerId, this.manifest.adapterId, 'createOrder').catch(() => {})
      return result
    } catch (err) {
      logger.warn('[DynamicAdapterProxy] createOrder failed', { adapterId: this.manifest.adapterId, err })
      return { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: String(err) }
    }
  }
}
