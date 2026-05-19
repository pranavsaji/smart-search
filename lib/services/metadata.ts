// Per-service-type metadata contracts.
// Adapters use these with `satisfies` to get compile-time checking.
// Components import these to cast card.metadata safely.

export interface FlightCardMetadata {
  departing_at: string
  arriving_at: string
  carrier: string
}

export interface StayCardMetadata {
  accommodationId: string
  checkIn?: string
  checkOut?: string
  [key: string]: unknown
}

export interface CarCardMetadata {
  category: 'economy' | 'suv' | 'premium' | 'minivan'
  seats: number
  transmission: 'auto' | 'manual'
}

export interface ExperienceCardMetadata {
  rating?: number
  reviewCount?: number
  duration?: string
  category: string
}

export interface RestaurantCardMetadata {
  cuisine: string
  rating?: number
  reviewCount?: number
  priceLevel: string
  address?: string
  availableSlots: string[]
}

export interface WeatherDay {
  date: string
  temp: number
  description: string
  icon: string
}

export interface WeatherCardMetadata {
  days: WeatherDay[]
}

export interface MapsCardMetadata {
  rating?: number
  userRatingsTotal?: number
  types: string[]
}

export interface ProductCardMetadata {
  retailer: string
  rating: number
  reviewCount: number
  inStock: boolean
  deliveryDays: number
  brand?: string
  category: string
}

export interface AppointmentCardMetadata {
  type: string
  platform: string
  duration: number
  availability: string[]
  genieEnabled?: boolean
}

export interface GenericServiceMetadata {
  [key: string]: unknown
}

// Map from ActivityType → its metadata interface
export interface ServiceMetadataMap {
  flights: FlightCardMetadata
  stays: StayCardMetadata
  cars: CarCardMetadata
  experiences: ExperienceCardMetadata
  restaurants: RestaurantCardMetadata
  weather: WeatherCardMetadata
  maps: MapsCardMetadata
  products: ProductCardMetadata
  digital_services: GenericServiceMetadata
  home_services: GenericServiceMetadata
  health_services: GenericServiceMetadata
  appointments: AppointmentCardMetadata
}
