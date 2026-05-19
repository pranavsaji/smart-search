import type { ActivityType } from '@/lib/intent/types'
import type { ServiceAdapter } from './types'

// ServiceRegistry — the extensibility layer.
// New integrations register here; assembler picks them up automatically.
class ServiceRegistry {
  private adapters = new Map<string, ServiceAdapter>()

  register(adapter: ServiceAdapter): void {
    if (this.adapters.has(adapter.id)) {
      console.warn(`[ServiceRegistry] Overwriting adapter: ${adapter.id}`)
    }
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): ServiceAdapter | undefined {
    return this.adapters.get(id)
  }

  getByType(type: ActivityType): ServiceAdapter[] {
    return Array.from(this.adapters.values()).filter(a => a.type === type)
  }

  getAll(): ServiceAdapter[] {
    return Array.from(this.adapters.values())
  }

  getEnabled(): ServiceAdapter[] {
    return this.getAll().filter(a => a.isEnabled())
  }

  getEnabledByType(type: ActivityType): ServiceAdapter | undefined {
    return this.getEnabled().find(a => a.type === type)
  }

  list(): { id: string; type: ActivityType; enabled: boolean }[] {
    return this.getAll().map(a => ({ id: a.id, type: a.type, enabled: a.isEnabled() }))
  }
}

// Singleton
export const serviceRegistry = new ServiceRegistry()

// Registration happens at startup — import this file in app init
export async function registerAllAdapters(): Promise<void> {
  const [
    { FlightsAdapter },
    { StaysAdapter },
    { CarsAdapter },
    { ViatorAdapter },
    { OpenTableAdapter },
    { WeatherAdapter },
    { MapsAdapter },
    { ShoppingAdapter },
    { DigitalServicesAdapter },
    { HomeServicesAdapter },
    { HealthServicesAdapter },
    { AppointmentsAdapter },
    { CatalogAdapter },
  ] = await Promise.all([
    import('./flights/adapter'),
    import('./stays/adapter'),
    import('./cars/adapter'),
    import('./viator/adapter'),
    import('./opentable/adapter'),
    import('./weather/adapter'),
    import('./maps/adapter'),
    import('./shopping/adapter'),
    import('./digital-services/adapter'),
    import('./home-services/adapter'),
    import('./health/adapter'),
    import('./appointments/adapter'),
    import('./catalog/adapter'),  // Phase 7 — native marketplace
  ])

  serviceRegistry.register(new FlightsAdapter())
  serviceRegistry.register(new StaysAdapter())
  serviceRegistry.register(new CarsAdapter())
  serviceRegistry.register(new ViatorAdapter())
  serviceRegistry.register(new OpenTableAdapter())
  serviceRegistry.register(new WeatherAdapter())
  serviceRegistry.register(new MapsAdapter())
  // Phase 7: CatalogAdapter takes precedence over ShoppingAdapter for 'products' type.
  // When VENDOR_PORTAL_ENABLED=true, catalog runs; ShoppingAdapter stays registered as fallback.
  serviceRegistry.register(new CatalogAdapter())
  serviceRegistry.register(new ShoppingAdapter())
  serviceRegistry.register(new DigitalServicesAdapter())
  serviceRegistry.register(new HomeServicesAdapter())
  serviceRegistry.register(new HealthServicesAdapter())
  serviceRegistry.register(new AppointmentsAdapter())
}
