import type { ActivityType } from '@/lib/intent/types'

export type ProviderCategory =
  // Home services
  | 'mechanic' | 'plumber' | 'electrician' | 'cleaner' | 'handyman'
  // Health services
  | 'gp' | 'dentist' | 'therapist' | 'physio'
  // Digital services
  | 'developer' | 'designer' | 'copywriter'

export interface ServiceProvider {
  _id?: string
  name: string
  category: ProviderCategory
  serviceType: ActivityType        // 'home_services' | 'health_services' | 'digital_services'
  location?: string                // city/region for location-based; absent for digital
  platform: string                 // display name e.g. "Checkatrade", "Zocdoc"
  description: string
  imageUrl?: string
  rating: number
  reviewCount: number
  priceAmount: number              // minor units (pence)
  priceCurrency: string
  priceDisplay: string             // e.g. "$75 / hr"
  schedulingUrl?: string           // Calendly or platform booking URL
  deepLinkUrl?: string             // direct link to provider profile
  metadata: Record<string, unknown>
  availability?: string[]
  responseTime?: string
  insurance?: boolean
  teleconsult?: boolean
  acceptsInsurance?: boolean
  level?: 'entry' | 'intermediate' | 'expert'
  deliveryDays?: number
  supportsGenie: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
