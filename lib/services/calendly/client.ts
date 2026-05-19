const CALENDLY_API_BASE = 'https://api.calendly.com'
const CALENDLY_AUTH_BASE = 'https://auth.calendly.com'

export interface CalendlyUser {
  uri: string
  name: string
  email: string
  scheduling_url: string
}

export interface CalendlyEventType {
  uri: string
  name: string
  description_plain: string
  duration: number
  scheduling_url: string
  active: boolean
  profile: { name: string; owner: string }
  custom_questions?: { name: string; type: string }[]
}

export interface CalendlySchedulingLink {
  booking_url: string
  owner: string
  owner_type: string
}

export class CalendlyClient {
  constructor(private accessToken: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${CALENDLY_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Calendly API ${res.status}: ${body}`)
    }
    return res.json() as Promise<T>
  }

  async getCurrentUser(): Promise<CalendlyUser> {
    const data = await this.request<{ resource: CalendlyUser }>('/users/me')
    return data.resource
  }

  async getEventTypes(userUri: string): Promise<CalendlyEventType[]> {
    const params = new URLSearchParams({
      user: userUri,
      active: 'true',
      count: '50',
    })
    const data = await this.request<{ collection: CalendlyEventType[] }>(`/event_types?${params}`)
    return data.collection
  }

  async createSchedulingLink(eventTypeUri: string): Promise<CalendlySchedulingLink> {
    const data = await this.request<{ resource: CalendlySchedulingLink }>('/scheduling_links', {
      method: 'POST',
      body: JSON.stringify({
        max_event_count: 1,
        owner: eventTypeUri,
        owner_type: 'EventType',
      }),
    })
    return data.resource
  }

  static async exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
    const res = await fetch(`${CALENDLY_AUTH_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.CALENDLY_CLIENT_ID!,
        client_secret: process.env.CALENDLY_CLIENT_SECRET!,
        redirect_uri: process.env.CALENDLY_REDIRECT_URI!,
        code,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Calendly token exchange failed: ${body}`)
    }
    return res.json() as Promise<{ access_token: string; refresh_token: string }>
  }

  static getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: process.env.CALENDLY_REDIRECT_URI!,
      state,
    })
    return `${CALENDLY_AUTH_BASE}/oauth/authorize?${params}`
  }
}
