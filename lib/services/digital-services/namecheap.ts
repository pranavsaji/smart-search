// Namecheap XML API client — domain availability checking.
// Docs: https://www.namecheap.com/support/api/methods/domains/check/
//
// Required env vars: NAMECHEAP_USERNAME, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP
// Sandbox vs production is derived from NODE_ENV.

const SANDBOX_URL = 'https://api.sandbox.namecheap.com/xml.response'
const PROD_URL = 'https://api.namecheap.com/xml.response'

export interface DomainAvailability {
  domain: string
  available: boolean
  isPremium: boolean
  errorCondition?: string
}

function apiUrl(): string {
  return process.env.NODE_ENV === 'production' ? PROD_URL : SANDBOX_URL
}

export async function checkDomains(domains: string[]): Promise<DomainAvailability[]> {
  const params = new URLSearchParams({
    ApiUser: process.env.NAMECHEAP_USERNAME!,
    ApiKey: process.env.NAMECHEAP_API_KEY!,
    UserName: process.env.NAMECHEAP_USERNAME!,
    Command: 'namecheap.domains.check',
    ClientIp: process.env.NAMECHEAP_CLIENT_IP!,
    DomainList: domains.join(','),
  })

  const res = await fetch(`${apiUrl()}?${params}`)
  if (!res.ok) throw new Error(`Namecheap API ${res.status}`)

  const xml = await res.text()
  return parseDomainCheckXml(xml, domains)
}

// Namecheap returns XML — parse with regex (no DOM parser in Edge/Node).
function parseDomainCheckXml(xml: string, domains: string[]): DomainAvailability[] {
  return domains.map((domain) => {
    // e.g. <DomainCheckResult Domain="example.com" Available="true" IsPremiumName="false" ...>
    const escaped = domain.replace(/\./g, '\\.')
    const pattern = new RegExp(
      `Domain="${escaped}"[^>]*Available="(true|false)"[^>]*IsPremiumName="(true|false)"`,
      'i'
    )
    const match = pattern.exec(xml)
    if (!match) return { domain, available: false, isPremium: false }
    return {
      domain,
      available: match[1].toLowerCase() === 'true',
      isPremium: match[2].toLowerCase() === 'true',
    }
  })
}

// Build the Namecheap registration deep-link for a domain name.
export function namecheapRegistrationUrl(domain: string): string {
  const encoded = encodeURIComponent(domain)
  return `https://www.namecheap.com/domains/registration/results/?domain=${encoded}`
}
