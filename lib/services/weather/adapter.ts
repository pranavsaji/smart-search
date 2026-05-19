import type { ServiceCard } from '@/lib/services/types'
import type { WeatherCardMetadata } from '@/lib/services/metadata'
import type { SearchContext } from '@/lib/intent/types'
import { withCache } from '@/lib/cache/serviceCache'
import { RedisKeys } from '@/lib/cache/redis'
import { NonBookableAdapter } from '@/lib/services/base/adapter'
import { CACHE_TTL } from '@/lib/config/constants'
import { addDays, format } from 'date-fns'

// Approximate climate profiles by region keyword for realistic mock data
const CLIMATE: Record<string, { minTemp: number; maxTemp: number; conditions: string[] }> = {
  bangalore: { minTemp: 18, maxTemp: 28, conditions: ['partly cloudy', 'light rain', 'clear sky', 'overcast clouds', 'moderate rain'] },
  bengaluru: { minTemp: 18, maxTemp: 28, conditions: ['partly cloudy', 'light rain', 'clear sky', 'overcast clouds', 'moderate rain'] },
  mumbai:    { minTemp: 25, maxTemp: 33, conditions: ['humid', 'light rain', 'clear sky', 'broken clouds', 'thunderstorm'] },
  delhi:     { minTemp: 15, maxTemp: 35, conditions: ['haze', 'clear sky', 'few clouds', 'foggy', 'sunny'] },
  london:    { minTemp: 8,  maxTemp: 18, conditions: ['overcast clouds', 'light rain', 'drizzle', 'broken clouds', 'clear sky'] },
  paris:     { minTemp: 10, maxTemp: 22, conditions: ['clear sky', 'few clouds', 'light rain', 'overcast clouds', 'sunny'] },
  tokyo:     { minTemp: 12, maxTemp: 24, conditions: ['clear sky', 'few clouds', 'light rain', 'scattered clouds', 'sunny'] },
  dubai:     { minTemp: 28, maxTemp: 40, conditions: ['clear sky', 'sunny', 'hazy', 'few clouds', 'clear sky'] },
  bali:      { minTemp: 24, maxTemp: 32, conditions: ['tropical showers', 'clear sky', 'partly cloudy', 'light rain', 'sunny'] },
  new_york:  { minTemp: 5,  maxTemp: 25, conditions: ['clear sky', 'few clouds', 'light rain', 'overcast', 'sunny'] },
  sydney:    { minTemp: 15, maxTemp: 28, conditions: ['clear sky', 'partly cloudy', 'light rain', 'sunny', 'few clouds'] },
}

const DEFAULT_CLIMATE = { minTemp: 15, maxTemp: 25, conditions: ['clear sky', 'few clouds', 'partly cloudy', 'light rain', 'sunny'] }

function getMockWeatherCard(destination: string, startDate: string): ServiceCard {
  const key = Object.keys(CLIMATE).find(k => destination.toLowerCase().includes(k)) ?? ''
  const climate = key ? CLIMATE[key] : DEFAULT_CLIMATE

  const days = Array.from({ length: 5 }, (_, i) => {
    const date = format(addDays(new Date(startDate), i), 'yyyy-MM-dd HH:mm:ss')
    const temp = +(climate.minTemp + Math.random() * (climate.maxTemp - climate.minTemp)).toFixed(1)
    const condition = climate.conditions[i % climate.conditions.length]
    return { date, temp, description: condition, icon: '' }
  })

  const meta: WeatherCardMetadata = { days }
  return {
    id: `weather-${destination}`,
    serviceType: 'weather',
    vendorId: destination,
    vendorType: 'openweathermap',
    displayName: `${destination} Forecast`,
    description: days.map(d => `${new Date(d.date).toLocaleDateString('en', { weekday: 'short' })}: ${Math.round(d.temp)}°C ${d.description}`).join(' · '),
    metadata: meta satisfies WeatherCardMetadata,
    bookingPayload: null,
    isBookable: false,
    ctaLabel: '',
  }
}

export class WeatherAdapter extends NonBookableAdapter {
  readonly id = 'openweathermap_weather'
  readonly type = 'weather' as const
  readonly displayName = 'Weather'
  readonly iconName = 'Cloud'
  readonly cacheTTL = CACHE_TTL.WEATHER

  isEnabled(): boolean { return true }

  async search(ctx: SearchContext) {
    const { destination, dates } = ctx.intent
    const cacheKey = RedisKeys.cacheWeather(destination, dates.start)
    const cards = await withCache<ServiceCard[]>(cacheKey, this.cacheTTL, async () => {
      if (!process.env.OPENWEATHERMAP_API_KEY) return [getMockWeatherCard(destination, dates.start)]
      try {
        const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(destination)}&limit=1&appid=${process.env.OPENWEATHERMAP_API_KEY}`)
        const [geo] = await geoRes.json()
        if (!geo) return [getMockWeatherCard(destination, dates.start)]
        const fcRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${geo.lat}&lon=${geo.lon}&units=metric&cnt=5&appid=${process.env.OPENWEATHERMAP_API_KEY}`)
        const fc = await fcRes.json()
        return [owmToCard(destination, fc)]
      } catch { return [getMockWeatherCard(destination, dates.start)] }
    })
    return this.successResult(cards)
  }
}

function owmToCard(destination: string, fc: { list?: Array<{ dt: number; dt_txt: string; main: { temp: number }; weather: Array<{ description: string; icon: string }> }> }): ServiceCard {
  const days = fc.list?.slice(0, 5) ?? []
  const meta: WeatherCardMetadata = {
    days: days.map(d => ({
      date: d.dt_txt,
      temp: d.main.temp,
      description: d.weather[0].description,
      icon: d.weather[0].icon,
    })),
  }
  return {
    id: `weather-${destination}`,
    serviceType: 'weather',
    vendorId: destination,
    vendorType: 'openweathermap',
    displayName: `${destination} Forecast`,
    description: days.map(d => `${new Date(d.dt * 1000).toLocaleDateString('en', { weekday: 'short' })}: ${Math.round(d.main.temp)}°C ${d.weather[0].description}`).join(' · '),
    metadata: meta satisfies WeatherCardMetadata,
    bookingPayload: null,
    isBookable: false,
    ctaLabel: '',
  }
}
